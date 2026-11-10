import * as platformApi from "../../api/platform";
import UserPicker from "../../components/company/UserPicker";
import ErrorMessage from "../../components/ui/ErrorMessage";
import { useAction } from "../../hooks/useAction";

/**
 * Uma empresa na visão do dono: totais, ativar/desativar e administradores
 * (adicionar pesquisando usuários cadastrados e remover).
 *
 * @param {object} props
 * @param {object} props.company Empresa vinda de `/platform/companies/`.
 * @param {() => void} props.onChanged Recarrega a lista após uma alteração.
 */
export default function CompanyRow({ company: c, onChanged }) {
  const { error, busy, run } = useAction();

  /** Executa a ação e recarrega a lista se deu certo. */
  const act = async (fn) => { if (await run(fn)) onChanged(); };

  /** Adiciona como administrador o usuário escolhido na pesquisa (o nome de usuário é único). */
  const addMember = (user) => act(() => platformApi.addMember(c.id, user.username));

  return (
    <li className={c.active ? "platformRow" : "platformRow canceled"}>
      <div className="grow">
        <strong>{c.name}{c.active ? "" : " (desativada)"}</strong>
        <span className="muted">{[c.category, c.city].filter(Boolean).join(" · ")}</span>
        <span className="muted">
          {c.professionals_count} profissional(is) · {c.services_count} serviço(s) · {c.appointments_count} agendamento(s)
        </span>
        <div className="members">
          <span className="muted">Administradores:</span>
          {c.members.length === 0 && <span className="muted"> nenhum</span>}
          {c.members.map((m) => (
            <span className="chip" key={m.id}>
              {m.name || m.username} ({m.email || m.username})
              <button type="button" disabled={busy} aria-label={`Remover ${m.name || m.username}`}
                onClick={() => act(() => platformApi.removeMember(c.id, m.id))}>×</button>
            </span>
          ))}
        </div>
        <UserPicker label={`Novo administrador de ${c.name}`} placeholder="Adicionar administrador: digite nome ou e-mail"
          excludeIds={c.members.map((m) => m.id)} disabled={busy} onPick={addMember} />
        <ErrorMessage message={error} />
      </div>
      <button type="button" disabled={busy} onClick={() => act(() => platformApi.setCompanyActive(c.id, !c.active))}>
        {c.active ? "Desativar" : "Ativar"}
      </button>
    </li>
  );
}
