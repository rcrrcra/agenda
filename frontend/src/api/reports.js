/** Endpoints de relatórios (admin geral e administradores de estabelecimento). */
import { download, get, toQuery } from "./client";

/**
 * Filtros aceitos por todas as chamadas: from, to (AAAA-MM-DD), company, professional, service
 * (ids separados por vírgula) e status (confirmed, completed, no_show, canceled, pending).
 * @typedef {Object<string, string>} ReportFilters
 */

/** Empresas, profissionais e serviços disponíveis para filtrar (já limitados ao escopo do usuário). */
export const getOptions = () => get("/reports/options/");

/** Totais, evolução no período e rankings (por profissional, serviço, empresa e dia da semana). */
export const getSummary = (filters) => get(`/reports/summary/?${toQuery(filters)}`);

/** Tabela de atendimentos. Além dos filtros: `ordering` (ex.: "-start"), `page` e `page_size`. */
export const listAppointments = (params) => get(`/reports/appointments/?${toQuery(params)}`);

/** Baixa a planilha (CSV, abre no Excel) com os atendimentos filtrados. */
export const exportCsv = (filters) => download(`/reports/export/?${toQuery(filters)}`, "atendimentos.csv");

/** Baixa o relatório em Excel (.xlsx): resumo, profissionais, serviços e atendimentos. */
export const exportXlsx = (filters) => download(`/reports/export-xlsx/?${toQuery(filters)}`, "atendimentos.xlsx");
