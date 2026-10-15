# Demand Radar

Live vraag-signalen voor NL, VS, DE en wereldwijd: **Spikes** (wat nu piekt), **Upcoming** (wat binnenkort stijgt) en **Rising** (wat nu klimt), plus een **idee-check** voor elk product, idee of dienst. Gratis bezoekers zien alles geblurd; Pro ziet alles.

Een dienst van ADSFAIR B.V. Draait volledig op Vercel, zonder computer of Claude-account.

## Stand van zaken (overdracht) — 13 okt 2026
- **Voorpagina = Demand Radar** (`public/index.html` + `public/radar.js`, data uit `/api/demand`). Categorieën: producten, cursussen & training, boeken, diensten, apps & AI, reizen & uitjes, geld & contracten, plus **Onverwacht**, **Bestaat nog niet** en **Komt eraan**. Per land NL, DE, US.
- De oude pagina met de idee-check staat op `/check`; de kansenkaart op `/map`; uitleg voor collega's op `/team`.
- **Op verzoek (vanaf 13 okt avond)**: de radar, What came up en de kansenkaart bouwen alleen opnieuw als de eigenaar het vraagt: `/api/demand?rebuild=1&key=…`, `/api/rising?rebuild=1&key=…`, `/api/map?rebuild=1&key=…` of MCP `demand_radar` met `refresh: true`. Bezoekers en cron kosten niets. `AUTO_BUILD=on` in Vercel zet de nachtelijke opbouw terug. Harde dagrem `DFS_DAILY_MAX` (standaard $4) over alles, gemeten met DataForSEO's eigen teller; checks max 40 per dag.
- **Opbouw (oud)**: één keer per dag (cron `/api/warmmap` om 04:15 UTC; de dag wisselt om 04:00 UTC). Kost ca. $1,0–1,3 DataForSEO per opbouw (budget `DFS_MAX_DEMAND`, standaard $1,5). Elke nieuwe deploy bouwt één keer opnieuw.
- **Bronnen**: DataForSEO Labs (groei per land en per categorie), Google Ads-volumes 25 maanden, DataForSEO Trends (dagdata tot vandaag), autocomplete van Google, Bing en DuckDuckGo (wensen + per categorie), Reddit (RSS van r/SomebodyMakeThis, r/AppIdeas, r/shutupandtakemymoney, r/BuyItForLife, r/INEEDIT), Hacker News "is there a", Google trending + Bluesky trending, Open Library trending, Apple Books/App Store-hitlijsten, vraagkalender met zoekcurve van vorig jaar. AI (Vercel AI Gateway) sorteert en schrapt ruis.
- **Leren** (`lib/demandlearn.js`): onthoudt onderwerpen (eerst gezien, dagen op rij), kijkt de toppers van gisteren vandaag na (trefkans per categorie en bron weegt mee), leert ruiswoorden, onthoudt zoektermen voor komende momenten en wat nieuw is in hitlijsten. Klikken van bezoekers per categorie (via `/api/e`, uurronde `/api/loop`) bepalen na 30 kliks de volgorde van de tabs. **Geheugen vraagt Vercel Blob** (`BLOB_READ_WRITE_TOKEN`); zonder Blob begint het elke dag opnieuw.
- **Voorspeller** (`lib/forecast.js`, tab "Will rise", standaard): per zoekterm het patroon van vorig jaar in de komende maanden × het niveau van nu. Getoetst op 4.507 zoekreeksen (24 maanden, NL/DE/US): 81% van de voorspelde stijgingen kwam uit (>10%), 67% steeg >25% (basiskans 18%); voorspelde dalingen 86% juist; "wat net steeg blijft stijgen" maar 14%. Eenmalige gebeurtenissen van vorig jaar worden door AI weggefilterd. Voorspellingen worden onthouden en nagekeken zodra Google de echte maand vrijgeeft (vraagt Blob). Toetsdata ophalen: `/api/series?key=…&cc=NL&mode=pop|mid|grow` (eigenaar).
- **Extra voorspeldata** (13 okt, getoetst): 5 jaar Google Trends per zoekterm (cache `hist/<land>.json`, 60 dagen) → steeg de periode elk eerder jaar: 96% kwam uit (anders 73-76%), label "Every year"; weer (Open-Meteo, `lib/drivers.js`) voor weergevoelige zoektermen in maanden waarvan het weer al bekend is: fout −6%; rente/energie/vertrouwen alleen voor geldonderwerpen (−2%); kalender-drijvers gaven geen vaste winst. Schoolvakanties NL/DE (OpenHolidays) en regels uit het nieuws (`lib/regulation.js`, wekelijks, met bronkop) staan in Coming up.
- **Mensen**: knoppen Useful / Not real demand (`/api/feedback`), wat mensen checken (telt als kandidaat), campagne-uitkomsten (`POST /api/outcome?key=…`, MCP `report_outcome`, nooit publiek). Wachtrijen in Blob, uurronde telt op in `signals/state.json`; 2× "not real demand" = weg + ruiswoorden geleerd; verkopen ×1,3.
- **Titels**: AI geeft per onderwerp een nette Engelse titel; API/MCP geven die als `name` en de echte zoekterm als `keyword`.
- **Getest en afgevallen als bron** (13 okt): Amazon bestsellers/movers (botcheck vanaf Vercel), Pinterest Trends-website (botcheck), TikTok Creative Center (geen toegang), eBay/Etsy/Kickstarter (403). Kandidaten met eigen sleutel: bol.com partner-API, Pinterest API v5 trends, YouTube Data API, Adzuna (vacatures), DataForSEO Amazon-zoekvolumes (betaald).
- **LLM-vraag**: geen enkele AI-aanbieder deelt wat gebruikers vragen. Wel te koop: Profound (gelicenseerde gesprekken ChatGPT/Gemini/Claude/Perplexity, vooral VS), Semrush Prompt Research, Evertune. DataForSEO heeft "AI search volume" (een schatting, o.a. uit Google 'Mensen vragen ook', $0,01 per aanroep).
- **Inloggen**: persoonlijke sleutels in `lib/access.js` (`MEMBERS`, alleen hashes): Henkjan en Babita. Inloglink `/api/unlock?key=<sleutel>` of `/login`. Ingelogd: naam, knop Refresh radar (± $2, valt onder de dagrem), Sign out; dezelfde sleutel werkt voor de connector `/mcp?key=…`.
- **Team-toegang**: connector `https://demandradar-ivory.vercel.app/mcp?key=<teamsleutel>`. Teamsleutel = `TEAM_KEY` als die in Vercel staat, anders de Project ID van dit Vercel-project (Settings → General). Data zonder sleutel: `/api/demand?view=courses&cc=NL&limit=20` of `&format=text`.
- Niet bereikbaar vanaf Vercel: Reddit JSON/zoeken (wel RSS), Kickstarter, Etsy, Pushshift-alternatieven.
- **Voorspelmodel v2 (15 okt, live)**: `lib/ml.js` + `lib/model.js` (LightGBM-bomen als JS, ±1 MB). Eén model over alle zoektermen: (1) de waarde per maand, (2) de kans dat een maand ≥ 40% boven nu ligt. "Will rise" toont alleen kans ≥ 70%, gerangschikt op extra zoekopdrachten × kans; de getoonde kans is gekalibreerd. Productie haalt nu 48 maanden Google Ads op (zelfde prijs). Toets (geleerd t/m apr 2026, getoetst mei-sep 2026): 94% van de voorspelde stijgers steeg >10%, 90% ≥ 40% (oude regel 76% / 66%, basiskans 16%); fout in de waarden 27,0% → 21,9%. Tweede toets (jan-sep 2026): 94% / 88%.
  - **Hertrainen** (zelf of door een volgend account): `POST /api/series?key=…&cc=NL&ads=1&months=48` met `{keywords:[…]}` (± $0,18 per 1.500 zoektermen) → bestand `{ "NL|zoekterm": {m: [[jaar, maand, volume], …]} }` → `node tools/mlrows.mjs data.json > rows.csv` → `python3 tools/train_forecast.py rows.csv <grensmaand> lib/model.js` (toetst eerst, schrijft dan het model) → testen (`npm test`) → push. Doe dit elke paar maanden als Google nieuwe maanden vrijgeeft. Zonder `lib/model.js` valt alles terug op de oude seizoensregel.
