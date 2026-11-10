import { useState } from "react";
import * as authApi from "../api/auth";
import { token } from "../api/client";
import ErrorMessage from "../components/ui/ErrorMessage";
import Field from "../components/ui/Field";
import { useAction } from "../hooks/useAction";

/**
 * Tela de entrada: alterna entre login e criação de conta.
 * @param {{onAuth: (user: object) => void}} props Chamado com o usuário após autenticar.
 */
export default function AuthPage({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const { error, setError, busy, run } = useAction();
  const isLogin = mode === "login";

  /** Cria um handler que atualiza um campo do formulário. */
  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  /** Envia login ou cadastro, guarda o token e avisa o app. */
  const submit = (e) => {
    e.preventDefault();
    run(async () => {
      const result = isLogin
        ? await authApi.login(form.email, form.password)
        : await authApi.register(form.name, form.email, form.password);
      token.set(result.token);
      onAuth(result.user);
    });
  };

  /** Alterna entre login e cadastro limpando o erro anterior. */
  const toggleMode = () => {
    setMode(isLogin ? "register" : "login");
    setError("");
  };

  return (
    <main className="wrap narrow">
      <h1>{isLogin ? "Entrar para agendar" : "Criar conta"}</h1>
      <form onSubmit={submit} className="card">
        {!isLogin && (
          <Field label="Nome"><input required value={form.name} onChange={setField("name")} autoComplete="name" /></Field>
        )}
        {/* no login aceita também o nome de usuário (ex.: o superusuário criado no Django) */}
        <Field label={isLogin ? "E-mail ou usuário" : "E-mail"}>
          <input required type={isLogin ? "text" : "email"} value={form.email} onChange={setField("email")}
            autoComplete={isLogin ? "username" : "email"} />
        </Field>
        <Field label="Senha">
          <input required type="password" minLength={isLogin ? 1 : 8} value={form.password} onChange={setField("password")}
            autoComplete={isLogin ? "current-password" : "new-password"} />
        </Field>
        <ErrorMessage message={error} />
        <button className="primary" disabled={busy}>{isLogin ? "Entrar" : "Criar conta"}</button>
        <button type="button" className="link" onClick={toggleMode}>
          {isLogin ? "Ainda não tenho conta" : "Já tenho conta"}
        </button>
      </form>
    </main>
  );
}
