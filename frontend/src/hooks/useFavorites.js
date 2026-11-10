import { useCallback } from "react";
import * as companiesApi from "../api/companies";
import { useApi } from "./useApi";

/**
 * Empresas preferidas do cliente, com adicionar/remover.
 * Depois de cada alteração recarrega a lista do servidor (fonte da verdade).
 *
 * @returns {{favorites: object[]|null, error: string, add: (id: number) => Promise<void>,
 *   remove: (id: number) => Promise<void>}} `favorites` é `null` até carregar.
 */
export function useFavorites() {
  const { data: favorites, error, reload } = useApi(companiesApi.listFavorites);

  const add = useCallback(async (id) => { await companiesApi.addFavorite(id); await reload(); }, [reload]);
  const remove = useCallback(async (id) => { await companiesApi.removeFavorite(id); await reload(); }, [reload]);

  return { favorites, error, add, remove };
}
