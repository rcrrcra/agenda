"""Envio dos e-mails: confirmação e cancelamento (cliente) e avisos de novo/cancelado (administradores)."""

import logging
from django.core.mail import send_mail
from django.utils import timezone

log = logging.getLogger(__name__)


def _send(subject, body, to):
    """Envia um e-mail de texto simples sem nunca propagar erro de envio."""
    try:
        send_mail(subject, body, None, [to])  # None = usa DEFAULT_FROM_EMAIL
    except Exception:
        # Falha de e-mail não pode desfazer o agendamento: só registra no log.
        log.exception("Falha ao enviar e-mail para %s", to)


def _details(a):
    """Bloco de texto com serviço, profissional e data/hora no horário local."""
    when = timezone.localtime(a.start).strftime("%d/%m/%Y às %H:%M")
    return f"Empresa: {a.professional.company.name}\nServiço: {a.service.name}\nProfissional: {a.professional.name}\nQuando: {when}"


def send_confirmation(a):
    """Avisa o cliente que o agendamento foi confirmado (inclui o link do Google Agenda), se a empresa mantém esse aviso ligado."""
    if not a.professional.company.notify_customers:
        return
    name = a.customer.first_name or a.customer.email
    _send("Agendamento confirmado",
          f"Olá, {name}!\n\nSeu agendamento está confirmado.\n\n{_details(a)}\n\n"
          f"Adicionar ao Google Agenda:\n{a.google_calendar_url}\n", a.customer.email)


def send_cancellation(a):
    """Avisa o cliente que o agendamento foi cancelado."""
    if not a.professional.company.notify_customers:
        return
    name = a.customer.first_name or a.customer.email
    _send("Agendamento cancelado",
          f"Olá, {name}.\n\nSeu agendamento foi cancelado.\n\n{_details(a)}\n", a.customer.email)


def _admin_emails(company, actor=None):
    """E-mails dos administradores da empresa, sem repetir e sem quem fez a ação (ele já sabe)."""
    from .models import CompanyMember  # import tardio: evita dependência circular com models
    members = CompanyMember.objects.filter(company=company).select_related("user")
    return sorted({m.user.email.lower() for m in members
                   if m.user.email and (actor is None or m.user_id != actor.pk)})


def send_admin_notice(a, event, actor=None):
    """Avisa os administradores do estabelecimento que um agendamento entrou ou foi cancelado.

    `event` é "created" ou "canceled"; `actor` é quem fez a ação (não recebe o próprio aviso).
    Um e-mail por administrador, para que ninguém veja o endereço dos outros.
    """
    if not a.professional.company.notify_admins:
        return
    who = a.customer.first_name or a.customer.email
    when = timezone.localtime(a.start).strftime("%d/%m às %H:%M")
    title = "Novo agendamento" if event == "created" else "Agendamento cancelado"
    by = ""
    if event == "canceled":
        by = "\nCancelado por: " + ("o próprio cliente" if actor is not None and actor.pk == a.customer_id else "a equipe")
    body = (f"{title} em {a.professional.company.name}.\n\n{_details(a)}\n"
            f"Cliente: {who} ({a.customer.email}){by}\n")
    if a.notes:
        body += f"Observações: {a.notes}\n"
    for to in _admin_emails(a.professional.company, actor):
        _send(f"{title}: {who} — {when}", body, to)
