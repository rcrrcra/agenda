"""Configuração do Django admin (visão da plataforma, alternativa ao painel em React)."""
from django.contrib import admin
from . import audit
from .emails import send_admin_notice, send_cancellation
from .models import (Appointment, AuditLog, Break, Company, CompanyMember, FavoriteCompany, Professional,
                     ProfessionalService, Service, TimeOff, WorkingHours)

admin.site.site_header = "Painel de agendamentos"
admin.site.site_title = "Agendamentos"


class AuditAdminMixin:
    """Registra no log de auditoria as alterações e exclusões feitas pelo Django admin (além do histórico do próprio Django)."""

    def save_model(self, request, obj, form, change):
        """Salva e registra os campos alterados (ou a criação)."""
        super().save_model(request, obj, form, change)
        audit.record(request, "admin_site.change", target=obj, modelo=type(obj).__name__,
                     campos=sorted(form.changed_data) if change else "criação")

    def delete_model(self, request, obj):
        """Exclui e registra."""
        label, kind = str(obj), type(obj).__name__
        super().delete_model(request, obj)
        audit.record(request, "admin_site.delete", label=label, modelo=kind)

    def delete_queryset(self, request, queryset):
        """Exclusão em massa: registra cada item antes de apagar."""
        for obj in queryset:
            audit.record(request, "admin_site.delete", label=str(obj), modelo=type(obj).__name__)
        super().delete_queryset(request, queryset)


class MemberInline(admin.TabularInline):
    """Define quem administra a empresa, na própria tela da empresa."""

    model = CompanyMember
    extra = 1


class OfferInline(admin.TabularInline):
    """Edita os serviços do profissional na mesma tela."""

    model = ProfessionalService
    extra = 1


class HoursInline(admin.TabularInline):
    """Edita o expediente semanal do profissional na mesma tela."""

    model = WorkingHours
    extra = 1


class BreakInline(admin.TabularInline):
    """Edita as pausas do profissional na mesma tela."""

    model = Break
    extra = 0


@admin.register(Company)
class CompanyAdmin(AuditAdminMixin, admin.ModelAdmin):
    """Empresas da plataforma, com seus administradores."""

    list_display = ("name", "category", "city", "active", "created_at")
    list_filter = ("active", "category")
    search_fields = ("name", "slug", "city")
    inlines = [MemberInline]


@admin.register(Service)
class ServiceAdmin(AuditAdminMixin, admin.ModelAdmin):
    """Catálogo de serviços por empresa."""

    list_display = ("name", "company")
    list_filter = ("company",)
    search_fields = ("name",)


@admin.register(Professional)
class ProfessionalAdmin(AuditAdminMixin, admin.ModelAdmin):
    """Profissional com serviços, expediente e pausas em uma tela só."""

    list_display = ("name", "company", "active", "slot_minutes", "buffer_minutes")
    list_filter = ("company", "active")
    inlines = [OfferInline, HoursInline, BreakInline]


@admin.register(Appointment)
class AppointmentAdmin(AuditAdminMixin, admin.ModelAdmin):
    """Agendamentos com filtros, busca, navegação por data e ação de cancelamento."""

    list_display = ("start", "professional", "service", "customer", "status")
    list_filter = ("status", "professional__company", "professional", "service")
    date_hierarchy = "start"
    search_fields = ("customer__email", "customer__first_name")
    actions = ["cancel_selected"]

    @admin.action(description="Cancelar agendamentos selecionados (avisa o cliente por e-mail)")
    def cancel_selected(self, request, queryset):
        """Cancela os agendamentos selecionados e avisa cada cliente por e-mail."""
        n = 0
        for a in queryset.filter(status=Appointment.Status.CONFIRMED):
            a.status = Appointment.Status.CANCELED
            a.save(update_fields=["status"])
            send_cancellation(a)
            send_admin_notice(a, "canceled", actor=request.user)
            n += 1
        self.message_user(request, f"{n} agendamento(s) cancelado(s).")


@admin.register(TimeOff)
class TimeOffAdmin(AuditAdminMixin, admin.ModelAdmin):
    """Bloqueios de datas (feriados e folgas)."""

    list_display = ("company", "professional", "start_date", "end_date", "reason")
    list_filter = ("company", "professional")


@admin.register(FavoriteCompany)
class FavoriteCompanyAdmin(AuditAdminMixin, admin.ModelAdmin):
    """Empresas favoritas dos clientes (somente consulta/limpeza)."""

    list_display = ("user", "company", "created_at")
    list_filter = ("company",)


@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    """Log de auditoria: somente leitura (ninguém cria, altera ou apaga registros)."""

    list_display = ("created_at", "actor_label", "action", "company_label", "target_label", "ip")
    list_filter = ("action", "company")
    search_fields = ("actor_label", "target_label", "company_label", "ip")
    date_hierarchy = "created_at"

    def has_add_permission(self, request):
        """Registros só nascem pelo sistema."""
        return False

    def has_change_permission(self, request, obj=None):
        """Registros não são editáveis."""
        return False

    def has_delete_permission(self, request, obj=None):
        """Registros não são apagáveis."""
        return False
