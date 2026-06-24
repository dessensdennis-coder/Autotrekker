import type { CarDTO } from "@/lib/data";
import { MODEL_LABELS, formatKm, formatPct, formatPrice, formatSeenSince, isNewCar } from "@/lib/format";

export function CarCard({ car, onToggleInteresting }: { car: CarDTO; onToggleInteresting: (vin: string) => void }) {
  const modelLabel = MODEL_LABELS[car.model] ?? car.model;
  const title = [modelLabel, car.trim].filter(Boolean).join(" ");
  const isNew = isNewCar(car.firstSeenAt);

  return (
    <div className="card">
      <div className="card-top">
        <div>
          <div className="card-title">
            {title} {car.year ? `· ${car.year}` : ""}
          </div>
          <div className="card-sub">
            {car.exteriorColor ?? "onbekende kleur"} · {car.locationCity ?? "onbekende locatie"}
          </div>
        </div>
        <button
          className={`heart ${car.isInteresting ? "active" : ""}`}
          onClick={() => onToggleInteresting(car.vin)}
          aria-label="Markeer als interessant"
          title="Markeer als interessant"
        >
          {car.isInteresting ? "♥" : "♡"}
        </button>
      </div>

      <div>
        {isNew && <span className="badge badge-new">NIEUW</span>}
        {car.priceAssessment && <span className={`badge badge-${car.priceAssessment}`}>{car.priceAssessment}</span>}
      </div>

      <div className="price-row">
        <span className="price">{formatPrice(car.price)}</span>
        {car.marketMedianPrice !== null && (
          <span className="price-delta">
            {formatPct(car.priceDeltaPct)} t.o.v. markt ({formatPrice(car.marketMedianPrice)})
          </span>
        )}
      </div>

      <div className="meta-row">
        {formatKm(car.mileageKm)} · {formatSeenSince(car.firstSeenAt)}
      </div>
    </div>
  );
}
