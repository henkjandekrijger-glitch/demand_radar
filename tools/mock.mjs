// Nepbronnen voor lokaal testen (MOCK=1): seizoensachtige Wikipedia-reeksen, trending-RSS en nieuws.
const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
const DAY = 864e5;

export async function mockFetch(url, opts = {}) {
  const u = String(url);
  let m;
  if ((m = u.match(/srsearch=([^&]+)/))) return json({ query: { search: [{ title: decodeURIComponent(m[1]) }] } });
  if ((m = u.match(/per-article\/(\w+)\.wikipedia\/all-access\/user\/([^/]+)\/daily\/(\d{8})00\/(\d{8})00/))) {
    const [, , t, s, e] = m, h = hash(t), base = 200 + (h % 3000), shift = h % 365, amp = 0.2 + ((h >> 3) % 80) / 100;
    const toD = x => Date.UTC(+x.slice(0, 4), +x.slice(4, 6) - 1, +x.slice(6, 8));
    const items = [];
    for (let d = toD(s); d <= toD(e); d += DAY) {
      const doy = Math.floor((d - Date.UTC(new Date(d).getUTCFullYear(), 0, 1)) / DAY);
      let v = base * (1 + amp * Math.sin((2 * Math.PI * (doy - shift)) / 365)) * (0.9 + ((hash(t + d) % 20) / 100));
      if (h % 7 === 0 && d > Date.now() - 4 * DAY) v *= 2.4; // een paar pieken
      items.push({ timestamp: new Date(d).toISOString().slice(0, 10).replace(/-/g, '') + '00', views: Math.round(v) });
    }
    return json({ items });
  }
  if (u.includes('/pageviews/top/')) {
    const names = ['Taylor_Swift', 'Ballon_d\'Or', 'Hurricane_Milton', 'Sinterklaas', 'Main_Page', 'Special:Search', 'Nobel_Prize_in_Literature', 'Bitcoin', 'Formula_One', 'Heat_pump'];
    return json({ items: [{ articles: names.map((a, i) => ({ article: a, views: 90000 - i * 5000, rank: i + 1 })) }] });
  }
  if (u.includes('trends.google.com')) {
    const items = ['ajax psv', 'black friday deals', 'thuisbatterij subsidie', 'weer morgen', 'sinterklaas intocht'].map((t, i) =>
      `<item><title>${t}</title><ht:approx_traffic>${[20000, 10000, 5000, 2000, 1000][i]}+</ht:approx_traffic><pubDate>Sun, 11 Oct 2026 1${i}:00:00 +0000</pubDate><ht:news_item><ht:news_item_title><![CDATA[Nieuws over ${t}]]></ht:news_item_title><ht:news_item_url>https://example.com/${i}</ht:news_item_url><ht:news_item_source>Example</ht:news_item_source></ht:news_item></item>`).join('');
    return new Response(`<?xml version="1.0"?><rss><channel>${items}</channel></rss>`, { status: 200 });
  }
  if (u.includes('gdeltproject')) {
    const now = Date.now();
    const articles = Array.from({ length: 30 }, (_, i) => ({ url: `https://news.example.com/${i}`, title: `Headline number ${i} about demand`, seendate: new Date(now - (i * i * 0.04 + 0.2) * DAY).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', domain: 'news.example.com' }));
    return new Response(JSON.stringify({ articles }), { status: 200 });
  }
  if (u.includes('suggestqueries.google.com')) { const q = decodeURIComponent((u.match(/[?&]q=([^&]+)/) || [])[1] || ''); return json([q, ['kopen', 'prijs', 'subsidie', 'ervaringen', 'review', 'beste', 'goedkoop', 'aanbieding'].map(w => `${q} ${w}`)]); }
  if (u.includes('completion.amazon')) { const q = decodeURIComponent((u.match(/prefix=([^&]+)/) || [])[1] || ''); return json({ suggestions: ['set', 'pro', 'mini', 'xl', 'kit'].map(w => ({ value: `${q} ${w}` })) }); }
  if (u.includes('reddit.com')) { const now = Date.now() / 1000; return json({ data: { children: Array.from({ length: 24 }, (_, i) => ({ data: { title: `Reddit thread ${i}`, permalink: `/r/test/comments/${i}`, subreddit_name_prefixed: i % 3 ? 'r/Netherlands' : 'r/solar', created_utc: now - i * i * 3000, score: 50 - i, num_comments: i } })) } }); }
  if (u.includes('hn.algolia.com')) { const now = Date.now() / 1000; return json({ hits: Array.from({ length: 5 }, (_, i) => ({ title: `HN story ${i}`, objectID: String(1000 + i), created_at_i: now - i * 86400 * 4, points: 10 * i })) }); }
  if (u.includes('news.google.com')) { const items = Array.from({ length: 18 }, (_, i) => `<item><title>Nieuwsbericht ${i} - Bron</title><pubDate>${new Date(Date.now() - i * i * 0.08 * DAY).toUTCString()}</pubDate><source url="https://www.nu.nl">NU.nl</source></item>`).join(''); return new Response(`<rss><channel>${items}</channel></rss>`, { status: 200 }); }
  if (u.includes('geocoding-api.open-meteo.com')) return json({ results: [{ name: 'Gouda', admin1: 'South Holland', country_code: 'NL', latitude: 52.01, longitude: 4.71, population: 73000 }] });
  if (u.includes('api.open-meteo.com')) { const time = Array.from({ length: 23 }, (_, i) => new Date(Date.now() + (i - 7) * DAY).toISOString().slice(0, 10)); return json({ daily: { time, temperature_2m_max: time.map((_, i) => (i < 8 ? 14 : 7)), temperature_2m_min: time.map((_, i) => (i < 8 ? 6 : -3)), precipitation_sum: time.map(() => 2), snowfall_sum: time.map((_, i) => (i > 15 ? 0.4 : 0)) } }); }
  if (u.includes('nominatim.openstreetmap.org')) return json(Array.from({ length: 3 }, (_, i) => ({ name: `Shop ${i}`, type: 'shop', osm_type: 'node', osm_id: 100 + i })));
  if (u.includes('date.nager.at')) { const y = (u.match(/PublicHolidays\/(\d{4})/) || [])[1]; return json([{ date: `${y}-12-26`, name: 'St. Stephen\'s Day', global: true }, { date: `${y}-11-11`, name: 'Veterans Day', global: true }]); }
  if (u.includes('rss.applemarketingtools.com')) return json({ feed: { results: Array.from({ length: 10 }, (_, i) => ({ name: `Title ${i + 1}`, artistName: `Maker ${i + 1}`, url: `https://apps.apple.com/x/${i}`, genres: [{ name: 'Lifestyle' }] })) } });
  if (u.includes('itunes.apple.com/search')) { const h = hash(u); return json({ results: Array.from({ length: 4 + (h % 8) }, (_, i) => ({ trackName: `Practice App ${i + 1}`, sellerName: `Maker ${i}`, userRatingCount: (h >>> i) % 5000, averageUserRating: 4.2, price: i % 3 ? 0 : 4.99, currentVersionReleaseDate: i === 0 ? '2023-05-01T00:00:00Z' : '2026-08-01T00:00:00Z', languageCodesISO2A: i % 4 ? ['EN'] : ['EN', 'NL', 'DE'], trackViewUrl: `https://apps.apple.com/app/${i}` })) }); }
  if (u.includes('googleapis.com/books')) { const h = hash(u); return json({ totalItems: h % 900, items: Array.from({ length: 5 }, (_, i) => ({ volumeInfo: { title: `Book ${i}`, publishedDate: String(2018 + ((h + i) % 9)), infoLink: `https://books.google.com/${i}` } })) }); }
  if (u.includes('api.dataforseo.com')) {
    const task = JSON.parse(opts.body || '[{}]')[0];
    const monthly = k => Array.from({ length: 25 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); const m = d.getUTCMonth() + 1; return { year: d.getUTCFullYear(), month: m, search_volume: Math.round((hash(k) % 3000 + 50) * (m === 1 || m === 9 ? 1.6 : 1) * (i < 12 ? 1.15 : 1)) }; });
    const kw = k => ({ keyword: k, search_volume: hash(k) % 5000 + 20, cpc: (hash(k) % 400) / 100, competition_index: hash(k) % 100, low_top_of_page_bid: 0.4, high_top_of_page_bid: 2.1, monthly_searches: monthly(k) });
    let result;
    if (u.includes('search_volume')) result = task.keywords.map(kw);
    else if (u.includes('keywords_for_keywords')) result = task.keywords.flatMap(k => ['online', 'gratis', 'free', 'pdf'].map(w => kw(`${k} ${w}`)));
    else if (u.includes('top_searches')) result = [{ items: Array.from({ length: 30 }, (_, i) => { const k = `product ${task.location_code} ${i}`; const x = kw(k); return { keyword: k, keyword_info: { search_volume: x.search_volume, cpc: x.cpc, competition: 0.4, monthly_searches: x.monthly_searches, search_volume_trend: { monthly: 300 - i * 9, quarterly: 50, yearly: i % 3 ? 120 - i : 5 } }, search_intent_info: { main_intent: 'commercial' }, keyword_properties: { core_keyword: null, keyword_difficulty: 20 } }; }) }];
    else if (u.includes('serp/google')) result = [{ items: [...Array.from({ length: 8 }, (_, i) => ({ type: 'organic', domain: `site${i}.com`, title: `Result ${i}`, url: `https://site${i}.com` })), ...(hash(task.keyword) % 3 ? [{ type: 'paid', domain: 'ads.example', title: 'Ad' }] : [])] }];
    return json({ status_code: 20000, cost: 0.05, tasks: [{ status_code: 20000, result }] });
  }
  return new Response('not mocked', { status: 404 });
}
