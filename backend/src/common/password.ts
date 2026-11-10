/**
 * Senhas no formato do Django (`pbkdf2_sha256$iterações$sal$hash`), para que usuários exportados do Django
 * continuem entrando com a mesma senha. Hash que começa com "!" = senha inutilizável (conta criada pelo painel).
 */
import { pbkdf2, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(pbkdf2);
const ITERATIONS = 600_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(12).toString("base64url");
  const hash = await pbkdf2Async(password, salt, ITERATIONS, 32, "sha256");
  return `pbkdf2_sha256$${ITERATIONS}$${salt}$${hash.toString("base64")}`;
}

/** Hash de senha inutilizável (ninguém consegue entrar até a pessoa definir uma senha ao se cadastrar). */
export const unusablePassword = (): string => "!" + randomBytes(20).toString("hex");

export const hasUsablePassword = (hash: string): boolean => !!hash && !hash.startsWith("!");

export async function checkPassword(password: string, encoded: string): Promise<boolean> {
  if (!hasUsablePassword(encoded)) return false;
  const [algo, iter, salt, hash] = encoded.split("$");
  if (algo !== "pbkdf2_sha256" || !iter || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const got = await pbkdf2Async(password, salt, Number(iter), expected.length, "sha256");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

// Subconjunto das senhas mais comuns com 8+ caracteres (o Django usa uma lista maior).
const COMMON = new Set(`password password1 password12 password123 passw0rd p@ssword p@ssw0rd 12345678 123456789 1234567890 123123123
12341234 11111111 00000000 87654321 987654321 1q2w3e4r 1q2w3e4r5t 1qaz2wsx qwertyui qwertyuiop qwerty12 qwerty123 qwerty1234
qwerty12345 abcd1234 abc12345 abc123456 abcdefgh a1b2c3d4 iloveyou iloveyou1 letmein1 welcome1 welcome123 admin123 admin1234 administrator
changeme trustno1 sunshine monkey123 dragon123 football1 baseball1 superman master123 michael1 shadow123 princess1 starwars
senha123 senha1234 senha12345 minhasenha mudar123 mudar1234 brasil123 brasil2020 brasil2021 brasil2022 brasil2023 brasil2024
corinthians flamengo1 flamengo123 palmeiras saopaulo1 gremio123 internacional 12qwaszx zaq12wsx asdfghjk asdfghjkl zxcvbnm1 zxcvbnm123
qazwsxedc 123qweasd 123qwe123 qwe12345 qweasdzxc pass1234 pass12345 test1234 testing123 teste123 teste1234 usuario123 login123
computer1 internet1 football baseball basketball whatever starwars1 passpass 00000001 10203040 147258369 159753456 741852963
123456a 123456aa 1234567a a1234567 a12345678 aa123456 aaaaaaaa bbbbbbbb`.split(/\s+/));

/** Regras do Django: mínimo de 8 caracteres, não comum, não só números. Devolve as mensagens de erro. */
export function passwordErrors(password: string): string[] {
  const out: string[] = [];
  if (password.length < 8) out.push("Esta senha é muito curta. Ela precisa conter pelo menos 8 caracteres.");
  if (COMMON.has(password.toLowerCase())) out.push("Esta senha é muito comum.");
  if (/^\d+$/.test(password)) out.push("Esta senha é inteiramente numérica.");
  return out;
}
