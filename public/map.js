// Kansenkaart — tekent /api/map.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var S = { d: null, cc: 'ALL', theme: '' };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PARTS = [['demand', 'var(--accent)'], ['growth', 'var(--ok)'], ['money', 'var(--mid)'], ['timing', '#8b5cf6'], ['gap', 'var(--warn)']];

  function h(tag, a) {
    var e = document.createElement(tag), k, i, c;
    for (k in a || {}) { if (a[k] == null || a[k] === false) continue; if (k === 'class') e.className = a[k]; else if (k === 'text') e.textContent = a[k]; else e.setAttribute(k, a[k]); }
    for (i = 2; i < arguments.length; i++) { c = arguments[i]; if (c == null || c === false) continue; (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x))); }); }
    return e;
  }
  function num(n) { return n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : Number(n).toLocaleString('en-US'); }
  function pct(x) { if (x == null) return '–'; var v = Math.round((x - 1) * 100); return (v >= 0 ? '+' : '') + v + '%'; }
  function safe(u) { return /^https?:\/\//.test(u || '') ? u : null; }
  function link(t, u) { return safe(u) ? h('a', { href: u, target: '_blank', rel: 'noopener' }, t) : h('span', null, t); }
  function cell(v, l, cls) { return h('div', { class: 'cell' }, h('div', { class: 'v ' + (cls || ''), text: v }), h('div', { class: 'l', text: l })); }
  function chip(t) { return h('span', { class: 'idea', text: t }); }

  function peakText(t) {
    if (!t || t.status === 'steady') return ['All year', 'no clear peak'];
    var src = t.source === 'measured' ? 'measured' : t.source === 'typical' ? 'typical period' : 'last year';
    if (t.status === 'now') return ['Now (' + MON[t.month - 1] + ')', 'peak · ' + src];
    return [MON[t.month - 1] + ' · ' + t.weeks + ' wks', 'next peak · ' + src];
  }

  function spark(series) {
    if (!series || series.length < 6) return null;
    var w = 260, hg = 46, vals = series.map(function (x) { return x.v; }), max = Math.max.apply(null, vals.concat([1]));
    var pts = vals.map(function (v, i) { return ((i / (vals.length - 1)) * (w - 4) + 2).toFixed(1) + ',' + (hg - 3 - (v / max) * (hg - 8)).toFixed(1); });
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hg); svg.setAttribute('width', w); svg.setAttribute('height', hg); svg.setAttribute('class', 'spark');
    var pl = document.createElementNS(NS, 'polyline'); pl.setAttribute('class', 'h'); pl.setAttribute('points', pts.join(' ')); svg.append(pl);
    return h('div', null, svg, h('div', { class: 'lsub', text: 'Monthly searches, ' + series[0].ym + ' to ' + series[series.length - 1].ym }));
  }

  function row(p, i) {
    var pk = peakText(p.timing), o = p.offer, a = o.apps;
    var offered = a ? a.count + ' apps' + (p.cc !== 'US' ? ' · ' + a.local + ' local' : '') : '–';
    if (o.serp) offered += ' · ' + o.serp.adCount + ' ads';
    var parts = h('div', { class: 'parts', title: PARTS.map(function (x) { return x[0] + ' ' + p.parts[x[0]]; }).join(', ') }, PARTS.map(function (x) { return h('i', { style: 'width:' + p.parts[x[0]] + '%;background:' + x[1] }); }));
    var det = h('details', null, h('summary', null, 'Details and sources'), h('div', { class: 'det' },
      p.demand.top.length ? h('div', null, h('h4', { text: 'Top searches per month' }), h('table', null, p.demand.top.map(function (k) { return h('tr', null, h('td', { text: k.k }), h('td', { class: 'n', text: num(k.v) }), h('td', { class: 'n', text: k.cpc != null ? '$' + k.cpc : '' })); }))) : null,
      p.demand.series && p.demand.series.length >= 6 ? spark(p.demand.series) : null,
      p.demand.questions.length ? h('div', null, h('h4', { text: 'Questions people type' }), h('div', { class: 'ideas' }, p.demand.questions.map(chip))) : null,
      p.demand.suggestions.length ? h('div', null, h('h4', { text: 'What people type in Google' }), h('div', { class: 'ideas' }, p.demand.suggestions.slice(0, 10).map(chip))) : null,
      p.demand.youtube.length || p.demand.amazon.length ? h('div', null, h('h4', { text: 'YouTube and Amazon' }), h('div', { class: 'ideas' }, p.demand.youtube.slice(0, 5).map(chip), p.demand.amazon.slice(0, 5).map(chip))) : null,
      a ? h('div', null, h('h4', { text: 'Apps already offering it' }), h('table', null, a.top.map(function (x) { return h('tr', null, h('td', null, link(x.name, x.url), h('span', { class: 'lsub', text: ' · ' + (x.seller || '') + (x.updated ? ' · updated ' + x.updated.slice(0, 7) : '') })), h('td', { class: 'n', text: num(x.ratings) + ' ratings' }), h('td', { class: 'n', text: x.local ? 'local' : '' })); }))) : null,
      o.serp ? h('div', null, h('h4', { text: 'On Google (top results · ads)' }), h('div', { class: 'ideas' }, o.serp.organic.slice(0, 6).map(function (x) { return chip(x.domain); })), o.serp.ads.length ? h('p', { class: 'lsub', text: 'Advertisers: ' + o.serp.ads.map(function (x) { return x.domain; }).join(', ') }) : null) : null,
      o.books ? h('div', null, h('h4', { text: 'Books' }), h('p', { class: 'lsub', text: num(o.books.total) + ' books, ' + o.books.recent + ' from the last two years' }), o.books.top.map(function (b) { return h('div', { class: 'lsub' }, link(b.title + (b.year ? ' (' + b.year + ')' : ''), b.url)); })) : null,
      p.trend.wiki ? h('div', null, h('h4', { text: 'Wikipedia interest' }), h('p', { class: 'lsub', text: p.trend.wiki.article + ': ' + num(p.trend.wiki.daily) + ' views a day, ' + pct(p.trend.wiki.yoy) + ' year on year, ' + pct(p.trend.wiki.outlook) + ' over the next six weeks last year' })) : null,
      p.news ? h('div', null, h('h4', { text: 'In the news' }), h('p', { class: 'lsub', text: p.news.total + ' articles in four weeks (per week: ' + p.news.weeks.join(', ') + ')' })) : null,
      p.note ? h('div', null, h('h4', { text: 'Timing note' }), h('p', { class: 'lsub', text: p.note })) : null,
      h('div', null, h('h4', { text: 'Sources answered' }), h('p', { class: 'lsub', text: Object.keys(p.ok).filter(function (k) { return p.ok[k]; }).join(', ') || 'none' }))
    ));
    return h('div', { class: 'opp' },
      h('div', { class: 'rank' }, h('span', { class: 'no', text: '#' + (i + 1) }), h('span', { class: 'sc', text: p.score }), parts),
      h('div', { style: 'min-width:0' },
        h('div', { class: 'line-top' }, h('div', null, h('span', { class: 'mk', text: p.cc }), h('span', { class: 'lname', text: p.niche })), h('span', { class: 'badge ' + (p.confidence === 'measured' ? 'p-early' : 'p-steady'), text: p.confidence === 'measured' ? 'measured' : 'signals' })),
        h('div', { class: 'cells' },
          cell(p.demand.volume != null ? num(p.demand.volume) : p.demand.breadth + ' searches', p.demand.volume != null ? 'searches / month' : 'distinct searches typed'),
          cell(pct(p.trend.yoy), p.trend.source ? 'year on year · ' + p.trend.source : 'trend', p.trend.yoy == null ? '' : p.trend.yoy >= 1.05 ? 'up' : p.trend.yoy <= 0.95 ? 'down' : ''),
          cell(pk[0], pk[1]),
          cell(p.money.cpc != null ? '$' + p.money.cpc : '–', p.money.cpc != null ? 'per click · competition ' + p.money.competition : 'ad price (needs search data)'),
          cell(offered, 'offered by')),
        h('p', { class: 'gapline' }, h('b', null, 'Gap: '), p.aiGap || (p.gaps[0] ? p.gaps[0].text : 'No clear gap found yet.')),
        h('p', { class: 'step' }, h('b', null, 'First step: '), p.firstStep),
        det));
  }

  function render() {
    var d = S.d; if (!d) return;
    var items = d.items.filter(function (p) { return S.cc === 'ALL' || p.cc === S.cc; });
    $('#maptitle').textContent = d.title;
    var soon = items.filter(function (p) { return p.timing.status === 'soon' || p.timing.status === 'now'; }).length;
    var vol = items.reduce(function (t, p) { return t + (p.demand.volume || 0); }, 0);
    $('#tiles').replaceChildren(
      h('div', { class: 'tile' }, h('div', { class: 'tv', text: items.length }), h('div', { class: 'tl', text: 'niche × country combinations' })),
      h('div', { class: 'tile' }, h('div', { class: 'tv', text: items[0] ? items[0].score : '–' }), h('div', { class: 'tl', text: items[0] ? 'best: ' + items[0].niche + ' (' + items[0].cc + ')' : 'best' })),
      h('div', { class: 'tile' }, h('div', { class: 'tv', text: soon }), h('div', { class: 'tl', text: 'peaking now or within ten weeks' })),
      h('div', { class: 'tile' }, h('div', { class: 'tv', text: d.mode === 'measured' ? num(vol) : '–' }), h('div', { class: 'tl', text: d.mode === 'measured' ? 'searches per month in total' : 'search volumes not connected' })),
      h('div', { class: 'tile' }, h('div', { class: 'tv', text: new Date(d.generatedAt).toLocaleDateString([], { day: 'numeric', month: 'short' }) }), h('div', { class: 'tl', text: 'last update' })));
    $('#banner').replaceChildren(d.mode === 'measured' ? '' : h('p', { class: 'banner', text: 'Showing free signals. Monthly search volumes, ad prices and who ranks on Google appear as soon as DataForSEO is connected.' }));
    $('#list').replaceChildren.apply($('#list'), items.length ? items.map(row) : [h('p', { class: 'empty', text: 'No results for this country.' })]);
  }

  function chips() {
    var box = $('#cc'); box.replaceChildren();
    [['ALL', 'All countries'], ['NL', 'Netherlands'], ['DE', 'Germany'], ['US', 'United States']].forEach(function (p) {
      var b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(S.cc === p[0]), text: p[1] });
      b.onclick = function () { S.cc = p[0]; chips(); render(); };
      box.append(b);
    });
  }

  function load(theme) {
    S.theme = theme || '';
    $('#reset').hidden = !S.theme;
    $('#list').replaceChildren(h('p', { class: 'loading', text: S.theme ? 'Mapping "' + S.theme + '": splitting it into niches and reading 9 sources for each. This takes one to three minutes' : 'Reading 9 sources for every niche and country' }));
    $('#tgo').disabled = true;
    fetch('/api/map?' + (S.theme ? 'theme=' + encodeURIComponent(S.theme) : 'pack=practice')).then(function (r) { return r.json(); }).then(function (d) {
      if (d.error) throw new Error(d.error);
      S.d = d; render();
      try { history.replaceState(null, '', S.theme ? '?theme=' + encodeURIComponent(S.theme) : location.pathname); } catch (_) {}
    }).catch(function (e) {
      $('#list').replaceChildren(h('p', { class: 'note', text: (e && e.message) || 'The map could not be built right now. Try again in a minute.' }));
    }).then(function () { $('#tgo').disabled = false; });
  }

  $('#tf').addEventListener('submit', function (e) { e.preventDefault(); var t = $('#theme').value.trim(); if (t.length < 3) { $('#tnote').className = 'note'; $('#tnote').textContent = 'Type a theme of at least three characters.'; return; } load(t); });
  $('#reset').onclick = function () { $('#theme').value = ''; load(''); };
  chips();
  var qt = new URLSearchParams(location.search).get('theme');
  if (qt) $('#theme').value = qt;
  load(qt || '');
})();
