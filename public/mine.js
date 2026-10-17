// "Your business": website + een paar vragen (één per keer) → dagelijks passende voorspellingen. /mine en /mine/<id>.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var CCN = { NL: 'Netherlands', DE: 'Germany', US: 'United States' };
  var app = $('#m-app');
  function h(t, a) { var e = document.createElement(t), k, i, c; for (k in a || {}) { if (a[k] == null) continue; if (k === 'class') e.className = a[k]; else if (k === 'text') e.textContent = a[k]; else if (k.slice(0, 2) === 'on') e[k] = a[k]; else e.setAttribute(k, a[k]); } for (i = 2; i < arguments.length; i++) { c = arguments[i]; if (c == null || c === false) continue; (Array.isArray(c) ? c : [c]).forEach(function (x) { if (x != null && x !== false) e.append(x.nodeType ? x : document.createTextNode(String(x))); }); } return e; }
  function num(n) { return n == null ? '–' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : Number(n).toLocaleString('en-US'); }
  function pc(x) { return x == null ? '–' : (x >= 0 ? '+' : '') + Math.round(x) + '%'; }
  function day(s) { if (!s) return ''; var a = String(s).slice(0, 10).split('-'); return +a[2] + ' ' + MON[+a[1] - 1]; }
  function show() { app.replaceChildren.apply(app, [].slice.call(arguments).filter(Boolean)); window.scrollTo(0, 0); }
  function api(path, body) { return fetch(path, body ? { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'same-origin' }).then(function (r) { return r.json().then(function (j) { j._status = r.status; return j; }); }); }
  function mine() { try { return JSON.parse(localStorage.getItem('dr-mine') || '[]'); } catch (e) { return []; } }
  function remember(x) { try { var l = mine().filter(function (y) { return y.id !== x.id; }); l.unshift(x); localStorage.setItem('dr-mine', JSON.stringify(l.slice(0, 20))); } catch (e) {} }
  function spark(v) {
    if (!v || v.length < 4) return null;
    var NS = 'http://www.w3.org/2000/svg', w = 120, hg = 32, mx = Math.max.apply(null, v.concat([1])), s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    s.setAttribute('viewBox', '0 0 ' + w + ' ' + hg); s.setAttribute('width', w); s.setAttribute('height', hg); s.setAttribute('class', 'm-spark'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('class', 'h');
    p.setAttribute('d', v.map(function (x, i) { return (i ? 'L' : 'M') + ((i / (v.length - 1)) * (w - 4) + 2).toFixed(1) + ' ' + (hg - 3 - (x / mx) * (hg - 6)).toFixed(1); }).join(' '));
    s.append(p); return s;
  }
  function stepHead(n, of, q) { return h('div', { class: 'm-step' }, h('span', { class: 'meta', text: 'Step ' + n + ' of ' + of }), h('h2', { text: q })); }
  function err(msg) { return h('p', { class: 'm-err', text: msg }); }

  // ---------- Volgen: /mine/<id> ----------
  var KIND = [['direct', 'About what you sell'], ['adjacent', 'Next to what you do'], ['moment', 'Moments to prepare for'], ['threat', 'Watch out']];
  var TYPE = { rise: 'Will rise', now: 'Rising now', early: 'Early signal', coming: 'Coming up', missing: "Doesn't exist yet", today: 'Today', wild: 'Wildcard' };
  function matchRow(m) {
    var meta = [];
    if (m.type === 'rise' && m.chance != null) meta.push(m.chance + '% chance of +40%' + (m.peak ? ' by ' + MON[m.peak.m - 1] : ''));
    if (m.type === 'now' && m.yoy != null) meta.push(pc(m.yoy) + ' on last year' + (m.v ? ' · ' + num(m.v) + ' searches a month' : ''));
    if (m.type === 'early' && m.chance != null) meta.push((m.tier === 'starting' ? 'Starting' : 'Not visible yet') + ' · ' + m.chance + '% chance it breaks out');
    if (m.type === 'coming' && m.date) meta.push(day(m.date) + (m.days != null ? (m.days > 0 ? ' · in ' + m.days + ' days' : ' · now') : ''));
    if (m.type === 'wild' && m.status) meta.push((m.status === 'open' ? 'Open' : m.status) + (m.due ? ' · checked ' + day(m.due) : ''));
    var q = m.q || (m.terms && m.terms[0]);
    return h('div', { class: 'line wild' },
      h('div', { class: 'line-top' }, h('div', null, h('span', { class: 'mk', text: m.cc }), h('b', { class: 'wild-t', text: m.name })), h('div', { class: 'badges' }, h('span', { class: 'badge ' + (m.kind === 'threat' ? 'p-falling' : m.fit >= 3 ? 'p-early' : 'p-rising'), text: TYPE[m.type] || m.type }))),
      h('p', { class: 'wild-claim', text: m.say }),
      h('p', { class: 'meta' }, meta.join(' · '), meta.length && q ? ' · ' : '', q ? h('a', { href: '/check?q=' + encodeURIComponent(q) + '&m=' + String(m.cc).split('/')[0] + '#check', text: 'Check "' + q + '"' }) : null));
  }
  function ownBlock(cc, o) {
    var top = (o.terms || []).slice(0, 8), rest = (o.terms || []).slice(8);
    var row = function (t) { return h('tr', null, h('td', null, t.k, t.early ? h('span', { class: 'badge p-early m-eb', text: 'Early signal ' + t.early.chance + '%' }) : null), h('td', { class: 'n', text: num(t.v) }), h('td', { class: 'n ' + (t.yoy == null ? '' : t.yoy >= 10 ? 'up' : t.yoy <= -10 ? 'down' : ''), text: pc(t.yoy) }), h('td', { class: 'sp' }, spark(t.spark))); };
    var tb = h('tbody', null, top.map(row));
    return h('div', { class: 'm-own' },
      h('div', { class: 'm-own-h' }, h('span', { class: 'mk', text: cc }), h('b', { text: CCN[cc] }), o.spark && o.spark.length > 3 ? spark(o.spark) : null),
      o.total ? h('p', { class: 'meta', text: num(o.total) + ' searches in ' + (o.month ? MON[+o.month.slice(5) - 1] : 'the last month') + (o.yoy != null ? ' · ' + pc(o.yoy) + ' on last year (last 3 months)' : '') }) : null,
      top.length ? h('table', { class: 'm-tab' }, h('thead', null, h('tr', null, h('th', { text: 'Search' }), h('th', { class: 'n', text: 'A month' }), h('th', { class: 'n', text: 'vs last year' }), h('th', { text: '' }))), tb) : null,
      rest.length ? h('button', { class: 'chip', type: 'button', style: 'margin-top:8px', text: 'Show ' + rest.length + ' more', onclick: function (e) { rest.forEach(function (t) { tb.append(row(t)); }); e.target.remove(); } }) : null,
      o.waiting && o.waiting.length ? h('p', { class: 'meta', text: (top.length ? 'Still collecting 4 years of data for ' + o.waiting.length + ' more searches' : 'Collecting 4 years of data for ' + o.waiting.length + ' searches') + '; ready within a day.' }) : null,
      o.rare && o.rare.length ? h('p', { class: 'meta', text: 'Too few searches to measure: ' + o.rare.join(', ') + '.' }) : null);
  }
  function follow(id) {
    $('#m-h').textContent = 'Loading your business';
    api('/api/mine?id=' + encodeURIComponent(id)).then(function (d) {
      if (d.error) { $('#m-h').textContent = 'Not found.'; $('#m-lead').textContent = d.error; show(h('p', null, h('a', { href: '/mine', text: 'Add your business' }))); return; }
      var p = d.profile; remember({ id: d.id, name: p.name }); document.title = p.name + ' · Demand Radar';
      $('#m-h').textContent = p.name;
      $('#m-lead').replaceChildren(p.summary + ' ', d.url ? String(d.url).split(' ').reduce(function (acc, u, i) { return acc.concat([i ? ' · ' : '', h('a', { href: u, rel: 'noopener', target: '_blank', text: u.replace(/^https?:\/\//, '').replace(/\/$/, '') })]); }, []) : null);
      var parts = [h('p', { class: 'status', text: 'Matched to today\'s radar (' + day(d.radarDay || d.day) + ') · ' + p.countries.map(function (c) { return CCN[c]; }).join(', ') + ' · updates every day, keep this link' })];
      parts.push(h('h2', { class: 'm-sec', text: 'What the radar sees for you' }));
      if (d.note) parts.push(err(d.note));
      var any = false;
      KIND.forEach(function (k) {
        var l = (d.matches || []).filter(function (m) { return m.kind === k[0]; }); if (!l.length) return; any = true;
        parts.push(h('div', { class: 'early-head' }, h('b', null, k[1]), h('span', { class: 'meta', text: ' · ' + l.length })));
        l.forEach(function (m) { parts.push(matchRow(m)); });
      });
      if (!any && !d.note) parts.push(h('p', { class: 'meta', text: 'Nothing on today\'s radar touches your business directly. We check again every day.' }));
      parts.push(h('h2', { class: 'm-sec', text: 'Demand for what you sell' }));
      parts.push(h('p', { class: 'meta', text: 'Monthly Google searches for what your customers type, with the trend and our early-signal test on each.' }));
      Object.keys(d.own || {}).forEach(function (cc) { parts.push(ownBlock(cc, d.own[cc])); });
      parts.push(h('p', { class: 'm-foot' }, h('a', { href: '/mine', text: 'Add another business' }), ' · ', h('a', { href: '/', text: 'Open the full radar' })));
      show.apply(null, parts);
    }).catch(function () { $('#m-h').textContent = 'Could not load.'; show(err('Try again in a minute.')); });
  }

  // ---------- Toevoegen: één vraag per keer ----------
  var W = {};
  function start() {
    var url = h('input', { id: 'm-url', maxlength: '200', autocomplete: 'url', placeholder: 'yourwebsite.com (more sites: separate with a space)', 'aria-label': 'Your website' });
    var txt = h('textarea', { id: 'm-txt', rows: '2', maxlength: '600', placeholder: 'No website? Describe what you sell in one sentence.', 'aria-label': 'Describe your business' });
    var note = h('p', { class: 'status', text: '' }), go = h('button', { class: 'cta', type: 'submit', text: 'Analyse my business' });
    var f = h('form', { class: 'm-form', novalidate: '' }, url, txt, go);
    f.onsubmit = function (e) {
      e.preventDefault(); var u = url.value.trim(), t = txt.value.trim(); if (!u && !t) { note.textContent = 'Paste your website or describe your business.'; return; }
      go.disabled = true; note.textContent = 'Reading your website and thinking… about 20 seconds';
      api('/api/mine?op=analyse', { url: u, text: t }).then(function (j) {
        go.disabled = false;
        if (j.error === 'signin') { note.replaceChildren(j.message + ' ', h('a', { href: '/pricing#signin', text: 'Sign in' }), ' · ', h('a', { href: '/pricing', text: 'Plans' })); return; }
        if (j.error) { note.textContent = j.error; return; }
        W = { url: j.url || u, profile: j.profile, answers: { countries: (j.profile.countries || []).slice() } }; confirmStep();
      }).catch(function () { go.disabled = false; note.textContent = 'That did not work, try again.'; });
    };
    var list = h('div', { id: 'm-list' });
    show(f, note, list);
    var seen = {}, rows = [];
    var add = function (x) { if (seen[x.id]) return; seen[x.id] = 1; rows.push(h('li', null, h('a', { href: '/mine/' + x.id, text: x.name }), x.url ? h('span', { class: 'meta', text: ' · ' + String(x.url).replace(/^https?:\/\//, '').replace(/\/$/, '') }) : null)); };
    mine().forEach(add);
    var draw = function () { if (rows.length) list.replaceChildren(h('h2', { class: 'm-sec', text: 'Businesses you follow' }), h('ul', { class: 'm-ul' }, rows)); };
    draw(); api('/api/mine?list=1').then(function (j) { (j.items || []).forEach(add); draw(); }).catch(function () {});
  }
  function confirmStep() {
    var p = W.profile, fix = h('div', { class: 'm-fix', hidden: '' }), t = h('textarea', { rows: '2', maxlength: '600', placeholder: 'What do you sell, and to whom?' }), note = h('p', { class: 'status', text: '' });
    var again = h('button', { class: 'cta', type: 'button', text: 'Try again' });
    again.onclick = function () { again.disabled = true; note.textContent = 'Thinking…'; api('/api/mine?op=analyse', { url: W.url, text: t.value.trim() }).then(function (j) { again.disabled = false; if (j.error) { note.textContent = j.error; return; } W.profile = j.profile; W.answers.countries = (j.profile.countries || []).slice(); confirmStep(); }); };
    fix.append(t, again, note);
    show(stepHead(1, 4, 'Is this your business?'),
      h('div', { class: 'm-card' }, h('b', { class: 'wild-t', text: p.name }), h('p', { class: 'wild-claim', text: p.summary }), h('div', { class: 'm-chips' }, p.sells.map(function (s) { return h('span', { class: 'm-chip', text: s }); }))),
      h('div', { class: 'm-btns' }, h('button', { class: 'cta', type: 'button', text: 'Yes, that\'s it', onclick: countryStep }), h('button', { class: 'cta ghost', type: 'button', text: 'Not quite', onclick: function () { fix.hidden = false; t.focus(); } })), fix);
  }
  function countryStep() {
    var sel = W.answers.countries.length ? W.answers.countries : ['NL'];
    var btns = ['NL', 'DE', 'US'].map(function (cc) { var b = h('button', { type: 'button', class: 'ctile', 'aria-pressed': String(sel.indexOf(cc) >= 0), text: CCN[cc] }); b.onclick = function () { var on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); }; b.dataset.cc = cc; return b; });
    var note = h('p', { class: 'status', text: '' });
    show(stepHead(2, 4, 'Where do you sell?'), h('div', { class: 'm-chips' }, btns), note,
      h('div', { class: 'm-btns' }, h('button', { class: 'cta', type: 'button', text: 'Next', onclick: function () { var c = btns.filter(function (b) { return b.getAttribute('aria-pressed') === 'true'; }).map(function (b) { return b.dataset.cc; }); if (!c.length) { note.textContent = 'Pick at least one country.'; return; } W.answers.countries = c; questionStep(); } })));
  }
  function questionStep() {
    var q = W.profile.question; if (!q) return extraStep();
    var other = h('input', { maxlength: '200', placeholder: 'Or type your own answer', class: 'm-in' });
    var pick = function (a) { W.answers.answer = a; extraStep(); };
    show(stepHead(3, 4, q.q), h('div', { class: 'm-btns m-col' }, q.options.map(function (o) { return h('button', { class: 'cta ghost', type: 'button', text: o, onclick: function () { pick(o); } }); })),
      other, h('div', { class: 'm-btns' }, h('button', { class: 'cta', type: 'button', text: 'Next', onclick: function () { pick(other.value.trim()); } }), h('button', { class: 'linkbtn', type: 'button', text: 'Skip', onclick: function () { pick(''); } })));
  }
  function extraStep() {
    var t = h('textarea', { rows: '3', maxlength: '400', placeholder: 'For example: we also install, or we want to start selling online', class: 'm-in' }), note = h('p', { class: 'status', text: '' });
    var go = h('button', { class: 'cta', type: 'button', text: 'Start following' });
    go.onclick = function () {
      W.answers.extra = t.value.trim(); go.disabled = true; note.textContent = 'Collecting 4 years of search data and matching every prediction… up to a minute';
      api('/api/mine?op=save', W).then(function (j) {
        if (j.error) { go.disabled = false; note.textContent = j.message || j.error; return; }
        remember({ id: j.id, name: W.profile.name }); location.href = j.link;
      }).catch(function () { go.disabled = false; note.textContent = 'That did not work, try again.'; });
    };
    show(stepHead(4, 4, 'Anything else you sell, or plan to sell?'), h('p', { class: 'meta', text: 'Optional. It helps us spot demand right next to what you do.' }), t, h('div', { class: 'm-btns' }, go), note);
  }

  var m = location.pathname.match(/^\/mine\/([a-z0-9]{6,16})\/?$/), qid = new URLSearchParams(location.search).get('id');
  if (m || (qid && /^[a-z0-9]{6,16}$/.test(qid))) follow(m ? m[1] : qid); else start();
})();
