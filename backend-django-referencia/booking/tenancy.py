"""Escopo de empresa para o painel de administração.

O painel envia o cabeçalho `X-Company: <id>` indicando qual empresa está sendo
administrada. Toda view do painel passa por `resolve_company`, que confirma que o
usuário é membro dessa empresa; assim nenhuma empresa enxerga os dados de outra.
"""
from rest_framework import exceptions
from rest_framework.permissions import IsAuthenticated

from .models import CompanyMember

COMPANY_HEADER = "X-Company"


def resolve_company(request):
    """Devolve a empresa indicada no cabeçalho, se o usuário a administra.

    Levanta 400 se o cabeçalho faltar/for inválido e 403 se o usuário não for membro.
    """
    raw = request.headers.get(COMPANY_HEADER, "")
    if not raw.isdigit():
        raise exceptions.ParseError(f"Informe a empresa no cabeçalho {COMPANY_HEADER}.")
    member = CompanyMember.objects.select_related("company").filter(
        user=request.user, company_id=int(raw)).first()
    if member is None:
        raise exceptions.PermissionDenied("Você não administra esta empresa.")
    return member.company


class CompanyScopedMixin:
    """Mixin de viewset: exige login, resolve a empresa e a repassa aos serializers."""

    permission_classes = [IsAuthenticated]
    company = None

    def initial(self, request, *args, **kwargs):
        """Roda depois da autenticação e define `self.company` (ou interrompe com 400/403)."""
        super().initial(request, *args, **kwargs)
        self.company = resolve_company(request)

    def get_serializer_context(self):
        """Inclui a empresa no contexto para validações nos serializers."""
        return {**super().get_serializer_context(), "company": self.company}
