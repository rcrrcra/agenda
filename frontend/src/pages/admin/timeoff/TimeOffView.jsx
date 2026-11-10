import * as adminApi from "../../../api/admin";
import ErrorMessage from "../../../components/ui/ErrorMessage";
import { List, ListRow } from "../../../components/ui/List";
import { useAction } from "../../../hooks/useAction";
import { useApi } from "../../../hooks/useApi";
import { fmtDateRange } from "../../../utils/date";
import TimeOffForm from "./TimeOffForm";

/** Feriados e folgas: cria, lista e remove bloqueios de datas. */
export default function TimeOffView() {
  const { data: list, error: loadError, reload } = useApi(adminApi.timeOff.list);
  const { data: professionals } = useApi(adminApi.professionals.list);
  const { error, run } = useAction();

  /** Remove o bloqueio após confirmação (os horários voltam a ser oferecidos). */
  const remove = async (id) => {
    if (!confirm("Remover este bloqueio? Os horários voltam a ser oferecidos.")) return;
    if (await run(() => adminApi.timeOff.remove(id))) reload();
  };

  return (
    <section className="card">
      <p className="muted">
        Feriados e folgas: nos dias bloqueados nenhum horário é oferecido.
        Agendamentos já confirmados não são cancelados automaticamente.
      </p>
      <TimeOffForm professionals={professionals || []} onCreated={reload} />
      <ErrorMessage message={error || loadError} />
      {list?.length === 0 && <p className="muted">Nenhum bloqueio cadastrado.</p>}
      <List>
        {list?.map((t) => (
          <ListRow
            key={t.id}
            title={`${fmtDateRange(t.start_date, t.end_date)} · ${t.professional_name || "Todos os profissionais"}`}
            actions={<button type="button" className="danger" onClick={() => remove(t.id)}>Remover</button>}
          >
            {t.reason && <span className="muted">{t.reason}</span>}
            {t.affected_appointments > 0 && (
              <span className="error">
                {t.affected_appointments} agendamento(s) confirmado(s) neste período. Cancele na Agenda, se necessário.
              </span>
            )}
          </ListRow>
        ))}
      </List>
    </section>
  );
}
