import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  serial,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const cars = pgTable("cars", {
  vin: text("vin").primaryKey(),
  model: text("model").notNull(), // 'ms' | '3' | 'mx' | 'y'
  trim: text("trim"),
  title: text("title"),
  year: integer("year"),
  price: integer("price").notNull(), // EUR, whole euros
  currency: text("currency").notNull().default("EUR"),
  mileageKm: integer("mileage_km"),
  exteriorColor: text("exterior_color"),
  interiorColor: text("interior_color"),
  isDemo: boolean("is_demo").notNull().default(false),
  locationCity: text("location_city"),
  locationZip: text("location_zip"),

  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  delistedAt: timestamp("delisted_at", { withTimezone: true }),

  isInteresting: boolean("is_interesting").notNull().default(false),
  interestingNote: text("interesting_note"),

  // market-relative pricing, recomputed every scrape run
  marketMedianPrice: integer("market_median_price"),
  priceDeltaPct: real("price_delta_pct"), // (price - median) / median
  priceAssessment: text("price_assessment"), // 'koopje' | 'redelijk' | 'duur'
  comparableCount: integer("comparable_count"),

  raw: jsonb("raw"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const priceHistory = pgTable("price_history", {
  id: serial("id").primaryKey(),
  vin: text("vin")
    .notNull()
    .references(() => cars.vin, { onDelete: "cascade" }),
  price: integer("price").notNull(),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const modelPriceDaily = pgTable(
  "model_price_daily",
  {
    id: serial("id").primaryKey(),
    model: text("model").notNull(),
    date: date("date").notNull(),
    medianPrice: integer("median_price").notNull(),
    avgPrice: integer("avg_price").notNull(),
    count: integer("count").notNull(),
  },
  (table) => [uniqueIndex("model_price_daily_model_date_idx").on(table.model, table.date)],
);

export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  totalFound: integer("total_found"),
  newCount: integer("new_count"),
  delistedCount: integer("delisted_count"),
  error: text("error"),
});
