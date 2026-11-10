import { useState } from "react";
import * as adminApi from "../../../api/admin";
import Field from "../../../components/ui/Field";
import { List, ListRow } from "../../../components/ui/List";
import { useApi } from "../../../hooks/useApi";
import { useDebounced } from "../../../hooks/useDebounced";

/**
 * Busca e seleção de um cliente da empresa (quem já agendou nela).
 * @param {object} props
 * @param {{id: number, name: string, email: string}|null} props.value Cliente escolhido.
 * @param {(customer: object|null) => void} props.onChange Escolher (objeto) ou trocar (null).
 */
export default function CustomerPicker({ value, onChange }) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query); // evita uma consulta por tecla
  const { data: found } = useApi(() => adminApi.searchCustomers(debouncedQuery), [debouncedQuery]);

  if (value) {
    return (
      <p className="row">
        <strong>{value.name || value.email}</strong>
        <span className="muted">{value.email}</span>
        <button type="button" className="link" onClick={() => onChange(null)}>Trocar</button>
      </p>
    );
  }

  return (
    <>
      <Field label="Buscar por nome ou e-mail">
        <input value={query} onChange={(e) => setQuery(e.target.value)} />
      </Field>
      {found?.length === 0 && <p className="muted">Nenhum cliente desta empresa encontrado. Quem nunca agendou aqui entra por "Novo cliente".</p>}
      <List>
        {found?.map((c) => (
          <ListRow key={c.id} title={c.name || c.email}
            actions={<button type="button" onClick={() => onChange(c)}>Escolher</button>}>
            <span className="muted">{c.email}</span>
          </ListRow>
        ))}
      </List>
    </>
  );
}
