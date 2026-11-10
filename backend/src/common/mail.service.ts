/** E-mails: confirmação/cancelamento ao cliente e avisos aos administradores. Falha de envio nunca desfaz o agendamento. */
import { Injectable, Logger } from "@nestjs/common";
import { createTransport, Transporter } from "nodemailer";
import { Prisma, PrismaService } from "./prisma.service";
import { fmt } from "./tz";

export type MailAppointment = Prisma.AppointmentGetPayload<{
  include: { professional: { include: { company: true } }; service: true; customer: true };
}>;

/** Link "Adicionar ao Google Agenda" (modelo de URL do Google; não depende da API). */
export function googleCalendarUrl(a: MailAppointment): string {
  const f = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");
  const c = a.professional.company;
  let details = `Profissional: ${a.professional.name}`;
  if (a.notes) details += `\n${a.notes}`;
  const params = new URLSearchParams({ action: "TEMPLATE", text: `${a.service.name} - ${c.name}`, dates: `${f(a.start)}/${f(a.end)}`, details });
  const location = [c.address, c.city].filter(Boolean).join(", ");
  if (location) params.set("location", location);
  return "https://calendar.google.com/calendar/render?" + params.toString();
}

@Injectable()
export class MailService {
  private readonly log = new Logger("Mail");
  private transport?: Transporter;

  constructor(private readonly prisma: PrismaService) {}

  private async send(subject: string, text: string, to: string) {
    try {
      if (!process.env.EMAIL_HOST) {
        this.log.log(`(sem SMTP configurado) Para: ${to}\nAssunto: ${subject}\n${text}`);
        return;
      }
      this.transport ??= createTransport({
        host: process.env.EMAIL_HOST,
        port: Number(process.env.EMAIL_PORT ?? 587),
        secure: Number(process.env.EMAIL_PORT) === 465,
        requireTLS: (process.env.EMAIL_USE_TLS ?? "1") === "1",
        auth: process.env.EMAIL_HOST_USER ? { user: process.env.EMAIL_HOST_USER, pass: process.env.EMAIL_HOST_PASSWORD } : undefined,
        connectionTimeout: 8000,
        socketTimeout: 10000,
      });
      await this.transport.sendMail({ from: process.env.DEFAULT_FROM_EMAIL ?? "Agendamento <agenda@localhost>", to, subject, text });
    } catch (e) {
      this.log.error(`Falha ao enviar e-mail para ${to}: ${(e as Error).message}`);
    }
  }

  private details(a: MailAppointment): string {
    return `Empresa: ${a.professional.company.name}\nServiço: ${a.service.name}\nProfissional: ${a.professional.name}\nQuando: ${fmt(a.start, "dd/MM/yyyy 'às' HH:mm")}`;
  }

  async sendConfirmation(a: MailAppointment) {
    if (!a.professional.company.notifyCustomers) return;
    const name = a.customer.firstName || a.customer.email;
    await this.send("Agendamento confirmado",
      `Olá, ${name}!\n\nSeu agendamento está confirmado.\n\n${this.details(a)}\n\nAdicionar ao Google Agenda:\n${googleCalendarUrl(a)}\n`, a.customer.email);
  }

  async sendCancellation(a: MailAppointment) {
    if (!a.professional.company.notifyCustomers) return;
    const name = a.customer.firstName || a.customer.email;
    await this.send("Agendamento cancelado", `Olá, ${name}.\n\nSeu agendamento foi cancelado.\n\n${this.details(a)}\n`, a.customer.email);
  }

  /** Um e-mail por administrador (ninguém vê o endereço dos outros); quem fez a ação não recebe o próprio aviso. */
  async sendAdminNotice(a: MailAppointment, event: "created" | "canceled", actorId?: number) {
    const c = a.professional.company;
    if (!c.notifyAdmins) return;
    const members = await this.prisma.companyMember.findMany({ where: { companyId: c.id }, include: { user: true } });
    const emails = [...new Set(members.filter((m) => m.user.email && m.userId !== actorId).map((m) => m.user.email.toLowerCase()))].sort();
    if (!emails.length) return;
    const who = a.customer.firstName || a.customer.email;
    const when = fmt(a.start, "dd/MM 'às' HH:mm");
    const title = event === "created" ? "Novo agendamento" : "Agendamento cancelado";
    const by = event === "canceled" ? "\nCancelado por: " + (actorId === a.customerId ? "o próprio cliente" : "a equipe") : "";
    let body = `${title} em ${c.name}.\n\n${this.details(a)}\nCliente: ${who} (${a.customer.email})${by}\n`;
    if (a.notes) body += `Observações: ${a.notes}\n`;
    await Promise.all(emails.map((to) => this.send(`${title}: ${who} — ${when}`, body, to)));
  }
}
