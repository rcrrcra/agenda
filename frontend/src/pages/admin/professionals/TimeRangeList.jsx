import { removeAt, updateAt } from "../../../utils/lists";

/**
 * Faixas de horário (início–fim) de UM dia da semana, sobre a lista completa.
 * Usada tanto para expediente quanto para pausas (com descrição opcional).
 *
 * @param {object} props
 * @param {string} props.title Título da seção ("Atendimento", "Pausas").
 * @param {{weekday: number, start_time: string, end_time: string, label?: string}[]} props.rows
 *   Faixas de TODOS os dias; este componente só exibe as do `weekday`.
 * @param {number} props.weekday Dia exibido (0 = segunda).
 * @param {object} props.defaults Valores da faixa criada por "+ Adicionar".
 * @param {(rows: object[]) => void} props.onChange Recebe a lista completa atualizada.
 * @param {boolean} [props.withLabel] Exibe o campo de descrição (pausas).
 * @param {boolean} [props.withSlot] Exibe o intervalo entre horários da faixa (atendimento);
 *   vazio = usa o do serviço ou o padrão do profissional.
 */
export default function TimeRangeList({ title, rows, weekday, defaults, onChange, withLabel = false, withSlot = false }) {
  return (
    <div className="ranges">
      <span className="muted">{title}</span>
      {rows.map((row, i) => row.weekday !== weekday ? null : (
        // o índice `i` refere-se à lista completa, por isso o update/remove usa `rows`
        <div className="rangeRow" key={i}>
          <input type="time" required aria-label="Início" value={row.start_time}
            onChange={(e) => onChange(updateAt(rows, i, { start_time: e.target.value }))} />
          <span>às</span>
          <input type="time" required aria-label="Fim" value={row.end_time}
            onChange={(e) => onChange(updateAt(rows, i, { end_time: e.target.value }))} />
          {withLabel && (
            <input placeholder="Descrição" aria-label="Descrição da pausa" value={row.label || ""}
              onChange={(e) => onChange(updateAt(rows, i, { label: e.target.value }))} />
          )}
          {withSlot && (
            <input type="number" min="5" step="5" placeholder="grade" aria-label="Intervalo entre horários neste dia (min)"
              title="Intervalo entre horários nesta faixa (vazio = padrão do serviço)" value={row.slot_minutes ?? ""}
              onChange={(e) => onChange(updateAt(rows, i, { slot_minutes: e.target.value }))} />
          )}
          <button type="button" aria-label="Remover" onClick={() => onChange(removeAt(rows, i))}>×</button>
        </div>
      ))}
      <button type="button" className="link" onClick={() => onChange([...rows, { weekday, ...defaults }])}>+ Adicionar</button>
    </div>
  );
}
