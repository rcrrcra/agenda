"""App de agendamento: modelos, regras de horário, API e admin."""

from django.apps import AppConfig


class BookingConfig(AppConfig):
    """Configuração do app de agendamento."""

    name = "booking"

    def ready(self):
        """Registra os sinais que mantêm o índice de busca atualizado."""
        from . import signals  # noqa: F401
