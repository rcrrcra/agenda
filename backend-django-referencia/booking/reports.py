"""Relatórios de atendimentos: resumo para o dashboard, tabela paginada e exportação em planilha (CSV).

Quem acessa: o admin geral (todas as empresas) e administradores de estabelecimento (só as empresas que
administram). Clientes recebem 403. Todos os endpoints aceitam os mesmos filtros pela query string:

- `from`, `to`  período (AAAA-MM-DD) pela data de início do atendimento; padrão: últimos 30 dias;
- `company`     ids de empresas separados por vírgula (precisam estar no escopo do usuário);
- `professional`, `service`  ids (um ou vários, separados por vírgula);
- `status`      `confirmed`, `completed`, `no_show`, `canceled` ou `pending` (confirmado já passado).

Notas: `rating_avg`/`rating_count` vêm das avaliações dos clientes (1 a 5) nos atendimentos concluídos.

Receita = soma do preço (congelado no agendamento) dos atendimentos CONCLUÍDOS; `revenue_expected` soma os
confirmados que ainda não foram concluídos.
"""
import csv
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Avg, Count, DecimalField, Q, Sum, Value
from django.db.models.functions import Coalesce, ExtractWeekDay, TruncDate, TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import exceptions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from . import audit
from .xlsx import workbook_response
from .models import Appointment, Company, CompanyMember, Professional, Service

S = Appointment.Status
DEFAULT_DAYS = 30
MAX_DAYS = 800            # evita consultas gigantes
DAILY_LIMIT_DAYS = 62     # acima disso o gráfico de evolução passa a ser mensal
EXPORT_LIMIT = 50_000
PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX = 50, 200
WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"]
ZERO = Value(Decimal("0"), output_field=DecimalField(max_digits=12, decimal_places=2))


class CanSeeReports(BasePermission):
    """Admin geral ou administrador de ao menos um estabelecimento."""

    def has_permission(self, request, view):
        """Libera superusuário ou quem tem alguma empresa (`CompanyMember`)."""
        u = request.user
        return bool(u and u.is_authenticated and (u.is_superuser or CompanyMember.objects.filter(user=u).exists()))


# ---------- escopo e filtros ----------
def _scope_company_ids(user):
    """Empresas que o usuário pode analisar: todas (admin geral) ou as que administra."""
    if user.is_superuser:
        return set(Company.objects.values_list("id", flat=True))
    return set(CompanyMember.objects.filter(user=user).values_list("company_id", flat=True))


def _ids(params, key):
    """Lê uma lista de ids (`1,2,3`) da query string; levanta 400 se algo não for número."""
    raw = params.get(key, "").strip()
    if not raw:
        return []
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not all(p.isdigit() for p in parts):
        raise exceptions.ValidationError({key: "Use ids numéricos separados por vírgula."})
    return [int(p) for p in parts]


def _day(params, key, default):
    """Lê uma data AAAA-MM-DD da query string (ou o padrão); levanta 400 se inválida."""
    raw = params.get(key, "").strip()
    if not raw:
        return default
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise exceptions.ValidationError({key: "Data inválida (use AAAA-MM-DD)."})


def filtered_queryset(request, override=None):
    """Agendamentos do escopo do usuário já filtrados pelos parâmetros; devolve `(queryset, filtros_usados)`.

    `override=(início, fim)` troca o período (usado na comparação com o período anterior); os demais filtros valem.
    `filtros_usados` inclui `company_ids`, as empresas efetivamente consideradas.
    """
    p, scope = request.query_params, _scope_company_ids(request.user)
    today = timezone.localdate()
    if override:
        start, end = override
    else:
        end = _day(p, "to", today)
        start = _day(p, "from", end - timedelta(days=DEFAULT_DAYS - 1))
        if start > end:
            raise exceptions.ValidationError({"from": "A data inicial é maior que a final."})
        if (end - start).days > MAX_DAYS:
            raise exceptions.ValidationError({"from": f"Período máximo: {MAX_DAYS} dias."})

    companies = _ids(p, "company")
    if companies and not set(companies) <= scope:
        raise exceptions.PermissionDenied("Você não tem acesso a esta empresa.")
    qs = Appointment.objects.filter(
        professional__company_id__in=companies or scope, start__date__gte=start, start__date__lte=end
    ).select_related("professional__company", "service", "customer")
    if pros := _ids(p, "professional"):
        qs = qs.filter(professional_id__in=pros)
    if services := _ids(p, "service"):
        qs = qs.filter(service_id__in=services)
    status = p.get("status", "")
    if status == "pending":
        qs = qs.filter(status=S.CONFIRMED, start__lt=timezone.now())
    elif status:
        if status not in S.values:
            raise exceptions.ValidationError({"status": "Situação inválida."})
        qs = qs.filter(status=status)
    return qs, {"from": start, "to": end, "company_ids": companies or scope}


