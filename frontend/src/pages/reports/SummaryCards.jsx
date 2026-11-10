import { deltaInfo } from "../../utils/reportFormat";
import { money, percent } from "../../utils/reportFormat";

/** Um indicador: valor grande e legenda. */
function Stat({ label, value, hint, delta }) {
  return (
    <div className="stat" title={hint}>
      <span className="muted">{label}</span>
      <strong>{value}</strong>
      {delta && <span className={`delta ${delta.tone}`} title="Comparado ao período anterior de mesma duração">{delta.text}</span>}
    </div>
  );
}

/**
 * Indicadores do período: contagens por situação, taxas e receita.
 * Receita considera só atendimentos concluídos; a prevista soma os confirmados.
 * @param {{totals: object}} props `totals` vem de `/reports/summary/`.
 */
export default function SummaryCards({ totals: t, previous = null, customers = null }) {
  const d = (key, opts) => (previous ? deltaInfo(t[key], previous.totals[key], opts) : null);
  return (
    <div className="stats">
      <Stat label="Agendamentos" value={t.total} delta={d("total")} />
      <Stat label="Concluídos" value={t.completed} delta={d("completed")} />
      <Stat label="Confirmados" value={t.confirmed} hint="Ainda não concluídos (futuros ou aguardando conclusão)" />
      <Stat label="Não compareceram" value={t.no_show} delta={d("no_show", { goodWhenUp: false })} />
      <Stat label="Cancelados" value={t.canceled} delta={d("canceled", { goodWhenUp: false })} />
      <Stat label="Comparecimento" value={percent(t.attendance_rate)} hint="Concluídos ÷ (concluídos + não compareceram)" />
      <Stat label="Cancelamento" value={percent(t.cancel_rate)} hint="Cancelados ÷ total" />
      <Stat label="Receita" value={money(t.revenue)} hint="Soma dos concluídos" delta={d("revenue")} />
      <Stat label="Ticket médio" value={money(t.avg_ticket)} hint="Receita ÷ concluídos" />
      <Stat label="Nota média" value={t.rating_avg ? `${String(t.rating_avg).replace(".", ",")} ★` : "—"}
        hint={`${t.rating_count} avaliação(ões) dos clientes`} />
      {customers && <Stat label="Clientes novos" value={customers.new} hint="Primeiro atendimento nesta empresa dentro do período" delta={previous ? deltaInfo(customers.new, previous.customers.new) : null} />}
      {customers && <Stat label="Clientes recorrentes" value={customers.recurring} hint="Já tinham agendado antes do período" delta={previous ? deltaInfo(customers.recurring, previous.customers.recurring) : null} />}
      <Stat label="Receita prevista" value={money(t.revenue_expected)} hint="Soma dos confirmados" />
    </div>
  );
}
