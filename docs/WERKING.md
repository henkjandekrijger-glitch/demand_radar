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
- **AI**: Vercel AI Gateway (geen eigen sleutel nodig), alles via `lib/ai.js`. **Standaard `anthropic/claude-haiku-5.5`**
  (env `MINE_MODEL`) voor alle extractie, classificatie en JSON-werk; **sonnet alleen** voor de AI-analist bij een betaalde
  check (`lib/core.js`, met webzoeken) en het advies op de kansenkaart (`lib/map.js`, gat + eerste stap). Per aanroeper terug
  te zetten met een env (`DEMAND_MODEL`, `RISING_MODEL`, `MAP_MODEL`, `MAP_ADVICE_MODEL`, `REGULATION_MODEL`, `LAUNCH_MODEL`,
  `PROFILE_MODEL`, `FEED_MODEL`). Zuinig (20 okt 2026, Henkjan: "alles token-efficiënt"):
  - **Cache**: `askCached` bewaart elk bruikbaar antwoord in Blob op `aicache/<taak>/<hash van model+systeem+vraag>.json`;
    dezelfde vraag gaat binnen de houdbaarheid niet opnieuw naar AI (radar/rising/events 20 u, checks 24 u, beleid en
    lanceringen 14 dagen, profiel, thema, prijzen 30 dagen, feedtitels 7 dagen). Uitzetten: env `AI_CACHE=uit`.
  - **Alleen wat nieuw is**: de radar onthoudt per zoekterm het AI-oordeel (`aicache/items-demand-rows.json` 5 dagen,
    `-rise.json` 7 dagen); de nachtelijke opbouw vraagt alleen nieuwe onderwerpen, 25 per vraag. Feedtitels: een product
    zonder bruikbaar antwoord 3 dagen niet opnieuw; prijsoordeel na 3 mislukte pogingen afgesloten.
  - **Kleine invoer**: vaste instructies in de systeemprompt (gecachet, ± 10% prijs), wisselende data in de gebruikersprompt,
    alleen de nodige velden (`compact`: lege velden weg, getallen afgerond, teksten en lijsten afgekapt), `maxTokens` naar
    behoefte. Leeg antwoord: één keer opnieuw, met haiku.
  Elke aanroep heeft het label `project:demand_radar,fn:<bestand>` en het model komt via de opruimlus
  (`https://opruimlus.vercel.app/api/model`, 5 min gecachet): boven het dagbudget krijgt dit project een goedkoper
  Anthropic-model, om 00:00 UTC weer normaal. Uitzetten: env `OPRUIM=uit`.
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

### fill — teksten door Claude in plaats van de Vercel AI Gateway (4 nov 2026)
Henkjan 4 nov: "Vul content gewoon aan met jouw tokens. Niet Vercel gateway!!". De AI Gateway staat uit tenzij `AI_GATEWAY=on`
(lib/ai.js `gatewayToken` geeft dan pas een sleutel). De nachtelijke opbouw meet gewoon en past toe wat in het geheugen staat
(onderwerpen 5 dagen, stijgers 7 dagen). Wat nog een titel, categorie, wat-het-is en idee mist, vult Claude in:
- `GET /api/fill` (openbaar, alleen radargegevens): de open onderwerpen, stijgers, trending van vandaag per land, de vragen van de
  voorspellingsmarkten (`events/markets-<dag>.json`) plus instructie en antwoordformaat.
- Claude schrijft `fill/<dag>.json` op tak `fill` van de repo (Vercel bouwt die tak niet: `git.deploymentEnabled` in vercel.json;
  alleen wie mag pushen kan schrijven) of POST het naar `/api/fill?key=…`. Eigenaar `?repo=1` haalt het bestand nu op.
- De uurronde (`/api/warm`) haalt het bestand op en past het één keer toe (`fill/applied-<dag>.json`): radar van vandaag,
  geheugen voor de volgende nachten en de events van vandaag (lib/claudefill.js, `saveEvents` in lib/events.js).
- Dagelijks invullen: een geplande Claude-taak (± 06:20 UTC, na de nachtelijke opbouw) wacht op Henkjans akkoord; tot dan doet een chat het (4 nov: 136 onderwerpen, 11 stijgers, 6 trending, 5 events).
Nog niet via Claude (staan stil zolang de gateway uit is): prijsoordelen Yoors/Kadoly, lanceringen, beleid, check-analist.

### mine — mijn bedrijf
`lib/mine.js`, `/api/mine`, `public/mine.*`. Website of één zin → profiel → 4 vragen → volgen op `/mine/<id>`. Dagelijks
gematcht met alle voorspellingen (`mine/<id>/<dag>.json`). Eigenaar: naam wijzigen `?op=rename&id=…&name=…&key=…`.

