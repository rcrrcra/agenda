/** Endpoints de empresas (barbearias, clínicas...) usados por qualquer usuário logado: busca e preferidas. O cadastro de empresas é só do dono (`api/platform`). */
import { del, get, post, toQuery } from "./client";

/**
 * Busca empresas ativas. Não existe listagem geral: o cliente pesquisa.
 * @param {{q?: string, slug?: string}} params `q` procura por nome da empresa, profissional,
 *   serviço, categoria ou endereço/cidade (sem diferenciar acentos); `slug` busca uma empresa exata.
 */
export const searchCompanies = (params) => get(`/companies/search/?${toQuery(params)}`);

/** Empresas preferidas do cliente. */
export const listFavorites = () => get("/favorites/");

/** Adiciona uma empresa às preferidas (repetir não duplica). */
export const addFavorite = (companyId) => post("/favorites/", { company: companyId });

/** Remove uma empresa das preferidas. */
export const removeFavorite = (companyId) => del(`/favorites/${companyId}/`);


/**
 * Cadastra uma empresa para o próprio usuário (ativa na hora; ele passa a administrá-la). Há um limite por usuário,
 * definido pelo admin geral; ao estourar, o servidor responde com a mensagem explicando.
 * @param {{name: string, category?: string, city?: string, address?: string, description?: string}} body
 * @returns {Promise<{id: number, name: string, slug: string, registered: number, limit: number}>}
 */
export const registerCompany = (body) => post("/companies/register/", body);
