import { useState } from "react";
import * as adminApi from "../../../api/admin";
import ErrorMessage from "../../../components/ui/ErrorMessage";
import Field from "../../../components/ui/Field";
import { useAction } from "../../../hooks/useAction";
import OffersEditor from "./OffersEditor";
import WeeklySchedule from "./WeeklySchedule";
import { toPayload } from "./professionalFormState";

/**
 * Formulário completo de profissional: dados básicos, serviços oferecidos,
 * expediente e pausas por dia da semana.
 *
 * @param {object} props
 * @param {object} props.initial Estado inicial (veja `blankProfessional` / `toFormState`).
 * @param {{id: number, name: string}[]} props.services Catálogo de serviços disponíveis.
 * @param {(changed: boolean) => void} props.onClose Volta para a lista; `changed` indica se houve gravação.
 */
export default function ProfessionalForm({ initial, services, onClose }) {
  const [form, setForm] = useState(initial);
  const { error, busy, run } = useAction();

  /** Handler para campos simples (texto, número, checkbox). */
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  /** Mescla mudanças vindas dos editores filhos (offers, working_hours, breaks). */
  const patch = (changes) => setForm((f) => ({ ...f, ...changes }));

  /** Cria ou atualiza o profissional e volta para a lista. */
  const save = async (e) => {
    e.preventDefault();
    const payload = toPayload(form);
    const ok = await run(() => (form.id ? adminApi.professionals.update(form.id, payload) : adminApi.professionals.create(payload)));
    if (ok) onClose(true);
  };

  /** Exclui após confirmação (a API recusa se houver agendamentos). */
  const remove = async () => {
    if (!confirm(`Excluir ${form.name}?`)) return;
    if (await run(() => adminApi.professionals.remove(form.id))) onClose(true);
  };

  return (
    <form onSubmit={save} className="card">
      <h2>{form.id ? "Editar profissional" : "Novo profissional"}</h2>
      <div className="grid2">
        <Field label="Nome"><input required value={form.name} onChange={set("name")} /></Field>
        <Field label="Apresentação"><input value={form.bio} onChange={set("bio")} maxLength={255} /></Field>
        <Field label="Intervalo padrão entre horários (min)">
          <input type="number" min="5" step="5" required value={form.slot_minutes} onChange={set("slot_minutes")} />
        </Field>
        <Field label="Folga entre atendimentos (min)">
          <input type="number" min="0" step="5" required value={form.buffer_minutes} onChange={set("buffer_minutes")} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.active} onChange={set("active")} /> Aceita agendamentos
      </label>

      <h3>Serviços oferecidos</h3>
      <OffersEditor offers={form.offers} services={services} onChange={(offers) => patch({ offers })} />

      <h3>Horários</h3>
      <WeeklySchedule workingHours={form.working_hours} breaks={form.breaks} onChange={patch} />

      <ErrorMessage message={error} />
      <div className="actions">
        <button className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
        <button type="button" onClick={() => onClose(false)}>Voltar</button>
        {form.id && <button type="button" className="danger" onClick={remove}>Excluir</button>}
      </div>
    </form>
  );
}
