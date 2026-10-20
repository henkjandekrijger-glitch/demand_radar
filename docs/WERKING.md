# Demand Radar — complete werking

Dit document beschrijft hoe alles werkt. De live overdracht (https://demandradar-ivory.vercel.app/overdracht) zet de actuele
status van elk onderdeel erboven. **Bijwerken bij elke wijziging in de werking** (nieuw onderdeel, nieuwe bron, ander schema,
andere regel). De test `test/core.test.js` controleert dat elk eindpunt in `api/` en elk onderdeel van de statuslijst
(`lib/components.js`) hier genoemd wordt.

## 1. Wat het is en waar het draait

- **Wat**: Demand Radar voorspelt wat mensen gaan zoeken en kopen (nu NL, DE, US; het doel is wereldwijd), met per voorspelling
  een kans, de echte zoektermen in de eigen taal en een trackrecord. Een dienst van ADSFAIR B.V.
- **Site**: https://demandradar-ivory.vercel.app · **repo** (openbaar): github.com/henkjandekrijger-glitch/demand_radar ·
  push naar `main` = live op Vercel (project `demand_radar`, team henq).
- **Opslag**: Vercel Blob (privé), JSON-bestanden per onderdeel (paden staan per onderdeel hieronder).
- **AI**: Vercel AI Gateway (geen eigen sleutel nodig); goedkoop werk met `anthropic/claude-haiku-5.5`, de rest met het
  standaardmodel.
- **Extra server**: Railway (`worker/news`, nieuwsophaler voor GDELT), omdat GDELT verzoeken vanaf Vercel weigert.

## 2. Geplande taken (Vercel Cron, tijden in UTC)

| Taak | Wanneer | Wat |
|---|---|---|
| `/api/warm` | elk uur :07 | radaroverzicht verversen; **nachtelijke opbouw** van de radar vanaf 04:00 (als de radar niet van vandaag is, max 2 pogingen); Events van vandaag klaarzetten |
| `/api/loop` | elk uur :23 | signalen en kliks optellen, bol-momentopname, vroege signalen (één zware stap per uur), wildcards nakijken, Amazon-verkoop (maandelijks), Shopping-titels, marktprijzen Yoors, Keepa, leerlus pagina/mail |
| `/api/warmmap` | 04:15 | kansenkaart (alleen met `AUTO_BUILD=on`) |
| `/api/daily` | 05:40 | dagmail "Demand of the day" (Resend), alleen als mail is ingesteld |

Elke taak schrijft na afloop een hartslag (`status/<taak>.json`); de overdracht toont hoe lang geleden.

## 3. Pagina's

- `/` — de radar (`public/index.html`, `public/radar.js`): vijf tegels (Will rise, Early signals, Wildcards, Coming up, Events)
  en categorieën (Rising now, Unexpected, Not made yet, Products, Courses, Services, Books, Apps & AI, Trips, Money). Per tabblad
  een vet oordeel bovenaan en genummerde regels "naam: getal", met "Searched as" (de echte zoekopdrachten) eronder.
- `/check` — idee-check voor elk product, idee of dienst, optioneel per stad (`public/check.js`, `/api/check`).
- `/mine` en `/mine/<id>` — "Mijn bedrijf": bedrijf volgen, als advies opgemaakt (oordeel, genummerde punten, concurrenten,
  prioriteit deze week).
- `/map` — kansenkaart; `/rising` (What came up); `/team` (uitleg voor collega's); `/pricing`, `/terms`, `/privacy`, `/refund`,
  `/login`.
- `/overdracht` — deze overdracht (live).

## 4. Onderdelen

### radar — de radar zelf
`lib/demand.js` (`buildDemand`), `lib/data.js` (`getDemand`), `/api/demand`. Per land de meetbare vraag uit DataForSEO (Labs,
Google Ads 48 maanden, Trends) plus zoeksuggesties, Reddit, Hacker News, trending (Google, Bluesky), hitlijsten (Apple,
Open Library). AI geeft nette titels; de echte zoekterm blijft `keyword`. **Elke nacht** opgebouwd (zie §2), kost ± $2–3.
Opslag: `maps/demand.json` (de laatste opbouw), `demand/attempt-<dag>.json`. Eigenaar: `/api/demand?rebuild=1&key=…`.

### forecast — de voorspeller ("Will rise")
`lib/forecast.js`, `lib/ml.js`, `lib/model.js` (LightGBM-bomen als JS, model v2). Kans dat een zoekterm ≥ 40% boven nu
uitkomt; getoond vanaf 70%, gekalibreerd. Getoetst: 90% van de voorspelde stijgingen kwam uit. Hertrainen: `tools/mlrows.mjs` +
`tools/train_forecast.py` (zie README). Drijvers: weer (NASA POWER, MET Norway), kalender, schoolvakanties, voor geldonderwerpen
rente/energie/vertrouwen/aankoopplannen (`lib/drivers.js`).

### early — vroege signalen
`lib/early.js`, `lib/early-model.js`, `lib/earlydata.js`, `/api/early`. Zoektermen die nog niet zijn doorgebroken maar het
patroon hebben van termen die dat binnen 6 maanden wel deden. Kijklijst groeit naar ± 20.000 termen per land
(`early/series-<cc>.json`, `early/grow-<cc>.json`); elk uur één zware stap (verversen → wachtrij → groeien → doorrekenen).
Uitkomst `early/latest.json`.

### wildcards — gedurfde voorspellingen met trackrecord
`lib/wildcards.js`. Elke voorspelling met kans, nakijkdatum en een vooraf vastgelegde meetlat; dagelijks automatisch nagekeken
(`wild/state.json`, `wild/verdicts.json`). Handmatige uitkomst: `/api/early?op=wild&id=…&status=hit|partly|miss&key=…`.

### coming — komende momenten
`lib/calendar.js` (vaste momenten, feestdagen via Nager.Date), schoolvakanties (`lib/drivers.js`, OpenHolidays),
**beleidskalender** (`lib/regulation.js`: Federal Register-API voor de VS, nieuws met overheidssites voor NL/DE; wekelijks,
`regulation/<cc>.json`) en **lanceerkalender** (`lib/launches.js`: films, games, consoles, telefoons, auto's en series uit
Wikidata; wekelijks, `launches/<cc>.json`). Per moment zoektermen in de eigen taal met het verloop van vorig jaar.

### events — wat de wereld verwacht
`lib/events.js`, `/api/events`, tegel "Events". Open vragen op voorspellingsmarkten (Polymarket, Kalshi; gratis, alleen lezen).
Eén AI-vraag per dag kiest er tot 18 die de vraag in NL/DE/US verschuiven, met effect, richting en zoektermen per land.
Opslag `events/latest.json` en een dagelijkse momentopname `events/<dag>.json` om later na te kijken.

### mine — mijn bedrijf
`lib/mine.js`, `/api/mine`, `public/mine.*`. Website of één zin → profiel → 4 vragen → volgen op `/mine/<id>`. Dagelijks
gematcht met alle voorspellingen (`mine/<id>/<dag>.json`). Eigenaar: naam wijzigen `?op=rename&id=…&name=…&key=…`.

### compete — concurrenten en gaten
`lib/compete.js` (op `/mine/<id>`): Google top 10 + advertenties voor de grootste zoektermen, wat 4 AI-assistenten aanraden,
en 3-5 gaten met één actie. Eén keer per week per bedrijf (`mine/<id>/compete-<week>.json`).

### feed — Yoors Shop in Google Merchant Center
`lib/feed.js`, `/api/feed?shop=yoors&cc=NL` (productfeed, 1.027 producten, Merchant Center Yoors 5875752564 haalt hem
elke dag om 00:00 op). Titels met radar-zoektermen: `lib/feedopt.js`, elk uur een stuk (`feed/yoors-titles-NL.json`).
Korte stand (openbaar): `&status=1`; die verschijnt op het shop-overzicht van hjdk-api, niet op de klantpagina.

### bing — Yoors Shop bij Bing Webmaster Tools
`lib/bingsubmit.js`, eigenaar: `/api/feed?shop=yoors&bing=stand|toevoegen|verifieer|sitemap|indienen` (met `&max=`, `&droog=1`).
Zet https://yoo.rs/ in het Bing-account (BING_WEBMASTER_KEY), dient de sitemap uit robots.txt in en meldt elke productpagina
één keer aan binnen het dagquotum (`feed/yoors-bing.json`). De uurronde (`/api/loop`) gaat elk uur verder tot alles is ingediend.
Indienen kan pas als de site in Bing geverifieerd is (BingSiteAuth.xml of meta-tag msvalidate.01 op yoo.rs, of DNS).

### prices — marktprijzen per Yoors-product
`lib/prices.js`, `/api/feed?shop=yoors&cc=NL&prices=1`. Per product één zoekopdracht bij bol.com (via de bol-koppeling van
hjdk-api), Amazon.nl (DataForSEO, wachtrij) en Amazon.de (Keepa); AI oordeelt "zelfde product" of "vergelijkbaar"; een
"zelfde" met een prijs onder de helft of boven het dubbele telt als vergelijkbaar. Elk uur ± 25 producten (`prices/yoors-*.json`).
Gebruikt door hjdk-api (`lib/shopprijs.js`) voor het prijsadvies in Babita's briefing. Eigenaar: `&run=1`, `&pq=…`, `&resum=1`, `&reset=1`.

### keepa — Amazon-historie
`lib/keepa.js`, sleutel `KEEPA_KEY` (plan 20 tokens/min; abonnement opgezegd, loopt tot eind periode). Getoetst als voorspeller:
geen winst → niet in het model. Gebruikt voor Amazon.de-prijzen. Verzamelen: `keepa/state.json`, `keepa/<cc>.json`.
Eigenaar: `/api/early?op=keepa&key=…`.

### amazonsales — Amazon "gekocht vorige maand"
`lib/amazonsales.js`: één keer per maand voor ± 150 termen per land (DataForSEO Merchant Amazon, wachtrij) →
`amzsales/<cc>/<maand>.json`. Op de bedrijfspagina en bij checks.

### bol — populair op bol.com
`lib/bolpop.js`: dagelijks de 50 populairste producten op bol.com NL (`bolpop/<dag>.json`), via de bol-koppeling van hjdk-api.

### check — idee-check
`lib/core.js`, `/api/check`: score 0-100, fase, zoekvolumes, Wikipedia, nieuws (GDELT, via de nieuwsophaler als
`GDELT_PROXY` gezet is), Google News, Reddit, lokale zaken (OpenStreetMap), weer, Amazon-volume, AI-zoekvolume, en waar
ingesteld Bing, YouTube en Meta-advertenties. Advies "Go now / Get ready / Test small / Wait / Skip" (`lib/advice.js`).

### news — nieuwsophaler (Railway)
`worker/news` (Node, geen sleutels): haalt GDELT op vanaf een eigen adres, hooguit 1 verzoek per 6 seconden, 1 uur cache.
In Vercel `GDELT_PROXY=https://<railway-domein>`. Nog te toetsen of nieuws de voorspelling beter maakt.

### sources — koppelingen die op een sleutel wachten
Bing (`BING_WEBMASTER_KEY`, `lib/bing.js`), YouTube (`YOUTUBE_API_KEY`, `lib/youtube.js`), Meta-advertentiebibliotheek
(`META_AD_TOKEN`, `lib/meta.js`, na ID-bevestiging van Henkjan), Pinterest (app-aanvraag loopt), TikTok (account nodig),
Google-bestsellerlijst (Merchant API, toegang regelen), Google Trends API (alpha, aangevraagd).

### learning — leren van bezoekers en uitkomsten
`lib/learn.js`, `lib/demandlearn.js`, `/api/e`, `/api/feedback`, `/api/outcome`, `/api/learn`, `/api/ab`, `/api/go`:
kliks, "Useful / Not real demand", campagne-uitkomsten en A/B-varianten van pagina en mail; uurronde telt op.

### accounts — inloggen en abonnement
`lib/access.js` (teamsleutel `TEAM_KEY`, persoonlijke sleutels), `lib/account.js` (plannen), `/api/unlock`, `/api/me`,
`/api/account`, `/api/paddle` (betalen via Paddle, nog niet live), `/api/subscribe` en `/api/daily` (dagmail via Resend).

### connector — gebruik vanuit andere chats
`/api/mcp` (`/mcp?key=<teamsleutel>`): tools `check_demand`, `opportunity_map`, `demand_radar`, `report_outcome`,
`handover`, `handover_note`, `live_signals`.

### handover — deze overdracht
`lib/handover.js`, `lib/components.js`, `/api/handover` (`/overdracht`). Live status per onderdeel, budgetten, open taken,
logboek, codewijzigingen en dit document. Bijwerken: `?op=note|todo|done&key=…`.

### tools — onderzoek en toetsen (eigenaar)
`/api/series` (zoekreeksen en drijvers voor toetsen), `/api/collect` (historie uit gratis bronnen), `/api/probe` (één bron
testen), `/api/status` (gezondheid van de bronnen), `/api/map` en `/api/warmmap` (kansenkaart), `/api/rising` (What came up),
`/api/radar` (oud overzicht), `/api/reviews` (reviews via DataForSEO voor de reviewplek, max 10 taken per dag).
Scripts in `tools/` (toetsen van bronnen en het model).

## 5. Geld en grenzen

- **DataForSEO**: dagrem `DFS_DAILY_MAX` = $4 voor alles, plus `DFS_BUILD_MAX` = $3 alleen voor de nachtelijke opbouw
  (Henkjan, 18 okt). Wat de opbouw uitgaf (`dfs/build-<dag>.json`) telt niet mee voor de rest.
- **Keepa**: 20 tokens per minuut; marktprijzen gaan voor op het verzamelen.
- Nooit een eindpunt dat geld of quotum kost in een lus aanroepen (checks, `op=yt`, `op=refresh`, `prices&run=1`).

## 6. Vaste regels (Henkjan)

- Nederlands, kort, één stap tegelijk vragen; zuinig met tokens.
- Repo is openbaar: nooit sleutels in code, commits of chat; alleen in Vercel (Henkjan plakt ze zelf).
- Alleen opnemen in het model wat in een eerlijke toets aantoonbaar beter voorspelt.
- Echte zoektermen in de eigen taal altijd zichtbaar ("Searched as").
- Alles moet in de cloud blijven draaien, ook als Henkjans computer uit staat.

## 7. Getoetst en afgevallen

Wikipedia-bezoeken, griep, vacatures, VS als voorloper, energieprijzen, Keepa-verkoophistorie: geen winst in de toets.
Energy-Charts (stroomprijs) mag niet doorgegeven worden. Amazon-bestsellerpagina's, Pinterest- en TikTok-websites, eBay/Etsy:
geblokkeerd vanaf de server.
