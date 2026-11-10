// GET /api/zoekvraag?thema=curacao[&cc=US] — wat mensen zoeken over een thema (een plaats, merk of onderwerp), per markt in de eigen taal:
// zoekterm, volume per maand, trend over een jaar, zoekintentie en de laatste 12 maanden, gegroepeerd per onderwerp.
// Voor elk project dat zijn site op echte vraag wil afstemmen (Henkjan 9 nov 2026: "Doe goed onderzoek met demand radar waar mensen naar zoeken
// en optimaliseer de site daarop"). Openbaar te lezen. Kost geld bij DataForSEO, daarom: per thema hooguit één keer per 7 dagen gekocht
// (hooguit ZV_MAX dollar, standaard $0,60, binnen de dagrem van lib/dfs.js), daarna altijd uit de opslag (zoekvraag/<thema>.json).
// Nieuw thema: één regel in THEMA hieronder (regex op de zoekterm + markten met taal).
import { getStore, getJSON, putJSON } from '../lib/store.js';
import { topSearches, budget } from '../lib/dfs.js';

const M = { US: [2840, 'en'], NL: [2528, 'nl'], DE: [2276, 'de'], CA: [2124, 'en'], CO: [2170, 'es'], BR: [2076, 'pt'], GB: [2826, 'en'], BE: [2056, 'nl'] };
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
export const THEMA = {
  verzekeringen: { naam: 'Verzekeringen Nederland', markten: ['NL'], regex: '(verzekering|zorgpolis|zorgpremie|arbeidsongeschiktheid|overlijdensrisico|aov)', ow: [['zorg', /zorgverzekering|zorgpolis|zorgpremie|basisverzekering|tandarts|eigen risico/], ['auto en motor', /auto|motor|bromfiets|scooter|camper|caravan/], ['wonen', /woon|inboedel|opstal|huiseigenaar/], ['reizen', /reis|annulering/], ['aansprakelijkheid en rechtsbijstand', /aansprakelijk|rechtsbijstand/], ['huisdieren', /huisdier|dieren|hond|kat/], ['fiets', /fiets|ebike|e-bike|fatbike/], ['inkomen en nabestaanden', /arbeidsongeschiktheid|aov|overlijdensrisico|uitvaart/], ['zakelijk', /zakelijk|bedrijf|zzp|beroep|cyber/]] },
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
const onderwerp = (k, lijst = ONDERWERP) => (lijst.find(([, r]) => r.test(k)) || ['overig'])[0];

export default async function handler(req, res) {
  const id = String(req.query.thema || '').toLowerCase(), T = THEMA[id];
  if (!T) return res.status(400).json({ error: 'onbekend thema', themas: Object.keys(THEMA) });
  const store = getStore(), pad = `zoekvraag/${id}.json`, oud = await getJSON(store, pad, null);
  let uit = oud;
  if (!oud || Date.now() - (oud.t || 0) > 7 * 864e5) {
    const b = budget(+(process.env.ZV_MAX || 0.6)), markten = {};
    for (const cc of T.markten) {
      const [loc, lang] = M[cc];
      const items = await topSearches({ loc, lang }, b, { by: 'volume', anyGrowth: true, minVolume: 20, limit: 700, regex: T.regex, intent: null }).catch(() => []);
      markten[cc] = { taal: lang, termen: items.map(x => ({ k: x.k, v: x.volume, y: x.trend && x.trend.y, i: x.intent, o: onderwerp(x.k, T.ow), m: (x.monthly || []).slice(0, 12).map(z => z.v) })) };
    }
    const n = Object.values(markten).reduce((s, x) => s + x.termen.length, 0);
    if (n) { uit = { thema: id, naam: T.naam, t: Date.now(), kosten: Math.round(b.spent * 1000) / 1000, fouten: b.errors.slice(0, 5), markten }; if (store) await putJSON(store, pad, uit).catch(() => {}); }
    else if (!oud) return res.status(503).json({ error: 'geen data (budget of DataForSEO)', fouten: b.errors.slice(0, 5) });
  }
  // samenvatting per onderwerp over alle markten: totaal volume en de grootste termen
  const per = {};
  for (const [cc, m] of Object.entries(uit.markten || {})) for (const x of m.termen) { const o = per[x.o] ||= { v: 0, top: [] }; o.v += x.v || 0; o.top.push({ cc, k: x.k, v: x.v, y: x.y }); }
  for (const o of Object.values(per)) o.top = o.top.sort((a, b) => b.v - a.v).slice(0, 12);
  const cc = String(req.query.cc || '').toUpperCase();
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json({ thema: uit.thema, naam: uit.naam, bijgewerkt: new Date(uit.t).toISOString(), onderwerpen: Object.fromEntries(Object.entries(per).sort((a, b) => b[1].v - a[1].v)), ...(cc && uit.markten[cc] ? { markt: { cc, ...uit.markten[cc] } } : { markten: Object.fromEntries(Object.entries(uit.markten).map(([k, m]) => [k, { taal: m.taal, n: m.termen.length, top: m.termen.slice(0, 60) }])) }) });
}
