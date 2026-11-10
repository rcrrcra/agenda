/** Funções de data e hora (fuso e formato brasileiros). */

/** Data de hoje no fuso local, como AAAA-MM-DD (valor de `<input type="date">`). */
export const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

/** Hora de um instante ISO, ex.: "09:30". */
export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/** Data e hora de um instante ISO, ex.: "30/09/2026 09:30". */
export const fmtDateTime = (iso) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Título de um dia, ex.: "quarta-feira, 30/09". */
export const fmtDayHeading = (iso) =>
  new Date(iso).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });

/** Formata AAAA-MM-DD como DD/MM/AAAA (meio-dia evita virar o dia por fuso). */
export const fmtDate = (ymd) => new Date(`${ymd}T12:00:00`).toLocaleDateString("pt-BR");

/** Intervalo de datas: "10/10/2026" (um dia) ou "10/10/2026 a 12/10/2026". */
export const fmtDateRange = (start, end) =>
  start === end ? fmtDate(start) : `${fmtDate(start)} a ${fmtDate(end)}`;

/** Soma `n` dias (pode ser negativo) a uma data AAAA-MM-DD. */
export const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Primeiro dia do mês de uma data AAAA-MM-DD. */
export const startOfMonth = (ymd) => `${ymd.slice(0, 8)}01`;

/** Rótulo de um ponto do gráfico de evolução: "10/10" (dia) ou "10/2026" (mês). */
export const fmtPeriodLabel = (ymd, granularity) =>
  granularity === "month" ? `${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
