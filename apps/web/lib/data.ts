import { isNull, asc, gte } from "drizzle-orm";
import { getDb, cars, modelPriceDaily } from "@autotrekker/db";

export interface CarDTO {
  vin: string;
  model: string;
  trim: string | null;
  year: number | null;
  price: number;
  mileageKm: number | null;
  exteriorColor: string | null;
  locationCity: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  isInteresting: boolean;
  marketMedianPrice: number | null;
  priceDeltaPct: number | null;
  priceAssessment: "koopje" | "redelijk" | "duur" | null;
  comparableCount: number | null;
}

export async function getCurrentCars(): Promise<CarDTO[]> {
  const db = getDb();
  const rows = await db.select().from(cars).where(isNull(cars.delistedAt)).orderBy(asc(cars.firstSeenAt));

  return rows.map((row) => ({
    vin: row.vin,
    model: row.model,
    trim: row.trim,
    year: row.year,
    price: row.price,
    mileageKm: row.mileageKm,
    exteriorColor: row.exteriorColor,
    locationCity: row.locationCity,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    isInteresting: row.isInteresting,
    marketMedianPrice: row.marketMedianPrice,
    priceDeltaPct: row.priceDeltaPct,
    priceAssessment: row.priceAssessment as CarDTO["priceAssessment"],
    comparableCount: row.comparableCount,
  }));
}

export interface ModelTrend {
  model: string;
  changePct: number | null;
  direction: "up" | "down" | "stable" | null;
  series: { date: string; medianPrice: number }[];
}

const TREND_WINDOW_DAYS = 30;
const STABLE_THRESHOLD = 0.02;

export async function getModelTrends(): Promise<ModelTrend[]> {
  const db = getDb();
  const since = new Date(Date.now() - TREND_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(modelPriceDaily)
    .where(gte(modelPriceDaily.date, since))
    .orderBy(asc(modelPriceDaily.date));

  const byModel = new Map<string, { date: string; medianPrice: number }[]>();
  for (const row of rows) {
    const list = byModel.get(row.model) ?? [];
    list.push({ date: row.date, medianPrice: row.medianPrice });
    byModel.set(row.model, list);
  }

  return [...byModel.entries()].map(([model, series]) => {
    if (series.length < 2) {
      return { model, changePct: null, direction: null, series };
    }
    const first = series[0].medianPrice;
    const last = series[series.length - 1].medianPrice;
    const changePct = (last - first) / first;
    const direction = changePct > STABLE_THRESHOLD ? "up" : changePct < -STABLE_THRESHOLD ? "down" : "stable";
    return { model, changePct, direction, series };
  });
}
