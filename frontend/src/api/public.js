/** Endpoints públicos (não exigem login). */
import { get } from "./client";

/** Página pública de uma empresa: logo, descrição, fotos, horários, nota e profissionais. */
export const getPublicCompany = (slug) => get(`/public/companies/${encodeURIComponent(slug)}/`);