# ---------- agregações ----------
def _metrics():
    """Contagens por situação e receita, para usar em `.annotate()` / `.aggregate()`."""
    return {
        "total": Count("id"),
        "confirmed": Count("id", filter=Q(status=S.CONFIRMED)),
        "completed": Count("id", filter=Q(status=S.COMPLETED)),
        "no_show": Count("id", filter=Q(status=S.NO_SHOW)),
        "canceled": Count("id", filter=Q(status=S.CANCELED)),
        "revenue": Coalesce(Sum("price", filter=Q(status=S.COMPLETED)), ZERO),
        "revenue_expected": Coalesce(Sum("price", filter=Q(status=S.CONFIRMED)), ZERO),
        "rating_avg": Avg("review__rating"),
        "rating_count": Count("review"),
    }


def _clean(row):
    """Converte Decimal em float (JSON) e acrescenta as taxas calculadas."""
    row = {k: (float(v) if isinstance(v, Decimal) else v) for k, v in row.items()}
    row["rating_avg"] = round(row["rating_avg"], 1) if row.get("rating_avg") else None
    row.setdefault("rating_count", 0)
    done = row["completed"] + row["no_show"]
    row["attendance_rate"] = round(row["completed"] / done * 100, 1) if done else None   # compareceu / (compareceu + faltou)
    row["cancel_rate"] = round(row["canceled"] / row["total"] * 100, 1) if row["total"] else None
    row["avg_ticket"] = round(row["revenue"] / row["completed"], 2) if row["completed"] else None
    return row


def _labeled(rows, label_key, company_key=None):
    """Troca os nomes de campo do banco por `label` (e `company`), mantendo o resto da linha."""
    out = []
    for r in rows:
        r = dict(r)
        r["label"] = r.pop(label_key)
        if isinstance(r["label"], date):  # datetime (mês) também é `date`: guarda só AAAA-MM-DD
            r["label"] = (r["label"].date() if hasattr(r["label"], "date") else r["label"]).isoformat()
        if company_key:
            r["company"] = r.pop(company_key)
        out.append(r)
    return out


def _grouped(qs, *keys, order=("-total",), limit=None):
    """Agrupa `qs` por `keys` (nomes de campos já anotados ou do banco) e devolve as métricas de cada grupo."""
    rows = qs.values(*keys).annotate(**_metrics()).order_by(*order)
    return [_clean(r) for r in (rows[:limit] if limit else rows)]


@api_view(["GET"])
@permission_classes([CanSeeReports])
def options(request):
    """Opções dos filtros dentro do escopo do usuário: empresas, profissionais e serviços."""
    scope = _scope_company_ids(request.user)
    return Response({
        "companies": list(Company.objects.filter(id__in=scope).order_by("name").values("id", "name")),
        "professionals": list(Professional.objects.filter(company_id__in=scope).order_by("name")
                              .values("id", "name", "company")),
        "services": list(Service.objects.filter(company_id__in=scope).order_by("name").values("id", "name", "company")),
    })


def _customer_mix(qs, start, company_ids):
    """Clientes distintos que agendaram no período (sem contar cancelados), separados em novos e recorrentes.

    Novo = nenhum atendimento não cancelado antes de `start` nas empresas consideradas; recorrente = já tinha.
    """
    ids = set(qs.exclude(status=S.CANCELED).values_list("customer_id", flat=True))
    returning = set(Appointment.objects.filter(
        customer_id__in=ids, professional__company_id__in=company_ids, start__date__lt=start
    ).exclude(status=S.CANCELED).values_list("customer_id", flat=True))
    return {"total": len(ids), "new": len(ids - returning), "recurring": len(returning)}


