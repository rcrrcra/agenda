/** Endpoints de agendamento usados pelo cliente (e reaproveitados pela equipe). */
import { get, post, toQuery } from "./client";

/** Profissionais ativos de UMA empresa, cada um com seus serviços (duração e preço). */
export const getProfessionals = (company) => get(`/professionals/?${toQuery({ company })}`);

/**
 * Horários livres de um profissional para um serviço em uma data.
 * @param {string|number} professional ID do profissional.
 * @param {string|number} service ID do serviço.
 * @param {string} date Data no formato AAAA-MM-DD.
 * @param {boolean} [staff] Equipe da empresa: ignora a antecedência mínima ao listar.
 * @returns {Promise<{slots: string[]}>} Horários em ISO 8601.
 */
export const getSlots = (professional, service, date, staff = false) =>
  get(`/availability/?${toQuery({ professional, service, date, ...(staff ? { staff: 1 } : {}) })}`);

/** Cria um agendamento para o usuário logado. */
export const createAppointment = (body) => post("/appointments/", body);

/** Agendamentos do usuário logado. */
export const listMyAppointments = () => get("/appointments/");

/** Cancela um agendamento do usuário logado. */
export const cancelAppointment = (id) => post(`/appointments/${id}/cancel/`);

/** Avalia um atendimento concluído (nota 1 a 5, comentário opcional); pode ser refeita. Retorna o agendamento atualizado. */
export const reviewAppointment = (id, rating, comment = "") => post(`/appointments/${id}/review/`, { rating, comment });
