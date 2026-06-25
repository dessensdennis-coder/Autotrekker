const INVENTORY_URL = "https://www.tesla.com/inventory/api/v1/inventory-results";

export const TESLA_MODELS = ["ms", "3", "mx", "y"] as const;
export type TeslaModelCode = (typeof TESLA_MODELS)[number];

export interface RawTeslaResult {
  VIN: string;
  Model?: string;
  TrimName?: string;
  Year?: number;
  InventoryPrice?: number;
  Price?: number;
  PurchasePrice?: number;
  TotalPrice?: number;
  OdometerInKM?: number;
  Odometer?: number;
  OdometerType?: string;
  PAINT?: string[];
  INTERIOR?: string[];
  IsDemo?: boolean;
  City?: string;
  StateProvince?: string;
  Zip?: string;
  CountryCode?: string;
  [key: string]: unknown;
}

interface TeslaApiResponse {
  results?: RawTeslaResult[];
  total_matches_found?: number;
}

const PAGE_SIZE = 50;

function buildQuery(model: TeslaModelCode, offset: number) {
  const market = process.env.TESLA_MARKET ?? "NL";
  const language = process.env.TESLA_LANGUAGE ?? "nl";
  const superRegion = process.env.TESLA_SUPER_REGION ?? "europe";

  const query = {
    query: {
      model,
      condition: "used",
      options: {},
      arrangeby: "Price",
      order: "asc",
      market,
      language,
      super_region: superRegion,
      lng: "",
      lat: "",
      zip: "",
      range: 0,
    },
    offset,
    count: PAGE_SIZE,
    outsideOffset: 0,
    outsideSearch: false,
  };

  return new URLSearchParams({ query: JSON.stringify(query) });
}

async function fetchPage(model: TeslaModelCode, offset: number): Promise<RawTeslaResult[]> {
  const params = buildQuery(model, offset);
  const localeSlug = `${(process.env.TESLA_LANGUAGE ?? "nl").toLowerCase()}_${(
    process.env.TESLA_MARKET ?? "NL"
  ).toLowerCase()}`;

  const res = await fetch(`${INVENTORY_URL}?${params.toString()}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Accept: "application/json",
      Referer: `https://www.tesla.com/${localeSlug}/inventory/used/m${model}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Tesla inventory API ${res.status} for model=${model} offset=${offset}`);
  }

  const data = (await res.json()) as TeslaApiResponse;
  return data.results ?? [];
}

export async function fetchUsedInventory(model: TeslaModelCode): Promise<RawTeslaResult[]> {
  const all: RawTeslaResult[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchPage(model, offset);
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
    if (offset > 2000) break; // safety valve
  }

  return all;
}

export interface InventoryEntry {
  model: TeslaModelCode;
  raw: RawTeslaResult;
}

export async function fetchAllUsedInventory(): Promise<{ entries: InventoryEntry[]; errors: number }> {
  const entries: InventoryEntry[] = [];
  let errors = 0;
  for (const model of TESLA_MODELS) {
    try {
      const results = await fetchUsedInventory(model);
      for (const raw of results) entries.push({ model, raw });
    } catch (err) {
      errors++;
      console.error(`Failed to fetch model ${model}:`, err);
    }
  }
  return { entries, errors };
}
