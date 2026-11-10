import * as platformApi from "../../api/platform";
import ErrorMessage from "../../components/ui/ErrorMessage";
import { useApi } from "../../hooks/useApi";

/** Cartão com um número grande e uma legenda. */
function Stat({ label, value, hint }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

/** Totais da plataforma e ranking das empresas com mais agendamentos. */
export default function OverviewView() {
  const { data: s, error } = useApi(platformApi.getStats);
  if (error) return <section className="card"><ErrorMessage message={error} /></section>;
  if (!s) return null;
  return (
    <section className="card">
      <div className="stats">
        <Stat label="Empresas" value={s.companies.total} hint={`${s.companies.active} ativas`} />
        <Stat label="Usuários" value={s.users.total} hint={`${s.users.active} ativos`} />
        <Stat label="Profissionais" value={s.professionals} />
        <Stat label="Agendamentos" value={s.appointments.total} hint={`${s.appointments.upcoming} futuros`} />
        <Stat label="Últimos 30 dias" value={s.appointments.created_last_30_days} hint="agendamentos criados" />
        <Stat label="Cancelados" value={s.appointments.canceled} />
      </div>
      <h3>Empresas com mais agendamentos</h3>
      {s.top_companies.length === 0 && <p className="muted">Ainda não há agendamentos.</p>}
      <ol>
        {s.top_companies.map((c) => <li key={c.id}>{c.name} — {c.appointments}</li>)}
      </ol>
    </section>
  );
}
