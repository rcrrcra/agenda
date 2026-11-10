import * as bookingApi from "../api/booking";
import ReviewBox from "../components/booking/ReviewBox";
import ErrorMessage from "../components/ui/ErrorMessage";
import { List, ListRow } from "../components/ui/List";
import { useAction } from "../hooks/useAction";
import { useApi } from "../hooks/useApi";
import { STATUS_LABELS } from "../utils/constants";
import { fmtDateTime } from "../utils/date";

/** Lista os agendamentos do usuário, com link do Google Agenda e cancelamento. */
export default function MyAppointmentsPage() {
  const { data: items, error: loadError, reload } = useApi(bookingApi.listMyAppointments);
  const { error, run } = useAction();

  /** Cancela após confirmação e recarrega a lista. */
  const cancel = async (id) => {
    if (!confirm("Cancelar este agendamento?")) return;
    if (await run(() => bookingApi.cancelAppointment(id))) reload();
  };

  return (
    <section className="card">
      <ErrorMessage message={error || loadError} />
      {items?.length === 0 && <p className="muted">Você ainda não tem agendamentos.</p>}
      <List>
        {items?.map((a) => (
          <ListRow
            key={a.id}
            title={`${a.service_name} · ${a.company_name}`}
            dimmed={a.status === "canceled"}
            actions={a.status === "confirmed" && (
              <div className="actions">
                <a className="btn" href={a.google_calendar_url} target="_blank" rel="noreferrer">Adicionar ao Google Agenda</a>
                {a.can_cancel
                  ? <button type="button" onClick={() => cancel(a.id)}>Cancelar</button>
                  : <span className="muted">Fora do prazo para cancelar; fale com a empresa.</span>}
              </div>
            )}
          >
            <span className="muted">
              {a.professional_name} · {fmtDateTime(a.start)}{a.status === "confirmed" ? "" : ` · ${STATUS_LABELS[a.status]}`}
            </span>
            {a.can_review && <ReviewBox key={a.review?.rating ?? 0} appointment={a} onSaved={reload} />}
          </ListRow>
        ))}
      </List>
    </section>
  );
}
