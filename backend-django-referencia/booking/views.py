"""Views da API (Django REST Framework).

Seções: autenticação, uso do cliente (empresas, profissionais, disponibilidade,
agendamentos) e painel de administração (escopo de empresa via cabeçalho X-Company).
"""
from datetime import date, timedelta
from django.contrib.auth import authenticate, get_user_model
from django.db.models import ProtectedError, Q
from django.utils import timezone
from rest_framework import exceptions, mixins, serializers, status, viewsets
from rest_framework.decorators import (action, api_view, authentication_classes,
                                       permission_classes)
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from . import audit, throttle
from .tokens import start_session
from .clients import flagged_customer_ids
from .emails import send_admin_notice, send_cancellation
from .models import (Appointment, AuditLog, Company, CompanyMember, FavoriteCompany, Professional, Review,
                     ProfessionalService, Service, TimeOff)
from .serializers import (AdminBookingSerializer, AdminProfessionalSerializer,
                          AdminServiceSerializer, AppointmentSerializer, CompanySerializer,
                          CustomerSerializer, ProfessionalSerializer, RegisterSerializer,
                          TimeOffSerializer, UserSerializer)
from .search import SEARCH_LIMIT, search_companies
from .slots import available_slots
from .tenancy import CompanyScopedMixin, resolve_company

User = get_user_model()


# ---------- Autenticação ----------
def _auth_payload(request, user):
    """Resposta padrão de login/cadastro: token de uma NOVA sessão (um por dispositivo) e dados do usuário."""
    return {"token": start_session(request, user), "user": UserSerializer(user).data}


# Sem autenticação: um token antigo no cabeçalho não pode bloquear login/cadastro.
@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def register(request):
    """Cria uma conta e já devolve o token."""
    s = RegisterSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    user = s.save()
    audit.record(request, "auth.register", actor=user, target=user, label=f"{user.first_name} <{user.email}>")
    return Response(_auth_payload(request, user), status=status.HTTP_201_CREATED)


@api_view(["POST"])
@authentication_classes([])
@permission_classes([AllowAny])
def login(request):
    """Autentica por usuário ou e-mail e senha e devolve o token.

    O campo `email` do corpo aceita também o nome de usuário (ex.: o superusuário criado com
    `createsuperuser`, que normalmente não tem e-mail igual ao username).
    """
    ident = str(request.data.get("email", "")).strip()
    password = request.data.get("password", "")
    # Pode haver mais de uma conta com o mesmo e-mail (o Django não exige e-mail único): tenta cada uma.
    candidates = list(User.objects.filter(Q(username__iexact=ident) | Q(email__iexact=ident))[:5]) if ident else []
    ip = request.META.get("REMOTE_ADDR")
    wait = throttle.retry_after(ident, ip, [c.id for c in candidates])
    if wait:  # bloqueado: nem a senha certa é aceita; registra o bloqueio uma vez por janela
        if not AuditLog.objects.filter(action="auth.login_blocked", ip=ip, created_at__gte=timezone.now() - throttle.WINDOW,
                                       details__identificador=throttle.normalize(ident)).exists():
            audit.record(request, "auth.login_blocked", identificador=throttle.normalize(ident) or "(vazio)", segundos=wait)
        minutes = max(1, round(wait / 60))
        return Response({"detail": f"Muitas tentativas. Tente de novo em {minutes} minuto(s)."}, status=429,
                        headers={"Retry-After": str(wait)})
    for candidate in candidates:
        user = authenticate(username=candidate.username, password=password)
        if user:
            audit.record(request, "auth.login", actor=user)
            return Response(_auth_payload(request, user))
    audit.record(request, "auth.login_failed", identificador=throttle.normalize(ident) or "(vazio)")
    return Response({"detail": "Usuário/e-mail ou senha incorretos."}, status=400)


@api_view(["POST"])
def logout(request):
    """Encerra a sessão deste dispositivo (o token deixa de valer)."""
    audit.record(request, "auth.logout")
    request.auth.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
def logout_all(request):
    """Encerra TODAS as sessões do usuário (todos os dispositivos), inclusive esta."""
    audit.record(request, "auth.logout_all", sessoes=request.user.auth_sessions.count())
    request.user.auth_sessions.all().delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["GET"])
def me(request):
    """Dados do usuário logado, com as empresas que ele administra."""
    return Response(UserSerializer(request.user).data)


