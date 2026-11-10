/** Uso do cliente: busca de empresas, favoritas, profissionais, disponibilidade e página pública. */
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req as ReqDec } from "@nestjs/common";
import { ApiError, bad, notFound } from "../common/api-error";
import { AuditService, tCompany } from "../common/audit.service";
import { Public } from "../common/auth";
import { PrismaService } from "../common/prisma.service";
import { SEARCH_LIMIT, searchTerms } from "../common/search";
import { availableSlots } from "../common/slots";
import { StorageService } from "../common/storage.service";
import type { Req } from "../common/types";
import { isoLocal, isYmd } from "../common/tz";
import { companyOut } from "./serializers";
import { money } from "../common/appointments.service";

const WEEKDAY_NAMES = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

@Controller()
export class CatalogController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly storage: StorageService) {}

  /** Empresas ativas que casam com TODOS os termos (mín. 2 letras; até 20). Com `slug`, só a empresa desse link. */
  @Get("companies/search")
  async search(@Query("q") q = "", @Query("slug") slug = "") {
    slug = slug.trim();
    if (slug) {
      const c = await this.prisma.company.findFirst({ where: { active: true, slug } });
      return c ? [companyOut(c)] : [];
    }
    const terms = searchTerms(q);
    if (!terms.length) return [];
    const rows = await this.prisma.company.findMany({
      where: { active: true, AND: terms.map((t) => ({ searchText: { contains: t } })) },
      orderBy: { name: "asc" }, take: SEARCH_LIMIT,
    });
    return rows.map(companyOut);
  }

  @Get("favorites")
  async favorites(@ReqDec() req: Req) {
    const rows = await this.prisma.company.findMany({ where: { active: true, favoritedBy: { some: { userId: req.user!.id } } }, orderBy: { name: "asc" } });
    return rows.map(companyOut);
  }

  /** Adiciona uma empresa ativa às favoritas (repetir não duplica). */
  @Post("favorites")
  async addFavorite(@Body() body: any, @ReqDec() req: Req) {
    const raw = String(body?.company ?? "");
    const company = /^\d+$/.test(raw) ? await this.prisma.company.findFirst({ where: { active: true, id: Number(raw) } }) : null;
    if (!company) throw notFound("Empresa não encontrada.");
    const existing = await this.prisma.favoriteCompany.findUnique({ where: { userId_companyId: { userId: req.user!.id, companyId: company.id } } });
    if (!existing) {
      await this.prisma.favoriteCompany.create({ data: { userId: req.user!.id, companyId: company.id } });
      await this.audit.record(req, "favorite.add", { company, target: tCompany(company) });
    }
    return companyOut(company);
  }

  @Delete("favorites/:id") @HttpCode(204)
  async removeFavorite(@Param("id") id: string, @ReqDec() req: Req) {
    if (!/^\d+$/.test(id)) return;
    const { count } = await this.prisma.favoriteCompany.deleteMany({ where: { userId: req.user!.id, companyId: Number(id) } });
    const company = await this.prisma.company.findUnique({ where: { id: Number(id) } });
    if (count && company) await this.audit.record(req, "favorite.remove", { company, target: tCompany(company) });
  }

  /** Profissionais ativos de UMA empresa ativa, com seus serviços. */
  @Get("professionals")
  async professionals(@Query("company") company = "") {
    if (!/^\d+$/.test(company)) throw bad("Informe a empresa (parâmetro company).");
    const rows = await this.prisma.professional.findMany({
      where: { companyId: Number(company), active: true, company: { active: true } },
      orderBy: { name: "asc" },
      include: { offers: { include: { service: true }, orderBy: { id: "asc" } } },
    });
    return rows.map((p) => ({
      id: p.id, company: p.companyId, name: p.name, bio: p.bio,
      services: p.offers.map((o) => ({ service: o.serviceId, name: o.service.name, duration_minutes: o.durationMinutes, price: money(o.price) })),
    }));
  }

  /** Horários livres de um profissional para um serviço em uma data. `staff=1` (equipe) ignora a antecedência mínima. */
  @Get("availability")
  async availability(@Query() q: Record<string, string>, @ReqDec() req: Req) {
    const invalid = new ApiError(400, { detail: "Informe professional, service e date (AAAA-MM-DD)." });
    if (!/^\d+$/.test(q.professional ?? "") || !/^\d+$/.test(q.service ?? "") || !isYmd(q.date)) throw invalid;
    const offer = await this.prisma.professionalService.findFirst({
      where: { professionalId: Number(q.professional), serviceId: Number(q.service), professional: { active: true, company: { active: true } } },
      include: { professional: { include: { company: true } } },
    });
    if (!offer) throw invalid;
    let slots = await availableSlots(this.prisma, offer.professional, offer, q.date);
    const company = offer.professional.company;
    const isStaff = q.staff === "1" && req.user!.memberships.some((m) => m.companyId === company.id);
    if (company.minNoticeHours && !isStaff) {
      const limit = Date.now() + company.minNoticeHours * 3_600_000;
      slots = slots.filter((s) => s.getTime() >= limit);
    }
    return { slots: slots.map(isoLocal) };
  }

  /** Página pública da empresa (sem login): nunca expõe dados de clientes nem comentários. */
  @Public() @Get("public/companies/:slug")
  async publicCompany(@Param("slug") slug: string) {
    const c = await this.prisma.company.findFirst({
      where: { slug, active: true },
      include: { photos: { orderBy: { id: "asc" } }, openingHours: true },
    });
    if (!c) throw notFound("Empresa não encontrada.");
    const [pros, ratings] = await Promise.all([
      this.prisma.professional.findMany({
        where: { companyId: c.id, active: true }, orderBy: { name: "asc" },
        include: { offers: { include: { service: true }, orderBy: { id: "asc" } } },
      }),
      this.prisma.review.aggregate({ where: { appointment: { professional: { companyId: c.id } } }, _avg: { rating: true }, _count: true }),
    ]);
    const perPro = await this.prisma.$queryRaw<{ professional_id: number; avg: number; n: number }[]>`
      SELECT a.professional_id, AVG(r.rating)::float8 AS avg, COUNT(r.id)::int AS n
        FROM reviews r JOIN appointments a ON a.id = r.appointment_id
       WHERE a.professional_id IN (SELECT id FROM professionals WHERE company_id = ${c.id})
       GROUP BY a.professional_id`;
    const byPro = new Map(perPro.map((r) => [r.professional_id, r]));
    const round1 = (n: number | null | undefined) => (n ? Math.round(n * 10) / 10 : null);
    const sortedHours = [...c.openingHours].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
    return {
      id: c.id, name: c.name, slug: c.slug, category: c.category, city: c.city, address: c.address, description: c.description,
      logo_url: this.storage.url(c.logoPath),
      photos: c.photos.map((p) => ({ id: p.id, url: this.storage.url(p.imagePath), caption: p.caption })),
      opening_hours: sortedHours.map((h) => ({ weekday: h.weekday, weekday_label: WEEKDAY_NAMES[h.weekday], start_time: h.startTime.slice(0, 5), end_time: h.endTime.slice(0, 5) })),
      min_notice_hours: c.minNoticeHours,
      cancel_notice_hours: c.cancelNoticeHours,
      rating: { average: round1(ratings._avg.rating), count: ratings._count },
      professionals: pros.map((p) => ({
        id: p.id, name: p.name, bio: p.bio,
        rating: { average: round1(byPro.get(p.id)?.avg), count: byPro.get(p.id)?.n ?? 0 },
        services: p.offers.map((o) => ({ name: o.service.name, duration_minutes: o.durationMinutes, price: o.price == null ? null : Number(o.price) })),
      })),
    };
  }
}
