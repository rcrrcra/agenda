"""Painel do dono do software (superusuário): visão geral, empresas e usuários da plataforma.

Só o dono cadastra empresas (e escolhe quem as administra); usuários comuns não criam empresas.

Todas as rotas exigem `is_superuser`. O dono vê todas as empresas, ativa/desativa empresas e usuários
e define quem administra cada empresa. Não altera serviços, profissionais nem agendas das empresas:
isso continua sendo feito pelos administradores de cada uma.
"""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import mixins, serializers, viewsets
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from . import audit
from .serializers import CompanySerializer
from .models import Appointment, AuditLog, Company, CompanyMember, PlatformSettings, Professional
from .roles import CLIENT, COMPANY_ADMIN, PLATFORM_ADMIN, ROLES, user_role

User = get_user_model()
LIST_LIMIT = 100  # máximo de linhas por listagem (use a busca para achar o resto)


class IsPlatformOwner(BasePermission):
    """Só o superusuário (dono do software) acessa o painel da plataforma."""

    def has_permission(self, request, view):
        """Libera apenas usuários autenticados com `is_superuser`."""
        return bool(request.user and request.user.is_authenticated and request.user.is_superuser)


def _find_user(identifier):
    """Usuário pelo nome de usuário ou e-mail (sem diferenciar maiúsculas), ou None; erro se o e-mail for ambíguo."""
    identifier = str(identifier or "").strip()
    if not identifier:
        return None
    by_username = User.objects.filter(username__iexact=identifier).first()
    if by_username:  # nome de usuário tem prioridade: é único
        return by_username
    matches = list(User.objects.filter(email__iexact=identifier)[:2])
    if len(matches) > 1:
        raise serializers.ValidationError({"detail": "Há mais de uma conta com esse e-mail. Use o nome de usuário."})
    return matches[0] if matches else None


class MemberSerializer(serializers.ModelSerializer):
    """Administrador de uma empresa (dados mínimos)."""

    name = serializers.CharField(source="first_name")

    class Meta:
        model = User
        fields = ["id", "name", "email", "username"]


class PlatformCompanySerializer(serializers.ModelSerializer):
    """Empresa vista pelo dono: dados, totais e administradores. Só `active` pode ser alterado."""

    professionals_count = serializers.IntegerField(read_only=True)
    services_count = serializers.IntegerField(read_only=True)
    appointments_count = serializers.IntegerField(read_only=True)
    members = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = ["id", "name", "slug", "category", "city", "address", "active", "created_at",
                  "professionals_count", "services_count", "appointments_count", "members"]
        read_only_fields = ["name", "slug", "category", "city", "address", "created_at"]

    def get_members(self, company):
        """Administradores da empresa, em ordem alfabética."""
        users = [m.user for m in company.members.all()]
        return MemberSerializer(sorted(users, key=lambda u: (u.first_name or u.username).lower()), many=True).data


class PlatformCompanyViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Todas as empresas da plataforma: cadastrar, listar (com busca), ativar/desativar e gerenciar administradores."""

    permission_classes = [IsPlatformOwner]
    serializer_class = PlatformCompanySerializer
    http_method_names = ["get", "patch", "post", "delete", "head", "options"]  # sem PUT: só `active` muda

    def _base(self):
        """Empresas com os totais calculados e os administradores já carregados."""
        return (Company.objects.order_by("name").prefetch_related("members__user").annotate(
            professionals_count=Count("professionals", distinct=True),
            services_count=Count("services", distinct=True),
            appointments_count=Count("professionals__appointments", distinct=True)))

    def get_queryset(self):
        """Aplica os filtros opcionais: `q` (nome, categoria, cidade, slug ou e-mail de administrador) e `active`."""
        qs = self._base()
        q = self.request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(category__icontains=q) | Q(city__icontains=q)
                           | Q(slug__icontains=q) | Q(members__user__email__icontains=q)).distinct()
        active = self.request.query_params.get("active")
        if active in ("true", "false"):
            qs = qs.filter(active=(active == "true"))
        return qs

    def list(self, request, *args, **kwargs):
        """Lista as empresas filtradas, limitadas a `LIST_LIMIT`."""
        return Response(self.get_serializer(self.get_queryset()[:LIST_LIMIT], many=True).data)

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Cadastra uma empresa (único caminho para criar empresas).

        Aceita os dados da empresa e, opcionalmente, `admin` (usuário ou e-mail de quem a administrará).
        """
        admin = _find_user(request.data.get("admin")) if str(request.data.get("admin") or "").strip() else None
        if str(request.data.get("admin") or "").strip() and admin is None:
            raise serializers.ValidationError({"admin": "Usuário não encontrado. A pessoa precisa criar conta antes."})
        s = CompanySerializer(data=request.data)
        s.is_valid(raise_exception=True)
        company = s.save()
        if admin:
            CompanyMember.objects.get_or_create(company=company, user=admin)
        audit.record(request, "company.create", company=company, target=company,
                     **({"quem": f"{admin.first_name or admin.username} <{admin.email or admin.username}>"} if admin else {}))
        return Response(self._fresh(company.pk), status=201)

    def perform_update(self, serializer):
        """Ativa/desativa a empresa (único campo editável aqui) e registra no log."""
        old = serializer.instance.active
        company = serializer.save()
        if company.active != old:
            audit.record(self.request, "company.toggle_active", company=company, target=company, de=old, para=company.active)

    def _fresh(self, pk):
        """A empresa recarregada (totais e administradores atualizados) já serializada."""
        return PlatformCompanySerializer(self._base().get(pk=pk)).data

    @action(detail=True, methods=["post"], url_path="members")
    def add_member(self, request, pk=None):
        """Dá a um usuário existente (por e-mail ou nome de usuário) acesso ao painel da empresa."""
        company = self.get_object()
        user = _find_user(request.data.get("email"))
        if user is None:
            raise serializers.ValidationError({"detail": "Usuário não encontrado. A pessoa precisa criar conta antes."})
        _, created = CompanyMember.objects.get_or_create(company=company, user=user)
        if created:
            audit.record(request, "company.member_add", company=company, target=user,
                         label=f"{user.first_name or user.username} <{user.email or user.username}>")
        return Response(self._fresh(company.pk))

    @action(detail=True, methods=["delete"], url_path=r"members/(?P<user_id>\d+)")
    def remove_member(self, request, pk=None, user_id=None):
        """Tira o acesso de um administrador à empresa (a empresa e os dados dela permanecem)."""
        company = self.get_object()
        member = User.objects.filter(pk=int(user_id)).first()
        removed, _ = CompanyMember.objects.filter(company=company, user_id=int(user_id)).delete()
        if removed and member:
            audit.record(request, "company.member_remove", company=company, target=member,
                         label=f"{member.first_name or member.username} <{member.email or member.username}>")
        return Response(self._fresh(company.pk))


class PlatformUserSerializer(serializers.ModelSerializer):
    """Usuário visto pelo dono: dados, totais e situação. Só `is_active` pode ser alterado."""

    name = serializers.CharField(source="first_name", read_only=True)
    companies_count = serializers.IntegerField(read_only=True)
    appointments_count = serializers.IntegerField(read_only=True)
    role = serializers.SerializerMethodField()
    companies = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name", "email", "username", "is_active", "is_superuser", "role", "companies",
                  "date_joined", "companies_count", "appointments_count"]
        read_only_fields = ["email", "username", "is_superuser", "date_joined"]

    def get_role(self, user):
        """Perfil atual: `client`, `company_admin` ou `platform_admin`."""
        return user_role(user)

    def get_companies(self, user):
        """Nomes das empresas que o usuário administra."""
        return [{"id": m.company_id, "name": m.company.name} for m in user.memberships.all()]

    def validate(self, data):
        """Não permite desativar um superusuário (isso também impede o dono de se trancar para fora)."""
        if data.get("is_active") is False and self.instance.is_superuser:
            raise serializers.ValidationError("Não é possível desativar um superusuário.")
        return data


