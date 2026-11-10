import { today } from "../../utils/date";
import { money } from "../../utils/format";
import Field from "../ui/Field";
import SlotPicker from "./SlotPicker";

/**
 * Campos de escolha de profissional, serviço, data e horário.
 * Puramente visual: o estado vem de `useBookingSelection`.
 * @param {{selection: ReturnType<typeof import("../../hooks/useBookingSelection").useBookingSelection>}} props
 */
export default function ScheduleFields({ selection }) {
  const { pros, current, proId, setProId, service, setService, date, setDate, slots, slot, setSlot } = selection;
  return (
    <>
      <div className="grid2">
        <Field label="Profissional">
          <select value={proId} onChange={(e) => setProId(e.target.value)}>
            {pros.map((p) => <option key={p.id} value={p.id}>{p.name}{p.bio ? ` — ${p.bio}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Serviço">
          <select value={service} onChange={(e) => setService(e.target.value)}>
            {current?.services.map((s) => (
              <option key={s.service} value={s.service}>{s.name} · {s.duration_minutes} min{money(s.price)}</option>
            ))}
          </select>
        </Field>
        <Field label="Data">
          <input type="date" min={today()} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <SlotPicker slots={slots} value={slot} onChange={setSlot} />
    </>
  );
}
