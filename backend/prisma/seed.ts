/**
 * Dados iniciais (equivalente a `createsuperuser` + `seed_demo` do Django).
 *
 *   ADMIN_EMAIL=dono@exemplo.com ADMIN_PASSWORD='SenhaForte123' npm run seed
 *   npm run seed -- --history            # + ~90 dias de atendimentos passados para testar os relatórios
 *   npm run seed -- --owner seu@email    # usuário já cadastrado passa a administrar as empresas de exemplo
 *
 * Seguro para rodar de novo: não recria o que já existe.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { DateTime } from "luxon";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword, unusablePassword } from "../src/common/password";
import { refreshSearchText, slugify } from "../src/common/search";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: (process.env.DATABASE_URL ?? "").replace(/[?&]pgbouncer=true/, "") }) });
const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const t = (h: number, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

/** Gerador pseudo-aleatório com semente fixa: o histórico gerado é sempre o mesmo. */
function rng(seed = 42) { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; }

async function company(name: string, category: string, city: string, address: string) {
  return prisma.company.create({ data: { name, slug: slugify(name), category, city, address } });
}

async function main() {
  const email = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  if (email && process.env.ADMIN_PASSWORD && !(await prisma.user.findUnique({ where: { username: email } }))) {
    await prisma.user.create({ data: { username: email, email, firstName: "Admin geral", passwordHash: await hashPassword(process.env.ADMIN_PASSWORD), isSuperuser: true, isStaff: true } });
    console.log(`Admin geral criado: ${email}`);
  }
  await prisma.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} });

  if (await prisma.company.count()) return console.log("Já existem empresas; nada a fazer.");

  const barbearia = await company("Barbearia Exemplo", "Barbearia", "Campinas", "Rua das Flores, 100");
  const corte = await prisma.service.create({ data: { companyId: barbearia.id, name: "Corte de cabelo" } });
  const barba = await prisma.service.create({ data: { companyId: barbearia.id, name: "Barba" } });
  const ana = await prisma.professional.create({ data: { companyId: barbearia.id, name: "Ana Souza", bio: "Cabeleireira", slotMinutes: 30, bufferMinutes: 10 } });
  await prisma.professionalService.createMany({ data: [
    { professionalId: ana.id, serviceId: corte.id, durationMinutes: 45, price: "60" }, { professionalId: ana.id, serviceId: barba.id, durationMinutes: 30, price: "40" }] });
  for (let d = 0; d < 5; d++) {
    await prisma.workingHours.create({ data: { professionalId: ana.id, weekday: d, startTime: t(9), endTime: t(18) } });
    await prisma.break.create({ data: { professionalId: ana.id, weekday: d, startTime: t(12), endTime: t(13), label: "Almoço" } });
  }

  const clinica = await company("Clínica Exemplo", "Clínica", "São Paulo", "Av. Central, 500");
  const cons = await prisma.service.create({ data: { companyId: clinica.id, name: "Consulta" } });
  const ret = await prisma.service.create({ data: { companyId: clinica.id, name: "Retorno" } });
  const carlos = await prisma.professional.create({ data: { companyId: clinica.id, name: "Dr. Carlos Lima", bio: "Clínico geral", slotMinutes: 60, bufferMinutes: 0 } });
  await prisma.professionalService.createMany({ data: [
    { professionalId: carlos.id, serviceId: cons.id, durationMinutes: 60, price: "200" },
    { professionalId: carlos.id, serviceId: ret.id, durationMinutes: 30, price: "100", slotMinutes: 30 }] }); // intervalo próprio do serviço
  for (const d of [0, 2, 4]) {
    // sexta com intervalo próprio de 30 min (as outras usam o do serviço ou o padrão de 60)
    await prisma.workingHours.create({ data: { professionalId: carlos.id, weekday: d, startTime: t(14), endTime: t(19), slotMinutes: d === 4 ? 30 : null } });
  }
  for (const d of [1, 3]) await prisma.workingHours.create({ data: { professionalId: carlos.id, weekday: d, startTime: t(8), endTime: t(12) } });
  await prisma.break.create({ data: { professionalId: carlos.id, weekday: 2, startTime: t(16), endTime: t(16, 30), label: "Lanche" } });
  for (const c of [barbearia, clinica]) await refreshSearchText(prisma, c.id);
  console.log("Empresas de exemplo criadas.");

  if (process.argv.includes("--history")) await history([[ana, [corte, barba]], [carlos, [cons, ret]]] as any);

  const owner = (arg("--owner") ?? "").toLowerCase();
  if (owner) {
    const u = await prisma.user.findUnique({ where: { username: owner } });
    if (u) { for (const c of [barbearia, clinica]) await prisma.companyMember.create({ data: { companyId: c.id, userId: u.id } }); console.log(`${owner} agora administra as duas empresas.`); }
    else console.log(`Usuário ${owner} não encontrado: cadastre-se no app e rode de novo.`);
  }
}

/** ~90 dias de atendimentos passados (concluídos, faltas, cancelados) de um cliente de exemplo. */
async function history(pairs: [{ id: number; bufferMinutes: number }, { id: number; name: string }[]][]) {
  const rand = rng();
  const username = "cliente.demo@example.com";
  const customer = (await prisma.user.findUnique({ where: { username } })) ?? (await prisma.user.create({ data: { username, email: username, firstName: "Cliente Demo", passwordHash: unusablePassword() } }));
  const today = DateTime.now().setZone("America/Sao_Paulo").startOf("day");
  let n = 0;
  for (let back = 1; back <= 90; back++) {
    const day = today.minus({ days: back });
    for (const [pro, services] of pairs) {
      const hours = await prisma.workingHours.findMany({ where: { professionalId: pro.id, weekday: day.weekday - 1 } });
      if (!hours.length) continue;
      const slotHours = [9, 10, 11, 12, 13, 14, 15, 16].sort(() => rand() - 0.5).slice(0, 1 + Math.floor(rand() * 4));
      for (const hour of slotHours) {
        const service = services[Math.floor(rand() * services.length)];
        const offer = await prisma.professionalService.findUniqueOrThrow({ where: { professionalId_serviceId: { professionalId: pro.id, serviceId: service.id } } });
        const start = day.set({ hour }).toJSDate();
        const roll = rand() * 100;
        await prisma.appointment.create({ data: {
          professionalId: pro.id, serviceId: service.id, customerId: customer.id, start, end: new Date(start.getTime() + offer.durationMinutes * 60000),
          price: offer.price, status: roll < 75 ? "completed" : roll < 85 ? "no_show" : "canceled" } });
        n++;
      }
    }
  }
  console.log(`${n} atendimentos de exemplo criados (cliente ${username}).`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