class PlatformUserCreateSerializer(serializers.Serializer):
    """Cadastro de usuário pelo admin geral: dados de acesso e perfil inicial.

    `role`: `client` (padrão), `company_admin` (exige `company`) ou `platform_admin`.
    """

    name = serializers.CharField(max_length=120)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=ROLES, default=CLIENT)
    company = serializers.PrimaryKeyRelatedField(queryset=Company.objects.all(), required=False, allow_null=True)

    def validate_email(self, v):
        """Normaliza para minúsculas e recusa e-mail já usado por qualquer conta."""
        v = v.lower()
        if User.objects.filter(Q(username=v) | Q(email__iexact=v)).exists():
            raise serializers.ValidationError("Este e-mail já está cadastrado. Para mudar o perfil, use a lista de usuários.")
        return v

    def validate_password(self, v):
        """Aplica as regras de senha do Django."""
        validate_password(v)
        return v

    def validate(self, data):
        """Administrador de estabelecimento precisa de uma empresa."""
        if data["role"] == COMPANY_ADMIN and not data.get("company"):
            raise serializers.ValidationError({"company": "Escolha a empresa que o usuário vai administrar."})
        return data


class PlatformUserViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    """Usuários da plataforma: listar (com busca), cadastrar, trocar perfil e ativar/desativar o acesso."""

    permission_classes = [IsPlatformOwner]
    serializer_class = PlatformUserSerializer
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        """Usuários com totais; `q` busca por nome, e-mail ou nome de usuário."""
        qs = User.objects.order_by("-date_joined").prefetch_related("memberships__company").annotate(
            companies_count=Count("memberships", distinct=True),
            appointments_count=Count("appointments", distinct=True))
        q = self.request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(Q(first_name__icontains=q) | Q(email__icontains=q) | Q(username__icontains=q))
        return qs

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        """Cadastra um usuário já com o perfil escolhido (só o admin geral). Devolve o usuário criado."""
        s = PlatformUserCreateSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        user = User.objects.create_user(username=d["email"], email=d["email"], password=d["password"], first_name=d["name"])
        self._change_role(request, user, d["role"], d["company"].pk if d.get("company") else None)
        audit.record(request, "user.create", company=d.get("company"), target=user,
                     label=f"{user.first_name} <{user.email}>", perfil=d["role"])
        user = self.get_queryset().get(pk=user.pk)
        return Response(self.get_serializer(user).data, status=201)

    @transaction.atomic
    def update(self, request, *args, **kwargs):
        """Altera `is_active` e/ou o PERFIL do usuário (só o admin geral chega aqui).

        `role`: `client` (remove cargos e acessos de administrador), `company_admin` (exige `company`,
        ou que o usuário já administre alguma empresa) ou `platform_admin` (admin geral).
        Ninguém altera o próprio perfil, o que impede o admin geral de se trancar para fora.
        """
        user = self.get_object()
        old_role, old_active = user_role(user), user.is_active
        self._update_profile(request, user)
        role = request.data.get("role")
        if role not in (None, ""):
            self._change_role(request, user, role, request.data.get("company"))
        response = super().update(request, *args, **kwargs)
        user.refresh_from_db()
        who = f"{user.first_name or user.username} <{user.email or user.username}>"
        if user_role(user) != old_role:
            company = Company.objects.filter(pk=int(request.data["company"])).first() \
                if str(request.data.get("company") or "").isdigit() else None
            audit.record(request, "user.role_change", company=company, target=user, label=who,
                         de=old_role, para=user_role(user))
        if user.is_active != old_active:
            if not user.is_active:
                user.auth_sessions.all().delete()  # desativar derruba as sessões abertas na hora
            audit.record(request, "user.toggle_active", target=user, label=who, de=old_active, para=user.is_active)
        return response

    def _update_profile(self, request, user):
        """Altera nome, e-mail (que é o login) e/ou redefine a senha, se vierem na requisição, e registra no log.

        Mudar e-mail ou senha de OUTRA pessoa encerra as sessões dela. O log guarda os campos alterados, nunca a senha.
        """
        data, changed, details = request.data, {}, {}
        name = str(data["name"]).strip() if "name" in data else None
        email = str(data["email"]).strip().lower() if "email" in data else None
        password = data.get("password") or None
        if name is not None:
            if not name or len(name) > 120:
                raise serializers.ValidationError({"name": "Informe o nome (até 120 caracteres)."})
            if name != user.first_name:
                changed["nome"] = [user.first_name, name]
                user.first_name = name
        if email is not None and email != (user.email or "").lower():
            try:
                serializers.EmailField().run_validation(email)
            except serializers.ValidationError:
                raise serializers.ValidationError({"email": "E-mail inválido."})
            if User.objects.filter(Q(username=email) | Q(email__iexact=email)).exclude(pk=user.pk).exists():
                raise serializers.ValidationError({"email": "Este e-mail já está cadastrado."})
            changed["e-mail"] = [user.email, email]
            user.email = email
            user.username = email
        if password:
            try:
                validate_password(password, user)
            except DjangoValidationError as e:
                raise serializers.ValidationError({"password": list(e.messages)})
            user.set_password(password)
            details["senha"] = "redefinida"
        if not changed and not details:
            return
        user.save()
        if user.pk != request.user.pk and (email is not None and "e-mail" in changed or password):
            user.auth_sessions.all().delete()   # a pessoa precisa entrar de novo com os dados novos
        audit.record(request, "user.update", target=user, label=f"{user.first_name or user.username} <{user.email or user.username}>",
                     mudou=changed, **details)

    def _change_role(self, request, user, role, company_id):
        """Aplica o novo perfil ao usuário, validando as regras acima."""
        if role not in ROLES:
            raise serializers.ValidationError({"role": "Perfil inválido."})
        if user.pk == request.user.pk:
            raise serializers.ValidationError({"detail": "Você não pode alterar o próprio perfil."})
        if role == PLATFORM_ADMIN:
            user.is_superuser = user.is_staff = True
        elif role == CLIENT:
            user.is_superuser = user.is_staff = False
            CompanyMember.objects.filter(user=user).delete()
        elif role == COMPANY_ADMIN:
            company = Company.objects.filter(pk=int(company_id)).first() if str(company_id or "").isdigit() else None
            if company is None and not CompanyMember.objects.filter(user=user).exists():
                raise serializers.ValidationError({"company": "Escolha a empresa que o usuário vai administrar."})
            user.is_superuser = user.is_staff = False
            if company:
                CompanyMember.objects.get_or_create(company=company, user=user)
        user.save(update_fields=["is_superuser", "is_staff"])

    def list(self, request, *args, **kwargs):
        """Lista os usuários filtrados, limitados a `limit` (padrão e máximo: `LIST_LIMIT`).

        Usado também pelo autocomplete ao escolher administradores (`?q=ana&limit=8`).
        """
        limit = request.query_params.get("limit", "")
        limit = min(int(limit), LIST_LIMIT) if limit.isdigit() and int(limit) > 0 else LIST_LIMIT
        return Response(self.get_serializer(self.get_queryset()[:limit], many=True).data)


