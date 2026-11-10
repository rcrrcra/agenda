import { STATUS_LABELS, STATUS_ORDER } from "../../utils/constants";

/** Legenda das cores das situações (concluído, confirmado, não compareceu, cancelado). */
export default function StatusLegend() {
  return (
    <ul className="legend" aria-label="Legenda">
      {STATUS_ORDER.map((k) => (
        <li key={k}><span className={`swatch bg-${k}`} aria-hidden="true" />{STATUS_LABELS[k]}</li>
      ))}
    </ul>
  );
}
