"""Log de auditoria: registra quem fez o quê, em qual empresa e quando.

Uso: `record(request, "service.create", company=company, target=service, mudou={...})`. Cada chamada grava um
`AuditLog`. As ações conhecidas e seus textos estão em `ACTIONS`. Só o admin geral consulta (`platform.py`).

O que NUNCA é gravado: senhas, tokens e corpo de e-mails. Em tentativas de login falhas grava-se o texto digitado
no campo de usuário/e-mail (truncado) e o IP, para detectar tentativas de invasão.
"""
import datetime
from decimal import Decimal

from .models import AuditLog

#: código da ação -> texto exibido
ACTIONS = {
    "auth.login": "Entrou no sistema",
    "auth.login_failed": "Tentativa de login falhou",
    "auth.register": "Criou conta",
    "auth.login_blocked": "Login bloqueado por excesso de tentativas",
    "auth.logout": "Saiu do sistema",
    "auth.logout_all": "Saiu de todos os dispositivos",
    "company.create": "Cadastrou empresa",
    "company.self_create": "Cadastrou a própria empresa",
    "settings.update": "Alterou configurações da plataforma",
    "user.update": "Alterou dados de usuário",
    "company.update": "Alterou dados da empresa",
    "company.logo_update": "Trocou o logo da empresa",
    "company.logo_remove": "Removeu o logo da empresa",
    "company.photo_add": "Adicionou foto da empresa",
    "company.photo_remove": "Removeu foto da empresa",
    "review.save": "Avaliou um atendimento",
    "company.toggle_active": "Ativou/desativou empresa",
    "company.member_add": "Adicionou administrador à empresa",
    "company.member_remove": "Removeu administrador da empresa",
    "user.create": "Cadastrou usuário",
    "user.role_change": "Alterou perfil de usuário",
    "user.toggle_active": "Ativou/desativou usuário",
    "service.create": "Criou serviço",
    "service.update": "Alterou serviço",
    "service.delete": "Excluiu serviço",
    "professional.create": "Criou profissional",
    "professional.update": "Alterou profissional",
    "professional.delete": "Excluiu profissional",
    "timeoff.create": "Criou bloqueio de datas",
    "timeoff.update": "Alterou bloqueio de datas",
    "timeoff.delete": "Excluiu bloqueio de datas",
    "appointment.create": "Criou agendamento",
    "appointment.cancel": "Cancelou agendamento",
    "appointment.complete": "Concluiu atendimento",
    "appointment.no_show": "Marcou não compareceu",
    "appointment.reopen": "Reabriu agendamento",
    "client.notes_update": "Alterou observações de cliente",
    "favorite.add": "Adicionou empresa às preferidas",
    "favorite.remove": "Removeu empresa das preferidas",
    "report.export": "Exportou planilha de atendimentos",
    "audit.export": "Exportou o log de auditoria",
    "admin_site.change": "Alterou dados pelo Django admin",
    "admin_site.delete": "Excluiu dados pelo Django admin",
}


def _plain(value):
    """Valor em formato JSON seguro (datas e decimais viram texto; texto longo é cortado)."""
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, (datetime.date, datetime.time, Decimal)):
        return str(value)
    return str(value)[:200]


def snapshot(instance, validated_data):
    """Valores atuais dos campos simples que serão alterados; chame ANTES de salvar e compare depois com `diff`."""
    return {k: _plain(getattr(instance, k, None)) for k, v in validated_data.items()
            if not isinstance(v, (list, dict)) and hasattr(instance, k)}


def diff(before, instance, validated_data):
    """Detalhes para o log: `mudou` = campos simples que realmente mudaram (`{campo: [antes, depois]}`) e
    `alterou` = nomes dos campos aninhados reenviados (listas como horários ou serviços, sem detalhar o conteúdo)."""
    out = {k: [old, _plain(getattr(instance, k, None))] for k, old in before.items()
           if old != _plain(getattr(instance, k, None))}
    nested = sorted(k for k, v in validated_data.items() if isinstance(v, (list, dict)))
    return {"mudou": out, **({"alterou": nested} if nested else {})}


def _who(user):
    """Texto 'Nome <e-mail ou usuário>' de quem fez a ação."""
    if not user or not getattr(user, "is_authenticated", False):
        return ""
    return f"{user.first_name or user.username} <{user.email or user.username}>"[:255]


def _ip(request):
    """IP de origem da requisição (REMOTE_ADDR; atrás de proxy, configure o proxy para repassá-lo)."""
    return (request.META.get("REMOTE_ADDR") or None) if request is not None else None


def record(request, action, *, company=None, target=None, label="", actor=None, target_id=None, **details):
    """Grava uma ação no log.

    - `request`: requisição atual (IP e, por padrão, quem fez);
    - `action`: código de `ACTIONS`;
    - `company`: empresa afetada (opcional); `target`: objeto afetado (opcional) ou `label` com o texto;
    - `target_id`: id do alvo quando ele já foi apagado (o Django zera o `pk` ao excluir);
    - `actor`: quem fez, quando não é `request.user` (ex.: login/cadastro, em que ainda não há usuário autenticado);
    - `details`: informações extras (viram JSON).
    """
    assert action in ACTIONS, f"ação de auditoria desconhecida: {action}"
    actor = actor or (getattr(request, "user", None) if request is not None else None)
    actor = actor if actor is not None and getattr(actor, "is_authenticated", False) else None
    return AuditLog.objects.create(
        actor=actor, actor_label=_who(actor), action=action,
        company=company, company_label=str(company)[:140] if company else "",
        target_type=type(target).__name__ if target is not None else "",
        target_id=target_id or getattr(target, "pk", None), target_label=(label or (str(target) if target is not None else ""))[:255],
        details={k: _plain(v) if not isinstance(v, (dict, list)) else v for k, v in details.items()}, ip=_ip(request))


def summary(log):
    """Resumo legível de uma linha para a tela (alvo e principais detalhes)."""
    d, parts = log.details or {}, []
    if log.target_label:
        parts.append(log.target_label)
    for field, (old, new) in (d.get("mudou") or {}).items():
        parts.append(f"{field}: {old!r} → {new!r}")
    if d.get("alterou"):
        parts.append("reenviou: " + ", ".join(d["alterou"]))
    for key in ("de", "para", "perfil", "empresa", "motivo", "identificador", "quem", "resultado", "linhas", "filtros", "periodo", "caracteres", "origem", "modelo", "campos", "segundos", "sessoes", "nota", "senha", "limite", "cadastradas"):
        if key in d:
            parts.append(f"{key}: {d[key]}")
    return " · ".join(parts)
