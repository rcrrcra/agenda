/** Formatos de saída compartilhados (iguais aos serializers do DRF). */
import type { AuthUser } from "../common/types";
import { NotFoundException } from "@nestjs/common";
import { userRole } from "../common/roles";

export const companyOut = (c: { id: number; name: string; slug: string; category: string; city: string; description: string; address: string; active: boolean }) => ({
  id: c.id, name: c.name, slug: c.slug, category: c.category, city: c.city, description: c.description, address: c.address, active: c.active,
});

/** Usuário logado: perfil e empresas que administra (ordem alfabética). */
export const userOut = (u: AuthUser) => ({
  id: u.id,
  name: u.firstName,
  email: u.email,
  username: u.username,
  is_staff: u.isStaff,
  is_superuser: u.isSuperuser,
  role: userRole(u),
  companies: [...u.memberships]
    .sort((a, b) => a.company.name.localeCompare(b.company.name, "pt-BR"))
    .map((m) => ({ id: m.companyId, name: m.company.name, slug: m.company.slug })),
});

/** `Number(id)` de um parâmetro de rota; 404 quando não é número. */
export function idParam(raw: string): number {
  if (!/^\d+$/.test(raw)) throw new NotFoundException();
  return Number(raw);
}
