/**
 * Imagens das empresas (logo e fotos): validadas e reduzidas com sharp e guardadas no Supabase Storage (bucket público).
 * Sem SUPABASE_URL (desenvolvimento/testes) grava em disco local e serve em /media — não use isso na Vercel (disco efêmero).
 */
import { Injectable } from "@nestjs/common";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import sharp from "sharp";
import { ApiError } from "./api-error";

// A Vercel limita o corpo da requisição a 4,5 MB; por isso o limite é 4 MB (no Django era 5 MB).
export const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["jpeg", "png", "webp"]);
const imageError = (msg: string) => new ApiError(400, { image: [msg] });

export const MEDIA_DIR = process.env.MEDIA_DIR ?? path.join(process.cwd(), "media");

/** Chave secreta do Supabase: `SUPABASE_SECRET_KEY` (nova, `sb_secret_...`) ou, se existir, a antiga `SUPABASE_SERVICE_ROLE_KEY`. */
const secretKey = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

@Injectable()
export class StorageService {
  private client?: SupabaseClient;
  private readonly bucket = process.env.SUPABASE_BUCKET ?? "media";

  private get supabase(): SupabaseClient | null {
    const key = secretKey();
    if (!process.env.SUPABASE_URL || !key) return null;
    return (this.client ??= createClient(process.env.SUPABASE_URL, key, { auth: { persistSession: false } }));
  }

  /** Valida o arquivo (JPEG/PNG/WebP, até 4 MB), corrige a orientação EXIF, reduz e REGRAVA (descarta metadados). */
  async process(file: { buffer: Buffer; size: number } | undefined, maxSide: number): Promise<{ data: Buffer; ext: string; contentType: string }> {
    if (!file) throw imageError("Envie um arquivo de imagem.");
    if (file.size > MAX_BYTES) throw imageError("A imagem deve ter no máximo 4 MB.");
    try {
      const img = sharp(file.buffer, { limitInputPixels: 40_000_000 });
      const meta = await img.metadata();
      if (!meta.format || !ALLOWED.has(meta.format)) throw imageError("Use uma imagem JPEG, PNG ou WebP.");
      const resized = img.rotate().resize(maxSide, maxSide, { fit: "inside", withoutEnlargement: true });
      if (meta.hasAlpha) return { data: await resized.png({ compressionLevel: 9 }).toBuffer(), ext: "png", contentType: "image/png" };
      return { data: await resized.jpeg({ quality: 85, mozjpeg: true }).toBuffer(), ext: "jpg", contentType: "image/jpeg" };
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw imageError("Arquivo de imagem inválido.");
    }
  }

  /** Envia a imagem e devolve o caminho no bucket (ex.: `logos/minha-empresa-logo-ab12cd.png`). */
  async upload(folder: string, base: string, img: { data: Buffer; ext: string; contentType: string }): Promise<string> {
    const key = `${folder}/${base}-${randomBytes(4).toString("hex")}.${img.ext}`;
    const sb = this.supabase;
    if (sb) {
      const { error } = await sb.storage.from(this.bucket).upload(key, img.data, { contentType: img.contentType, upsert: false });
      if (error) throw new ApiError(502, { detail: `Falha ao salvar a imagem: ${error.message}` });
    } else {
      const file = path.join(MEDIA_DIR, key);
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, img.data);
    }
    return key;
  }

  async remove(key: string | null | undefined): Promise<void> {
    if (!key) return;
    try {
      const sb = this.supabase;
      if (sb) await sb.storage.from(this.bucket).remove([key]);
      else await fs.rm(path.join(MEDIA_DIR, key), { force: true });
    } catch {
      /* arquivo órfão não deve derrubar a requisição */
    }
  }

  /** URL pública da imagem (ou null). */
  url(key: string | null | undefined): string | null {
    if (!key) return null;
    if (process.env.SUPABASE_URL && secretKey()) {
      return `${process.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${this.bucket}/${key}`;
    }
    return `${process.env.PUBLIC_BASE_URL ?? ""}/media/${key}`;
  }
}