# ---------- Uso do cliente ----------
class CompanyViewSet(viewsets.GenericViewSet):
    """Busca de empresas para o cliente.

    Não há listagem geral (o cliente precisa buscar) nem cadastro aqui: as empresas são
    cadastradas pelo dono do software no painel da plataforma (`/platform/companies/`).
    """

    serializer_class = CompanySerializer
    queryset = Company.objects.filter(active=True)

    @action(detail=False, methods=["get"])
    def search(self, request):
        """Busca empresas ativas por `q` (nome, profissional, serviço, categoria, cidade, endereço).

        Com `slug` devolve só a empresa desse link (usado pelo link de agendamento). Sem `q` de pelo
        menos 2 letras, devolve lista vazia; no máximo `SEARCH_LIMIT` resultados.
        """
        slug = request.query_params.get("slug", "").strip()
        if slug:
            qs = Company.objects.filter(active=True, slug=slug)
        else:
            qs = search_companies(request.query_params.get("q", ""))
        return Response(CompanySerializer(qs[:SEARCH_LIMIT], many=True).data)


class FavoriteViewSet(viewsets.ViewSet):
    """Empresas preferidas do cliente: listar, adicionar (sem duplicar) e remover."""

    def list(self, request):
        """Empresas favoritas ativas do usuário, em ordem alfabética."""
        companies = Company.objects.filter(active=True, favorited_by__user=request.user).order_by("name")
        return Response(CompanySerializer(companies, many=True).data)

    def create(self, request):
        """Adiciona uma empresa ativa às favoritas; repetir a chamada não duplica."""
        raw = str(request.data.get("company", ""))
        company = Company.objects.filter(active=True, pk=int(raw)).first() if raw.isdigit() else None
        if company is None:
            raise exceptions.NotFound("Empresa não encontrada.")
        _, created = FavoriteCompany.objects.get_or_create(user=request.user, company=company)
        if created:
            audit.record(request, "favorite.add", company=company, target=company)
        return Response(CompanySerializer(company).data, status=status.HTTP_201_CREATED)

    def destroy(self, request, pk=None):
        """Remove a empresa (id em `pk`) das favoritas; sem erro se ela já não estava."""
        if str(pk).isdigit():
            removed, _ = FavoriteCompany.objects.filter(user=request.user, company_id=int(pk)).delete()
            company = Company.objects.filter(pk=int(pk)).first()
            if removed and company:
                audit.record(request, "favorite.remove", company=company, target=company)
        return Response(status=status.HTTP_204_NO_CONTENT)


class ProfessionalViewSet(viewsets.ReadOnlyModelViewSet):
    """Profissionais ativos de UMA empresa, com seus serviços (somente leitura)."""

    serializer_class = ProfessionalSerializer

    def get_queryset(self):
        """Exige o parâmetro `company` e devolve só profissionais ativos de empresas ativas."""
        raw = self.request.query_params.get("company", "")
        if not raw.isdigit():
            raise exceptions.ParseError("Informe a empresa (parâmetro company).")
        return (Professional.objects
                .filter(company_id=int(raw), company__active=True, active=True)
                .order_by("name").prefetch_related("offers__service"))


def _refuse_if_finished(appt):
    """Atendimento concluído ou com falta registrada não pode ser cancelado (reabra antes, se foi engano)."""
    if appt.status in (Appointment.Status.COMPLETED, Appointment.Status.NO_SHOW):
        raise serializers.ValidationError({"detail": "Este atendimento já foi finalizado e não pode ser cancelado."})


