import * as adminApi from "../../../api/admin";
import { STATUS_LABELS } from "../../../utils/constants";

/**
 * Ações de um agendamento conforme a situação: confirmado (concluir / faltou / cancelar),
 * finalizado (reabrir) ou cancelado (só a etiqueta). Concluir e faltou só ficam ativos depois do início.
 * Usado na lista e no detalhe do calendário.
 * @param {{a: object, onCancel: () => void, act: (fn: () => Promise<any>) => void}} props
 */
export default function RowActions({ a, onCancel, act }) {
  const started = new Date(a.start) <= new Date();
  const badge = <span className={`status st-${a.status}`}>{STATUS_LABELS[a.status]}</span>;
  if (a.status === "canceled") return badge;
  if (a.status !== "confirmed") {
    return (
      <div className="actions">{badge}
        <button type="button" onClick={() => act(() => adminApi.reopenAppointment(a.id))}>Reabrir</button>
      </div>
    );
  }
  return (
    <div className="actions">
      <button type="button" className="primary" disabled={!started} title={started ? "" : "O atendimento ainda não começou"}
        onClick={() => act(() => adminApi.completeAppointment(a.id))}>Concluir</button>
      <button type="button" disabled={!started} title={started ? "" : "O atendimento ainda não começou"}
        onClick={() => act(() => adminApi.noShowAppointment(a.id))}>Não compareceu</button>
      <button type="button" className="danger" onClick={onCancel}>Cancelar</button>
    </div>
  );
}
