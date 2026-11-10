import type { Request } from "express";
import type { Prisma, AuthSession } from "../generated/prisma/client";

/** Usuário autenticado, já com as empresas que administra. */
export type AuthUser = Prisma.UserGetPayload<{ include: { memberships: { include: { company: true } } } }>;

export interface Req extends Request {
  user?: AuthUser;
  authSession?: AuthSession;
}
