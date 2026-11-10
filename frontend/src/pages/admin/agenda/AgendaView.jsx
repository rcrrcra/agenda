import { useState } from "react";
import * as adminApi from "../../../api/admin";
import ErrorMessage from "../../../components/ui/ErrorMessage";
import { List, ListRow } from "../../../components/ui/List";
import { useAction } from "../../../hooks/useAction";
import { useApi } from "../../../hooks/useApi";
import { fmtDayHeading, fmtTime, today } from "../../../utils/date";
import { groupBy, omitEmpty } from "../../../utils/lists";
import Tabs from "../../../components/ui/Tabs";
import AgendaFilters from "./AgendaFilters";
import CalendarView from "./CalendarView";
import NewBookingForm from "./NewBookingForm";
import RowActions from "./RowActions";

const VIEWS = [{ key: "list", label: "Lista" }, { key: "calendar", label: "Calendário" }];

/**
 * Agenda da empresa: todos os agendamentos por dia, com filtros, criação, cancelamento e conclusão
 * (concluído / não compareceu / reabrir) do atendimento.
 * @param {{companyId: number}} props Empresa administrada (a listagem em si é escopada pelo cabeçalho X-Company).
 */
export default function AgendaView({ companyId }) {
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState("list");
  const [version, setVersion] = useState(0); // muda a cada alteração, para o calendário recarregar
  const [filters, setFilters] = useState({ from: today(), to: "", professional: "", status: "confirmed" });
  const { data: professionals } = useApi(adminApi.professionals.list);
  // Recarrega sempre que um filtro muda; filtros vazios não vão para a API.
  const { data: items, error: loadError, reload } = useApi(
    () => adminApi.listAppointments(omitEmpty(filters)), [filters]);
  // Atendimentos que já aconteceram mas ainda não foram marcados como concluídos: viram um aviso.
  const { data: pending, reload: reloadPending } = useApi(() => adminApi.listAppointments({ status: "pending" }));
  const { error, run } = useAction();

  /** Executa uma ação sobre um agendamento e recarrega a lista e o aviso de pendentes. */
  const act = async (fn) => {
    if (await run(fn)) { reload(); reloadPending(); setVersion((v) => v + 1); }
  };

  /** Cancela após confirmação (o cliente é avisado por e-mail). */
  const cancel = async (a) => {
    if (!confirm(`Cancelar o agendamento de ${a.customer_name}? O cliente será avisado por e-mail.`)) return;
    await act(() => adminApi.cancelAppointment(a.id));
  };

  return (
    <section className="card">
      {creating ? (
        <NewBookingForm companyId={companyId} onCancel={() => setCreating(false)} onDone={() => { setCreating(false); reload(); setVersion((v) => v + 1); }} />
      ) : (
        <button type="button" className="primary" onClick={() => setCreating(true)}>Novo agendamento</button>
      )}
      {pending?.length > 0 && filters.status !== "pending" && (
        <p className="notice">
          {pending.length} atendimento(s) já aconteceram e aguardam conclusão.{" "}
          <button type="button" className="link" onClick={() => setFilters({ from: "", to: "", professional: "", status: "pending" })}>
            Ver agora
          </button>
        </p>
      )}
      <Tabs variant="inline" tabs={VIEWS} value={view} onChange={setView} />
      <ErrorMessage message={error || loadError} />
      {view === "calendar" && (
        <CalendarView professionals={professionals || []} refreshKey={version} renderDetail={(a) => (
          <>
            <strong>{fmtTime(a.start)}–{fmtTime(a.end)} · {a.service_name}</strong>
            <span className="muted">{a.professional_name} · {a.customer_name} ({a.customer_email})</span>
            {a.notes && <span className="muted">“{a.notes}”</span>}
            <RowActions a={a} onCancel={() => cancel(a)} act={act} />
          </>
        )} />
      )}
      {view === "list" && <AgendaFilters filters={filters} onChange={setFilters} professionals={professionals || []} />}
      {view === "list" && items?.length === 0 && <p className="muted">Nenhum agendamento neste filtro.</p>}
      {view === "list" && items && groupBy(items, (a) => fmtDayHeading(a.start)).map(([day, list]) => (
        <div key={day}>
          <h3 className="dayhead">{day}</h3>
          <List>
            {list.map((a) => (
              <ListRow
                key={a.id}
                title={`${fmtTime(a.start)}–${fmtTime(a.end)} · ${a.service_name}`}
                dimmed={a.status === "canceled"}
                actions={<RowActions a={a} onCancel={() => cancel(a)} act={act} />}
              >
                <span className="muted">{a.professional_name} · {a.customer_name} ({a.customer_email})</span>
                {a.customer_flagged && <span className="flag" title="Cliente com várias faltas: veja o histórico na aba Clientes">⚠ falta com frequência</span>}
                {a.notes && <span className="muted">“{a.notes}”</span>}
              </ListRow>
            ))}
          </List>
        </div>
      ))}
    </section>
  );
}
