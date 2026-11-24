# Demand Radar — lees dit eerst

Meerdere chats en sessies werken aan dit project. De gedeelde, altijd actuele overdracht staat live op:
**https://demandradar-ivory.vercel.app/overdracht?format=text** (live status, open taken, logboek van andere chats, laatste wijzigingen, deze README).

Werkafspraken:
1. Begin met het lezen van de overdracht (hierboven, of MCP-tool `handover` van de Demand Radar-connector met teamsleutel).
2. Na elke wijziging of beslissing: korte notitie in het logboek — MCP-tool `handover_note`, of
   `curl -X POST "https://demandradar-ivory.vercel.app/api/handover?op=note&key=$TEAM_KEY" -H 'content-type: application/json' -d '{"who":"<sessie>","text":"…"}'`.
   Taken: `op=todo` (text) en `op=done` (id, text).
3. Verandert de werking (nieuw onderdeel, bron, schema, regel)? Werk `docs/WERKING.md` bij (complete beschrijving; de test controleert dat elk eindpunt en elk onderdeel erin staat) en zet een nieuw onderdeel in `lib/components.js` (live status in de overdracht). Committen en pushen (push naar main = live).
4. Deze repo is OPENBAAR: nooit sleutels, wachtwoorden of tokens in code of commits; alleen in Vercel-omgevingsvariabelen.
5. Henkjan: Nederlands, kort, één stap tegelijk vragen; zuinig met tokens. DataForSEO sinds 24 nov 2026 (Henkjan: "wordt nu gek van de beperking", "Ok maak dit"): alles samen max $6/dag (de rest buiten de opbouw max $5); eigen vragen met de teamsleutel (check, MCP check_demand) vallen niet onder de dagrem maar onder de noodrem van $15/dag; melding via Telegram boven $4. Blijf zuinig: het tegoed is eindig. Nooit een eindpunt dat geld of quotum kost (checks, `op=yt`, `op=refresh`) in een lus aanroepen.
