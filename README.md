# Autotrekker

Volgt Tesla occasions (NL, alle modellen) zodat je zelf niet meer op
tesla.com/nl_nl/inventory hoeft te kijken:

- elk uur een scrape van Tesla's used-inventory, opgeslagen in Postgres
- "NIEUW"-badge zodra een VIN voor het eerst gezien wordt
- automatische delisting-detectie (auto verdwenen uit voorraad)
- prijsoordeel **koopje / redelijk / duur** t.o.v. de mediaanprijs van
  vergelijkbare occasions (zelfde model, bouwjaar ±1, kilometerstand-band)
- trend per model: worden Model 3's deze maand duurder of goedkoper
- hartje om een auto als "interessant" te markeren, blijft bewaard

AutoScout24 is bewust **niet** in v1 meegenomen — die site zit achter
Akamai bot-detectie en heeft geen leesbare API, dat is een aparte,
fragielere klus die we later kunnen oppakken.

## Structuur

```
packages/db        Drizzle-schema + Postgres-client, gedeeld door scraper en web
packages/scraper    Haalt Tesla-inventory op, slaat op, berekent prijzen/trend
apps/web            Next.js dashboard (te hosten op Vercel)
.github/workflows   Cron-job die de scraper elk uur draait
```

## Eenmalige setup (moet je zelf doen — eigen accounts)

### 1. Database (Neon, gratis tier)

1. Ga naar https://neon.tech, maak een gratis project.
2. Kopieer de connection string (inclusief `?sslmode=require`).

### 2. GitHub secret voor de cron-job

In de GitHub-repo: **Settings → Secrets and variables → Actions → New repository secret**

- Naam: `DATABASE_URL`
- Waarde: de connection string uit stap 1

De workflow `.github/workflows/scrape.yml` draait daarna elk uur automatisch
(en is ook handmatig te starten via Actions → "Scrape Tesla inventory" →
"Run workflow"). De **tabellen worden bij de eerste run automatisch
aangemaakt** (de workflow draait `db:migrate` vóór de scrape) — je hoeft
dus zelf geen schema te pushen.

### 3. Dashboard op Vercel

1. Importeer deze repo op https://vercel.com/new.
2. Zet **Root Directory** op `apps/web` (Vercel detecteert de pnpm-workspace
   automatisch en installeert vanuit de repo-root).
3. Zet de environment variable `DATABASE_URL` op dezelfde connection string.
4. Deploy.

Na de eerste paar scrape-runs (geef het een paar uur, dan heb je ook een
trendlijn) vul je het dashboard met actuele occasions.

## Lokaal draaien

```bash
pnpm install
cp .env.example .env.local   # vul DATABASE_URL in
pnpm db:push                 # eenmalig, of na schema-wijzigingen
pnpm scrape                  # handmatig een scrape-run
pnpm dev                     # dashboard op http://localhost:3000
```

## Prijsformule

Voor elke auto worden "vergelijkbare" occasions gezocht: zelfde model,
bouwjaar binnen ±1 jaar, kilometerstand binnen een marge van 20.000 km
(of 25% van de kilometerstand, de ruimste van de twee). Bij minder dan
3 vergelijkbare auto's wordt de band losgelaten tot "zelfde model".  Is de
prijs van de auto:

- **≤ 8% onder** de mediaan van die groep → `koopje`
- **≥ 8% boven** de mediaan → `duur`
- anders → `redelijk`

De drempels (`KOOPJE_THRESHOLD`, `DUUR_THRESHOLD`) staan in
`packages/scraper/src/pricing.ts` en zijn makkelijk aan te passen.

## Volgende stappen (niet in v1)

- AutoScout24 (of andere occasion-sites) als losse scraper-module
  toevoegen — vergt waarschijnlijk een betaalde scraping-proxy vanwege
  Akamai-botbescherming.
- E-mail/Telegram-melding bovenop het dashboard, als je toch niet
  iedere dag wilt inloggen.
