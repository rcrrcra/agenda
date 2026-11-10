import { fmtTime } from "../../utils/date";

/**
 * Grade de horários livres para escolher um.
 * @param {{slots: string[], value: string, onChange: (slot: string) => void}} props
 *   `slots` em ISO 8601; `value` é o horário escolhido (ou "").
 */
export default function SlotPicker({ slots, value, onChange }) {
  return (
    <fieldset>
      <legend>Horário</legend>
      {slots.length === 0 ? (
        <p className="muted">Sem horários livres nesta data. Tente outro dia.</p>
      ) : (
        <div className="slots">
          {slots.map((s) => (
            <button type="button" key={s} className={s === value ? "slot on" : "slot"} onClick={() => onChange(s)}>
              {fmtTime(s)}
            </button>
          ))}
        </div>
      )}
    </fieldset>
  );
}
