// "What came up" — gemeten zoekopdrachten die het hardst groeien (/api/rising), opgeschoond en per onderwerp samengevoegd.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var S = { d: null, win: 'month', mk: 'ALL', n: 12 };
  var LBL = { new: ['New demand', 'p-early'], seasonal: ['Seasonal return', 'p-peak'], rising: ['Rising', 'p-rising'] };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ORDER = ['NL', 'DE', 'US'];
  function h(t, a) { var e = document.createElement(t), k, i, c; for (k in a || {}) { if (a[k] == null) continue; if (k === 'class') e.className = a[k]; else if (k === 'text') e.textContent = a[k]; else e.setAttribute(k, a[k]); } for (i = 2; i < arguments.length; i++) { c = arguments[i]; if (c == null || c === false) continue; (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x))); }); } return e; }
  function num(n) { return n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : Number(n).toLocaleString('en-US'); }
  function pc(x) { return x == null ? '–' : x >= 999 ? 'new' : (x >= 0 ? '+' : '') + Math.round(x).toLocaleString('en-US') + '%'; }
  function mon(p, long) { if (!p) return ''; var a = p.split('-'); return MON[+a[1] - 1] + (long ? ' ' + a[0] : ''); }
  function prevMon(p) { var a = p.split('-'), m = +a[1] - 1, y = +a[0]; if (m < 1) { m = 12; y--; } return MON[m - 1]; }
  function spark(m) {
    if (!m || m.length < 4) return null;
    var w = 120, hg = 32, v = m.map(function (x) { return x.v; }), mx = Math.max.apply(null, v.concat([1]));
    var pts = v.map(function (x, i) { return ((i / (v.length - 1)) * (w - 4) + 2).toFixed(1) + ',' + (hg - 3 - (x / mx) * (hg - 6)).toFixed(1); });
    var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 ' + w + ' ' + hg); s.setAttribute('width', w); s.setAttribute('height', hg); s.setAttribute('class', 'spark'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'polyline'); p.setAttribute('class', 'h'); p.setAttribute('points', pts.join(' ')); s.append(p);
    var last = pts[pts.length - 1].split(','), c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'e'); c.setAttribute('cx', last[0]); c.setAttribute('cy', last[1]); c.setAttribute('r', 2.6); s.append(c);
    return s;
  }
  function chipRow(box, key, opts) {
    box.replaceChildren(); opts.forEach(function (o) { var b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(S[key] === o[0]), text: o[1] }); b.onclick = function () { S[key] = o[0]; S.n = 12; draw(); }; box.append(b); });
  }
  // Alle landen: om en om de beste per land, zodat Nederland niet wegvalt onder de grote Amerikaanse aantallen.
  function interleave(list) {
    var by = {}, out = [], i, more = true;
    list.forEach(function (x) { (by[x.cc] = by[x.cc] || []).push(x); });
    for (i = 0; more; i++) { more = false; ORDER.forEach(function (cc) { if (by[cc] && by[cc][i]) { out.push(by[cc][i]); more = true; } }); }
    return out;
  }
  function row(x, i) {
    var l = LBL[x.label] || LBL.rising, also = (x.members || []).map(function (m) { return m.k; }).filter(function (k) { return k !== x.name; }).slice(0, 3);
    var month = S.win === 'month';
    return h('div', { class: 'line' },
      h('div', { class: 'line-main' },
        h('div', { class: 'line-top' },
          h('div', null, h('span', { class: 'lsub', text: '#' + (i + 1) + ' ' }), h('span', { class: 'mk', text: x.cc }),
            h('a', { class: 'lname', href: '/?q=' + encodeURIComponent(x.name) + '&m=' + x.cc + '#check', title: 'Check this demand' }, x.name)),
          h('span', { class: 'badge ' + l[1], text: l[0] })),
        x.what ? h('p', { class: 'cu-what', text: x.what }) : null,
        h('div', { class: 'lnums' },
          h('span', null, h('b', null, 'Searches in ' + mon(x.period) + ' '), num(x.last)),
          h('span', { class: x.mom > 0 ? 'up' : x.mom < 0 ? 'down' : '' }, h('b', null, 'vs ' + prevMon(x.period) + ' '), pc(x.mom)),
          x.yoy != null ? h('span', { class: x.yoy > 0 ? 'up' : x.yoy < 0 ? 'down' : '' }, h('b', null, 'vs a year ago '), pc(x.yoy)) : null,
          month && x.addedMonth > 0 ? h('span', null, h('b', null, 'Extra '), '+' + num(x.addedMonth) + ' searches') : null,
          !month && x.addedYear > 0 ? h('span', null, h('b', null, 'Extra '), '+' + num(x.addedYear) + ' searches') : null,
          x.cpc != null ? h('span', null, h('b', null, 'Ad price '), '$' + Number(x.cpc).toFixed(2)) : null,
          x.where && x.where.length ? h('span', null, h('b', null, 'Searched with '), x.where.slice(0, 4).join(', ')) : null),
        x.idea ? h('p', { class: 'cu-idea' }, h('b', null, 'Idea '), x.idea) : null,
        also.length ? h('p', { class: 'lsub cu-also', text: 'Also searched: ' + also.join(' · ') }) : null),
      spark(x.series));
  }
  function draw() {
    chipRow($('#cu-win'), 'win', [['month', 'Jumped this month'], ['year', 'Grew over the year']]);
    chipRow($('#cu-mk'), 'mk', [['ALL', 'All countries'], ['NL', 'Netherlands'], ['DE', 'Germany'], ['US', 'United States']]);
    var d = S.d, box = $('#cu-list'), note = $('#cu-note');
    if (!d) return;
    if (!d.ready) return box.replaceChildren(h('p', { class: 'empty', text: 'Measured search data is not connected yet.' }));
    if (note && d.period) note.textContent = 'Measured Google searches for ' + mon(d.period, true) + ', the latest month in the data. Refreshed daily.' + (d.ai === 'on' ? ' Sports, news and celebrity searches are filtered out.' : '');
    var list = (d.items[S.win] || []).filter(function (x) { return S.mk === 'ALL' || x.cc === S.mk; });
    if (S.mk === 'ALL') list = interleave(list);
    if (!list.length) return box.replaceChildren(h('p', { class: 'empty', text: d.errors && d.errors.length ? 'The measured search data is being refreshed. Check back later today.' : 'Nothing measured for this selection yet.' }));
    var rows = list.slice(0, S.n).map(row);
    if (list.length > S.n) { var more = h('button', { class: 'chip', type: 'button', style: 'margin-top:12px', text: 'Show ' + Math.min(12, list.length - S.n) + ' more' }); more.onclick = function () { S.n += 12; draw(); }; rows.push(more); }
    box.replaceChildren.apply(box, rows);
  }
  fetch('/api/rising').then(function (r) { return r.json(); }).then(function (d) { S.d = d; draw(); }).catch(function () { $('#cu-list').replaceChildren(h('p', { class: 'empty', text: 'Measured search data could not load right now.' })); });
  draw();
})();
