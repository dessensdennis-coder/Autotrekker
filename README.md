# Autotrekker

Volgt Tesla occasions (NL, alle modellen) zodat je zelf niet meer op
tesla.com/nl_nl/inventory hoeft te kijken:

- periodieke scrape van Tesla's used-inventory, opgeslagen in Postgres
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
.github/workflows   Handmatige workflow (schema-migratie; scrape alleen op verzoek)
```

## Belangrijk: waar de scrape draait

Tesla's inventory-API geeft een **HTTP 403** terug voor datacenter-IP's
(zoals die van GitHub Actions en de meeste cloud-servers). Vanaf een
**gewone thuis-internetverbinding** werkt het wél. Daarom draait de scrape
**lokaal** op je eigen computer; het dashboard en de database staan in de
cloud. Een lege/geblokkeerde scrape wist je gegevens niet — de scraper
weigert dan en laat de bestaande occasions staan.

## Eenmalige setup

### 1. Database (Neon, gratis tier)

1. Ga naar https://neon.tech, maak een gratis project.
2. Kopieer de connection string (inclusief `?sslmode=require`).

### 2. Lokaal de scrape draaien (op je eigen computer)

Vereist [Node.js 20+](https://nodejs.org) en [pnpm](https://pnpm.io/installation).

```bash
git clone <deze-repo> && cd Autotrekker
pnpm install
cp .env.example .env            # vul je Neon DATABASE_URL in
pnpm db:migrate                 # eenmalig: maakt de tabellen aan
pnpm scrape                     # haalt de occasions op en slaat ze op
```

`pnpm scrape` leest `DATABASE_URL` automatisch uit `.env` in de projectmap.

### 3. Automatisch laten draaien (elk uur, lokaal)

**macOS / Linux** — voeg een cron-regel toe met `crontab -e`:

```cron
0 * * * * cd /pad/naar/Autotrekker && /usr/local/bin/pnpm scrape >> scrape.log 2>&1
```

**Windows** — Taakplanner (Task Scheduler): maak een dagelijkse/uurlijkse taak
die `pnpm scrape` uitvoert in de projectmap. Je computer moet aan staan op
de momenten dat de taak draait.

### 4. Dashboard op Vercel

1. Importeer deze repo op https://vercel.com/new.
2. Zet **Root Directory** op `apps/web` (Vercel detecteert de pnpm-workspace
   automatisch en installeert vanuit de repo-root).
3. Zet de environment variable `DATABASE_URL` op dezelfde connection string.
4. Deploy.

Het dashboard leest dezelfde database, dus zodra je lokaal scrapet zie je
de occasions verschijnen. De trendlijn per model heeft een paar dagen data
nodig voordat 'ie iets toont.

## Lokaal het dashboard bekijken

```bash
pnpm dev   # dashboard op http://localhost:3000
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
