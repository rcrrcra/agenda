import { DAYS } from "../../../utils/constants";
import { DEFAULT_BREAK, DEFAULT_HOURS, repeatMonday } from "./professionalFormState";
import TimeRangeList from "./TimeRangeList";

/**
 * Grade semanal: para cada dia, as faixas de atendimento e as pausas.
 *
 * @param {object} props
 * @param {object[]} props.workingHours Faixas de atendimento de todos os dias.
 * @param {object[]} props.breaks Pausas de todos os dias.
 * @param {(changes: {working_hours?: object[], breaks?: object[]}) => void} props.onChange
 */
export default function WeeklySchedule({ workingHours, breaks, onChange }) {
  return (
    <>
      <button type="button" className="link"
        onClick={() => onChange({ working_hours: repeatMonday(workingHours), breaks: repeatMonday(breaks) })}>
        Repetir segunda em terça a sexta
      </button>
      <p className="muted">
        O campo "grade" define de quantos em quantos minutos os horários são oferecidos naquela faixa.
        Vazio = usa o intervalo do serviço ou, se ele também estiver vazio, o padrão do profissional.
      </p>
      <div className="days">
        {DAYS.map((name, weekday) => (
          <div className="day" key={weekday}>
            <strong>{name}</strong>
            <TimeRangeList title="Atendimento" withSlot rows={workingHours} weekday={weekday} defaults={DEFAULT_HOURS}
              onChange={(rows) => onChange({ working_hours: rows })} />
            <TimeRangeList title="Pausas" withLabel rows={breaks} weekday={weekday} defaults={DEFAULT_BREAK}
              onChange={(rows) => onChange({ breaks: rows })} />
          </div>
        ))}
      </div>
    </>
  );
}
