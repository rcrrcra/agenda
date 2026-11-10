"""Rotas da API.

O router registra os viewsets; os caminhos avulsos tratam autenticação,
disponibilidade, busca de clientes, dados da empresa no painel e visão geral do dono do software.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from . import clients, company_profile, platform, reports, views

router = DefaultRouter()
router.register("companies", views.CompanyViewSet, basename="company")
router.register("favorites", views.FavoriteViewSet, basename="favorite")
router.register("professionals", views.ProfessionalViewSet, basename="professional")
router.register("admin/services", views.AdminServiceViewSet, basename="admin-service")
router.register("admin/professionals", views.AdminProfessionalViewSet, basename="admin-professional")
router.register("admin/time-off", views.AdminTimeOffViewSet, basename="admin-time-off")
router.register("admin/appointments", views.AdminAppointmentViewSet, basename="admin-appointment")
router.register("appointments", views.AppointmentViewSet, basename="appointment")
router.register("platform/companies", platform.PlatformCompanyViewSet, basename="platform-company")
router.register("platform/users", platform.PlatformUserViewSet, basename="platform-user")
urlpatterns = [
    path("auth/register/", views.register),
    path("auth/login/", views.login),
    path("auth/logout/", views.logout),
    path("auth/logout-all/", views.logout_all),
    path("auth/me/", views.me),
    path("availability/", views.availability),
    path("admin/customers/", views.customers),
    path("admin/clients/", clients.clients),
    path("admin/clients/<int:pk>/", clients.client_detail),
    path("admin/company/", company_profile.company_settings),
    path("admin/company/logo/", company_profile.company_logo),
    path("admin/company/photos/", company_profile.company_photo_add),
    path("admin/company/photos/<int:pk>/", company_profile.company_photo_remove),
    path("public/companies/<slug:slug>/", company_profile.public_company),
    path("companies/register/", company_profile.register_company),
    path("platform/settings/", platform.platform_settings),
    path("platform/stats/", platform.stats),
    path("platform/audit/", platform.audit_log),
    path("platform/audit/export/", platform.audit_export_xlsx),
    path("platform/audit/options/", platform.audit_options),
    path("reports/options/", reports.options),
    path("reports/summary/", reports.summary),
    path("reports/appointments/", reports.appointments),
    path("reports/export/", reports.export),
    path("reports/export-xlsx/", reports.export_xlsx),
    path("", include(router.urls)),
]
