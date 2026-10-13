// Idee-check: schoon resultaat met echte zoekvolumes (als die er zijn), interesse, momenten en lokaal.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PH = { early: ['Early', 'p-early'], rising: ['Rising', 'p-early'], peak: ['At its peak', 'p-peak'], falling: ['Falling', 'p-falling'], steady: ['Steady', 'p-steady'] };
  function h(t, a) { var e = document.createElement(t), k, i, c; for (k in a || {}) { if (a[k] == null) continue; if (k === 'class') e.className = a[k]; else if (k === 'text') e.textContent = a[k]; else e.setAttribute(k, a[k]); } for (i = 2; i < arguments.length; i++) { c = arguments[i]; if (c == null || c === false) continue; [].concat(c).forEach(function (x) { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x))); }); } return e; }
  function num(n) { return n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : Number(n).toLocaleString('en-US'); }
  function pc(x) { return x == null ? '–' : x >= 999 ? 'new' : (x >= 0 ? '+' : '') + Math.round(x) + '%'; }
  function pct1(x) { return x == null ? '–' : (x >= 1 ? '+' : '') + Math.round((x - 1) * 100) + '%'; }
  function safe(u) { return /^https?:\/\//.test(u || ''); }
  function spark(v, w, hg) {
    if (!v || v.length < 4) return null;
    var mx = Math.max.apply(null, v.concat([1]));
    var pts = v.map(function (x, i) { return ((i / (v.length - 1)) * (w - 4) + 2).toFixed(1) + ',' + (hg - 3 - (x / mx) * (hg - 6)).toFixed(1); });
    var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 ' + w + ' ' + hg); s.setAttribute('class', 'spark wide'); s.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS(NS, 'polyline'); p.setAttribute('class', 'h'); p.setAttribute('points', pts.join(' ')); s.append(p);
    var l = pts[pts.length - 1].split(','), c = document.createElementNS(NS, 'circle'); c.setAttribute('class', 'e'); c.setAttribute('cx', l[0]); c.setAttribute('cy', l[1]); c.setAttribute('r', 3); s.append(c);
    return s;
  }
  function row(label, value) { return h('div', { class: 'ck-row' }, h('span', { class: 'ck-l', text: label }), h('span', { class: 'ck-v' }, value)); }

  function render(c) {
    var ph = PH[c.phase] || PH.steady, m = c.measured, w = c.wiki, parts = [];
    parts.push(h('div', { class: 'ck-head' },
      h('div', { class: 'ck-score' }, String(c.score), h('small', null, '/100')),
      h('div', null, h('span', { class: 'badge ' + ph[1], text: ph[0] }), h('p', { class: 'ck-verdict', text: c.verdict }))));

    if (m) {
      var facts = [];
      if (m.last != null) facts.push(num(m.last) + ' searches in ' + MON[+m.period.split('-')[1] - 1]);
      else if (m.volume != null) facts.push(num(m.volume) + ' searches a month');
      if (m.yoy != null) facts.push(pc(m.yoy) + ' vs last year');
      if (m.cpc != null) facts.push('$' + Number(m.cpc).toFixed(2) + ' per click');
      parts.push(h('h3', null, 'Searches on Google'));
      if (facts.length) parts.push(h('p', { class: 'ck-big', text: facts.join(' · ') }));
      var sp = spark((m.series || []).map(function (x) { return x.v; }), 600, 80); if (sp) parts.push(sp);
      if (m.related && m.related.length) parts.push(h('div', { class: 'ck-list' }, m.related.slice(0, 6).map(function (r) { return row(r.k, num(r.volume) + ' / month' + (r.cpc != null ? ' · $' + Number(r.cpc).toFixed(2) : '')); })));
    } else {
      var sg = (c.suggest && c.suggest.google) || [];
      if (sg.length) { parts.push(h('h3', null, 'What people type')); parts.push(h('div', { class: 'tchips' }, sg.slice(0, 8).map(function (t) { return h('span', { class: 'tchip', text: t }); }))); }
    }

    var more = [];
    if (w) more.push(row('Interest (Wikipedia)', pct1(w.momentum) + ' this week · ' + pct1(w.yoy) + ' vs last year'));
    if (c.news && c.news.total) more.push(row('In the news', c.news.total + (c.news.capped ? '+' : '') + ' articles in 4 weeks'));
    (c.calendar || []).slice(0, 2).forEach(function (e) { more.push(row(e.name, e.date + ' · ' + (e.status === 'open' ? 'demand open now' : 'opens in ' + e.opensIn + ' days'))); });
    if (more.length) { parts.push(h('h3', null, 'Signals')); parts.push(h('div', { class: 'ck-list' }, more)); }

    var lo = c.local;
    if (lo && lo.error) parts.push(h('h3', null, 'Local'), h('p', { class: 'meta', text: lo.error }));
    else if (lo) {
      parts.push(h('h3', null, 'In ' + lo.place.name));
      parts.push(h('p', { class: 'cu-what', text: lo.verdict }));
      if (lo.competitors && lo.competitors.top && lo.competitors.top.length) parts.push(h('div', { class: 'ck-list' }, lo.competitors.top.slice(0, 4).map(function (p) { return row(p.name, safe(p.url) ? h('a', { href: p.url, target: '_blank', rel: 'noopener' }, 'map') : ''); })));
    }
    if (c.ai && !c.ai.error && c.ai.first_step) parts.push(h('p', { class: 'cu-idea' }, h('b', null, 'First step'), c.ai.first_step));
    $('#result').replaceChildren(h('div', { class: 'ck-card' }, parts));
  }

  function run(q, m, city) {
    var note = $('#note');
    if (q.length < 2) { note.textContent = 'Type an idea, product or service first.'; return; }
    $('#go').disabled = true; note.textContent = 'Checking “' + q + '”' + (city ? ' in ' + city : '') + '… about 10 seconds.';
    $('#result').replaceChildren(h('p', { class: 'loading', text: 'Reading search data' }));
    fetch('/api/check?m=' + m + '&c=' + encodeURIComponent(city) + '&q=' + encodeURIComponent(q), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (c) {
        if (c.error) throw new Error(c.error);
        render(c); note.textContent = '“' + q + '” · ' + ({ NL: 'Netherlands', DE: 'Germany', US: 'United States' })[m] + (city ? ' · ' + city : '');
        try { history.replaceState(null, '', '/check?q=' + encodeURIComponent(q) + '&m=' + m + (city ? '&c=' + encodeURIComponent(city) : '')); } catch (_) {}
        try { navigator.sendBeacon && navigator.sendBeacon('/api/e?x=page&k=check&v=A&c=check'); } catch (_) {}
      })
      .catch(function (e) { $('#result').replaceChildren(); note.textContent = (e && e.message) || 'The check failed. Try again in a minute.'; })
      .then(function () { $('#go').disabled = false; });
  }
  $('#check').addEventListener('submit', function (e) { e.preventDefault(); run($('#q').value.trim(), $('#m').value, $('#c').value.trim()); });
  var qs = new URLSearchParams(location.search);
  if (qs.get('q')) { $('#q').value = qs.get('q'); if (/^(NL|DE|US)$/.test(qs.get('m') || '')) $('#m').value = qs.get('m'); if (qs.get('c')) $('#c').value = qs.get('c'); run($('#q').value.trim(), $('#m').value, $('#c').value.trim()); }
})();
