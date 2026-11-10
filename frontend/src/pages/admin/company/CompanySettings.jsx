import { useState } from "react";
import * as adminApi from "../../../api/admin";
import CompanyFields from "../../../components/company/CompanyFields";
import ErrorMessage from "../../../components/ui/ErrorMessage";
import Field from "../../../components/ui/Field";
import { useAction } from "../../../hooks/useAction";
import { useApi } from "../../../hooks/useApi";
import { DAYS } from "../../../utils/constants";
import { hhmm } from "../../../utils/format";
import TimeRangeList from "../professionals/TimeRangeList";
import { repeatMonday } from "../professionals/professionalFormState";
import BrandingEditor from "./BrandingEditor";

/** Faixa criada por "+ Adicionar" no horário de funcionamento. */
const DEFAULT_OPEN = { start_time: "09:00", end_time: "18:00" };

/**
 * Configurações da empresa administrada: dados, avisos por e-mail, antecedências,
 * horário de funcionamento (base para novos profissionais) e identidade (logo e fotos).
 * @param {{onSaved: () => void}} props Chamado após salvar (para atualizar nomes no app).
 */
export default function CompanySettings({ onSaved }) {
  const { data: company, error, reload } = useApi(adminApi.getCompany);
  if (error) return <section className="card"><ErrorMessage message={error} /></section>;
  if (!company) return null;
  return (
    <>
      <CompanySettingsForm initial={company} onSaved={onSaved} />
      <BrandingEditor company={company} onChanged={reload} />
    </>
  );
}

/** Formulário em si; separado para iniciar o estado só depois que a empresa chegou da API. */
function CompanySettingsForm({ initial, onSaved }) {
  const [form, setForm] = useState({
    ...initial,
    opening_hours: initial.opening_hours.map((h) => ({ ...h, start_time: hhmm(h.start_time), end_time: hhmm(h.end_time) })),
  });
  const [saved, setSaved] = useState(false);
  const { error, busy, run } = useAction();
  // Link que abre a página pública da empresa (para entrar e agendar é preciso ter conta).
  const link = `${window.location.origin}/?empresa=${initial.slug}`;

  const num = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const check = (key) => (e) => setForm({ ...form, [key]: e.target.checked });

  /** Salva as alterações e avisa o app. */
  const submit = async (e) => {
    e.preventDefault();
    setSaved(false);
    const { logo_url, photos, ...body } = form; // imagens têm rotas próprias
    const payload = { ...body, min_notice_hours: Number(form.min_notice_hours) || 0, cancel_notice_hours: Number(form.cancel_notice_hours) || 0 };
    if (await run(() => adminApi.updateCompany(payload))) {
      setSaved(true);
      onSaved();
    }
  };

  return (
    <form onSubmit={submit} className="card">
      <CompanyFields value={form} onChange={setForm} />
      <label className="check">
        <input type="checkbox" checked={form.active} onChange={check("active")} />
        Empresa ativa (aparece para os clientes)
      </label>
      <p className="muted">Link da página da empresa: <a href={link}>{link}</a></p>

      <fieldset>
        <legend>Avisos por e-mail</legend>
        <label className="check"><input type="checkbox" checked={form.notify_customers} onChange={check("notify_customers")} />
          Avisar o cliente (confirmação e cancelamento)</label>
        <label className="check"><input type="checkbox" checked={form.notify_admins} onChange={check("notify_admins")} />
          Avisar os administradores (novo agendamento e cancelamento)</label>
      </fieldset>

      <fieldset>
        <legend>Antecedência</legend>
        <div className="filters">
          <Field label="Mínima para agendar (horas)">
            <input type="number" min="0" max="720" value={form.min_notice_hours} onChange={num("min_notice_hours")} />
          </Field>
          <Field label="Mínima para o cliente cancelar (horas)">
            <input type="number" min="0" max="720" value={form.cancel_notice_hours} onChange={num("cancel_notice_hours")} />
          </Field>
        </div>
        <p className="muted">0 = sem regra. A equipe da empresa não é limitada pela antecedência ao agendar ou cancelar.</p>
      </fieldset>

      <fieldset>
        <legend>Horário de funcionamento</legend>
        <p className="muted">Aparece na página pública e já vem preenchido como expediente ao cadastrar um profissional novo.</p>
        <button type="button" className="link" onClick={() => setForm({ ...form, opening_hours: repeatMonday(form.opening_hours) })}>
          Repetir segunda em terça a sexta
        </button>
        <div className="days">
          {DAYS.map((name, weekday) => (
            <div className="day" key={weekday}>
              <strong>{name}</strong>
              <TimeRangeList title="Aberto" rows={form.opening_hours} weekday={weekday} defaults={DEFAULT_OPEN}
                onChange={(rows) => setForm({ ...form, opening_hours: rows })} />
            </div>
          ))}
        </div>
      </fieldset>

      <ErrorMessage message={error} />
      {saved && <p className="muted" role="status">Dados salvos.</p>}
      <div className="actions">
        <button className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
      </div>
    </form>
  );
}
