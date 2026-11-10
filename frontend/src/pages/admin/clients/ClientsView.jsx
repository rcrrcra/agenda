import { useState } from "react";
import * as adminApi from "../../../api/admin";
import ErrorMessage from "../../../components/ui/ErrorMessage";
import { List, ListRow } from "../../../components/ui/List";
import { useApi } from "../../../hooks/useApi";
import { useDebounced } from "../../../hooks/useDebounced";
import ClientDetail from "./ClientDetail";
import { clientSummary } from "./clientSummary";

/**
 * Clientes da empresa: busca por nome/e-mail, filtro "só quem falta com frequência" e histórico de cada um.
 * Quem falta com frequência aparece com alerta (aviso para a equipe; o cliente continua podendo agendar).
 */
export default function ClientsView() {
  const [q, setQ] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [openId, setOpenId] = useState(null);
  const dq = useDebounced(q.trim());
  const { data: list, error } = useApi(
    () => adminApi.listClients({ ...(dq ? { q: dq } : {}), ...(onlyFlagged ? { flagged: "1" } : {}) }), [dq, onlyFlagged]);

  if (openId) return <ClientDetail id={openId} onBack={() => setOpenId(null)} />;

  return (
    <section className="card">
      <input type="search" placeholder="Buscar cliente por nome ou e-mail" aria-label="Buscar clientes"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="check">
        <input type="checkbox" checked={onlyFlagged} onChange={(e) => setOnlyFlagged(e.target.checked)} />
        Só quem falta com frequência
      </label>
      <ErrorMessage message={error} />
      {list?.length === 0 && <p className="muted">Nenhum cliente encontrado.</p>}
      <List>
        {list?.map((c) => (
          <ListRow key={c.id} title={<>{c.name} {c.flagged && <span className="flag">⚠ falta com frequência</span>}</>}
            actions={<button type="button" onClick={() => setOpenId(c.id)}>Ver histórico</button>}>
            <span className="muted">{c.email}</span>
            <span className="muted">{clientSummary(c)}</span>
          </ListRow>
        ))}
      </List>
    </section>
  );
}
