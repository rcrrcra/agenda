/**
 * Funções puras que convertem entre o formato da API e o estado do formulário
 * de profissional (mantidas fora do componente para facilitar testes e leitura).
 */
import { hhmm } from "../../../utils/format";

/** Expediente padrão ao adicionar uma faixa de atendimento. */
/** `slot_minutes` vazio = usa o intervalo do serviço ou, na falta dele, o padrão do profissional. */
export const DEFAULT_HOURS = { start_time: "09:00", end_time: "18:00", slot_minutes: "" };
/** Pausa padrão ao adicionar um intervalo. */
export const DEFAULT_BREAK = { start_time: "12:00", end_time: "13:00", label: "Almoço" };

/**
 * Estado inicial de um profissional novo. O expediente já vem preenchido com o horário de
 * funcionamento da empresa (`openingHours`, no formato da API), que pode ser ajustado depois.
 */
export const blankProfessional = (openingHours = []) => ({
  name: "", bio: "", active: true, slot_minutes: 30, buffer_minutes: 0,
  offers: [], breaks: [],
  working_hours: openingHours.map((h) => ({ weekday: h.weekday, start_time: hhmm(h.start_time), end_time: hhmm(h.end_time), slot_minutes: "" })),
});

/** Corta os horários "09:00:00" da API para "09:00" (input type="time"). */
const trimTimes = (row) => ({ ...row, start_time: hhmm(row.start_time), end_time: hhmm(row.end_time) });

/** Intervalo opcional: "" (campo vazio, herda o padrão) ⇄ null na API. */
const slotToInput = (v) => v ?? "";
const slotToApi = (v) => (v === "" || v == null ? null : Number(v));

/** Converte o profissional vindo da API no estado editável do formulário. */
export const toFormState = (pro) => ({
  ...pro,
  offers: pro.offers.map((o) => ({ ...o, price: o.price ?? "", slot_minutes: slotToInput(o.slot_minutes) })), // vazio = "" no input
  working_hours: pro.working_hours.map((r) => ({ ...trimTimes(r), slot_minutes: slotToInput(r.slot_minutes) })),
  breaks: pro.breaks.map(trimTimes),
});

/** Converte o estado do formulário no corpo esperado pela API. */
export const toPayload = (form) => ({
  ...form,
  slot_minutes: Number(form.slot_minutes),
  buffer_minutes: Number(form.buffer_minutes),
  offers: form.offers
    .filter((o) => o.service) // ignora linhas sem serviço escolhido
    .map((o) => ({
      service: Number(o.service),
      duration_minutes: Number(o.duration_minutes),
      price: o.price === "" ? null : o.price,
      slot_minutes: slotToApi(o.slot_minutes),
    })),
  working_hours: form.working_hours.map((r) => ({ ...r, slot_minutes: slotToApi(r.slot_minutes) })),
});

/**
 * Copia as faixas da segunda-feira para terça a sexta, substituindo o que
 * já existia nesses dias. Sábado e domingo ficam intactos.
 * @param {{weekday: number}[]} rows Faixas de atendimento ou pausas.
 */
export const repeatMonday = (rows) => {
  const keep = rows.filter((r) => r.weekday === 0 || r.weekday >= 5);
  const monday = rows.filter((r) => r.weekday === 0);
  const copies = [1, 2, 3, 4].flatMap((weekday) => monday.map((r) => ({ ...r, weekday })));
  return [...keep, ...copies];
};
