import { useState } from "react";
import * as platformApi from "../../api/platform";
import ErrorMessage from "../../components/ui/ErrorMessage";
import { List, ListRow } from "../../components/ui/List";
import { useAction } from "../../hooks/useAction";
import { useApi } from "../../hooks/useApi";
import { useDebounced } from "../../hooks/useDebounced";
import { ROLE_LABELS } from "../../utils/constants";
import NewUserForm from "./NewUserForm";
import UserDataEditor from "./UserDataEditor";

/**
 * Perfil de um usuário na lista do dono: mostra o perfil atual e permite trocá-lo
 * (cliente, administrador de estabelecimento — escolhendo a empresa — ou admin geral).
 * O próprio dono não altera o próprio perfil.
 */
function RoleEditor({ user, companies, disabled, onChange }) {
  const [role, setRole] = useState(user.role);
  const [company, setCompany] = useState(user.companies[0]?.id ? String(user.companies[0].id) : "");
  const needsCompany = role === "company_admin";
  const changed = role !== user.role || (needsCompany && company && String(user.companies[0]?.id) !== company);
  return (
    <div className="rangeRow">
      <select aria-label={`Perfil de ${user.name || user.username}`} value={role} disabled={disabled}
        onChange={(e) => setRole(e.target.value)}>
        {Object.entries(ROLE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
      </select>
      {needsCompany && (
        <select aria-label="Estabelecimento" value={company} disabled={disabled} onChange={(e) => setCompany(e.target.value)}>
          <option value="">Escolha o estabelecimento</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <button type="button" disabled={disabled || !changed || (needsCompany && !company)}
        onClick={() => confirm(`Alterar o perfil de ${user.name || user.username} para "${ROLE_LABELS[role]}"?`) && onChange(role, company)}>
        Salvar perfil
      </button>
    </div>
  );
}

/**
 * Usuários da plataforma, com busca, perfil (só o admin geral altera) e ativar/desativar o acesso.
 * @param {{me?: {id: number}}} props `me` é o usuário logado (o próprio perfil não pode ser alterado).
 */
export default function UsersView({ me }) {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const { data: list, error, reload } = useApi(() => platformApi.listUsers(dq), [dq]);
  const { data: companies } = useApi(() => platformApi.listCompanies());
  const { error: actionError, busy, run } = useAction();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // usuário com os dados em edição

  /** Alterna o acesso do usuário e recarrega a lista. */
  const toggle = async (u) => {
    if (await run(() => platformApi.setUserActive(u.id, !u.is_active))) reload();
  };

  /** Troca o perfil do usuário (e a empresa, quando for administrador de estabelecimento). */
  const changeRole = async (u, role, company) => {
    if (await run(() => platformApi.setUserRole(u.id, role, company))) reload();
  };

  if (creating) {
    return <NewUserForm companies={companies || []} onCancel={() => setCreating(false)}
      onDone={() => { setCreating(false); reload(); }} />;
  }

  if (editing) {
    return <UserDataEditor user={editing} onCancel={() => setEditing(null)} onDone={() => { setEditing(null); reload(); }} />;
  }

  return (
    <section className="card">
      <button type="button" className="primary" onClick={() => setCreating(true)}>Novo usuário</button>
      <input type="search" placeholder="Buscar por nome, e-mail ou usuário" aria-label="Buscar usuários"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorMessage message={error || actionError} />
      {list?.length === 0 && <p className="muted">Nenhum usuário encontrado.</p>}
      <List>
        {list?.map((u) => (
          <ListRow key={u.id} title={`${u.name || u.username}${u.is_active ? "" : " (desativado)"}`}
            dimmed={!u.is_active}
            actions={(
              <div className="actions">
                <button type="button" disabled={busy} onClick={() => setEditing(u)}>Editar dados</button>
                {!u.is_superuser && <button type="button" disabled={busy} onClick={() => toggle(u)}>{u.is_active ? "Desativar" : "Ativar"}</button>}
              </div>
            )}>
            <span className="muted">{u.email || u.username} · {ROLE_LABELS[u.role]}
              {u.companies.length > 0 && ` (${u.companies.map((c) => c.name).join(", ")})`} · {u.appointments_count} agendamento(s)</span>
            <RoleEditor key={`${u.id}-${u.role}-${u.companies.map((c) => c.id)}`} user={u} companies={companies || []}
              disabled={busy || u.id === me?.id} onChange={(role, company) => changeRole(u, role, company)} />
          </ListRow>
        ))}
      </List>
    </section>
  );
}
