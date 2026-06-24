export const MODEL_LABELS: Record<string, string> = {
  ms: "Model S",
  "3": "Model 3",
  mx: "Model X",
  y: "Model Y",
};

export function formatPrice(value: number): string {
  return new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    value,
  );
}

export function formatKm(value: number | null): string {
  if (value === null) return "onbekend";
  return `${new Intl.NumberFormat("nl-NL").format(value)} km`;
}

export function formatPct(value: number | null): string {
  if (value === null) return "—";
  const pct = Math.round(value * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

const NEW_WINDOW_HOURS = 48;

export function isNewCar(firstSeenAt: string): boolean {
  const ageMs = Date.now() - new Date(firstSeenAt).getTime();
  return ageMs < NEW_WINDOW_HOURS * 60 * 60 * 1000;
}

export function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
}

export function formatSeenSince(firstSeenAt: string): string {
  const days = daysAgo(firstSeenAt);
  if (days <= 0) return "vandaag voor het eerst gezien";
  if (days === 1) return "1 dag geleden voor het eerst gezien";
  return `${days} dagen geleden voor het eerst gezien`;
}
