// 0.23.0: Xbox Remote Play time, for the Stats page. A session starts when a Remote Play stream opens
// (inside Crimson Vault or in its own window) and ends when it closes. While it runs, the game your
// console reports (from Xbox console play, if you are signed in) gets the minutes. Sessions are kept
// in library.json on this PC; the open one is saved every minute, so a crash loses at most a minute.

class RemotePlayTracker {
  // d: { store, current: () => console game name or '', log }
  constructor(d) {
    this.d = d;
    this.cur = null;
    this.timer = null;
    this.modes = new Set(); // 'inapp' and 'window' can overlap for a moment while switching
  }

  list() {
    const s = this.d.store.data;
    if (!Array.isArray(s.remotePlay)) s.remotePlay = [];
    return s.remotePlay;
  }

  start(mode, consoleName) {
    this.modes.add(mode);
    if (this.cur) return;
    const now = Date.now();
    this.cur = { s: now, e: now, mode, console: consoleName || '', games: {} };
    this.list().push(this.cur);
    this.timer = setInterval(() => this.tick(), 60000);
    this.d.store.saveSoon();
  }

  tick() {
    if (!this.cur) return;
    const now = Date.now();
    const mins = Math.max(0, Math.round((now - this.cur.e) / 60000));
    this.cur.e = now;
    let game = '';
    try { game = String(this.d.current() || '').trim(); } catch {}
    if (game && mins) this.cur.games[game] = (this.cur.games[game] || 0) + mins;
    this.d.store.saveSoon();
  }

  stop(mode) {
    if (mode) this.modes.delete(mode);
    if (mode && this.modes.size) return;
    this.modes.clear();
    clearInterval(this.timer);
    this.timer = null;
    if (!this.cur) return;
    this.tick();
    const list = this.list();
    // Under a minute is a misclick or a failed connect, not a session.
    if (this.cur.e - this.cur.s < 60000) list.splice(list.indexOf(this.cur), 1);
    this.cur = null;
    if (list.length > 1500) list.splice(0, list.length - 1500);
    this.d.store.saveSoon();
  }

  stats() {
    const now = Date.now();
    const list = this.list().filter((x) => x && x.e > x.s);
    const mins = (x) => Math.round((x.e - x.s) / 60000);
    const total = list.reduce((t, x) => t + mins(x), 0);
    const weekAgo = now - 7 * 86400000;
    const week = list.filter((x) => x.e > weekAgo).reduce((t, x) => t + Math.round((x.e - Math.max(x.s, weekAgo)) / 60000), 0);
    const games = {};
    for (const x of list) for (const [g, m] of Object.entries(x.games || {})) games[g] = (games[g] || 0) + m;
    // Minutes per day for the last 14 days, split at midnight.
    const days = [];
    const day0 = new Date(); day0.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const a = day0.getTime() - i * 86400000;
      const b = a + 86400000;
      const m = list.reduce((t, x) => t + Math.max(0, Math.min(x.e, b) - Math.max(x.s, a)), 0);
      days.push({ at: a, min: Math.round(m / 60000) });
    }
    return {
      live: !!this.cur,
      liveSince: this.cur ? this.cur.s : 0,
      sessions: list.length,
      total,
      week,
      longest: list.reduce((t, x) => Math.max(t, mins(x)), 0),
      avg: list.length ? Math.round(total / list.length) : 0,
      inapp: list.filter((x) => x.mode === 'inapp').length,
      games: Object.entries(games).map(([name, min]) => ({ name, min })).sort((a, b) => b.min - a.min).slice(0, 10),
      days,
      recent: list.slice(-6).reverse().map((x) => ({ s: x.s, min: mins(x), mode: x.mode, top: Object.entries(x.games || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || '' })),
    };
  }
}

module.exports = { RemotePlayTracker };
