/** Erros no mesmo formato do Django REST: `{detail: "..."}` ou `{campo: ["..."]}`; o front só precisa achatar. */
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import type { Response } from "express";

export class ApiError extends HttpException {
  constructor(status: number, body: Record<string, unknown>, readonly headers: Record<string, string> = {}) {
    super(body, status);
  }
}

/** 400 com `{detail}`. */
export const bad = (detail: string) => new ApiError(400, { detail });
/** 400 com erro de um campo. */
export const fieldError = (field: string, msg: string | string[]) =>
  new ApiError(400, { [field]: Array.isArray(msg) ? msg : [msg] });
export const forbidden = (detail = "Você não tem permissão para executar essa ação.") => new ApiError(403, { detail });
export const notFound = (detail = "Não encontrado.") => new ApiError(404, { detail });
export const unauthorized = (detail: string) => new ApiError(401, { detail });

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger("API");

  catch(error: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (error instanceof ApiError) {
      for (const [k, v] of Object.entries(error.headers)) res.setHeader(k, v);
      return res.status(error.getStatus()).json(error.getResponse());
    }
    if (error instanceof HttpException) {
      const body: any = error.getResponse();
      const message = typeof body === "string" ? body : Array.isArray(body?.message) ? body.message.join(" ") : body?.message;
      const status = error.getStatus();
      return res.status(status).json({ detail: status === 404 ? "Não encontrado." : message || "Erro." });
    }
    // Erros do multer (arquivo grande demais etc.)
    const code = (error as any)?.code;
    if (typeof code === "string" && code.startsWith("LIMIT_")) {
      return res.status(400).json({ image: ["A imagem deve ter no máximo 4 MB."] });
    }
    if ((error as any)?.type === "entity.parse.failed") {
      return res.status(400).json({ detail: "JSON inválido." });
    }
    this.log.error(error instanceof Error ? error.stack ?? error.message : String(error));
    return res.status(500).json({ detail: "Erro interno do servidor." });
  }
}
