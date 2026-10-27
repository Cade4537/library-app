// Steam store details (type and genres) for sorting games into Demos, your Steam collections, or genre categories.
const path = require('path');
const { fsp, normName, similarity } = require('./util');
const { findSteamPath } = require('./scanners/steam');
const { detectSteamId } = require('./owned/steam');

// More specific genres first, so a game tagged Action + RPG lands in RPG.
const GENRE_ORDER = ['RPG', 'Strategy', 'Simulation', 'Racing', 'Sports', 'Massively Multiplayer', 'Action', 'Adventure', 'Casual', 'Indie'];
const DEMO_NAME = /\b(demo|playtest|prologue demo)\b/i;

function pickGenre(genres) {
  const names = (genres || []).map((g) => (typeof g === 'string' ? g : g.description)).filter(Boolean);
  for (const g of GENRE_ORDER) if (names.includes(g)) return g;
  return null;
}

const cleanName = (s) => String(s).replace(/[\\/]+/g, ' ').trim().slice(0, 60);

// Reads the collections you made in the Steam client. Dynamic collections are stored as filters
// that only Steam can evaluate, so only collections with games added by hand are imported.
async function readSteamCollections(registry, steamIdHint) {
  const steamPath = await findSteamPath(registry || {});
  if (!steamPath) return [];
  const steamId = steamIdHint || (await detectSteamId(registry));
  if (!steamId) return [];
  const accountId = String(BigInt(steamId) - 76561197960265728n);
  const file = path.join(steamPath, 'userdata', accountId, 'config', 'cloudstorage', 'cloud-storage-namespace-1.json');
  let data;
  try { data = JSON.parse(await fsp.readFile(file, 'utf8')); } catch { return []; }
  const out = [];
  for (const entry of Array.isArray(data) ? data : []) {
    const [key, rec] = entry || [];
    if (!/^user-collections\.uc-/.test(key || '') || !rec || rec.is_deleted || !rec.value) continue;
    let v;
    try { v = JSON.parse(rec.value); } catch { continue; }
    const appids = (v.added || []).map(Number).filter(Boolean);
    if (!v.name || !appids.length) continue;
    const removed = new Set((v.removed || []).map(Number));
    out.push({ name: cleanName(v.name), appids: appids.filter((a) => !removed.has(a)) });
  }
  return out;
}

class SteamInfo {
  constructor(store, onBatch) {
    this.store = store;
    this.onBatch = onBatch;
    this.queue = [];
    this.queued = new Set();
    this.running = false;
    if (!store.data.appInfo) store.data.appInfo = {};
    if (!store.data.appMatch) store.data.appMatch = {};
  }

  appIdFor(it) {
    if (it.steamAppId) return String(it.steamAppId);
    const m = this.store.data.appMatch[normName(it.name)];
    return m || null;
  }

  // Queues every game that has no store details yet.
  refresh() {
    for (const it of Object.values(this.store.data.items)) {
      if (it.kind !== 'game' || it.manual) continue;
      if (it.steamAppId) {
        if (!this.store.data.appInfo[it.steamAppId]) this.push({ appid: String(it.steamAppId) });
      } else if (!(normName(it.name) in this.store.data.appMatch)) {
        this.push({ name: it.name });
      }
    }
    this.run();
  }

  push(job) {
    const k = job.appid ? `a${job.appid}` : `n${normName(job.name)}`;
    if (this.queued.has(k)) return;
    this.queued.add(k);
    this.queue.push(job);
  }

  async run() {
    if (this.running) return;
    this.running = true;
    let sinceBatch = 0;
    try {
      while (this.queue.length) {
        const job = this.queue.shift();
        try {
          if (job.name) await this.matchName(job.name);
          else await this.fetchDetails(job.appid);
        } catch {}
        if (++sinceBatch >= 10) { sinceBatch = 0; this.onBatch(); }
        // Steam allows roughly 200 store lookups per 5 minutes.
        await new Promise((r) => setTimeout(r, 1600));
      }
    } finally {
      this.running = false;
      this.queued.clear();
      this.onBatch();
    }
  }

  async matchName(name) {
    const key = normName(name);
    const res = await fetch(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(name)}&l=english&cc=US`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return;
    const j = await res.json();
    let best = null;
    let score = 0;
    for (const x of j.items || []) {
      const s = similarity(name, x.name);
      if (s > score) { score = s; best = x; }
    }
    this.store.data.appMatch[key] = best && score >= 0.75 ? String(best.id) : null;
    const id = this.store.data.appMatch[key];
    if (id && !this.store.data.appInfo[id]) await this.fetchDetails(id);
  }

  async fetchDetails(appid) {
    const res = await fetch(`https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic,genres&l=english&cc=US`, { signal: AbortSignal.timeout(15000) });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 60000)); return; }
    if (!res.ok) return;
    const j = await res.json();
    const d = j && j[appid] && j[appid].success ? j[appid].data : null;
    this.store.data.appInfo[appid] = d
      ? { type: d.type || 'game', genres: (d.genres || []).map((g) => g.description), t: Date.now() }
      : { type: 'unknown', genres: [], t: Date.now() };
  }

  // Where a game should go when the user has not placed it themselves.
  autoCategory(it, collections) {
    const s = this.store.data.settings;
    const appid = this.appIdFor(it);
    const info = appid ? this.store.data.appInfo[appid] : null;
    if (DEMO_NAME.test(it.name) || (info && info.type === 'demo')) return 'Games/Demos';
    if (s.steamCollections !== false && appid) {
      const c = collections.find((col) => col.appids.includes(Number(appid)));
      if (c) return `Games/${c.name}`;
    }
    if (s.genreSort !== false && info) {
      const g = pickGenre(info.genres);
      if (g) return `Games/${g}`;
    }
    return 'Games';
  }
}

module.exports = { SteamInfo, readSteamCollections, pickGenre };
