// GET /api/zoekvraag?thema=curacao[&cc=US] — wat mensen zoeken over een thema (een plaats, merk of onderwerp), per markt in de eigen taal:
// zoekterm, volume per maand, trend over een jaar, zoekintentie en de laatste 12 maanden, gegroepeerd per onderwerp.
// Voor elk project dat zijn site op echte vraag wil afstemmen (Henkjan 9 nov 2026: "Doe goed onderzoek met demand radar waar mensen naar zoeken
// en optimaliseer de site daarop"). Openbaar te lezen. Kost geld bij DataForSEO, daarom: per thema hooguit één keer per 7 dagen gekocht
// (hooguit ZV_MAX dollar, standaard $0,60, binnen de dagrem van lib/dfs.js), daarna altijd uit de opslag (zoekvraag/<thema>.json).
// Nieuw thema: één regel in THEMA hieronder (regex op de zoekterm + markten met taal).
import { getStore, getJSON, putJSON } from '../lib/store.js';
import { topSearches, budget, serp } from '../lib/dfs.js';

const M = { US: [2840, 'en'], NL: [2528, 'nl'], DE: [2276, 'de'], CA: [2124, 'en'], CO: [2170, 'es'], BR: [2076, 'pt'], GB: [2826, 'en'], BE: [2056, 'nl'], AU: [2036, 'en'] };
// Plastische chirurgie (14 nov 2026, Henkjan: keuzehulp "waar je moet zijn" voor NL, US en wereldwijd): de landen waar patiënten
// vandaan komen; ingrepen in NL, EN en DE, en wie naar het buitenland gaat (Turkije, Mexico, Colombia, Dominicaanse Republiek …).
const OW_PLASTISCH = [
  ['buitenland', /turkije|turkey|türkei|turkei|istanbul|antalya|izmir|mexico|mexiko|tijuana|cancun|colombia|kolumbien|medellin|cali\b|dominican|dominicaanse|dominikan|punta cana|santo domingo|thailand|bangkok|korea|seoul|brazil|brazilië|brasilien|costa rica|poland|polen|hungary|hongarije|ungarn|belgi|belgium|abroad|buitenland|ausland/],
  ['kosten', /kosten|kost |prijs|prijzen|cost|price|how much|wat kost|preis|kosten|euro|dollar|\$|financ|vergoed|insurance|verzekering|krankenkasse/],
  ['arts en kliniek', /kliniek|clinic|klinik|chirurg|surgeon|arzt|ärzt|dokter|doctor|near me|in de buurt|in der nähe|best |beste|top |review|ervaring|erfahrung|board certified/],
  ['herstel en risico', /voor en na|before and after|vorher nachher|herstel|recovery|heilung|genesung|na de operatie|after surgery|nach der op|complicat|komplikation|risico|risk|gone wrong|mislukt|pijn|pain|schmerz|littekens|scar|narbe/],
  ['ooglid', /ooglid|eyelid|blepharo|lidstraff|oberlid|unterlid|wallen|bovenooglid|onderooglid/],
  ['borsten', /borst|breast|brust|implant|mammo|siliconen/],
  ['buik en lichaam', /buikwand|tummy tuck|abdominoplast|bauchdeck|lipo|fettabsaug|bbl|brazilian butt lift|brazilian buttlift|butt lift|po-lift|mommy makeover|body lift|bodylift|arm lift|armlift|oberarmstraff|thigh lift|dijbeen|skin removal|huidoverschot|hautstraff|ozempic|glp/],
  ['gezicht', /facelift|face lift|gesichtsstraff|neck lift|halslift|brow lift|wenkbrauw|neus|nose|rhino|nasen|kin|chin|ohr|ear|oor|lip|fat graft|vetinjectie|eigenfett/],
  ['haar', /haartransplant|hair transplant|haarimplant|fue\b|dhi\b|haarverplant|hair restoration/],
  ['botox en fillers', /botox|filler|hyaluron|injectable|neuromodulator|dysport|lippen|lip filler/],
];
// Kadoly (10 nov 2026, Henkjan: "Vind voor kadoly.com ook onderwerpen voor chatgpt om naar boven te halen en in de winkel te brengen"):
// drie thema's op de soorten producten die de winkel echt heeft (titels uit de catalogus) plus cadeauvragen, NL en BE (Nederlands).
// hjdk-api (/api/gids?op=vraagkansen) legt dit naast het aanbod en de gidsen van gids.kadoly.com.
const KADOLY_MARKT = ['NL', 'BE'];
const OW_KADOLY = [
  ['kerst', /kerst|advent|sinterklaas|sint |schoencadeau|pakjesavond/],
  ['vazen', /vaas|vazen|vaasje/],
  ['potten en plantenbakken', /bloempot|plantenpot|sierpot|plantenbak|plantenstandaard|plantenrek|plantentafel|plantenmand|plantenzuil/],
  ['planten en bloemen', /orchidee|kunstplant|kunstbloem|nepplant|kamerplant|droogbloem/],
  ['muurdecoratie', /muurcirkel|wandcirkel|wanddecoratie|muurdecoratie|wandkleed|tuinposter|poster|muursticker|wandbord|wereldkaart/],
  ['verlichting', /lamp|lampje|verlichting|lichtsnoer/],
  ['kaarsen en lantaarns', /kaars|lantaarn|windlicht|kandelaar|theelicht/],
  ['tuin', /windgong|windspinner|tuinbeeld|tuindecoratie|tuinsteker|vogelhuis|tuin /],
  ['textiel', /plaid|deken|kussen|sokken/],
  ['opbergen', /mand|manden|opberg|krat/],
  ['geuren', /geur|diffuser|wierook/],
  ['tafel en keuken', /servies|mok|beker|theepot|dienblad|bord|schaal|glazen|bijzettafel|onderzetter/],
  ['puzzels en bouwpakketten', /puzzel|bouwpakket|modelbouw|muziekdoos|spaarpot/],
  ['verzorging', /zeep|scheer|baard|haarborstel|badzout/],
  ['voor wie', /voor (hem|haar|mannen|man|vrouwen|vrouw|moeder|mama|vader|papa|oma|opa|vriendin|vriend|collega|kind|kinderen|baby|tiener|juf|meester|leraar|zus|broer)|mannen|vrouwen|moederdag|vaderdag/],
  ['gelegenheid', /verjaardag|jarig|pensioen|afscheid|geboorte|kraam|huwelijk|bruiloft|jubileum|valentijn|housewarming|nieuwe woning|bedankt|beterschap|sterkte|geslaagd|diploma/],
  ['budget', /euro|onder|goedkoop|budget|klein /],
];
// Bedrijfsverkoop (15 nov 2026, Henkjan: leads van duizenden tot honderdduizenden euro's; "Doe onderzoek hoe de concurrenten het doen
// met bedrijfsdeals en kijk ook naar zoektermen"): verkopers, kopers, waardebepaling, adviseurs, platforms, opvolging, per sector.
const OW_BEDRIJF = [
  ['platform', /bedrijventekoop|brookz|overnamemarkt|dealsuite|bizbuysell|dub\.de|nexxt|flippa|acquire\.com|empire flippers|loopnet|bizquest|businessesforsale/],
  ['waarde', /waard|waarde|waardering|valuation|value|worth|bewertung|wert|multiple|ebitda|calculat|rekentool|rechner/],
  ['kosten en belasting', /kosten|tarief|fee|commission|provision|belasting|tax|steuer|doorschuif|aanmerkelijk|box 2|capital gains/],
  ['adviseur', /makelaar|advis|broker|berater|m&a|fusie|overnamekantoor|intermediair|consultant/],
  ['opvolging', /opvolg|overdracht|succession|nachfolge|nachfolger|familie|family|personeel|management buy|employee/],
  ['sector', /webshop|praktijk|horeca|restaurant|cafe|kapsalon|garage|apotheek|tandarts|huisarts|accountant|installat|bouw|transport|dental|vet |ecommerce|e-commerce|amazon|saas|agency|winkel|bakkerij|hotel|camping|franchise|laundromat|car wash|gas station|liquor|daycare|kinderopvang/],
  ['koper', /te koop|for sale|kopen|overnemen|kaufen|zu verkaufen|buy|buying|acquisition|acquire/],
  ['verkoper', /verkopen|verkaufen|sell|selling|verkoop|verkauf/],
];
export const THEMA = {
  verzekeringen: { naam: 'Verzekeringen Nederland', markten: ['NL'], regex: '(verzekering|zorgpolis|zorgpremie|arbeidsongeschiktheid|overlijdensrisico|aov)', ow: [['zorg', /zorgverzekering|zorgpolis|zorgpremie|basisverzekering|tandarts|eigen risico/], ['auto en motor', /auto|motor|bromfiets|scooter|camper|caravan/], ['wonen', /woon|inboedel|opstal|huiseigenaar/], ['reizen', /reis|annulering/], ['aansprakelijkheid en rechtsbijstand', /aansprakelijk|rechtsbijstand/], ['huisdieren', /huisdier|dieren|hond|kat/], ['fiets', /fiets|ebike|e-bike|fatbike/], ['inkomen en nabestaanden', /arbeidsongeschiktheid|aov|overlijdensrisico|uitvaart/], ['zakelijk', /zakelijk|bedrijf|zzp|beroep|cyber/]] },
  'plastische-chirurgie': { naam: 'Plastische chirurgie (waar ga je heen)', markten: ['NL', 'US', 'GB', 'DE', 'CA', 'AU'], ow: OW_PLASTISCH, max: 0.9,
    // v2 (15 nov 2026): de eerste meting ving "bbl" ook in bubble, kibble en pebble (MBO-BBL, Big Bash League, olievaten) en
    // "eyelid"/"ooglid" in strontjes en trillende oogleden; die vulden de 700 plekken per land. Nu alleen ingrepen. Opnieuw kopen pas
    // vanaf 16 nov (nieuwe DataForSEO-dag, na de rem van vandaag); tot dan blijft de oude meting staan.
    v: 2, vanaf: '2026-11-16',
    regex: '(plastische chirurg|plastisch chirurg|plastische op|plastic surg|cosmetic surg|aesthetic surg|schönheitsop|schönheitschirurg|schoenheitschirurg|schönheitsklinik|ästhetische chirurg|ästhetische op|cosmetische chirurg|cosmetische kliniek|cosmetic clinic|ooglidcorrectie|ooglid correctie|oogleden correctie|bovenooglid|eyelid surg|eyelid lift|blepharoplast|lidstraff|lidkorrektur|borstvergroting|borstverkleining|borstlift|borstimplant|breast augment|breast lift|breast reduction|breast implant|boob job|brustvergr|bruststraff|brustverkl|brustimplant|liposuc|liposuct|fettabsaug|buikwandcorrectie|buikwand correctie|tummy tuck|abdominoplast|bauchdeckenstraff|neuscorrectie|rhinoplast|nose job|nasenkorrektur|nasen-op|nasenop|facelift|face lift|gesichtsstraff|neck lift|halslift|brow lift|brazilian butt lift|brazilian buttlift|butt lift|po-lift|mommy makeover|bodylift|body lift|armlift|arm lift|oberarmstraff|thigh lift|haartransplant|hair transplant|haarimplant)' },
  'bedrijf-verkopen': { naam: 'Bedrijf verkopen en overnemen', markten: ['NL', 'BE', 'DE', 'US'], ow: OW_BEDRIJF, max: 0.45,
    serp: { NL: ['bedrijf verkopen', 'wat is mijn bedrijf waard', 'bedrijfsovername', 'bedrijf te koop'], BE: ['bedrijf verkopen', 'bedrijf overnemen'], DE: ['firma verkaufen', 'unternehmensbewertung', 'unternehmensnachfolge'], US: ['sell my business', 'business broker', 'what is my business worth', 'business for sale'] },
    regex: '(bedrijf verkopen|bedrijf te koop|bedrijven te koop|onderneming verkopen|onderneming te koop|bedrijfsovername|bedrijf overnemen|overname bedrijf|bedrijfsoverdracht|overdracht bedrijf|bedrijfsopvolging|bedrijfswaardering|waardering bedrijf|waarde bedrijf|waarde van een bedrijf|waarde van mijn bedrijf|bedrijf waard|bedrijfswaarde|bv verkopen|bv te koop|holding verkopen|aandelen bv|webshop verkopen|webshop te koop|praktijk verkopen|praktijk te koop|zaak verkopen|zaak te koop|bedrijfsmakelaar|overnameadvi|overnamemakelaar|fusies en overnames|fusie en overname|bedrijventekoop|brookz|overnamemarkt|dealsuite|firma verkaufen|unternehmen verkaufen|unternehmensverkauf|unternehmensnachfolge|nachfolger gesucht|nachfolgebörse|firmenbewertung|unternehmensbewertung|unternehmenswert|firma zu verkaufen|unternehmen zu verkaufen|unternehmensbörse|gmbh verkaufen|gmbh kaufen|firma kaufen|unternehmen kaufen|m&a berater|sell my business|sell a business|selling a business|sell your business|sell my company|selling my company|sell a company|business for sale|businesses for sale|business broker|m&a advisor|m&a firm|business valuation|value my business|value of my business|my business worth|business worth|company valuation|valuation of a business|exit planning|succession planning|buy a business|buying a business|buy an existing business|small business for sale|business acquisition|bizbuysell)' },
  curacao: { naam: 'Curaçao', regex: '(cura[cç]ao|curazao|kòrsou|korsou|willemstad)', markten: ['US', 'NL', 'DE', 'CA', 'CO', 'BR'] },
  'kadoly-wonen': { naam: 'Kadoly wonen', markten: KADOLY_MARKT, ow: OW_KADOLY,
    regex: '(vaas|vazen|bloempot|plantenpot|sierpot|plantenbak|plantenstandaard|plantenrek|plantentafel|kunstplant|kunstbloem|orchidee|muurcirkel|wandcirkel|wanddecoratie|muurdecoratie|wandkleed|tuinposter|muursticker|tafellamp|hanglamp|leeslamp|oplaadbare lamp|lantaarn|windlicht|kandelaar|geurkaars|windgong|windspinner|bijzettafel|dienblad|plaid|sierkussen|wasmand|opbergmand|rieten mand|diffuser|geurstokjes|tuindecoratie|tuinbeeld)' },
  'kadoly-hobby': { naam: 'Kadoly hobby en seizoen', markten: KADOLY_MARKT, ow: OW_KADOLY,
    regex: '(3d puzzel|houten puzzel|puzzel volwassenen|bouwpakket|legpuzzel|muziekdoos|spaarpot|kerstbal|kerstversiering|kerstdecoratie|kerstkrans|kerststal|kerstboomversiering|schoencadeau|sinterklaascadeau|alpaca sokken|handzeep|scheerset|scheermes|servies|mokken|theepot|wollen deken)' },
  'kadoly-cadeau': { naam: 'Kadoly cadeauvragen', markten: KADOLY_MARKT, ow: OW_KADOLY,
    regex: '(cadeau|kado|cadeautje|kadootje|geschenk|presentje|cadeaubox|giftset)' },
};
// onderwerpen: woorden in vijf talen, eerste treffer wint
const ONDERWERP = [
  ['vluchten', /flight|vlucht|flug|vuelo|voo|klm|tui|airline|jetblue|american|airport|luchthaven|flughafen|aeropuerto|aeroporto|hato/],
  ['hotels', /hotel|resort|all inclusive|all-inclusive|todo incluido|tudo incluído|airbnb|appartement|apartment|villa|ferienwohnung|hostel|sandals|marriott|hilton|renaissance|papagayo|corendon|lions ?dive|avila|kura hulanda/],
  ['stranden', /beach|strand|playa|praia|grote knip|kenepa|cas abao|playa lagun|porto mari|mambo|jan thiel|blue bay|klein cura/],
  ['duiken', /div|duik|tauch|buceo|mergulh|snorkel|tugboat|reef|rif|riff|arrecife/],
  ['weer', /weather|weer|wetter|clima|tiempo|temperat|rain|regen|lluvia|chuva|hurricane|orkaan|hurrikan|huracán|furacão|season|seizoen|best time|beste reistijd|beste reisezeit/],
  ['geld', /currency|valuta|währung|moneda|moeda|dollar|guilder|gulden|florin|euro|money|geld|dinero|dinheiro|price|prijs|preis|precio|preço|cost|kosten|costo|custo|tip|fooi|trinkgeld|propina|gorjeta|atm|pin/],
  ['reisregels', /visa|visum|passport|paspoort|reisepass|pasaporte|passaporte|ed card|immigration|digital|vaccin|covid|requirements|entry|einreise|requisitos|insurance|verzekering|versicherung/],
  ['veiligheid', /safe|veilig|sicher|seguro|segura|crime|crimin|danger|gevaar|gefahr|peligro|perigo/],
  ['eten', /restaurant|food|eten|essen|comida|keshi|stoba|truki|dining|bar|cocktail|lunch|dinner|ontbijt|breakfast/],
  ['doen', /things to do|what to do|wat te doen|activit|excursi|tour|attraction|bezienswaardig|sehenswürdig|qué hacer|o que fazer|atv|boat|boot|catamaran|national park|nationaal park|christoffel|shete boka|hato caves|ostrich|struisvogel|dolphin|dolfijn/],
  ['uitgaan', /nightlife|uitgaan|ausgehen|vida nocturna|party|feest|club|casino|music|muziek|concert|festival|carnival|carnaval|karneval|tumba/],
  ['cruise', /cruise|crucero|cruzeiro|kreuzfahrt|ship|schip|schiff|port|haven|terminal/],
  ['vervoer', /car rental|auto huren|mietwagen|alquiler|aluguel|rent a car|taxi|bus|transport|uber|scooter|drive|rijden/],
  ['wonen', /live|wonen|leben|vivir|morar|job|werk|arbeit|trabajo|emigr|expat|house for sale|huis te koop|real estate|vastgoed|school|pension/],
  ['kaart', /map|kaart|karte|mapa|where is|waar ligt|wo liegt|dónde|onde fica|island|eiland|insel|isla|ilha|aruba|bonaire|abc/],
  ['taal', /papiamento|papiamentu|language|taal|sprache|idioma|dutch|nederlands/],
  ['nieuws', /news|nieuws|nachrichten|noticias|notícias|today|vandaag|heute|hoy|hoje|election|verkiezing|world cup|wk|football|voetbal/],
];
// DataForSEO weigert een te lange regex ("regexp max length exceeded"; ± 700 tekens gaat goed, 960 niet): splits een lijst
// (a|b|c) in stukken van hooguit 600 tekens; per stuk één vraag, daarna samenvoegen (elke zoekterm één keer).
export function splitRegex(re, max = 600) {
  const m = /^\((.*)\)$/.exec(re); if (!m || re.length <= max || /[()]/.test(m[1])) return [re];
  const out = []; let cur = [];
  for (const alt of m[1].split('|')) { if (cur.length && `(${[...cur, alt].join('|')})`.length > max) { out.push(`(${cur.join('|')})`); cur = []; } cur.push(alt); }
  if (cur.length) out.push(`(${cur.join('|')})`);
  return out;
}
const onderwerp = (k, lijst = ONDERWERP) => (lijst.find(([, r]) => r.test(k)) || ['overig'])[0];

