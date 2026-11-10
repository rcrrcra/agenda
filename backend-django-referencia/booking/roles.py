"""Perfis de usuário.

O perfil é DERIVADO dos dados (não há campo extra), então nunca fica inconsistente com as permissões:

- `platform_admin` (admin geral / dono do software): superusuário.
- `company_admin` (administrador de estabelecimento): administra ao menos uma empresa (`CompanyMember`).
- `client` (cliente): padrão de quem se cadastra; só consegue agendar.

Só o admin geral altera perfis (rotas `/api/platform/...`, protegidas por `IsPlatformOwner`).
"""
CLIENT = "client"
COMPANY_ADMIN = "company_admin"
PLATFORM_ADMIN = "platform_admin"
ROLES = (CLIENT, COMPANY_ADMIN, PLATFORM_ADMIN)
ROLE_LABELS = {CLIENT: "Cliente", COMPANY_ADMIN: "Administrador de estabelecimento", PLATFORM_ADMIN: "Admin geral"}


def user_role(user):
    """Perfil do usuário: `platform_admin`, `company_admin` ou `client`."""
    if user.is_superuser:
        return PLATFORM_ADMIN
    # `memberships` pode vir pré-carregado (prefetch) ou anotado; `.all()` aproveita o cache.
    if user.memberships.all():
        return COMPANY_ADMIN
    return CLIENT
