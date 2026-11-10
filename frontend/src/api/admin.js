/** Endpoints do painel de administração (exigem usuário staff). */
import { crud, del, get, post, put, toQuery, upload } from "./client";

/** CRUD do catálogo de serviços. */
export const services = crud("admin/services");
/** CRUD de profissionais (com serviços, horários e pausas aninhados). */
export const professionals = crud("admin/professionals");
/** CRUD de bloqueios de datas (feriados e folgas). */
export const timeOff = crud("admin/time-off");

/** Lista agendamentos de todos os clientes. `filters`: from, to, professional, status (confirmed, completed, no_show, canceled ou pending = já passou e aguarda conclusão). */
export const listAppointments = (filters) => get(`/admin/appointments/?${toQuery(filters)}`);

/** Cria um agendamento em nome de um cliente (existente ou novo). */
export const createAppointment = (body) => post("/admin/appointments/", body);

/** Cancela qualquer agendamento (o cliente é avisado por e-mail). */
export const cancelAppointment = (id) => post(`/admin/appointments/${id}/cancel/`);

/** Marca o atendimento como concluído (só depois do horário de início). */
export const completeAppointment = (id) => post(`/admin/appointments/${id}/complete/`);

/** Marca que o cliente não compareceu (só depois do horário de início). */
export const noShowAppointment = (id) => post(`/admin/appointments/${id}/no-show/`);

/** Desfaz concluído/não compareceu e volta o agendamento para confirmado. */
export const reopenAppointment = (id) => post(`/admin/appointments/${id}/reopen/`);

/** Busca clientes por nome ou e-mail (máx. 10 resultados). */
export const searchCustomers = (q) => get(`/admin/customers/?q=${encodeURIComponent(q)}`);

/** Dados da empresa administrada (nome, categoria, endereço, ativa, slug). */
export const getCompany = () => get("/admin/company/");

/** Atualiza os dados da empresa administrada. */
export const updateCompany = (body) => put("/admin/company/", body);

/** Clientes da empresa com totais e alerta de faltas. `params`: q (nome/e-mail), flagged ("1" = só quem falta muito). */
export const listClients = (params) => get(`/admin/clients/?${toQuery(params)}`);

/** Histórico de um cliente NESTA empresa: totais, atendimentos e observações internas. */
export const getClient = (id) => get(`/admin/clients/${id}/`);

/** Salva as observações internas da empresa sobre o cliente (o cliente não vê). */
export const saveClientNotes = (id, notes) => put(`/admin/clients/${id}/`, { notes });

/** Envia o logo da empresa (arquivo de imagem). Retorna os dados da empresa atualizados. */
export const uploadLogo = (file) => upload("/admin/company/logo/", { image: file });

/** Remove o logo. */
export const removeLogo = () => del("/admin/company/logo/");

/** Adiciona uma foto à galeria (máx. 8). */
export const addPhoto = (file, caption = "") => upload("/admin/company/photos/", { image: file, caption });

/** Remove uma foto da galeria. */
export const removePhoto = (id) => del(`/admin/company/photos/${id}/`);
