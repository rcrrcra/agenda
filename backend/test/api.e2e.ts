/**
 * Teste de ponta a ponta: sobe um Postgres embutido com a migração, inicia a API e exercita as regras
 * descritas em docs/processos.md (perfis, agenda, concorrência, relatórios, auditoria, segurança de login).
 */
import request from "supertest";
import { DateTime } from "luxon";


const TZ = "America/Sao_Paulo";

let app: any, server: any, prisma: any;
const api = (m: "get" | "post" | "put" | "patch" | "delete", url: string, token?: string, company?: number) => {
  let r = (request(server) as any)[m]("/api" + url);
  if (token) r = r.set("Authorization", `Token ${token}`);
  if (company) r = r.set("X-Company", String(company));
  return r;
};

let owner = "", adminTok = "", clientTok = "", client2Tok = "";
let companyId = 0, proId = 0, serviceId = 0, clientId = 0;
const nextWeekday = (n: number) => { // próximo dia (n = 1 seg ... 5 sex) pelo menos 3 dias à frente
  let d = DateTime.now().setZone(TZ).plus({ days: 3 }).startOf("day");
  while (d.weekday !== n) d = d.plus({ days: 1 });
  return d;
};

beforeAll(async () => {
  // DATABASE_URL vem do `test/pg-server.mjs` (veja `npm test`).
  if (!process.env.DATABASE_URL) throw new Error("Defina DATABASE_URL (use npm test).");
  delete process.env.SUPABASE_URL;
  const { createApp } = require("../src/bootstrap");
  const { PrismaService } = require("../src/common/prisma.service");
  const { hashPassword } = require("../src/common/password");
  app = await createApp();
  await app.init();
  server = app.getHttpServer();
  prisma = app.get(PrismaService);
  await prisma.user.create({ data: { username: "dono@x.com", email: "dono@x.com", firstName: "Dono", passwordHash: await hashPassword("SenhaForte123"), isSuperuser: true, isStaff: true } });
});
afterAll(async () => { await app?.close(); });

describe("autenticação", () => {
  it("registra, valida senha e impede e-mail repetido", async () => {
    let r = await api("post", "/auth/register/").send({ name: "Ana", email: "ana@x.com", password: "12345678" });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/numérica|comum/);
    r = await api("post", "/auth/register/").send({ name: "Ana Cliente", email: "ANA@x.com", password: "Cliente#2026" });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe("client");
    expect(r.body.token).toHaveLength(48);
    clientTok = r.body.token; clientId = r.body.user.id;
    r = await api("post", "/auth/register/").send({ name: "Outra", email: "ana@x.com", password: "Cliente#2026" });
    expect(r.status).toBe(400);
    r = await api("post", "/auth/register/").send({ name: "Bia", email: "bia@x.com", password: "Cliente#2026" });
    client2Tok = r.body.token;
  });

  it("login por e-mail ou usuário, me, e 401 sem token", async () => {
    let r = await api("post", "/auth/login/").send({ email: "dono@x.com", password: "SenhaForte123" });
    expect(r.status).toBe(200);
    owner = r.body.token;
    expect(r.body.user.role).toBe("platform_admin");
    expect((await api("get", "/auth/me/", owner)).body.email).toBe("dono@x.com");
    expect((await api("get", "/auth/me/")).status).toBe(401);
    expect((await api("get", "/auth/me/", "tokeninvalido")).status).toBe(401);
  });

  it("bloqueia após 5 falhas (429 com Retry-After) e registra no log", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await api("post", "/auth/login/").send({ email: "bia@x.com", password: "errada" + i });
      expect(r.status).toBe(400);
    }
    const r = await api("post", "/auth/login/").send({ email: "bia@x.com", password: "Cliente#2026" });
    expect(r.status).toBe(429);
    expect(Number(r.headers["retry-after"])).toBeGreaterThan(0);
    expect(await prisma.auditLog.count({ where: { action: "auth.login_blocked" } })).toBe(1);
    await prisma.auditLog.deleteMany({ where: { action: "auth.login_failed" } }); // libera para o resto do teste
  });
});

