import Field from "../../../components/ui/Field";

/**
 * Filtros da agenda: período, profissional e situação.
 * @param {object} props
 * @param {{from: string, to: string, professional: string, status: string}} props.filters
 * @param {(filters: object) => void} props.onChange Recebe o novo objeto de filtros.
 * @param {{id: number, name: string}[]} props.professionals Opções do seletor.
 */
export default function AgendaFilters({ filters, onChange, professionals }) {
  /** Cria um handler que altera um único filtro. */
  const set = (key) => (e) => onChange({ ...filters, [key]: e.target.value });
  return (
    <div className="filters">
      <Field label="De"><input type="date" value={filters.from} onChange={set("from")} /></Field>
      <Field label="Até"><input type="date" value={filters.to} onChange={set("to")} /></Field>
      <Field label="Profissional">
        <select value={filters.professional} onChange={set("professional")}>
          <option value="">Todos</option>
          {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </Field>
      <Field label="Situação">
        <select value={filters.status} onChange={set("status")}>
          <option value="confirmed">Confirmados</option>
          <option value="pending">Aguardando conclusão (já passaram)</option>
          <option value="completed">Concluídos</option>
          <option value="no_show">Não compareceram</option>
          <option value="canceled">Cancelados</option>
          <option value="">Todos</option>
        </select>
      </Field>
    </div>
  );
}
