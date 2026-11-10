import { useEffect, useState } from "react";
import * as reportsApi from "../../api/reports";
import ColumnChart from "../../components/charts/ColumnChart";
import RankBars from "../../components/charts/RankBars";
import StatusLegend from "../../components/charts/StatusLegend";
import Stars from "../../components/ui/Stars";
import ErrorMessage from "../../components/ui/ErrorMessage";
import { useAction } from "../../hooks/useAction";
import { useApi } from "../../hooks/useApi";
import { fmtDateRange, fmtPeriodLabel } from "../../utils/date";
import { omitEmpty } from "../../utils/lists";
import ReportFilters, { defaultFilters } from "./ReportFilters";
import ReportTable from "./ReportTable";
import SummaryCards from "./SummaryCards";

/** Nota média por profissional (só quem tem avaliações no período). */
function Ratings({ rows }) {
  const rated = rows.filter((r) => r.rating_count > 0).sort((a, b) => b.rating_avg - a.rating_avg);
  if (!rated.length) return <p className="muted">Sem avaliações no período.</p>;
  return (
    <ul className="plain">
      {rated.map((r) => <li key={r.professional_id}><Stars value={r.rating_avg} /> <strong>{String(r.rating_avg).replace(".", ",")}</strong> {r.label} <span className="muted">({r.rating_count})</span></li>)}
    </ul>
  );
}

/**
 * Dashboard de atendimentos para o admin geral (todos os estabelecimentos) e para administradores de
 * estabelecimento (só os deles): indicadores, gráficos, planilha com filtros e exportação em CSV.
 */
export default function ReportsPage() {
  const [filters, setFilters] = useState(defaultFilters);
  const { data: options, error: optionsError } = useApi(reportsApi.getOptions);
  const active = omitEmpty(filters);
  const { data: summary, error } = useApi(() => reportsApi.getSummary(active), [JSON.stringify(active)]);
  const { error: exportError, busy, run } = useAction();

  // Quem administra um único estabelecimento não vê o seletor, mas o filtro precisa existir.
  useEffect(() => {
    if (options?.companies.length === 1 && !filters.company) setFilters((f) => ({ ...f, company: String(options.companies[0].id) }));
  }, [options]); // eslint-disable-line react-hooks/exhaustive-deps

  const multi = (options?.companies.length || 0) > 1 && !filters.company;
  const t = summary?.totals;

  return (
    <div className="reports">
      <section className="card">
        <h2>Relatórios</h2>
        {options && <ReportFilters filters={filters} onChange={setFilters} options={options} />}
        <ErrorMessage message={optionsError || error || exportError} />
      </section>

      {t && (
        <>
          <section className="card"><SummaryCards totals={t} previous={summary.previous} customers={summary.customers} />
            {summary.previous && <p className="muted">Comparação com {fmtDateRange(summary.previous.from, summary.previous.to)}.</p>}</section>

          <section className="card">
            <h3>Atendimentos {summary.period.granularity === "month" ? "por mês" : "por dia"}</h3>
            <StatusLegend />
            <ColumnChart data={summary.by_period} title="Atendimentos por período, empilhados por situação"
              formatLabel={(l) => fmtPeriodLabel(l, summary.period.granularity)} />
          </section>

          <div className="grid2">
            <section className="card"><h3>Por profissional</h3><RankBars rows={summary.by_professional} showCompany={multi} />
              <Ratings rows={summary.by_professional} /></section>
            <section className="card"><h3>Por serviço</h3><RankBars rows={summary.by_service} showCompany={multi} /></section>
            {multi && <section className="card"><h3>Por estabelecimento</h3><RankBars rows={summary.by_company} /></section>}
            <section className="card"><h3>Por dia da semana</h3><ColumnChart data={summary.by_weekday} title="Atendimentos por dia da semana" formatLabel={(l) => l.slice(0, 3)} /></section>
          </div>
        </>
      )}

      <section className="card">
        <div className="tableHead">
          <h3>Planilha de atendimentos</h3>
          <div className="actions">
            <button type="button" disabled={busy} onClick={() => run(() => reportsApi.exportXlsx(active))}>
              {busy ? "Gerando…" : "Exportar para Excel"}
            </button>
            <button type="button" disabled={busy} onClick={() => run(() => reportsApi.exportCsv(active))}>Exportar CSV</button>
          </div>
        </div>
        <ReportTable filters={filters} />
      </section>
    </div>
  );
}
