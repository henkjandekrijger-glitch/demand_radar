# radar-news (Railway)

Kleine server voor Demand Radar die GDELT-nieuwsvolume ophaalt vanaf een eigen adres (GDELT weigert Vercel).

- Railway: New → GitHub repo `demand_radar` → Settings → Root Directory `worker/news` → Networking → Generate Domain.
- Geen sleutels nodig. Start: `npm start` (Node 20+).
- Gebruik: `GET /gdelt?query=warmtepomp%20sourcecountry:NL&mode=timelinevolraw&timespan=3months` → GDELT-JSON (1 uur bewaard, hooguit 1 verzoek per 6 s naar GDELT).
- Stand: `GET /health`.
- In Vercel (demand_radar): `GDELT_PROXY=https://<railway-domein>` zodat de radar via deze server vraagt.
