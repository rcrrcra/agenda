"""Limite de tentativas de login (bloqueio temporário), baseado no log de auditoria.

Cada login falho já é gravado em `AuditLog` (`auth.login_failed`, com o texto digitado e o IP). Aqui só contamos:

- `MAX_FAILS` falhas para o MESMO usuário/e-mail na janela de `WINDOW` (e depois do último login bem-sucedido dele)
  bloqueiam novas tentativas dessa conta até a janela passar;
- `MAX_FAILS_IP` falhas do MESMO IP na janela bloqueiam aquele IP (valor maior, porque redes compartilham IP).

Enquanto bloqueado, até a senha certa é recusada (429), sem revelar se a conta existe. Efeito colateral conhecido:
alguém pode travar a conta de outra pessoa por até `WINDOW` errando de propósito; o bloqueio nunca é permanente.
"""
from datetime import timedelta

from django.db.models import Max
from django.utils import timezone

from .models import AuditLog

WINDOW = timedelta(minutes=15)
MAX_FAILS = 5
MAX_FAILS_IP = 30


def normalize(ident):
    """Forma usada para comparar identificadores digitados (minúsculas, sem espaços, até 150 caracteres)."""
    return str(ident or "").strip().lower()[:150]


def retry_after(ident, ip, candidate_ids):
    """Segundos até poder tentar de novo, ou 0 se não está bloqueado.

    `candidate_ids` são os usuários que casam com o identificador (para zerar a contagem após um login certo).
    """
    now = timezone.now()
    fails = AuditLog.objects.filter(action="auth.login_failed", created_at__gte=now - WINDOW)
    last_ok = AuditLog.objects.filter(action="auth.login", actor_id__in=candidate_ids).aggregate(m=Max("created_at"))["m"]
    by_account = fails.filter(details__identificador=normalize(ident))
    if last_ok:
        by_account = by_account.filter(created_at__gt=last_ok)
    wait = 0
    for qs, limit in ((by_account, MAX_FAILS), (fails.filter(ip=ip) if ip else fails.none(), MAX_FAILS_IP)):
        recent = list(qs.order_by("-created_at").values_list("created_at", flat=True)[:limit])
        if len(recent) >= limit:
            wait = max(wait, int((recent[-1] + WINDOW - now).total_seconds()) + 1)  # libera quando a falha mais antiga sai da janela
    return max(wait, 0)
