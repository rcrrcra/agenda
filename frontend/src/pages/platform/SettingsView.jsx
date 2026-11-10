import { useEffect, useState } from "react";
import * as platformApi from "../../api/platform";
import ErrorMessage from "../../components/ui/ErrorMessage";
import Field from "../../components/ui/Field";
import { useAction } from "../../hooks/useAction";
import { useApi } from "../../hooks/useApi";

/** Configurações globais da plataforma (hoje: quantas empresas cada usuário pode cadastrar sozinho). */
export default function SettingsView() {
  const { data, error, reload } = useApi(platformApi.getSettings);
  const [max, setMax] = useState("");
  const [saved, setSaved] = useState(false);
  const { error: saveError, busy, run } = useAction();
  useEffect(() => { if (data) setMax(String(data.max_companies_per_user)); }, [data]);

  /** Salva o limite e recarrega. */
  const submit = async (e) => {
    e.preventDefault();
    setSaved(false);
    if (await run(() => platformApi.saveSettings(max))) { setSaved(true); reload(); }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>Cadastro de empresas pelos usuários</h3>
      <p className="muted">
        Qualquer usuário pode cadastrar a própria empresa (ícone de loja no topo). A empresa fica ativa na hora, sem aprovação.
        Este limite vale por usuário e não afeta empresas cadastradas por você.
      </p>
      <Field label="Máximo de empresas por usuário (0 = sem limite)">
        <input type="number" min="0" max="1000" required value={max} onChange={(e) => { setMax(e.target.value); setSaved(false); }} />
      </Field>
      <ErrorMessage message={error || saveError} />
      {saved && <p className="muted" role="status">Configuração salva.</p>}
      <div className="actions"><button className="primary" disabled={busy || !data}>{busy ? "Salvando…" : "Salvar"}</button></div>
    </form>
  );
}
