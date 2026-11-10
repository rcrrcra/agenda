"""Histórico de clientes de UMA empresa (painel do administrador de estabelecimento).

Mostra, por cliente, os atendimentos feitos NA empresa, as faltas e as observações internas, e sinaliza
quem falta com frequência. Nada daqui atravessa empresas: o histórico de um cliente em outra empresa não aparece.

Regra do alerta ("falta muito"): pelo menos `FLAG_MIN_NO_SHOWS` faltas E faltas ≥ `FLAG_MIN_RATE` % dos
atendimentos finalizados (concluídos + faltas). É um aviso para a equipe, não bloqueia o cliente de agendar.
"""
from django.contrib.auth import get_user_model
from django.db.models import Count, Max, Q, Sum
from rest_framework import serializers
from rest_framework.decorators import api_view
from rest_framework.response import Response

from . import audit
from .models import Appointment, CustomerNote
from .tenancy import resolve_company

User = get_user_model()
S = Appointment.Status
FLAG_MIN_NO_SHOWS = 2
FLAG_MIN_RATE = 30      # % de faltas entre os atendimentos finalizados
LIST_LIMIT = 100


def is_flagged(completed, no_show):
    """True se o cliente falta com frequência pela regra do módulo."""
    finished = completed + no_show
    return no_show >= FLAG_MIN_NO_SHOWS and finished > 0 and no_show * 100 >= FLAG_MIN_RATE * finished


def _stats(company, customer_ids=None):
    """Totais por cliente (`{id: {...}}`) dos atendimentos dentro da empresa."""
    qs = Appointment.objects.filter(professional__company=company)
    if customer_ids is not None:
        qs = qs.filter(customer_id__in=customer_ids)
    rows = qs.values("customer_id").annotate(
        total=Count("id"), completed=Count("id", filter=Q(status=S.COMPLETED)),
        no_show=Count("id", filter=Q(status=S.NO_SHOW)), canceled=Count("id", filter=Q(status=S.CANCELED)),
        confirmed=Count("id", filter=Q(status=S.CONFIRMED)),
        last_visit=Max("start", filter=Q(status=S.COMPLETED)), spent=Sum("price", filter=Q(status=S.COMPLETED)))
    out = {}
    for r in rows:
        r["flagged"] = is_flagged(r["completed"], r["no_show"])
        r["spent"] = float(r["spent"] or 0)
        r["no_show_rate"] = round(r["no_show"] * 100 / (r["completed"] + r["no_show"]), 1) if r["completed"] + r["no_show"] else None
        out[r.pop("customer_id")] = r
    return out


def flagged_customer_ids(company):
    """Ids dos clientes da empresa que faltam com frequência (usado para marcar a agenda)."""
    return {cid for cid, st in _stats(company).items() if st["flagged"]}


def _client_row(user, stats):
    """Cliente + totais, no formato da lista e do detalhe."""
    return {"id": user.id, "name": user.first_name or user.email, "email": user.email, **stats}


@api_view(["GET"])
def clients(request):
    """Lista os clientes da empresa com totais e alerta. `q` (nome/e-mail), `flagged=1` (só quem falta muito)."""
    company = resolve_company(request)
    q = request.query_params.get("q", "").strip()
    users = User.objects.filter(appointments__professional__company=company).distinct()
    if q:
        users = users.filter(Q(first_name__icontains=q) | Q(email__icontains=q))
    users = list(users[:1000])
    stats = _stats(company, [u.id for u in users])
    rows = [_client_row(u, stats[u.id]) for u in users if u.id in stats]
    if request.query_params.get("flagged") == "1":
        rows = [r for r in rows if r["flagged"]]
    # quem falta mais primeiro; depois o atendimento mais recente
    rows.sort(key=lambda r: (-r["no_show"], r["last_visit"] is None, -(r["last_visit"].timestamp() if r["last_visit"] else 0)))
    return Response(rows[:LIST_LIMIT])


@api_view(["GET", "PUT"])
def client_detail(request, pk):
    """Histórico de um cliente na empresa (atendimentos, totais, alerta) e suas observações internas (PUT `notes`)."""
    company = resolve_company(request)
    user = User.objects.filter(pk=pk, appointments__professional__company=company).distinct().first()
    if user is None:
        return Response({"detail": "Cliente não encontrado nesta empresa."}, status=404)
    if request.method == "PUT":
        notes = request.data.get("notes", "")
        if not isinstance(notes, str) or len(notes) > 2000:
            raise serializers.ValidationError({"notes": "Texto inválido ou maior que 2000 caracteres."})
        CustomerNote.objects.update_or_create(company=company, customer=user, defaults={"notes": notes.strip()})
        # grava só o tamanho do texto: as observações internas podem ser sensíveis
        audit.record(request, "client.notes_update", company=company, target=user,
                     label=f"{user.first_name or user.email} <{user.email}>", caracteres=len(notes.strip()))
    note = CustomerNote.objects.filter(company=company, customer=user).first()
    history = (Appointment.objects.filter(professional__company=company, customer=user)
               .select_related("professional", "service").order_by("-start"))
    return Response({
        **_client_row(user, _stats(company, [user.id]).get(user.id, {})),
        "notes": note.notes if note else "",
        "appointments": [{"id": a.id, "start": a.start.isoformat(), "service": a.service.name,
                          "professional": a.professional.name, "status": a.status, "status_label": a.get_status_display(),
                          "price": float(a.price) if a.price is not None else None, "notes": a.notes} for a in history],
    })
