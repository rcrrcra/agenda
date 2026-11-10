import { useState } from "react";
import * as adminApi from "../../../api/admin";
import ErrorMessage from "../../../components/ui/ErrorMessage";
import { List, ListRow } from "../../../components/ui/List";
import { useApi } from "../../../hooks/useApi";
import ProfessionalForm from "./ProfessionalForm";
import { blankProfessional, toFormState } from "./professionalFormState";

/** Lista de profissionais; ao criar/editar troca para o formulário completo. */
export default function ProfessionalsView() {
  const { data: list, error, reload } = useApi(adminApi.professionals.list);
  const { data: services } = useApi(adminApi.services.list);
  const { data: company } = useApi(adminApi.getCompany);
  const [editing, setEditing] = useState(null); // estado do formulário em edição (ou null)

  if (editing) {
    return (
      <ProfessionalForm
        initial={editing}
        services={services || []}
        onClose={(changed) => { setEditing(null); if (changed) reload(); }}
      />
    );
  }

  return (
    <section className="card">
      <ErrorMessage message={error} />
      <button type="button" className="primary" onClick={() => setEditing(blankProfessional(company?.opening_hours))}>Novo profissional</button>
      {list?.length === 0 && <p className="muted">Nenhum profissional cadastrado.</p>}
      <List>
        {list?.map((p) => (
          <ListRow key={p.id} title={`${p.name}${p.active ? "" : " (inativo)"}`} dimmed={!p.active}
            actions={<button type="button" onClick={() => setEditing(toFormState(p))}>Editar</button>}>
            <span className="muted">
              {p.offers.length} serviço(s) · {p.working_hours.length} faixa(s) de atendimento · grade padrão de {p.slot_minutes} min
            </span>
          </ListRow>
        ))}
      </List>
    </section>
  );
}
