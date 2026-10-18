// Demand Radar voorpagina: /api/demand per land en categorie.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var S = { d: null, mk: 'ALL', view: 'rise', n: 12 };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ORDER = ['NL', 'DE', 'US'];
  var MKN = { NL: 'Netherlands', DE: 'Germany', US: 'United States', WW: 'Worldwide' };
  var LBL = { new: ['New demand'], seasonal: ['Seasonal'], rising: ['Growing'], steady: ['Steady demand'] };
  var NOW = { rising: ['Rising today', 'p-early'], steady: ['Holding', 'p-steady'], fading: ['Fading', 'p-falling'], gone: ['Over', 'p-falling'], quiet: ['', ''] };
  // Rustig: vier hoofdtegels (vooruitkijken), de rest als één regel tekstlinks met korte namen.
  var TAG = { rise: 'Forecast, with the odds', early: 'Before anyone sees it', wild: 'Bold calls, checked', coming: 'Moments ahead' };
  var SHORT = { now: 'Rising now', unexpected: 'Unexpected', missing: 'Not made yet', products: 'Products', courses: 'Courses', services: 'Services', books: 'Books', apps: 'Apps & AI', trips: 'Trips', money: 'Money' };
  var KEEP = { rise: 1, early: 1, wild: 1, coming: 1, now: 1 };
  var ITEM_VIEWS = { now: 1, products: 1, courses: 1, books: 1, services: 1, apps: 1, trips: 1, money: 1 };
  try { var saved = JSON.parse(localStorage.getItem('dr-view') || 'null'); if (saved) { S.mk = saved.mk || S.mk; S.view = saved.view || S.view; } } catch (e) {}

  function h(t, a) { var e = document.createElement(t), k, i, c; for (k in a || {}) { if (a[k] == null) continue; if (k === 'class') e.className = a[k]; else if (k === 'text') e.textContent = a[k]; else if (k.slice(0, 2) === 'on') e[k] = a[k]; else e.setAttribute(k, a[k]); } for (i = 2; i < arguments.length; i++) { c = arguments[i]; if (c == null || c === false) continue; (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x))); }); } return e; }
  function cap(t) { t = String(t || ''); return t.charAt(0).toUpperCase() + t.slice(1); }
  function num(n) { return n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : Number(n).toLocaleString('en-US'); }
  function pc(x) { return x == null ? '–' : x >= 999 ? 'new' : (x >= 0 ? '+' : '') + Math.round(x).toLocaleString('en-US') + '%'; }
  function mon(p, long) { if (!p) return ''; var a = p.split('-'); return MON[+a[1] - 1] + (long ? ' ' + a[0] : ''); }
  function prevMon(p) { var a = p.split('-'), m = +a[1] - 1; if (m < 1) m = 12; return MON[m - 1]; }
  function ev(k, c) { try { var u = '/api/e?x=radar&k=' + k + '&v=A&c=' + encodeURIComponent(c || '-'); if (navigator.sendBeacon) navigator.sendBeacon(u); else fetch(u, { keepalive: true }); } catch (e) {} }
  function save() { try { localStorage.setItem('dr-view', JSON.stringify({ mk: S.mk, view: S.view })); } catch (e) {} }
  function checkUrl(q, cc) { return '/check?q=' + encodeURIComponent(q) + '&m=' + (cc === 'WW' ? 'US' : cc) + '#check'; }
  // De echte zoekopdrachten in de eigen taal van het land, onder de (Engelse) naam.
  var LANGOF = { NL: 'nl', DE: 'de', US: 'en', GB: 'en', FR: 'fr', ES: 'es', IT: 'it', BE: 'nl', AT: 'de' };
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9\u00c0-\u024f]+/g, ' ').trim(); }
  function asked(name, qs, cc) {
    var seen = {}, l = (qs || []).filter(function (q) { var k = norm(q); if (!k || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 3);
    if (!l.length) return null; // altijd tonen: de echte zoekopdracht, ook als de naam er al op lijkt
    return h('p', { class: 'asked' }, h('span', { class: 'asked-l', text: 'Searched as ' }), [].concat.apply([], l.map(function (q, i) { return [i ? ' · ' : '', h('a', { href: checkUrl(q, cc), lang: LANGOF[cc] || null }, '\u201c' + q + '\u201d')]; })));
  }
  // Lijn: gemeten maanden; stippellijn: voorspelling (f = voorspelde waarden, aansluitend na een gat van de achterstand).
  function spark(v, f, gap) {
    if (!v || v.length < 4) return null;
    f = f || []; gap = gap || 0;
    var all = v.concat(f), n = v.length + (f.length ? gap + f.length : 0), w = 120, hg = 32, mx = Math.max.apply(null, all.concat([1]));
    var X = function (i) { return ((i / (n - 1)) * (w - 4) + 2).toFixed(1); }, Y = function (x) { return (hg - 3 - (x / mx) * (hg - 6)).toFixed(1); };
    var pts = v.map(function (x, i) { return X(i) + ',' + Y(x); });
    var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 ' + w + ' ' + hg); s.setAttribute('width', w); s.setAttribute('height', hg); s.setAttribute('class', 'spark'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'polyline'); p.setAttribute('class', 'h'); p.setAttribute('points', pts.join(' ')); s.append(p);
    if (f.length) {
      var fp = [pts[pts.length - 1]].concat(f.map(function (x, i) { return X(v.length + gap + i) + ',' + Y(x); }));
      var q = document.createElementNS(NS, 'polyline'); q.setAttribute('class', 'p'); q.setAttribute('points', fp.join(' ')); s.append(q);
      var le = fp[fp.length - 1].split(','), ce = document.createElementNS(NS, 'circle'); ce.setAttribute('class', 'e'); ce.setAttribute('cx', le[0]); ce.setAttribute('cy', le[1]); ce.setAttribute('r', 2.6); s.append(ce);
    } else {
      var l = pts[pts.length - 1].split(','), c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'e'); c.setAttribute('cx', l[0]); c.setAttribute('cy', l[1]); c.setAttribute('r', 2.6); s.append(c);
    }
    return s;
  }
  function fcLine(fc) { return fc && fc.months && fc.months.length ? fc.months.map(function (m) { return m.v; }) : null; }
  function fcGap(fc) { return fc && fc.months && fc.months.length ? fc.months[0].h - 1 : 0; }
  // Korte voorspelzin voor een rij.
  function fcText(fc) {
    if (!fc) return null;
    if (fc.call === 'rise' && fc.peak) return 'Expected to rise to ' + num(fc.peak.v) + ' in ' + MON[fc.peak.m - 1];
    if (fc.call === 'fall' && fc.low) return 'Expected to drop to ' + num(fc.low.v) + ' by ' + MON[fc.low.m - 1];
    return null;
  }
  function byCountry(list) { return list.filter(function (x) { return S.mk === 'ALL' || x.cc === S.mk; }); }
  // Alle landen: om en om de beste per land, zodat Nederland niet wegvalt onder grote Amerikaanse aantallen.
  function interleave(list) {
    if (S.mk !== 'ALL') return list;
    var by = {}, out = [], i, more = true;
    list.forEach(function (x) { (by[x.cc] = by[x.cc] || []).push(x); });
    for (i = 0; more; i++) { more = false; ORDER.concat(['WW']).forEach(function (cc) { if (by[cc] && by[cc][i]) { out.push(by[cc][i]); more = true; } }); }
    return out;
  }
  function more(list, box, render) {
    var rows = list.slice(0, S.n).map(render);
    if (list.length > S.n) rows.push(h('button', { class: 'chip', type: 'button', style: 'margin:12px 0', text: 'Show ' + Math.min(12, list.length - S.n) + ' more', onclick: function () { S.n += 12; draw(); } }));
    box.replaceChildren.apply(box, rows);
  }
  function empty(box, t) { box.replaceChildren(h('p', { class: 'empty', text: t })); }

  function itemRow(x) {
    var nw = x.now && NOW[x.now.status], lbl = (LBL[x.label] || LBL.rising)[0];
    var useYear = !x.jump && x.grew;
    var also = (x.members || []).map(function (m) { return m.k; }).filter(function (k) { return k !== (x.keyword || x.name); }).slice(0, 4);
    var link = h('a', { class: 'lname', href: checkUrl(x.keyword || x.name, x.cc), title: 'Searched as: ' + (x.keyword || x.name) + (also.length ? ' · also: ' + also.join(', ') : ''), onclick: function () { ev('open', x.cat); } }, x.name);
    var nums = [lbl, num(x.last) + ' searches in ' + mon(x.period)];
    if (!useYear) nums.push(pc(x.mom) + ' vs ' + prevMon(x.period));
    if (x.yoy != null) nums.push(pc(x.yoy) + ' vs last year');
    if (x.cpc != null) nums.push('$' + Number(x.cpc).toFixed(2) + ' per click');
    return h('div', { class: 'line' },
      h('div', { class: 'line-main' },
        h('div', { class: 'line-top' },
          h('div', null, h('span', { class: 'mk', text: x.cc }), link),
          h('div', { class: 'badges' },
            x.fresh ? h('span', { class: 'badge p-early', text: 'New' }) : null,
            x.forecast && x.forecast.call === 'rise' ? h('span', { class: 'badge p-early', text: 'Will rise' }) : x.forecast && x.forecast.call === 'fall' ? h('span', { class: 'badge p-falling', text: 'Will drop' }) : nw && x.now.status !== 'quiet' ? h('span', { class: 'badge ' + nw[1], text: nw[0] }) : null)),
        asked(x.name, [x.keyword || x.name].concat(also), x.cc),
        x.what ? h('p', { class: 'cu-what', text: cap(x.what) }) : null,
        S.view === 'unexpected' && x.why ? h('p', { class: 'cu-why', text: x.why }) : null,
        h('p', { class: 'meta', text: nums.join(' · ') }),
        fcText(x.forecast) ? h('p', { class: 'meta fc', text: fcText(x.forecast) }) : null,
        x.idea ? h('p', { class: 'cu-idea' }, h('b', null, 'Idea'), cap(x.idea)) : null, vote(x)),
      spark((x.series || []).map(function (s) { return s.v; }), fcLine(x.forecast), fcGap(x.forecast)));
  }

  // Klopt / klopt niet: telt mee in de leerronde van vannacht.
  function vote(x) {
    var box = h('span', { class: 'vote' }), send = function (v) {
      try { fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cc: x.cc, k: x.keyword || x.name, cat: x.cat, vote: v, view: S.view }), keepalive: true }); } catch (e) {}
      box.replaceChildren(h('span', { class: 'lsub', text: v > 0 ? 'Thanks, noted' : 'Thanks, we will learn from this' }));
    };
    box.append(h('button', { type: 'button', class: 'vbtn', title: 'This is real demand', onclick: function () { send(1); } }, 'Useful'), h('button', { type: 'button', class: 'vbtn', title: 'This is not real demand', onclick: function () { send(-1); } }, 'Not real demand'));
    return box;
  }

  // Onderbouwing in één regel: hoe vast het patroon is en wat weer of geld doet.
  var DN = { temp: ['warmer', 'colder', '°C'], sun: ['sunnier', 'less sunny', ' kWh/m² sunlight a day'], rain: ['wetter', 'drier', ' mm rain a day'], mortgage: ['higher mortgage rates', 'lower mortgage rates', ' pt'], energy: ['higher energy prices', 'lower energy prices', ''], confidence: ['more consumer confidence', 'less consumer confidence', ''] };
  function why(f) {
    var p = [], st = f.stability;
    if (st) p.push(st.level === 'all' ? 'Rose in this period every year since ' + (new Date().getUTCFullYear() - st.years) : 'Rose in this period in ' + st.up + ' of the last ' + st.years + ' years');
    var e = f.drivers && f.drivers.effects && f.drivers.effects.filter(function (x) { return x.ym <= new Date().toISOString().slice(0, 7); }).slice(-1)[0];
    if (e && DN[e.name]) p.push(MON[+e.ym.slice(5) - 1] + ' is ' + (e.change > 0 ? DN[e.name][0] : DN[e.name][1]) + ' than last year (' + (e.pct > 0 ? '+' : '') + e.pct + '% on searches)');
    return p.join(' · ');
  }

  // De voorspeller: wat de komende maanden gaat stijgen.
  function riseRow(x) {
    var f = x.forecast, pk = f.peak, ly = f.lastYear || [];
    var lyPeak = ly.reduce(function (a, b) { return b.v != null && (a == null || b.v > a.v) ? b : a; }, null);
    var path = f.months.map(function (m) { return MON[m.m - 1] + ' ' + num(m.v); }).join(' → ');
    var link = h('a', { class: 'lname', href: checkUrl(x.keyword || x.name, x.cc), title: 'Searched as: ' + (x.keyword || x.name), onclick: function () { ev('open', 'rise'); } }, x.name);
    return h('div', { class: 'line' },
      h('div', { class: 'line-main' },
        h('div', { class: 'line-top' }, h('div', null, h('span', { class: 'mk', text: x.cc }), link), h('div', { class: 'badges' }, (f.stability ? f.stability.level === 'all' : f.confidence === 'high') ? h('span', { class: 'badge p-steady', title: 'Rose in this period in every year since 2021', text: 'Every year' }) : null, f.chance != null ? h('span', { class: 'badge p-early', title: 'Chance that searches in ' + MON[pk.m - 1] + ' are at least 40% higher than now. Tested: of the rises we predicted, 90% came true.', text: '+40% by ' + MON[pk.m - 1] + ' · ' + f.chance + '% chance' }) : h('span', { class: 'badge p-early', text: '+' + Math.round((pk.v / Math.max(f.from.v, 1) - 1) * 100).toLocaleString('en-US') + '% by ' + MON[pk.m - 1] }))),
        asked(x.name, [x.keyword || x.name].concat((x.members || []).map(function (m) { return m.k; })), x.cc),
        x.what ? h('p', { class: 'cu-what', text: cap(x.what) }) : null,
        h('p', { class: 'meta' }, h('b', { class: 'fcb' }, 'Forecast '), path + ' searches a month'),
        h('p', { class: 'meta', text: 'Measured: ' + num(f.from.v) + ' in ' + MON[f.from.m - 1] + (lyPeak ? ' · last year ' + num(lyPeak.v) + ' in ' + MON[lyPeak.m - 1] : '') + (x.cpc != null ? ' · $' + Number(x.cpc).toFixed(2) + ' per click' : '') }),
        why(f) ? h('p', { class: 'meta', text: why(f) }) : null,
        x.idea ? h('p', { class: 'cu-idea' }, h('b', null, 'Idea'), cap(x.idea)) : null, vote(x)),
      spark((x.series || []).map(function (s) { return s.v; }), fcLine(f), fcGap(f)));
  }

  // Vroege signalen: nog niet doorgebroken, wel het patroon van termen die daarna doorbraken.
  function earlyRow(x) {
    var st = x.tier === 'starting';
    var link = h('a', { class: 'lname', href: checkUrl(x.keyword || x.name, x.cc), title: 'Searched as: ' + (x.keyword || x.name), onclick: function () { ev('open', 'early'); } }, x.name);
    return h('div', { class: 'line' },
      h('div', { class: 'line-main' },
        h('div', { class: 'line-top' }, h('div', null, h('span', { class: 'mk', text: x.cc }), link), h('div', { class: 'badges' },
          h('span', { class: 'badge ' + (st ? 'p-rising' : 'p-early'), title: 'Chance of a lasting breakout (searches at least double last year for 3 months) within 6 months, measured in our test on 4 years of data', text: (st ? 'Starting' : 'Not visible yet') + ' · ' + x.chance + '% chance' }))),
        asked(x.name, [x.keyword || x.name], x.cc),
        h('p', { class: 'meta', text: 'Measured: ' + num(x.now.v) + ' in ' + MON[x.now.m - 1] + ' · same month last year ' + num(x.lastYear) + (x.cpc != null ? ' · $' + Number(x.cpc).toFixed(2) + ' per click' : '') }),
        (x.reasons || []).length ? h('p', { class: 'meta', text: x.reasons.join(' · ') }) : null),
      spark((x.series || []).map(function (s) { return s.v; })));
  }

  function todayRow(t) {
    return h('div', { class: 'line one' },
      h('div', { class: 'line-main' },
        h('div', { class: 'line-top' }, h('div', null, h('span', { class: 'mk', text: t.cc }), h('a', { class: 'lname', href: checkUrl(t.keyword || t.name, t.cc), onclick: function () { ev('open', 'today'); } }, t.name)), h('span', { class: 'badge p-early', text: 'Today' })),
        asked(t.name, [t.keyword || t.name], t.cc),
        h('p', { class: 'cu-what', text: t.angle }),
        h('p', { class: 'meta' }, (t.traffic && t.traffic !== 'Bluesky' ? t.traffic + ' searches today' : t.traffic === 'Bluesky' ? 'Trending on Bluesky' : ''), t.news && t.news.url ? [' · ', h('a', { href: t.news.url, target: '_blank', rel: 'noopener' }, t.news.source || 'news')] : null),
        t.idea ? h('p', { class: 'cu-idea' }, h('b', null, 'Idea'), t.idea) : null));
  }

  function needRow(n) {
    return h('div', { class: 'line one' },
      h('div', { class: 'line-main' },
        h('div', { class: 'line-top' }, h('div', null, h('span', { class: 'mk', text: n.cc }), h('span', { class: 'lname', text: n.need })), h('span', { class: 'badge ' + (n.exists === 'no' ? 'p-early' : 'p-steady'), text: n.exists === 'no' ? "Doesn't exist" : 'Partly exists' })),
        n.gap ? h('p', { class: 'cu-what', text: n.gap }) : null,
        h('p', { class: 'meta' }, (n.volume ? num(n.volume) + ' searches a month · ' : '') + 'People typed: ', [].concat.apply([], n.searches.slice(0, 2).map(function (q, i) { return [i ? ' · ' : '', q.url ? h('a', { href: q.url, target: '_blank', rel: 'noopener' }, '“' + q.q + '”') : '“' + q.q + '”']; }))),
        n.idea ? h('p', { class: 'cu-idea' }, h('b', null, 'Idea'), n.idea) : null));
  }

  function comingRow(m) {
    var ly = m.lastYear || {}, peakNow = ly.now && ly.now === ly.peak;
    var line = !ly.peak ? (m.status === 'open' ? 'Demand is open now' : 'Demand opens in ' + m.opensIn + ' days')
      : peakNow ? 'Peak month is now: ' + num(ly.peak) + ' searches last year'
      : 'Last year ' + num(ly.now) + ' → ' + num(ly.peak) + ' searches by ' + MON[(ly.peakMonth || 1) - 1] + ' (' + pc(ly.rise) + ')';
    return h('div', { class: 'line one' },
      h('div', { class: 'line-main' },
        h('div', { class: 'line-top' }, h('div', null, h('span', { class: 'mk', text: m.cc }), h('span', { class: 'lname', text: m.name })), h('span', { class: 'badge ' + (m.status === 'open' ? 'p-early' : 'p-steady'), text: m.days === 0 ? 'Today' : 'In ' + m.days + ' days' })),
        h('p', { class: 'meta', text: line }),
        m.kind === 'launch' ? h('p', { class: 'meta' }, 'Release' + (m.launchType ? ' · ' + m.launchType : '') + (m.month ? ' · date known to the month' : '') + (m.sources && m.sources[0] ? ' · ' : ''), m.sources && m.sources[0] && m.sources[0].site ? h('a', { href: m.sources[0].site, target: '_blank', rel: 'noopener' }, 'Wikipedia') : null) : null,
        m.kind === 'regulation' ? h('p', { class: 'meta' }, 'New rule · ' + (m.direction === 'less' ? 'less' : 'more') + ' demand' + (m.sources && m.sources[0] ? ' · ' : ''), m.sources && m.sources[0] ? (m.sources[0].site ? h('a', { href: m.sources[0].site, target: '_blank', rel: 'noopener' }, m.sources[0].source || 'source') : m.sources[0].source) : null) : null,
        m.kind === 'school' && m.note ? h('p', { class: 'meta', text: 'School holidays ' + m.note.replace(' to ', ' to ') + ' (regions differ)' }) : null,
        m.terms && m.terms.length ? h('div', { class: 'tchips' }, m.terms.map(function (t) { return h('a', { class: 'tchip', href: checkUrl(t.k, m.cc), onclick: function () { ev('open', 'coming'); } }, t.k, h('span', { text: ' ' + (t.now === t.peak ? num(t.peak) : num(t.now) + '→' + num(t.peak)) })); })) : null,
        m.ideas && m.ideas.length ? h('p', { class: 'cu-idea' }, h('b', null, 'Sell'), m.ideas.join(', ')) : null));
  }

  function charts(kind) {
    var c = (S.d.charts && S.d.charts[kind]) || [];
    c = c.filter(function (g) { return S.mk === 'ALL' || g.cc === S.mk || g.cc === 'WW'; });
    if (!c.length) return null;
    return h('div', { class: 'chartsbox' }, h('h3', null, kind === 'books' ? 'In the book charts today' : kind === 'apps' ? 'In the app charts today' : 'Selling most in the shops today'),
      h('div', { class: 'chartgrid' }, c.map(function (g) {
        return h('div', { class: 'card chartcard' }, h('p', { class: 'eyebrow', style: 'margin:12px 0 6px', text: g.label + (g.cc !== 'WW' ? ' · ' + g.cc : '') }),
          h('ol', { class: 'chart' }, g.list.slice(0, 10).map(function (x) { return h('li', null, h('a', { href: x.url, target: '_blank', rel: 'noopener' }, x.title), x.by ? h('span', { class: 'lsub', text: ' · ' + x.by }) : null, x.isNew ? h('span', { class: 'badge p-early mini', text: 'new' }) : null); })));
      })));
  }

  function status() {
    var d = S.d, L = d.learning || {}, p = [];
    if (d.generatedAt) p.push('Updated ' + new Date(d.generatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
    p.push(byCountry(d.items || []).length + ' topics');
    if (L.day) p.push('learning day ' + L.day);
    var FB = d.forecast && d.forecast.backtest, FL = d.forecast && d.forecast.live;
    if (FL && FL.n >= 20) p.push(Math.round(100 * FL.hit10 / FL.n) + '% of predicted rises came true (' + FL.n + ' checked)');
    else if (FB) p.push('forecasts tested on ' + FB.series.toLocaleString('en-US') + ' searches: ' + Math.round((FB.rise.right40 || FB.rise.right10) / 10) + ' in 10 predicted rises came true');
    $('#dr-status').textContent = p.join(' · ');
    var q = [];
    if (L.tracked) q.push(L.tracked + ' topics remembered');
    if (L.noiseWords) q.push(L.noiseWords + ' noise words learned');
    if (d.period) q.push('search volumes up to ' + mon(d.period, true) + ', daily trend up to today');
    $('#dr-learn').textContent = q.length ? 'Now: ' + q.join(', ') + '.' : '';
  }

  // Wildcards: eigen voorspellingen met een vooraf vastgelegde meetlat; de radar kijkt ze zelf na.
  var WS = { open: ['Open', 'p-steady'], checking: ['Checking', 'p-rising'], hit: ['Came true', 'p-early'], partly: ['Partly true', 'p-peak'], miss: ['Wrong', 'p-falling'], dropped: ['Dropped', 'p-steady'] };
  var SURE = { tested: 'Tested pattern', strong: 'Strong signal', medium: 'Medium', weak: 'Weak (small numbers)' };
  function wildFor() { var W = S.d && S.d.wild; return ((W && W.items) || []).filter(function (x) { return S.mk === 'ALL' || x.ccs.indexOf(S.mk) >= 0; }).slice().sort(function (a, b) { var da = /hit|partly|miss/.test(a.status), db = /hit|partly|miss/.test(b.status); return (da - db) || String(a.due).localeCompare(String(b.due)); }); }
  function day(s) { if (!s) return ''; var a = s.split('-'); return +a[2] + ' ' + MON[+a[1] - 1]; }
  function stat(n, l, c) { return h('div', { class: 'rec' + (c ? ' ' + c : '') }, h('b', { text: String(n || 0) }), h('span', { text: l })); }
  function testLine(t) {
    var m = mon(t.month, true), ly = MON[+t.month.slice(5) - 1] + ' ' + (+t.month.slice(0, 4) - 1);
    var goal = t.yoy ? 'at least ' + t.yoy + '× ' + ly : t.vs ? 'at least ' + t.times + '× "' + t.vs + '"' : t.min != null ? 'at least ' + num(t.min) : 'at most ' + num(t.max);
    var got = t.state === 'waiting' ? 'waiting for the ' + m + ' numbers' : num(t.value) + (t.ref != null ? ' vs ' + num(t.ref) : '') + (t.state === 'pass' ? '  ✓' : '  ✗');
    return h('li', { class: 'wt ' + t.state }, h('span', { class: 'mk', text: t.cc }), '"' + t.k + '" in ' + m + ': ' + goal + ' → ', h('b', { text: got }));
  }
  function wildRow(x) {
    var st = WS[x.status] || WS.open;
    var meta = ['Made ' + day(x.made), x.sure ? 'How sure: ' + SURE[x.sure] + (x.odds ? ', ' + x.odds : '') : null, x.status === 'dropped' ? null : x.judged ? 'Checked ' + day(x.judged) : x.due ? 'Check ' + day(x.due) + (x.manual ? ' (by hand)' : '') : null].filter(Boolean).join(' · ');
    return h('div', { class: 'line wild' },
      h('div', { class: 'line-top' }, h('div', null, x.ccs.map(function (c) { return h('span', { class: 'mk', text: c }); }), h('b', { class: 'wild-t', text: x.title })), h('div', { class: 'badges' }, h('span', { class: 'badge ' + st[1], text: st[0] }))),
      h('p', { class: 'wild-claim', text: x.claim }),
      x.tests && x.tests.length ? h('ul', { class: 'wild-tests' }, x.tests.map(testLine)) : null,
      x.note ? h('p', { class: 'wild-res', text: 'Outcome: ' + x.note }) : null,
      x.result ? h('p', { class: 'wild-res', text: x.result }) : null,
      h('p', { class: 'meta', text: meta }),
      x.basis ? h('details', { class: 'wild-why' }, h('summary', { text: 'Why we think so' }), h('p', { text: x.basis }), x.why ? h('p', { class: 'meta', text: 'Why the model cannot say it yet: ' + x.why }) : null) : null);
  }
  function trackRow(t) {
    var a = t.month.split('-'), end = new Date(Date.UTC(+a[0], +a[1] + 6, 15)), fin = MON[end.getUTCMonth()] + ' ' + end.getUTCFullYear();
    return h('div', { class: 'line wild' },
      h('div', { class: 'line-top' }, h('div', null, h('b', { class: 'wild-t', text: 'Our early-signal list (data up to ' + mon(t.month, true) + ')' })), h('div', { class: 'badges' }, h('span', { class: 'badge ' + (t.seen >= 6 ? 'p-early' : 'p-rising'), text: t.seen >= 6 ? 'Final' : 'Checking' }))),
      h('p', { class: 'wild-claim', text: 'Broke out so far: ' + t.hidden.broke + ' of ' + t.hidden.n + ' "not visible yet" (expected about ' + t.expect.hidden + ') and ' + t.starting.broke + ' of ' + t.starting.n + ' "starting" (expected about ' + t.expect.starting + ').' }),
      t.broke && t.broke.length ? h('p', { class: 'meta', text: 'Came true: ' + t.broke.map(function (b) { return b.k + ' (' + b.cc + ')'; }).join(', ') }) : null,
      h('p', { class: 'meta', text: t.seen + ' of 6 months seen · all countries · final check ' + fin }));
  }

  function draw() {
    var d = S.d;
    // landen
    var mk = $('#dr-mk'); mk.replaceChildren();
    [['ALL', 'All'], ['NL', 'NL'], ['DE', 'DE'], ['US', 'US']].forEach(function (o) {
      mk.append(h('button', { type: 'button', 'aria-pressed': String(S.mk === o[0]), title: o[0] === 'ALL' ? 'All countries' : MKN[o[0]], text: o[1], onclick: function () { S.mk = o[0]; S.n = 12; save(); draw(); } }));
    });
    if (!d) return;
    if (!d.ready) { empty($('#dr-list'), 'Measured data is not connected yet.'); return; }
    status();
    // categorieën (volgorde: geleerd uit wat bezoekers openen, anders vast)
    var views = (d.views || []).filter(function (v, i, a) { return a.findIndex(function (x) { return x.id === v.id; }) === i; });
    if (d.order && d.order.length) views.sort(function (a, b) { var ia = d.order.indexOf(a.id), ib = d.order.indexOf(b.id); return (a.id === 'now' ? -1 : b.id === 'now' ? 1 : 0) || (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    // Vier tegels zonder tellers; daaronder één regel links (lege verborgen).
    var box0 = $('#dr-views'), big = h('div', { class: 'tiles' }), small = h('div', { class: 'vlinks' });
    var tk = Object.keys(TAG), sk = Object.keys(SHORT);
    views.filter(function (v) { return TAG[v.id]; }).sort(function (a, b) { return tk.indexOf(a.id) - tk.indexOf(b.id); }).concat(views.filter(function (v) { return SHORT[v.id]; }).sort(function (a, b) { return sk.indexOf(a.id) - sk.indexOf(b.id); })).forEach(function (v) {
      var n = countFor(v.id), sel = String(S.view === v.id);
      if (!n && !KEEP[v.id] && v.id !== S.view) return;
      var go = function () { S.view = v.id; S.n = 12; save(); ev('open', 'tab-' + v.id); draw(); };
      if (TAG[v.id]) big.append(h('button', { class: 'tile', type: 'button', 'aria-pressed': sel, onclick: go }, h('span', { class: 'tn', text: v.name }), h('span', { class: 'tt', text: TAG[v.id] })));
      else small.append(h('button', { class: 'vlink', type: 'button', 'aria-pressed': sel, title: v.desc || '', onclick: go, text: SHORT[v.id] }));
    });
    box0.replaceChildren(big); if (small.children.length) box0.append(small);
    var cur = views.filter(function (v) { return v.id === S.view; })[0] || views[0];
    if (cur) S.view = cur.id;
    $('#dr-desc').textContent = cur ? cur.desc : '';
    var box = $('#dr-list'), extra = $('#dr-extra'); extra.replaceChildren();
    if (ITEM_VIEWS[S.view]) {
      var list = byCountry(d.items || []).filter(function (x) { return S.view === 'now' ? !(x.now && (x.now.status === 'gone' || x.now.status === 'fading')) : x.cat === S.view; });
      list = interleave(list.sort(function (a, b) { return b.score - a.score; }));
      if (!list.length) empty(box, 'Nothing measured in this category for this selection today.'); else more(list, box, itemRow);
      if (S.view === 'books' || S.view === 'apps' || S.view === 'products') { var c = charts(S.view); if (c) extra.append(c); }
    } else if (S.view === 'unexpected') {
      var u = interleave(byCountry(d.items || []).filter(function (x) { return x.unexpected; }));
      var td = interleave(byCountry(d.today || []));
      var rows = td.map(todayRow).concat(u.map(itemRow));
      if (!rows.length) empty(box, 'Nothing unexpected for this selection today.'); else box.replaceChildren.apply(box, rows.slice(0, 30));
    } else if (S.view === 'missing') {
      var ms = interleave(byCountry(d.missing || []));
      if (!ms.length) empty(box, 'No unmet wishes found for this selection today.'); else more(ms, box, needRow);
    } else if (S.view === 'rise') {
      var rl = interleave(byCountry(d.rise || []));
      if (!rl.length) empty(box, 'No clear rises predicted for this selection.'); else more(rl, box, riseRow);
    } else if (S.view === 'early') {
      // eerst wat nog niemand ziet, dan wat net begint; elk met een kop
      var eh = interleave(byCountry(d.early || []).filter(function (x) { return x.tier !== 'starting'; })), es = interleave(byCountry(d.early || []).filter(function (x) { return x.tier === 'starting'; }));
      var el = (eh.length ? [{ head: 'Not visible yet', sub: 'No jump in the numbers yet; the pattern matches searches that broke out later' }] : []).concat(eh, es.length ? [{ head: 'Starting', sub: 'Last month already well above last year, not yet a lasting breakout' }] : [], es);
      if (!el.length) empty(box, 'No early signals for this selection yet.'); else more(el, box, function (x) { return x.head ? h('div', { class: 'early-head' }, h('b', null, x.head), h('span', { class: 'meta', text: ' · ' + x.sub })) : earlyRow(x); });
    } else if (S.view === 'wild') {
      var W = d.wild || {}, wl = wildFor(), r = W.record || {};
      var top = [h('div', { class: 'record' }, stat(r.made, 'calls made'), stat(r.checked, 'checked'), stat(r.hit, 'came true', 'ok'), stat(r.partly, 'partly'), stat(r.miss, 'wrong', 'bad'), stat(r.open, 'still open'))];
      (W.tracks || []).forEach(function (t) { top.push(trackRow(t)); });
      var rest = (W.dropped || []).filter(function (x) { return S.mk === 'ALL' || x.ccs.indexOf(S.mk) >= 0; });
      box.replaceChildren.apply(box, top.concat(wl.map(wildRow), rest.length ? [h('div', { class: 'early-head' }, h('b', null, 'Tested and dropped'), h('span', { class: 'meta', text: ' · ideas the data did not support' }))].concat(rest.map(wildRow)) : []));
    } else if (S.view === 'coming') {
      var cm = byCountry(d.coming || []).slice().sort(function (a, b) { return a.days - b.days; });
      if (!cm.length) empty(box, 'Nothing coming up for this selection.'); else more(cm, box, comingRow);
    }
  }
  function countFor(id) {
    var d = S.d;
    if (ITEM_VIEWS[id]) return byCountry(d.items || []).filter(function (x) { return id === 'now' ? !(x.now && (x.now.status === 'gone' || x.now.status === 'fading')) : x.cat === id; }).length;
    if (id === 'unexpected') return byCountry(d.items || []).filter(function (x) { return x.unexpected; }).length + byCountry(d.today || []).length;
    if (id === 'missing') return byCountry(d.missing || []).length;
    if (id === 'rise') return byCountry(d.rise || []).length;
    if (id === 'early') return byCountry(d.early || []).length;
    if (id === 'wild') return wildFor().length;
    if (id === 'coming') return byCountry(d.coming || []).length;
    return 0;
  }

  // Ingelogd (team): naam, radar verversen (kost ± $2 DataForSEO), uitloggen.
  function account() {
    fetch('/api/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (me) {
      var bar = $('#dr-account'); if (!bar) return;
      if (!me.signedIn) {
        // Klant (e-mail) of bezoeker: plan en gebruik via /api/account
        fetch('/api/account?op=me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (u) {
          if (u.email) bar.replaceChildren(h('span', { class: 'lsub', text: 'Signed in as ' + u.email + ' · ' + u.name + ' plan · ' + (u.limit ? u.used + ' of ' + u.limit + ' checks used · ' : '') }), h('a', { href: '/pricing', text: 'Account' }));
          else bar.replaceChildren(h('a', { href: '/pricing', text: 'Pricing' }), h('span', { class: 'lsub', text: ' · ' }), h('a', { href: '/pricing#signin', text: 'Sign in' }));
        }).catch(function () { bar.replaceChildren(h('a', { href: '/pricing', text: 'Pricing' })); });
        return;
      }
      var btn = h('button', { type: 'button', class: 'vbtn', text: 'Refresh radar' });
      btn.onclick = function () {
        btn.disabled = true; btn.textContent = 'Refreshing… 1 to 3 minutes';
        fetch('/api/demand?rebuild=1', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) {
          btn.textContent = j.rebuilt ? 'Done, reloading' : 'Not refreshed: ' + (j.note || 'try again later');
          if (j.rebuilt) setTimeout(function () { location.reload(); }, 800);
        }).catch(function () { btn.textContent = 'Failed, try again later'; btn.disabled = false; });
      };
      bar.replaceChildren(h('span', { class: 'lsub', text: 'Signed in as ' + me.name + ' · ' }), btn, h('a', { href: '/api/unlock?logout=1', class: 'lsub', style: 'margin-left:10px', text: 'Sign out' }));
    }).catch(function () {});
  }
  account();
  draw();
  ev('view', 'page');
  fetch('/api/demand').then(function (r) { return r.json(); }).then(function (d) { S.d = d; draw(); })
    .catch(function () { empty($('#dr-list'), 'The radar could not load right now. Try again in a minute.'); });
})();