describe("plataforma e perfis", () => {
  it("só o admin geral cadastra empresa e define administrador", async () => {
    expect((await api("post", "/platform/companies/", clientTok).send({ name: "X" })).status).toBe(403);
    let r = await api("post", "/platform/companies/", owner).send({ name: "Barbearia Exemplo", category: "Barbearia", city: "São Paulo", admin: "nao@existe.com" });
    expect(r.status).toBe(400);
    const adm = await api("post", "/platform/users/", owner).send({ name: "Gerente", email: "gerente@x.com", password: "Gerente#2026", role: "client" });
    expect(adm.status).toBe(201);
    r = await api("post", "/platform/companies/", owner).send({ name: "Barbearia Exemplo", category: "Barbearia", city: "São Paulo", admin: "gerente@x.com" });
    expect(r.status).toBe(201);
    expect(r.body.slug).toBe("barbearia-exemplo");
    expect(r.body.members).toHaveLength(1);
    companyId = r.body.id;
    const login = await api("post", "/auth/login/").send({ email: "gerente@x.com", password: "Gerente#2026" });
    adminTok = login.body.token;
    expect(login.body.user.role).toBe("company_admin");
    expect(login.body.user.companies[0].id).toBe(companyId);
  });

  it("ninguém altera o próprio perfil; desativar superusuário é recusado", async () => {
    const me = (await api("get", "/auth/me/", owner)).body;
    let r = await api("patch", `/platform/users/${me.id}/`, owner).send({ role: "client" });
    expect(r.status).toBe(400);
    r = await api("patch", `/platform/users/${me.id}/`, owner).send({ is_active: false });
    expect(r.status).toBe(400);
  });

  it("limite de empresas por usuário no cadastro próprio", async () => {
    expect((await api("put", "/platform/settings/", owner).send({ max_companies_per_user: 1 })).status).toBe(200);
    let r = await api("post", "/companies/register/", client2Tok).send({ name: "Salão da Bia", category: "Salão" });
    expect(r.status).toBe(201);
    r = await api("post", "/companies/register/", client2Tok).send({ name: "Segunda" });
    expect(r.status).toBe(400);
    await api("put", "/platform/settings/", owner).send({ max_companies_per_user: 10 });
  });
});

describe("painel: isolamento por empresa e CRUD", () => {
  it("exige X-Company e que o usuário administre a empresa", async () => {
    expect((await api("get", "/admin/services/", adminTok)).status).toBe(400);
    expect((await api("get", "/admin/services/", clientTok, companyId)).status).toBe(403);
    expect((await api("get", "/admin/services/", adminTok, companyId)).status).toBe(200);
    const other = await prisma.company.findFirst({ where: { slug: "salao-da-bia" } });
    expect((await api("get", "/admin/services/", adminTok, other.id)).status).toBe(403);
  });

  it("cria serviço e profissional com expediente, pausa e ofertas", async () => {
    let r = await api("post", "/admin/services/", adminTok, companyId).send({ name: "Corte", description: "Corte de cabelo" });
    expect(r.status).toBe(201);
    serviceId = r.body.id;
    const hours = [0, 1, 2, 3, 4].map((d) => ({ weekday: d, start_time: "09:00", end_time: "18:00", slot_minutes: null }));
    const breaks = [0, 1, 2, 3, 4].map((d) => ({ weekday: d, start_time: "12:00", end_time: "13:00", label: "Almoço" }));
    r = await api("post", "/admin/professionals/", adminTok, companyId).send({
      name: "Ana Souza", bio: "Cabeleireira", slot_minutes: 30, buffer_minutes: 10,
      offers: [{ service: serviceId, duration_minutes: 45, price: "60.00" }], working_hours: hours, breaks,
    });
    expect(r.status).toBe(201);
    proId = r.body.id;
    expect(r.body.offers[0].price).toBe("60.00");
    expect(r.body.working_hours[0].start_time).toBe("09:00:00");
    // serviço de outra empresa na oferta é recusado
    const other = await prisma.company.findFirst({ where: { slug: "salao-da-bia" } });
    const foreign = await prisma.service.create({ data: { companyId: other.id, name: "Escova" } });
    r = await api("put", `/admin/professionals/${proId}/`, adminTok, companyId).send({ name: "Ana Souza", offers: [{ service: foreign.id, duration_minutes: 30 }] });
    expect(r.status).toBe(400);
    // PATCH sem `offers` mantém a lista
    r = await api("patch", `/admin/professionals/${proId}/`, adminTok, companyId).send({ bio: "Nova bio" });
    expect(r.body.offers).toHaveLength(1);
    expect(r.body.working_hours).toHaveLength(5);
  });

  it("busca sem acento e por profissional/serviço", async () => {
    expect((await api("get", "/companies/search/?q=sao paulo barbearia", clientTok)).body.map((c: any) => c.slug)).toEqual(["barbearia-exemplo"]);
    expect((await api("get", "/companies/search/?q=ana souza", clientTok)).body).toHaveLength(1);
    expect((await api("get", "/companies/search/?q=a", clientTok)).body).toEqual([]);
  });
});

