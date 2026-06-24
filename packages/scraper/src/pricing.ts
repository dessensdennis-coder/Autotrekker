export interface PricingInput {
  vin: string;
  model: string;
  year: number | null;
  mileageKm: number | null;
  price: number;
}

export interface PricingResult {
  vin: string;
  marketMedianPrice: number | null;
  priceDeltaPct: number | null;
  priceAssessment: "koopje" | "redelijk" | "duur" | null;
  comparableCount: number;
}

const KOOPJE_THRESHOLD = -0.08;
const DUUR_THRESHOLD = 0.08;
const MIN_COMPARABLES = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function isComparable(a: PricingInput, b: PricingInput, strict: boolean): boolean {
  if (a.model !== b.model) return false;
  if (!strict) return true;

  if (a.year !== null && b.year !== null && Math.abs(a.year - b.year) > 1) return false;
  if (a.mileageKm !== null && b.mileageKm !== null) {
    const band = Math.max(20000, a.mileageKm * 0.25);
    if (Math.abs(a.mileageKm - b.mileageKm) > band) return false;
  }
  return true;
}

export function computePricing(cars: PricingInput[]): PricingResult[] {
  return cars.map((car) => {
    let comparables = cars.filter((other) => other.vin !== car.vin && isComparable(car, other, true));

    if (comparables.length < MIN_COMPARABLES) {
      comparables = cars.filter((other) => other.vin !== car.vin && isComparable(car, other, false));
    }

    if (comparables.length < MIN_COMPARABLES) {
      return {
        vin: car.vin,
        marketMedianPrice: null,
        priceDeltaPct: null,
        priceAssessment: null,
        comparableCount: comparables.length,
      };
    }

    const med = median(comparables.map((c) => c.price));
    const deltaPct = (car.price - med) / med;
    const assessment = deltaPct <= KOOPJE_THRESHOLD ? "koopje" : deltaPct >= DUUR_THRESHOLD ? "duur" : "redelijk";

    return {
      vin: car.vin,
      marketMedianPrice: Math.round(med),
      priceDeltaPct: deltaPct,
      priceAssessment: assessment,
      comparableCount: comparables.length,
    };
  });
}

export interface ModelDailyStat {
  model: string;
  medianPrice: number;
  avgPrice: number;
  count: number;
}

export function computeModelDailyStats(cars: PricingInput[]): ModelDailyStat[] {
  const byModel = new Map<string, number[]>();
  for (const car of cars) {
    const list = byModel.get(car.model) ?? [];
    list.push(car.price);
    byModel.set(car.model, list);
  }

  return [...byModel.entries()].map(([model, prices]) => ({
    model,
    medianPrice: Math.round(median(prices)),
    avgPrice: Math.round(prices.reduce((sum, p) => sum + p, 0) / prices.length),
    count: prices.length,
  }));
}
