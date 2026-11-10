"""Modelos de dados do sistema de agendamento (multiempresa).

Visão geral:
- Company e CompanyMember: cada empresa (barbearia, clínica...) e quem a administra.
  Tudo abaixo pertence a uma empresa; empresas não enxergam os dados umas das outras.
- FavoriteCompany: empresas preferidas de cada cliente (a busca do cliente só mostra o que ele adicionou).
- Service: catálogo de serviços da empresa.
- Professional + ProfessionalService: quem atende e quais serviços faz (duração e preço próprios).
- WorkingHours e Break: expediente e pausas semanais de cada profissional.
- TimeOff: feriados e folgas (datas inteiras bloqueadas).
- Appointment: reserva de um cliente.
"""
from datetime import timedelta, timezone as dt_utc
from urllib.parse import urlencode
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils.text import slugify

WEEKDAYS = [(0, "Segunda"), (1, "Terça"), (2, "Quarta"), (3, "Quinta"),
            (4, "Sexta"), (5, "Sábado"), (6, "Domingo")]


class Company(models.Model):
    """Empresa que oferece serviços (barbearia, clínica, salão...).

    É a fronteira de isolamento: serviços, profissionais, bloqueios e agendas
    pertencem a uma única empresa.
    """

    name = models.CharField("nome", max_length=120)
    slug = models.SlugField("identificador", max_length=140, unique=True, blank=True,
                            help_text="Usado no link de agendamento. Gerado do nome se ficar vazio.")
    category = models.CharField("categoria", max_length=60, blank=True, help_text="Ex.: Barbearia, Clínica.")
    city = models.CharField("cidade", max_length=80, blank=True)
    search_text = models.TextField(editable=False, blank=True, default="",
                                   help_text="Texto normalizado (sem acento) usado pela busca; mantido por sinais.")
    description = models.CharField("descrição", max_length=255, blank=True)
    address = models.CharField("endereço", max_length=255, blank=True)
    active = models.BooleanField("ativa", default=True, help_text="Empresas inativas não aparecem para os clientes.")
    logo = models.ImageField("logo", upload_to="logos/", null=True, blank=True)
    # --- configurações da empresa (editáveis pelos administradores) ---
    notify_customers = models.BooleanField("avisar clientes por e-mail", default=True,
                                           help_text="Confirmação e cancelamento enviados ao cliente.")
    notify_admins = models.BooleanField("avisar administradores por e-mail", default=True,
                                        help_text="Aviso quando entra ou é cancelado um agendamento.")
    min_notice_hours = models.PositiveSmallIntegerField(
        "antecedência mínima para agendar (h)", default=0, validators=[MaxValueValidator(720)],
        help_text="Clientes só agendam com pelo menos esta antecedência. 0 = sem limite. A equipe não é limitada.")
    cancel_notice_hours = models.PositiveSmallIntegerField(
        "antecedência mínima para cancelar (h)", default=0, validators=[MaxValueValidator(720)],
        help_text="Clientes só cancelam com pelo menos esta antecedência. 0 = sem limite. A equipe não é limitada.")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                                   related_name="created_companies", editable=False,
                                   verbose_name="cadastrada por", help_text="Preenchido quando o próprio usuário cadastra a empresa.")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        verbose_name, verbose_name_plural = "empresa", "empresas"

    def _unique_slug(self):
        """Gera um slug a partir do nome, acrescentando -2, -3... se já existir."""
        base = (slugify(self.name) or "empresa")[:120]
        slug, n = base, 2
        while Company.objects.filter(slug=slug).exclude(pk=self.pk).exists():
            slug, n = f"{base}-{n}", n + 1
        return slug

    def save(self, *args, **kwargs):
        """Preenche o slug automaticamente na primeira gravação."""
        if not self.slug:
            self.slug = self._unique_slug()
        super().save(*args, **kwargs)

    def __str__(self):
        """Nome da empresa."""
        return self.name


