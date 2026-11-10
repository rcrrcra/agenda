import { money } from "../../utils/format";
import RatingBadge from "./RatingBadge";

/** Agrupa as faixas de funcionamento por dia, ex.: "Seg: 09:00–12:00, 14:00–18:00". */
export function groupHours(hours) {
  const by = new Map();
  hours.forEach((h) => {
    if (!by.has(h.weekday)) by.set(h.weekday, { label: h.weekday_label, ranges: [] });
    by.get(h.weekday).ranges.push(`${h.start_time}–${h.end_time}`);
  });
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

/**
 * Apresentação da empresa (dados de `/public/companies/<slug>/`): logo, descrição, fotos,
 * horário de funcionamento, regras de antecedência e profissionais com serviços e nota.
 * Usada na página pública e dentro da tela de agendamento ("Sobre a empresa").
 * @param {{company: object}} props
 */
export default function CompanyProfile({ company: c }) {
  const hours = groupHours(c.opening_hours);
  return (
    <div className="profile">
      <div className="profileHead">
        {c.logo_url && <img className="logo" src={c.logo_url} alt={`Logo de ${c.name}`} />}
        <div>
          <h2>{c.name}</h2>
          <p className="muted">{[c.category, c.city].filter(Boolean).join(" · ")}</p>
          <RatingBadge rating={c.rating} />
        </div>
      </div>
      {c.description && <p className="pre">{c.description}</p>}
      {c.address && <p><strong>Endereço:</strong> {c.address}</p>}
      {c.photos.length > 0 && (
        <div className="gallery">
          {c.photos.map((p) => (
            <figure key={p.id}>
              <img src={p.url} alt={p.caption || `Foto de ${c.name}`} loading="lazy" />
              {p.caption && <figcaption className="muted">{p.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {hours.length > 0 && (
        <div>
          <h3>Horário de funcionamento</h3>
          <ul className="plain">{hours.map((h) => <li key={h.label}><strong>{h.label}:</strong> {h.ranges.join(", ")}</li>)}</ul>
        </div>
      )}
      {(c.min_notice_hours > 0 || c.cancel_notice_hours > 0) && (
        <p className="muted">
          {c.min_notice_hours > 0 && `Agende com pelo menos ${c.min_notice_hours}h de antecedência. `}
          {c.cancel_notice_hours > 0 && `Cancelamentos até ${c.cancel_notice_hours}h antes do horário.`}
        </p>
      )}
      {c.professionals.length > 0 && (
        <div>
          <h3>Profissionais</h3>
          <ul className="list">
            {c.professionals.map((p) => (
              <li key={p.id}>
                <div>
                  <strong>{p.name}</strong> <RatingBadge rating={p.rating} />
                  {p.bio && <span className="muted">{p.bio}</span>}
                  <span className="muted">
                    {p.services.map((s) => `${s.name} (${s.duration_minutes} min${money(s.price)})`).join(" · ")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