export default async function handler(req, res) {
  const id = String(req.query.thema || '').toLowerCase(), T = THEMA[id];
  if (!T) return res.status(400).json({ error: 'onbekend thema', themas: Object.keys(THEMA) });
  const store = getStore(), pad = `zoekvraag/${id}.json`, oud = await getJSON(store, pad, null);
  let uit = oud;
  const nieuweVersie = T.v && (oud && oud.v) !== T.v && new Date().toISOString().slice(0, 10) >= (T.vanaf || '');
  if (!oud || nieuweVersie || Date.now() - (oud.t || 0) > 7 * 864e5) {
    const b = budget(+(T.max || process.env.ZV_MAX || 0.6)), markten = {};
    for (const cc of T.markten) {
      const [loc, lang] = M[cc];
      const seen = new Set(), items = [];
      for (const re of splitRegex(T.regex)) for (const x of await topSearches({ loc, lang }, b, { by: 'volume', anyGrowth: true, minVolume: 20, limit: 700, regex: re, intent: null }).catch(() => [])) if (!seen.has(x.k)) { seen.add(x.k); items.push(x); }
      items.sort((a, c) => (c.volume || 0) - (a.volume || 0));
      markten[cc] = { taal: lang, termen: items.map(x => ({ k: x.k, v: x.volume, y: x.trend && x.trend.y, i: x.intent, c: x.cpc, cp: x.competition, o: onderwerp(x.k, T.ow), m: (x.monthly || []).slice(0, 12).map(z => z.v) })) };
    }
    // wie staat er bovenaan en wie adverteert (± $0,002 per zoekterm): de concurrenten volgens Google zelf
    const serps = {};
    for (const [cc, kws] of Object.entries(T.serp || {})) { const [loc, lang] = M[cc]; serps[cc] = {}; for (const k of kws) { const r = await serp(k, { loc, lang }, b).catch(() => null); if (r) serps[cc][k] = r; } }
    const n = Object.values(markten).reduce((s, x) => s + x.termen.length, 0);
    if (n) { uit = { thema: id, naam: T.naam, ...(T.v ? { v: T.v } : {}), t: Date.now(), kosten: Math.round(b.spent * 1000) / 1000, fouten: b.errors.slice(0, 5), markten, ...(T.serp ? { serp: serps } : {}) }; if (store) await putJSON(store, pad, uit).catch(() => {}); }
    else if (!oud) return res.status(503).json({ error: 'geen data (budget of DataForSEO)', fouten: b.errors.slice(0, 5) });
  }
  // samenvatting per onderwerp over alle markten: totaal volume en de grootste termen
  const per = {};
  for (const [cc, m] of Object.entries(uit.markten || {})) for (const x of m.termen) { const o = per[x.o] ||= { v: 0, top: [] }; o.v += x.v || 0; o.top.push({ cc, k: x.k, v: x.v, y: x.y, ...(x.c != null ? { c: x.c } : {}) }); }
  for (const o of Object.values(per)) o.top = o.top.sort((a, b) => b.v - a.v).slice(0, 12);
  const cc = String(req.query.cc || '').toUpperCase();
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json({ thema: uit.thema, naam: uit.naam, bijgewerkt: new Date(uit.t).toISOString(), ...(uit.serp ? { serp: uit.serp } : {}), onderwerpen: Object.fromEntries(Object.entries(per).sort((a, b) => b[1].v - a[1].v)), ...(cc && uit.markten[cc] ? { markt: { cc, ...uit.markten[cc] } } : { markten: Object.fromEntries(Object.entries(uit.markten).map(([k, m]) => [k, { taal: m.taal, n: m.termen.length, top: m.termen.slice(0, 60) }])) }) });
}
