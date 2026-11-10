/** Formatação de valores simples. */

/** Preço como " · R$ 60,00"; texto vazio quando não há preço. */
export const money = (value) => (value == null ? "" : ` · R$ ${Number(value).toFixed(2).replace(".", ",")}`);

/** Corta "09:00:00" para "09:00" (formato do `<input type="time">`). */
export const hhmm = (time) => (time || "").slice(0, 5);
