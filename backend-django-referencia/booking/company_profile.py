"""Perfil da empresa: configurações (painel), logo e fotos (upload) e a página pública.

- `/admin/company/` (GET/PUT): dados, avisos por e-mail, antecedências mínimas e horário de funcionamento padrão;
- `/admin/company/logo/` e `/admin/company/photos/`: envio e remoção de imagens (ver `images.py`);
- `/public/companies/<slug>/`: página pública (sem login) com logo, descrição, fotos, horários, profissionais e notas.
"""
from django.db.models import Avg, Count
from rest_framework import serializers
from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes
from rest_framework.exceptions import NotFound
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import audit
from .images import process_image
from django.db import transaction

from .models import WEEKDAYS, Company, CompanyHours, CompanyMember, CompanyPhoto, PlatformSettings, Professional, Review
from .serializers import CompanySerializer
from .tenancy import resolve_company

MAX_PHOTOS = 8
WEEKDAY_NAMES = dict(WEEKDAYS)


def _url(request, field):
    """URL absoluta de uma imagem (ou None se não houver)."""
    return request.build_absolute_uri(field.url) if field else None


def rating_summary(reviews):
    """Média (1 casa) e quantidade de avaliações de um queryset de `Review`."""
    agg = reviews.aggregate(avg=Avg("rating"), n=Count("id"))
    return {"average": round(agg["avg"], 1) if agg["avg"] else None, "count": agg["n"]}


class HoursSerializer(serializers.ModelSerializer):
    """Uma faixa do horário de funcionamento (dia da semana, abre, fecha)."""

    class Meta:
        model = CompanyHours
        fields = ["weekday", "start_time", "end_time"]


class CompanySettingsSerializer(serializers.ModelSerializer):
    """Dados e configurações da empresa vistos pelos administradores.

    `opening_hours` é substituído por inteiro a cada gravação; logo e fotos são só de leitura aqui (têm rotas próprias).
    """

    opening_hours = HoursSerializer(many=True, required=False)
    logo_url = serializers.SerializerMethodField()
    photos = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = ["id", "name", "slug", "category", "city", "description", "address", "active",
                  "notify_customers", "notify_admins", "min_notice_hours", "cancel_notice_hours",
                  "opening_hours", "logo_url", "photos"]
        read_only_fields = ["slug"]

    def get_logo_url(self, company):
        """URL do logo ou None."""
        return _url(self.context["request"], company.logo)

    def get_photos(self, company):
        """Fotos da galeria: id, URL e legenda."""
        r = self.context["request"]
        return [{"id": p.id, "url": _url(r, p.image), "caption": p.caption} for p in company.photos.all()]

    def validate_opening_hours(self, rows):
        """Cada faixa precisa abrir antes de fechar e as faixas do mesmo dia não podem se sobrepor."""
        by_day = {}
        for r in rows:
            if r["end_time"] <= r["start_time"]:
                raise serializers.ValidationError("O horário de fechar deve ser depois do de abrir.")
            by_day.setdefault(r["weekday"], []).append((r["start_time"], r["end_time"]))
        for ranges in by_day.values():
            ranges.sort()
            if any(b[0] < a[1] for a, b in zip(ranges, ranges[1:])):
                raise serializers.ValidationError("Há faixas sobrepostas no mesmo dia.")
        return rows

    def update(self, company, data):
        """Grava os campos e, se `opening_hours` veio, substitui as faixas."""
        hours = data.pop("opening_hours", None)
        company = super().update(company, data)
        if hours is not None:
            company.opening_hours.all().delete()
            CompanyHours.objects.bulk_create([CompanyHours(company=company, **h) for h in hours])
        return company


@api_view(["GET", "PUT"])
def company_settings(request):
    """Lê ou atualiza os dados e configurações da empresa administrada."""
    company = resolve_company(request)
    if request.method == "PUT":
        s = CompanySettingsSerializer(company, data=request.data, context={"request": request})
        s.is_valid(raise_exception=True)
        before = audit.snapshot(company, s.validated_data)
        s.save()
        audit.record(request, "company.update", company=company, target=company,
                     **audit.diff(before, company, s.validated_data))
        return Response(s.data)
    return Response(CompanySettingsSerializer(company, context={"request": request}).data)


@api_view(["POST", "DELETE"])
@parser_classes([MultiPartParser, FormParser])
def company_logo(request):
    """Envia (POST, campo `image`) ou remove (DELETE) o logo da empresa administrada."""
    company = resolve_company(request)
    if company.logo:
        company.logo.delete(save=False)  # apaga o arquivo antigo do disco
    if request.method == "POST":
        company.logo = process_image(request.FILES.get("image"), 512, f"{company.slug}-logo")
        audit.record(request, "company.logo_update", company=company, target=company)
    else:
        company.logo = None
        audit.record(request, "company.logo_remove", company=company, target=company)
    company.save(update_fields=["logo"])
    return Response(CompanySettingsSerializer(company, context={"request": request}).data)


