# Demand Radar

Live vraag-signalen voor NL, VS, DE en wereldwijd: **Spikes** (wat nu piekt), **Upcoming** (wat binnenkort stijgt) en **Rising** (wat nu klimt), plus een **idee-check** voor elk product, idee of dienst. Gratis bezoekers zien alles geblurd; Pro ziet alles.

Een dienst van ADSFAIR B.V. Draait volledig op Vercel, zonder computer of Claude-account.

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
