/** Perfil da empresa: configurações (painel), logo e fotos, cadastro da própria empresa. */
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req as ReqDec, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiError, notFound } from "../common/api-error";
import { AuditService, diff, snapshot, tCompany } from "../common/audit.service";
import { resolveCompany } from "../common/auth";
import { Prisma, PrismaService } from "../common/prisma.service";
import { refreshSearchText, uniqueSlug } from "../common/search";
import { MAX_BYTES, StorageService } from "../common/storage.service";
import type { Req } from "../common/types";
import { V, toCamel, toSnake } from "../common/validate";

export const MAX_PHOTOS = 8;
const FULL = { openingHours: true, photos: { orderBy: { id: "asc" } } } satisfies Prisma.CompanyInclude;
type CompanyFull = Prisma.CompanyGetPayload<{ include: typeof FULL }>;

/** Campos de empresa validados no cadastro e na edição (`CompanySerializer` / `CompanySettingsSerializer`). */
export function parseCompanyFields(v: V) {
  return {
    name: v.str("name", { max: 120 }), category: v.str("category", { max: 60, required: false, blank: true }),
    city: v.str("city", { max: 80, required: false, blank: true }), description: v.str("description", { max: 255, required: false, blank: true }),
    address: v.str("address", { max: 255, required: false, blank: true }), active: v.bool("active"),
  };
}

