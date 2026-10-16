// Advies bij een check: wat moet iemand nu doen met dit idee? Alleen uit gemeten cijfers en de getoetste voorspelling,
// zodat het advies klopt zonder AI (de AI-analist mag het daarna in gewone taal aanvullen).
// Uitkomst: { decision, label, headline, why[], when, budget, steps[], angles[] }
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const n0 = v => Number(Math.round(v)).toLocaleString('en-US');
const about = v => n0(v >= 1000 ? Number(v.toPrecision(2)) : v); // 230.304 → 230,000
const money = v => `$${v >= 100 ? n0(v) : v.toFixed(v < 10 ? 2 : 0)}`;
const LABEL = { go: 'Go now', prepare: 'Get ready', test: 'Test small first', wait: 'Wait', skip: 'Skip' };
const MIN = { NL: 300, DE: 1000, US: 3000 }; // onder dit volume is er per maand te weinig vraag voor een product of campagne

export function advise(res) {
  const mk = res.market, mm = res.measured, minV = MIN[mk] || 1000;
  if (res.budgetReached) return null; // geen gemeten cijfers vandaag: geen advies i.p.v. een verkeerd advies
  const why = [], steps = [];
  if (!mm || (mm.volume == null && mm.last == null)) {
    return { decision: 'test', label: LABEL.test, headline: 'Too few measured searches to judge this idea.', why: ['Google has no reliable search volume for these exact words.'], when: null, budget: null,
      steps: ['Try the words your buyers would type (see "What people type").', 'Check a broader or more common name for the same thing.'], angles: [] };
  }
  const vol = mm.last ?? mm.volume ?? 0, fc = mm.forecast, cpc = mm.cpc, comp = mm.competition, yoy = mm.yoy;
  const local = mm.local, competitors = res.local && res.local.competitors ? res.local.competitors.count : null;
  const ser = mm.series || [];
  // Seizoen uit de laatste 13 maanden: de sterkste maand van vorig jaar.
  const peakLY = ser.length >= 12 ? ser.slice(0, 12).reduce((a, b) => (b.v > a.v ? b : a)) : null;
  // Kleine test: ~100 klikken bij de gemeten klikprijs.
  const budget = cpc ? { clicks: 100, cost: Math.max(5, Math.round(cpc * 100)), cpc, text: `about ${money(Math.max(5, cpc * 100))} buys ~100 ad clicks at ${money(cpc)} each, enough to see if people buy.` } : null;
  // Goedkopere invalshoeken: verwante zoekopdrachten met volume en een lagere klikprijs.
  const angles = (mm.related || []).filter(r => r.volume >= Math.max(50, vol * 0.03) && (cpc == null || r.cpc == null || (r.cpc <= cpc && r.cpc >= Math.max(0.05, cpc * 0.3)))).slice(0, 4).map(r => ({ k: r.k, volume: r.volume, cpc: r.cpc }));

  if (mm.jump && !mm.jump.confirmed) {
    return { decision: 'wait', label: LABEL.wait, headline: 'The recent jump is probably a Google counting change, not real demand.', why: ['Searches jumped many times in one or two months and Google Trends does not confirm it.'],
      when: 'Check again next month.', budget: null, steps: ['Use the level before the jump as the real demand.'], angles };
  }
  const size = vol >= minV ? 'big enough' : 'small';
  why.push(`${n0(vol)} searches a month${local ? ` (${n0(local.volume)} in ${local.city})` : ''}${yoy != null ? `, ${yoy >= 0 ? '+' : ''}${yoy}% on last year` : ''}.`);
  if (comp != null && cpc != null) why.push(`Advertisers pay ${money(cpc)} per click; competition ${comp >= 70 ? 'high' : comp >= 35 ? 'medium' : 'low'} (${comp}/100).`);
  if (competitors != null && local) why.push(competitors === 0 ? `No one found offering this in ${local.city} yet.` : `${competitors} places already offer this in ${local.city}.`);

  let decision, headline, when = null;
  if (fc && fc.call === 'rise' && fc.peak) {
    const ch = fc.chance != null ? `${fc.chance}% chance` : 'likely';
    decision = vol >= minV * 0.3 ? 'go' : 'prepare';
    headline = `Demand rises to about ${about(fc.peak.v)} a month by ${MN[fc.peak.m - 1]} (${ch} of at least +40%).`;
    if (fc.stability && fc.stability.level === 'all') why.push('This rise came back in every year since 2021.');
    when = `Start now and be fully live 2–4 weeks before ${MN[fc.peak.m - 1]}; scale down after ${MN[fc.peak.m - 1]}.`;
    steps.push(`Have your page, offer and ads ready before ${MN[(fc.peak.m + 10) % 12]} ends.`);
    steps.push('If you sell stock: make sure it arrives at least 4 weeks before the peak.');
  } else if (fc && fc.call === 'fall' && fc.low) {
    decision = 'wait';
    headline = `Demand drops to about ${about(fc.low.v)} a month by ${MN[fc.low.m - 1]}.`;
    when = peakLY ? `Next good window: around ${MN[peakLY.m - 1]}, when it peaked last year.` : 'Wait for the next seasonal rise.';
    steps.push('Do not start new spend now; plan for the next window.');
  } else if (yoy != null && yoy >= 25 && vol >= minV * 0.3) {
    decision = 'go'; headline = `Demand is growing: ${yoy >= 0 ? '+' : ''}${yoy}% on last year.`;
    when = 'Now, before more sellers notice.';
    steps.push('Launch a simple offer page and a small search campaign this week.');
  } else if (yoy != null && yoy <= -20) {
    decision = vol >= minV ? 'test' : 'skip';
    headline = `Demand is shrinking: ${yoy}% on last year.`;
    steps.push(decision === 'skip' ? 'Look at the cheaper angles below or a different idea.' : 'Only enter with a clearly better or cheaper offer.');
  } else {
    decision = vol >= minV ? 'test' : 'skip';
    headline = vol >= minV ? 'Steady demand: who wins depends on the offer and the ad price.' : `Small market: ${n0(vol)} searches a month.`;
    if (peakLY && vol > 0 && peakLY.v >= vol * 1.4) when = `Demand peaked in ${MN[peakLY.m - 1]} last year; time a launch before it.`;
  }
  if (decision === 'go' && comp != null && comp >= 70 && cpc != null && cpc >= 1.5) {
    steps.push('Ads are expensive here: start with the cheaper angles below or organic content.');
  }
  if (decision === 'test' || decision === 'go') { if (budget) steps.push(`Test with a small budget first: ${budget.text}`); }
  if (decision !== 'skip' && size === 'small') why.push('The market is small: fine for a niche page or local service, too small for a big launch.');
  if (local && competitors === 0 && local.volume >= 50 && decision !== 'wait') steps.push(`Local gap: people in ${local.city} search for this and no one offers it there yet.`);
  return { decision, label: LABEL[decision], headline, why, when, budget, steps: steps.slice(0, 4), angles };
}
