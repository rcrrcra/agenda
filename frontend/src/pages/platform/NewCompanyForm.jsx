import { useState } from "react";
import * as platformApi from "../../api/platform";
import CompanyFields from "../../components/company/CompanyFields";
import UserPicker from "../../components/company/UserPicker";
import ErrorMessage from "../../components/ui/ErrorMessage";
import { useAction } from "../../hooks/useAction";

const BLANK = { name: "", category: "", city: "", address: "", description: "" };

/**
 * Cadastro de empresa pelo dono do software. O administrador (opcional) é escolhido pesquisando
 * entre os usuários já cadastrados; também pode ser definido depois, na lista de empresas.
 *
 * @param {object} props
 * @param {() => void} props.onCreated Chamado após cadastrar (recarrega a lista).
 * @param {() => void} props.onCancel Fecha o formulário.
 */
export default function NewCompanyForm({ onCreated, onCancel }) {
  const [form, setForm] = useState(BLANK);
  const [admin, setAdmin] = useState(null); // usuário escolhido como administrador
  const { error, busy, run } = useAction();

  /** Cadastra a empresa já com o administrador escolhido (se houver). */
  const submit = async (e) => {
    e.preventDefault();
    const ok = await run(() => platformApi.createCompany({ ...form, ...(admin ? { admin: admin.username } : {}) }));
    if (ok) onCreated();
  };

  return (
    <form onSubmit={submit} className="card">
      <h2>Nova empresa</h2>
      <CompanyFields value={form} onChange={setForm} />
      <div>
        <span className="muted">Administrador (opcional): </span>
        {admin ? (
          <span className="chip">
            {admin.name || admin.username} ({admin.email || admin.username})
            <button type="button" aria-label="Remover administrador escolhido" onClick={() => setAdmin(null)}>×</button>
          </span>
        ) : (
          <UserPicker label="Administrador da empresa" placeholder="Digite nome, e-mail ou usuário" onPick={setAdmin} />
        )}
      </div>
      <ErrorMessage message={error} />
      <div className="actions">
        <button className="primary" disabled={busy}>{busy ? "Cadastrando…" : "Cadastrar empresa"}</button>
        <button type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