@Controller()
export class CompanyController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly storage: StorageService) {}

  /** Empresa com configurações, logo e fotos (`CompanySettingsSerializer`). */
  settingsOut(c: CompanyFull) {
    const hours = [...c.openingHours].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
    return {
      id: c.id, name: c.name, slug: c.slug, category: c.category, city: c.city, description: c.description, address: c.address, active: c.active,
      notify_customers: c.notifyCustomers, notify_admins: c.notifyAdmins, min_notice_hours: c.minNoticeHours, cancel_notice_hours: c.cancelNoticeHours,
      opening_hours: hours.map((h) => ({ weekday: h.weekday, start_time: h.startTime, end_time: h.endTime })),
      logo_url: this.storage.url(c.logoPath),
      photos: c.photos.map((p) => ({ id: p.id, url: this.storage.url(p.imagePath), caption: p.caption })),
    };
  }

  private load(id: number) { return this.prisma.company.findUniqueOrThrow({ where: { id }, include: FULL }); }

  @Get("admin/company")
  async get(@ReqDec() req: Req) { return this.settingsOut(await this.load(resolveCompany(req).id)); }

  /** Atualiza dados e configurações; `opening_hours` é substituído por inteiro a cada gravação. */
  @Put("admin/company")
  async put(@Body() body: any, @ReqDec() req: Req) {
    const company = resolveCompany(req);
    const v = new V(body);
    const d: Record<string, any> = {
      ...parseCompanyFields(v),
      notify_customers: v.bool("notify_customers"), notify_admins: v.bool("notify_admins"),
      min_notice_hours: v.int("min_notice_hours", { min: 0, max: 720, required: false }), cancel_notice_hours: v.int("cancel_notice_hours", { min: 0, max: 720, required: false }),
    };
    let hours: { weekday: number; startTime: string; endTime: string }[] | undefined;
    const raw = v.list("opening_hours");
    if (raw) {
      const rows: typeof hours = [], errs: unknown[] = []; let invalid = false;
      for (const r of raw) {
        const iv = new V(r ?? {});
        const row = { weekday: iv.int("weekday", { min: 0, max: 6 }) as number, startTime: iv.time("start_time")!, endTime: iv.time("end_time")! };
        if (row.startTime && row.endTime && row.endTime <= row.startTime) iv.fail("non_field_errors", "O horário de fechar deve ser depois do de abrir.");
        errs.push(iv.errors); if (Object.keys(iv.errors).length) invalid = true; else rows.push(row);
      }
      if (invalid) v.errors.opening_hours = errs;
      else {
        const byDay = new Map<number, [string, string][]>();
        for (const r of rows) byDay.set(r.weekday, [...(byDay.get(r.weekday) ?? []), [r.startTime, r.endTime]]);
        for (const ranges of byDay.values()) {
          ranges.sort((a, b) => a[0].localeCompare(b[0]));
          if (ranges.some((b, i) => i > 0 && b[0] < ranges[i - 1][1])) v.fail("opening_hours", "Há faixas sobrepostas no mesmo dia.");
        }
        hours = rows;
      }
    }
    v.done();
    const fields = Object.fromEntries(Object.entries(d).filter(([, x]) => x !== undefined));
    const before = snapshot(toSnake(company), fields);
    await this.prisma.$transaction(async (tx) => {
      await tx.company.update({ where: { id: company.id }, data: toCamel(fields) });
      if (hours) { await tx.companyHours.deleteMany({ where: { companyId: company.id } }); await tx.companyHours.createMany({ data: hours.map((h) => ({ ...h, companyId: company.id })) }); }
      await refreshSearchText(tx, company.id);
    });
    const fresh = await this.load(company.id);
    await this.audit.record(req, "company.update", { company: fresh, target: tCompany(fresh), details: diff(before, toSnake(fresh), { ...fields, ...(hours ? { opening_hours: hours } : {}) }) });
    return this.settingsOut(fresh);
  }

  /** Envia (POST, campo `image`) ou remove (DELETE) o logo. */
  @Post("admin/company/logo") @HttpCode(200)
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: MAX_BYTES } }))
  async setLogo(@UploadedFile() file: any, @ReqDec() req: Req) {
    const company = resolveCompany(req);
    const img = await this.storage.process(file, 512);
    const key = await this.storage.upload("logos", `${company.slug}-logo`, img);
    await this.storage.remove(company.logoPath);
    await this.prisma.company.update({ where: { id: company.id }, data: { logoPath: key } });
    await this.audit.record(req, "company.logo_update", { company, target: tCompany(company) });
    return this.settingsOut(await this.load(company.id));
  }

  @Delete("admin/company/logo") @HttpCode(200)
  async removeLogo(@ReqDec() req: Req) {
    const company = resolveCompany(req);
    await this.storage.remove(company.logoPath);
    await this.prisma.company.update({ where: { id: company.id }, data: { logoPath: null } });
    await this.audit.record(req, "company.logo_remove", { company, target: tCompany(company) });
    return this.settingsOut(await this.load(company.id));
  }

  /** Adiciona uma foto à galeria (campo `image`, `caption` opcional); no máximo 8. */
  @Post("admin/company/photos")
  @UseInterceptors(FileInterceptor("image", { limits: { fileSize: MAX_BYTES } }))
  async addPhoto(@UploadedFile() file: any, @Body() body: any, @ReqDec() req: Req) {
    const company = resolveCompany(req);
    if ((await this.prisma.companyPhoto.count({ where: { companyId: company.id } })) >= MAX_PHOTOS) {
      throw new ApiError(400, { detail: `No máximo ${MAX_PHOTOS} fotos. Remova uma para enviar outra.` });
    }
    const img = await this.storage.process(file, 1600);
    const key = await this.storage.upload("photos", `${company.slug}-foto`, img);
    const photo = await this.prisma.companyPhoto.create({ data: { companyId: company.id, imagePath: key, caption: String(body?.caption ?? "").slice(0, 120) } });
    await this.audit.record(req, "company.photo_add", { company, target: { type: "CompanyPhoto", id: photo.id, label: `${company.name} - foto ${photo.id}` } });
    return this.settingsOut(await this.load(company.id));
  }

  @Delete("admin/company/photos/:id") @HttpCode(200)
  async removePhoto(@Param("id") id: string, @ReqDec() req: Req) {
    const company = resolveCompany(req);
    const photo = /^\d+$/.test(id) ? await this.prisma.companyPhoto.findFirst({ where: { id: Number(id), companyId: company.id } }) : null;
    if (!photo) throw notFound("Foto não encontrada.");
    await this.storage.remove(photo.imagePath);
    await this.prisma.companyPhoto.delete({ where: { id: photo.id } });
    await this.audit.record(req, "company.photo_remove", { company, label: `foto ${id}` });
    return this.settingsOut(await this.load(company.id));
  }

  /** O próprio usuário cadastra uma empresa e passa a administrá-la (ativa na hora). Respeita o limite por usuário. */
  @Post("companies/register")
  async register(@Body() body: any, @ReqDec() req: Req) {
    const limit = (await this.prisma.platformSettings.upsert({ where: { id: 1 }, create: { id: 1 }, update: {} })).maxCompaniesPerUser;
    const used = await this.prisma.company.count({ where: { createdById: req.user!.id } });
    if (limit && used >= limit) {
      throw new ApiError(400, { detail: `Você já cadastrou ${used} empresa(s), o máximo permitido (${limit}). Fale com o administrador da plataforma.` });
    }
    const v = new V(body);
    const f = parseCompanyFields(v);
    v.done();
    const company = await this.prisma.$transaction(async (tx) => {
      const c = await tx.company.create({
        data: { ...(toCamel(Object.fromEntries(Object.entries(f).filter(([, x]) => x !== undefined))) as any), active: true, createdById: req.user!.id, slug: await uniqueSlug(tx, f.name!) },
      });
      await tx.companyMember.create({ data: { companyId: c.id, userId: req.user!.id } });
      await refreshSearchText(tx, c.id);
      return c;
    });
    await this.audit.record(req, "company.self_create", { company, target: tCompany(company), details: { origem: "próprio usuário", limite: limit || "sem limite", cadastradas: used + 1 } });
    return { id: company.id, name: company.name, slug: company.slug, registered: used + 1, limit };
  }
}
