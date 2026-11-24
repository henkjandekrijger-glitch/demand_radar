// GET /api/zoekvraag?thema=curacao[&cc=US] — wat mensen zoeken over een thema (een plaats, merk of onderwerp), per markt in de eigen taal:
// zoekterm, volume per maand, trend over een jaar, zoekintentie en de laatste 12 maanden, gegroepeerd per onderwerp.
// Voor elk project dat zijn site op echte vraag wil afstemmen (Henkjan 9 nov 2026: "Doe goed onderzoek met demand radar waar mensen naar zoeken
// en optimaliseer de site daarop"). Openbaar te lezen. Kost geld bij DataForSEO, daarom: per thema hooguit één keer per 7 dagen gekocht
// (hooguit ZV_MAX dollar, standaard $0,60, binnen de dagrem van lib/dfs.js), daarna altijd uit de opslag (zoekvraag/<thema>.json).
// Nieuw thema: één regel in THEMA hieronder (regex op de zoekterm + markten met taal). regex mag ook een lijst zijn: elk deel een eigen vraag.
import { getStore, getJSON, putJSON } from '../lib/store.js';
import { topSearches, budget, serp, searchVolume } from '../lib/dfs.js';

const M = { US: [2840, 'en'], NL: [2528, 'nl'], DE: [2276, 'de'], CA: [2124, 'en'], CO: [2170, 'es'], BR: [2076, 'pt'], GB: [2826, 'en'], BE: [2056, 'nl'], AU: [2036, 'en'], FR: [2250, 'fr'], ES: [2724, 'es'], IT: [2380, 'it'], DO: [2214, 'es'], PA: [2591, 'es'], SR: [2740, 'nl'], AT: [2040, 'de'], MX: [2484, 'es'] };
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
// Boek over angst (16 nov 2026, Henkjan: "ik wil een boek over FEAR maken . Check zoekvragen en competitie en wat de hook dan zou moeten worden"):
// waar mensen bang voor zijn, hoe ze het willen oplossen, en wat ze al lezen. Merken en series (Fear of God, Fear Street, Fear the
// Walking Dead, Five Nights) worden bij het lezen apart gezet in 'ruis', zodat ze de onderwerpen niet vullen.
const OW_FEAR = [
  ['ruis', /fear of god|essentials|fear street|walking dead|five nights|fnaf|fear factor|cape fear|fear and loathing|fear inoculum|fearless (taylor|tv)|taylor swift|primal fear|fear index|fear and greed|fear & greed|hoodie|cologne|shirt|shoes|game|movie|film|song|lyrics|chords|netflix|trailer|cast|season|episode/],
  ['boeken', /book|books|buch|bücher|read|novel|author|audiobook|workbook|journal|kindle|quotes|zitate|sprüche/],
  ['geloof', /bible|god|jesus|verse|scripture|psalm|bibel|prayer|gebet|lord|christian|faith/],
  ['falen en oordeel', /failure|failing|rejection|judg|what people think|success|public speaking|speaking|abandonment|commitment|intimacy|love|change|missing out|fomo|versagen|ablehnung|bindungsangst|verlustangst|zukunftsangst|prüfungsangst/],
  ['dood en ziekte', /death|dying|die |tod|sterben|cancer|illness|krank|hospital|needles|doctor/],
  ['fobieën', /phobia|phobie|spiders|spider|heights|flying|dark|snakes|dogs|water|clowns|holes|trypophobia|claustrophobia|agoraphobia|höhenangst|flugangst|spinnen|dunkel/],
  ['overwinnen', /overcome|overcoming|conquer|get over|stop being|how to stop|how to not|how to be|deal with|face your|facing|let go|überwinden|loswerden|besiegen|was tun|hilft|tips|ways to/],
  ['moed', /courage|courageous|fearless|brave|bravery|mut|mutig|tapfer|confidence|selbstvertrauen/],
  ['angst en paniek', /anxiety|anxious|panic|worry|worried|overthink|stress|nervous|angststörung|panikattacke|sorgen|grübeln/],
  ['kinderen', /kids|child|children|toddler|kinder|kind |baby|teen/],
  ['betekenis', /meaning|definition|what is|synonym|bedeutung|was ist|psychology|psychologie|brain|amygdala|biology|science/],
];
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
// AI-keuzehulp op nexy.help (Henkjan 17 nov 2026: "Maak daar een zeer uitgebreide keuzehulp van over AI . En daarin alles Nexy usecases meenemen
// maar alle vragen daarom trent gewoon beantwoorden je krijgt data for SEO budget bij deze" en "nexy help gaat op in de keuzehulpen").
const OW_AI = [
  ['assistenten', /chatgpt|chat gpt|claude|gemini|copilot|perplexity|grok|deepseek|mistral|le chat|meta ai|llama|pi ai/],
  ['schrijven', /writ|essay|paraphras|rewrite|grammar|humaniz|detector|text|copy|schrijf|tekst/],
  ['beeld en video', /image|picture|photo|art|video|logo|avatar|midjourney|dall|sora|veo|beeld|foto/],
  ['stem en bellen', /voice|call|phone|receptionist|speech|audio|podcast|stem|bellen|telefoon/],
  ['vergaderen en notities', /meeting|note|transcri|summar|record|notul|samenvat/],
  ['plannen en reminders', /schedul|calendar|remind|plann|agenda|assistant for|personal assistant|herinner/],
  ['mail en berichten', /email|e-mail|inbox|whatsapp|message|text message|reply|mail/],
  ['studie en werk', /study|homework|student|school|resume|cv|job|interview|work|huiswerk|sollicit/],
  ['code', /code|coding|program|developer|python|cursor|github/],
  ['bedrijf', /business|small business|marketing|seo|sales|customer|bedrijf|klant/],
  ['prijs en gratis', /free|price|pricing|cost|subscription|plus|pro|gratis|kosten|abonnement/],
  ['vergelijken', / vs |versus|best|compare|alternative|beste|vergelijk|alternatief/],
  ['veiligheid en privacy', /safe|privacy|private|secure|data|detect|veilig/],
];
export const THEMA = {
  // Zorgverzekering heel Nederland (Henkjan 17 nov 2026: "zorgverzekeringen helemaal compleet maakt voor Nederland ... alle hoeken en gaten gaan coveren via demand radar")
  zorgverzekering: { naam: 'Zorgverzekering Nederland', markten: ['NL'], max: 2.5, v: 2, regex: '(zorgverzekering|zorgpolis|zorgpremie|basisverzekering|aanvullende verzekering|aanvullend pakket|eigen risico|tandartsverzekering|tandarts verzekering|zorgtoeslag|naturapolis|restitutiepolis|budgetpolis|overstappen zorg|zilveren kruis|vgz|menzis|dsw zorg|ditzo|anderzorg|fbto|ohra zorg|interpolis zorg|univé zorg|unive zorg|zekur|stad holland|onvz|ikzorg|just zorg|promovendum|pnoozorg|zorg en zekerheid|salland zorg|hollandzorg|izz zorg|iza zorg|bewuzt|de friesland zorg|jaaah|cz zorg|cz verzekering|ziektekosten)', ow: [['basis en premie', /premie|basisverzekering|goedkoopste|vergelijk|2027|2026/], ['eigen risico', /eigen risico/], ['tandarts', /tandarts|gebit|orthodont|beugel/], ['fysio', /fysio|oefentherap|chiropract|osteopa/], ['bril en lenzen', /bril|lens/], ['zorgtoeslag', /zorgtoeslag|toeslag/], ['overstappen', /overstap|opzeggen|wisselen/], ['polisvorm', /natura|restitutie|budget|combinatie/], ['buitenland', /buitenland|reis|expat|werelddekking/], ['doelgroep', /student|zzp|kind|zwanger|65|pensioen|chronisch|werkgever|collectief/], ['verzekeraar', /zilveren|vgz|menzis|dsw|ditzo|anderzorg|fbto|ohra|interpolis|univ|zekur|stad holland|onvz|ikzorg|just|promovendum|pnoozorg|zorg en zekerheid|salland|hollandzorg|bewuzt|friesland|jaaah|\bcz\b/]] },
  'ai-keuze': { naam: 'AI kiezen en gebruiken (nexy.help)', markten: ['US', 'GB', 'NL'], max: 2.5, ow: OW_AI, regex: '(chatgpt|chat gpt|claude ai|gemini|copilot|perplexity|grok|deepseek|le chat|meta ai|ai assistant|ai assistent|ai agent|chatbot|best ai|free ai|gratis ai|beste ai|ai app|ai tool|ai generator|ai for |ai to |ai that |ai voor |ai receptionist|ai note|ai meeting|ai email|ai writer|ai voice|ai phone|ai schedul|ai calendar|ai reminder|ai whatsapp|whatsapp ai|artificial intelligence|kunstmatige intelligentie)' },
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
  'fear-boek': { naam: 'Angst en moed (boek over FEAR)', markten: ['US', 'GB', 'DE'], max: 0.45, ow: OW_FEAR, bron: 'suggest', // 20 nov: eerste thema via gratis suggesties (± $0,08 per markt)
    serp: { US: ['books about fear', 'how to overcome fear', 'feel the fear and do it anyway', 'fear of failure'], DE: ['angst überwinden buch'] },
    regex: '(fear|afraid|scared of|scared to|phobia|courage|fearless|overthink|angst|ängste|furcht|phobie|mutig|mut haben|panikattacke)' },
  // Voorspelspel zonder geld (21 nov 2026, Henkjan: "Hebben we een url ? Buiten vercel ?" en "Zoek domeinen met radar ."): welke woorden
  // mensen typen rond voorspellen, gelijk krijgen, witte kerst en de benzineprijs, om een domeinnaam op echte zoekvraag te kiezen.
  voorspelspel: { naam: 'Voorspelspel zonder geld (domeinkeuze)', markten: ['NL', 'US'], max: 0.3, bron: 'suggest',
    ow: [['ruis', /kerstboom|kerstbal|kerstster|kerstroos|kersthuis|kerstverlichting|lyrics|liedje|song|movie|film|mr deluxe|cast|dvd|bing crosby|irving berlin|vinyl|karaoke|chords|sheet music|ornament|decor|tree/], ['witte kerst', /witte kerst|white christmas|sneeuw|snow/], ['benzine', /benzine|brandstof|gas price|gasoline|fuel/], ['gelijk krijgen', /called it|told you|zei ik toch|gelijk/], ['wedden', /wedden|weddenschap|\bbet\b|betting|gokken|poll|peiling/], ['voorspellen', /voorspel|predict|forecast|verwachting/]],
    zaden: ['witte kerst', 'kans op witte kerst', 'sneeuw met kerst', 'voorspelling', 'voorspellen', 'zei ik toch', 'gelijk krijgen', 'weddenschap', 'white christmas', 'will gas prices go down', 'gas prices christmas', 'prediction game', 'predictions', 'called it', 'i told you so'],
    regex: '(witte kerst|sneeuw met kerst|sneeuw kerst|sneeuwen met kerst|voorspel|zei ik toch|gelijk gehad|gelijk krijgen|gelijk had|weddenschap|white christmas|snow on christmas|snow for christmas|snow christmas|will it snow|gas price|predict|called it|told you so)' },
  // taniakross.media (16 nov 2026, Henkjan: "Ik zie te weinig bezoek maak een plan voor meer SEO en LLM bezoek en wat voor content daarvoor
  // nodig is kijk naar demand radar welke content of faq er bij moet"): Tania zelf, haar werk (opera, radio, tv, masterclass, dagvoorzitter)
  // en de gasten van haar podcast A Kross, in NL en BE (en de VS voor opera en Masked Singer).
  taniakross: { naam: 'Tania Kross, haar werk en podcastgasten', markten: ['NL', 'BE', 'US'], max: 0.6,
    ow: [['tania kross', /tan[iy]a? ?(k|c)ro(s|ss)|kross tania/], ['podcast en gasten', /a kross|izaline|calister|francis sling|samira rafaela|valika smeulders|levi silvanie|kurt schoop|dionne pietersz/], ['opera en zang', /mezzosopraan|mezzo-sopraan|mezzo soprano|operazanger|opera zanger|katibu di shon|carmen opera|masterclass zang|masterclass opera|podium klassiek/], ['tv en radio', /masked singer|beste zangers|middagmagazine|curacao\.nu|curacao nu/], ['dagvoorzitter en spreker', /dagvoorzitter|presentator congres|moderator congres/], ['curacao cultuur', /papiaments|curacaose zanger|antilliaanse zanger|curacao cultuur|cultuur curacao|zangeres curacao|zanger curacao/]],
    serp: { NL: ['tania kross', 'tania kross podcast', 'izaline calister', 'operazangeres'] },
    regex: '(tania kross|tanja kross|tania cross|tanja cross|tania kros|tanja kros|tanja kroes|kross tania|a kross podcast|izaline calister|francis sling|samira rafaela|valika smeulders|levi silvanie|kurt schoop|dionne pietersz|mezzosopraan|mezzo-sopraan|mezzo soprano|operazangeres|opera zangeres|operazanger|katibu di shon|masterclass zang|masterclass opera|podium klassiek|masked singer winnaar|masked singer tania|tania masked singer|beste zangers tania|middagmagazine|curacao\\.nu|dagvoorzitter|opera papiaments|papiamentse opera|curacaose zanger|antilliaanse zanger|zangeres curacao|zanger curacao)' },
  // Batterij-keuzehulpen (18 nov 2026, Henkjan: "Check de battery keuzehulpen met demandradar en doe een totale update zodat we daar echt verkeer gaan pakken"):
  // stekker- en thuisbatterij, powerbank en powerstation op keuzehulp.best, whichtobuy.best en kaufberater.best.
  batterij: { naam: 'Batterijen: stekkerbatterij, thuisbatterij, powerbank, powerstation', markten: ['NL', 'DE', 'US'], max: 0.6,
    ow: [['stekker en balkon', /stekker|plug.?in|balkon|steckerspeicher|stecker speicher|balkonkraftwerk/], ['thuisbatterij', /thuisbat|thuisaccu|thuis batterij|home batter|whole home|powerwall|heimspeicher|batteriespeicher|stromspeicher|solarspeicher|battery storage|battery backup|energieopslag|zonnepanelen|solar batter/], ['powerstation', /power ?station|zonnegenerator|solar ?generator|solargenerator|draagbare accu|portable batter/], ['powerbank', /power ?bank|portable charger|powerbank/], ['merken', /ecoflow|jackery|bluetti|anker|zendure|marstek|growatt|sessy|homewizard|alpha ?ess|tesla|enphase|franklin|generac|sonnen|byd|huawei|goal zero/], ['kosten en terugverdienen', /kost|prijs|price|cost|preis|subsid|förder|terugverdien|lohnt|worth it|rendement|saldering|tax credit/], ['vragen', /^(hoe|wat|wanneer|waarom|is |heeft|how|what|when|why|is |does|do |can|was |wie |wann|lohnt|ist )/]],
    regex: '(thuisbatterij|thuisaccu|thuis batterij|stekkerbatterij|stekker batterij|plug-in batterij|plugin batterij|balkonbatterij|batterij zonnepanelen|batterij voor zonnepanelen|zonnepanelen met batterij|energieopslag|powerbank|power bank|powerstation|power station|zonnegenerator|draagbare accu|portable charger|portable battery|home battery|battery backup|battery storage|solar battery|solar generator|whole home battery|powerwall|batteriespeicher|stromspeicher|solarspeicher|heimspeicher|steckerspeicher|stecker speicher|balkonkraftwerk speicher|balkonkraftwerk mit speicher|speicher balkonkraftwerk|solargenerator|ecoflow|jackery|bluetti|anker solix|zendure|marstek|homewizard batterij|homewizard plug-in|sessy batterij)' },
  // Huis kopen en makelaar (19 nov 2026, Henkjan na de chatvraag "Ik wil een huis kopen in Gouda" op keuzehulp.best: "JA huis kopen is wel
  // waardevol . Kijk goed naar demand radar . Zodat content erbij goed werkt . We kunnen makelaars vergelijken"). Drie losse vragen (regex als
  // lijst), zodat de grote hypotheekvraag de makelaars per plaats niet uit de 700 plekken drukt.
  huiskopen: { naam: 'Huis kopen en makelaar', markten: ['NL'], max: 0.6,
    ow: [['makelaar', /makelaar|makelaardij|courtage|\bnvm\b|\bvbo\b|vastgoedpro/], ['hypotheek', /hypothe|\bnhg\b|leencapaciteit|starterslening/], ['bieden en keuring', /bied|\bbod\b|taxat|keuring|bouwkundig|voorbehoud|ontbindend/], ['kosten koper', /kosten koper|overdrachtsbelasting|notaris|waarborg|bankgarantie|kosten/], ['starters', /starter|eerste huis|eerste woning/], ['huis kopen', /kopen|koopwoning|koopakte|leveringsakte|transportakte/], ['vragen', /^(hoe|wat|wanneer|waarom|welke|is |kan |mag |hoeveel)/]],
    regex: ['(makelaar|makelaars|aankoopmakelaar|verkoopmakelaar|makelaardij|nvm makelaar|courtage)', '(huis kopen|huizen kopen|woning kopen|appartement kopen|eerste huis|eerste woning|koopwoning|kosten koper|overdrachtsbelasting|startersvrijstelling|overbieden|bieden op een huis|bieden op huis|bod uitbrengen|bod op huis|ontbindende voorwaarde|voorbehoud financiering|bouwkundige keuring|bouwkundig rapport|taxatie huis|taxatie woning|taxateur|taxatierapport|koopakte|leveringsakte|waarborgsom|bankgarantie)', '(hypotheek|hypotheken|nhg|nationale hypotheek garantie|leencapaciteit|starterslening)'] },
  // Energie (19 nov 2026, Henkjan: "Check demandradar of we alle content nu rond deze keuzehulpen scoren op de goede woorden"): energieleverancier
  // vergelijken, vast, variabel en dynamisch contract, terugleveren en de leveranciers zelf, voor keuzehulp.best/energieleverancier-vergelijken.
  energie: { naam: 'Energie: leverancier en contract vergelijken', markten: ['NL'], max: 0.4,
    ow: [['dynamisch', /dynamisch|uurprijs|uurtarief|day.?ahead/], ['terugleveren', /terugle|salder|zonnepan/], ['vast en variabel', /\bvast|variabel/], ['vergelijken en overstappen', /vergelijk|overstap|opzeg|goedkoop|beste|welkomst|bonus|wissel/], ['leverancier', /vattenfall|eneco|essent|greenchoice|budget energie|vandebron|tibber|frank energie|energiedirect|oxxio|pure energie|anwb energie|zonneplan|easyenergy|nle|delta|engie|mega energie|coolblue|energyzero|innova|qurrent|samen energie|vrijopnaam|vrij op naam|powerpeers|united consumers/], ['prijzen en tarieven', /prijs|prijzen|tarief|tarieven|kwh|m3|kosten|rekening|plafond|belasting/], ['vragen', /^(hoe|wat|wanneer|waarom|welke|is |kan |mag |hoeveel)/]],
    regex: ['(energieleverancier|energieleveranciers|energiecontract|energiecontracten|energie contract|energie vergelijken|energievergelijker|energie vergelijker|stroom en gas|gas en stroom|stroom vergelijken|gas vergelijken|energietarief|energietarieven|energieprijs|energieprijzen|stroomprijs|stroomprijzen|gasprijs|gasprijzen|dynamisch contract|dynamisch energiecontract|dynamische energie|dynamische stroom|dynamische tarieven|vast contract|variabel contract|vaste energieprijs|overstappen energie|energie overstappen|terugleverkosten|terugleververgoeding|terugleveren|groene stroom|goedkoopste energie|energie opzeggen|energierekening|welkomstbonus energie)', '(vattenfall|eneco|essent|greenchoice|budget energie|vandebron|tibber|frank energie|energiedirect|oxxio|pure energie|anwb energie|zonneplan energie|easyenergy|nle energie|delta energie|engie energie|mega energie|coolblue energie|energyzero|innova energie|qurrent|samen energie|vrijopnaam|powerpeers|united consumers energie)'] },
  // Gokvergunningen van Curaçao (19 nov 2026, Henkjan bij het gokdossier op curacao.day: "Optimaliseer altijd alles via demandradar dus termen
  // erin waarop ook gezocht wordt"): wat spelers, sector en journalisten zoeken over de Curaçaose vergunning, de CGA, klachten en terugvorderen.
  // Kerkdiensten op Curaçao (Henkjan 22 nov 2026: "Maak een pagina voor alle kerkdiensten op curacao en zet deze iedere zondag bovenaan en
  // optimaliseer met demandradar"): mis, dienst, synagoge en moskee met Curaçao erin, voor curacao.day/<taal>/kerkdiensten.
  'curacao-kerkdiensten': { naam: 'Kerkdiensten op Curaçao', markten: ['US', 'NL', 'CO', 'CA', 'DE'], max: 0.4,
    ow: [['katholiek en mis', /\bmass\b|\bmisa|\bmissa|\bmesse\b|catholic|katholi|cat[oó]lic|cathedral|kathedra|catedral|basili|parish|parochie|parroquia/], ['protestant en evangelisch', /protestant|evangel|pentecost|pinkster|adventist|methodist|baptist|fortkerk|fort church|anglican/], ['synagoge', /synagog|snoa|shabbat|sabbath|sjabbat|jewish|joods|jud[ií]/], ['moskee en tempel', /mosque|moskee|mezquita|moschee|temple|tempel|templo|hindu/], ['tijden en zondag', /time|tijd|horario|hora|zeit|sunday|zondag|domingo|sonntag|today|vandaag|hoy|heute/], ['religie algemeen', /religi|church|kerk|iglesia|kirche|culto|gottesdienst|worship/]],
    serp: { US: ['church services curacao', 'catholic church curacao mass times'], NL: ['kerkdienst curacao'], CO: ['misa curazao'] },
    regex: '(cura[cç]ao|curazao|willemstad|otrobanda|punda).*(church|kerk|\\bmass\\b|\\bmisa|\\bmissa|kirche|gottesdienst|\\bmesse\\b|synagog|snoa|mosque|moskee|mezquita|moschee|chapel|kapel|capilla|catholic|cat[oó]lic|katholi|adventist|protestant|evangel|pentecost|pinkster|worship|eredienst|cathedral|kathedra|catedral|basili|religi|iglesia|culto|templo|temple|tempel|parish|parochie|parroquia|shabbat|sabbath)|(church|kerk|\\bmass\\b|\\bmisa|kirche|gottesdienst|synagog|mosque|moskee|mezquita|chapel|catholic|cat[oó]lic|katholi|adventist|protestant|evangel|pentecost|worship|cathedral|kathedra|catedral|basili|religi|iglesia|culto|parish|parochie|parroquia).*(cura[cç]ao|curazao|willemstad)' },
  'curacao-gokvergunning': { naam: 'Gokvergunningen Curaçao (dossier)', markten: ['NL', 'DE', 'GB', 'US', 'AT'], max: 0.45,
    ow: [['vergunning aanvragen', /licen[cs]e|lizenz|vergunning|apply|beantragen|aanvragen|cost|kosten|kosten|price|requirements/], ['toezichthouder', /\bcga\b|gaming authority|gaming control|gcb|antillephone|cyberluck|curacao egaming|gaming curacao|toezicht|regulator|aufsicht/], ['legaal en veilig', /legal|legaal|legit|safe|veilig|seri[oö]s|trusted|betrouwbaar|scam|oplichting|erlaubt/], ['klacht en terugvorderen', /complaint|klacht|beschwerde|refund|terug|zurück|verlust|withdraw|uitbetal|auszahl|lawsuit|claim/], ['nieuwe wet', /\blok\b|new law|nieuwe wet|neues gesetz|2024|2025|2026|reform/]],
    serp: { NL: ['curacao gokvergunning', 'curacao licentie casino'], DE: ['curacao lizenz'], GB: ['curacao gaming licence'], US: ['curacao gaming license'] },
    regex: '(cura[cç]ao|curazao|antillephone|cyberluck).*(licen|lizenz|vergunning|gaming|casino|gambl|glücksspiel|gluecksspiel|gok|kansspel|wett|bet)|(licen|lizenz|vergunning|gaming|casino|gambl|glücksspiel|gok|kansspel).*(cura[cç]ao|curazao)' },
  // Stem- en spreekcoach (19 nov 2026, Henkjan bij het plan voor een online stem- en spreekcoach met Tania Kross: "Is hier zoveel behoefte
  // aan ? Laat zien via demand radar"): zangles, stemtraining, spreken en presenteren, in het Engels, Spaans en Nederlands.
  stemcoach: { naam: 'Stem- en spreekcoach (zang, stem, presenteren)', markten: ['US', 'GB', 'NL', 'ES', 'MX'], max: 0.6,
    ow: [['spreken en presenteren', /public speaking|speaking|presentation|speech|spreek|presenteren|presentatie|openbaar|oratoria|hablar en p/], ['zangles en zangcoach', /sing|vocal|zang|zingen|canto|cantar/], ['stem verbeteren', /voice|stem|voz|deeper/], ['online, app en cursus', /online|\bapp\b|course|cursus|curso|clases/], ['prijs', /price|cost|kosten|prijs|precio|free|gratis/]],
    regex: '(voice coach|vocal coach|voice training|voice lessons|vocal lessons|singing lessons|singing coach|singing teacher|learn to sing|how to sing|singing app|public speaking|speaking coach|presentation skills|presentation coach|speech coach|improve my voice|improve your voice|deeper voice|voice exercises|vocal exercises|stemcoach|spreekcoach|stemtraining|zangles|zangcoach|zangdocent|leren zingen|presentatietraining|presenteren|spreken in het openbaar|clases de canto|aprender a cantar|profesor de canto|coach vocal|coach de voz|entrenador de voz|oratoria|hablar en publico|tecnica vocal|ejercicios de voz)' },
  // Diensten in de buurt, VS (19 nov 2026, Henkjan: "Als je hulp maakt is dat altijd door de pov vd gebruiker = dus zoek termen."): de echte
  // zoektermen voor de beslisgidsen hotel, massage en tandarts op whichtobuy.best (hjdk-api lib/wtb-dienst.js). Drie losse vragen.
  'lokaal-us': { naam: 'Diensten in de buurt VS: hotel, massage, tandarts', markten: ['US'], max: 0.6,
    ow: [['hotel', /hotel|motel|inn\b|lodging/], ['massage', /massage|spa\b/], ['tandarts', /dentist|dental|teeth|tooth/], ['near me en nu', /near me|nearby|open now|tonight|today|24 hour|emergency/], ['prijs', /cheap|price|cost|how much|afford|free|low cost|sliding/], ['verzekering', /insurance|medicaid|medicare|accept|network|delta|cigna|metlife|aetna/], ['vragen', /^(how|what|when|why|is |does|do |can|where|which)/]],
    regex: ['(hotel near me|hotels near me|hotel nearby|hotels nearby|cheap hotels|hotels tonight|hotel tonight|motel near me|motels near me|last minute hotel|hotel deals|book a hotel|hotel booking)', '(massage near me|massage|massage therapist|massage therapy|massage spa)', '(dentist|dentists|dental clinic|dental office|emergency dentist|dental care|dental insurance|teeth cleaning)'] },
  // Advocaten per plaats (19 nov 2026, Henkjan: "Alle advocaten kantoren en / of advocaten in NL !!"): welke steden en rechtsgebieden mensen
  // zoeken, voor keuzehulp.best/advocaat/<plaats> (hjdk-api lib/advocaat.js). Twee losse vragen: advocaat algemeen en per rechtsgebied.
  advocaat: { naam: 'Advocaat per plaats en rechtsgebied', markten: ['NL'], max: 0.6,
    ow: [['arbeidsrecht', /arbeid|ontslag|werkgever|werknemer/], ['familierecht en scheiden', /scheid|familie|alimentatie|omgang|gezag|erf/], ['strafrecht', /straf|politie|verdacht/], ['huurrecht', /huur|verhuur/], ['letselschade', /letsel|ongeval|schade/], ['ondernemingsrecht', /onderneming|bedrijf|contract|incasso/], ['vreemdelingenrecht', /vreemdeling|immigratie|asiel|migratie|verblijf/], ['kosten en gratis', /kost|tarief|gratis|toevoeging|rechtsbijstand|pro deo|uurtarief/], ['beste en goede', /beste|goede|top/]],
    regex: ['(advocaat|advocaten|advocatenkantoor|advocatenkantoren)', '(arbeidsrecht|familierecht|echtscheiding|scheidingsadvocaat|strafrecht|strafpleiter|huurrecht|letselschade|ondernemingsrecht|vreemdelingenrecht|erfrecht|juridisch loket|rechtsbijstand|pro deo advocaat|toevoeging advocaat)'] },
  curacao: { naam: 'Curaçao', regex: '(cura[cç]ao|curazao|kòrsou|korsou|willemstad)', markten: ['US', 'NL', 'DE', 'CA', 'CO', 'BR'] },
  'kadoly-wonen': { naam: 'Kadoly wonen', markten: KADOLY_MARKT, ow: OW_KADOLY,
    regex: '(vaas|vazen|bloempot|plantenpot|sierpot|plantenbak|plantenstandaard|plantenrek|plantentafel|kunstplant|kunstbloem|orchidee|muurcirkel|wandcirkel|wanddecoratie|muurdecoratie|wandkleed|tuinposter|muursticker|tafellamp|hanglamp|leeslamp|oplaadbare lamp|lantaarn|windlicht|kandelaar|geurkaars|windgong|windspinner|bijzettafel|dienblad|plaid|sierkussen|wasmand|opbergmand|rieten mand|diffuser|geurstokjes|tuindecoratie|tuinbeeld)' },
  'kadoly-hobby': { naam: 'Kadoly hobby en seizoen', markten: KADOLY_MARKT, ow: OW_KADOLY,
    regex: '(3d puzzel|houten puzzel|puzzel volwassenen|bouwpakket|legpuzzel|muziekdoos|spaarpot|kerstbal|kerstversiering|kerstdecoratie|kerstkrans|kerststal|kerstboomversiering|schoencadeau|sinterklaascadeau|alpaca sokken|handzeep|scheerset|scheermes|servies|mokken|theepot|wollen deken)' },
  // Hanglampen (18 nov 2026, Henkjan: "maak dit helemaal compleet de gids van kadoly en de keuzehulpen met neutrale info ... betere content met demand radar"):
  // grote rotan hanglampen van Bazar Bizar via Droppery in Kadoly; keuzehulp.best en gids.kadoly.com bouwen op deze vragen.
  hanglamp: { naam: 'Hanglampen: eettafel, groot, rotan', markten: KADOLY_MARKT, max: 0.5,
    ow: [['eettafel en keuken', /eettafel|tafel|keuken|kookeiland|eetkamer/], ['woonkamer en ruimte', /woonkamer|zithoek|slaapkamer|\bhal\b|trap|vide|hoog plafond/], ['rotan en natuur', /rotan|riet|rieten|bamboe|naturel|jute|zeegras|rattan|wicker|papier|houten/], ['groot en xl', /groot|grote|\bxl\b|xxl|extra groot|oversized|\d{2,3} ?cm/], ['maat en hoogte', /hoogte|hoe hoog|afstand|maat|diameter|hoeveel|welke maat|boven tafel/], ['ophangen en fitting', /ophang|aansluit|fitting|snoer|plafond|kroonsteen|e27|lamphouder|plafondkap/], ['stijl en kleur', /industrieel|scandinavisch|modern|landelijk|boho|ibiza|zwart|goud|messing|glas|design|wit|beige/], ['winkel', /ikea|action|kwantum|leen bakker|lampenlicht|lampen24|\bbol\b|xenos|hornbach|praxis|gamma|karwei|jysk|loods 5|vtwonen/], ['merk', /bazar bizar|hkliving|bolia|muuto|louis poulsen|flos|light & living|light and living|lucide|kave/]],
    regex: '(hanglamp|hanglampen|hang lamp|plafondlamp|eettafellamp|eettafel lamp|lamp boven eettafel|lampen boven eettafel|rotan lamp|rotanlamp|rieten lamp|bamboe lamp|rattan lamp|xl lamp|grote lamp|lampenkap groot|grote lampenkap|bazar bizar)' },
  // Meubels (21 nov 2026, Henkjan: "Zet alles van droppery in de winkel. En maak er de juiste content bij ... doe alles met demandradar"):
  // Modus Furniture via Droppery in Kadoly (eettafels, dressoirs, tv-meubels, ladekasten, console- en salontafels, bedden) en de kamado;
  // de keuring van Droppery-producten (hjdk-api lib/dpkeur.js) en de gidsen op gids.kadoly.com bouwen op deze vragen.
  meubels: { naam: 'Meubels: eettafel, dressoir, tv-meubel, bed', markten: KADOLY_MARKT, max: 0.5,
    ow: [['eettafel', /eettafel|eetkamertafel|uitschuif|eettafels/], ['dressoir en ladekast', /dressoir|ladekast|commode|kast/], ['tv-meubel', /\btv\b|tv-|media/], ['console en salontafel', /console|side ?table|wandtafel|haltafel|salontafel/], ['bed', /bed/], ['kamado en barbecue', /kamado|barbecue|bbq/], ['materiaal', /marmer|eiken|essen|acacia|steen|keramiek|glas|massief|hout|rvs|metaal/], ['vorm en maat', /rond|rechthoek|ovaal|\d+ ?cm|\d+x\d+|persoons|groot|klein|smal|breed/], ['stijl', /japandi|scandinavisch|industrieel|modern|landelijk|design|luxe/]],
    regex: '(eettafel|eettafels|eetkamertafel|uitschuifbare eettafel|uitschuiftafel|marmeren tafel|dressoir|dressoirs|ladekast|ladekasten|commode|tv meubel|tv-meubel|tvmeubel|tv kast|tv-kast|mediameubel|consoletafel|side table|sidetable|wandtafel|haltafel|salontafel|salontafels|platformbed|tweepersoonsbed|bedframe|houten bed|bed 160x200|bed 180x200|kamado|keramische barbecue|japandi)' },
  // Sieraden (21 nov 2026, Henkjan: "Zit er veel jewelry tussen ik wil daarvoor gaan met de kerst" en "Maak de pagina in ieder geval al met demandradar optimaliseren"):
  // Orderchamp-dropshipmerken (LanLivia, Lisberg, Luxaa, GLAM & GLORY, Menthe à l'eau-horloges) voor Kadoly en gids.kadoly.com.
  sieraden: { naam: 'Sieraden en horloges: cadeau, naam, zilver, goud', markten: KADOLY_MARKT, max: 0.5,
    ow: [['naam en gepersonaliseerd', /naam|letter|initia|graveer|gepersonali|eigen tekst|datum|coordina/], ['ketting', /ketting|collier|hanger/], ['armband', /armband|bangle|tennis/], ['oorbellen', /oorbel|creool|oorring|oorknop|oorsteker/], ['ring', /ring/], ['horloge', /horloge/], ['materiaal', /zilver|925|goud|verguld|plated|rvs|staal|edelsteen|parel|moissanite|diamant|titanium/], ['voor wie', /vrouw|dames|moeder|mama|vriendin|zus|oma|heren|man|hem|kind|meisje/], ['cadeau en moment', /cadeau|kado|kerst|sinterklaas|verjaardag|valentijn|jubileum/], ['prijs en winkel', /goedkoop|onder|euro|sale|korting|kopen|winkel|online/]],
    regex: '(sieraden|sieraad|ketting|kettingen|armband|armbanden|oorbellen|oorbel|creolen|ringen|ring dames|ring zilver|ring goud|naamketting|ketting met naam|armband met naam|gepersonaliseerde ketting|gepersonaliseerde armband|gepersonaliseerde sieraden|letterketting|initiaal ketting|graveren sieraad|zilveren ketting|gouden ketting|tennisarmband|parel oorbellen|moissanite|herenhorloge|horloge heren|dameshorloge|horloge dames)' },
  // Spiritueel (21 nov 2026, Henkjan: "Wat vindt je van AW dropship meer spiritueel wat is demand daar ?"): vraag naar stenen, wierook, klankschalen,
  // beelden, tarot, aroma en zoutlampen voor een mogelijke leverancier AW Dropship (Ancient Wisdom) in Kadoly.
  spiritueel: { naam: 'Spiritueel en aroma: stenen, wierook, klankschaal', markten: KADOLY_MARKT, max: 0.5,
    ow: [['stenen en kristallen', /steen|stenen|kristal|kwarts|amethist|citrien|toermalijn|obsidiaan|labradoriet|selenite|geode/], ['wierook en salie', /wierook|salie|smudge|palo santo|hars/], ['klank', /klankschaal|zingende schaal|gong|klankschalen/], ['beelden', /boeddha|buddha|beeld|ganesha/], ['kaarten', /tarot|orakel|kaarten/], ['meditatie en yoga', /meditatie|yoga|mala|kussen/], ['aroma en olie', /etherische|olie|aroma|diffuser|brander|badbom|zeep/], ['zoutlamp', /zoutlamp|himalaya/], ['cadeau', /cadeau|kado|geschenk/]],
    regex: '(wierook|wierookstokjes|wierookhouder|edelsteen|edelstenen|bergkristal|rozenkwarts|amethist|kristallen|healing stenen|chakra|reiki|zingende schaal|klankschaal|klankschalen|tibetaanse klankschaal|boeddha beeld|boeddhabeeld|buddha beeld|witte salie|smudge|palo santo|tarotkaarten|tarot kaarten|orakelkaarten|droomvanger|meditatiekussen|mala ketting|pendel|etherische olie|etherische oliën|aromatherapie|badbommen|zoutlamp|himalaya zoutlamp|oliebrander|geurbrander|spirituele cadeaus|spiritueel cadeau)' },
  // Wellness thuis (18 nov 2026, Henkjan: "Ok we doen eerst europa ... Kijk goed naar demand radar . En zet de goede content erbij"):
  // buitensauna's en hottubs (Baltresto) en massagestoelen (Rest Lords), high ticket met ± €1.000 marge, voor keuzehulp.best en gids.kadoly.com.
  wellness: { naam: 'Wellness thuis: sauna, hottub, massagestoel', markten: ['NL', 'BE', 'DE'], max: 0.8,
    ow: [['barrel en buiten', /barrel|ton ?sauna|tonsauna|fass ?sauna|fasssauna|buitensauna|buiten sauna|tuinsauna|tuin sauna|gartensauna|garten sauna|außensauna|aussensauna|outdoor/], ['infrarood', /infra ?rood|infrarood|infrarot|ir ?cabine|ir ?kabine|warmtecabine|wärmekabine/], ['sauna binnen', /binnensauna|sauna binnen|sauna badkamer|sauna zolder|sauna kelder|innensauna|heimsauna|sauna im haus/], ['kachel en hout', /kachel|houtgestookt|houtkachel|elektrische kachel|ofen|holz|harvia|huum|thermowood|thermo ?hout|ceder|zeder|fichte|vuren|grenen/], ['hottub en jacuzzi', /hottub|hot tub|jacuzzi|whirlpool|bubbelbad|badetonne|hot ?pot|spa /], ['ijsbad', /ijsbad|ice ?bath|eisbad|cold plunge|dompelbad|tauchbecken/], ['massagestoel', /massagestoel|massage stoel|massagesessel|massage sessel|relaxstoel met massage|irest|massaggio|fujiiryoki|osaki|keyton/], ['kosten en stroom', /kost|prijs|preis|stroom|stroomverbruik|verbrauch|kwh|krachtstroom|380|400 ?v|starkstrom|goedkoop|günstig|aanbieding|angebot/], ['plaatsen en vergunning', /vergunning|plaatsen|fundering|ondergrond|tegels|genehmig|fundament|aufstellen|montage|bouwpakket|bausatz/], ['gezondheid', /gezond|gezondheid|voordel|effect|spier|slaap|hart|bloeddruk|gesund|wirkung|vorteil|immuun/], ['winkel en merk', /baltresto|toppy|welvaere|saunamo|karibu|weka|finnsa|interflex|saunalux|lugarde|azalp|bol|lidl|aldi|action|praxis|gamma|hornbach|obi|bauhaus|intergamma|wellis|rest lords|jysk/], ['vragen', /^(hoe|wat|wanneer|waarom|is |heeft|welke|kan |mag |wie |wo |was |wie viel|welche|lohnt|ist |kann )/]],
    serp: { NL: ['barrelsauna', 'buitensauna kopen', 'massagestoel kopen'], DE: ['fasssauna', 'gartensauna kaufen'] },
    regex: '(sauna|saunas|tonsauna|barrelsauna|fasssauna|buitensauna|tuinsauna|gartensauna|außensauna|aussensauna|infraroodcabine|infrarood cabine|infrarotkabine|infrarot kabine|warmtecabine|wärmekabine|saunakachel|saunaofen|hottub|hot tub|jacuzzi|whirlpool garten|whirlpool outdoor|badetonne|bubbelbad|ijsbad|eisbad|cold plunge|dompelbad|massagestoel|massage stoel|massagesessel|massage sessel|irest|massaggio)' },
  'kadoly-cadeau': { naam: 'Kadoly cadeauvragen', markten: KADOLY_MARKT, ow: OW_KADOLY,
    regex: '(cadeau|kado|cadeautje|kadootje|geschenk|presentje|cadeaubox|giftset)' },
  // kaufberater.best dienstgidsen (19 nov 2026, AI-gaten zonder eerste keus): Führerschein, Tagesgeld, Anwalt, Reinigung. Alleen DE.
  'kaufberater-dienste': { naam: 'Kaufberater Dienste: Führerschein, Tagesgeld, Anwalt, Reinigung', markten: ['DE'], max: 0.45,
    regex: '(führerschein|fuehrerschein|fahrschule|theorieprüfung|theorie app|tagesgeld|festgeld|anwalt|rechtsanwalt|fachanwalt|erstberatung|beratungshilfe|rechtsschutz|reinigung|textilreinigung|wäscherei|waescherei)' },
  // Groepscadeaus op gids.kadoly.com (Henkjan 21 nov 2026: "vind demandradar hiervoor en maak de paginas in de gids": een pagina per moment,
  // zoals cadeau voor de juf of afscheidscadeau collega, met een knop "Start een groepscadeau"). Momenten waarop een groep samen geeft. NL en BE.
  'kadoly-samen': { naam: 'Kadoly groepscadeaus: juf, collega, afscheid, pensioen, trainer', markten: KADOLY_MARKT, max: 0.4,
    ow: [['school en opvang', /juf|juffen|meester|leerkracht|leraar|lerares|kinderopvang|leidster|klas|school|peuter|kinderdagverblijf|kdv|bso/], ['werk', /collega|afscheid|pensioen|werk|baas|manager|jubileum/],
      ['club en vrijwilligers', /trainer|coach|voorzitter|vrijwilliger|club|vereniging|team/], ['samen geven', /groep|samen|namens|inzamel/], ['bedanken', /bedank/], ['mijlpalen', /abraham|sarah|50 jaar|65 jaar|jarig/]],
    regex: '(juf|juffen|juffendag|meester|meesterdag|leerkracht|leraar|lerares|kinderopvang|leidster|collega|afscheid|pensioen|jubileum|trainer|coach|voorzitter|vrijwilliger|groepscadeau|namens de klas|namens klas|abraham|sarah|bedankje|bedank).*(cadeau|kado|cadeautje|attentie|presentje)|(cadeau|kado|cadeautje|attentie|presentje).*(juf|juffen|meester|leerkracht|leraar|lerares|kinderopvang|leidster|collega|afscheid|pensioen|jubileum|trainer|coach|voorzitter|vrijwilliger|namens|groep)|(afscheidscadeau|pensioencadeau|jubileumcadeau|groepscadeau|bedankcadeau|juffendag cadeau)' },
  // Henkjan 22 nov 2026: "Samen sparen moet het heten ... zoek alles met demandradar over sparen en kijk wat relevant is"
  'kadoly-sparen': { naam: 'Kadoly Samen sparen: sparen, spaaracties, punten, cashback en tegoed', markten: KADOLY_MARKT, max: 0.4,
    ow: [['samen sparen', /samen|groep|vrienden|familie|collega|klas|club/], ['supermarkt en spaaracties', /zegel|koopzegel|spaaractie|spaarkaart|spaarpunten|punten|airmiles|air miles|bonus|albert heijn|\bah\b|jumbo|lidl|plus|kruidvat|etos|douwe egberts|shell|esso|hema|blokker|action/], ['cashback en tegoed', /cashback|tegoed|geld terug|korting|voucher|cadeaukaart|giftcard/], ['sparen voor iets', /sparen voor|voor een|cadeau|kado|vakantie|spaardoel|auto|huis|bruiloft|kerst|sinterklaas/], ['kinderen', /kind|kinderen|zakgeld|spaarvarken|spaarpot|tiener|jongeren/], ['tips en methodes', /tips|challenge|methode|potjes|envelop|budget|besparen|52 weken|no spend/], ['bank en rente', /rente|spaarrekening|bank|deposito|beleggen|spaarrente|ing|rabo|abn|asn|bunq|knab/]],
    regex: '(sparen|spaar|zegels|koopzegel|airmiles|air miles|cashback|tegoed|samen kopen|groepskorting|vriendenkorting|vrienden korting)' },
  // bookstuffers.com (22 nov 2026, Henkjan: "Voer je plan uit ... Optimaliseer TOTAAL met demand radar"): de eigen plank met kleine
  // cadeauboeken (stocking stuffers, white elephant). Wat mensen vragen rond prijsgrens, spelregels, gratis printables, moppen en feiten,
  // zodat de plank weggeeft waar vraag naar is. Via gratis suggesties (± $0,08).
  bookstuffers: { naam: 'Bookstuffers: kleine cadeauboeken en gratis printables', markten: ['US'], max: 0.3, bron: 'suggest',
    ow: [['ruis', /lyrics|song|movie|film|cast|episode|nyt|new york times|washington post|usa today|solver|answers|netflix|hulu/], ['spelregels', /rules|how to play|generator|numbers|dirty santa|yankee swap|game/], ['prijsgrens', /under|\$|dollar|cheap|budget/], ['printables', /printable|free|pdf/], ['puzzels', /word search|wordsearch|sudoku|crossword/], ['kleurplaten', /coloring|colouring/], ['moppen', /joke|pun|riddle/], ['feiten', /fact|trivia/], ['notitieboeken', /password|journal|logbook|planner/], ['voor wie', /for (men|women|him|her|dad|mom|adults|kids|teens|coworkers|boss|guys|seniors|grandpa|grandma)|coworker|office/], ['white elephant', /white elephant/], ['stocking stuffers', /stocking stuffer/], ['cadeauboek', /book/]],
    serp: { US: ['white elephant rules', 'white elephant gifts under 10', 'stocking stuffers under 5', 'christmas word search printable', 'fun fact of the day', 'christmas dad jokes'] },
    zaden: ['white elephant gifts under', 'white elephant rules', 'white elephant generator', 'stocking stuffers under', 'stocking stuffer ideas for', 'stocking stuffer books', 'funny books for adults', 'christmas word search', 'large print word search', 'printable word search', 'christmas sudoku', 'christmas coloring pages', 'free printable coloring pages', 'christmas jokes', 'fun fact of the day', 'christmas trivia', 'gifts for book lovers'],
    regex: '(white elephant|dirty santa|yankee swap|stocking stuffer|gag gift|funny book|bathroom book|word search|sudoku|coloring page|dad joke|christmas joke|fun fact|trivia|password book|manifestation journal|book lover|gift book)' },
  // Lasting Change op bookstuffers.com (22 nov 2026, Henkjan: "aparte pagina ... voor mensen die helemaal geen flikker gedaan hebben en nu
  // wel dit komend jaar willen scoren"): wat mensen typen rond een verloren jaar, voornemens, uitstel en opnieuw beginnen.
  'jaar-reset': { naam: 'Lasting Change: dit jaar niets gedaan, volgend jaar wel', markten: ['US'], max: 0.25, bron: 'suggest',
    ow: [['ruis', /lyrics|song|movie|film|meme|gif|wallpaper|cast|episode/], ['voornemens', /resolution|new year|2027/], ['spijt en opnieuw beginnen', /wasted|regret|behind in life|too late|start over|fresh start|life together/], ['uitstel en luiheid', /procrastinat|lazy|motivation|disciplin/], ['gewoontes', /habit|consisten|routine/], ['doelen', /goal|vision board/], ['werkboek en boeken', /workbook|book|journal|planner/], ['leven veranderen', /change (your|my) life|self improvement|better person/]],
    serp: { US: ['how to stick to new years resolutions', 'how to get your life together', 'habit workbook', 'i wasted another year', 'how to stop procrastinating'] },
    zaden: ['new year resolutions', 'how to stick to new years resolutions', 'how to get your life together', 'how to stop procrastinating', 'how to stop being lazy', 'how to be consistent', 'how to build habits', 'i wasted another year', 'i wasted my life', 'how to start over', 'best books to change your life', 'goal setting workbook', 'how to be disciplined', '2027 goals'],
    regex: '(new year|resolution|change your life|change my life|life together|procrastinat|being lazy|consisten|habit|wasted|fresh start|goal setting|self improvement|start over|no motivation|disciplin|2027 goals|workbook)' },  // We are many now (23 nov 2026, Henkjan: "Zoek in demandradar wat er werkelijk kut is en waar naar gezocht wordt in NL", "Maak thema nu
  // aan"): bij welke bedrijven mensen willen opzeggen, klagen, terugboeken of geld terugvragen. Precies acht zaden, zodat de gratis route
  // (hooguit 280 vragen) voor elk zaad het hele alfabet haalt en zo de bedrijfsnamen vindt (opzeggen a..z, klacht a..z). Geen eigen zaden.
  machteloos: { naam: 'We are many now: opzeggen, klacht, incasso en geld terug per bedrijf', markten: ['NL'], max: 0.3, bron: 'suggest', partijen: 3, vrij: '2026-11-23', // Henkjan 23 nov: "JA overrul budget regel"
    ow: [['ruis', /ontslag|arbeids|werkgever|\bbaan\b|huurcontract|huurhuis|huurwoning|betekenis|engels|vertaal|synoniem|puzzel|kruiswoord|lyrics|film|overgang|burn.?out|bloeddruk|ontsteking|virus|zwanger|schildklier|maag|darm|\brug\b|\bnek\b|\bhart|long|galblaas|galstenen|nier|hernia|menstruatie|vitamine|corona|griep|hoofdpijn|pijn|tekort|allergie|diabetes|artrose|reuma|hooikoorts|stress|lichamelijk|psychisch|symptomen|ziekte|medicijn|spiraal|prikkelbare|gourmetten|gezondheid|adhd|autisme|kanker|prostaat|lever|alvleesklier|bekken|schouder|knie|heup|oog|oren|keel|hyperventilatie|anemie|ijzer|b12|magnesium|kalium|cortisol|oestrogeen|testosteron/], // 23 nov: 'klachten' vangt ook lichamelijke klachten; die kopen we niet
      ['overheid en zorg', /politie|gemeente|huisarts|ziekenhuis|tandarts|belastingdienst|uwv|cjib|\bduo\b|\bsvb\b|ombudsman/],
      ['telecom en tv', /kpn|ziggo|odido|vodafone|t-mobile|tele2|simpel|\bben\b|lebara|youfone|delta|videoland|viaplay|netflix|spotify|disney|dazn|hbo|prime|youtube/],
      ['vervoer en reizen', /\bns\b|ov.?chip|arriva|klm|transavia|ryanair|easyjet|\btui\b|corendon|booking|vlucht|vertraging|flixbus|swapfiets|anwb/],
      ['pakket en winkel', /postnl|dhl|dpd|\bbol\b|coolblue|zalando|wehkamp|amazon|temu|shein|vinted|marktplaats|ikea|mediamarkt|albert heijn|jumbo|hellofresh|picnic/],
      ['sport en loterij', /basic.?fit|sportschool|fitness|sportcity|anytime|trainmore|loterij|toto/],
      ['energie en verzekering', /energie|eneco|essent|vattenfall|greenchoice|verzekering|zilveren kruis|\bcz\b|vgz|menzis|centraal beheer|interpolis/],
      ['bank en betalen', /\bing\b|rabobank|\babn\b|\bsns\b|bunq|knab|klarna|riverty|afterpay|paypal|creditcard/],
      ['hosting en software', /mijndomein|strato|vimexx|transip|hostnet|yourhosting|microsoft|adobe|google|apple|icloud|chatgpt|canva|blendle/],
      ['incasso en terugboeken', /incasso|storner|terugboek|aanmaning|deurwaarder/], ['geld terug', /geld terug/], ['klacht', /klacht/], ['opzeggen', /opzeggen|stilzwijgend/]],
    regex: '(opzeggen|klacht|incasso|geld terug|storneren|terugboeken|stilzwijgend|aanmaning)' },
  // Muziek als medicijn (24 nov 2026, Henkjan: "Maak mbhv demandradar en de AI gaten een muziek als medicijn dossier wat helemaal compleet is"
  // en "Demandradar kun je nu inzetten"): wat mensen zoeken over muziek en gezondheid, voor het dossier op taniakross.media (NL en EN).
  // Nexy-app (nexy.now, repo clickmind-distribution), 24 nov 2026, Henkjan: "Kijk met demandadar icm je nexy MD wat we gaan posten" en "Niet meer op India maar op US en EU".
  // Vragen van gezinnen, ouders en mensen die privé bellen of vergaderen aan tafel; de algemene AI-vragen zitten in ai-keuze (nexy.help).
  'nexy-now': { naam: 'Nexy-app: gezin, groepen, bellen, notulen (nexy.now)', markten: ['US', 'GB'], max: 0.25, bron: 'suggest', vrij: '2026-11-24',
    ow: [['ruis', /lyrics|login|sign in|customer service number|apk|mod|crack|torrent/],
      ['gezin en planning', /family|famil|organizer|planner|calendar|chore|kids|parent|school|carpool/], ['herinneringen delen', /remind|shared list|to do|todo|task/],
      ['bellen en antwoorden', /call|phone|answer|voicemail|screen|receptionist|missed/], ['notulen en vergaderen', /note taker|notes|minutes|meeting|transcri|record/],
      ['groepschat', /group chat|groupchat|whatsapp group|group text|imessage group/]],
    zaden: ['family organizer app', 'shared reminders app', 'carpool app for parents', 'school calendar app', 'ai note taker', 'call recorder app', 'ai answering service', 'call screening app', 'group chat organizer', 'family calendar app'],
    regex: '(family (organizer|planner|calendar|app)|shared (reminder|calendar|to do|list)|carpool|school (calendar|newsletter|emails)|note taker|meeting (notes|minutes)|call (recorder|summary|screening|screener)|answering (service|app)|missed call|voicemail|group chat|chore app|reminder app)' },
  'muziek-medicijn': { naam: 'Muziek als medicijn (dossier taniakross.media)', markten: ['NL', 'BE', 'US', 'GB'], max: 0.45, bron: 'suggest', vrij: '2026-11-24', // Henkjan 24 nov: "Demandradar kun je nu inzetten"
    ow: [['ruis', /lyrics|chords|akkoorden|karaoke|songtekst|tekst van|ringtone|download|mp3|guitar|gitaar|piano sheet|bladmuziek|festival|concert ticket/],
      ['dementie en geheugen', /dementie|alzheimer|geheugen|dementia|memory/], ['pijn en operatie', /pijn|operatie|ziekenhuis|herstel|pain|surgery|hospital|recovery|chemo|kanker|cancer/],
      ['slaap', /slaap|slapen|sleep|insomnia/], ['stress, angst en stemming', /stress|angst|depress|somber|ontspan|rust|anxiety|relax|calm|mood|mental/],
      ['hersenen en parkinson', /hersen|brain|parkinson|beroerte|stroke|afasie|aphasia|autis|adhd|neuro/], ['zingen', /zing|zang|koor|sing|choir|voice/],
      ['therapie', /therap|therapeut|music therapist|opleiding|training|cursus/], ['baby en kind', /baby|prematu|zwanger|pregnan|kind|child|kids/],
      ['klank en frequentie', /hz|binaural|klankschaal|sound bath|sound healing|frequen|solfeggio/]],
    zaden: ['muziek als medicijn', 'muziektherapie', 'muziek en dementie', 'muziek tegen pijn', 'zingen is gezond', 'muziek om te slapen', 'muziek bij parkinson', 'muziek en gezondheid', 'muziek tegen stress', 'muziek in het ziekenhuis',
      'music as medicine', 'music therapy', 'music and dementia', 'music for pain', 'benefits of singing', 'music for sleep', 'music and parkinsons', 'music and health', 'music for anxiety', 'music in hospitals'],
    regex: '(muziektherap|music therap|muziek als medicijn|music as medicine|muziek en gezondheid|music and health|helende muziek|healing music|sound healing|klankschaal|binaural|benefits of singing|zingen is gezond|zingen gezond|muziek (bij|tegen|voor|en|om) |music (for|and|in|to help|helps|therapy) |(dementie|alzheimer|parkinson|pijn|slaap|stress|angst|depressie|ziekenhuis|operatie) (en )?muziek|(dementia|alzheimer|parkinson|pain|sleep|stress|anxiety|depression|hospital|surgery) (and )?music)' },
};

