import type { RawTeslaResult, TeslaModelCode } from "./teslaClient";

export interface NormalizedCar {
  vin: string;
  model: TeslaModelCode;
  trim: string | null;
  year: number | null;
  price: number;
  mileageKm: number | null;
  exteriorColor: string | null;
  interiorColor: string | null;
  isDemo: boolean;
  locationCity: string | null;
  locationZip: string | null;
  raw: RawTeslaResult;
}

const MILES_TO_KM = 1.60934;

function toMileageKm(raw: RawTeslaResult): number | null {
  if (typeof raw.OdometerInKM === "number") return Math.round(raw.OdometerInKM);
  if (typeof raw.Odometer === "number") {
    const isMiles = (raw.OdometerType ?? "mi").toLowerCase().startsWith("mi");
    return Math.round(isMiles ? raw.Odometer * MILES_TO_KM : raw.Odometer);
  }
  return null;
}

function toPrice(raw: RawTeslaResult): number {
  const price = raw.InventoryPrice ?? raw.Price ?? raw.PurchasePrice ?? raw.TotalPrice;
  return typeof price === "number" ? Math.round(price) : 0;
}

export function normalizeTeslaResult(raw: RawTeslaResult, model: TeslaModelCode): NormalizedCar | null {
  if (!raw.VIN) return null;

  return {
    vin: raw.VIN,
    model,
    trim: raw.TrimName ?? null,
    year: typeof raw.Year === "number" ? raw.Year : null,
    price: toPrice(raw),
    mileageKm: toMileageKm(raw),
    exteriorColor: Array.isArray(raw.PAINT) ? raw.PAINT[0] ?? null : null,
    interiorColor: Array.isArray(raw.INTERIOR) ? raw.INTERIOR[0] ?? null : null,
    isDemo: raw.IsDemo === true,
    locationCity: raw.City ?? null,
    locationZip: raw.Zip ?? null,
    raw,
  };
}
