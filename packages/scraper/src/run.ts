import { readFileSync } from "node:fs";
import { eq, inArray, sql } from "drizzle-orm";
import { getDb, cars, priceHistory, modelPriceDaily, scrapeRuns } from "@autotrekker/db";
import { fetchAllUsedInventory, type InventoryEntry } from "./teslaClient";
import { normalizeTeslaResult } from "./mapper";
import { computeModelDailyStats, computePricing } from "./pricing";

// Load DATABASE_URL (and friends) from the repo-root .env when running locally,
// so a plain `pnpm scrape` works without prefixing env vars every time.
function loadEnvFile() {
  if (process.env.DATABASE_URL) return;
  for (const name of [".env.local", ".env"]) {
    try {
      const path = new URL(`../../../${name}`, import.meta.url);
      const content = readFileSync(path, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        if (!(key in process.env)) process.env[key] = value;
      }
    } catch {
      // file not present, that's fine
    }
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const CHUNK_SIZE = 200;

type Db = ReturnType<typeof getDb>;

export async function persistInventory(db: Db, entries: InventoryEntry[]) {
  const now = new Date();

  const normalized = entries
    .map((e) => normalizeTeslaResult(e.raw, e.model))
    .filter((c): c is NonNullable<typeof c> => c !== null && c.price > 0);

  // Safety guard: never let an empty/blocked fetch wipe the listing state.
  if (normalized.length === 0) {
    throw new Error("No listings returned — refusing to mark everything as delisted (likely blocked or API error).");
  }

  const existing = await db.select().from(cars);
  const existingByVin = new Map(existing.map((c) => [c.vin, c]));
  const seenVins = new Set(normalized.map((c) => c.vin));

  // Market-relative pricing is computed from the fresh full set of live listings.
  const pricingInputs = normalized.map((c) => ({
    vin: c.vin,
    model: c.model,
    year: c.year,
    mileageKm: c.mileageKm,
    price: c.price,
  }));
  const pricing = new Map(computePricing(pricingInputs).map((r) => [r.vin, r]));

  let newCount = 0;
  const priceHistoryRows: { vin: string; price: number; observedAt: Date }[] = [];

  const rows = normalized.map((c) => {
    const prev = existingByVin.get(c.vin);
    const p = pricing.get(c.vin);

    if (!prev) {
      newCount++;
      priceHistoryRows.push({ vin: c.vin, price: c.price, observedAt: now });
    } else if (prev.price !== c.price) {
      priceHistoryRows.push({ vin: c.vin, price: c.price, observedAt: now });
    }

    return {
      vin: c.vin,
      model: c.model,
      trim: c.trim,
      year: c.year,
      price: c.price,
      mileageKm: c.mileageKm,
      exteriorColor: c.exteriorColor,
      interiorColor: c.interiorColor,
      isDemo: c.isDemo,
      locationCity: c.locationCity,
      locationZip: c.locationZip,
      firstSeenAt: now,
      lastSeenAt: now,
      delistedAt: null,
      marketMedianPrice: p?.marketMedianPrice ?? null,
      priceDeltaPct: p?.priceDeltaPct ?? null,
      priceAssessment: p?.priceAssessment ?? null,
      comparableCount: p?.comparableCount ?? null,
      raw: c.raw,
      updatedAt: now,
    };
  });

  // Batched upsert. On conflict we refresh the live fields but preserve
  // first_seen_at and the user's is_interesting / note.
  for (const part of chunk(rows, CHUNK_SIZE)) {
    await db
      .insert(cars)
      .values(part)
      .onConflictDoUpdate({
        target: cars.vin,
        set: {
          price: sql`excluded.price`,
          mileageKm: sql`excluded.mileage_km`,
          trim: sql`excluded.trim`,
          exteriorColor: sql`excluded.exterior_color`,
          interiorColor: sql`excluded.interior_color`,
          locationCity: sql`excluded.location_city`,
          locationZip: sql`excluded.location_zip`,
          lastSeenAt: sql`excluded.last_seen_at`,
          delistedAt: sql`excluded.delisted_at`,
          marketMedianPrice: sql`excluded.market_median_price`,
          priceDeltaPct: sql`excluded.price_delta_pct`,
          priceAssessment: sql`excluded.price_assessment`,
          comparableCount: sql`excluded.comparable_count`,
          raw: sql`excluded.raw`,
          updatedAt: sql`excluded.updated_at`,
        },
      });
  }

  for (const part of chunk(priceHistoryRows, CHUNK_SIZE)) {
    await db.insert(priceHistory).values(part);
  }

  // Mark cars that were live but are no longer present as delisted.
  const goneVins = existing.filter((c) => c.delistedAt === null && !seenVins.has(c.vin)).map((c) => c.vin);
  if (goneVins.length > 0) {
    for (const part of chunk(goneVins, CHUNK_SIZE)) {
      await db.update(cars).set({ delistedAt: now, updatedAt: now }).where(inArray(cars.vin, part));
    }
  }

  // Daily trend snapshot per model.
  const today = now.toISOString().slice(0, 10);
  for (const stat of computeModelDailyStats(pricingInputs)) {
    await db
      .insert(modelPriceDaily)
      .values({
        model: stat.model,
        date: today,
        medianPrice: stat.medianPrice,
        avgPrice: stat.avgPrice,
        count: stat.count,
      })
      .onConflictDoUpdate({
        target: [modelPriceDaily.model, modelPriceDaily.date],
        set: { medianPrice: stat.medianPrice, avgPrice: stat.avgPrice, count: stat.count },
      });
  }

  return { totalFound: normalized.length, newCount, delistedCount: goneVins.length };
}

async function main() {
  loadEnvFile();
  const db = getDb();

  const [run] = await db.insert(scrapeRuns).values({ startedAt: new Date() }).returning({ id: scrapeRuns.id });

  try {
    const { entries, errors } = await fetchAllUsedInventory();

    if (entries.length === 0) {
      throw new Error(`Fetched 0 listings (${errors} model fetches failed — likely blocked from this IP).`);
    }

    const result = await persistInventory(db, entries);

    await db
      .update(scrapeRuns)
      .set({
        finishedAt: new Date(),
        totalFound: result.totalFound,
        newCount: result.newCount,
        delistedCount: result.delistedCount,
      })
      .where(eq(scrapeRuns.id, run.id));

    console.log(
      `Scrape done: ${result.totalFound} found, ${result.newCount} new, ${result.delistedCount} delisted (run #${run.id}).`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.update(scrapeRuns).set({ finishedAt: new Date(), error: message }).where(eq(scrapeRuns.id, run.id));
    throw err;
  }
}

// Only run automatically when executed directly (not when imported by tests).
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
