/** Busca de empresas: texto normalizado (sem acento, minúsculo) mantido em `companies.search_text`. */
import { Db } from "./prisma.service";

export const MIN_QUERY_LENGTH = 2;
export const MAX_TERMS = 6;
export const SEARCH_LIMIT = 20;

export const normalize = (text: string): string =>
  (text ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Recalcula `search_text` da empresa (nome, categoria, cidade, endereço, descrição, serviços e profissionais ativos). */
export async function refreshSearchText(db: Db, companyId: number): Promise<void> {
  const c = await db.company.findUnique({
    where: { id: companyId },
    include: { services: { select: { name: true } }, professionals: { where: { active: true }, select: { name: true } } },
  });
  if (!c) return;
  const parts = [c.name, c.category, c.city, c.address, c.description, ...c.services.map((s) => s.name), ...c.professionals.map((p) => p.name)];
  await db.company.update({ where: { id: companyId }, data: { searchText: normalize(parts.filter(Boolean).join(" | ")) } });
}

/** Termos da busca (até MAX_TERMS, normalizados) ou `[]` se a busca for curta demais. */
export function searchTerms(query: string): string[] {
  const terms = (query || "").split(/\s+/).filter(Boolean).slice(0, MAX_TERMS).map(normalize).filter(Boolean);
  return terms.join("").length < MIN_QUERY_LENGTH ? [] : terms;
}

/** Slug como o `slugify` do Django. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^\w\s-]/g, "").trim()
    .replace(/[-\s]+/g, "-").replace(/^[-_]+|[-_]+$/g, "");
}

/** Slug único: acrescenta -2, -3... se já existir. */
export async function uniqueSlug(db: Db, name: string): Promise<string> {
  const base = (slugify(name) || "empresa").slice(0, 120);
  let slug = base;
  for (let n = 2; await db.company.findUnique({ where: { slug } }); n++) slug = `${base}-${n}`;
  return slug;
}
