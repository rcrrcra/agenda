/** Funções puras do calendário da agenda (semana/dia): datas, faixa de horas e posição dos eventos. */
import { addDays } from "./date";

/** Segunda-feira da semana de uma data AAAA-MM-DD. */
export const weekStart = (ymd) => {
  const wd = (new Date(`${ymd}T12:00:00`).getDay() + 6) % 7; // 0 = segunda
  return addDays(ymd, -wd);
};

/** Dia local (AAAA-MM-DD) de um instante ISO. */
export const localDay = (iso) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

/** Minutos desde 00:00 (hora local) de um instante ISO. */
export const minutesOfDay = (iso) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

/** Faixa de horas exibida: 8h–19h por padrão, ampliada para caber todos os eventos. Retorna `[início, fim]` em horas. */
export const hourRange = (events) => {
  let lo = 8, hi = 19;
  events.forEach((e) => {
    lo = Math.min(lo, Math.floor(minutesOfDay(e.start) / 60));
    hi = Math.max(hi, Math.ceil(Math.max(minutesOfDay(e.end), minutesOfDay(e.start) + 15) / 60));
  });
  return [lo, Math.min(hi, 24)];
};

/**
 * Posiciona os eventos de UMA coluna. Eventos que se sobrepõem ficam lado a lado (faixas).
 * @returns {Array<object>} Os eventos com `top` e `height` (em minutos a partir de `startHour`), `lane` e `lanes`.
 */
export const layoutEvents = (events, startHour) => {
  const sorted = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));
  const out = [];
  let group = [], groupEnd = -1;
  const flush = () => { group.forEach((e) => { e.lanes = Math.max(...group.map((g) => g.lane)) + 1; }); out.push(...group); group = []; };
  sorted.forEach((e) => {
    const s = minutesOfDay(e.start), end = Math.max(minutesOfDay(e.end), s + 15);
    if (group.length && s >= groupEnd) { flush(); groupEnd = -1; }
    const used = new Set(group.filter((g) => g.endMin > s).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane += 1;
    group.push({ ...e, top: s - startHour * 60, height: end - s, endMin: end, lane });
    groupEnd = Math.max(groupEnd, end);
  });
  flush();
  return out;
};
