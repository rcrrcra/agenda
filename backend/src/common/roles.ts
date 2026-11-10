/** Perfis derivados dos dados (superusuário / vínculo com empresa), nunca de um campo à parte. */
export const CLIENT = "client";
export const COMPANY_ADMIN = "company_admin";
export const PLATFORM_ADMIN = "platform_admin";
export const ROLES = [CLIENT, COMPANY_ADMIN, PLATFORM_ADMIN] as const;

export const userRole = (user: { isSuperuser: boolean; memberships?: unknown[] }): string =>
  user.isSuperuser ? PLATFORM_ADMIN : user.memberships && user.memberships.length ? COMPANY_ADMIN : CLIENT;
