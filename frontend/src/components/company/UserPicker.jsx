import { useState } from "react";
import * as platformApi from "../../api/platform";
import { useApi } from "../../hooks/useApi";
import { useDebounced } from "../../hooks/useDebounced";
import ErrorMessage from "../ui/ErrorMessage";

/** Mínimo de letras para começar a sugerir usuários. */
const MIN_CHARS = 2;
/** Máximo de sugestões mostradas. */
const MAX_SUGGESTIONS = 8;

/**
 * Campo com autocomplete de usuários (painel do dono): ao digitar, lista os usuários cujo
 * nome, e-mail ou nome de usuário contém o texto; clicar em um deles o escolhe.
 *
 * @param {object} props
 * @param {(user: {id: number, name: string, email: string, username: string}) => void} props.onPick
 *   Chamado com o usuário escolhido (o campo é limpo em seguida).
 * @param {number[]} [props.excludeIds] Usuários que não devem aparecer (ex.: quem já administra).
 * @param {string} [props.label] Texto de acessibilidade do campo.
 * @param {string} [props.placeholder] Texto de ajuda dentro do campo.
 * @param {boolean} [props.disabled] Desabilita o campo (ex.: enquanto salva).
 */
export default function UserPicker({ onPick, excludeIds = [], label = "Buscar usuário", placeholder = "Digite nome, e-mail ou usuário", disabled }) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const active = q.length >= MIN_CHARS;
  const { data, error } = useApi(
    // pede um pouco mais que o necessário porque os já excluídos são descartados no cliente
    () => (active ? platformApi.listUsers(q, MAX_SUGGESTIONS + excludeIds.length) : Promise.resolve([])), [q]);
  const options = (data || []).filter((u) => !excludeIds.includes(u.id)).slice(0, MAX_SUGGESTIONS);

  /** Escolhe o usuário e limpa o campo. */
  const pick = (user) => {
    setText("");
    onPick(user);
  };

  return (
    <div className="userPicker">
      <input type="search" autoComplete="off" aria-label={label} placeholder={placeholder}
        value={text} disabled={disabled} onChange={(e) => setText(e.target.value)} />
      <ErrorMessage message={error} />
      {text.trim().length >= MIN_CHARS && (
        <ul className="suggestions" role="listbox" aria-label="Usuários encontrados">
          {/* só mostra "nenhum" quando a busca atual já respondeu (evita piscar durante a digitação) */}
          {active && data && options.length === 0 && <li className="muted">Nenhum usuário encontrado.</li>}
          {options.map((u) => (
            <li key={u.id} role="option" aria-selected="false">
              <button type="button" disabled={disabled} onClick={() => pick(u)}>
                <strong>{u.name || u.username}</strong>
                <span className="muted">{u.email || u.username}{u.is_active ? "" : " · desativado"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
