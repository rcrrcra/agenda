import { useState } from "react";
import * as platformApi from "../../api/platform";
import ErrorMessage from "../../components/ui/ErrorMessage";
import { List } from "../../components/ui/List";
import { useDebounced } from "../../hooks/useDebounced";
import { useApi } from "../../hooks/useApi";
import CompanyRow from "./CompanyRow";
import NewCompanyForm from "./NewCompanyForm";

/** Todas as empresas da plataforma, com busca, filtro de situação e cadastro de nova empresa. */
export default function CompaniesView() {
  const [q, setQ] = useState("");
  const [active, setActive] = useState("");
  const [creating, setCreating] = useState(false);
  const dq = useDebounced(q.trim());
  const { data: list, error, reload } = useApi(
    () => platformApi.listCompanies({ ...(dq ? { q: dq } : {}), ...(active ? { active } : {}) }), [dq, active]);

  if (creating) {
    return <NewCompanyForm onCancel={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />;
  }

  return (
    <section className="card">
      <div className="actions"><button type="button" className="primary" onClick={() => setCreating(true)}>Nova empresa</button></div>
      <div className="grid2">
        <input type="search" placeholder="Buscar por nome, cidade ou e-mail do administrador" aria-label="Buscar empresas"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Situação" value={active} onChange={(e) => setActive(e.target.value)}>
          <option value="">Todas</option>
          <option value="true">Ativas</option>
          <option value="false">Desativadas</option>
        </select>
      </div>
      <ErrorMessage message={error} />
      {list?.length === 0 && <p className="muted">Nenhuma empresa encontrada.</p>}
      <List>{list?.map((c) => <CompanyRow key={c.id} company={c} onChanged={reload} />)}</List>
    </section>
  );
}
