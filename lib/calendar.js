// Vraagkalender: koopmomenten, feestdagen en regelgeving per markt, met het moment waarop de zoekvraag
// meestal begint te stijgen (lead = aantal dagen vóór de datum). Datums worden per jaar uitgerekend.
const DAY = 864e5;
const D = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const add = (d, n) => new Date(d.getTime() + n * DAY);
const onOrAfter = (d, wd) => add(d, (wd - d.getUTCDay() + 7) % 7);
const nth = (y, m, wd, n) => add(onOrAfter(D(y, m, 1), wd), 7 * (n - 1));

export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return D(y, mo, da);
}

const ALL = ['NL', 'US', 'DE', 'WW'];

export function moments(y) {
  const e = easter(y), tg = nth(y, 11, 4, 4);
  const kd = D(y, 4, 27).getUTCDay() === 0 ? D(y, 4, 26) : D(y, 4, 27);
  return [
    { id: 'resolutions', name: 'New Year resolutions', date: D(y, 1, 1), lead: 10, markets: ALL, ideas: ['Fitness equipment', 'Diet and meal plans', 'Budget planners', 'Online courses', 'Habit trackers'] },
    { id: 'valentine', name: "Valentine's Day", date: D(y, 2, 14), lead: 21, markets: ALL, ideas: ['Jewelry', 'Flowers', 'Couples experiences', 'Personalised gifts'] },
    { id: 'carnival', name: 'Carnival (Rosenmontag)', date: add(e, -48), lead: 21, markets: ['NL', 'DE'], ideas: ['Costumes', 'Face paint', 'Party accessories'] },
    { id: 'us-tax', name: 'US tax deadline', date: D(y, 4, 15), lead: 45, markets: ['US'], ideas: ['Tax software', 'Tax preparers', 'Bookkeeping tools'] },
    { id: 'easter', name: 'Easter', date: e, lead: 21, markets: ALL, ideas: ['Easter decorations', 'Chocolate', 'Egg painting kits', 'Spring clothing'] },
    { id: 'kingsday', name: "King's Day", date: kd, lead: 21, markets: ['NL'], ideas: ['Orange clothing', 'Party items', 'Flea market supplies'] },
    { id: 'nl-tax', name: 'Dutch income tax return deadline', date: D(y, 5, 1), lead: 60, markets: ['NL'], ideas: ['Tax return help', 'Bookkeeping services'] },
    { id: 'mothersday', name: "Mother's Day", date: nth(y, 5, 0, 2), lead: 21, markets: ['US', 'NL', 'DE'], ideas: ['Flowers', 'Jewelry', 'Spa and wellness gifts', 'Personalised gifts'] },
    { id: 'vatertag', name: 'Vatertag', date: add(e, 39), lead: 14, markets: ['DE'], ideas: ['Barbecue gear', 'Beer gifts', 'Tools'] },
    { id: 'fathersday', name: "Father's Day", date: nth(y, 6, 0, 3), lead: 21, markets: ['US', 'NL'], ideas: ['Barbecue gear', 'Tools', 'Gadgets', 'Grooming kits'] },
    { id: 'summer', name: 'Start of summer', date: D(y, 6, 21), lead: 30, markets: ['NL', 'DE', 'US'], ideas: ['Fans', 'Portable air conditioners', 'Paddling pools', 'Sunscreen', 'Garden furniture'] },
    { id: 'halloween', name: 'Halloween', date: D(y, 10, 31), lead: 35, markets: ALL, ideas: ['Costumes', 'Decorations', 'Candy', 'Pumpkin carving kits'] },
    { id: 'singles', name: "Singles' Day (11.11)", date: D(y, 11, 11), lead: 14, markets: ['WW'], ideas: ['Electronics deals', 'Beauty', 'Fashion'] },
    { id: 'martin', name: 'St. Martin (Sint-Maarten)', date: D(y, 11, 11), lead: 14, markets: ['NL', 'DE'], ideas: ['Lanterns', 'Lantern craft kits', 'Sweets'] },
    { id: 'thanksgiving', name: 'Thanksgiving', date: tg, lead: 21, markets: ['US'], ideas: ['Roasting pans', 'Meat thermometers', 'Table decor', 'Turkey fryers'] },
    { id: 'blackfriday', name: 'Black Friday', date: add(tg, 1), lead: 21, markets: ALL, ideas: ['Electronics', 'Home appliances', 'Deal pages', 'Gift bundles'] },
    { id: 'cybermonday', name: 'Cyber Monday', date: add(tg, 4), lead: 10, markets: ['US', 'WW'], ideas: ['Software', 'Subscriptions', 'Tech accessories'] },
    { id: 'advent', name: 'First Advent', date: onOrAfter(D(y, 11, 27), 0), lead: 40, markets: ['DE', 'NL'], ideas: ['Advent calendars', 'Advent wreaths', 'Candles'] },
    { id: 'sinterklaas', name: 'Sinterklaas (pakjesavond)', date: D(y, 12, 5), lead: 35, markets: ['NL'], ideas: ['Gifts', 'Chocolate letters', 'Surprise craft materials', 'Poem help'] },
    { id: 'nikolaus', name: 'Nikolaus', date: D(y, 12, 6), lead: 21, markets: ['DE'], ideas: ['Small gifts', 'Chocolate', 'Stocking fillers'] },
    { id: 'christmas', name: 'Christmas', date: D(y, 12, 25), lead: 50, markets: ALL, ideas: ['Gifts', 'Christmas trees', 'Lights', 'Decorations', 'Gift guides'] },
    { id: 'nye', name: "New Year's Eve", date: D(y, 12, 31), lead: 21, markets: ['NL', 'DE'], ideas: ['Fireworks (where allowed)', 'Party supplies', 'Oliebollen fryers', 'Raclette sets'] },
  ];
}

