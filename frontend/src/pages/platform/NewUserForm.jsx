import { useState } from "react";
import * as platformApi from "../../api/platform";
import ErrorMessage from "../../components/ui/ErrorMessage";
import Field from "../../components/ui/Field";
import { useAction } from "../../hooks/useAction";
import { ROLE_LABELS } from "../../utils/constants";

/** Senha aleatória de 14 caracteres (sem letras parecidas como l/1/O/0), via `crypto`. */
export const generatePassword = () => {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};

const EMPTY = { name: "", email: "", password: "", role: "client", company: "" };

/**
 * Cadastro de usuário pelo admin geral: nome, e-mail, senha inicial e perfil.
 * A senha é mostrada em texto para que possa ser repassada à pessoa (que deve trocá-la depois).
 * @param {{companies: {id: number, name: string}[], onDone: () => void, onCancel: () => void}} props
 */
export default function NewUserForm({ companies, onDone, onCancel }) {
  const [form, setForm] = useState(EMPTY);
  const { error, busy, run } = useAction();
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const needsCompany = form.role === "company_admin";

  /** Cadastra e volta para a lista. */
  const submit = async (e) => {
    e.preventDefault();
    if (await run(() => platformApi.createUser(form))) onDone();
  };

  return (
    <form onSubmit={submit} className="card">
      <h3>Novo usuário</h3>
      <div className="filters">
        <Field label="Nome"><input required maxLength={120} value={form.name} onChange={set("name")} /></Field>
        <Field label="E-mail (será o login)"><input required type="email" autoComplete="off" value={form.email} onChange={set("email")} /></Field>
      </div>
      <div className="filters">
        <Field label="Senha inicial">
          <input required type="text" autoComplete="off" minLength={8} value={form.password} onChange={set("password")} />
        </Field>
        <div className="actions"><button type="button" onClick={() => setForm({ ...form, password: generatePassword() })}>Gerar senha</button></div>
      </div>
      <div className="filters">
        <Field label="Perfil">
          <select value={form.role} onChange={set("role")}>
            {Object.entries(ROLE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </Field>
        {needsCompany && (
          <Field label="Estabelecimento">
            <select required value={form.company} onChange={set("company")}>
              <option value="">Escolha o estabelecimento</option>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
      </div>
      {form.role === "platform_admin" && <p className="notice">Admin geral tem acesso total: todas as empresas, usuários e o log de auditoria.</p>}
      <ErrorMessage message={error} />
      <div className="actions">
        <button className="primary" disabled={busy}>{busy ? "Cadastrando…" : "Cadastrar usuário"}</button>
        <button type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
