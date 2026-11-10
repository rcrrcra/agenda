import { useState } from "react";
import * as platformApi from "../../api/platform";
import ErrorMessage from "../../components/ui/ErrorMessage";
import Field from "../../components/ui/Field";
import { useAction } from "../../hooks/useAction";
import { generatePassword } from "./NewUserForm";

/**
 * Edição dos dados de um usuário pelo admin geral: nome, e-mail (que também é o login) e redefinição de senha (opcional).
 * Mudar e-mail ou senha encerra as sessões da pessoa. Tudo fica registrado no log (a senha nunca é gravada).
 * @param {{user: {id: number, name: string, email: string, username: string}, onDone: () => void, onCancel: () => void}} props
 */
export default function UserDataEditor({ user, onDone, onCancel }) {
  const [form, setForm] = useState({ name: user.name || "", email: user.email || "", password: "" });
  const { error, busy, run } = useAction();
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  /** Envia só o que mudou (senha vazia = manter a atual). */
  const submit = async (e) => {
    e.preventDefault();
    const body = {};
    if (form.name.trim() !== (user.name || "")) body.name = form.name;
    if (form.email.trim().toLowerCase() !== (user.email || "").toLowerCase()) body.email = form.email;
    if (form.password) body.password = form.password;
    if (!Object.keys(body).length) return onCancel();
    if (await run(() => platformApi.updateUser(user.id, body))) onDone();
  };

  return (
    <form onSubmit={submit} className="card">
      <div className="filters">
        <Field label="Nome"><input required maxLength={120} value={form.name} onChange={set("name")} /></Field>
        <Field label="E-mail (login)"><input required type="email" autoComplete="off" value={form.email} onChange={set("email")} /></Field>
      </div>
      <div className="filters">
        <Field label="Nova senha (deixe vazio para manter)">
          <input type="text" autoComplete="off" minLength={8} value={form.password} onChange={set("password")} />
        </Field>
        <div className="actions"><button type="button" onClick={() => setForm({ ...form, password: generatePassword() })}>Gerar senha</button></div>
      </div>
      <p className="muted">Mudar e-mail ou senha encerra as sessões abertas dessa pessoa.</p>
      <ErrorMessage message={error} />
      <div className="actions">
        <button className="primary" disabled={busy}>{busy ? "Salvando…" : "Salvar dados"}</button>
        <button type="button" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
