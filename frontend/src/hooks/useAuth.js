import { useCallback, useEffect, useState } from "react";
import { getMe, logoutAllRequest, logoutRequest } from "../api/auth";
import { LOGOUT_EVENT, token } from "../api/client";

/**
 * Gerencia a sessão do usuário.
 *
 * Ao montar, se houver token salvo, busca o usuário. Também escuta o evento
 * disparado pelo cliente HTTP quando o servidor recusa o token.
 *
 * @returns {{user: object|null, setUser: Function, ready: boolean, logout: () => void, logoutAll: () => void, refreshUser: () => Promise<void>}}
 *   `ready` fica `true` quando a verificação inicial terminou; `refreshUser` recarrega os dados
 *   do usuário (ex.: depois de cadastrar ou renomear uma empresa).
 */
export function useAuth() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener(LOGOUT_EVENT, onLogout);
    if (token.get()) getMe().then(setUser).catch(() => {}).finally(() => setReady(true));
    else setReady(true);
    return () => window.removeEventListener(LOGOUT_EVENT, onLogout);
  }, []);

  /** Encerra a sessão: avisa o servidor (para invalidar o token) e limpa o estado local, mesmo se a chamada falhar. */
  const end = useCallback((request) => {
    request().catch(() => {}).finally(() => {
      token.clear();
      setUser(null);
    });
  }, []);
  const logout = useCallback(() => end(logoutRequest), [end]);
  /** Encerra a sessão em todos os dispositivos. */
  const logoutAll = useCallback(() => end(logoutAllRequest), [end]);

  /** Busca de novo o usuário (e suas empresas) no servidor. */
  const refreshUser = useCallback(() => getMe().then(setUser), []);

  return { user, setUser, ready, logout, logoutAll, refreshUser };
}