### compete — concurrenten en gaten
`lib/compete.js` (op `/mine/<id>`): Google top 10 + advertenties voor de grootste zoektermen, wat 4 AI-assistenten aanraden,
en 3-5 gaten met één actie. Eén keer per week per bedrijf (`mine/<id>/compete-<week>.json`).

### feed — Kadoly (voorheen Yoors Shop) in Google Merchant Center
`lib/feed.js`, `/api/feed?shop=yoors&cc=NL` (sinds 30 okt 2026 uit kadoly.com/shop/api/shop met links naar kadoly.com/product/<id>, want yoo.rs is sinds 26 okt offline; `shop=kadoly` is hetzelfde; productfeed, 1.027 producten, Merchant Center Yoors 5875752564 haalt hem
elke dag om 00:00 op; de feed wordt opnieuw opgebouwd zodra hij ouder is dan 2 uur, zodat de prijzen kloppen met de shop). Titels met radar-zoektermen: `lib/feedopt.js`, elk uur een stuk (`feed/yoors-titles-NL.json`). Seizoen (4 nov 2026, Henkjan: "zorg dat het gevonden wordt !!! SEO LLM GMC"): `SEIZOEN_TITELS` in `lib/feed.js` gaat voor die titels: Sinterklaas- en kerstproducten krijgen de zoekterm van nu in de titel en `custom_label_0` (sinterklaas of kerst); in januari weghalen.
Korte stand (openbaar): `&status=1`; die verschijnt op het shop-overzicht van hjdk-api, niet op de klantpagina.
Eigenaar: `&probe=<id>` laat zien hoe een productpagina er uitgelogd uitziet (status, titel, prijs uit JSON-LD); met `&grep=<regex>` geeft hij de stukjes HTML rond die term (hoogstens 40), om de meting van Clickmind (cm.js) op knoppen en blokken van de pagina af te stemmen.

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

### zoekvraag — wat mensen zoeken over een thema
`api/zoekvraag.js`, `/api/zoekvraag?thema=curacao[&cc=US]` (openbaar te lezen): per markt in de eigen taal alle zoektermen met het thema
erin (DataForSEO Labs top_searches met een regex, alle zoekintenties, volume ≥ 20), met volume, jaartrend, intentie en 12 maanden, en per
onderwerp (vluchten, hotels, stranden, duiken, weer, geld, reisregels, veiligheid, eten, doen, uitgaan, cruise, vervoer, wonen, kaart, taal,
nieuws) het totaal en de grootste termen. Per thema hooguit één keer per 7 dagen gekocht (hooguit `ZV_MAX`, standaard $0,60, binnen de dagrem),
daarna uit `zoekvraag/<thema>.json`. Henkjan 9 nov 2026: "Doe goed onderzoek met demand radar waar mensen naar zoeken en optimaliseer de site
daarop". Eerste thema: curacao (US, NL, DE, CA, CO, BR) voor curacao.day. Sinds 10 nov 2026 ook kadoly-wonen, kadoly-hobby en kadoly-cadeau (NL, BE) op de soorten producten die Kadoly echt heeft plus cadeauvragen, met eigen onderwerpgroepen (`ow` in het thema); hjdk-api `/api/gids?op=vraagkansen` legt ze naast het aanbod en de gidsen van gids.kadoly.com (Henkjan: onderwerpen die ChatGPT naar boven haalt en die in de winkel komen). Nieuw thema = één regel in `THEMA`, optioneel met eigen `ow` (lijst [naam, regex]). ZICHT (hjdk-api) gebruikt dit
in de werkwijze: zoekvraag naast de eigen pagina's leggen en de gaten vullen.

### connector — gebruik vanuit andere chats
`/api/mcp` (`/mcp?key=<teamsleutel>`): tools `check_demand`, `opportunity_map`, `demand_radar`, `report_outcome`,
`handover`, `handover_note`, `live_signals`.

### handover — deze overdracht
`lib/handover.js`, `lib/components.js`, `/api/handover` (`/overdracht`). Live status per onderdeel, budgetten, open taken,
logboek, codewijzigingen en dit document. Bijwerken: `?op=note|todo|done&key=…`.