// Henkjan 16 nov 2026: Sealed Intent totaalassessment; onderzoeksbudget expliciet toegestaan.
// Twee begrensde aankopen, 7 dagen hergebruiken; geen unieke mensen of bewezen vraagdekking claimen.
THEMA['sealed-beslismomenten'] = { naam: 'Sealed Intent: voorwaarden en beslismomenten', markten: ['NL', 'DE', 'US', 'GB', 'CA', 'AU'], max: 0.95,
  regex: '(bedrijfsopvolging|bedrijf verkopen|investeerder zoeken|aandelen verkopen|management buyout|management buy in|praktijk verkopen|exit planning|succession planning|sell my business|sell my company|unsolicited offer|business broker fees|earnout|earn out|letter of intent business|sell dental practice|sell medical practice|find investors|investor for my business|confidential job search|executive outplacement|non executive director|board positions|interim executive|unternehmen verkaufen|unternehmensnachfolge|firma verkaufen|minderheitsbeteiligung|nachfolger gesucht|arztpraxis verkaufen|investor finden|diskrete jobsuche|aufsichtsrat werden|beirat werden|interim management)' };
THEMA['sealed-talen'] = { naam: 'Sealed Intent: Franse, Spaanse en Italiaanse vraag', markten: ['FR', 'ES', 'IT'], max: 0.55,
  regex: '(cession entreprise|vendre entreprise|vendre mon entreprise|transmission entreprise|reprise entreprise|cession cabinet|cession parts sociales|recherche investisseur|chasseur de têtes|outplacement dirigeant|administrateur indépendant|transition professionnelle dirigeant|vender mi empresa|venta de empresas|traspaso negocio|sucesión empresarial|buscar inversores|headhunter|outplacement|consejero independiente|vendere azienda|cessione azienda|passaggio generazionale|vendita quote|cercare investitori|ricerca dirigenti|amministratore indipendente)' };

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

