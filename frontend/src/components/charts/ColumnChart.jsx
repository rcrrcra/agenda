import { STATUS_LABELS, STATUS_ORDER } from "../../utils/constants";

const W = 640;         // largura do desenho (o SVG escala para a tela)
const H = 220;         // altura total
const PAD = { top: 10, right: 8, bottom: 26, left: 34 };
const MAX_LABELS = 8;  // no máximo este número de rótulos no eixo X, para não encavalar

/** Valor "redondo" acima do máximo, para o eixo Y (ex.: 7 → 8, 23 → 25). */
const niceMax = (v) => {
  if (v <= 4) return Math.max(v, 1);
  const step = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / step) * step;
};

/**
 * Gráfico de colunas empilhadas por situação (concluído, confirmado, não compareceu, cancelado).
 * Cada coluna tem tooltip (`<title>`) com os números; a tabela da página repete os mesmos dados.
 *
 * @param {object} props
 * @param {{label: string, total: number, completed: number, confirmed: number, no_show: number, canceled: number}[]} props.data
 *   Uma entrada por coluna; `label` é o texto do eixo X.
 * @param {(label: string) => string} [props.formatLabel] Formata o rótulo do eixo X e do tooltip.
 * @param {string} props.title Descrição curta (leitores de tela).
 */
export default function ColumnChart({ data, title, formatLabel = (l) => l }) {
  if (!data.length) return <p className="muted">Sem dados no período.</p>;
  const max = niceMax(Math.max(...data.map((d) => d.total), 1));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const slot = plotW / data.length;
  const barW = Math.max(2, Math.min(40, slot * 0.7));
  const y = (v) => PAD.top + plotH - (v / max) * plotH;
  const every = Math.ceil(data.length / MAX_LABELS);
  const ticks = [0, max / 2, max];

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="grid" />
          <text x={PAD.left - 6} y={y(t) + 4} textAnchor="end" className="axis">{Number.isInteger(t) ? t : t.toFixed(1)}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const x = PAD.left + slot * i + (slot - barW) / 2;
        let acc = 0;
        return (
          <g key={d.label}>
            <title>
              {`${formatLabel(d.label)}: ${d.total} atendimento(s)` +
                STATUS_ORDER.filter((k) => d[k]).map((k) => ` · ${STATUS_LABELS[k]}: ${d[k]}`).join("")}
            </title>
            {STATUS_ORDER.map((k) => {
              if (!d[k]) return null;
              const top = y(acc + d[k]);
              const h = y(acc) - top;
              acc += d[k];
              return <rect key={k} x={x} y={top} width={barW} height={h} className={`bar-${k}`} />;
            })}
            {i % every === 0 && (
              <text x={x + barW / 2} y={H - 8} textAnchor="middle" className="axis">{formatLabel(d.label)}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