describe("agendamento", () => {
  const monday = () => nextWeekday(1);
  let apptId = 0;

  it("lista horários respeitando expediente, pausa e duração", async () => {
    const day = monday().toISODate();
    const r = await api("get", `/availability/?professional=${proId}&service=${serviceId}&date=${day}`, clientTok);
    expect(r.status).toBe(200);
    const times = r.body.slots.map((s: string) => DateTime.fromISO(s).setZone(TZ).toFormat("HH:mm"));
    expect(times[0]).toBe("09:00");
    expect(times).not.toContain("12:00");
    expect(times).not.toContain("12:30");
    expect(times).toContain("11:00");      // 11:00 + 45 min termina 11:45 (antes do almoço)
    expect(times).not.toContain("11:30");  // terminaria 12:15, invade o almoço
    expect(times[times.length - 1]).toBe("17:00"); // 17:30 + 45 > 18:00
  });

  it("reserva, congela preço, bloqueia horário duplicado e a folga entre atendimentos", async () => {
    const start = monday().set({ hour: 9 });
    let r = await api("post", "/appointments/", clientTok).send({ professional: proId, service: serviceId, start: start.toISO() });
    expect(r.status).toBe(201);
    apptId = r.body.id;
    expect(r.body.price).toBe("60.00");
    expect(r.body.status).toBe("confirmed");
    expect(DateTime.fromISO(r.body.end).toMillis() - DateTime.fromISO(r.body.start).toMillis()).toBe(45 * 60000);
    r = await api("post", "/appointments/", client2Tok).send({ professional: proId, service: serviceId, start: start.toISO() });
    expect(r.status).toBe(400);
    // 9:45 termina o atendimento; folga de 10 min => 9:30/10:00 ficam livres? 10:00 só começa após 9:45+10 = 9:55
    const slots = (await api("get", `/availability/?professional=${proId}&service=${serviceId}&date=${monday().toISODate()}`, clientTok)).body.slots
      .map((s: string) => DateTime.fromISO(s).setZone(TZ).toFormat("HH:mm"));
    expect(slots).not.toContain("09:30");
    expect(slots).toContain("10:00");
    // mudar o preço depois não altera o histórico
    await api("patch", `/admin/professionals/${proId}/`, adminTok, companyId).send({ offers: [{ service: serviceId, duration_minutes: 45, price: "99.00" }] });
    expect((await api("get", `/appointments/${apptId}/`, clientTok)).body.price).toBe("60.00");
  });

  it("corrida: reservas simultâneas no mesmo horário passam uma só", async () => {
    const start = monday().set({ hour: 14 }).toISO();
    const rs = await Promise.all([clientTok, client2Tok, clientTok, client2Tok].map((t) =>
      api("post", "/appointments/", t).send({ professional: proId, service: serviceId, start })));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
  });

  it("recusa horário fora da grade, passado e cliente de outra conta vendo agendamento", async () => {
    let r = await api("post", "/appointments/", clientTok).send({ professional: proId, service: serviceId, start: monday().set({ hour: 9, minute: 10 }).toISO() });
    expect(r.status).toBe(400);
    r = await api("post", "/appointments/", clientTok).send({ professional: proId, service: serviceId, start: monday().set({ hour: 6 }).toISO() });
    expect(r.status).toBe(400);
    expect((await api("get", `/appointments/${apptId}/`, client2Tok)).status).toBe(404);
  });

  it("feriado e folga bloqueiam o dia; painel informa quantos agendamentos atinge", async () => {
    const day = monday().toISODate();
    let r = await api("post", "/admin/time-off/", adminTok, companyId).send({ start_date: day, end_date: day, reason: "Feriado" });
    expect(r.status).toBe(201);
    expect(r.body.affected_appointments).toBe(2);
    const slots = await api("get", `/availability/?professional=${proId}&service=${serviceId}&date=${day}`, clientTok);
    expect(slots.body.slots).toEqual([]);
    await api("delete", `/admin/time-off/${r.body.id}/`, adminTok, companyId);
  });

  it("antecedência mínima vale para cliente, não para a equipe (staff=1)", async () => {
    await api("put", "/admin/company/", adminTok, companyId).send({ name: "Barbearia Exemplo", min_notice_hours: 24 * 30 });
    const day = monday().toISODate();
    expect((await api("get", `/availability/?professional=${proId}&service=${serviceId}&date=${day}`, clientTok)).body.slots).toEqual([]);
    const staff = await api("get", `/availability/?professional=${proId}&service=${serviceId}&date=${day}&staff=1`, adminTok);
    expect(staff.body.slots.length).toBeGreaterThan(0);
    const r = await api("post", "/appointments/", clientTok).send({ professional: proId, service: serviceId, start: monday().set({ hour: 16 }).toISO() });
    expect(r.status).toBe(400);
    await api("put", "/admin/company/", adminTok, companyId).send({ name: "Barbearia Exemplo", min_notice_hours: 0 });
  });

  it("equipe reserva para cliente novo (sem senha) e ele assume a conta ao se cadastrar", async () => {
    const start = monday().set({ hour: 16 }).toISO();
    let r = await api("post", "/admin/appointments/", adminTok, companyId).send({ professional: proId, service: serviceId, start, new_customer_name: "Carlos Balcão", new_customer_email: "Carlos@X.com" });
    expect(r.status).toBe(201);
    expect(r.body.customer_email).toBe("carlos@x.com");
    expect((await api("post", "/auth/login/").send({ email: "carlos@x.com", password: "qualquer" })).status).toBe(400);
    r = await api("post", "/auth/register/").send({ name: "Carlos", email: "carlos@x.com", password: "Carlos#2026" });
    expect(r.status).toBe(201);
    expect((await api("get", "/appointments/", r.body.token)).body).toHaveLength(1);
  });

  it("cliente cancela com antecedência mínima exigida; cancelado libera o horário", async () => {
    await api("put", "/admin/company/", adminTok, companyId).send({ name: "Barbearia Exemplo", cancel_notice_hours: 720 });
    let r = await api("post", `/appointments/${apptId}/cancel/`, clientTok);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain("antecedência");
    await api("put", "/admin/company/", adminTok, companyId).send({ name: "Barbearia Exemplo", cancel_notice_hours: 0 });
    r = await api("post", `/appointments/${apptId}/cancel/`, clientTok);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("canceled");
    const again = await api("post", "/appointments/", client2Tok).send({ professional: proId, service: serviceId, start: monday().set({ hour: 9 }).toISO() });
    expect(again.status).toBe(201);
  });
});

