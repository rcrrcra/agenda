/** Formatadores de números para os relatórios (padrão brasileiro). `money` aqui devolve "R$ 1.250,00"; o de `format.js` é o do preço de serviço. */

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Valor em reais, ex.: "R$ 1.250,00" (vazio quando não há valor). */
export const money = (v) => (v === null || v === undefined ? "—" : BRL.format(v));

/** Percentual com uma casa, ex.: "75,0%" (vazio quando não se aplica). */
export const percent = (v) => (v === null || v === undefined ? "—" : `${v.toFixed(1).replace(".", ",")}%`);

/**
 * Variação em relação ao período anterior, para exibir nos indicadores.
 * @param {number} now Valor atual. @param {number} before Valor do período anterior.
 * @param {{goodWhenUp?: boolean}} [opts] `goodWhenUp: false` para métricas em que subir é ruim (faltas, cancelamentos).
 * @returns {{text: string, tone: "good"|"bad"|"flat"}|null} `null` quando não há base de comparação.
 */
export const deltaInfo = (now, before, { goodWhenUp = true } = {}) => {
  if (before === null || before === undefined || now === null || now === undefined) return null;
  if (now === before) return { text: "= igual ao anterior", tone: "flat" };
  const up = now > before;
  const pct = before === 0 ? "novo" : `${Math.abs(((now - before) / before) * 100).toFixed(0)}%`;
  return { text: `${up ? "▲" : "▼"} ${pct} vs. anterior`, tone: up === goodWhenUp ? "good" : "bad" };
};