// 20 nov 2026 (plan onderdeel 8, fase 1; Henkjan: "JA ga op zoek naar data"): thema's zonder Labs-toplijst ($0,30-0,90 per thema).
// Termen verzamelen uit gratis suggesties (Google en Bing, wat mensen intypen), filteren met de regex van het thema, daarna één partij
// zoekvolumes per markt (Google Ads, hooguit 1.000 termen in één taak, ± $0,075). ?bron=suggest&droog=1 koopt niets en laat zien
// hoeveel termen de gratis route vindt en welk deel van de bestaande top-200 (Labs) erbij zit; zo toetsen we eerst per thema.
const HL = { NL: 'nl', BE: 'nl', SR: 'nl', DE: 'de', AT: 'de', CH: 'de', US: 'en', GB: 'en', CA: 'en', AU: 'en', CO: 'es', DO: 'es', PA: 'es', MX: 'es', ES: 'es', BR: 'pt', FR: 'fr' };
export function zaden(T) {
  const uitRegex = [].concat(T.regex || []).flatMap(r => String(r).replace(/^\(|\)$/g, '').split('|'));
  return [...new Set([].concat(T.zaden || [], uitRegex).map(x => String(x).replace(/\[([^\]])[^\]]*\]/g, '$1').replace(/\\[bsdw]|[\\^$()?*+[\]{}.]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()).filter(x => x.length >= 3))];
}
async function suggestBron(q, cc) {
  const hl = HL[cc] || 'en', ua = { 'user-agent': 'Mozilla/5.0 (compatible; DemandRadar/1.0)' };
  const g = fetch(`https://suggestqueries.google.com/complete/search?client=firefox&ie=utf-8&oe=utf-8&hl=${hl}&gl=${cc.toLowerCase()}&q=${encodeURIComponent(q)}`, { headers: ua, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : null).then(j => (j && j[1]) || []).catch(() => []);
  const bg = fetch(`https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}&market=${hl}-${cc}`, { headers: ua, signal: AbortSignal.timeout(8000) }).then(r => r.ok ? r.json() : null).then(j => (j && j[1]) || []).catch(() => []);
  return [...await g, ...await bg].map(x => String(x).toLowerCase().trim()).filter(Boolean);
}
const VOOR = { en: ['what is', 'where is', 'how to', 'how much', 'best', 'is', 'can i', 'why', 'when', 'blue'], nl: ['wat is', 'waar', 'hoe', 'wat kost', 'beste', 'kan ik', 'waarom', 'wanneer'], de: ['was ist', 'wo', 'wie', 'was kostet', 'beste', 'kann man', 'warum', 'wann'], es: ['qué es', 'dónde', 'cómo', 'cuánto cuesta', 'mejor', 'por qué'], pt: ['o que é', 'onde', 'como', 'quanto custa', 'melhor', 'por que'], fr: ['qu est ce que', 'où', 'comment', 'combien coûte', 'meilleur'] };
export const kaal = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
export async function verzamel(T, cc, { max = 280, conc = 6 } = {}) {
  const z = zaden(T), qs = [...z], hl = HL[cc] || 'en';
  for (const v of VOOR[hl] || VOOR.en) for (const s of z) qs.push(v + ' ' + s);
  for (const l of 'abcdefghijklmnopqrstuvwxyz') for (const s of z) qs.push(s + ' ' + l);
  const lijst = qs.slice(0, max), gevonden = new Set(); let i = 0, vragen = 0, leeg = 0;
  await Promise.all(Array.from({ length: conc }, async () => { while (i < lijst.length) { const q = lijst[i++]; const r = await suggestBron(q, cc); vragen++; if (!r.length) leeg++; for (const x of r) gevonden.add(x); } }));
  const re = new RegExp([].concat(T.regex).join('|'), 'i');
  return { termen: [...gevonden].filter(x => re.test(x)), vragen, leeg, zaden: z.length };
}
async function viaSuggesties(T, id, oud, droog, alleen) {
  const markten = {}, toets = {}, b = budget(+(T.max || process.env.ZV_MAX || 0.6));
  if (T.vrij) b.vrij = T.vrij; // eenmalige vrijstelling van de dagrem op Henkjans woord (zie lib/dfs.js), alleen op die UTC-dag
  for (const cc of T.markten) {
    if (alleen && cc !== alleen) continue;
    const v = await verzamel(T, cc);
    const top = ((oud && oud.markten && oud.markten[cc] && oud.markten[cc].termen) || []).slice().sort((a, c) => (c.v || 0) - (a.v || 0)).slice(0, 200).map(x => x.k);
    const set = new Set(v.termen.map(kaal)), oudeTop = ((oud && oud.markten && oud.markten[cc] && oud.markten[cc].termen) || []).slice().sort((a, c) => (c.v || 0) - (a.v || 0)).slice(0, 200);
    const volTot = oudeTop.reduce((a, x) => a + (x.v || 0), 0), volVond = oudeTop.filter(x => set.has(kaal(x.k))).reduce((a, x) => a + (x.v || 0), 0);
    toets[cc] = { kandidaten: v.termen.length, suggestieVragen: v.vragen, zonderAntwoord: v.leeg, zaden: v.zaden, ...(top.length ? { labsTop200: top.length, daarvanGevonden: top.filter(k => set.has(kaal(k))).length, volumeGevondenPct: volTot ? Math.round(volVond / volTot * 100) : null, gemist: top.filter(k => !set.has(kaal(k))).slice(0, 15) } : {}) };
    if (droog) { toets[cc].voorbeeld = v.termen.slice(0, 25); continue; }
    const [loc, lang] = M[cc];
    const kopen = v.termen.filter(k => onderwerp(k, T.ow) !== 'ruis'); // merken, series en spellen niet betalen
    const vol = {}; // hooguit 1.000 termen per taak (± $0,075); een thema met `partijen` koopt er meer, binnen zijn eigen plafond
    for (let i = 0; i < kopen.length && i < (T.partijen || 1) * 1000; i += 1000) Object.assign(vol, await searchVolume(kopen.slice(i, i + 1000), { loc, lang }, b, { months: 24 }));
    const termen = Object.entries(vol).filter(([, x]) => (x.volume || 0) >= 20).map(([k, x]) => { const m = (x.monthly || []).map(z => z.v); return { k, v: x.volume, y: m.length >= 13 && m[12] ? Math.round((m[0] / m[12] - 1) * 100) : null, i: null, c: x.cpc, cp: x.competition, o: onderwerp(k, T.ow), m: m.slice(0, 12) }; }).sort((a, c) => c.v - a.v);
    markten[cc] = { taal: lang, termen, bron: 'suggest' };
  }
  return { markten, toets, kosten: Math.round(b.spent * 1000) / 1000, fouten: b.errors.slice(0, 5) };
}

export default async function handler(req, res) {
  if (req.query.niche) return nicheScan(req, res);
  const id = String(req.query.thema || '').toLowerCase(), T = THEMA[id];
  if (!T) return res.status(400).json({ error: 'onbekend thema', themas: Object.keys(THEMA) });
  const store = getStore(), pad = `zoekvraag/${id}.json`, oud = await getJSON(store, pad, null);
  let uit = oud;
  const bron = String(req.query.bron || T.bron || 'labs');
  if (bron === 'suggest' && req.query.droog === '1') { const r = await viaSuggesties(T, id, oud, true, String(req.query.cc || '').toUpperCase()); return res.status(200).json({ thema: id, bron, droog: true, toets: r.toets }); }
  const nieuweVersie = T.v && (oud && oud.v) !== T.v && new Date().toISOString().slice(0, 10) >= (T.vanaf || '');
  if (!oud || nieuweVersie || Date.now() - (oud.t || 0) > 7 * 864e5) {
    const b = budget(+(T.max || process.env.ZV_MAX || 0.6)), markten = {};
    if (bron === 'suggest') { const r = await viaSuggesties(T, id, oud, false, ''); Object.assign(markten, r.markten); b.spent += r.kosten; b.errors.push(...r.fouten); }
    else for (const cc of T.markten) {
      const [loc, lang] = M[cc];
      const seen = new Set(), items = [];
      for (const re of [].concat(T.regex).flatMap(r => splitRegex(r))) for (const x of await topSearches({ loc, lang }, b, { by: 'volume', anyGrowth: true, minVolume: 20, limit: 700, regex: re, intent: null }).catch(() => [])) if (!seen.has(x.k)) { seen.add(x.k); items.push(x); }
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
  return res.status(200).json({ thema: uit.thema, naam: uit.naam, bijgewerkt: new Date(uit.t).toISOString(), kosten: uit.kosten, fouten: uit.fouten || [], verwachteMarkten: T.markten, ontbrekendeMarkten: T.markten.filter(c => !(uit.markten[c]?.termen?.length)), volumeNoot: 'Schattingen per zoekterm en markt; synoniemen overlappen. Een ontbrekende term of markt bewijst geen nulvraag.', ...(quality ? {quality} : {}), ...(uit.serp ? { serp: uit.serp } : {}), onderwerpen: Object.fromEntries(Object.entries(per).sort((a, b) => b[1].v - a[1].v)), ...(cc && uit.markten[cc] ? { markt: { cc, ...uit.markten[cc] } } : { markten: Object.fromEntries(Object.entries(uit.markten).map(([k, m]) => [k, { taal: m.taal, n: m.termen.length, top: m.termen.slice(0, 60) }])) }) });
}

