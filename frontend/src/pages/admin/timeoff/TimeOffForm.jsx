import { useState } from "react";
import * as adminApi from "../../../api/admin";
import ErrorMessage from "../../../components/ui/ErrorMessage";
import Field from "../../../components/ui/Field";
import { useAction } from "../../../hooks/useAction";
import { today } from "../../../utils/date";

/**
 * Formulário para bloquear um intervalo de datas.
 * @param {object} props
 * @param {{id: number, name: string}[]} props.professionals Opções do seletor ("Todos" = feriado).
 * @param {() => void} props.onCreated Chamado após criar o bloqueio.
 */
export default function TimeOffForm({ professionals, onCreated }) {
  const [form, setForm] = useState({ professional: "", start_date: today(), end_date: today(), reason: "" });
  const { error, run } = useAction();

  /** Ao mudar a data inicial, empurra a final se ficaria anterior. */
  const setStart = (e) => {
    const start = e.target.value;
    setForm({ ...form, start_date: start, end_date: form.end_date < start ? start : form.end_date });
  };

  /** Envia o bloqueio; profissional vazio vira `null` (vale para todos). */
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(() => adminApi.timeOff.create({ ...form, professional: form.professional ? Number(form.professional) : null }));
    if (ok) {
      setForm({ ...form, reason: "" });
      onCreated();
    }
  };

  return (
    <>
      <form onSubmit={submit} className="grid2">
        <Field label="Quem">
          <select value={form.professional} onChange={(e) => setForm({ ...form, professional: e.target.value })}>
            <option value="">Todos (feriado)</option>
            {professionals.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="De"><input type="date" required value={form.start_date} onChange={setStart} /></Field>
        <Field label="Até">
          <input type="date" required min={form.start_date} value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </Field>
        <Field label="Motivo">
          <input maxLength={120} placeholder="Ex.: Natal" value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </Field>
        <button className="primary">Bloquear datas</button>
      </form>
      <ErrorMessage message={error} />
    </>
  );
}
