import Field from "../../components/ui/Field";
import { STATUS_LABELS } from "../../utils/constants";
import { addDays, startOfMonth, today } from "../../utils/date";

/** Atalhos de período: texto e função que devolve {from, to}. */
const PRESETS = [
  { label: "7 dias", range: () => ({ from: addDays(today(), -6), to: today() }) },
  { label: "30 dias", range: () => ({ from: addDays(today(), -29), to: today() }) },
  { label: "Este mês", range: () => ({ from: startOfMonth(today()), to: today() }) },
  { label: "90 dias", range: () => ({ from: addDays(today(), -89), to: today() }) },
  { label: "12 meses", range: () => ({ from: addDays(today(), -364), to: today() }) },
];

/** Filtros iniciais: últimos 30 dias, tudo o mais em "todos". */
export const defaultFilters = () => ({ ...PRESETS[1].range(), company: "", professional: "", service: "", status: "" });

/**
 * Filtros do relatório: período (com atalhos), estabelecimento, profissional, serviço e situação.
 * Profissional e serviço mostram só os do estabelecimento escolhido; ao trocar o estabelecimento,
 * escolhas que deixaram de valer são limpas.
 *
 * @param {object} props
 * @param {{from: string, to: string, company: string, professional: string, service: string, status: string}} props.filters
 * @param {(filters: object) => void} props.onChange Recebe o objeto de filtros atualizado.
 * @param {{companies: object[], professionals: object[], services: object[]}} props.options De `/reports/options/`.
 */
export default function ReportFilters({ filters, onChange, options }) {
  const { companies, professionals, services } = options;
  const inCompany = (x) => !filters.company || String(x.company) === filters.company;
  const pros = professionals.filter(inCompany);
  const svcs = services.filter(inCompany);
  const companyName = (id) => companies.find((c) => c.id === id)?.name;
  const many = companies.length > 1;

  /** Altera um filtro; ao mudar de estabelecimento, limpa profissional/serviço de outro estabelecimento. */
  const set = (key) => (e) => {
    const next = { ...filters, [key]: e.target.value };
    if (key === "company") {
      const ok = (list, id) => !id || list.some((x) => String(x.id) === id && (!next.company || String(x.company) === next.company));
      if (!ok(professionals, next.professional)) next.professional = "";
      if (!ok(services, next.service)) next.service = "";
    }
    onChange(next);
  };

  return (
    <div className="reportFilters">
      <div className="presets" role="group" aria-label="Períodos rápidos">
        {PRESETS.map((p) => <button type="button" key={p.label} onClick={() => onChange({ ...filters, ...p.range() })}>{p.label}</button>)}
      </div>
      <div className="filters">
        <Field label="De"><input type="date" value={filters.from} max={filters.to || undefined} onChange={set("from")} /></Field>
        <Field label="Até"><input type="date" value={filters.to} min={filters.from || undefined} onChange={set("to")} /></Field>
        {many && (
          <Field label="Estabelecimento">
            <select value={filters.company} onChange={set("company")}>
              <option value="">Todos</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Profissional">
          <select value={filters.professional} onChange={set("professional")}>
            <option value="">Todos</option>
            {pros.map((p) => <option key={p.id} value={p.id}>{many && !filters.company ? `${p.name} (${companyName(p.company)})` : p.name}</option>)}
          </select>
        </Field>
        <Field label="Serviço">
          <select value={filters.service} onChange={set("service")}>
            <option value="">Todos</option>
            {svcs.map((s) => <option key={s.id} value={s.id}>{many && !filters.company ? `${s.name} (${companyName(s.company)})` : s.name}</option>)}
          </select>
        </Field>
        <Field label="Situação">
          <select value={filters.status} onChange={set("status")}>
            <option value="">Todas</option>
            {Object.entries(STATUS_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            <option value="pending">Aguardando conclusão</option>
          </select>
        </Field>
      </div>
    </div>
  );
}
