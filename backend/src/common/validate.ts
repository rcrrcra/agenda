/** Validação de entrada com mensagens iguais às do DRF (pt-BR). Acumula erros por campo e lança 400 em `done()`. */
import { ApiError } from "./api-error";
import { isYmd, parseDateTime } from "./tz";

const REQUIRED = "Este campo é obrigatório.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class V {
  readonly errors: Record<string, unknown> = {};

  /** `partial`: PATCH — campos ausentes não são obrigatórios. */
  constructor(readonly data: Record<string, any>, readonly partial = false) {
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      throw new ApiError(400, { detail: "Dados inválidos. Esperado um objeto." });
    }
  }

  has = (f: string) => this.data[f] !== undefined;

  fail(field: string, msg: string) {
    const cur = (this.errors[field] as string[]) ?? [];
    this.errors[field] = [...cur, msg];
  }

  /** Verifica ausência/nulo. Retorna `true` quando já tratou o valor (ausente, nulo ou erro). */
  private missing(f: string, required: boolean, nullable: boolean): boolean {
    const v = this.data[f];
    if (v === undefined) {
      if (required && !this.partial) this.fail(f, REQUIRED);
      return true;
    }
    if (v === null) {
      if (!nullable) this.fail(f, "Este campo não pode ser nulo.");
      return true;
    }
    return false;
  }

  str(f: string, o: { max?: number; required?: boolean; blank?: boolean; trim?: boolean } = {}): string | undefined {
    const { max, required = true, blank = false, trim = true } = o;
    if (this.missing(f, required, false)) return undefined;
    const raw = this.data[f];
    if (typeof raw !== "string") {
      this.fail(f, "Not a valid string.");
      return undefined;
    }
    const v = trim ? raw.trim() : raw;
    if (!v && !blank) {
      this.fail(f, "Este campo não pode ser em branco.");
      return undefined;
    }
    if (max && v.length > max) {
      this.fail(f, `Certifique-se de que este campo não tenha mais de ${max} caracteres.`);
      return undefined;
    }
    return v;
  }

  email(f: string, o: { required?: boolean; max?: number } = {}): string | undefined {
    const v = this.str(f, { max: o.max ?? 254, required: o.required });
    if (v !== undefined && !EMAIL_RE.test(v)) {
      this.fail(f, "Insira um endereço de e-mail válido.");
      return undefined;
    }
    return v;
  }

  /** Inteiro; `null` só é aceito com `nullable` (retorna `null`). */
  int(f: string, o: { min?: number; max?: number; required?: boolean; nullable?: boolean } = {}): number | null | undefined {
    const { min, max, required = true, nullable = false } = o;
    if (this.missing(f, required, nullable)) return this.data[f] === null && nullable ? null : undefined;
    const raw = this.data[f];
    const n = typeof raw === "number" ? raw : typeof raw === "string" && /^-?\d+$/.test(raw.trim()) ? Number(raw) : NaN;
    if (raw === "" && nullable) return null;
    if (!Number.isInteger(n)) {
      this.fail(f, "Um número inteiro válido é necessário.");
      return undefined;
    }
    if (min !== undefined && n < min) {
      this.fail(f, `Certifique-se de que este valor seja maior ou igual a ${min}.`);
      return undefined;
    }
    if (max !== undefined && n > max) {
      this.fail(f, `Certifique-se de que este valor seja menor ou igual a ${max}.`);
      return undefined;
    }
    return n;
  }

  bool(f: string, o: { required?: boolean } = {}): boolean | undefined {
    if (this.missing(f, o.required ?? false, false)) return undefined;
    const v = this.data[f];
    if (typeof v === "boolean") return v;
    if (["true", "True", "1", 1].includes(v)) return true;
    if (["false", "False", "0", 0].includes(v)) return false;
    this.fail(f, `O valor “${v}” não é um booleano válido.`);
    return undefined;
  }

  /** Decimal em texto com `places` casas (ex.: "60.00"); aceita vírgula. `null`/"" só com `nullable`. */
  decimal(f: string, o: { digits: number; places: number; required?: boolean; nullable?: boolean }): string | null | undefined {
    const { digits, places, required = false, nullable = false } = o;
    if (this.missing(f, required, nullable)) return this.data[f] === null && nullable ? null : undefined;
    const raw = this.data[f];
    if (raw === "" && nullable) return null;
    const s = String(raw).trim().replace(",", ".");
    if (!/^-?\d+(\.\d+)?$/.test(s)) {
      this.fail(f, "Um número válido é necessário.");
      return undefined;
    }
    const [int, frac = ""] = s.replace("-", "").split(".");
    if (frac.length > places) {
      this.fail(f, `Certifique-se de que não tenha mais de ${places} casas decimais.`);
      return undefined;
    }
    if (int.replace(/^0+(?=\d)/, "").length > digits - places) {
      this.fail(f, `Certifique-se de que não tenha mais de ${digits - places} dígitos antes do ponto decimal.`);
      return undefined;
    }
    if (Number(s) < 0) {
      this.fail(f, "Certifique-se de que este valor seja maior ou igual a 0.");
      return undefined;
    }
    return Number(s).toFixed(places);
  }

  /** AAAA-MM-DD. */
  date(f: string, o: { required?: boolean } = {}): string | undefined {
    if (this.missing(f, o.required ?? true, false)) return undefined;
    const v = this.data[f];
    if (!isYmd(v)) {
      this.fail(f, "Formato inválido para data. Use um dos formatos: YYYY-MM-DD.");
      return undefined;
    }
    return v;
  }

  /** HH:MM ou HH:MM:SS → normalizado "HH:MM:SS". */
  time(f: string, o: { required?: boolean } = {}): string | undefined {
    if (this.missing(f, o.required ?? true, false)) return undefined;
    const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(String(this.data[f]).trim());
    if (!m) {
      this.fail(f, "Formato inválido para hora. Use um dos formatos: hh:mm[:ss[.uuuuuu]].");
      return undefined;
    }
    return `${m[1]}:${m[2]}:${m[3] ?? "00"}`;
  }

  dateTime(f: string, o: { required?: boolean } = {}): Date | undefined {
    if (this.missing(f, o.required ?? true, false)) return undefined;
    const d = parseDateTime(this.data[f]);
    if (!d) {
      this.fail(f, "Formato inválido para data e hora. Use um dos formatos: YYYY-MM-DDThh:mm[:ss[.uuuuuu]][+HH:MM|-HH:MM|Z].");
      return undefined;
    }
    return d;
  }

  /** Id numérico de outro registro (a existência é conferida por quem chama). */
  pk(f: string, o: { required?: boolean; nullable?: boolean } = {}): number | null | undefined {
    if (this.missing(f, o.required ?? true, o.nullable ?? false)) return this.data[f] === null && o.nullable ? null : undefined;
    const raw = this.data[f];
    const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n <= 0) {
      this.fail(f, `Pk inválido "${raw}" - objeto não existe.`);
      return undefined;
    }
    return n;
  }

  /** Lista de objetos; devolve cada item para validação aninhada. */
  list(f: string, o: { required?: boolean } = {}): Record<string, any>[] | undefined {
    if (this.missing(f, o.required ?? false, false)) return undefined;
    const v = this.data[f];
    if (!Array.isArray(v)) {
      this.fail(f, 'Esperava uma lista de itens mas recebeu tipo "' + typeof v + '".');
      return undefined;
    }
    return v;
  }

  /** Lança 400 se houve erro. */
  done() {
    if (Object.keys(this.errors).length) throw new ApiError(400, this.errors);
  }
}

/** Remove chaves `undefined` (útil para montar `data` do Prisma). */
export function defined<T extends Record<string, any>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

const snakeKey = (k: string) => k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const camelKey = (k: string) => k.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** `{firstName: 1}` → `{first_name: 1}` (chaves como no Django, usadas no log de auditoria). */
export const toSnake = (o: Record<string, any>): Record<string, any> => Object.fromEntries(Object.entries(o).map(([k, v]) => [snakeKey(k), v]));
/** `{first_name: 1}` → `{firstName: 1}` (dados para o Prisma). */
export const toCamel = (o: Record<string, any>): Record<string, any> => Object.fromEntries(Object.entries(o).map(([k, v]) => [camelKey(k), v]));
