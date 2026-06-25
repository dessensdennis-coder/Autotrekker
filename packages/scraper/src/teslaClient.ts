import { chromium, type Page } from "playwright";

const INVENTORY_API = "https://www.tesla.com/inventory/api/v1/inventory-results";

export const TESLA_MODELS = ["ms", "3", "mx", "y"] as const;
export type TeslaModelCode = (typeof TESLA_MODELS)[number];

// URL path segment of the public used-inventory page per model.
const MODEL_PAGE_SLUG: Record<TeslaModelCode, string> = {
  ms: "ms",
  "3": "m3",
  mx: "mx",
  y: "my",
};

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
const NAV_TIMEOUT_MS = 60_000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function localeSlug() {
  const language = (process.env.TESLA_LANGUAGE ?? "nl").toLowerCase();
  const market = (process.env.TESLA_MARKET ?? "NL").toLowerCase();
  return `${language}_${market}`;
}

function buildQueryString(model: TeslaModelCode, offset: number) {
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

  return new URLSearchParams({ query: JSON.stringify(query) }).toString();
}

// Fetch one page of results from *inside* the loaded browser page. Because the
// request originates from a real Chromium tab on tesla.com it carries the
// browser's genuine TLS fingerprint and the cookies Tesla set on page load,
// which a plain Node fetch does not — that bare request gets a 403.
async function fetchPageInBrowser(page: Page, model: TeslaModelCode, offset: number): Promise<RawTeslaResult[]> {
  const url = `${INVENTORY_API}?${buildQueryString(model, offset)}`;

  const data = (await page.evaluate(async (u) => {
    const res = await fetch(u, { headers: { Accept: "application/json" }, credentials: "include" });
    if (!res.ok) throw new Error(`Tesla inventory API ${res.status}`);
    return res.json();
  }, url)) as TeslaApiResponse;

  return data.results ?? [];
}

async function fetchUsedInventory(page: Page, model: TeslaModelCode): Promise<RawTeslaResult[]> {
  // Land on the real inventory page first so Tesla establishes a browser
  // session (cookies, anti-bot tokens) before we call its JSON API.
  const pageUrl = `https://www.tesla.com/${localeSlug()}/inventory/used/${MODEL_PAGE_SLUG[model]}`;
  await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT_MS });

  const all: RawTeslaResult[] = [];
  let offset = 0;

  while (true) {
    const results = await fetchPageInBrowser(page, model, offset);
    all.push(...results);
    if (results.length < PAGE_SIZE) break;
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
  // Headless by default; set SCRAPER_HEADFUL=1 to watch the browser (useful
  // when debugging or if headless ever gets flagged by bot detection).
  const headless = !process.env.SCRAPER_HEADFUL;
  const browser = await chromium.launch({ headless });

  const entries: InventoryEntry[] = [];
  let errors = 0;

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "nl-NL",
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: { "Accept-Language": "nl-NL,nl;q=0.9,en-US;q=0.8,en;q=0.7" },
    });
    const page = await context.newPage();

    for (const model of TESLA_MODELS) {
      try {
        const results = await fetchUsedInventory(page, model);
        for (const raw of results) entries.push({ model, raw });
      } catch (err) {
        errors++;
        console.error(`Failed to fetch model ${model}:`, err);
      }
    }
  } finally {
    await browser.close();
  }

  return { entries, errors };
}
