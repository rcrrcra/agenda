/**
 * Nota em estrelas. Somente leitura (`value`) ou editável (`onChange`).
 * @param {{value: number|null, onChange?: (n: number) => void, label?: string}} props
 */
export default function Stars({ value, onChange, label = "Nota" }) {
  const v = Math.round(value || 0);
  if (!onChange) {
    return <span className="stars" role="img" aria-label={`${label}: ${value ?? "sem nota"}`}>{"★".repeat(v)}{"☆".repeat(5 - v)}</span>;
  }
  return (
    <span className="stars edit" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={n === v} aria-label={`${n} de 5`}
          className={n <= v ? "on" : ""} onClick={() => onChange(n)}>{n <= v ? "★" : "☆"}</button>
      ))}
    </span>
  );
}
