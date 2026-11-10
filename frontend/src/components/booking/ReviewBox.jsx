import { useState } from "react";
import { reviewAppointment } from "../../api/booking";
import ErrorMessage from "../ui/ErrorMessage";
import Stars from "../ui/Stars";
import { useAction } from "../../hooks/useAction";

/**
 * Avaliação de um atendimento concluído: o cliente escolhe a nota (1 a 5) e pode comentar; pode corrigir depois.
 * @param {{appointment: {id: number, review: {rating: number, comment: string}|null}, onSaved: () => void}} props
 */
export default function ReviewBox({ appointment: a, onSaved }) {
  const [current, setCurrent] = useState(a.review); // avaliação exibida (atualiza na hora, antes da lista recarregar)
  const [editing, setEditing] = useState(!a.review);
  const [rating, setRating] = useState(a.review?.rating || 0);
  const [comment, setComment] = useState(a.review?.comment || "");
  const { error, busy, run } = useAction();

  if (!editing) {
    return (
      <div className="reviewBox">
        <Stars value={current.rating} label="Sua nota" />
        {current.comment && <span className="muted">“{current.comment}”</span>}
        <button type="button" className="link" onClick={() => setEditing(true)}>Alterar avaliação</button>
      </div>
    );
  }
  /** Envia a nota; só habilita depois de escolher as estrelas. */
  const save = async () => { if (await run(() => reviewAppointment(a.id, rating, comment))) { setCurrent({ rating, comment }); setEditing(false); onSaved(); } };
  return (
    <div className="reviewBox">
      <span className="muted">Como foi o atendimento?</span>
      <Stars value={rating} onChange={setRating} label="Sua nota" />
      <input maxLength={500} placeholder="Comentário (opcional)" aria-label="Comentário" value={comment} onChange={(e) => setComment(e.target.value)} />
      <ErrorMessage message={error} />
      <div className="actions">
        <button type="button" className="primary" disabled={!rating || busy} onClick={save}>{busy ? "Enviando…" : "Enviar avaliação"}</button>
        {current && <button type="button" onClick={() => setEditing(false)}>Cancelar</button>}
      </div>
    </div>
  );
}
