import { eq, inArray, isNull } from "drizzle-orm";
import { getDb, cars, priceHistory, modelPriceDaily, scrapeRuns } from "@autotrekker/db";
import { fetchAllUsedInventory, TESLA_MODELS } from "./teslaClient";
import { normalizeTeslaResult } from "./mapper";
import { computeModelDailyStats, computePricing } from "./pricing";

async function main() {
  const db = getDb();
  const startedAt = new Date();

  const [run] = await db.insert(scrapeRuns).values({ startedAt }).returning({ id: scrapeRuns.id });

  try {
    const rawResults = await fetchAllUsedInventory();

    const normalized = rawResults
      .map((raw) => {
        const modelGuess = TESLA_MODELS.find((m) => raw.Model?.toLowerCase().includes(m)) ?? "3";
        return normalizeTeslaResult(raw, modelGuess);
      })
      .filter((c): c is NonNullable<typeof c> => c !== null && c.price > 0);

    const seenVins = new Set(normalized.map((c) => c.vin));
    const existing = await db.select().from(cars);
    const existingByVin = new Map(existing.map((c) => [c.vin, c]));

    let newCount = 0;
    const now = new Date();

    for (const car of normalized) {
      const prev = existingByVin.get(car.vin);

      await db
        .insert(cars)
        .values({
          vin: car.vin,
          model: car.model,
          trim: car.trim,
          year: car.year,
          price: car.price,
          mileageKm: car.mileageKm,
          exteriorColor: car.exteriorColor,
          interiorColor: car.interiorColor,
          isDemo: car.isDemo,
          locationCity: car.locationCity,
          locationZip: car.locationZip,
          firstSeenAt: now,
          lastSeenAt: now,
          delistedAt: null,
          raw: car.raw,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: cars.vin,
          set: {
            price: car.price,
            mileageKm: car.mileageKm,
            trim: car.trim,
            exteriorColor: car.exteriorColor,
            interiorColor: car.interiorColor,
            lastSeenAt: now,
            delistedAt: null,
            raw: car.raw,
            updatedAt: now,
          },
        });

      if (!prev) {
        newCount++;
        await db.insert(priceHistory).values({ vin: car.vin, price: car.price, observedAt: now });
      } else if (prev.price !== car.price) {
        await db.insert(priceHistory).values({ vin: car.vin, price: car.price, observedAt: now });
      }
    }

    // mark cars no longer present as delisted
    const stillListedVins = [...seenVins];
    const previouslyListed = existing.filter((c) => c.delistedAt === null);
    const goneVins = previouslyListed.map((c) => c.vin).filter((vin) => !seenVins.has(vin));

    let delistedCount = 0;
    if (goneVins.length > 0) {
      await db.update(cars).set({ delistedAt: now, updatedAt: now }).where(inArray(cars.vin, goneVins));
      delistedCount = goneVins.length;
    }

    // recompute market-relative pricing for everything currently listed
    const currentlyListed = await db.select().from(cars).where(isNull(cars.delistedAt));

    const pricingInputs = currentlyListed.map((c) => ({
      vin: c.vin,
      model: c.model,
      year: c.year,
      mileageKm: c.mileageKm,
      price: c.price,
    }));

    const pricingResults = computePricing(pricingInputs);

    for (const result of pricingResults) {
      await db
        .update(cars)
        .set({
          marketMedianPrice: result.marketMedianPrice,
          priceDeltaPct: result.priceDeltaPct,
          priceAssessment: result.priceAssessment,
          comparableCount: result.comparableCount,
          updatedAt: now,
        })
        .where(eq(cars.vin, result.vin));
    }

    // daily trend snapshot per model
    const dailyStats = computeModelDailyStats(pricingInputs);
    const today = now.toISOString().slice(0, 10);

    for (const stat of dailyStats) {
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
          set: {
            medianPrice: stat.medianPrice,
            avgPrice: stat.avgPrice,
            count: stat.count,
          },
        });
    }

    await db
      .update(scrapeRuns)
      .set({
        finishedAt: new Date(),
        totalFound: normalized.length,
        newCount,
        delistedCount,
      })
      .where(eq(scrapeRuns.id, run.id));

    console.log(
      `Scrape done: ${normalized.length} found, ${newCount} new, ${delistedCount} delisted (run #${run.id}).`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(scrapeRuns)
      .set({ finishedAt: new Date(), error: message })
      .where(eq(scrapeRuns.id, run.id));
    throw err;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
