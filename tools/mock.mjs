// Nepbronnen voor lokaal testen (MOCK=1): seizoensachtige Wikipedia-reeksen, trending-RSS en nieuws.
const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const json = o => new Response(JSON.stringify(o), { status: 200, headers: { 'content-type': 'application/json' } });
const DAY = 864e5;

export async function mockFetch(url) {
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
  return new Response('not mocked', { status: 404 });
}