@api_view(["GET"])
@permission_classes([CanSeeReports])
def summary(request):
    """Dados do dashboard: totais, evolução no período e rankings por profissional, serviço, empresa e dia da semana."""
    qs, period = filtered_queryset(request)
    days = (period["to"] - period["from"]).days + 1
    monthly = days > DAILY_LIMIT_DAYS
    bucket = TruncMonth("start") if monthly else TruncDate("start")   # usa o fuso America/Sao_Paulo

    by_period = _labeled(_grouped(qs.annotate(bucket=bucket), "bucket", order=("bucket",)), "bucket")
    by_weekday = {r["weekday"]: r for r in _grouped(qs.annotate(weekday=ExtractWeekDay("start")), "weekday", order=("weekday",))}
    # ExtractWeekDay: 1 = domingo ... 7 = sábado; reordena para segunda..domingo
    weekday_rows = []
    for i, name in enumerate(WEEKDAYS):
        django_day = (i + 2) if i < 6 else 1
        weekday_rows.append({**_clean({k: 0 for k in ("total", "confirmed", "completed", "no_show", "canceled",
                                                       "revenue", "revenue_expected", "rating_count")}),
                             **by_weekday.get(django_day, {}), "label": name})
    totals = _clean(qs.aggregate(**_metrics()))
    prev_end = period["from"] - timedelta(days=1)
    prev_start = prev_end - timedelta(days=days - 1)
    prev_qs, _ = filtered_queryset(request, override=(prev_start, prev_end))
    return Response({
        "period": {"from": period["from"].isoformat(), "to": period["to"].isoformat(), "days": days,
                   "granularity": "month" if monthly else "day"},
        "totals": totals,
        "previous": {"from": prev_start.isoformat(), "to": prev_end.isoformat(),
                     "totals": _clean(prev_qs.aggregate(**_metrics())), "customers": _customer_mix(prev_qs, prev_start, period["company_ids"])},
        "customers": _customer_mix(qs, period["from"], period["company_ids"]),
        "by_period": by_period,
        "by_weekday": weekday_rows,
        "by_professional": _labeled(_grouped(qs, "professional_id", "professional__name", "professional__company__name",
                                             limit=15), "professional__name", "professional__company__name"),
        "by_service": _labeled(_grouped(qs, "service_id", "service__name", "professional__company__name", limit=15),
                               "service__name", "professional__company__name"),
        "by_company": _labeled(_grouped(qs, "professional__company_id", "professional__company__name", limit=15),
                               "professional__company__name"),
    })


ORDERING = {  # parâmetro `ordering` -> campo do banco
    "start": "start", "company": "professional__company__name", "professional": "professional__name",
    "service": "service__name", "customer": "customer__first_name", "status": "status", "price": "price",
}


@api_view(["GET"])
@permission_classes([CanSeeReports])
def appointments(request):
    """Tabela (planilha) de atendimentos, paginada e ordenável (`ordering=-start`, `page`, `page_size`)."""
    qs, _ = filtered_queryset(request)
    key = request.query_params.get("ordering", "-start")
    field = ORDERING.get(key.lstrip("-"))
    if field is None:
        raise exceptions.ValidationError({"ordering": "Ordenação inválida."})
    qs = qs.order_by(("-" if key.startswith("-") else "") + field, "-start", "-id")
    size = request.query_params.get("page_size", "")
    size = min(int(size), PAGE_SIZE_MAX) if size.isdigit() and int(size) > 0 else PAGE_SIZE_DEFAULT
    page = request.query_params.get("page", "")
    page = int(page) if page.isdigit() and int(page) > 0 else 1
    count = qs.count()
    rows = qs[(page - 1) * size: page * size]
    return Response({"count": count, "page": page, "page_size": size, "results": [_row(a) for a in rows]})


def _row(a):
    """Um atendimento como linha de tabela/planilha."""
    return {
        "id": a.id, "start": a.start.isoformat(), "end": a.end.isoformat(),
        "company": a.professional.company.name, "professional": a.professional.name, "service": a.service.name,
        "customer_name": a.customer.first_name or a.customer.email, "customer_email": a.customer.email,
        "status": a.status, "status_label": a.get_status_display(),
        "price": float(a.price) if a.price is not None else None, "notes": a.notes,
    }


def _safe(text):
    """Evita injeção de fórmula em planilhas: texto iniciado por = + - @ vira texto literal."""
    text = "" if text is None else str(text)
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


