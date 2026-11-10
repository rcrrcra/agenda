/** Endpoints de autenticação. */
import { get, post } from "./client";

/** Entra com e-mail OU nome de usuário e senha. Retorna `{ token, user }`. */
export const login = (identifier, password) => post("/auth/login/", { email: identifier, password });

/** Cria uma conta (ou assume a criada pelo painel). Retorna `{ token, user }`. */
export const register = (name, email, password) => post("/auth/register/", { name, email, password });

/** Dados do usuário logado (`id`, `name`, `email`, `is_staff`, `is_superuser` e `companies`: empresas que ele administra). */
export const getMe = () => get("/auth/me/");

/** Encerra a sessão deste dispositivo no servidor. */
export const logoutRequest = () => post("/auth/logout/");

/** Encerra as sessões de TODOS os dispositivos da conta. */
export const logoutAllRequest = () => post("/auth/logout-all/");
