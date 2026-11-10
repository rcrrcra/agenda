import { useEffect, useState } from "react";
import * as adminApi from "../../../api/admin";
import ErrorMessage from "../../../components/ui/ErrorMessage";
import { List, ListRow } from "../../../components/ui/List";
import { useAction } from "../../../hooks/useAction";
import { useApi } from "../../../hooks/useApi";
import { STATUS_LABELS } from "../../../utils/constants";
import { fmtDateTime } from "../../../utils/date";
import { money } from "../../../utils/reportFormat";
import { clientSummary } from "./clientSummary";

/**
 * Histórico de um cliente NESTA empresa: totais, alerta de faltas, observações internas (editáveis)
 * e todos os atendimentos. Nada de outras empresas aparece aqui.
 *
 * @param {{id: number, onBack: () => void}} props `id` do cliente; `onBack` volta para a lista.
 */
export default function ClientDetail({ id, onBack }) {
  const { data: c, error, reload } = useApi(() => adminApi.getClient(id), [id]);
  const [notes, setNotes] = useState("");
  const { error: saveError, busy, run } = useAction();
  const [saved, setSaved] = useState(false);

  // Preenche o campo quando o histórico chega (ou é recarregado).
  useEffect(() => { if (c) setNotes(c.notes); }, [c]);

  /** Salva as observações internas e recarrega. */
  const save = async () => {
    setSaved(false);
    if (await run(() => adminApi.saveClientNotes(id, notes))) { setSaved(true); reload(); }
  };

  return (
    <section className="card">
      <div><button type="button" onClick={onBack}>← Clientes</button></div>
      <ErrorMessage message={error} />
      {c && (
        <>
          <div>
            <h2>{c.name}</h2>
            <span className="muted">{c.email}</span>
          </div>
          {c.flagged && (
            <p className="notice">⚠ Falta com frequência: {c.no_show} falta(s) em {c.completed + c.no_show} atendimento(s) finalizado(s).</p>
          )}
          <p className="muted">{clientSummary(c)}{c.canceled ? ` · ${c.canceled} cancelamento(s)` : ""}</p>

          <label>
            Observações internas (só a equipe desta empresa vê)
            <textarea rows={3} maxLength={2000} value={notes} onChange={(e) => { setNotes(e.target.value); setSaved(false); }} />
          </label>
          <div className="actions">
            <button type="button" className="primary" disabled={busy || notes === c.notes} onClick={save}>Salvar observações</button>
            {saved && <span className="muted">Salvo.</span>}
          </div>
          <ErrorMessage message={saveError} />

          <h3>Atendimentos</h3>
          <List>
            {c.appointments.map((a) => (
              <ListRow key={a.id} title={`${fmtDateTime(a.start)} · ${a.service}`} dimmed={a.status === "canceled"}
                actions={<span className={`status st-${a.status}`}>{STATUS_LABELS[a.status]}</span>}>
                <span className="muted">{a.professional}{a.price !== null ? ` · ${money(a.price)}` : ""}</span>
                {a.notes && <span className="muted">“{a.notes}”</span>}
              </ListRow>
            ))}
          </List>
        </>
      )}
    </section>
  );
}
