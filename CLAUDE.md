# Demand Radar — lees dit eerst

Meerdere chats en sessies werken aan dit project. De gedeelde, altijd actuele overdracht staat live op:
**https://demandradar-ivory.vercel.app/overdracht?format=text** (live status, open taken, logboek van andere chats, laatste wijzigingen, deze README).

Werkafspraken:
1. Begin met het lezen van de overdracht (hierboven, of MCP-tool `handover` van de Demand Radar-connector met teamsleutel).
2. Na elke wijziging of beslissing: korte notitie in het logboek — MCP-tool `handover_note`, of
   `curl -X POST "https://demandradar-ivory.vercel.app/api/handover?op=note&key=$TEAM_KEY" -H 'content-type: application/json' -d '{"who":"<sessie>","text":"…"}'`.
   Taken: `op=todo` (text) en `op=done` (id, text).
3. Grotere veranderingen ook in README.md ("Stand van zaken"), committen en pushen (push naar main = live).
4. Deze repo is OPENBAAR: nooit sleutels, wachtwoorden of tokens in code of commits; alleen in Vercel-omgevingsvariabelen.
5. Henkjan: Nederlands, kort, één stap tegelijk vragen; zuinig met tokens. DataForSEO max $4/dag, plus max $3 voor de nachtelijke opbouw van de radar (Henkjan 18 okt: "elke nacht"). Nooit een eindpunt dat geld of quotum kost (checks, `op=yt`, `op=refresh`) in een lus aanroepen.
