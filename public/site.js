// Demand Radar — tekent de radar en de idee-check. Alle gegevens komen van /api/radar en /api/check.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var MK = { NL: 'Netherlands', US: 'United States', DE: 'Germany', WW: 'Worldwide' };
  var LANG_MK = { nl: ['NL'], en: ['US', 'WW'], de: ['DE'] };
  var PH = { early: 'Early', rising: 'Rising', peak: 'Peak', falling: 'Falling', steady: 'Steady' };
  var S = { data: null, market: 'ALL' };
  var V = 'A';

  // ---------- Leren: welke kop, tekst en knop werken het best (zie /api/learn) ----------
  function cookie(n) { var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  function ev(k) { try { var u = '/api/e?x=page&k=' + k + '&v=' + V; if (navigator.sendBeacon) navigator.sendBeacon(u); else fetch(u, { keepalive: true }); } catch (_) {} }
  function pickW(w) { var ks = Object.keys(w).sort(), r = Math.random(); for (var i = 0; i < ks.length; i++) { r -= w[ks[i]]; if (r < 0) return ks[i]; } return ks[0] || 'A'; }
  function variant() {
    var hero = $('#hero'), show = function () { hero.style.visibility = ''; };
    var timer = setTimeout(show, 700), had = cookie('dr_v');
    var seen = false; try { seen = sessionStorage.getItem('dr_seen') === '1'; sessionStorage.setItem('dr_seen', '1'); } catch (_) {}
    fetch('/api/ab').then(function (r) { return r.json(); }).then(function (p) {
      var vs = p.variants || {};
      V = had && vs[had] ? had : pickW(p.weights || { A: 1 });
      document.cookie = 'dr_v=' + V + '; Path=/; Max-Age=7776000; SameSite=Lax';
      var t = vs[V];
      if (t) { if (t.h1) hero.textContent = t.h1; if (t.lead) $('#lead').textContent = t.lead; if (t.cta) $('#go').textContent = t.cta; }
    }).catch(function () {}).then(function () { clearTimeout(timer); show(); if (!seen) ev('view'); });
  }
  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a[href^="mailto:"]'); if (a) ev('pro'); });

  function h(tag, attrs) {
    var e = document.createElement(tag), k, i, c;
    for (k in attrs || {}) {
      if (attrs[k] == null || attrs[k] === false) continue;
      if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else if (k === 'html') e.innerHTML = attrs[k]; else e.setAttribute(k, attrs[k]);
    }
    for (i = 2; i < arguments.length; i++) {
      c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x))); });
      else e.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return e;
  }
  function pct(x) { if (x == null) return '••'; var v = Math.round((x - 1) * 100); return (v >= 0 ? '+' : '') + v + '%'; }
  function cls(x) { return x == null ? '' : x >= 1.05 ? 'up' : x <= 0.95 ? 'down' : ''; }
  function num(n) { return n == null ? '••' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n.toLocaleString('en-US'); }
  function fdate(s) { var d = new Date(s + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  function inDays(d) { return d === 0 ? 'today' : d === 1 ? 'tomorrow' : d < 14 ? 'in ' + d + ' days' : 'in ' + Math.round(d / 7) + ' weeks'; }
  function safe(u) { return /^https?:\/\//.test(u || '') ? u : null; }
  function badge(p) { return h('span', { class: 'badge p-' + p, text: PH[p] || p }); }
  function mkTag(m) { return h('span', { class: 'mk', text: m }); }
  function link(text, url, c) { return safe(url) ? h('a', { class: c || 'lname', href: url, target: '_blank', rel: 'noopener' }, text) : h('span', { class: c || 'lname' }, text); }
  function lockHint() { return h('a', { class: 'lock-hint', href: '#pricing' }, 'Unlock'); }
  function showMk(list) { return S.market === 'ALL' || (list || []).indexOf(S.market) >= 0; }

  // Sparkline: 26 weken historie + (gestippeld) 8 weken verwachting op basis van vorig jaar.
  function spark(weeks, proj, w, hgt) {
    w = w || 150; hgt = hgt || 36;
    var all = (weeks || []).concat(proj || []), max = Math.max.apply(null, all.concat([1])), n = all.length;
    if (!n) return null;
    var X = function (i) { return (i / (n - 1)) * (w - 4) + 2; }, Y = function (v) { return hgt - 3 - (v / max) * (hgt - 6); };
    var hp = weeks.map(function (v, i) { return X(i).toFixed(1) + ',' + Y(v).toFixed(1); });
    var last = weeks.length - 1;
    var pp = proj && proj.length ? [X(last).toFixed(1) + ',' + Y(weeks[last]).toFixed(1)].concat(proj.map(function (v, i) { return X(last + 1 + i).toFixed(1) + ',' + Y(v).toFixed(1); })) : [];
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hgt); svg.setAttribute('width', w); svg.setAttribute('height', hgt); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
    var area = document.createElementNS(NS, 'polygon'); area.setAttribute('class', 'a'); area.setAttribute('points', hp.join(' ') + ' ' + X(last).toFixed(1) + ',' + hgt + ' 2,' + hgt); svg.append(area);
    var l1 = document.createElementNS(NS, 'polyline'); l1.setAttribute('class', 'h'); l1.setAttribute('points', hp.join(' ')); svg.append(l1);
    if (pp.length) { var l2 = document.createElementNS(NS, 'polyline'); l2.setAttribute('class', 'p'); l2.setAttribute('points', pp.join(' ')); svg.append(l2); }
    var dot = document.createElementNS(NS, 'circle'); dot.setAttribute('class', 'e'); dot.setAttribute('cx', X(last)); dot.setAttribute('cy', Y(weeks[last])); dot.setAttribute('r', 2.6); svg.append(dot);
    return svg;
  }

  function watchLine(x, mode) {
    var nums = [h('span', null, h('b', null, 'Score '), String(x.score))];
    if (mode === 'spike') nums.push(h('span', { class: cls(x.spike) }, h('b', null, 'Last 3 days vs month '), pct(x.spike)));
    nums.push(h('span', { class: cls(x.momentum) }, h('b', null, 'Week vs month '), pct(x.momentum)));
    nums.push(h('span', { class: cls(x.yoy) }, h('b', null, 'Year on year '), pct(x.yoy)));
    nums.push(h('span', { class: cls(x.outlook) }, h('b', null, 'Next 6 weeks, last year '), pct(x.outlook)));
    if (mode === 'season' && x.outlook > 1 && x.peakInDays > 3) nums.push(h('span', null, h('b', null, 'Peak '), 'about ' + inDays(x.peakInDays).replace('in ', '') + ' from now'));
    return h('div', { class: 'line' + (x.locked ? ' locked' : '') },
      h('div', { class: 'line-main' },
        h('div', { class: 'line-top' }, h('div', null, mkTag(x.market), link(x.name, x.url)), h('div', null, badge(x.phase), ' ', x.locked ? lockHint() : null)),
        h('div', { class: 'lsub' }, h('span', { class: 'blur' }, x.cat || ''), ' · ', num(x.daily), ' daily views'),
        h('div', { class: 'lnums' }, nums)),
      spark(x.weeks, x.proj));
  }

  function fill(el, nodes, emptyText) {
    el.replaceChildren();
    if (!nodes.length) el.append(h('p', { class: 'empty', text: emptyText }));
    else nodes.forEach(function (n) { el.append(n); });
  }

  function render() {
    var d = S.data; if (!d) return;
    var W = function (arr) { return (arr || []).filter(function (x) { return showMk([x.market]); }); };
    var products = W(d.spikes.products), rising = W(d.rising), seasonal = W(d.upcoming.seasonal);
    var cal = d.upcoming.calendar.filter(function (e) { return showMk(e.markets); });
    var search = d.spikes.search.filter(function (g) { return showMk([g.geo]); });
    var att = d.spikes.attention.filter(function (g) { return showMk(LANG_MK[g.lang]); });
    var nSearch = search.reduce(function (a, g) { return a + g.items.length; }, 0), nAtt = att.reduce(function (a, g) { return a + g.items.length; }, 0);
    var open = cal.filter(function (e) { return e.status === 'open'; }).length;
    var t = new Date(d.generatedAt);
    fill($('#tiles'), [
      [products.length + nSearch + nAtt, 'spikes right now'], [rising.length, 'products rising'], [open, 'demand windows open'],
      [seasonal.length, 'seasonal rises ahead'], [t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 'last update']
    ].map(function (p) { return h('div', { class: 'tile' }, h('div', { class: 'tv', text: p[0] }), h('div', { class: 'tl', text: p[1] })); }), '');

    fill($('#spk-products'), products.map(function (x) { return watchLine(x, 'spike'); }), 'No product spikes in this market today.');

    fill($('#spk-search'), search.map(function (g) {
      return h('div', { class: 'card' }, h('h4', null, mkTag(g.geo), MK[g.geo]), g.items.map(function (x) {
        return h('div', { class: 'mini' + (x.locked ? ' locked' : '') },
          h('div', { class: 'line-top' }, h('span', { class: 'lname', text: x.name }), h('span', { class: 'badge p-rising', text: (x.traffic || '?') + ' searches' })),
          x.news && x.news.title ? h('div', { class: 'lsub' }, h('span', { class: 'blur' }, link(x.news.title, x.news.url, 'x')), x.news.source ? ' · ' : '', h('span', { class: 'blur', text: x.news.source || '' })) : null);
      }));
    }), 'Google trending searches are not available right now.');

    fill($('#spk-attention'), att.map(function (g) {
      return h('div', { class: 'card' }, h('h4', null, mkTag(g.lang.toUpperCase()), 'Wikipedia ' + g.lang.toUpperCase(), g.day ? h('span', { class: 'lsub', text: ' · ' + fdate(g.day) }) : null),
        g.items.length ? g.items.map(function (x) {
          return h('div', { class: 'mini' + (x.locked ? ' locked' : '') },
            h('div', { class: 'line-top' }, link(x.name, x.url), h('span', { class: 'badge p-early', text: '×' + x.ratio })),
            h('div', { class: 'lsub', text: num(x.views) + ' views, normally ' + num(x.base) }));
        }) : h('p', { class: 'empty', text: 'No unusual jumps yesterday.' }));
    }), 'Wikipedia data is not available right now.');

    fill($('#up-cal'), cal.map(function (e, i) {
      var st = e.status === 'open' ? h('span', { class: 'badge p-early', text: 'Window open' }) : h('span', { class: 'badge p-rising', text: 'Opens ' + inDays(e.opensIn) });
      return h('div', { class: 'line' + (e.locked ? ' locked' : '') }, h('div', { class: 'line-main' },
        h('div', { class: 'line-top' }, h('div', null, e.markets.map(mkTag), h('span', { class: 'lname', style: 'filter:none', text: e.name })), h('div', null, e.kind === 'regulation' ? h('span', { class: 'badge p-peak', text: 'Regulation' }) : null, ' ', st)),
        h('div', { class: 'lsub', text: fdate(e.date) + ' · ' + inDays(e.days) + ' · searches usually start rising ' + e.lead + ' days before' }),
        h('div', { class: 'ideas' }, e.ideas.map(function (i) { return h('span', { class: 'idea', text: i }); }), e.locked ? lockHint() : null)));
    }), 'No demand windows for this market in the next four months.');

    fill($('#up-weather'), (d.upcoming.weather || []).filter(function (w) { return showMk([w.market]); }).map(function (w) {
      return h('div', { class: 'card' + (w.locked ? ' locked' : '') }, h('h4', null, mkTag(w.market), w.city),
        h('div', { class: 'lsub' }, 'Next 7 days ', h('span', { class: 'temp', text: Math.round(w.next) + '°C' }), ' · last week ' + Math.round(w.past) + '°C · lowest ' + Math.round(w.minLow) + '°C'),
        w.triggers.length ? w.triggers.map(function (t) { return h('div', { class: 'mini' }, h('div', { class: 'line-top' }, h('span', { style: 'font-weight:600;color:var(--ink)', text: t.name })), h('div', { class: 'ideas' }, t.ideas.map(function (i) { return h('span', { class: 'idea', text: i }); }), w.locked ? lockHint() : null)); })
          : h('p', { class: 'empty', text: 'No weather trigger in the next two weeks.' }));
    }), 'Weather data is not available right now.');
    fill($('#up-seasonal'), seasonal.map(function (x) { return watchLine(x, 'season'); }), 'No strong seasonal rises ahead for this market.');
    fill($('#chart-grid'), (d.charts || []).filter(function (g) { return showMk([g.geo]); }).map(function (g) {
      return h('div', { class: 'card' }, h('h4', null, mkTag(g.geo), g.kind === 'apps' ? 'Top free apps' : 'Top paid books'), g.items.map(function (x) {
        return h('div', { class: 'mini' + (x.locked ? ' locked' : '') }, h('div', { class: 'line-top' }, h('span', null, h('span', { class: 'lsub', text: x.rank + '. ' }), link(x.name, x.url)), x.locked ? lockHint() : null), h('div', { class: 'lsub' }, h('span', { class: 'blur', text: x.artist + (x.genre ? ' · ' + x.genre : '') })));
      }));
    }), 'Charts are not available right now.');
    fill($('#rising-list'), rising.map(function (x) { return watchLine(x); }), 'Nothing is clearly rising in this market right now.');

    var all = W(d.watch); $('#n-all').textContent = all.length; $('#n-watch').textContent = d.watch.length;
    var tb = $('#all'); tb.replaceChildren(h('thead', null, h('tr', null, ['Product', 'Market', 'Phase', 'Score', 'Week vs month', 'Year on year', 'Next 6 weeks', 'Daily views'].map(function (c) { return h('th', { text: c }); }))));
    var body = h('tbody'); all.forEach(function (x) {
      body.append(h('tr', { class: x.locked ? 'locked' : '' }, h('td', null, link(x.name, x.url)), h('td', { text: x.market }), h('td', null, badge(x.phase)), h('td', { class: 'num', text: x.score }),
        h('td', { class: 'num ' + cls(x.momentum), text: pct(x.momentum) }), h('td', { class: 'num ' + cls(x.yoy), text: pct(x.yoy) }), h('td', { class: 'num ' + cls(x.outlook), text: pct(x.outlook) }), h('td', { class: 'num', text: num(x.daily) })));
    });
    tb.append(body);
  }

  function chips() {
    var box = $('#markets'); box.replaceChildren();
    [['ALL', 'All markets'], ['NL', 'Netherlands'], ['US', 'United States'], ['DE', 'Germany'], ['WW', 'Worldwide']].forEach(function (p) {
      var b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(S.market === p[0]), text: p[1] });
      b.onclick = function () { S.market = p[0]; try { localStorage.setItem('dr_mk', p[0]); } catch (_) {} chips(); render(); };
      box.append(b);
    });
  }

  function setPlan(pro) {
    $('#plan').textContent = pro ? 'Pro' : 'Pilot · €39 a month';
    $('#plan').classList.toggle('pro', !!pro);
    $('#paybar').hidden = !!pro;
    $('#pro-out').hidden = !pro;
  }

  function load(tries) {
    fetch('/api/radar', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error);
      S.data = d; setPlan(d.pro); render();
    }).catch(function () {
      if ((tries || 0) < 2) return setTimeout(function () { load((tries || 0) + 1); }, 4000);
      ['#spk-products', '#up-cal', '#up-seasonal', '#rising-list', '#chart-grid'].forEach(function (s) { fill($(s), [], 'The radar could not load right now. Refresh the page in a minute.'); });
    });
  }

  // ---------- Idee checken ----------
  function tile(v, l, c) { return h('div', { class: 'tile' }, h('div', { class: 'tv ' + (c || ''), text: v }), h('div', { class: 'tl', text: l })); }
  function renderCheck(c) {
    var box = $('#result'), L = !!c.locked, w = c.wiki, n = c.news;
    var parts = [
      h('div', { class: 'r-head' }, h('div', { class: 'r-score' }, String(c.score), h('small', null, '/100')),
        h('div', null, badge(c.phase), h('span', { class: 'lname', text: c.q + ' · ' + MK[c.market] }), h('p', { class: L ? 'blurall' : '', style: 'margin:0', text: c.verdict })))
    ];
    if (w) {
      parts.push(h('div', { class: 'tiles' + (L ? ' blurall' : '') }, tile(num(w.daily), 'daily views'), tile(pct(w.momentum), 'week vs month', cls(w.momentum)), tile(pct(w.yoy), 'year on year', cls(w.yoy)), tile(pct(w.outlook), 'next 6 weeks, last year', cls(w.outlook)), tile(w.peakInDays == null ? '••' : w.peakInDays <= 3 ? 'now' : inDays(w.peakInDays), 'next peak, by last year')));
      parts.push(h('div', { class: L ? 'blurall' : '' }, spark(w.weeks, w.proj, 560, 70)));
      parts.push(h('p', { class: 'micro' }, 'Measured on Wikipedia (' + w.lang + '): ', h('span', { class: L ? 'blurall' : '' }, link(w.article, w.url, 'x')), '. Solid line: last 26 weeks. Dotted: next 8 weeks if this year follows last year.'));
    }
    if (n) {
      var mx = Math.max.apply(null, n.weeks.concat([1]));
      parts.push(h('h3', null, 'World news · ' + n.total + (n.capped ? '+' : '') + ' articles in four weeks'));
      parts.push(h('div', { class: 'weekbars', title: 'Articles per week, oldest left' }, n.weeks.map(function (v) { return h('i', { style: 'height:' + Math.max(2, Math.round((v / mx) * 44)) + 'px' }); })));
      parts.push(h('div', { class: L ? 'blurall' : '' }, n.top.map(function (a) { return h('div', { class: 'headline' }, link(a.title, a.url, 'x'), h('span', { class: 'lsub', text: ' · ' + (a.source || '') })); })));
    }
    if (c.trending && c.trending.length) parts.push(h('h3', null, 'Trending on Google today'), h('div', { class: 'ideas' + (L ? ' blurall' : '') }, c.trending.map(function (t) { return h('span', { class: 'idea', text: t.name + ' · ' + t.traffic }); })));
    if (c.calendar && c.calendar.length) parts.push(h('h3', null, 'Related demand moments'), h('div', null, c.calendar.map(function (e) { return h('div', { class: 'lsub' }, e.name + ' · ' + fdate(e.date) + ' · ' + (e.status === 'open' ? 'window open now' : 'window opens ' + inDays(e.opensIn))); })));
    var sg = c.suggest || {};
    if ((sg.google || []).length + (sg.youtube || []).length + (sg.amazon || []).length) {
      parts.push(h('h3', null, 'What people type'));
      [['Google', sg.google], ['YouTube', sg.youtube], ['Amazon', sg.amazon]].forEach(function (p) {
        if (p[1] && p[1].length) parts.push(h('div', { class: 'ideas' + (L ? ' blurall' : ''), style: 'align-items:center' }, h('b', { class: 'lsub', style: 'filter:none' }, p[0] + ':'), p[1].slice(0, 8).map(function (t) { return h('span', { class: 'idea', text: t }); })));
      });
    }
    function feedBlock(title, f, withSubs) {
      if (!f) return;
      var mx = Math.max.apply(null, f.weeks.concat([1]));
      parts.push(h('h3', null, title + ' · ' + f.total + (f.capped ? '+' : '') + ' in four weeks'));
      parts.push(h('div', { class: 'weekbars' }, f.weeks.map(function (v) { return h('i', { style: 'height:' + Math.max(2, Math.round((v / mx) * 44)) + 'px' }); })));
      if (withSubs && f.subs && f.subs.length) parts.push(h('p', { class: 'micro' + (L ? ' blurall' : '') }, f.subs.join(' · ')));
      parts.push(h('div', { class: L ? 'blurall' : '' }, (f.top || []).slice(0, 4).map(function (a) { return h('div', { class: 'headline' }, a.url && title !== 'Google News' ? link(a.title, a.url, 'x') : h('span', { text: a.title }), h('span', { class: 'lsub' }, ' · ', title === 'Google News' && a.url ? link(a.source, a.url, 'x') : (a.source || ''))); })));
    }
    feedBlock('Google News', c.gnews);
    feedBlock('Reddit', c.reddit, true);
    if (c.hn && c.hn.total) feedBlock('Hacker News', c.hn);
    if (c.weather) parts.push(h('h3', null, 'Weather · ' + c.weather.city), h('p', { class: 'lsub' }, 'Next 7 days ' + Math.round(c.weather.next) + '°C, last week ' + Math.round(c.weather.past) + '°C' + (c.weather.triggers.length ? ' · ' + c.weather.triggers.map(function (t) { return t.name; }).join(' · ') : ' · no weather trigger')));
    var lo = c.local;
    if (lo && lo.error) parts.push(h('h3', null, 'Local'), h('p', { class: 'note', text: lo.error }));
    else if (lo) {
      var pl = lo.place, cp = lo.competitors;
      parts.push(h('h3', null, 'Local · ' + pl.name + (pl.region ? ', ' + pl.region : '') + (pl.population ? ' · ' + num(pl.population) + ' inhabitants' : '')));
      parts.push(h('p', { class: L ? 'blurall' : '', text: lo.verdict }));
      parts.push(h('div', { class: 'tiles' }, tile(String(lo.suggestions.length), 'searches with the city name'), tile(lo.news ? String(lo.news.total) : '–', 'local news, 4 weeks'), tile(lo.reddit ? String(lo.reddit.total) : '–', 'local Reddit posts'), tile(cp ? cp.count + (cp.capped ? '+' : '') : '–', 'places on the map'), tile(cp && cp.per10k != null ? String(cp.per10k) : '–', 'per 10,000 inhabitants')));
      if (lo.suggestions.length) parts.push(h('div', { class: 'ideas' + (L ? ' blurall' : '') }, lo.suggestions.slice(0, 8).map(function (t) { return h('span', { class: 'idea', text: t }); })));
      if (cp && cp.top.length) parts.push(h('div', { class: L ? 'blurall' : '', style: 'margin-top:8px' }, cp.top.map(function (p) { return h('div', { class: 'headline' }, link(p.name, p.url, 'x'), h('span', { class: 'lsub', text: ' · ' + p.type })); })));
    }
    if (c.ai && !c.ai.error) {
      var a = c.ai;
      parts.push(h('h3', null, 'AI analyst'), h('p', { text: a.verdict || '' }));
      if (a.drivers && a.drivers.length) parts.push(h('p', { class: 'micro', style: 'color:var(--body)' }, h('b', null, 'Drivers: '), a.drivers.join(' · ')));
      if (a.risks && a.risks.length) parts.push(h('p', { class: 'micro', style: 'color:var(--body)' }, h('b', null, 'Risks: '), a.risks.join(' · ')));
      if (a.timing) parts.push(h('p', { class: 'micro', style: 'color:var(--body)' }, h('b', null, 'Timing: '), a.timing));
      if (a.first_step) parts.push(h('p', { class: 'micro', style: 'color:var(--ink)' }, h('b', null, 'First step: '), a.first_step));
      if (a.sources && a.sources.length) parts.push(h('div', { class: 'ideas' }, a.sources.filter(function (s) { return safe(s.url); }).slice(0, 5).map(function (s) { return link(s.title || s.url, s.url, 'idea'); })));
    } else if (c.pro && c.aiEnabled === false) {
      parts.push(h('p', { class: 'micro' }, 'The AI analyst is not available right now.'));
    }
    if (c.sources) parts.push(h('p', { class: 'srcs', text: c.sources.filter(function (x) { return x.ok; }).length + ' of ' + c.sources.length + ' sources answered: ' + c.sources.filter(function (x) { return x.ok; }).map(function (x) { return x.name; }).join(', ') + '.' }));
    if (L) parts.push(h('div', { class: 'unlock' }, h('p', null, 'See the timing, the news behind it and the sources.'), h('a', { class: 'cta', href: '#pricing' }, 'Unlock with Pro')));
    box.replaceChildren(h('div', { class: 'card result' }, parts));
  }

  $('#check').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var q = $('#q').value.trim(), m = $('#m').value, city = $('#c').value.trim(), note = $('#checkNote');
    if (q.length < 2) { note.textContent = 'Type an idea, product or service first.'; note.className = 'note'; return; }
    ev('check');
    $('#go').disabled = true; note.className = 'micro'; note.textContent = 'Checking live sources for “' + q + '”' + (city ? ' in ' + city : '') + '…';
    $('#result').replaceChildren(h('p', { class: 'loading', text: 'Reading search, Wikipedia and news data' }));
    fetch('/api/check?m=' + m + '&c=' + encodeURIComponent(city) + '&q=' + encodeURIComponent(q), { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (c) {
      if (c.error) throw new Error(c.error);
      renderCheck(c); note.textContent = 'Checked ' + new Date(c.generatedAt).toLocaleString() + '.';
      try { history.replaceState(null, '', '?q=' + encodeURIComponent(q) + '&m=' + m + (city ? '&c=' + encodeURIComponent(city) : '') + '#check'); } catch (_) {}
    }).catch(function (e) {
      $('#result').replaceChildren(); note.className = 'note'; note.textContent = (e && e.message) || 'The check failed. Try again in a minute.';
    }).then(function () { $('#go').disabled = false; });
  });

  // ---------- Dagmail ----------
  $('#daily').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('#se').value.trim(), note = $('#snote');
    var mks = Array.prototype.slice.call(document.querySelectorAll('input[name="mk"]:checked')).map(function (x) { return x.value; });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { note.className = 'note'; note.textContent = 'Type your email address first.'; return; }
    if (!mks.length) { note.className = 'note'; note.textContent = 'Pick at least one market.'; return; }
    $('#sgo').disabled = true;
    fetch('/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, markets: mks, hp: $('#hp').value, v: V, src: new URLSearchParams(location.search).get('src') || '' }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        if (j.error) throw new Error(j.error);
        note.className = 'note ok';
        note.textContent = j.status === 'active' ? 'You are already subscribed. Your markets are updated.' : j.status === 'confirm' ? 'Almost done: click the link in the mail we just sent you.' : 'Thanks, you are on the list. You will get a mail to confirm soon.';
        $('#se').value = '';
      }).catch(function (err) { note.className = 'note'; note.textContent = (err && err.message) || 'That did not work. Try again in a minute.'; })
      .then(function () { $('#sgo').disabled = false; });
  });

  var qs = new URLSearchParams(location.search);
  var subMsg = { ok: 'You are subscribed. The first Demand of the day arrives tomorrow morning.', bye: 'You are unsubscribed. You will not get the mail any more.', invalid: 'That link is no longer valid.' }[qs.get('sub')];
  if (subMsg) { $('#snote').className = qs.get('sub') === 'invalid' ? 'note' : 'note ok'; $('#snote').textContent = subMsg; }
  variant();
  if (qs.get('unlock') === 'fail') { $('#keynote').hidden = false; $('#keynote').textContent = 'That key is not valid. Check it and try again.'; }
  if (qs.get('unlock') === 'ok') { $('#keynote').hidden = false; $('#keynote').className = 'note ok'; $('#keynote').textContent = 'Pro is unlocked on this browser.'; }
  try { S.market = localStorage.getItem('dr_mk') || 'ALL'; } catch (_) {}
  chips(); load(0);
  try { $('#mcp-url').textContent = location.origin + '/mcp?key=YOUR-KEY'; } catch (_) {}
  if (qs.get('c')) $('#c').value = qs.get('c');
  if (qs.get('q')) { $('#q').value = qs.get('q'); if (MK[qs.get('m')]) $('#m').value = qs.get('m'); $('#check').requestSubmit(); }
})();
