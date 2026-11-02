// 0.16.0: tracks what you play on an Xbox console (or Xbox remote play / cloud) from your own
// Xbox presence. Records each session with how long it lasted and the achievements unlocked during it.
const { xbl } = require('./xbl');

const PC_DEVICES = /^(win32|windowsonecore|windows|pc)$/i;
// Dashboard and system titles that are not games.
const SYSTEM = /^(home|online|xbox app|xbox|settings|store|microsoft store|my games & apps|guide|xbox game bar|edge|microsoft edge|youtube|netflix|spotify|twitch|disney\+|prime video|hulu|apple tv)$/i;
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

class ConsolePlay {
  constructor(d) {
    this.d = d; // { store, xbox, notify, sendTo, onSession }
    this.current = null;
    this.timer = null;
    this.error = '';
  }

  get list() { return this.d.store.data.consoleSessions || (this.d.store.data.consoleSessions = []); }
  enabled() { return this.d.xbox.configured && this.d.store.data.settings.consoleTracking !== false; }

  start() {
    const loop = async () => {
      let wait = 90 * 1000;
      if (this.enabled()) {
        // OpenXBL keys have a small hourly limit, so check less often with them.
        if (!this.d.xbox.signedIn) wait = 3 * 60 * 1000;
        try { await this.check(); this.error = ''; } catch (e) { this.error = e.message || String(e); wait = Math.max(wait, 5 * 60 * 1000); }
      } else if (this.current) await this.finish(Date.now()).catch(() => {});
      this.timer = setTimeout(loop, wait);
    };
    this.timer = setTimeout(loop, 20 * 1000);
  }
  stop() { clearTimeout(this.timer); }

  async presence() {
    const x = this.d.xbox;
    const acc = await x.account();
    let j;
    if (x.signedIn) j = await x.request(`https://userpresence.xboxlive.com/users/xuid(${acc.xuid})?level=all`, 3);
    else j = await xbl(x.key(), `/${acc.xuid}/presence`);
    if (Array.isArray(j)) j = j[0] || {};
    return j || {};
  }

  // The game you are playing on a console right now, or null.
  static pick(p) {
    if (!/online/i.test(p.state || '')) return null;
    for (const dev of p.devices || []) {
      if (PC_DEVICES.test(dev.type || '')) continue;
      const titles = (dev.titles || []).filter((t) => t.name && !SYSTEM.test(t.name.trim()) && !/background/i.test(t.placement || '') && (!t.state || /active/i.test(t.state)));
      // A full screen game wins over a snapped app.
      titles.sort((a, b) => (/full/i.test(b.placement || '') ? 1 : 0) - (/full/i.test(a.placement || '') ? 1 : 0));
      const t = titles[0];
      if (t) return { titleId: String(t.id), name: t.name.trim(), device: dev.type || 'Xbox', detail: (t.activity && t.activity.richPresence) || '' };
    }
    return null;
  }

  async check() {
    const now = Date.now();
    const playing = ConsolePlay.pick(await this.presence());
    const cur = this.current;
    if (cur && (!playing || playing.titleId !== cur.titleId)) await this.finish(cur.last);
    if (playing && (!this.current || this.current.titleId !== playing.titleId)) {
      this.current = { ...playing, s: now, last: now, before: await this.unlocked(playing.titleId) };
    } else if (this.current && playing) { this.current.last = now; this.current.detail = playing.detail; }
    this.push();
  }

  // Names of the achievements already unlocked in a title (null when they cannot be read).
  async unlocked(titleId) {
    try {
      const j = await this.d.xbox.achievements(titleId);
      return (j.achievements || []).filter((a) => a.progressState === 'Achieved').map((a) => {
        const gs = (a.rewards || []).find((r) => /gamerscore/i.test(r.type));
        return { name: a.name, gs: gs ? Number(gs.value) || 0 : 0 };
      });
    } catch { return null; }
  }

  // The library item for a console title, matched by Xbox title id, then by name.
  itemFor(titleId, name) {
    const items = Object.values(this.d.store.data.items);
    return items.find((it) => it.meta && String(it.meta.xboxTitleId) === String(titleId))
      || items.find((it) => it.kind === 'game' && (norm(it.customName) === norm(name) || norm(it.name) === norm(name)));
  }

  async finish(end) {
    const c = this.current;
    this.current = null;
    if (!c) return;
    end = Math.max(end, c.s);
    const mins = Math.round((end - c.s) / 60000);
    if (mins < 2) { this.push(); return; }
    // The achievements unlocked while you played.
    let got = [];
    const after = c.before ? await this.unlocked(c.titleId) : null;
    if (after && c.before) { const had = new Set(c.before.map((a) => a.name)); got = after.filter((a) => !had.has(a.name)); }
    const it = this.itemFor(c.titleId, c.name);
    const rec = { titleId: c.titleId, name: c.name, device: c.device, s: c.s, e: end, id: it ? it.id : null, ach: got };
    this.list.push(rec);
    if (this.list.length > 500) this.list.splice(0, this.list.length - 500);
    if (it) {
      it.lastPlayed = Math.max(it.lastPlayed || 0, end);
      const sessions = this.d.store.data.sessions || (this.d.store.data.sessions = []);
      sessions.push({ id: it.id, s: c.s, e: end, console: true });
      if (sessions.length > 1500) sessions.splice(0, sessions.length - 1500);
    }
    this.d.store.changed();
    const time = mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
    const gs = got.reduce((n, a) => n + a.gs, 0);
    const body = got.length
      ? `${time} on Xbox. ${got.length} ${got.length === 1 ? 'achievement' : 'achievements'}${gs ? ` (+${gs} G)` : ''}: ${got.slice(0, 3).map((a) => a.name).join(', ')}${got.length > 3 ? '…' : ''}`
      : `${time} on Xbox.`;
    this.d.notify({ kind: 'xbox', title: `Xbox session: ${c.name}`, body });
    this.push();
  }

  state() {
    const c = this.current;
    return {
      enabled: this.enabled(),
      error: this.error,
      current: c ? { titleId: c.titleId, name: c.name, device: c.device, detail: c.detail, s: c.s, id: (this.itemFor(c.titleId, c.name) || {}).id || null } : null,
      recent: this.list.slice(-40).reverse(),
    };
  }
  push() { this.d.sendTo('console:state', this.state()); }
}

module.exports = { ConsolePlay };