class PlatformSettings(models.Model):
    """Configurações globais da plataforma (uma única linha), editadas pelo admin geral na interface."""

    max_companies_per_user = models.PositiveSmallIntegerField(
        "máximo de empresas por usuário", default=10,
        help_text="Quantas empresas um usuário pode cadastrar sozinho. 0 = sem limite. Não afeta o cadastro feito pelo admin geral.")

    class Meta:
        verbose_name = verbose_name_plural = "configurações da plataforma"

    @classmethod
    def load(cls):
        """A linha única de configurações (criada com os padrões no primeiro uso)."""
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        """Texto curto para o Django admin."""
        return "Configurações da plataforma"


class CompanyHours(models.Model):
    """Horário de funcionamento padrão da empresa (mostrado na página pública e usado como sugestão ao criar profissionais)."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="opening_hours")
    weekday = models.PositiveSmallIntegerField("dia da semana", choices=WEEKDAYS)
    start_time = models.TimeField("abre")
    end_time = models.TimeField("fecha")

    class Meta:
        ordering = ["weekday", "start_time"]
        verbose_name, verbose_name_plural = "horário de funcionamento", "horários de funcionamento"

    def __str__(self):
        """Texto no formato 'Empresa - dia 09:00-18:00'."""
        return f"{self.company} - {self.get_weekday_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M}"


class CompanyPhoto(models.Model):
    """Foto da galeria da página pública da empresa."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="photos")
    image = models.ImageField("foto", upload_to="photos/")
    caption = models.CharField("legenda", max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        verbose_name, verbose_name_plural = "foto da empresa", "fotos da empresa"

    def __str__(self):
        """Texto no formato 'Empresa - foto N'."""
        return f"{self.company} - foto {self.pk}"


class Review(models.Model):
    """Avaliação (nota de 1 a 5 e comentário) de um atendimento CONCLUÍDO, feita pelo cliente. Uma por atendimento."""

    appointment = models.OneToOneField("Appointment", on_delete=models.CASCADE, related_name="review")
    rating = models.PositiveSmallIntegerField("nota", validators=[MinValueValidator(1), MaxValueValidator(5)])
    comment = models.CharField("comentário", max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name, verbose_name_plural = "avaliação", "avaliações"

    def __str__(self):
        """Texto no formato 'nota - atendimento'."""
        return f"{self.rating}★ - {self.appointment}"


class CustomerNote(models.Model):
    """Observações INTERNAS de uma empresa sobre um cliente (o cliente não vê; outras empresas também não)."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="customer_notes", verbose_name="empresa")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="company_notes", verbose_name="cliente")
    notes = models.TextField("observações", blank=True, max_length=2000)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("company", "customer")]
        verbose_name, verbose_name_plural = "observação sobre cliente", "observações sobre clientes"

    def __str__(self):
        """Texto no formato 'Empresa - cliente'."""
        return f"{self.company} - {self.customer}"


class CompanyMember(models.Model):
    """Vínculo que dá a um usuário acesso ao painel de uma empresa."""

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="members", verbose_name="empresa")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="memberships", verbose_name="usuário")

    class Meta:
        unique_together = [("company", "user")]
        verbose_name, verbose_name_plural = "administrador da empresa", "administradores da empresa"

    def __str__(self):
        """Texto no formato 'Empresa - usuário'."""
        return f"{self.company} - {self.user}"


class Service(models.Model):
    """Serviço do catálogo de uma empresa (ex.: corte, consulta).

    Duração e preço não ficam aqui: são definidos por profissional em `ProfessionalService`.
    """

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="services", verbose_name="empresa")
    name = models.CharField("nome", max_length=100)
    description = models.CharField("descrição", max_length=255, blank=True)

    class Meta:
        verbose_name, verbose_name_plural = "serviço", "serviços"

    def __str__(self):
        """Nome do serviço (usado no admin e em seletores)."""
        return self.name


class Professional(models.Model):
    """Pessoa que atende clientes em uma empresa.

    `slot_minutes` é o intervalo PADRÃO entre horários oferecidos (ex.: 30 -> 9:00, 9:30...); cada serviço
    (`ProfessionalService.slot_minutes`) e cada faixa de expediente (`WorkingHours.slot_minutes`) podem
    definir o seu. `buffer_minutes` é a folga obrigatória antes e depois de cada atendimento.
    """

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="professionals", verbose_name="empresa")
    name = models.CharField("nome", max_length=120)
    bio = models.CharField("apresentação", max_length=255, blank=True)
    active = models.BooleanField("ativo", default=True)
    slot_minutes = models.PositiveIntegerField(
        "intervalo padrão entre horários (min)", default=30, validators=[MinValueValidator(5)],
        help_text="Usado quando nem o dia nem o serviço definem um intervalo próprio (ex.: 30 → 9:00, 9:30…).")
    buffer_minutes = models.PositiveIntegerField(
        "folga entre atendimentos (min)", default=0,
        help_text="Tempo livre obrigatório antes e depois de cada atendimento.")
    services = models.ManyToManyField(Service, through="ProfessionalService", related_name="professionals")

    class Meta:
        verbose_name, verbose_name_plural = "profissional", "profissionais"

    def __str__(self):
        """Nome do profissional."""
        return self.name


class ProfessionalService(models.Model):
    """Serviço que um profissional realiza, com duração e preço próprios.

    O mesmo serviço pode durar tempos diferentes conforme o profissional.
    """

    professional = models.ForeignKey(Professional, on_delete=models.CASCADE, related_name="offers")
    service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="offers")
    duration_minutes = models.PositiveIntegerField("duração (min)", default=30, validators=[MinValueValidator(5)])
    price = models.DecimalField("preço", max_digits=8, decimal_places=2, null=True, blank=True)
    slot_minutes = models.PositiveIntegerField(
        "intervalo entre horários (min)", null=True, blank=True, validators=[MinValueValidator(5)],
        help_text="Vazio = usa o intervalo padrão do profissional.")

    class Meta:
        unique_together = [("professional", "service")]
        verbose_name, verbose_name_plural = "serviço oferecido", "serviços oferecidos"

    def clean(self):
        """Serviço e profissional precisam ser da mesma empresa."""
        if self.professional_id and self.service_id and self.professional.company_id != self.service.company_id:
            raise ValidationError("Serviço e profissional precisam ser da mesma empresa.")

    def __str__(self):
        """Texto no formato 'Profissional - Serviço'."""
        return f"{self.professional} — {self.service}"


class WorkingHours(models.Model):
    """Faixa de expediente semanal (ex.: segunda, 9h-12h).

    Um mesmo dia pode ter várias faixas (ex.: manhã e tarde), cada uma com seu próprio
    intervalo entre horários (`slot_minutes`), que tem prioridade sobre o do serviço.
    """

    professional = models.ForeignKey(Professional, on_delete=models.CASCADE, related_name="working_hours")
    weekday = models.PositiveSmallIntegerField("dia da semana", choices=WEEKDAYS)
    start_time = models.TimeField("início")
    end_time = models.TimeField("fim")
    slot_minutes = models.PositiveIntegerField(
        "intervalo entre horários (min)", null=True, blank=True, validators=[MinValueValidator(5)],
        help_text="Vazio = usa o do serviço (ou o padrão do profissional). Preenchido vale só para esta faixa.")

    class Meta:
        ordering = ["weekday", "start_time"]
        verbose_name, verbose_name_plural = "horário de atendimento", "horários de atendimento"

    def clean(self):
        """Valida que o fim é posterior ao início."""
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError("O fim deve ser depois do início.")

    def __str__(self):
        """Texto no formato 'Dia HH:MM-HH:MM'."""
        return f"{self.get_weekday_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M}"


class Break(models.Model):
    """Pausa recorrente dentro do expediente (ex.: almoço); nenhum horário é oferecido nela."""

    professional = models.ForeignKey(Professional, on_delete=models.CASCADE, related_name="breaks")
    weekday = models.PositiveSmallIntegerField("dia da semana", choices=WEEKDAYS)
    start_time = models.TimeField("início")
    end_time = models.TimeField("fim")
    label = models.CharField("descrição", max_length=60, blank=True, help_text="Ex.: almoço")

    class Meta:
        ordering = ["weekday", "start_time"]
        verbose_name, verbose_name_plural = "intervalo (pausa)", "intervalos (pausas)"

    def clean(self):
        """Valida que o fim é posterior ao início."""
        if self.start_time and self.end_time and self.end_time <= self.start_time:
            raise ValidationError("O fim deve ser depois do início.")

    def __str__(self):
        """Texto no formato 'Dia HH:MM-HH:MM'."""
        return f"{self.get_weekday_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M}"


class Appointment(models.Model):
    """Reserva de um cliente com um profissional para um serviço.

    `end` não é informado: é calculado em `save()` pela duração do serviço.
    A empresa é a do profissional (`company`).
    """

    class Status(models.TextChoices):
        """Situações possíveis de um agendamento."""

        CONFIRMED = "confirmed", "Confirmado"
        COMPLETED = "completed", "Concluído"
        NO_SHOW = "no_show", "Não compareceu"
        CANCELED = "canceled", "Cancelado"

    professional = models.ForeignKey(Professional, on_delete=models.PROTECT, related_name="appointments", verbose_name="profissional")
    service = models.ForeignKey(Service, on_delete=models.PROTECT, related_name="appointments", verbose_name="serviço")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="appointments", verbose_name="cliente")
    start = models.DateTimeField("início")
    end = models.DateTimeField("fim", editable=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.CONFIRMED)
    notes = models.CharField("observações", max_length=255, blank=True)
    price = models.DecimalField("preço", max_digits=8, decimal_places=2, null=True, blank=True, editable=False,
                                help_text="Preço do serviço no momento do agendamento (base dos relatórios de receita).")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["start"]
        verbose_name, verbose_name_plural = "agendamento", "agendamentos"

    @property
    def company(self):
        """Empresa do agendamento (a do profissional)."""
        return self.professional.company

    def _offer(self):
        """Retorna o `ProfessionalService` (duração e preço) desta combinação, ou None se o profissional não realiza o serviço."""
        return ProfessionalService.objects.filter(professional=self.professional, service=self.service).first()

    def clean(self):
        """Validação usada pelo Django admin.

        Exige que profissional e serviço sejam da mesma empresa, que o profissional
        realize o serviço e que o horário esteja livre (dentro do expediente, fora de
        pausas e bloqueios, sem conflito).
        """
        from .slots import slot_is_free
        if not (self.professional_id and self.service_id and self.start):
            return
        if self.professional.company_id != self.service.company_id:
            raise ValidationError("Serviço e profissional precisam ser da mesma empresa.")
        offer = self._offer()
        if not offer:
            raise ValidationError("Este profissional não realiza este serviço.")
        if self.status != self.Status.CANCELED and not slot_is_free(self.professional, offer, self.start, exclude=self.pk):
            raise ValidationError("Horário fora do expediente, em pausa ou já ocupado.")

    def save(self, *args, **kwargs):
        """Calcula `end` a partir da duração do serviço, guarda o preço da época e grava."""
        offer = self._offer()
        if self.price is None and offer:
            self.price = offer.price  # congela o preço: mudar a tabela depois não altera o histórico
        # O fim vem sempre da duração definida para este profissional (30 min se faltar o vínculo).
        self.end = self.start + timedelta(minutes=offer.duration_minutes if offer else 30)
        super().save(*args, **kwargs)

    @property
    def google_calendar_url(self):
        """Link 'Adicionar ao Google Agenda' com o evento pré-preenchido.

        Usa o modelo de URL do Google Calendar; não depende da API do Google.
        """
        # O Google exige datas em UTC no formato AAAAMMDDTHHMMSSZ.
        fmt = lambda d: d.astimezone(dt_utc.utc).strftime("%Y%m%dT%H%M%SZ")
        company = self.company
        details = f"Profissional: {self.professional.name}"
        if self.notes:
            details += f"\n{self.notes}"
        params = {
            "action": "TEMPLATE",
            "text": f"{self.service.name} - {company.name}",
            "dates": f"{fmt(self.start)}/{fmt(self.end)}",
            "details": details,
        }
        location = ", ".join(p for p in (company.address, company.city) if p)
        if location:
            params["location"] = location
        return "https://calendar.google.com/calendar/render?" + urlencode(params)

    def __str__(self):
        """Texto no formato 'Cliente - Serviço - DD/MM HH:MM'."""
        return f"{self.customer} · {self.service} · {self.start:%d/%m %H:%M}"


class TimeOff(models.Model):
    """Bloqueio de datas inteiras: feriado (empresa toda) ou folga/férias (um profissional).

    Nesses dias nenhum horário é oferecido. Agendamentos já confirmados
    não são cancelados automaticamente.
    """

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="time_off", verbose_name="empresa")
    professional = models.ForeignKey(
        Professional, on_delete=models.CASCADE, null=True, blank=True, related_name="time_off",
        verbose_name="profissional", help_text="Deixe vazio para bloquear a empresa toda (ex.: feriado).")
    start_date = models.DateField("de")
    end_date = models.DateField("até")
    reason = models.CharField("motivo", max_length=120, blank=True)

    class Meta:
        ordering = ["start_date"]
        verbose_name, verbose_name_plural = "bloqueio de datas", "bloqueios de datas"

    def clean(self):
        """Valida datas (fim >= início) e que o profissional é da mesma empresa."""
        if self.start_date and self.end_date and self.end_date < self.start_date:
            raise ValidationError("A data final deve ser igual ou posterior à inicial.")
        if self.professional_id and self.company_id and self.professional.company_id != self.company_id:
            raise ValidationError("O profissional precisa ser da mesma empresa do bloqueio.")

    def __str__(self):
        """Texto no formato 'Profissional: início -> fim' ('Todos' quando vale para a empresa)."""
        return f"{self.professional or 'Todos'}: {self.start_date} → {self.end_date}"


class FavoriteCompany(models.Model):
    """Empresa preferida de um cliente.

    O cliente não vê todas as empresas: ele busca e adiciona as suas, e agenda a partir desta lista.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="favorite_companies", verbose_name="cliente")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="favorited_by", verbose_name="empresa")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [("user", "company")]
        verbose_name, verbose_name_plural = "empresa favorita", "empresas favoritas"

    def __str__(self):
        """Texto no formato 'usuário - Empresa'."""
        return f"{self.user} - {self.company}"


