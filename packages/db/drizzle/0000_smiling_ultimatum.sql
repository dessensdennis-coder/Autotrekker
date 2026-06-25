CREATE TABLE IF NOT EXISTS "cars" (
	"vin" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"trim" text,
	"title" text,
	"year" integer,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'EUR' NOT NULL,
	"mileage_km" integer,
	"exterior_color" text,
	"interior_color" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"location_city" text,
	"location_zip" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delisted_at" timestamp with time zone,
	"is_interesting" boolean DEFAULT false NOT NULL,
	"interesting_note" text,
	"market_median_price" integer,
	"price_delta_pct" real,
	"price_assessment" text,
	"comparable_count" integer,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "model_price_daily" (
	"id" serial PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"date" date NOT NULL,
	"median_price" integer NOT NULL,
	"avg_price" integer NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"vin" text NOT NULL,
	"price" integer NOT NULL,
	"observed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"total_found" integer,
	"new_count" integer,
	"delisted_count" integer,
	"error" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_history" ADD CONSTRAINT "price_history_vin_cars_vin_fk" FOREIGN KEY ("vin") REFERENCES "public"."cars"("vin") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "model_price_daily_model_date_idx" ON "model_price_daily" USING btree ("model","date");