@api_view(["GET"])
@permission_classes([CanSeeReports])
def export(request):
    """Baixa os atendimentos filtrados em CSV (separador `;`, UTF-8 com BOM: abre direto no Excel em português)."""
    qs, period = filtered_queryset(request)
    qs = qs.order_by("start", "id")[:EXPORT_LIMIT]
    audit.record(request, "report.export", periodo=f'{period["from"]} a {period["to"]}',
                 filtros={k: v for k, v in request.query_params.items() if v})
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="atendimentos_{period["from"]}_{period["to"]}.csv"'
    response.write("﻿")
    w = csv.writer(response, delimiter=";")
    w.writerow(["Data", "Início", "Fim", "Empresa", "Profissional", "Serviço", "Cliente", "E-mail", "Situação",
                "Preço (R$)", "Observações"])
    for a in qs:
        local = timezone.localtime(a.start)
        w.writerow([local.strftime("%d/%m/%Y"), local.strftime("%H:%M"), timezone.localtime(a.end).strftime("%H:%M"),
                    _safe(a.professional.company.name), _safe(a.professional.name), _safe(a.service.name),
                    _safe(a.customer.first_name or a.customer.email), _safe(a.customer.email),
                    a.get_status_display(), "" if a.price is None else f"{a.price:.2f}".replace(".", ","),
                    _safe(a.notes)])
    return response


STATUS_ORDER = ["total", "confirmed", "completed", "no_show", "canceled"]


@api_view(["GET"])
@permission_classes([CanSeeReports])
def export_xlsx(request):
    """Baixa o relatório em Excel: aba "Resumo" (totais, por profissional e por serviço) e aba "Atendimentos"."""
    qs, period = filtered_queryset(request)
    audit.record(request, "report.export", periodo=f'{period["from"]} a {period["to"]}', formato="xlsx",
                 filtros={k: v for k, v in request.query_params.items() if v})
    t = _clean(qs.aggregate(**_metrics()))
    mix = _customer_mix(qs, period["from"], period["company_ids"])
    fmt = lambda v: "" if v is None else v
    resumo = [["Período", f'{period["from"]:%d/%m/%Y} a {period["to"]:%d/%m/%Y}'],
              ["Atendimentos", t["total"]], ["Concluídos", t["completed"]], ["Faltas", t["no_show"]],
              ["Cancelados", t["canceled"]], ["Confirmados", t["confirmed"]],
              ["Taxa de comparecimento (%)", fmt(t["attendance_rate"])], ["Receita (R$)", t["revenue"]],
              ["Ticket médio (R$)", fmt(t["avg_ticket"])], ["Nota média", fmt(t["rating_avg"])],
              ["Avaliações", t["rating_count"]], ["Clientes novos", mix["new"]], ["Clientes recorrentes", mix["recurring"]]]
    head = ["Nome", "Empresa", "Atendimentos", "Concluídos", "Faltas", "Cancelados", "Receita (R$)", "Nota média", "Avaliações"]
    def group(rows):
        """Linhas de ranking (profissional ou serviço) no formato da aba."""
        return [[r["label"], r["company"] if "company" in r else "", r["total"], r["completed"], r["no_show"],
                 r["canceled"], r["revenue"], fmt(r["rating_avg"]), r["rating_count"]] for r in rows]
    pros = _labeled(_grouped(qs, "professional_id", "professional__name", "professional__company__name"),
                    "professional__name", "professional__company__name")
    svcs = _labeled(_grouped(qs, "service_id", "service__name", "professional__company__name"),
                    "service__name", "professional__company__name")
    rows = []
    for a in qs.order_by("start", "id")[:EXPORT_LIMIT]:
        local = timezone.localtime(a.start)
        rows.append([local.strftime("%d/%m/%Y"), local.strftime("%H:%M"), timezone.localtime(a.end).strftime("%H:%M"),
                     a.professional.company.name, a.professional.name, a.service.name,
                     a.customer.first_name or a.customer.email, a.customer.email, a.get_status_display(),
                     float(a.price) if a.price is not None else None, a.notes])
    return workbook_response(f'atendimentos_{period["from"]}_{period["to"]}.xlsx', [
        ("Resumo", ["Indicador", "Valor"], resumo),
        ("Profissionais", head, group(pros)), ("Serviços", head, group(svcs)),
        ("Atendimentos", ["Data", "Início", "Fim", "Empresa", "Profissional", "Serviço", "Cliente", "E-mail", "Situação",
                          "Preço (R$)", "Observações"], rows)])