describe("atendimentos concluídos, avaliações, clientes e relatórios", () => {
  let pastIds: number[] = [];
  it("concluir/faltou só depois do início; reabrir; concluído não cancela", async () => {
    const future = (await api("get", "/admin/appointments/", adminTok, companyId)).body.find((a: any) => a.status === "confirmed");
    expect((await api("post", `/admin/appointments/${future.id}/complete/`, adminTok, companyId)).status).toBe(400);
    // cria atendimentos passados direto no banco (a API não aceita horário passado)
    const base = DateTime.now().setZone(TZ).minus({ days: 5 }).startOf("day");
    const mk = async (i: number, status: string, customerId: number) => (await prisma.appointment.create({ data: {
      professionalId: proId, serviceId, customerId, start: base.plus({ hours: 9 + i }).toJSDate(), end: base.plus({ hours: 9 + i, minutes: 45 }).toJSDate(),
      status: "confirmed", price: "60.00" } })).id;
    for (let i = 0; i < 4; i++) pastIds.push(await mk(i, "confirmed", clientId));
    expect((await api("post", `/admin/appointments/${pastIds[0]}/complete/`, adminTok, companyId)).body.status).toBe("completed");
    expect((await api("post", `/appointments/${pastIds[0]}/cancel/`, clientTok)).status).toBe(400);
    expect((await api("post", `/admin/appointments/${pastIds[1]}/no-show/`, adminTok, companyId)).body.status).toBe("no_show");
    expect((await api("post", `/admin/appointments/${pastIds[2]}/no-show/`, adminTok, companyId)).body.status).toBe("no_show");
    expect((await api("post", `/admin/appointments/${pastIds[3]}/reopen/`, adminTok, companyId)).body.status).toBe("confirmed");
    const pending = await api("get", "/admin/appointments/?status=pending", adminTok, companyId);
    expect(pending.body.map((a: any) => a.id)).toContain(pastIds[3]);
  });

  it("avaliação: só concluído, nota 1-5, pode alterar", async () => {
    expect((await api("post", `/appointments/${pastIds[1]}/review/`, clientTok).send({ rating: 5 })).status).toBe(400);
    expect((await api("post", `/appointments/${pastIds[0]}/review/`, clientTok).send({ rating: 7 })).status).toBe(400);
    let r = await api("post", `/appointments/${pastIds[0]}/review/`, clientTok).send({ rating: 4, comment: "Bom" });
    expect(r.body.review).toEqual({ rating: 4, comment: "Bom" });
    r = await api("post", `/appointments/${pastIds[0]}/review/`, clientTok).send({ rating: 5, comment: "Ótimo" });
    expect(r.body.review.rating).toBe(5);
  });

  it("clientes: 2 faltas em 2 finalizados... alerta (>=2 faltas e >=30%) e observações internas", async () => {
    const list = await api("get", "/admin/clients/?flagged=1", adminTok, companyId);
    expect(list.status).toBe(200);
    const row = list.body.find((c: any) => c.id === clientId);
    expect(row).toMatchObject({ completed: 1, no_show: 2, flagged: true });
    expect(row.no_show_rate).toBe(66.7);
    let r = await api("put", `/admin/clients/${clientId}/`, adminTok, companyId).send({ notes: "Cliente atrasa" });
    expect(r.body.notes).toBe("Cliente atrasa");
    expect(r.body.appointments.length).toBeGreaterThan(0);
    const flagged = (await api("get", "/admin/appointments/", adminTok, companyId)).body.filter((a: any) => a.customer_flagged);
    expect(flagged.length).toBeGreaterThan(0);
    const log = await prisma.auditLog.findFirst({ where: { action: "client.notes_update" } });
    expect(JSON.stringify(log.details)).not.toContain("atrasa"); // só o tamanho
    expect((await api("get", `/admin/clients/${clientId}/`, adminTok, companyId + 999)).status).toBe(403);
  });

  it("relatórios: totais, receita só de concluídos, escopo e exportações", async () => {
    const from = DateTime.now().setZone(TZ).minus({ days: 10 }).toISODate();
    const to = DateTime.now().setZone(TZ).plus({ days: 40 }).toISODate();
    let r = await api("get", `/reports/summary/?from=${from}&to=${to}`, adminTok);
    expect(r.status).toBe(200);
    expect(r.body.totals.completed).toBe(1);
    expect(r.body.totals.no_show).toBe(2);
    expect(r.body.totals.revenue).toBe(60);
    expect(r.body.totals.attendance_rate).toBe(33.3);
    expect(r.body.totals.rating_avg).toBe(5);
    expect(r.body.by_weekday).toHaveLength(7);
    expect(r.body.by_professional[0].label).toBe("Ana Souza");
    expect(r.body.customers.total).toBeGreaterThan(0);
    expect((await api("get", "/reports/summary/", clientTok)).status).toBe(403);
    const other = await prisma.company.findFirst({ where: { slug: "salao-da-bia" } });
    expect((await api("get", `/reports/summary/?company=${other.id}`, adminTok)).status).toBe(403);
    r = await api("get", `/reports/appointments/?from=${from}&to=${to}&ordering=-start&page_size=2`, adminTok);
    expect(r.body.results).toHaveLength(2);
    expect(r.body.count).toBeGreaterThan(2);
    r = await api("get", `/reports/export/?from=${from}&to=${to}`, adminTok);
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.text.charCodeAt(0)).toBe(0xfeff);
    expect(r.text.split("\n")[0]).toContain("Data;Início;Fim;Empresa");
    r = await api("get", `/reports/export-xlsx/?from=${from}&to=${to}`, adminTok).buffer(true).parse((res: any, cb: any) => { const c: Buffer[] = []; res.on("data", (d: Buffer) => c.push(d)); res.on("end", () => cb(null, Buffer.concat(c))); });
    expect(r.headers["content-type"]).toContain("spreadsheetml");
    expect(r.body.subarray(0, 2).toString()).toBe("PK");
  });
});

