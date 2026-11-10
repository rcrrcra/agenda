import ErrorMessage from "../../../components/ui/ErrorMessage";
import Field from "../../../components/ui/Field";
import { useAction } from "../../../hooks/useAction";
import * as adminApi from "../../../api/admin";
import { useState } from "react";

const MAX_PHOTOS = 8;

/**
 * Logo e fotos da empresa (aparecem na página pública). Os envios são imediatos, independentes do botão
 * "Salvar" das configurações. As imagens são validadas e reduzidas no servidor.
 * @param {{company: {logo_url: string|null, photos: {id: number, url: string, caption: string}[]}, onChanged: () => void}} props
 */
export default function BrandingEditor({ company, onChanged }) {
  const { error, busy, run } = useAction();
  const [caption, setCaption] = useState("");

  /** Executa a chamada e recarrega os dados da empresa. */
  const act = async (fn) => { if (await run(fn)) onChanged(); };
  /** Envia o arquivo escolhido e limpa o campo (permite reenviar o mesmo arquivo). */
  const pick = (send) => (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (file) act(() => send(file));
  };

  return (
    <section className="card">
      <h3>Logo e fotos</h3>
      <div className="profileHead">
        {company.logo_url ? <img className="logo" src={company.logo_url} alt="Logo atual" /> : <span className="muted">Sem logo</span>}
        <Field label="Logo (JPG, PNG ou WebP)"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={pick(adminApi.uploadLogo)} /></Field>
        {company.logo_url && <button type="button" disabled={busy} onClick={() => act(adminApi.removeLogo)}>Remover logo</button>}
      </div>
      <div className="gallery">
        {company.photos.map((p) => (
          <figure key={p.id}>
            <img src={p.url} alt={p.caption || "Foto da empresa"} />
            {p.caption && <figcaption className="muted">{p.caption}</figcaption>}
            <button type="button" className="danger" disabled={busy} onClick={() => act(() => adminApi.removePhoto(p.id))}>Remover</button>
          </figure>
        ))}
      </div>
      {company.photos.length < MAX_PHOTOS ? (
        <div className="filters">
          <Field label="Legenda da nova foto (opcional)"><input maxLength={120} value={caption} onChange={(e) => setCaption(e.target.value)} /></Field>
          <Field label={`Adicionar foto (${company.photos.length}/${MAX_PHOTOS})`}>
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy}
              onChange={pick(async (f) => { await adminApi.addPhoto(f, caption); setCaption(""); })} />
          </Field>
        </div>
      ) : <p className="muted">Limite de {MAX_PHOTOS} fotos. Remova uma para enviar outra.</p>}
      <ErrorMessage message={error} />
    </section>
  );
}