@api_view(["GET", "PUT"])
@permission_classes([IsPlatformOwner])
def platform_settings(request):
    """Lê ou altera as configurações globais (hoje: máximo de empresas que um usuário pode cadastrar sozinho)."""
    cfg = PlatformSettings.load()
    if request.method == "PUT":
        value = request.data.get("max_companies_per_user")
        if not str(value).isdigit() or not 0 <= int(value) <= 1000:
            raise serializers.ValidationError({"max_companies_per_user": "Use um número de 0 a 1000 (0 = sem limite)."})
        old = cfg.max_companies_per_user
        cfg.max_companies_per_user = int(value)
        cfg.save()
        if old != cfg.max_companies_per_user:
            audit.record(request, "settings.update", label="Máximo de empresas por usuário",
                         mudou={"max_companies_per_user": [old, cfg.max_companies_per_user]})
    return Response({"max_companies_per_user": cfg.max_companies_per_user})


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def stats(request):
    """Visão geral da plataforma: totais de empresas, usuários, profissionais, agendamentos e as empresas mais ativas."""
    now = timezone.now()
    appointments = Appointment.objects.all()
    top = (Company.objects.annotate(n=Count("professionals__appointments"))
           .filter(n__gt=0).order_by("-n", "name")[:5])
    return Response({
        "companies": {"total": Company.objects.count(), "active": Company.objects.filter(active=True).count()},
        "users": {"total": User.objects.count(), "active": User.objects.filter(is_active=True).count()},
        "professionals": Professional.objects.count(),
        "appointments": {
            "total": appointments.count(),
            "upcoming": appointments.filter(status=Appointment.Status.CONFIRMED, start__gte=now).count(),
            "canceled": appointments.filter(status=Appointment.Status.CANCELED).count(),
            "created_last_30_days": appointments.filter(created_at__gte=now - timedelta(days=30)).count(),
        },
        "top_companies": [{"id": c.id, "name": c.name, "appointments": c.n} for c in top],
    })


