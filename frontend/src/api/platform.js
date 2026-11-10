/** Endpoints do painel do dono do software (exigem superusuário). */
import { del, download, get, post, request, toQuery } from "./client";

/**
 * Cadastra uma empresa (só o dono do software faz isso).
 * @param {{name: string, category?: string, city?: string, address?: string, description?: string, admin?: string}} body
 *   `admin` (opcional) é o usuário ou e-mail de quem vai administrar a empresa.
 */
export const createCompany = (body) => post("/platform/companies/", body);

/** Totais da plataforma e empresas mais ativas. */
export const getStats = () => get("/platform/stats/");

/** Empresas com totais e administradores. `filters`: q (busca), active ("true"/"false"). */
export const listCompanies = (filters = {}) => get(`/platform/companies/?${toQuery(filters)}`);

/** Ativa ou desativa uma empresa (desativada some da busca e não recebe agendamentos). */
export const setCompanyActive = (id, active) => patch(`/platform/companies/${id}/`, { active });

/** Dá acesso ao painel da empresa a um usuário (e-mail ou nome de usuário). */
export const addMember = (companyId, identifier) => post(`/platform/companies/${companyId}/members/`, { email: identifier });

/** Tira o acesso de um administrador à empresa. */
export const removeMember = (companyId, userId) => del(`/platform/companies/${companyId}/members/${userId}/`);

/** Usuários da plataforma. `q` busca por nome, e-mail ou nome de usuário. */
export const listUsers = (q = "", limit) => get(`/platform/users/?${toQuery({ q, ...(limit ? { limit } : {}) })}`);

/** Ativa ou desativa o acesso de um usuário. */
export const setUserActive = (id, active) => patch(`/platform/users/${id}/`, { is_active: active });

/** PATCH com corpo JSON. */
function patch(path, body) {
  return request(path, { method: "PATCH", body: JSON.stringify(body) });
}

/**
 * Altera o perfil de um usuário (só o admin geral).
 * @param {number} id Usuário.
 * @param {"client"|"company_admin"|"platform_admin"} role Novo perfil.
 * @param {string|number} [company] Estabelecimento, obrigatório ao tornar alguém administrador de estabelecimento.
 */
export const setUserRole = (id, role, company) =>
  patch(`/platform/users/${id}/`, { role, ...(role === "company_admin" && company ? { company: Number(company) } : {}) });

/**
 * Log de auditoria (só o admin geral), do mais recente ao mais antigo.
 * @param {{from?: string, to?: string, action?: string, company?: string, actor?: string, q?: string, page?: number, page_size?: number}} params
 *   `action` aceita um código (ex.: "appointment.cancel") ou um grupo (ex.: "appointment").
 */
export const getAudit = (params) => get(`/platform/audit/?${toQuery(params)}`);

/** Ações e empresas disponíveis para os filtros do log. */
export const getAuditOptions = () => get("/platform/audit/options/");

/** Baixa o log de auditoria em Excel (.xlsx) com os filtros atuais. */
export const exportAuditXlsx = (params) => download(`/platform/audit/export/?${toQuery(params)}`, "auditoria.xlsx");

/**
 * Cadastra um usuário já com o perfil escolhido (só o admin geral).
 * @param {{name: string, email: string, password: string, role: "client"|"company_admin"|"platform_admin", company?: string|number}} body
 *   `company` é obrigatório quando `role` é `company_admin`.
 */
export const createUser = ({ company, ...body }) =>
  post("/platform/users/", { ...body, ...(body.role === "company_admin" && company ? { company: Number(company) } : {}) });

/** Configurações globais da plataforma: `{ max_companies_per_user }` (0 = sem limite). */
export const getSettings = () => get("/platform/settings/");

/** Altera o máximo de empresas que um usuário pode cadastrar sozinho (0 = sem limite). */
export const saveSettings = (maxCompaniesPerUser) =>
  request("/platform/settings/", { method: "PUT", body: JSON.stringify({ max_companies_per_user: Number(maxCompaniesPerUser) }) });

/**
 * Altera dados de um usuário (só o admin geral): `name`, `email` (também é o login) e/ou `password` (redefine a senha).
 * Mudar e-mail ou senha de outra pessoa encerra as sessões dela.
 */
export const updateUser = (id, body) => patch(`/platform/users/${id}/`, body);
