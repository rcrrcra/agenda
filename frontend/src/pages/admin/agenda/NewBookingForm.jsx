import { useState } from "react";
import * as adminApi from "../../../api/admin";
import ScheduleFields from "../../../components/booking/ScheduleFields";
import ErrorMessage from "../../../components/ui/ErrorMessage";
import Field from "../../../components/ui/Field";
import Tabs from "../../../components/ui/Tabs";
import { useAction } from "../../../hooks/useAction";
import { useBookingSelection } from "../../../hooks/useBookingSelection";
import CustomerPicker from "./CustomerPicker";

const MODES = [
  { key: "existing", label: "Cliente cadastrado" },
  { key: "new", label: "Novo cliente" },
];

/**
 * Formulário para a equipe agendar em nome de um cliente (telefone/balcão).
 * Segue as mesmas regras de horário do cliente (via `useBookingSelection`).
 * @param {{companyId: number, onDone: () => void, onCancel: () => void}} props
 *   `companyId` é a empresa administrada (só os profissionais dela são oferecidos).
 */
export default function NewBookingForm({ companyId, onDone, onCancel }) {
  const selection = useBookingSelection(companyId, { staff: true });
  const [mode, setMode] = useState("existing");
  const [customer, setCustomer] = useState(null); // cliente escolhido (modo "existing")
  const [newCustomer, setNewCustomer] = useState({ name: "", email: "" }); // modo "new"
  const [notes, setNotes] = useState("");
  const { error, busy, run } = useAction();

  // Só libera o envio com horário escolhido e cliente definido.
  const ready = selection.slot && (mode === "new" || customer);

  /** Envia a reserva; em conflito, recarrega os horários. */
  const submit = async (e) => {
    e.preventDefault();
    const who = mode === "existing"
      ? { customer_id: customer.id }
      : { new_customer_name: newCustomer.name, new_customer_email: newCustomer.email };
    const ok = await run(() => adminApi.createAppointment({
      professional: Number(selection.proId),
      service: Number(selection.service),
      start: selection.slot,
      notes,
      ...who,
    }));
    if (ok) onDone();
    else selection.reloadSlots();
  };

  return (
    <form onSubmit={submit} className="card">
      <h2>Novo agendamento</h2>
      <Tabs variant="inline" tabs={MODES} value={mode} onChange={setMode} />
      {mode === "existing" ? (
        <CustomerPicker value={customer} onChange={setCustomer} />
      ) : (
        <div className="grid2">
          <Field label="Nome">
            <input required value={newCustomer.name} onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })} />
          </Field>
          <Field label="E-mail">
            <input required type="email" value={newCustomer.email} onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })} />
          </Field>
        </div>
      )}
      <ScheduleFields selection={selection} />
      <Field label="Observações"><input maxLength={255} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <ErrorMessage message={error || selection.error} />
      <div className="actions">
        <button className="primary" disabled={!ready || busy}>{busy ? "Agendando…" : "Confirmar agendamento"}</button>
        <button type="button" onClick={onCancel}>Fechar</button>
      </div>
    </form>
  );
}