describe("página pública, favoritas, auditoria e sessões", () => {
  it("página pública sem login, sem dados de clientes", async () => {
    const r = await api("get", "/public/companies/barbearia-exemplo/");
    expect(r.status).toBe(200);
    expect(r.body.professionals[0].services[0]).toMatchObject({ name: "Corte", duration_minutes: 45 });
    expect(JSON.stringify(r.body)).not.toMatch(/Ótimo|@x\.com/);
    expect(r.body.rating).toEqual({ average: 5, count: 1 });
    expect((await api("get", "/public/companies/nao-existe/")).status).toBe(404);
  });

  it("empresa inativa some para clientes", async () => {
    await api("patch", `/platform/companies/${companyId}/`, owner).send({ active: false });
    expect((await api("get", "/companies/search/?q=barbearia", clientTok)).body).toEqual([]);
    expect((await api("get", `/professionals/?company=${companyId}`, clientTok)).body).toEqual([]);
    await api("patch", `/platform/companies/${companyId}/`, owner).send({ active: true });
  });

  it("favoritas: adiciona sem duplicar e remove", async () => {
    expect((await api("post", "/favorites/", clientTok).send({ company: companyId })).status).toBe(201);
    await api("post", "/favorites/", clientTok).send({ company: companyId });
    expect((await api("get", "/favorites/", clientTok)).body).toHaveLength(1);
    expect((await api("delete", `/favorites/${companyId}/`, clientTok)).status).toBe(204);
    expect((await api("get", "/favorites/", clientTok)).body).toHaveLength(0);
  });

  it("log de auditoria: filtros, resumo antes→depois, só admin geral, exportação", async () => {
    await api("patch", `/admin/professionals/${proId}/`, adminTok, companyId).send({ buffer_minutes: 15 });
    expect((await api("get", "/platform/audit/", adminTok)).status).toBe(403);
    let r = await api("get", "/platform/audit/?action=professional&page_size=5", owner);
    expect(r.body.results.length).toBeGreaterThan(0);
    const upd = r.body.results.find((a: any) => a.action === "professional.update" && /buffer_minutes/.test(a.summary));
    expect(upd.summary).toContain("buffer_minutes: 10 → 15");
    expect(JSON.stringify(r.body)).not.toMatch(/Cliente#2026|SenhaForte/);
    r = await api("get", "/platform/audit/options/", owner);
    expect(r.body.actions.length).toBeGreaterThan(30);
    r = await api("get", "/platform/audit/export/", owner);
    expect(r.headers["content-type"]).toContain("spreadsheetml");
  });

  it("sair encerra só este dispositivo; sair de todos encerra tudo; trocar senha derruba sessões", async () => {
    const a = (await api("post", "/auth/login/").send({ email: "gerente@x.com", password: "Gerente#2026" })).body.token;
    const b = (await api("post", "/auth/login/").send({ email: "gerente@x.com", password: "Gerente#2026" })).body.token;
    expect((await api("post", "/auth/logout/", a)).status).toBe(204);
    expect((await api("get", "/auth/me/", a)).status).toBe(401);
    expect((await api("get", "/auth/me/", b)).status).toBe(200);
    expect((await api("post", "/auth/logout-all/", b)).status).toBe(204);
    expect((await api("get", "/auth/me/", b)).status).toBe(401);
    const g = (await api("post", "/auth/login/").send({ email: "gerente@x.com", password: "Gerente#2026" })).body;
    const r = await api("patch", `/platform/users/${g.user.id}/`, owner).send({ password: "NovaSenha#2026" });
    expect(r.status).toBe(200);
    expect((await api("get", "/auth/me/", g.token)).status).toBe(401);
    expect((await api("post", "/auth/login/").send({ email: "gerente@x.com", password: "NovaSenha#2026" })).status).toBe(200);
  });

  it("imagens: logo válido é gravado; arquivo que não é imagem é recusado", async () => {
    adminTok = (await api("post", "/auth/login/").send({ email: "gerente@x.com", password: "NovaSenha#2026" })).body.token;
    const sharp = require("sharp");
    const png = await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 200, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();
    let r = await api("post", "/admin/company/logo/", adminTok, companyId).attach("image", png, "logo.png");
    expect(r.status).toBe(200);
    expect(r.body.logo_url).toMatch(/^(https?:\/\/|\/media\/)/);
    r = await api("post", "/admin/company/logo/", adminTok, companyId).attach("image", Buffer.from("não sou imagem"), "x.png");
    expect(r.status).toBe(400);
    r = await api("post", "/admin/company/photos/", adminTok, companyId).attach("image", png, "f.png").field("caption", "Fachada");
    expect(r.status).toBe(201);
    expect(r.body.photos).toHaveLength(1);
    r = await api("delete", `/admin/company/photos/${r.body.photos[0].id}/`, adminTok, companyId);
    expect(r.body.photos).toHaveLength(0);
  });
});