class AppointmentViewSet(mixins.CreateModelMixin, mixins.ListModelMixin,
                         mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Agendamentos do usuário logado (em qualquer empresa): listar, criar, consultar e cancelar."""

    serializer_class = AppointmentSerializer

    def perform_create(self, serializer):
        """Cria o agendamento do próprio usuário e registra no log de auditoria."""
        appt = serializer.save()
        audit.record(self.request, "appointment.create", company=appt.company, target=appt, origem="cliente")

    def get_queryset(self):
        """Cada usuário vê só os próprios agendamentos."""
        return (Appointment.objects.filter(customer=self.request.user)
                .select_related("professional__company", "service", "customer"))

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancela o agendamento e avisa o cliente por e-mail (idempotente)."""
        appt = self.get_object()
        _refuse_if_finished(appt)
        if appt.status != Appointment.Status.CANCELED:
            hours = appt.company.cancel_notice_hours
            if hours and appt.start - timezone.now() < timedelta(hours=hours):
                raise serializers.ValidationError({"detail": f"Cancelamentos só são aceitos com {hours}h de antecedência. "
                                                             "Entre em contato com a empresa."})
            appt.status = Appointment.Status.CANCELED
            appt.save(update_fields=["status"])
            send_cancellation(appt)
            send_admin_notice(appt, "canceled", actor=request.user)
            audit.record(request, "appointment.cancel", company=appt.company, target=appt, quem="cliente")
        return Response(self.get_serializer(appt).data)


    @action(detail=True, methods=["post"])
    def review(self, request, pk=None):
        """Avalia o atendimento (nota 1 a 5 e comentário opcional). Só o próprio cliente, só se concluído; pode corrigir depois."""
        appt = self.get_object()
        if appt.status != Appointment.Status.COMPLETED:
            raise serializers.ValidationError({"detail": "Só é possível avaliar atendimentos concluídos."})
        rating = request.data.get("rating")
        if not str(rating).isdigit() or not 1 <= int(rating) <= 5:
            raise serializers.ValidationError({"rating": "A nota deve ser de 1 a 5."})
        comment = str(request.data.get("comment", "")).strip()
        if len(comment) > 500:
            raise serializers.ValidationError({"comment": "O comentário deve ter no máximo 500 caracteres."})
        _, created = Review.objects.update_or_create(appointment=appt, defaults={"rating": int(rating), "comment": comment})
        audit.record(request, "review.save", company=appt.company, target=appt, nota=int(rating), origem="nova" if created else "alterada")
        return Response(self.get_serializer(self.get_queryset().get(pk=appt.pk)).data)


@api_view(["GET"])
def availability(request):
    """Horários livres de um profissional para um serviço em uma data.

    Parâmetros: professional, service e date (AAAA-MM-DD).
    """
    try:
        offer = ProfessionalService.objects.select_related("professional").get(
            professional_id=request.query_params["professional"],
            service_id=request.query_params["service"],
            professional__active=True, professional__company__active=True)
        day = date.fromisoformat(request.query_params["date"])
    except (KeyError, ValueError, ProfessionalService.DoesNotExist):
        return Response({"detail": "Informe professional, service e date (AAAA-MM-DD)."}, status=400)
    slots = available_slots(offer.professional, offer, day)
    company = offer.professional.company
    # Antecedência mínima vale para clientes; a equipe da empresa pode pedir `staff=1` para ver todos os horários.
    is_staff = (request.query_params.get("staff") == "1"
                and CompanyMember.objects.filter(company=company, user=request.user).exists())
    if company.min_notice_hours and not is_staff:
        limit = timezone.now() + timedelta(hours=company.min_notice_hours)
        slots = [s for s in slots if s >= limit]
    return Response({"slots": [s.isoformat() for s in slots]})


# ---------- Painel de administração (somente membros da empresa) ----------
class SafeDestroyMixin:
    """Troca o erro 500 por uma mensagem clara quando o registro tem agendamentos vinculados."""

    def destroy(self, request, *a, **k):
        """Exclui o registro; se estiver protegido por agendamentos, responde 400 sugerindo desativar."""
        try:
            return super().destroy(request, *a, **k)
        except ProtectedError:
            return Response({"detail": "Há agendamentos vinculados. Desative em vez de excluir."}, status=400)


class CompanyOwnedViewSet(CompanyScopedMixin, SafeDestroyMixin, viewsets.ModelViewSet):
    """CRUD de um recurso que pertence a uma empresa.

    As subclasses definem `queryset` e `serializer_class`; aqui garantimos que só
    os registros da empresa ativa são visíveis e que novos registros nascem nela.
    """

    def get_queryset(self):
        """Restringe à empresa do cabeçalho X-Company."""
        return super().get_queryset().filter(company=self.company)

    audit_prefix = ""  # prefixo da ação no log (ex.: "service" -> service.create / .update / .delete)

    def perform_create(self, serializer):
        """Grava o novo registro na empresa ativa e registra no log de auditoria."""
        obj = serializer.save(company=self.company)
        audit.record(self.request, f"{self.audit_prefix}.create", company=self.company, target=obj)

    def perform_update(self, serializer):
        """Grava a alteração e registra no log quais campos mudaram (antes → depois)."""
        before = audit.snapshot(serializer.instance, serializer.validated_data)
        obj = serializer.save()
        audit.record(self.request, f"{self.audit_prefix}.update", company=self.company, target=obj,
                     **audit.diff(before, obj, serializer.validated_data))

    def perform_destroy(self, instance):
        """Exclui o registro e registra no log (com o nome, que não existirá mais depois)."""
        label, pk = str(instance), instance.pk  # o Django zera o pk ao excluir
        instance.delete()
        audit.record(self.request, f"{self.audit_prefix}.delete", company=self.company,
                     target=instance, label=label, target_id=pk)


class AdminServiceViewSet(CompanyOwnedViewSet):
    """CRUD do catálogo de serviços da empresa."""

    audit_prefix = "service"
    queryset = Service.objects.order_by("name")
    serializer_class = AdminServiceSerializer


class AdminProfessionalViewSet(CompanyOwnedViewSet):
    """CRUD de profissionais da empresa com serviços, expediente e pausas aninhados."""

    audit_prefix = "professional"
    queryset = Professional.objects.order_by("name").prefetch_related("offers", "working_hours", "breaks")
    serializer_class = AdminProfessionalSerializer


class AdminTimeOffViewSet(CompanyOwnedViewSet):
    """CRUD de bloqueios de datas da empresa: feriados e folgas."""

    audit_prefix = "timeoff"
    queryset = TimeOff.objects.select_related("professional")
    serializer_class = TimeOffSerializer


def _date_param(p, key):
    """Lê um parâmetro de data AAAA-MM-DD da query string (None se ausente; 400 se inválido)."""
    if not p.get(key):
        return None
    try:
        return date.fromisoformat(p[key])
    except ValueError:
        raise serializers.ValidationError({key: "Data inválida (use AAAA-MM-DD)."})


class AdminAppointmentViewSet(CompanyScopedMixin, mixins.ListModelMixin, mixins.CreateModelMixin,
                              viewsets.GenericViewSet):
    """Agenda da empresa: lista com filtros, cria em nome de um cliente e cancela."""

    serializer_class = AppointmentSerializer

    def get_serializer_context(self):
        """Na lista da agenda, informa quais clientes faltam com frequência (uma consulta por requisição)."""
        ctx = super().get_serializer_context()
        if self.action == "list":
            ctx["flagged"] = flagged_customer_ids(self.company)
        return ctx

    def perform_create(self, serializer):
        """Cria o agendamento em nome de um cliente e registra no log de auditoria."""
        appt = serializer.save()
        audit.record(self.request, "appointment.create", company=appt.company, target=appt, origem="equipe")

    def get_serializer_class(self):
        """Usa o serializer de reserva da equipe na criação e o padrão nas demais ações."""
        return AdminBookingSerializer if self.action == "create" else AppointmentSerializer

    def get_queryset(self):
        """Agendamentos da empresa, com os filtros opcionais: professional, status, from e to."""
        p = self.request.query_params
        qs = Appointment.objects.filter(professional__company=self.company).select_related(
            "professional__company", "service", "customer")
        if p.get("professional"):
            qs = qs.filter(professional_id=p["professional"])
        if p.get("status") == "pending":  # confirmados cujo horário já passou: aguardam "concluído"/"faltou"
            qs = qs.filter(status=Appointment.Status.CONFIRMED, start__lt=timezone.now())
        elif p.get("status"):
            qs = qs.filter(status=p["status"])
        if d := _date_param(p, "from"):
            qs = qs.filter(start__date__gte=d)
        if d := _date_param(p, "to"):
            qs = qs.filter(start__date__lte=d)
        return qs

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        """Cancela qualquer agendamento da empresa e avisa o cliente por e-mail."""
        appt = self.get_object()
        _refuse_if_finished(appt)
        if appt.status != Appointment.Status.CANCELED:
            appt.status = Appointment.Status.CANCELED
            appt.save(update_fields=["status"])
            send_cancellation(appt)
            send_admin_notice(appt, "canceled", actor=request.user)
            audit.record(request, "appointment.cancel", company=self.company, target=appt, quem="equipe")
        return Response(self.get_serializer(appt).data)

    def _finish(self, new_status, action_code):
        """Muda a situação de um atendimento já iniciado (concluído / não compareceu / voltar a confirmado)."""
        appt = self.get_object()
        if appt.status == Appointment.Status.CANCELED:
            raise serializers.ValidationError({"detail": "Agendamento cancelado não pode ser alterado."})
        if new_status != Appointment.Status.CONFIRMED and appt.start > timezone.now():
            raise serializers.ValidationError({"detail": "O atendimento ainda não começou."})
        old = appt.status
        appt.status = new_status
        appt.save(update_fields=["status"])
        audit.record(self.request, action_code, company=self.company, target=appt, de=old, para=new_status)
        return Response(self.get_serializer(appt).data)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        """Marca o atendimento como concluído (só depois do horário de início)."""
        return self._finish(Appointment.Status.COMPLETED, "appointment.complete")

    @action(detail=True, methods=["post"], url_path="no-show")
    def no_show(self, request, pk=None):
        """Marca que o cliente não compareceu (só depois do horário de início)."""
        return self._finish(Appointment.Status.NO_SHOW, "appointment.no_show")

    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        """Desfaz concluído/não compareceu, voltando o agendamento para confirmado (correção de engano)."""
        return self._finish(Appointment.Status.CONFIRMED, "appointment.reopen")


@api_view(["GET"])
def customers(request):
    """Busca clientes DA EMPRESA (quem já agendou nela) por nome ou e-mail; devolve até 10."""
    company = resolve_company(request)
    q = request.query_params.get("q", "").strip()
    qs = (User.objects.filter(appointments__professional__company=company)
          .distinct().order_by("first_name", "email"))
    if q:
        qs = qs.filter(Q(email__icontains=q) | Q(first_name__icontains=q))
    return Response(CustomerSerializer(qs[:10], many=True).data)
