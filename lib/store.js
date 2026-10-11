// Opslag: een afgesloten Vercel Blob-store (omgevingsvariabele BLOB_READ_WRITE_TOKEN, komt vanzelf bij "Connect store").
// Zonder die variabele: in het geheugen (lokaal en in de tests). Zelfde opzet als outname.now.
const LIST_CAP = 20000;

export function blobStore() {
  let sdk;
  const load = async () => sdk || (sdk = await import('@vercel/blob'));
  const A = { access: 'private' };
  return {
    kind: 'blob',
    async put(path, text, contentType = 'application/json') {
      const { put } = await load();
      await put(path, text, { ...A, addRandomSuffix: false, allowOverwrite: true, contentType, cacheControlMaxAge: 60 });
    },
    async get(path) {
      const { get } = await load();
      const r = await get(path, { ...A, useCache: false });
      if (!r) return null;
      if (r.statusCode !== 200) throw new Error(`blob get ${r.statusCode}`);
      return new Response(r.stream).text();
    },
    async list(prefix, max = LIST_CAP) {
      const { list } = await load();
      const out = [];
      let cursor;
      do {
        const r = await list({ prefix, limit: 1000, cursor });
        for (const b of r.blobs) out.push({ pathname: b.pathname, url: b.url });
        cursor = r.hasMore ? r.cursor : undefined;
      } while (cursor && out.length < max);
      return out;
    },
    async del(urls) {
      if (!urls.length) return;
      const { del } = await load();
      for (let i = 0; i < urls.length; i += 200) await del(urls.slice(i, i + 200));
    },
  };
}

export function memoryStore(files = new Map()) {
  return {
    kind: 'memory', files,
    async put(path, text) { files.set(path, String(text)); },
    async get(path) { return files.has(path) ? files.get(path) : null; },
    async list(prefix, max = LIST_CAP) { return [...files.keys()].filter(k => k.startsWith(prefix)).sort().slice(0, max).map(k => ({ pathname: k, url: k })); },
    async del(urls) { for (const u of urls) files.delete(u); },
  };
}

let shared;
export function useStore(s) { shared = s; }
// In productie zonder Blob-store: null (functies melden dan netjes dat opslaan nog niet kan).
export function getStore() {
  if (shared !== undefined) return shared;
  if (process.env.BLOB_READ_WRITE_TOKEN) shared = blobStore();
  else shared = process.env.VERCEL ? null : memoryStore();
  return shared;
}

export async function getJSON(store, path, fallback = null) {
  const t = store ? await store.get(path).catch(() => null) : null;
  if (!t) return fallback;
  try { return JSON.parse(t); } catch { return fallback; }
}
export const putJSON = (store, path, obj) => store.put(path, JSON.stringify(obj), 'application/json');
