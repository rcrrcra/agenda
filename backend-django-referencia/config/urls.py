"""Rotas principais: o admin do Django em /admin/ e a API em /api/."""

from django.conf import settings
from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include

urlpatterns = [path("api/", include("booking.urls"))]
if settings.ADMIN_ENABLED:   # com ADMIN_ENABLED=0 a rota nem existe (404)
    urlpatterns.insert(0, path("admin/", admin.site.urls))
if settings.DEBUG:  # em desenvolvimento o próprio Django serve as imagens enviadas
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