# ---------- Log de auditoria (só o admin geral) ----------
AUDIT_PAGE_SIZE, AUDIT_PAGE_MAX = 50, 200


def _audit_queryset(request):
    """Registros de auditoria filtrados por `from`/`to` (datas), `action` (código ou prefixo como `appointment`),
    `company` (id), `actor` (parte do nome/e-mail) e `q` (parte do alvo ou do IP)."""
    p, qs = request.query_params, AuditLog.objects.all()
    try:
        if p.get("from"):
            qs = qs.filter(created_at__date__gte=date.fromisoformat(p["from"]))
        if p.get("to"):
            qs = qs.filter(created_at__date__lte=date.fromisoformat(p["to"]))
    except ValueError:
        raise serializers.ValidationError({"detail": "Data inválida (use AAAA-MM-DD)."})
    action_ = p.get("action", "")
    if action_ in audit.ACTIONS:
        qs = qs.filter(action=action_)
    elif action_:  # prefixo de grupo, ex.: "appointment" -> appointment.*
        qs = qs.filter(action__startswith=f"{action_}.")
    if p.get("company", "").isdigit():
        qs = qs.filter(company_id=int(p["company"]))
    if p.get("actor"):
        qs = qs.filter(actor_label__icontains=p["actor"].strip())
    if p.get("q"):
        q = p["q"].strip()
        qs = qs.filter(Q(target_label__icontains=q) | Q(ip__startswith=q) | Q(company_label__icontains=q))
    return qs


AUDIT_EXPORT_LIMIT = 20_000


def _audit_row(log):
    """Um registro do log no formato da API."""
    return {"id": log.id, "created_at": log.created_at.isoformat(), "actor": log.actor_label or "(anônimo)",
            "action": log.action, "action_label": audit.ACTIONS.get(log.action, log.action),
            "company": log.company_label, "target_type": log.target_type, "target": log.target_label,
            "summary": audit.summary(log), "details": log.details, "ip": log.ip}


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def audit_log(request):
    """Lista paginada do log de auditoria, do mais recente ao mais antigo (filtros em `_audit_queryset`)."""
    qs = _audit_queryset(request)
    size = request.query_params.get("page_size", "")
    size = min(int(size), AUDIT_PAGE_MAX) if size.isdigit() and int(size) > 0 else AUDIT_PAGE_SIZE
    page = request.query_params.get("page", "")
    page = int(page) if page.isdigit() and int(page) > 0 else 1
    return Response({"count": qs.count(), "page": page, "page_size": size,
                     "results": [_audit_row(a) for a in qs[(page - 1) * size: page * size]]})


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def audit_export_xlsx(request):
    """Baixa em Excel o log de auditoria com os filtros atuais (até `AUDIT_EXPORT_LIMIT` registros mais recentes)."""
    from django.utils import timezone
    from .xlsx import workbook_response
    qs = _audit_queryset(request)[:AUDIT_EXPORT_LIMIT]
    audit.record(request, "audit.export", filtros={k: v for k, v in request.query_params.items() if v})
    rows = [[timezone.localtime(a.created_at).strftime("%d/%m/%Y %H:%M:%S"), a.actor_label or "(anônimo)",
             audit.ACTIONS.get(a.action, a.action), a.company_label, a.target_type, a.target_label, audit.summary(a), a.ip]
            for a in qs]
    return workbook_response("auditoria.xlsx", [("Auditoria", ["Quando", "Quem", "Ação", "Empresa", "Tipo do alvo",
                                                                "Alvo", "Detalhes", "IP"], rows)])


@api_view(["GET"])
@permission_classes([IsPlatformOwner])
def audit_options(request):
    """Ações disponíveis para o filtro (código e texto) e as empresas que já aparecem no log."""
    return Response({
        "actions": [{"code": k, "label": v} for k, v in audit.ACTIONS.items()],
        "companies": list(Company.objects.order_by("name").values("id", "name")),
    })
