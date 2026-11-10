"""Sessões de login com expiração (autenticação por token do app).

- `start_session(request, user)` cria a sessão e devolve o token (único momento em que ele existe em texto);
- `SessionTokenAuthentication` valida o cabeçalho `Authorization: Token <token>`;
- a sessão vale enquanto o usuário estiver ativo, usada nos últimos `SESSION_IDLE_DAYS` dias e criada há menos de
  `SESSION_MAX_DAYS` dias (configuráveis por variável de ambiente).
"""
import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import AuthSession

TOUCH_EVERY = timedelta(minutes=5)  # evita gravar `last_used_at` a cada requisição


def hash_key(key):
    """SHA-256 do token (é o que fica no banco)."""
    return hashlib.sha256(key.encode()).hexdigest()


def start_session(request, user):
    """Cria uma sessão para o usuário neste dispositivo e devolve o token em texto."""
    key = secrets.token_hex(24)
    AuthSession.objects.create(
        user=user, key_hash=hash_key(key), ip=request.META.get("REMOTE_ADDR") or None,
        user_agent=request.META.get("HTTP_USER_AGENT", "")[:255])
    return key


def is_expired(session, now=None):
    """True se a sessão passou do limite de inatividade ou da idade máxima."""
    now = now or timezone.now()
    return (now - session.last_used_at > timedelta(days=settings.SESSION_IDLE_DAYS)
            or now - session.created_at > timedelta(days=settings.SESSION_MAX_DAYS))


class SessionTokenAuthentication(BaseAuthentication):
    """Autentica pelo token de sessão; sessões expiradas são apagadas e recusadas (401)."""

    keyword = b"token"

    def authenticate(self, request):
        """Devolve `(usuário, sessão)` ou None se não houver cabeçalho; levanta 401 se o token não vale."""
        parts = get_authorization_header(request).split()
        if not parts or parts[0].lower() != self.keyword:
            return None
        if len(parts) != 2:
            raise AuthenticationFailed("Cabeçalho de autorização inválido.")
        session = AuthSession.objects.select_related("user").filter(key_hash=hash_key(parts[1].decode(errors="ignore"))).first()
        if session is None:
            raise AuthenticationFailed("Sessão inválida. Entre novamente.")
        if not session.user.is_active:
            raise AuthenticationFailed("Usuário desativado.")
        now = timezone.now()
        if is_expired(session, now):
            session.delete()
            raise AuthenticationFailed("Sessão expirada. Entre novamente.")
        if now - session.last_used_at > TOUCH_EVERY:
            AuthSession.objects.filter(pk=session.pk).update(last_used_at=now)
        return session.user, session

    def authenticate_header(self, request):
        """Faz o DRF responder 401 (e não 403) quando a autenticação falha."""
        return "Token"