- **bol.com (15 okt)**: via onze eigen bol-koppeling (project hjdk-api, adres `BOL_API_URL`, standaard https://keuzehulp.best; overdracht: https://hjdk-api-henq.vercel.app/api/bol/overdracht) de 50 populairste producten op bol.com NL. Op de pagina onder Products ("Selling most in the shops today", met 'new'), en elke dag een momentopname in Blob `bolpop/JJJJ-MM-DD.json` (uurronde `/api/loop`). Na 2-3 maanden historie toetsen of stijgers op bol de Google-vraag voorspellen. Zoekvolumes van bol zelf vragen een verkopersaccount (Retailer API), dat is nog niet geregeld.
- **Google Trends API (officieel, alpha)**: aangevraagd op 15 okt 2026 voor Google Cloud-project `hjdk-seo` (henkjandekrijger@gmail.com, contact henkjan@adsfair.xyz). Bij toelating: inbouwen als dagbron en toetsen zoals de andere bronnen.
- **Bronnen getoetst (15 okt)** met dezelfde eerlijke toets, alles in `tools/` en `/api/collect` (eigenaar):
  - Wikipedia-paginaweergaven (4 jaar, 4.371 zoektermen, 1.453 met artikel): geen winst → niet in het model (`lib/attention.js`, kenmerken staan klaar in `lib/ml.js`).
  - Griepactiviteit (ECDC voor NL/DE, CDC via Delphi voor US) en Indeed-vacatures als drijver: voorspelling werd slechter → verzameld maar niet gebruikt.
  - Eurostat "grote aankopen komende 12 maanden" (NL/DE): kleine winst bij geldonderwerpen → gebruikt als drijver `purchases`.
  - Dezelfde zoekterm in de VS als voorloper voor NL/DE (2.886 zoektermen, 4 jaar): bij de ene toets +0,4 punt, bij de andere niets → niet gebruikt.
  - GDELT nieuwsvolume: Vercel krijgt 429 (te veel verzoeken) → niet bruikbaar vanaf Vercel.
  - Weer: Open-Meteo vervangen door NASA POWER (gemeten) + MET Norway (verwachting), want de gratis Open-Meteo is alleen niet-commercieel; steden via OpenStreetMap Nominatim. Getoetst: zelfde winst als voorheen.
- **Onderzoek beter voorspellen (14 okt)**, script `tools/forecast_backtest.py` (Python, LightGBM), eerlijke tijdsplitsing (leren op doelmaanden t/m apr 2026, toetsen op mei-aug 2026, 68.577 voorspellingen):
  - Grootste lek: zoektermen waarvan het niveau verschuift t.o.v. vorig jaar (>50% erbij of >33% eraf) — ca. 30% van de gevallen maar ca. 43% van alle fout (fout 50-65%). Seizoenstermen met stabiel niveau gaan al goed (16%).
  - Eén ML-model over alle zoektermen (LightGBM, kenmerken: niveau, laatste maanden, vorig jaar zelfde periode, jaar-op-jaar, spreiding): fout 27,3% → 23,5%; voorspelde stijgers 74% → 82% kwam uit (>10%). Geeft een eerlijke kans: "86% kans" kwam 85% uit. Top-300 kansen (zonder herstel na een dip): 92% steeg >25% tegen 72% met de huidige regel.
  - Werkte niet: maanden invullen met 5 jaar weekdata van Trends (samenhang maar 0,2; te grof), meerjarig seizoen uit Trends (geen winst). Chronos-2 niet te toetsen hier (Hugging Face geblokkeerd).
  - Volgende bronnen voor het lek (vooruitlopend): Wikipedia-paginaweergaven (gratis, dagelijks), GDELT nieuwsvolume (gratis), Google Trends dagdata + YouTube/Shopping-zoeken via DataForSEO (goedkoop), 48 maanden Ads-historie (zelfde prijs als 24), bol.com Retailer API zoektermen (vraagt verkopersaccount, niet het partneraccount), Google Merchant API bestsellers (gratis met Merchant Center), aanvraag Google Trends API (alpha).

## Hoe het werkt
- `public/` — de site (index.html, styles.css, site.js). Zelfde huisstijl als outname.now.
- `api/radar.js` — het radaroverzicht. Wordt elk uur ververst (cron `api/warm.js`) en door Vercel bewaard.
- `api/check.js` — idee-check (`?q=…&m=NL|US|DE|WW`), 6 uur bewaard per idee.
- `api/mcp.js` — de connector voor Claude en andere AI-assistenten (`/mcp?key=…`).
- `api/unlock.js` — Pro-toegang met een sleutel (`/api/unlock?key=…`), uitloggen met `?logout=1`.
- `lib/` — bronnen en rekenwerk. Producten die elke dag gemeten worden staan in `lib/watchlist.js`, koopmomenten en regelgeving in `lib/calendar.js`.

## Bronnen (allemaal gratis, geen sleutel nodig)
Google trending searches (RSS), Wikipedia-paginaweergaven, wereldnieuws (GDELT), Google News, zoeksuggesties van Google, YouTube en Amazon, Reddit, Hacker News, weersverwachting (Open-Meteo), steden en inwoneraantallen (Open-Meteo Geocoding), lokale bedrijven (OpenStreetMap/Nominatim), officiële feestdagen (Nager.Date), App Store- en Apple Books-hitlijsten. Elke bron mag uitvallen; de rest werkt door.

## Hyperlokaal
Vul bij de check een stad in (`&c=Gouda`): zoeksuggesties met de stadsnaam, lokaal nieuws, lokale Reddit, bestaande zaken op de kaart (per 10.000 inwoners) en het weer daar.

## In een andere chat gebruiken (connector)
Voeg in Claude een eigen connector toe met `https://<jouw-domein>/mcp?key=<sleutel>`. Tools: `check_demand` (idee, markt, optioneel stad) en `demand_radar` (overzicht). Zonder geldige sleutel geen toegang. Gewone JSON kan ook: `/api/check?q=…&m=NL&c=Gouda&key=<sleutel>`.

## Instellingen in Vercel (allemaal optioneel)
- `ANTHROPIC_API_KEY` — zet de AI-analist aan voor Pro-gebruikers.
- `AI_MODEL` — ander Claude-model (standaard `claude-sonnet-5-5`).
- `PRO_KEYS` — sleutels voor betalende klanten, komma-gescheiden (bijv. `dr-klant1,dr-klant2`).
- `RAW_SECRET` — vaste interne sleutel voor de cache (anders per deploy automatisch).

## Testen
`npm test` (gebruikt nepdata) · lokaal bekijken: `MOCK=1 npm run dev` → http://localhost:3000

## Dagmail "Demand of the day"
- Aanmelden op de site (mailadres + markten) → bevestigingsmail → actief. Afmelden met één klik (ook via de mailknop "unsubscribe").
- Elke ochtend 05:40 UTC (`api/daily.js`, Vercel Cron) gaat de mail naar alle actieve abonnees. Maximaal één keer per dag.
- Bekijken zonder te versturen: `/api/daily?key=<sleutel>&preview=1&m=NL,US&v=B`. Proefmail: `/api/daily?key=<sleutel>&test=<mailadres>`.
- Nodig in Vercel: een **Blob-store** gekoppeld aan het project (opslag van abonnees en leren), plus `RESEND_API_KEY` en `MAIL_FROM` (bijv. `Demand Radar <radar@jouwdomein.com>`, domein geverifieerd in Resend).

## Leren (pagina en mail)
- De pagina test koppen, tekst en knop (varianten A, B, C …). De mail test onderwerpregels. A is de controle en blijft altijd.
- Elke gebeurtenis (vertoning, check, aanmelding, klik op Pro, mail geopend, mail-klik) wordt geteld zonder IP of mailadres (`api/e.js`, `api/go.js`).
- Uurronde (`api/loop.js`, Vercel Cron :23): optellen en verdelen. Gelijk tot elke variant 300 vertoningen (pagina) of 200 verzonden mails heeft, daarna 70% voor de beste.
- De mail kiest het onderwerp van de dag mede op basis van de categorieën waarop lezers het vaakst klikken.
- Stand bekijken: `/leren/<sleutel>`. JSON: `/api/learn?key=<sleutel>`.
- **Aansluiten voor de leerlus:** `POST /api/learn?key=<sleutel>` met bijvoorbeeld
  `{"page":{"variants":{"B":{"h1":"…","lead":"…","cta":"…"}}},"mail":{"variants":{"C":"… {top} … {pct}"}},"by":"leerlus","note":"waarom"}`.
  Een variant op `null` zetten haalt hem weg. Plaatshouders in onderwerpregels: `{top}`, `{pct}`, `{n}`, `{market}`.

## AI
De AI-analist gebruikt de Vercel AI Gateway (geen eigen sleutel nodig op Vercel). Met `ANTHROPIC_API_KEY` gaat het rechtstreeks naar Anthropic, dan ook met webonderzoek.
