import { STATUS_LABELS, STATUS_ORDER } from "../../utils/constants";

/**
 * Ranking em barras horizontais empilhadas por situação (ex.: atendimentos por profissional).
 * O comprimento é proporcional ao total da maior linha.
 *
 * @param {object} props
 * @param {{label: string, company?: string, total: number}[]} props.rows Linhas já ordenadas (maior primeiro);
 *   cada uma traz as contagens `completed`, `confirmed`, `no_show` e `canceled`.
 * @param {boolean} [props.showCompany] Mostra o nome da empresa sob o rótulo (útil quando há várias).
 */
export default function RankBars({ rows, showCompany = false }) {
  if (!rows.length) return <p className="muted">Sem dados no período.</p>;
  const max = Math.max(...rows.map((r) => r.total), 1);
  return (
    <ul className="rank">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`}>
          <div className="rankLabel">
            <span>{r.label}</span>
            {showCompany && r.company && <span className="muted">{r.company}</span>}
          </div>
          <div className="rankBar" title={STATUS_ORDER.filter((k) => r[k]).map((k) => `${STATUS_LABELS[k]}: ${r[k]}`).join(" · ")}>
            {STATUS_ORDER.map((k) => r[k] > 0 && (
              <span key={k} className={`bg-${k}`} style={{ width: `${(r[k] / max) * 100}%` }} />
            ))}
          </div>
          <span className="rankTotal">{r.total}</span>
        </li>
      ))}
    </ul>
  );
}