class AuditLog(models.Model):
    """Registro imutável de uma ação feita no sistema (quem, o quê, onde, quando).

    Só é criado por `audit.record()`; não há edição nem exclusão pela API e o Django admin só lê.
    Guarda também textos (`actor_label`, `company_label`, `target_label`) para o registro continuar legível
    mesmo se a pessoa, a empresa ou o item forem apagados depois.
    """

    created_at = models.DateTimeField("quando", auto_now_add=True, db_index=True)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
                              related_name="+", verbose_name="quem")
    actor_label = models.CharField(max_length=255, blank=True)
    action = models.CharField("ação", max_length=40, db_index=True)
    company = models.ForeignKey(Company, null=True, blank=True, on_delete=models.SET_NULL, related_name="+",
                                verbose_name="empresa")
    company_label = models.CharField(max_length=140, blank=True)
    target_type = models.CharField(max_length=40, blank=True)
    target_id = models.PositiveBigIntegerField(null=True, blank=True)
    target_label = models.CharField(max_length=255, blank=True)
    details = models.JSONField("detalhes", default=dict, blank=True)
    ip = models.GenericIPAddressField("IP", null=True, blank=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name, verbose_name_plural = "registro de auditoria", "log de auditoria"

    def __str__(self):
        """Texto no formato 'quando · quem · ação'."""
        return f"{self.created_at:%d/%m/%Y %H:%M} · {self.actor_label or 'anônimo'} · {self.action}"


class AuthSession(models.Model):
    """Sessão de login de um dispositivo. Substitui o token único e eterno.

    O token em si (devolvido só no login) nunca é guardado: gravamos apenas o hash SHA-256, então um vazamento
    do banco não entrega sessões utilizáveis. A sessão expira por inatividade e por idade máxima
    (`SESSION_IDLE_DAYS` e `SESSION_MAX_DAYS`) e pode ser encerrada: uma ou todas as do usuário.
    """

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="auth_sessions")
    key_hash = models.CharField(max_length=64, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used_at = models.DateTimeField(auto_now_add=True)
    user_agent = models.CharField(max_length=255, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)

    class Meta:
        verbose_name, verbose_name_plural = "sessão de login", "sessões de login"

    def __str__(self):
        """Texto no formato 'usuário · criada em'."""
        return f"{self.user} · {self.created_at:%d/%m/%Y %H:%M}"
