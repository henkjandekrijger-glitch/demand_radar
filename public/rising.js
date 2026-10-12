// "What came up" — gemeten zoekopdrachten die het hardst groeien (/api/rising).
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var S = { d: null, win: 'month', mk: 'ALL' };
  var LBL = { new: ['New growth', 'p-early'], seasonal: ['Seasonal return', 'p-peak'], rising: ['Rising', 'p-rising'] };
  var MK = { NL: 'Netherlands', DE: 'Germany', US: 'United States' };
  function h(t, a) { var e = document.createElement(t), k, i, c; for (k in a || {}) { if (a[k] == null) continue; if (k === 'class') e.className = a[k]; else if (k === 'text') e.textContent = a[k]; else e.setAttribute(k, a[k]); } for (i = 2; i < arguments.length; i++) { c = arguments[i]; if (c == null || c === false) continue; (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x))); }); } return e; }
  function num(n) { return n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : Number(n).toLocaleString('en-US'); }
  function pc(x) { return x == null ? '–' : (x >= 0 ? '+' : '') + Math.round(x) + '%'; }
  function spark(m) {
    if (!m || m.length < 4) return null;
    var w = 120, hg = 32, v = m.map(function (x) { return x.v; }), mx = Math.max.apply(null, v.concat([1]));
    var pts = v.map(function (x, i) { return ((i / (v.length - 1)) * (w - 4) + 2).toFixed(1) + ',' + (hg - 3 - (x / mx) * (hg - 6)).toFixed(1); });
    var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 ' + w + ' ' + hg); s.setAttribute('width', w); s.setAttribute('height', hg); s.setAttribute('class', 'spark'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'polyline'); p.setAttribute('class', 'h'); p.setAttribute('points', pts.join(' ')); s.append(p); return s;
  }
  function chipRow(box, key, opts) {
    box.replaceChildren(); opts.forEach(function (o) { var b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(S[key] === o[0]), text: o[1] }); b.onclick = function () { S[key] = o[0]; draw(); }; box.append(b); });
  }
  function draw() {
    chipRow($('#cu-win'), 'win', [['month', 'Biggest jump this month'], ['year', 'Grew most in a year']]);
    chipRow($('#cu-mk'), 'mk', [['ALL', 'All countries'], ['NL', 'Netherlands'], ['DE', 'Germany'], ['US', 'United States']]);
    var d = S.d, box = $('#cu-list');
    if (!d) return;
    if (!d.ready) return box.replaceChildren(h('p', { class: 'empty', text: 'Measured search data is not connected yet.' }));
    var list = (d.items[S.win] || []).filter(function (x) { return S.mk === 'ALL' || x.cc === S.mk; });
    if (S.mk === 'ALL') list = list.slice().sort(function (a, b) { return S.win === 'month' ? b.added - a.added : (b.trend.y || 0) - (a.trend.y || 0); });
    list = list.slice(0, 30);
    if (!list.length) return box.replaceChildren(h('p', { class: 'empty', text: d.errors && d.errors.length ? 'The search data could not be read right now (' + d.errors[0] + ').' : 'Nothing measured for this selection yet.' }));
    box.replaceChildren.apply(box, list.map(function (x, i) {
      var l = LBL[x.label] || LBL.rising;
      return h('div', { class: 'line' },
        h('div', { class: 'line-main' },
          h('div', { class: 'line-top' }, h('div', null, h('span', { class: 'lsub', text: '#' + (i + 1) + ' ' }), h('span', { class: 'mk', text: x.cc }), h('a', { class: 'lname', href: '/?q=' + encodeURIComponent(x.k) + '&m=' + x.cc + '#check', title: 'Check this search' }, x.k)), h('span', { class: 'badge ' + l[1], text: l[0] })),
          h('div', { class: 'lnums' },
            h('span', null, h('b', null, 'Searches / month '), num(x.volume)),
            h('span', { class: (x.trend.m || 0) > 0 ? 'up' : 'down' }, h('b', null, 'This month '), pc(x.trend.m)),
            h('span', { class: (x.trend.y || 0) > 0 ? 'up' : (x.trend.y || 0) < 0 ? 'down' : '' }, h('b', null, 'Year on year '), pc(x.trend.y)),
            S.win === 'month' && x.added ? h('span', null, h('b', null, 'Added '), '+' + num(x.added) + ' searches') : null,
            x.cpc != null ? h('span', null, h('b', null, 'Ad price '), '$' + x.cpc) : null)),
        spark(x.monthly));
    }));
  }
  fetch('/api/rising').then(function (r) { return r.json(); }).then(function (d) { S.d = d; draw(); }).catch(function () { $('#cu-list').replaceChildren(h('p', { class: 'empty', text: 'Measured search data could not load right now.' })); });
  draw();
})();
