import Stars from "../ui/Stars";

/** Nota média com a quantidade de avaliações, ex.: "★★★★☆ 4,3 (12)"; "sem avaliações" quando não há. */
export default function RatingBadge({ rating }) {
  if (!rating?.count) return <span className="muted">sem avaliações</span>;
  return (
    <span className="rating">
      <Stars value={rating.average} /> <strong>{String(rating.average).replace(".", ",")}</strong>{" "}
      <span className="muted">({rating.count})</span>
    </span>
  );
}