### tools — onderzoek en toetsen (eigenaar)
`/api/series` (zoekreeksen en drijvers voor toetsen; met `ads=1` ook voor extra landen GB, BE, CA, CO, BR, SE, FR, gebruikt door de Curaçao-trends van keuzehulp.best/curacao.day, sinds 9 nov 2026 met CA, CO en BR), `/api/collect` (historie uit gratis bronnen), `/api/probe` (t=gmb: Google-bedrijfsprofielen met score en aantal reviews voor max 25 namen per keer, voor de Curaçao-keuzehulpen van hjdk-api; één bron
testen), `/api/status` (gezondheid van de bronnen), `/api/map` en `/api/warmmap` (kansenkaart), `/api/rising` (What came up),
`/api/radar` (oud overzicht), `/api/reviews` (reviews via DataForSEO voor de reviewplek, max 10 taken per dag; op=listings: alle bedrijven op Curaçao via DataForSEO Business Listings ($0,01 per verzoek plus $0,0003 per bedrijf), pagina's van 1000 in de opslag (cw/listings/page-<n>.json), hervat met offset_token, max $3 per dag (CW_LISTINGS_USD), read=<n> leest een pagina gratis; op=catagg&plaats=cw|rotterdam|amsterdam|aruba: aantal bedrijven per soort in die plaats (categories_aggregation), bewaard in cw/catagg/<plaats>.json, hooguit eens per 30 dagen opnieuw (vers=1), max 6 verzoeken per dag, om te zien welke soorten bedrijven op Curaçao ontbreken; op=gmb: Google-bedrijfsprofielen met score, aantal, site, telefoon, adres, coördinaten, openingstijden en place_id; max 700 opvragingen en $2,50 per dag (GMB_DAY_MAX, GMB_DAY_USD), binnen de DFS-dagrem; 30 dagen cache; &v=2 haalt oude cache zonder telefoon opnieuw op; markten NL, BE, US, DE en CW = Willemstad/Curaçao, die laatste gebruikt de keuzehulp autohuur Curaçao op hjdk-api voor 2 verhuurders per ronde).
Scripts in `tools/` (toetsen van bronnen en het model).

## 5. Geld en grenzen

- **DataForSEO** (7 nov, Henkjan: "zorg dat mn saldo daar niet zo snel opgaat"): alles samen hooguit `DFS_TOTAL_MAX` = $1,50 per
  UTC-dag (hele account, volgens de eigen teller van DataForSEO); daarbinnen de nachtelijke opbouw hooguit `DFS_BUILD_MAX` = $0,75
  en al het andere hooguit `DFS_DAILY_MAX` = $1 (was $4 + $3). Twijfel over de teller = niet betalen. Zuinig: Google Trends-dagdata
  in de opbouw alleen voor de bovenste 4 groepen per land (`NOW_GOOGLE_CHUNKS`, rest goedkopere DataForSEO Trends), wachtlijst van
  de vroege signalen pas na 3 dagen of bij 900+ termen, verse maanddata in stukken van $0,45 per dag. Kasboek per proces:
  `dfs/ledger/<dag>/<proces>.json`.
- **DataForSEO-geheugen** (4 nov): maanddata (Google Ads-zoekvolumes, Labs-toplijsten) worden `DFS_CACHE_DAYS` (standaard 5)
  dagen bewaard in `dfscache/`; die veranderen één keer per maand maar werden elke nacht opnieuw gekocht. Kasboek per onderdeel
  per dag: `dfs/ledger-<dag>.json` (eigenaar: `/api/probe?t=ledger&days=7`). Stand 4 nov: $151 ingelegd sinds 12 okt, $128 op.
- **Snelheidsgrenzen DataForSEO** (7 nov, mail DataForSEO en foutenlijst): Google Trends live 250 per minuut, Google Ads live
  (zoekvolumes) 12 per minuut, voor het hele account (fout 40202). lib/dfs.js laat per proces hooguit `TRENDS_PER_MIN` (90) /
  `TRENDS_CONC` (6) en `ADS_PER_MIN` (10) / `ADS_CONC` (2) door en wacht bij 40202 tot de volgende minuut (hooguit 2 keer
  opnieuw). Vroege signalen stoppen na 150 s met nieuwe stukken; de rest volgt de volgende ronde. Foutenlijst van DataForSEO (gratis, laatste 7 dagen): `/api/probe?t=errors&api=keywords_data&key=…`.
- **Keepa**: 20 tokens per minuut; marktprijzen gaan voor op het verzamelen.
- **AI Gateway**: dagbudget per project in de opruimlus (standaard $5, env `OPRUIM_BUDGET` in project opruimlus); daarboven een
  goedkoper model (sonnet-5.5 → haiku-5.5). Henkjan 20 okt: te duur = goedkoper model, niet stoppen. Verwacht na 20 okt:
  ± $0,15–0,40 per dag (nachtelijke opbouw ± $0,10 met haiku en geheugen per zoekterm, uurronde feedtitels/prijzen een paar
  cent, events één haiku-vraag per dag); sonnet alleen nog bij een check met AI (± $0,02 per check) en het kansenkaart-advies.
  Gemeten (AI Gateway, project demand_radar): 13-14 okt twee opbouwen met sonnet ± $11,70 (± 510 aanroepen, ± 1.600 in- en
  ± 1.000 uitvoertokens per aanroep; de uitvoer is het duurste deel), 18-20 okt ± $0,60 sonnet per nacht plus ± $0,50 haiku per
  dag (uurronde vroeg elk uur dezelfde feedtitels en prijsoordelen opnieuw). Een nieuwe
  aanroeper gebruikt `askCached` met een `task` en standaard `CHEAP()` (haiku); sonnet alleen voor echt redeneerwerk.
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
