// Sobe um Postgres embutido (só para testes), aplica a migração e fica rodando até receber SIGTERM.
// Uso: node test/pg-server.mjs [porta]   -> imprime "READY <url>" quando pronto.
import EmbeddedPostgres from "embedded-postgres";
import { chmodSync, mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const port = Number(process.argv[2] ?? 54331);
const dir = mkdtempSync(join(tmpdir(), "pgtest-"));
chmodSync(dir, 0o777); // como root, o initdb roda como outro usuário e precisa escrever aqui
const server = new EmbeddedPostgres({ databaseDir: join(dir, "data"), user: "postgres", password: "pw", port, persistent: false,
  postgresFlags: ["-c", `unix_socket_directories=${dir}`] });
await server.initialise();
await server.start();
await server.createDatabase("agenda");
const url = `postgresql://postgres:pw@localhost:${port}/agenda`;
const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../prisma/migrations/0001_init/migration.sql"), "utf8"));
await c.end();
console.log("READY " + url);
const stop = async () => { await server.stop(); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
setInterval(() => {}, 1 << 30);
