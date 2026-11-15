// 0.21.0: keyshop prices from GG.deals (gg.deals/api). GG.deals tracks official stores and keyshops
// such as Loaded and Instant Gaming, and its free API gives, per Steam game, the lowest current and
// historical price in each group. It needs your own key (gg.deals settings). Requests go straight
// from this PC to api.gg.deals with only Steam app IDs; results are kept in memory for 6 hours.
// The API allows 100 games a minute and 1,000 an hour, so lookups are one game at a time, on demand.

const TTL = 6 * 60 * 60 * 1000;
const REGIONS = ['us', 'ca', 'gb', 'eu', 'ie', 'de', 'fr', 'es', 'it', 'nl', 'be', 'ch', 'pl', 'dk', 'fi', 'no', 'se', 'au', 'br'];

class GgDeals {
  constructor(getSettings) {
    this.getSettings = getSettings;
    this.cache = new Map(); // `${region}:${appid}` -> { at, value }
    this.blockedUntil = 0; // after a 429, wait for the reset
  }

  key() { return String(this.getSettings().ggDealsKey || '').trim(); }
  region() { const r = String(this.getSettings().ggDealsRegion || 'us').toLowerCase(); return REGIONS.includes(r) ? r : 'us'; }

  // { ok, title, url, prices: { currentRetail, currentKeyshops, historicalRetail, historicalKeyshops, currency } }
  // or { none } (game not on GG.deals), { nokey }, { error }.
  async prices(appid) {
    const id = String(appid || '').replace(/\D/g, '');
    if (!id) return { none: true };
    const key = this.key();
    if (!key) return { nokey: true };
    const region = this.region();
    const ck = `${region}:${id}`;
    const hit = this.cache.get(ck);
    if (hit && Date.now() - hit.at < TTL) return hit.value;
    if (Date.now() < this.blockedUntil) return { error: 'GG.deals asked to slow down. Prices come back in a few minutes.' };
    let res;
    try {
      const q = new URLSearchParams({ ids: id, key, region });
      res = await fetch(`https://api.gg.deals/v1/prices/by-steam-app-id/?${q}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'CrimsonVault (https://github.com/Cade4537/library-app)' },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return { error: 'GG.deals could not be reached.' };
    }
    if (res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset')) || 60;
      this.blockedUntil = Date.now() + Math.min(3600, reset) * 1000;
      return { error: 'GG.deals asked to slow down. Prices come back in a few minutes.' };
    }
    if (res.status === 401 || res.status === 403) return { error: 'GG.deals did not accept the API key. Check it in Settings, Connections.' };
    let j = null;
    try { j = await res.json(); } catch {}
    if (!res.ok || !j || j.success !== true) return { error: (j && j.data && j.data.message) || `GG.deals answered ${res.status}.` };
    const d = j.data && j.data[id];
    const value = d && d.prices
      ? { ok: true, title: d.title || '', url: /^https:\/\/gg\.deals\//.test(d.url || '') ? d.url : '', prices: d.prices }
      : { none: true };
    this.cache.set(ck, { at: Date.now(), value });
    if (this.cache.size > 500) this.cache.delete(this.cache.keys().next().value);
    return value;
  }

  clear() { this.cache.clear(); }
}

module.exports = { GgDeals, REGIONS };
