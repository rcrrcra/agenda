/**
 * Cliente HTTP base da aplicação.
 *
 * Centraliza a URL da API, o token de autenticação e o tratamento de erros.
 * Os módulos `auth`, `booking` e `admin` apenas descrevem os endpoints.
 */

/** URL base da API (configurável em `.env` por VITE_API_URL). */
const BASE = import.meta.env.VITE_API_URL || "/api";

const TOKEN_KEY = "agenda_token";

/** Empresa administrada no momento; enviada no cabeçalho X-Company das chamadas `/admin/`. */
let activeCompanyId = null;

/** Define a empresa do painel (use `null` ao sair). */
export const setActiveCompany = (id) => { activeCompanyId = id; };

/** Evento disparado quando o servidor recusa o token (sessão expirada). */
export const LOGOUT_EVENT = "agenda:logout";

/** Acesso ao token de autenticação guardado no navegador. */
export const token = {
  get: () => localStorage.getItem(TOKEN_KEY), // lê o token salvo (ou null)
  set: (value) => localStorage.setItem(TOKEN_KEY, value), // guarda após login/cadastro
  clear: () => localStorage.removeItem(TOKEN_KEY), // remove ao sair
};

/**
 * Achata qualquer formato de erro do DRF (texto, lista ou objeto aninhado)
 * em uma lista de mensagens legíveis.
 * @param {unknown} x Corpo de erro retornado pela API.
 * @returns {string[]}
 */
const flatten = (x) =>
  typeof x === "string" ? [x]
  : Array.isArray(x) ? x.flatMap(flatten)
  : x && typeof x === "object" ? Object.values(x).flatMap(flatten)
  : [];

/**
 * Faz uma requisição JSON autenticada.
 * @param {string} path Caminho relativo à URL base (ex.: "/services/").
 * @param {RequestInit} [options] Opções do fetch (método, corpo…).
 * @returns {Promise<any>} Corpo da resposta já convertido de JSON.
 * @throws {Error} Com a mensagem do servidor quando a resposta não é 2xx.
 */
export async function request(path, options = {}) {
  const t = token.get();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      // FormData (envio de imagens): o navegador define o Content-Type com o separador correto.
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(t ? { Authorization: `Token ${t}` } : {}),
      // Só o painel precisa saber qual empresa está sendo administrada.
      ...(activeCompanyId && path.startsWith("/admin/") ? { "X-Company": String(activeCompanyId) } : {}),
    },
  });
  // DELETE responde 204 sem corpo, por isso o parse tolerante a falhas.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // 401 com token salvo = sessão expirada: limpa e avisa o app para voltar ao login.
    if (res.status === 401 && t) {
      token.clear();
      window.dispatchEvent(new Event(LOGOUT_EVENT));
    }
    throw new Error(data.detail || flatten(data).join(" ") || "Erro inesperado.");
  }
  return data;
}

/**
 * Baixa um arquivo (ex.: planilha CSV) de um endpoint autenticado e o entrega ao navegador.
 * O link direto não serve porque o token vai no cabeçalho, não na URL.
 * @param {string} path Caminho relativo à URL base.
 * @param {string} fallbackName Nome do arquivo se o servidor não informar um.
 */
export async function download(path, fallbackName) {
  const t = token.get();
  const res = await fetch(BASE + path, { headers: t ? { Authorization: `Token ${t}` } : {} });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || flatten(data).join(" ") || "Não foi possível gerar o arquivo.");
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** GET simples. */
export const get = (path) => request(path);
/** POST com corpo JSON. */
export const post = (path, body = {}) => request(path, { method: "POST", body: JSON.stringify(body) });
/** PUT com corpo JSON. */
export const put = (path, body = {}) => request(path, { method: "PUT", body: JSON.stringify(body) });
/** POST de arquivos: `fields` vira `multipart/form-data` (ex.: `{ image: file }`). */
export const upload = (path, fields) => {
  const body = new FormData();
  Object.entries(fields).forEach(([k, v]) => v != null && body.append(k, v));
  return request(path, { method: "POST", body });
};
/** DELETE. */
export const del = (path) => request(path, { method: "DELETE" });

/** Converte um objeto em query string (ex.: {a: 1} → "a=1"). */
export const toQuery = (params) => new URLSearchParams(params).toString();

/**
 * Gera as operações CRUD padrão de um recurso REST.
 * @param {string} base Caminho do recurso, sem barras (ex.: "admin/services").
 * @returns {{list: Function, create: Function, update: Function, remove: Function}}
 */
export const crud = (base) => ({
  list: () => get(`/${base}/`),
  create: (body) => post(`/${base}/`, body),
  update: (id, body) => put(`/${base}/${id}/`, body),
  remove: (id) => del(`/${base}/${id}/`),
});
