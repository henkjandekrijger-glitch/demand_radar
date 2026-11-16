// GET /api/zoekvraag?thema=curacao[&cc=US] — wat mensen zoeken over een thema (een plaats, merk of onderwerp), per markt in de eigen taal:
// zoekterm, volume per maand, trend over een jaar, zoekintentie en de laatste 12 maanden, gegroepeerd per onderwerp.
// Voor elk project dat zijn site op echte vraag wil afstemmen (Henkjan 9 nov 2026: "Doe goed onderzoek met demand radar waar mensen naar zoeken
// en optimaliseer de site daarop"). Openbaar te lezen. Kost geld bij DataForSEO, daarom: per thema hooguit één keer per 7 dagen gekocht
// (hooguit ZV_MAX dollar, standaard $0,60, binnen de dagrem van lib/dfs.js), daarna altijd uit de opslag (zoekvraag/<thema>.json).
// Nieuw thema: één regel in THEMA hieronder (regex op de zoekterm + markten met taal).
import { getStore, getJSON, putJSON } from '../lib/store.js';
import { topSearches, budget, serp } from '../lib/dfs.js';

const M = { US: [2840, 'en'], NL: [2528, 'nl'], DE: [2276, 'de'], CA: [2124, 'en'], CO: [2170, 'es'], BR: [2076, 'pt'], GB: [2826, 'en'], BE: [2056, 'nl'], AU: [2036, 'en'], DO: [2214, 'es'], PA: [2591, 'es'], SR: [2740, 'nl'] };
// Plastische chirurgie (14 nov 2026, Henkjan: keuzehulp "waar je moet zijn" voor NL, US en wereldwijd): de landen waar patiënten
// vandaan komen; ingrepen in NL, EN en DE, en wie naar het buitenland gaat (Turkije, Mexico, Colombia, Dominicaanse Republiek …).
const OW_PLASTISCH = [
  ['buitenland', /turkije|turkey|türkei|turkei|istanbul|antalya|izmir|mexico|mexiko|tijuana|cancun|colombia|kolumbien|medellin|cali\b|dominican|dominicaanse|dominikan|punta cana|santo domingo|thailand|bangkok|korea|seoul|brazil|brazilië|brasilien|costa rica|poland|polen|hungary|hongarije|ungarn|belgi|belgium|abroad|buitenland|ausland/],
  ['kosten', /kosten|kost |prijs|prijzen|cost|price|how much|wat kost|preis|kosten|euro|dollar|\$|financ|vergoed|insurance|verzekering|krankenkasse/],
  ['arts en kliniek', /kliniek|clinic|klinik|chirurg|surgeon|arzt|ärzt|dokter|doctor|near me|in de buurt|in der nähe|best |beste|top |review|ervaring|erfahrung|board certified/],
  ['herstel en risico', /voor en na|before and after|vorher nachher|herstel|recovery|heilung|genesung|na de operatie|after surgery|nach der op|complicat|komplikation|risico|risk|gone wrong|mislukt|pijn|pain|schmerz|littekens|scar|narbe/],
  ['ogen en zicht', /ooglas|ogen laseren|lasik|laser eye|augenlaser|lensvervang|lens replacement|voorzetlens|voorzetlenzen|icl lens|icl surgery|implantable contact lens|staaroperatie|cataract surg|katarakt|linsenaustausch/],
  ['tandheelkunde', /tandimplant|dental implant|zahnimplant|all.on.4|all.on.6|veneers|facings|tandkroon|dental crown|zahnkrone|invisalign|aligners|teeth whitening|tanden bleken/],
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
// KDP-boeken (16 nov 2026): onderwerpen per boekgids.
const OW_KDP = [
  ['adventskalender', /adventskalender|advent calendar/],
  ['grillboek', /pit boss|pellet|traeger|smoker|griddle|blackstone/],
  ['slowcooker', /crock pot|slow cooker/],
  ['bijbel', /apocrypha|enoch|bible/],
  ['puzzel', /word search|wordsearch/],
  ['gewoonte', /habit|lasting change/],
  ['munten', /coin/],
  ['tieners', /teen|tween|boys|girls/],
  ['white elephant en wichtel', /white elephant|secret santa|wichtel/],
  ['feitenboek', /fact|trivia|bathroom reader|unnützes wissen/],
  ['stocking stuffers', /stocking stuffer/],
];
// Executives (15 nov 2026, Henkjan: "doe zelfde diepte-analyse zodat we ook meerdere ingangen kunnen maken, te vinden op SEO en LLM"):
// wie discreet een volgende stap zoekt: headhunters, topvacatures, interim, toezicht/board, salaris, outplacement, platforms.
const OW_EXEC = [
  ['platform', /experteer|bluesteps|linkedin|open to work/],
  ['toezicht en board', /commissaris|toezicht|board|aufsichtsrat|beirat|non-executive|non executive/],
  ['interim', /interim/],
  ['outplacement en coaching', /outplacement|coach/],
  ['salaris en pakket', /salar|salaris|gehalt|bonus|verdien/],
  ['headhunter', /headhunter|executive search|personalberat|recruit|werving/],
  ['vacatures', /job|vacature|stelle|position|functie|führung|directie|directeur|geschäftsführer|vorstand/],
];
// Stille intenties (15 nov 2026, Henkjan: "Welke intents nog meer waar ook naar gezocht wordt en hoe we ze kunnen verkopen"): wat mensen
// discreet willen met veel waarde: luxe bezit stil verkopen, woning off-market, vermogen, praktijk, agrarisch, investeerder, herstructurering.
const OW_STIL = [
  ['woning stil', /funda|stille verkoop|off.?market|pocket listing|diskret/],
  ['praktijk', /praktijk|praxis|practice|apotheek|apotheke|pharmacy/],
  ['vermogen', /vermogen|private bank|family office|vermögen|wealth/],
  ['agrarisch', /boerderij|landbouw|grond|uitkoop|hof |landwirtschaft|ackerland|farm/],
  ['investeerder', /investeer|investor|durfkapitaal|kapitaal/],
  ['herstructurering', /doorstart|herstructur|whoa|akkoord|restruktur|turnaround|restructuring/],
  ['luxe bezit', /horloge|rolex|patek|kunst|schilderij|klassieker|oldtimer|jacht|boot|uhr|gemälde|yacht|watch|art|painting|classic car|boat/],
];
export const THEMA = {
  verzekeringen: { naam: 'Verzekeringen Nederland', markten: ['NL'], regex: '(verzekering|zorgpolis|zorgpremie|arbeidsongeschiktheid|overlijdensrisico|aov)', ow: [['zorg', /zorgverzekering|zorgpolis|zorgpremie|basisverzekering|tandarts|eigen risico/], ['auto en motor', /auto|motor|bromfiets|scooter|camper|caravan/], ['wonen', /woon|inboedel|opstal|huiseigenaar/], ['reizen', /reis|annulering/], ['aansprakelijkheid en rechtsbijstand', /aansprakelijk|rechtsbijstand/], ['huisdieren', /huisdier|dieren|hond|kat/], ['fiets', /fiets|ebike|e-bike|fatbike/], ['inkomen en nabestaanden', /arbeidsongeschiktheid|aov|overlijdensrisico|uitvaart/], ['zakelijk', /zakelijk|bedrijf|zzp|beroep|cyber/]] },
  'plastische-chirurgie': { naam: 'Plastische chirurgie (waar ga je heen)', markten: ['NL', 'US', 'GB', 'DE', 'CA', 'AU'], ow: OW_PLASTISCH, max: 0.9,
    // v3 (15 nov 2026): ogen, lenzen, tandheelkunde en andere keuze-ingrepen toegevoegd. Cache direct schoon gefilterd zonder aankoop.
    // v2 (15 nov 2026): de eerste meting ving "bbl" ook in bubble, kibble en pebble (MBO-BBL, Big Bash League, olievaten) en
    // "eyelid"/"ooglid" in strontjes en trillende oogleden; die vulden de 700 plekken per land. Nu alleen ingrepen. Opnieuw kopen pas
    // vanaf 16 nov (nieuwe DataForSEO-dag, na de rem van vandaag); tot dan blijft de oude meting staan.
    v: 3, vanaf: '2026-11-16',
    regex: '(plastische chirurg|plastisch chirurg|plastische op|plastic surg|cosmetic surg|aesthetic surg|schönheitsop|schönheitschirurg|schoenheitschirurg|schönheitsklinik|ästhetische chirurg|ästhetische op|cosmetische chirurg|cosmetische kliniek|cosmetic clinic|ooglidcorrectie|ooglid correctie|oogleden correctie|bovenooglid|eyelid surg|eyelid lift|blepharoplast|lidstraff|lidkorrektur|borstvergroting|borstverkleining|borstlift|borstimplant|breast augment|breast lift|breast reduction|breast implant|boob job|brustvergr|bruststraff|brustverkl|brustimplant|liposuc|liposuct|fettabsaug|buikwandcorrectie|buikwand correctie|tummy tuck|abdominoplast|bauchdeckenstraff|neuscorrectie|rhinoplast|nose job|nasenkorrektur|nasen-op|nasenop|facelift|face lift|gesichtsstraff|neck lift|halslift|brow lift|brazilian butt lift|brazilian buttlift|butt lift|po-lift|mommy makeover|bodylift|body lift|armlift|arm lift|oberarmstraff|thigh lift|haartransplant|hair transplant|haarimplant|ooglaseren|ogen laseren|lasik|laser eye surgery|augenlasern|lensvervanging|lens replacement|linsenaustausch|voorzetlens|voorzetlenzen|icl lens|icl surgery|implantable contact lens|staaroperatie|cataract surgery|kataraktoperation|tandimplant|dental implant|zahnimplant|all on 4|all-on-4|veneers|facings|tandkroon|dental crown|zahnkrone|invisalign|aligners|teeth whitening|tanden bleken|baardtransplant|beard transplant|barttransplant|gynaecomast|gynecomast|labiaplast|schaamlipcorrectie|otoplast|oorcorrectie|ohrenkorrektur|liplift|lip lift|implant removal|implantaten verwijderen|botox|dermal filler|fillers kliniek|littekencorrectie|scar treatment|laser hair removal|laser ontharen|tattoo removal|tatoeage verwijderen)' },
  'bedrijf-verkopen': { naam: 'Bedrijf verkopen en overnemen', markten: ['NL', 'BE', 'DE', 'US'], ow: OW_BEDRIJF, max: 0.45,
    serp: { NL: ['bedrijf verkopen', 'wat is mijn bedrijf waard', 'bedrijfsovername', 'bedrijf te koop'], BE: ['bedrijf verkopen', 'bedrijf overnemen'], DE: ['firma verkaufen', 'unternehmensbewertung', 'unternehmensnachfolge'], US: ['sell my business', 'business broker', 'what is my business worth', 'business for sale'] },
    regex: '(bedrijf verkopen|bedrijf te koop|bedrijven te koop|onderneming verkopen|onderneming te koop|bedrijfsovername|bedrijf overnemen|overname bedrijf|bedrijfsoverdracht|overdracht bedrijf|bedrijfsopvolging|bedrijfswaardering|waardering bedrijf|waarde bedrijf|waarde van een bedrijf|waarde van mijn bedrijf|bedrijf waard|bedrijfswaarde|bv verkopen|bv te koop|holding verkopen|aandelen bv|webshop verkopen|webshop te koop|praktijk verkopen|praktijk te koop|zaak verkopen|zaak te koop|bedrijfsmakelaar|overnameadvi|overnamemakelaar|fusies en overnames|fusie en overname|bedrijventekoop|brookz|overnamemarkt|dealsuite|firma verkaufen|unternehmen verkaufen|unternehmensverkauf|unternehmensnachfolge|nachfolger gesucht|nachfolgebörse|firmenbewertung|unternehmensbewertung|unternehmenswert|firma zu verkaufen|unternehmen zu verkaufen|unternehmensbörse|gmbh verkaufen|gmbh kaufen|firma kaufen|unternehmen kaufen|m&a berater|sell my business|sell a business|selling a business|sell your business|sell my company|selling my company|sell a company|business for sale|businesses for sale|business broker|m&a advisor|m&a firm|business valuation|value my business|value of my business|my business worth|business worth|company valuation|valuation of a business|exit planning|succession planning|buy a business|buying a business|buy an existing business|small business for sale|business acquisition|bizbuysell)' },
  executives: { naam: 'Executives: discreet een volgende stap', markten: ['NL', 'DE', 'US', 'GB'], ow: OW_EXEC, max: 0.35,
    regex: '(headhunter|executive search|executive recruit|executive job|executive vacature|executive position|c-level|c-suite|cfo job|cfo vacature|ceo job|ceo vacature|coo job|cto job|cmo job|directeur vacature|directie vacature|directiefunctie|algemeen directeur|managing director job|general manager job|interim manager|interim management|interim directeur|interim cfo|interim ceo|commissaris worden|raad van commissarissen|toezichthouder worden|raad van toezicht|non-executive director|non executive director|board member job|board seat|board position|join a board|aufsichtsrat werden|aufsichtsratsmandat|beirat werden|geschäftsführer stellen|geschäftsführer job|führungskräfte jobs|führungsposition|vorstand job|personalberater|personalberatung|outplacement|executive coach|executive salary|ceo salary|cfo salary|directeur salaris|geschäftsführer gehalt|experteer|bluesteps|open to work)' },
  'stille-intenties': { naam: 'Stille intenties met veel waarde', markten: ['NL', 'DE', 'US'], ow: OW_STIL, max: 0.45,
    regex: '(horloge verkopen|rolex verkopen|patek verkopen|kunst verkopen|schilderij verkopen|kunst taxeren|kunstcollectie|klassieker verkopen|oldtimer verkopen|jacht verkopen|boot verkopen|huis verkopen zonder funda|stille verkoop|off market|vermogensbeheer|private banking|family office|praktijk verkopen|tandartspraktijk|huisartsenpraktijk|dierenartspraktijk|fysiotherapiepraktijk|apotheek te koop|boerderij verkopen|landbouwgrond verkopen|grond verkopen|uitkoopregeling|investeerder zoeken|investeerders zoeken|durfkapitaal|doorstart|herstructurering|whoa akkoord|uhr verkaufen|rolex verkaufen|kunst verkaufen|gemälde verkaufen|oldtimer verkaufen|yacht verkaufen|immobilie diskret|off market immobilie|vermögensverwaltung|praxis verkaufen|zahnarztpraxis|arztpraxis verkaufen|tierarztpraxis|apotheke verkaufen|hof verkaufen|ackerland verkaufen|investor finden|investoren finden|restrukturierung|sell my watch|sell rolex|sell my rolex|sell my art|sell artwork|sell a painting|art appraisal|sell classic car|sell my classic car|sell yacht|sell my boat|off market listing|pocket listing|sell house off market|wealth manager|wealth management firm|private bank|sell dental practice|sell my dental practice|sell veterinary practice|sell medical practice|sell my practice|sell pharmacy|sell my farm|sell farmland|find investors|find an investor|business turnaround|restructuring advisor)' },
  // Reizen van en naar Kòrsou per bestemming (15 nov 2026, Henkjan: "Ja haal termen op en maak de paginas totaal optimised voor LLM en SEO"):
  // Curaçao plus een bestemming met directe vlucht (Colombia, Dominicaanse Republiek, Suriname, Brazilië, Panama, ABC, Venezuela, Miami),
  // in beide richtingen, plus "vanaf Curaçao". Voor de routepagina's op curacao.day (todayin bzz lib/cwroute.js).
  'korsou-reizen': { naam: 'Reizen van en naar Kòrsou per bestemming', markten: ['NL', 'CO', 'DO', 'BR', 'US', 'PA', 'SR'], max: 0.6,
    ow: [['medellin', /medell/], ['bogota', /bogot/], ['barranquilla', /barranq/], ['cartagena en santa marta', /cartagena|santa marta/], ['dominicaanse republiek', /santo domingo|punta cana|dominican|dominicana/], ['suriname', /surinam|paramaribo/], ['brazilie', /brasil|brazil|belo horizonte/], ['panama', /panam/], ['aruba', /aruba/], ['bonaire', /bonaire/], ['venezuela', /venezuel|caracas|maracaibo/], ['miami', /miami/], ['vanaf curacao', /desde|from|vanaf|van |saindo|ab /]],
    regex: '(cura[cç]ao|curazao|korsou|willemstad).*(medell|bogot|barranq|cartagena|santa marta|santo domingo|punta cana|dominican|dominicana|suriname|surinam|paramaribo|belo horizonte|brasil|brazil|panam|aruba|bonaire|venezuel|caracas|maracaibo|miami)|(medell|bogot|barranq|cartagena|santa marta|santo domingo|punta cana|dominican|dominicana|suriname|surinam|paramaribo|belo horizonte|brasil|brazil|panam|aruba|bonaire|venezuel|caracas|maracaibo|miami).*(cura[cç]ao|curazao|korsou|willemstad)|(desde|from|vanaf|saindo de) (cura[cç]ao|curazao|korsou|willemstad)' },
  // Eigen KDP-boeken als cadeau (16 nov 2026, Henkjan: "Onderzoek met de demandradar of we kunnen scoren met google en LLM met de keuzehulpen
  // voor boeken"): de zoekvragen achter de boekgidsen op whichtobuy.best en kaufberater.best, plus wie er bovenaan staat (serp).
  'kdp-boeken': { naam: 'Boeken als cadeau (eigen KDP-boeken)', markten: ['US', 'CA', 'GB', 'DE'], max: 0.6, ow: OW_KDP,
    serp: { US: ['stocking stuffers for teens', 'fun facts book for adults', 'pit boss cookbook', 'apocrypha book', 'white elephant gifts for men'], DE: ['adventskalender für männer'] },
    regex: '(stocking stuffer|white elephant|secret santa|fun fact|facts book|trivia book|bathroom reader|gifts for teen|gift for teen|teen boy gift|adventskalender für männer|adventskalender männer|adventskalender mann|advent calendar for men|unnützes wissen|wichtelgeschenk|pit boss|pellet grill cookbook|pellet smoker|traeger cookbook|smoker cookbook|griddle cookbook|blackstone cookbook|crock pot cookbook|slow cooker cookbook|apocrypha|book of enoch|bible color|bible coloring|large print word search|word search large print|habit tracker|lasting change|coin collecting book)' },
  // taniakross.media (16 nov 2026, Henkjan: "Ik zie te weinig bezoek maak een plan voor meer SEO en LLM bezoek en wat voor content daarvoor
  // nodig is kijk naar demand radar welke content of faq er bij moet"): Tania zelf, haar werk (opera, radio, tv, masterclass, dagvoorzitter)
  // en de gasten van haar podcast A Kross, in NL en BE (en de VS voor opera en Masked Singer).
  taniakross: { naam: 'Tania Kross, haar werk en podcastgasten', markten: ['NL', 'BE', 'US'], max: 0.6,
    ow: [['tania kross', /tan[iy]a? ?(k|c)ro(s|ss)|kross tania/], ['podcast en gasten', /a kross|izaline|calister|francis sling|samira rafaela|valika smeulders|levi silvanie|kurt schoop|dionne pietersz/], ['opera en zang', /mezzosopraan|mezzo-sopraan|mezzo soprano|operazanger|opera zanger|katibu di shon|carmen opera|masterclass zang|masterclass opera|podium klassiek/], ['tv en radio', /masked singer|beste zangers|middagmagazine|curacao\.nu|curacao nu/], ['dagvoorzitter en spreker', /dagvoorzitter|presentator congres|moderator congres/], ['curacao cultuur', /papiaments|curacaose zanger|antilliaanse zanger|curacao cultuur|cultuur curacao|zangeres curacao|zanger curacao/]],
    serp: { NL: ['tania kross', 'tania kross podcast', 'izaline calister', 'operazangeres'] },
    regex: '(tania kross|tanja kross|tania cross|tanja cross|tania kros|tanja kros|tanja kroes|kross tania|a kross podcast|izaline calister|francis sling|samira rafaela|valika smeulders|levi silvanie|kurt schoop|dionne pietersz|mezzosopraan|mezzo-sopraan|mezzo soprano|operazangeres|opera zangeres|operazanger|katibu di shon|masterclass zang|masterclass opera|podium klassiek|masked singer winnaar|masked singer tania|tania masked singer|beste zangers tania|middagmagazine|curacao\\.nu|dagvoorzitter|opera papiaments|papiamentse opera|curacaose zanger|antilliaanse zanger|zangeres curacao|zanger curacao)' },
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

// 15 nov 2026: executives liep tegen zijn plafond aan (US half, GB leeg); US en GB apart en volledig.
THEMA['executives-en'] = { ...THEMA.executives, naam: 'Executives (US en GB volledig)', markten: ['US', 'GB'], max: 0.6 };

// Nichescan (15 nov 2026, Henkjan: "Los dit dan op voor producten . Vind de intenties en maak er paginas voor": zoals "beste tandarts in
// Willemstad" weinig concurrentie heeft, zoeken we koopvragen voor producten met een doelgroep of situatie waar geen grote vergelijker op staat).
// GET /api/zoekvraag?niche=NL (ook US, DE). Stap 1, hooguit één keer per 7 dagen: koop- en vergelijkvragen met een situatiewoord
// (voor, zonder, met, onder ...) uit DataForSEO top_searches, met volume en keyword difficulty (kd, 0-100, organische moeilijkheid).
// Stap 2, bij elke aanroep hooguit NICHE_SERP (40) nieuwe: wie staat er in de top 10 (± $0,002 per zoekterm), en hoeveel daarvan zijn
// echte vergelijkpagina's (grote vergelijkers of titels met beste/test/vergelijk). Kans = volume x zwakte. Alles binnen de dagrem van lib/dfs.js.
const NICHE = {
  NL: { re: '( voor | zonder | met | onder | tot | in de | op de |klein|stil|licht|goedkoop|budget)', groot: /(^|\.)(consumentenbond\.nl|tweakers\.net|kieskeurig\.nl|coolblue\.nl|hln\.be|ad\.nl|nu\.nl|androidplanet\.nl|iculture\.nl|test-aankoop\.be|testaankoop\.be|bright\.nl|kassa\.bnnvara\.nl|independer\.nl|vergelijk\.nl|beslist\.nl|tefal\.nl|mediamarkt\.nl|wehkamp\.nl|ikea\.com|praxis\.nl|gamma\.nl|hornbach\.nl)$/ },
  US: { re: '( for | without | with | under | in a |small|quiet|cheap|budget|lightweight)', groot: /(^|\.)(nytimes\.com|rtings\.com|cnn\.com|tomsguide\.com|goodhousekeeping\.com|consumerreports\.org|pcmag\.com|techradar\.com|theverge\.com|bestreviews\.com|popularmechanics\.com|seriouseats\.com|thespruce\.com|bobvila\.com|forbes\.com|usatoday\.com|wired\.com|cnet\.com|engadget\.com|foodandwine\.com|bhg\.com|businessinsider\.com|buzzfeed\.com|nbcnews\.com|today\.com|people\.com|gearlab\.com|outdoorgearlab\.com|techgearlab\.com)$/ },
  DE: { re: '( für | ohne | mit | unter | bis |klein|leise|leicht|günstig|budget)', groot: /(^|\.)(test\.de|chip\.de|computerbild\.de|testsieger\.de|vergleich\.org|stern\.de|focus\.de|t3n\.de|idealo\.de|netzwelt\.de|techbook\.de|guter-rat\.de|haushaltstipps\.net|konsument\.at|ktipp\.ch|rtl\.de|bild\.de|welt\.de|faz\.net|spiegel\.de|testberichte\.de|check24\.de|otto\.de|mediamarkt\.de)$/ },
};
const NICHE_MARKT = /(^|\.)(bol\.com|amazon\.[a-z.]+|ebay\.[a-z.]+|marktplaats\.nl|etsy\.com|aliexpress\.com|temu\.com|walmart\.com|target\.com|kleinanzeigen\.de|kaufland\.de|bestbuy\.com|homedepot\.com|lowes\.com)$/;
const NICHE_FORUM = /(^|\.)(reddit\.com|quora\.com|gathering\.tweakers\.net|forum\.|gutefrage\.net|youtube\.com|pinterest\.[a-z.]+|facebook\.com|tiktok\.com)$/;
const REDACTIE = /\b(beste|best|top ?\d+|test|getest|vergelijk|vergleich|review|reviews|kaufberatung|testsieger|ranked|tested)\b/i;
function nicheZwakte(r, cc) {
  const og = (r && r.organic) || [];
  let sterk = 0, forum = 0, markt = 0;
  for (const o of og) { const d = String(o.domain || '').replace(/^www\./, '').toLowerCase();
    if (NICHE_FORUM.test(d)) forum++; else if (NICHE_MARKT.test(d)) markt++; else if (NICHE[cc].groot.test(d) || REDACTIE.test(o.title || '')) sterk++; }
  // 0 = top 10 vol met vergelijkpagina's, 1 = niemand heeft er een echte vergelijkpagina voor
  return { zwakte: Math.round(Math.max(0, Math.min(1, 1 - sterk / 7 + forum * 0.04)) * 100) / 100, sterk, forum, markt, top3: og.slice(0, 3).map(o => String(o.domain || '').replace(/^www\./, '')) };
}
async function nicheScan(req, res) {
  const cc = String(req.query.niche || '').toUpperCase(), N = NICHE[cc]; if (!N) return res.status(400).json({ error: 'markt', markten: Object.keys(NICHE) });
  const store = getStore(), pad = `zoekvraag/niche-${cc}.json`; let uit = await getJSON(store, pad, null); const [loc, lang] = M[cc];
  const b = budget(+(process.env.NICHE_MAX || 0.35));
  if (!uit || Date.now() - (uit.t || 0) > 7 * 864e5) {
    const items = await topSearches({ loc, lang }, b, { by: 'volume', anyGrowth: true, minVolume: 30, limit: 1000, regex: N.re, intent: ['commercial', 'transactional'] }).catch(() => []);
    if (items.length) { const oudSerp = Object.fromEntries(((uit && uit.items) || []).filter(x => x.serp).map(x => [x.k, x])); uit = { cc, t: Date.now(), kosten: 0, items: items.map(x => ({ k: x.k, v: x.volume, kd: x.kd, cpc: x.cpc, y: x.trend && x.trend.y, m: (x.monthly || []).slice(0, 12).map(z => z.v), ...(oudSerp[x.k] ? { serp: oudSerp[x.k].serp, zw: oudSerp[x.k].zw } : {}) })) }; }
  }
  if (!uit) return res.status(503).json({ error: 'geen data (budget of DataForSEO)', fouten: b.errors.slice(0, 5) });
  // vaste vraag: de laagste van de laatste 6 maanden telt (een piek in één maand is een gebeurtenis, les curacao.day)
  const vast = x => { const m = (x.m || []).slice(0, 6).filter(v => v != null); return m.length ? Math.min(x.v || 0, ...m) : (x.v || 0); };
  const voorlopig = x => vast(x) * Math.pow(1 - Math.min(100, x.kd ?? 30) / 100, 2);
  const nSerp = Math.max(0, Math.min(80, +(req.query.n || process.env.NICHE_SERP || 40)));
  const te = uit.items.filter(x => !x.serp).sort((a, c) => voorlopig(c) - voorlopig(a)).slice(0, nSerp);
  for (const x of te) { const r = await serp(x.k, { loc, lang }, b).catch(() => null); if (!r) break; x.serp = 1; x.zw = nicheZwakte(r, cc); }
  uit.kosten = Math.round(((uit.kosten || 0) + b.spent) * 1000) / 1000;
  if (store && (te.length || b.spent)) await putJSON(store, pad, uit).catch(() => {});
  const kansen = uit.items.filter(x => x.zw).map(x => ({ k: x.k, v: x.v, vast: vast(x), kd: x.kd, cpc: x.cpc, y: x.y, zwakte: x.zw.zwakte, sterk: x.zw.sterk, forum: x.zw.forum, markt: x.zw.markt, top3: x.zw.top3, kans: Math.round(vast(x) * x.zw.zwakte) }))
    .sort((a, c) => c.kans - a.kans);
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400');
  return res.status(200).json({ markt: cc, uitleg: 'Koopvragen met een situatie of doelgroep, gesorteerd op kans = vaste maandvraag x zwakte van de top 10 in Google (1 = geen echte vergelijkpagina, 0 = vol). sterk = vergelijkpagina\'s in de top 10, forum en markt = fora en winkels/marktplaatsen.', bijgewerkt: new Date(uit.t).toISOString(), termen: uit.items.length, gecontroleerd: kansen.length, nogTeControleren: uit.items.length - kansen.length, kosten: uit.kosten, fouten: b.errors.slice(0, 3), kansen: kansen.slice(0, Math.min(500, +(req.query.max || 200))) });
}

export default async function handler(req, res) {
  if (req.query.niche) return nicheScan(req, res);
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
  // Clean the old cached sample without buying data or bypassing the daily cap.
  // Missing topics in that sample are unknown, not zero demand.
  let quality;
  if (id === 'plastische-chirurgie') {
    const strict = new RegExp(T.regex, 'i'), rejected = {};
    const markten = Object.fromEntries(Object.entries(uit.markten || {}).map(([cc,m]) => {
      const termen = (m.termen || []).filter(x=>strict.test(x.k)).map(x=>({...x,o:onderwerp(x.k,T.ow)}));
      rejected[cc]=(m.termen || []).length-termen.length;
      return [cc,{...m,termen}];
    }));
    uit={...uit,markten};
    quality={filter_version:3,source_version:uit.v || 1,rejected,coverage:uit.v===3?'expanded_sample':'legacy_sample_missing_eye_and_dental_topics',missing_topic_volume:null,refresh_not_before:T.vanaf,volume_note:'Keyword estimates can overlap. Do not sum synonyms or markets as unique people.'};
  }
  // samenvatting per onderwerp over alle markten: totaal volume en de grootste termen
  const per = {};
  for (const [cc, m] of Object.entries(uit.markten || {})) for (const x of m.termen) { const o = per[x.o] ||= { v: 0, top: [] }; o.v += x.v || 0; o.top.push({ cc, k: x.k, v: x.v, y: x.y, ...(x.c != null ? { c: x.c } : {}) }); }
  for (const o of Object.values(per)) o.top = o.top.sort((a, b) => b.v - a.v).slice(0, 12);
  const cc = String(req.query.cc || '').toUpperCase();
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json({ thema: uit.thema, naam: uit.naam, bijgewerkt: new Date(uit.t).toISOString(), ...(quality ? {quality} : {}), ...(uit.serp ? { serp: uit.serp } : {}), onderwerpen: Object.fromEntries(Object.entries(per).sort((a, b) => b[1].v - a[1].v)), ...(cc && uit.markten[cc] ? { markt: { cc, ...uit.markten[cc] } } : { markten: Object.fromEntries(Object.entries(uit.markten).map(([k, m]) => [k, { taal: m.taal, n: m.termen.length, top: m.termen.slice(0, 60) }])) }) });
}