// Eenmalige data (regelgeving). Alleen opnemen wat vaststaat.
export const ONE_OFF = [
  { id: 'nl-net-metering', kind: 'regulation', name: 'End of net metering (salderingsregeling)', date: D(2027, 1, 1), lead: 150, markets: ['NL'], ideas: ['Home batteries', 'Energy management systems', 'Dynamic energy contracts', 'Solar self-consumption', 'Heat pumps'] },
];

// Officiële feestdagen (uit Nager.Date) die nog niet als koopmoment in de lijst staan, samengevoegd per datum en naam.
export function holidayMoments(list, base) {
  const taken = new Set();
  for (const e of base) for (const m of e.markets) taken.add(`${m}|${e.date.toISOString().slice(0, 10)}`);
  const by = new Map();
  for (const h of list || []) {
    if (taken.has(`${h.market}|${h.date}`)) continue;
    const k = `${h.date}|${h.name}`;
    if (!by.has(k)) by.set(k, { id: `ph-${k}`, kind: 'holiday', name: `${h.name} (public holiday)`, date: new Date(`${h.date}T00:00:00Z`), lead: 14, markets: [], ideas: ['Day trips', 'Short breaks', 'DIY and garden'] });
    if (!by.get(k).markets.includes(h.market)) by.get(k).markets.push(h.market);
  }
  return [...by.values()];
}

export function upcoming(today = new Date(), horizon = 120, holidayList = [], extra = []) {
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const y = today.getUTCFullYear();
  const iso = d => d.toISOString().slice(0, 10);
  const base = [...moments(y), ...moments(y + 1), ...ONE_OFF];
  const ex = extra.map(e => ({ ...e, date: e.date instanceof Date ? e.date : new Date(`${e.date}T00:00:00Z`) }));
  return [...base, ...holidayMoments(holidayList, base), ...ex]
    .map(ev => { const days = Math.round((ev.date.getTime() - t) / DAY), opensIn = days - ev.lead; return { ...ev, kind: ev.kind || 'moment', date: iso(ev.date), days, opensIn, status: opensIn > 0 ? 'soon' : 'open' }; })
    .filter(ev => ev.days >= 0 && ev.opensIn <= horizon)
    .sort((a, b) => (a.status === b.status ? a.days - b.days : a.status === 'open' ? -1 : 1));
}