@api_view(["POST"])
@parser_classes([MultiPartParser, FormParser])
def company_photo_add(request):
    """Adiciona uma foto à galeria (campo `image`, `caption` opcional); no máximo `MAX_PHOTOS`."""
    company = resolve_company(request)
    if company.photos.count() >= MAX_PHOTOS:
        raise serializers.ValidationError({"detail": f"No máximo {MAX_PHOTOS} fotos. Remova uma para enviar outra."})
    photo = CompanyPhoto(company=company, caption=str(request.data.get("caption", ""))[:120])
    photo.image = process_image(request.FILES.get("image"), 1600, f"{company.slug}-foto")
    photo.save()
    audit.record(request, "company.photo_add", company=company, target=photo)
    return Response(CompanySettingsSerializer(company, context={"request": request}).data, status=201)


@api_view(["DELETE"])
def company_photo_remove(request, pk):
    """Remove uma foto da galeria da empresa administrada."""
    company = resolve_company(request)
    photo = company.photos.filter(pk=pk).first()
    if photo is None:
        raise NotFound("Foto não encontrada.")
    photo.image.delete(save=False)
    photo.delete()
    audit.record(request, "company.photo_remove", company=company, label=f"foto {pk}")
    return Response(CompanySettingsSerializer(company, context={"request": request}).data)


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def public_company(request, slug):
    """Página pública da empresa (sem login): só dados que a empresa quer divulgar.

    Traz logo, descrição, endereço, fotos, horário de funcionamento, regras de antecedência, nota média e os
    profissionais ativos com seus serviços e nota. Comentários e dados de clientes nunca saem daqui.
    """
    company = Company.objects.filter(slug=slug, active=True).first()
    if company is None:
        raise NotFound("Empresa não encontrada.")
    pros = (Professional.objects.filter(company=company, active=True).order_by("name").prefetch_related("offers__service")
            .annotate(avg=Avg("appointments__review__rating"), n=Count("appointments__review")))
    return Response({
        "id": company.id, "name": company.name, "slug": company.slug, "category": company.category, "city": company.city,
        "address": company.address, "description": company.description, "logo_url": _url(request, company.logo),
        "photos": [{"id": p.id, "url": _url(request, p.image), "caption": p.caption} for p in company.photos.all()],
        "opening_hours": [{"weekday": h.weekday, "weekday_label": WEEKDAY_NAMES[h.weekday],
                           "start_time": h.start_time.strftime("%H:%M"), "end_time": h.end_time.strftime("%H:%M")}
                          for h in company.opening_hours.all()],
        "min_notice_hours": company.min_notice_hours, "cancel_notice_hours": company.cancel_notice_hours,
        "rating": rating_summary(Review.objects.filter(appointment__professional__company=company)),
        "professionals": [{
            "id": p.id, "name": p.name, "bio": p.bio,
            "rating": {"average": round(p.avg, 1) if p.avg else None, "count": p.n},
            "services": [{"name": o.service.name, "duration_minutes": o.duration_minutes,
                          "price": float(o.price) if o.price is not None else None} for o in p.offers.all()],
        } for p in pros],
    })


@api_view(["POST"])
def register_company(request):
    """O próprio usuário cadastra uma empresa e passa a administrá-la (ativa na hora, sem aprovação).

    Limite: `PlatformSettings.max_companies_per_user` empresas cadastradas por ele (0 = sem limite), configurável pelo
    admin geral. Empresas associadas pelo admin geral não entram na conta. Fica registrado no log de auditoria.
    """
    limit = PlatformSettings.load().max_companies_per_user
    used = Company.objects.filter(created_by=request.user).count()
    if limit and used >= limit:
        raise serializers.ValidationError(
            {"detail": f"Você já cadastrou {used} empresa(s), o máximo permitido ({limit}). Fale com o administrador da plataforma."})
    s = CompanySerializer(data=request.data)
    s.is_valid(raise_exception=True)
    with transaction.atomic():
        company = s.save(active=True, created_by=request.user)
        CompanyMember.objects.get_or_create(company=company, user=request.user)
    audit.record(request, "company.self_create", company=company, target=company, origem="próprio usuário",
                 limite=limit or "sem limite", cadastradas=used + 1)
    return Response({"id": company.id, "name": company.name, "slug": company.slug, "registered": used + 1, "limit": limit}, status=201)
