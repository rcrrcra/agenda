import { useState } from "react";
import { registerCompany } from "../../api/companies";
import { useAction } from "../../hooks/useAction";
import ErrorMessage from "../ui/ErrorMessage";
import Field from "../ui/Field";
import CompanyFields from "./CompanyFields";

const EMPTY = { name: "", category: "", city: "", address: "", description: "" };

/**
 * Janela para o próprio usuário cadastrar uma empresa. A empresa fica ativa na hora e o usuário passa a administrá-la.
 * O servidor aplica o limite de empresas por usuário (configurável pelo admin geral) e devolve a mensagem se estourar.
 * @param {{onClose: () => void, onCreated: (company: {id: number, name: string}) => void}} props
 */
export default function RegisterCompanyDialog({ onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const { error, busy, run } = useAction();

  /** Cadastra e avisa o app (que recarrega o usuário e abre o painel da nova empresa). */
  const submit = async (e) => {
    e.preventDefault();
    let created;
    if (await run(async () => { created = await registerCompany(form); })) onCreated(created);
  };

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="dialog card" role="dialog" aria-modal="true" aria-labelledby="reg-company-title" onSubmit={submit}
        onKeyDown={(e) => e.key === "Escape" && onClose()}>
        <div className="tableHead">
          <h3 id="reg-company-title">Cadastrar minha empresa</h3>
          <button type="button" className="link" aria-label="Fechar" onClick={onClose}>✕</button>
        </div>
        <p className="muted">Você passa a administrar a empresa e ganha acesso à aba Administração.</p>
        <CompanyFields value={form} onChange={setForm} />
        <ErrorMessage message={error} />
        <div className="actions">
          <button className="primary" disabled={busy}>{busy ? "Cadastrando…" : "Cadastrar empresa"}</button>
          <button type="button" onClick={onClose}>Cancelar</button>
        </div>
      </form>
    </div>
  );
}
