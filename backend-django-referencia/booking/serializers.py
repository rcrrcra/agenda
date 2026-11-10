"""Serializers da API: validação de entrada e formato de saída.

Seções: empresa e usuário, leitura para clientes, agendamento (`book`)
e painel de administração (sempre no contexto de uma empresa).
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from .emails import send_admin_notice, send_confirmation
from .roles import user_role
from .models import (Appointment, Break, Company, Professional, ProfessionalService,
                     Service, TimeOff, WorkingHours)
from .slots import available_slots

User = get_user_model()


class CompanySerializer(serializers.ModelSerializer):
    """Empresa: listagem pública, cadastro e edição pelo administrador (o slug é gerado)."""

    class Meta:
        model = Company
        fields = ["id", "name", "slug", "category", "city", "description", "address", "active"]
        read_only_fields = ["slug"]


class UserSerializer(serializers.ModelSerializer):
    """Dados do usuário logado: perfil, empresas que ele administra e se é o dono do software (superusuário)."""

    name = serializers.CharField(source="first_name")
    companies = serializers.SerializerMethodField()
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "name", "email", "username", "is_staff", "is_superuser", "role", "companies"]

    def get_role(self, user):
        """Perfil: `client`, `company_admin` ou `platform_admin` (ver `roles.py`)."""
        return user_role(user)

    def get_companies(self, user):
        """Empresas administradas pelo usuário (id, nome e slug), em ordem alfabética."""
        members = user.memberships.select_related("company").order_by("company__name")
        return [{"id": m.company_id, "name": m.company.name, "slug": m.company.slug} for m in members]


class CustomerSerializer(serializers.ModelSerializer):
    """Dados mínimos de um cliente (busca no painel); não expõe empresas nem permissões."""

    name = serializers.CharField(source="first_name")

    class Meta:
        model = User
        fields = ["id", "name", "email"]


class RegisterSerializer(serializers.Serializer):
    """Cadastro de cliente.

    Também permite assumir uma conta criada pelo painel (sem senha).
    """

    name = serializers.CharField(max_length=120)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate_email(self, v):
        """Normaliza para minúsculas e recusa e-mails de contas com senha ou da equipe."""
        v = v.lower()
        u = User.objects.filter(username=v).first()
        # Conta criada pelo painel (sem senha) pode ser assumida; com senha ou da equipe, não.
        if u and (u.has_usable_password() or u.is_staff):
            raise serializers.ValidationError("Este e-mail já está cadastrado.")
        # E-mail já usado por OUTRA conta (ex.: superusuário com username diferente): também recusa.
        if User.objects.filter(email__iexact=v).exclude(pk=u.pk if u else None).exists():
            raise serializers.ValidationError("Este e-mail já está cadastrado.")
        return v

    def validate_password(self, v):
        """Aplica as regras de senha do Django (tamanho, senhas comuns...)."""
        validate_password(v)
        return v

    def create(self, d):
        """Cria o usuário (username = e-mail) ou define a senha de uma conta criada pelo painel."""
        u = User.objects.filter(username=d["email"]).first()
        if u:  # cliente cadastrado pelo painel (sem senha): define a senha e assume a conta
            u.set_password(d["password"])
            u.first_name = d["name"]
            u.save()
            return u
        return User.objects.create_user(username=d["email"], email=d["email"],
                                        password=d["password"], first_name=d["name"])


class OfferSerializer(serializers.ModelSerializer):
    """Serviço oferecido por um profissional (leitura, para clientes)."""

    name = serializers.CharField(source="service.name")

    class Meta:
        model = ProfessionalService
        fields = ["service", "name", "duration_minutes", "price"]


class ProfessionalSerializer(serializers.ModelSerializer):
    """Profissional com seus serviços (leitura, para clientes). `company` permite ao app descartar respostas antigas."""

    services = OfferSerializer(source="offers", many=True)

    class Meta:
        model = Professional
        fields = ["id", "company", "name", "bio", "services"]


def book(customer, d, actor=None, staff=False):
    """Cria o agendamento com bloqueio de concorrência, confirma ao cliente e avisa os administradores.

    `actor` é quem fez a reserva (o próprio cliente ou alguém da equipe); ele não recebe o aviso de administrador.
    `staff=True` (reserva feita pela equipe) ignora a antecedência mínima da empresa.
    """
    company = d["professional"].company
    if not staff and company.min_notice_hours and d["start"] < timezone.now() + timedelta(hours=company.min_notice_hours):
        raise serializers.ValidationError(f"Agendamentos nesta empresa exigem {company.min_notice_hours}h de antecedência.")
    with transaction.atomic():
        # Trava a linha do profissional: reservas simultâneas passam uma de cada vez (evita horário duplicado).
        pro = Professional.objects.select_for_update().get(pk=d["professional"].pk)
        offer = ProfessionalService.objects.get(professional=pro, service=d["service"])
        day = timezone.localtime(d["start"]).date()
        # Revalida dentro da trava: grade, expediente, pausas, bloqueios e conflitos.
        if d["start"] not in available_slots(pro, offer, day):
            raise serializers.ValidationError("Horário indisponível. Escolha outro.")
        appt = Appointment.objects.create(customer=customer, **d)
    send_confirmation(appt)
    send_admin_notice(appt, "created", actor=actor or customer)
    return appt


class AppointmentSerializer(serializers.ModelSerializer):
    """Agendamento. Na escrita aceita professional, service, start e notes; o resto é calculado."""

    professional_name = serializers.CharField(source="professional.name", read_only=True)
    company_name = serializers.CharField(source="professional.company.name", read_only=True)
    service_name = serializers.CharField(source="service.name", read_only=True)
    customer_name = serializers.SerializerMethodField()
    customer_email = serializers.EmailField(source="customer.email", read_only=True)
    google_calendar_url = serializers.CharField(read_only=True)
    customer_flagged = serializers.SerializerMethodField()
    review = serializers.SerializerMethodField()
    can_review = serializers.SerializerMethodField()
    can_cancel = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = ["id", "professional", "professional_name", "company_name", "service", "service_name",
                  "customer_name", "customer_email", "customer_flagged", "start", "end", "status", "notes",
                  "price", "review", "can_review", "can_cancel", "google_calendar_url"]
        read_only_fields = ["end", "status", "price"]

    def get_review(self, obj):
        """Avaliação do atendimento (`{rating, comment}`) ou None."""
        r = getattr(obj, "review", None)
        return {"rating": r.rating, "comment": r.comment} if r else None

    def get_can_review(self, obj):
        """True se o atendimento está concluído (o cliente pode avaliar ou corrigir a nota)."""
        return obj.status == Appointment.Status.COMPLETED

    def get_can_cancel(self, obj):
        """True se o CLIENTE ainda pode cancelar: confirmado e dentro da antecedência exigida pela empresa."""
        hours = obj.company.cancel_notice_hours
        return obj.status == Appointment.Status.CONFIRMED and (not hours or obj.start - timezone.now() >= timedelta(hours=hours))

    def get_customer_flagged(self, obj):
        """True se o cliente falta com frequência. Só é calculado para o painel da empresa (contexto `flagged`)."""
        return obj.customer_id in self.context.get("flagged", ())

    def get_customer_name(self, obj):
        """Nome do cliente (cai para o e-mail se o nome estiver vazio)."""
        return obj.customer.first_name or obj.customer.email

    def validate(self, d):
        """Confere empresa e profissional ativos e se o profissional realiza o serviço.

        A disponibilidade do horário é checada na criação, sob trava de banco.
        """
        if not d["professional"].active or not d["professional"].company.active:
            raise serializers.ValidationError("Profissional indisponível.")
        if not ProfessionalService.objects.filter(professional=d["professional"], service=d["service"]).exists():
            raise serializers.ValidationError("Este profissional não realiza este serviço.")
        return d

    def create(self, d):
        """Cria o agendamento para o usuário logado."""
        return book(self.context["request"].user, d)


# ---------- Painel de administração (contexto: self.context["company"]) ----------
class AdminServiceSerializer(serializers.ModelSerializer):
    """Serviço do catálogo da empresa (a empresa é definida pela view)."""

    class Meta:
        model = Service
        fields = ["id", "name", "description"]


def _check_range(d):
    """Garante que o fim da faixa é posterior ao início."""
    if d["end_time"] <= d["start_time"]:
        raise serializers.ValidationError("O fim deve ser depois do início.")
    return d


class HoursSerializer(serializers.ModelSerializer):
    """Faixa de expediente com intervalo próprio entre horários (escrita aninhada em profissional)."""

    class Meta:
        model = WorkingHours
        fields = ["weekday", "start_time", "end_time", "slot_minutes"]

    def validate(self, d):
        """Valida início < fim."""
        return _check_range(d)


class BreakSerializer(serializers.ModelSerializer):
    """Pausa (escrita aninhada em profissional)."""

    class Meta:
        model = Break
        fields = ["weekday", "start_time", "end_time", "label"]

    def validate(self, d):
        """Valida início < fim."""
        return _check_range(d)


class AdminOfferSerializer(serializers.ModelSerializer):
    """Serviço oferecido com duração, preço e intervalo próprio entre horários (escrita aninhada em profissional)."""

    class Meta:
        model = ProfessionalService
        fields = ["service", "duration_minutes", "price", "slot_minutes"]


class AdminProfessionalSerializer(serializers.ModelSerializer):
    """Profissional com serviços, expediente e pausas aninhados, gravados em uma única chamada.

    Ao enviar `offers`, `working_hours` ou `breaks`, a lista atual é substituída
    por completo; se a chave for omitida, a lista existente é mantida.
    """

    offers = AdminOfferSerializer(many=True, required=False)
    working_hours = HoursSerializer(many=True, required=False)
    breaks = BreakSerializer(many=True, required=False)

    class Meta:
        model = Professional
        fields = ["id", "name", "bio", "active", "slot_minutes", "buffer_minutes",
                  "offers", "working_hours", "breaks"]

    def validate_offers(self, v):
        """Recusa serviço repetido ou de outra empresa."""
        ids = [o["service"].pk for o in v]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Serviço repetido na lista de serviços oferecidos.")
        if any(o["service"].company_id != self.context["company"].id for o in v):
            raise serializers.ValidationError("Há serviço que não pertence a esta empresa.")
        return v

    def _children(self, pro, kids):
        """Substitui as listas filhas (serviços, expediente, pausas) pelas enviadas."""
        for key, model in (("offers", ProfessionalService), ("working_hours", WorkingHours), ("breaks", Break)):
            if key in kids:
                # Substituição total: apaga as linhas atuais e recria com as enviadas.
                model.objects.filter(professional=pro).delete()
                model.objects.bulk_create([model(professional=pro, **row) for row in kids[key]])

    @transaction.atomic
    def create(self, d):
        """Cria o profissional (a empresa chega via `save(company=...)`) e suas listas filhas atomicamente."""
        kids = {k: d.pop(k) for k in ("offers", "working_hours", "breaks") if k in d}
        pro = Professional.objects.create(**d)
        self._children(pro, kids)
        return pro

    @transaction.atomic
    def update(self, pro, d):
        """Atualiza o profissional e substitui as listas filhas enviadas, atomicamente."""
        kids = {k: d.pop(k) for k in ("offers", "working_hours", "breaks") if k in d}
        for k, v in d.items():
            setattr(pro, k, v)
        pro.save()
        self._children(pro, kids)
        return pro


class AdminBookingSerializer(AppointmentSerializer):
    """Agendamento criado pela equipe em nome de um cliente.

    Informe `customer_id` (cliente que já agendou nesta empresa) OU
    `new_customer_name` + `new_customer_email` (cliente novo ou ainda sem histórico aqui).
    """

    customer_id = serializers.PrimaryKeyRelatedField(queryset=User.objects.all(), write_only=True, required=False)
    new_customer_name = serializers.CharField(write_only=True, required=False, max_length=120)
    new_customer_email = serializers.EmailField(write_only=True, required=False)

    class Meta(AppointmentSerializer.Meta):
        fields = AppointmentSerializer.Meta.fields + ["customer_id", "new_customer_name", "new_customer_email"]

    def validate_customer_id(self, user):
        """Só aceita clientes que já têm agendamento nesta empresa (evita buscar usuários de outras)."""
        if not Appointment.objects.filter(customer=user, professional__company=self.context["company"]).exists():
            raise serializers.ValidationError("Cliente não encontrado nesta empresa. Use 'Novo cliente'.")
        return user

    def validate(self, d):
        """Exige profissional da empresa e a identificação do cliente, além das validações do agendamento."""
        d = super().validate(d)
        if d["professional"].company_id != self.context["company"].id:
            raise serializers.ValidationError("Profissional de outra empresa.")
        if "customer_id" not in d and not (d.get("new_customer_name") and d.get("new_customer_email")):
            raise serializers.ValidationError("Escolha um cliente ou informe nome e e-mail.")
        return d

    def create(self, d):
        """Resolve o cliente (existente ou novo, sem senha) e reserva o horário."""
        customer = d.pop("customer_id", None)
        name, email = d.pop("new_customer_name", None), d.pop("new_customer_email", None)
        if customer is None:
            email = email.lower()
            customer = User.objects.filter(username=email).first()
            if customer is None:
                customer = User(username=email, email=email, first_name=name)
                customer.set_unusable_password()
                customer.save()
        return book(customer, d, actor=self.context["request"].user, staff=True)


class TimeOffSerializer(serializers.ModelSerializer):
    """Bloqueio de datas, com o total de agendamentos confirmados que ele atinge."""

    professional_name = serializers.SerializerMethodField()
    affected_appointments = serializers.SerializerMethodField()

    class Meta:
        model = TimeOff
        fields = ["id", "professional", "professional_name", "start_date", "end_date", "reason",
                  "affected_appointments"]

    def get_professional_name(self, o):
        """Nome do profissional, ou None quando o bloqueio vale para a empresa toda."""
        return o.professional.name if o.professional_id else None

    def get_affected_appointments(self, o):
        """Quantos agendamentos futuros confirmados caem no período bloqueado."""
        # Conta só agendamentos futuros e confirmados da empresa dentro do período bloqueado.
        qs = Appointment.objects.filter(
            professional__company_id=o.company_id, status=Appointment.Status.CONFIRMED,
            start__gte=timezone.now(), start__date__gte=o.start_date, start__date__lte=o.end_date)
        if o.professional_id:
            qs = qs.filter(professional_id=o.professional_id)
        return qs.count()

    def validate(self, d):
        """Valida data final >= inicial e que o profissional (se houver) é da empresa."""
        if d["end_date"] < d["start_date"]:
            raise serializers.ValidationError("A data final deve ser igual ou posterior à inicial.")
        pro = d.get("professional")
        if pro and pro.company_id != self.context["company"].id:
            raise serializers.ValidationError("Profissional de outra empresa.")
        return d
