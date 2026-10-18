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
  // Opbouw zoals een goed advies: eerst het oordeel in één vette zin, dan genummerde punten (vette bewering met het getal,
  // daaronder wat het betekent en wat je doet), en bij de concurrentie een prioriteit voor deze week.
  var MONF = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var TYPE = { rise: 'Forecast', now: 'Rising now', early: 'Early signal', coming: 'Buying moment', missing: "Doesn't exist yet", today: 'Today', wild: 'Wildcard' };
  var LANGOF = { NL: 'nl', DE: 'de', US: 'en' };
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9À-ɏ]+/g, ' ').trim(); }
  function checkLink(q, cc) { return '/check?q=' + encodeURIComponent(q) + '&m=' + String(cc || 'NL').split('/')[0] + '#check'; }
  // De echte zoekopdrachten, in de taal van het land.
  function asked(name, qs, cc) {
    var seen = {}, l = (qs || []).map(function (q) { return typeof q === 'string' ? q : q && q.k; }).filter(function (q) { var k = norm(q); if (!k || seen[k]) return false; seen[k] = 1; return true; }).slice(0, 3);
    if (!l.length) return null; // altijd tonen: de echte zoekopdracht, ook als de naam er al op lijkt
    return h('p', { class: 'asked' }, h('span', { text: 'Searched as ' }), [].concat.apply([], l.map(function (q, i) { return [i ? ' · ' : '', h('a', { href: checkLink(q, cc), lang: LANGOF[String(cc).split('/')[0]] || null }, '“' + q + '”')]; })));
  }
  // Het getal achter een punt, kort (voor het oordeel) en als vette bewering (voor het punt zelf).
  function fact(m) {
    if (m.type === 'rise' && m.chance != null) return m.chance + '% chance searches rise 40% or more' + (m.peak ? ' by ' + MONF[m.peak.m - 1] : '');
    if (m.type === 'now' && m.yoy != null) return pc(m.yoy) + ' searches on last year' + (m.v ? ', ' + num(m.v) + ' a month' : '');
    if (m.type === 'early' && m.chance != null) return 'early signal, ' + m.chance + '% chance it breaks out';
    if (m.type === 'coming' && m.date) { var dd = Math.round((Date.parse(String(m.date).slice(0, 10)) - Date.parse(new Date().toISOString().slice(0, 10))) / 864e5); return day(m.date) + (dd > 1 ? ', in ' + dd + ' days' : dd === 1 ? ', tomorrow' : dd === 0 ? ', today' : ''); }
    return '';
  }
  function claim(m) { var f = fact(m), n = String(m.name || '').replace(/\.$/, ''); return f ? n + ': ' + f + '.' : n + '.'; }
  function point(m) {
    var meta = [CCN[String(m.cc).split('/')[0]] || m.cc, TYPE[m.type] || m.type];
    if (m.type === 'wild' && m.due) meta.push('checked ' + day(m.due));
    return h('li', null, h('p', { class: 'm-pt-h', text: claim(m) }), m.say ? h('p', { class: 'm-pt-b', text: m.say }) : null,
      asked(m.name, [m.q].concat(m.terms || []), m.cc), h('p', { class: 'meta', text: meta.join(' · ') }));
  }
  function points(list, show) {
    var ol = h('ol', { class: 'm-ol' }, list.slice(0, show).map(point)), rest = list.slice(show);
    return [ol, rest.length ? h('button', { class: 'chip', type: 'button', text: 'Show ' + rest.length + ' more', onclick: function (e) { rest.forEach(function (m) { ol.append(point(m)); }); e.target.remove(); } }) : null];
  }
  function and(l) { return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' and ' + l[l.length - 1]; }
  function ownBlock(cc, o) {
    var top = (o.terms || []).slice(0, 8), rest = (o.terms || []).slice(8), hasAmz = (o.terms || []).some(function (t) { return t.amazon; });
    var row = function (t) { return h('tr', null, h('td', { lang: LANGOF[cc] || null }, t.k, t.early ? h('span', { class: 'badge p-early m-eb', text: 'Early signal ' + t.early.chance + '%' }) : null), h('td', { class: 'n', text: num(t.v) }), hasAmz ? h('td', { class: 'n', text: t.amazon ? num(t.amazon.units) : '–', title: t.amazon && t.amazon.top ? 'Best seller: ' + t.amazon.top : '' }) : null, h('td', { class: 'n ' + (t.yoy == null ? '' : t.yoy >= 10 ? 'up' : t.yoy <= -10 ? 'down' : ''), text: pc(t.yoy) }), h('td', { class: 'sp' }, spark(t.spark))); };
    var tb = h('tbody', null, top.map(row));
    return h('div', { class: 'm-own' },
      h('div', { class: 'm-own-h' }, h('span', { class: 'mk', text: cc }), h('b', { text: CCN[cc] }), o.spark && o.spark.length > 3 ? spark(o.spark) : null),
      o.total ? h('p', { class: 'meta', text: num(o.total) + ' searches in ' + (o.month ? MON[+o.month.slice(5) - 1] : 'the last month') + (o.yoy != null ? ' · ' + pc(o.yoy) + ' on last year (last 3 months)' : '') }) : null,
      top.length ? h('table', { class: 'm-tab' }, h('thead', null, h('tr', null, h('th', { text: 'What people type' }), h('th', { class: 'n', text: 'A month' }), hasAmz ? h('th', { class: 'n', text: 'Bought on Amazon' }) : null, h('th', { class: 'n', text: 'vs last year' }), h('th', { text: '' }))), tb) : null,
      rest.length ? h('button', { class: 'chip', type: 'button', style: 'margin-top:8px', text: 'Show ' + rest.length + ' more', onclick: function (e) { rest.forEach(function (t) { tb.append(row(t)); }); e.target.remove(); } }) : null,
      o.waiting && o.waiting.length ? h('p', { class: 'meta', text: (top.length ? 'Still collecting 4 years of data for ' + o.waiting.length + ' more searches' : 'Collecting 4 years of data for ' + o.waiting.length + ' searches') + '; ready within a day.' }) : null,
      o.rare && o.rare.length ? h('p', { class: 'meta', text: 'Too few searches to measure: ' + o.rare.join(', ') + '.' }) : null);
  }
  var KINDN = { shop: 'shop', marketplace: 'marketplace', content: 'content site' };
  function cleanAct(a) { return String(a || '').replace(/^this week,?\s*/i, '').replace(/^./, function (c) { return c.toUpperCase(); }); }
  function competeBlock(c, name) {
    if (!c || c.error) return [err((c && c.error) || 'Could not map competitors right now.')];
    var out = [], mine = c.mine || [], comp = c.competitors || [], shelf = c.shelf || [];
    var lead = c.serpChecked ? (mine.length ? name + ' is in Google\'s top 10 for ' + mine.length + ' of its ' + c.serpChecked + ' biggest searches.' : name + ' is not in Google\'s top 10 for any of its ' + c.serpChecked + ' biggest searches.') : '';
    if (shelf.length) lead += (lead ? ' ' : '') + (c.aiMentionsUs ? 'AI assistants name it for ' + c.aiMentionsUs + ' of ' + shelf.length + ' searches.' : 'AI assistants never name it.');
    var win = comp.filter(function (x) { return x.kind !== 'content'; }).slice(0, 3).map(function (x) { return x.domain; });
    if (lead) out.push(h('p', { class: 'm-verdict' }, h('b', { text: lead }), win.length ? ' Most often on top: ' + and(win) + '.' : ''));
    else out.push(h('p', { class: 'meta', text: 'Google positions are checked within a day (daily data budget).' }));
    var gaps = c.gaps || [];
    if (gaps.length) out.push(h('ol', { class: 'm-ol' }, gaps.map(function (g) {
      return h('li', null, h('p', { class: 'm-pt-h', text: String(g.title || '').replace(/\.$/, '') + '.' }), h('p', { class: 'm-pt-b', text: g.why }),
        g.action ? h('p', { class: 'm-pt-b' }, h('b', { text: 'This week: ' }), cleanAct(g.action)) : null,
        g.terms && g.terms.length ? asked('', g.terms, (c.terms && c.terms[0] && c.terms[0].cc) || 'NL') : null);
    })));
    if (c.note) out.push(err(c.note));
    var more = [];
    if (comp.length) {
      var rows = comp.slice(0, 8).map(function (x) { return h('tr', null, h('td', null, x.domain, h('span', { class: 'meta', text: ' · ' + (KINDN[x.kind] || x.kind) })), h('td', { class: 'n', text: x.hits + ' of ' + c.serpChecked }), h('td', { class: 'n', text: x.best < 99 ? '#' + x.best : '–' }), h('td', { class: 'n', text: x.ads ? String(x.ads) : '–' })); });
      more.push(h('table', { class: 'm-tab' }, h('thead', null, h('tr', null, h('th', { text: 'Who wins in Google' }), h('th', { class: 'n', text: 'Top 10' }), h('th', { class: 'n', text: 'Best' }), h('th', { class: 'n', text: 'Ads' }))), h('tbody', null, rows)));
    }
    if (shelf.length) {
      more.push(h('p', { class: 'meta', style: 'margin-top:14px', text: 'What AI assistants (ChatGPT, Gemini, Perplexity, Claude) recommend when asked where to buy:' }));
      shelf.forEach(function (s) { more.push(h('p', { class: 'm-shelf' }, h('b', { lang: LANGOF[s.cc] || null, text: s.k + ': ' }), s.shops.length ? s.shops.map(function (x) { return x.name + ' ' + x.n + '/' + s.asked; }).join(', ') : 'no shops named')); });
    }
    if (more.length) out.push(h('details', { class: 'm-more' }, h('summary', { text: 'The numbers behind this' }), more));
    if (gaps[0] && gaps[0].action) out.push(h('p', { class: 'm-prio' }, h('b', { text: 'Priority this week: ' }), cleanAct(gaps[0].action)));
    return out;
  }
  function follow(id) {
    $('#m-h').textContent = 'Loading your business';
    api('/api/mine?id=' + encodeURIComponent(id)).then(function (d) {
      if (d.error) { $('#m-h').textContent = 'Not found.'; $('#m-lead').textContent = d.error; show(h('p', null, h('a', { href: '/mine', text: 'Add your business' }))); return; }
      var p = d.profile; remember({ id: d.id, name: p.name }); document.title = p.name + ' · Demand Radar';
      $('#m-h').textContent = p.name;
      $('#m-lead').textContent = p.summary;
      var urls = d.url ? String(d.url).split(/[\s,]+/).filter(Boolean) : [];
      var parts = [h('p', { class: 'status' }, [].concat.apply([], urls.map(function (u, i) { return [i ? ' · ' : '', h('a', { href: /^https?:/.test(u) ? u : 'https://' + u, rel: 'noopener', target: '_blank', text: u.replace(/^https?:\/\//, '').replace(/\/$/, '') })]; })),
        (urls.length ? ' · ' : '') + p.countries.map(function (c) { return CCN[c]; }).join(', ') + ' · radar data of ' + day(d.radarDay || d.day) + ' · updates every day')];
      var all = d.matches || [], acts = all.filter(function (m) { return m.kind !== 'threat'; }), warn = all.filter(function (m) { return m.kind === 'threat'; });
      if (d.note) parts.push(err(d.note));
      if (acts.length) {
        var f0 = fact(acts[0]);
        parts.push(h('p', { class: 'm-verdict' }, h('b', { text: 'The radar sees ' + acts.length + ' chance' + (acts.length > 1 ? 's' : '') + ' for ' + p.name + ' in the coming months.' }),
          ' The strongest: ' + String(acts[0].name).replace(/\.$/, '') + (f0 ? ' (' + f0 + ')' : '') + '.' + (warn.length ? ' And ' + warn.length + ' thing' + (warn.length > 1 ? 's' : '') + ' to watch out for.' : '')));
        parts.push(h('h2', { class: 'm-sec', text: 'What to do' }));
        parts.push.apply(parts, points(acts, 6));
      } else if (!d.note) parts.push(h('p', { class: 'm-verdict' }, h('b', { text: 'Nothing on the radar touches ' + p.name + ' directly today.' }), ' We check again every day.'));
      if (warn.length) { parts.push(h('h2', { class: 'm-sec', text: 'Watch out' })); parts.push.apply(parts, points(warn, 3)); }
      var cbox = h('div', { id: 'm-compete' }, h('p', { class: 'loading', text: 'Mapping your competitors' }));
      parts.push(h('h2', { class: 'm-sec', text: 'Where competitors beat you' }), cbox);
      parts.push(h('h2', { class: 'm-sec', text: 'Demand for what you sell' }));
      parts.push(h('p', { class: 'meta', text: 'Monthly Google searches, in the words your customers type, with the trend and our early-signal test on each.' }));
      Object.keys(d.own || {}).forEach(function (cc) { parts.push(ownBlock(cc, d.own[cc])); });
      parts.push(h('p', { class: 'm-foot' }, h('a', { href: '/mine', text: 'Add another business' }), ' · ', h('a', { href: '/', text: 'Open the full radar' })));
      show.apply(null, parts);
      api('/api/mine?id=' + encodeURIComponent(id) + '&compete=1').then(function (c) { cbox.replaceChildren.apply(cbox, competeBlock(c, p.name)); }).catch(function () { cbox.replaceChildren(err('Could not map competitors right now.')); });
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
