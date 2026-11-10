import { useState } from "react";
import * as companiesApi from "../../api/companies";
import ErrorMessage from "../ui/ErrorMessage";
import { useAction } from "../../hooks/useAction";
import { useApi } from "../../hooks/useApi";
import { useDebounced } from "../../hooks/useDebounced";

/** Tamanho mínimo da pesquisa (igual ao do servidor). */
const MIN_CHARS = 2;

/**
 * Pesquisa de empresas para adicionar às preferidas. Procura por nome da empresa,
 * nome do profissional, tipo de serviço e endereço/cidade.
 *
 * @param {object} props
 * @param {number[]} props.favoriteIds IDs das empresas já adicionadas.
 * @param {(id: number) => Promise<void>} props.onAdd Adiciona a empresa às preferidas.
 */
export default function CompanySearch({ favoriteIds, onAdd }) {
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const active = q.length >= MIN_CHARS;
  const { data: results, error: searchError } = useApi(
    () => (active ? companiesApi.searchCompanies({ q }) : Promise.resolve([])), [q]);
  const { error, busy, run } = useAction();

  return (
    <div className="search">
      <input type="search" value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Pesquisar por empresa, profissional, serviço ou cidade"
        aria-label="Pesquisar empresas" />
      <ErrorMessage message={error || searchError} />
      {active && results?.length === 0 && <p className="muted">Nenhuma empresa encontrada.</p>}
      {active && results?.length > 0 && (
        <ul className="list">
          {results.map((c) => (
            <li key={c.id}>
              <div>
                <strong>{c.name}</strong>
                <span className="muted">{[c.category, c.city, c.address].filter(Boolean).join(" · ")}</span>
              </div>
              {favoriteIds.includes(c.id)
                ? <span className="muted">Adicionada</span>
                : <button type="button" disabled={busy} onClick={() => run(() => onAdd(c.id))}>Adicionar</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
