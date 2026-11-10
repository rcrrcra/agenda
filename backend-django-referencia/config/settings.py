"""Configurações do projeto.

Valores sensíveis vêm de variáveis de ambiente; os padrões servem apenas para desenvolvimento.
"""

import os
from pathlib import Path

from corsheaders.defaults import default_headers
BASE_DIR = Path(__file__).resolve().parent.parent

# Valores sensíveis vêm do ambiente; os padrões abaixo servem só para desenvolvimento.
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-troque-em-producao")
DEBUG = os.getenv("DEBUG", "1") == "1"
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "*").split(",")
# Django admin (/admin/): ligado no desenvolvimento; desligado por padrão em produção (Docker) e ligado só quando necessário.
ADMIN_ENABLED = os.getenv("ADMIN_ENABLED", "1" if DEBUG else "0") == "1"

INSTALLED_APPS = [
    "django.contrib.admin", "django.contrib.auth", "django.contrib.contenttypes",
    "django.contrib.sessions", "django.contrib.messages", "django.contrib.staticfiles",
    "rest_framework", "corsheaders", "booking",
]
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "config.middleware.TrustedProxyMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
]
ROOT_URLCONF = "config.urls"
TEMPLATES = [{
    "BACKEND": "django.template.backends.django.DjangoTemplates", "DIRS": [], "APP_DIRS": True,
    "OPTIONS": {"context_processors": [
        "django.template.context_processors.request",
        "django.contrib.auth.context_processors.auth",
        "django.contrib.messages.context_processors.messages"]},
}]
# Banco: SQLite no desenvolvimento; PostgreSQL quando POSTGRES_HOST está definido (Docker/produção).
if os.getenv("POSTGRES_HOST"):
    DATABASES = {"default": {
        "ENGINE": "django.db.backends.postgresql", "HOST": os.environ["POSTGRES_HOST"],
        "PORT": os.getenv("POSTGRES_PORT", "5432"), "NAME": os.getenv("POSTGRES_DB", "agenda"),
        "USER": os.getenv("POSTGRES_USER", "agenda"), "PASSWORD": os.getenv("POSTGRES_PASSWORD", ""),
        "CONN_MAX_AGE": 60}}
else:
    DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": BASE_DIR / "db.sqlite3"}}
# Datas são gravadas em UTC (USE_TZ) e exibidas em America/Sao_Paulo.
LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_TZ = True
STATIC_URL = "static/"
STATIC_ROOT = Path(os.getenv("STATIC_ROOT", BASE_DIR / "staticfiles"))  # `collectstatic` (Django admin) grava aqui
# Imagens enviadas (logo e fotos das empresas). Em produção sirva MEDIA_ROOT pelo Nginx ou use um storage (S3...).
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.getenv("MEDIA_ROOT", BASE_DIR / "media"))
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Regras de senha (cadastro e criação de usuários): mínimo de 8 caracteres, não comum, não só números.
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# API: autenticação por token e login obrigatório (cadastro/login desativam a autenticação).
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["booking.tokens.SessionTokenAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
}
# Sessões de login do app: expiram por inatividade e por idade máxima (em dias).
SESSION_IDLE_DAYS = int(os.getenv("SESSION_IDLE_DAYS", "14"))
SESSION_MAX_DAYS = int(os.getenv("SESSION_MAX_DAYS", "30"))
# Origens do frontend autorizadas a chamar a API.
CORS_ALLOWED_ORIGINS = os.getenv("FRONTEND_URL", "http://localhost:5173,http://127.0.0.1:5173").split(",")

# O painel envia X-Company; o navegador só aceita cabeçalhos customizados se listados aqui.
CORS_ALLOW_HEADERS = [*default_headers, "x-company"]

# E-mail: por padrão imprime no console. Para SMTP real, defina as variáveis abaixo.
EMAIL_BACKEND = os.getenv("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.getenv("EMAIL_HOST", "")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.getenv("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.getenv("EMAIL_USE_TLS", "1") == "1"
DEFAULT_FROM_EMAIL = os.getenv("DEFAULT_FROM_EMAIL", "Agendamento <agenda@localhost>")

# Atrás do Nginx (Docker): confia nos cabeçalhos do proxy para IP do cliente, HTTPS e origem do Django admin.
TRUST_PROXY = os.getenv("TRUST_PROXY", "0") == "1"
CSRF_TRUSTED_ORIGINS = [o for o in os.getenv("CSRF_TRUSTED_ORIGINS", "").split(",") if o]
if os.getenv("HTTPS", "0") == "1":
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True
