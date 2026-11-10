import { useCallback, useState } from "react";
import { setActiveCompany } from "../api/client";

const KEY = "agenda_company";

/**
 * Empresa que o usuário está administrando no painel.
 *
 * A escolha é lembrada no navegador; se a empresa salva não pertencer ao usuário
 * (ex.: outra conta), cai para a primeira da lista.
 *
 * @param {{companies?: {id: number, name: string, slug: string}[]}|null} user Usuário logado.
 * @returns {{company: object|null, companies: object[], select: (id: number) => void}}
 *   `company` é `null` quando o usuário ainda não administra nenhuma empresa.
 */
export function useActiveCompany(user) {
  const companies = user?.companies || [];
  const [savedId, setSavedId] = useState(() => Number(localStorage.getItem(KEY)) || null);
  const company = companies.find((c) => c.id === savedId) || companies[0] || null;

  // Atribuição direta (idempotente) durante a renderização: precisa valer ANTES dos efeitos dos
  // componentes filhos, que disparam as chamadas `/admin/`; um useEffect aqui rodaria tarde demais.
  setActiveCompany(company?.id ?? null);

  /** Troca a empresa administrada e lembra a escolha. */
  const select = useCallback((id) => {
    localStorage.setItem(KEY, String(id));
    setSavedId(id);
  }, []);

  return { company, companies, select };
}
