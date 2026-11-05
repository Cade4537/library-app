// 0.16.4: friend alerts while the window is closed in the tray. The page does this itself while it is
// open; when it has been closed to free memory, these same rules run here instead.
const norm = (s) => String(s || '').toLowerCase().replace(/[™®©]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const actOf = (p) => { const a = (p.accounts || []).find((x) => x.activity && x.status !== 'offline'); return a ? String(a.activity) : ''; };
const gameName = (t) => String(t || '').replace(/^playing\s+/i, '').trim();
const keyOf = (p) => (p.accounts && p.accounts[0] ? p.accounts[0].key : p.name);

class TrayAlerts {
  constructor(d) {
    this.d = d; // { store, notify, prefs: () => ({ on, mode, muted }) }
    this.now = new Map();
    this.sent = new Map();
    this.ready = false;
  }

  // The page took over again (or let go): start fresh so nothing alerts twice.
  reset() { this.now.clear(); this.ready = false; }

  gameFor(text) {
    const t = norm(text);
    if (t.length < 3) return null;
    let best = null, bestLen = 0;
    for (const it of Object.values(this.d.store.data.items)) {
      if (it.kind !== 'game' || it.hidden || !(it.installed || it.owned || it.manual)) continue;
      const n = norm(it.customName || it.name);
      if (n.length > 2 && t.startsWith(n) && n.length > bestLen) { best = it; bestLen = n.length; }
    }
    return best;
  }

  check(st) {
    const first = !this.ready;
    this.ready = true;
    const pr = this.d.prefs();
    const mode = pr.on === false ? 'off' : pr.mode || 'owned';
    const muted = new Set(pr.muted || []);
    const groups = new Map();
    for (const p of (st && st.people) || []) {
      const k = keyOf(p);
      const raw = p.status === 'ingame' ? gameName(actOf(p)) : '';
      const prev = this.now.get(k);
      if (!raw) { if (prev && ++prev.missed >= 3) this.now.delete(k); continue; }
      const it = this.gameFor(raw);
      const g = it ? `id:${it.id}` : `n:${norm(raw.split(/\s+[-|•·]\s+/)[0])}`;
      if (prev && prev.game === g) { prev.missed = 0; continue; }
      this.now.set(k, { game: g, missed: 0 });
      if (first || mode === 'off' || muted.has(k) || (mode === 'owned' && !it)) continue;
      const sk = `${k}|${g}`;
      if (Date.now() - (this.sent.get(sk) || 0) < 3 * 3600e3) continue;
      this.sent.set(sk, Date.now());
      const label = it ? (it.customName || it.name) : raw.split(/\s+[-|•·]\s+/)[0];
      const grp = groups.get(g) || { label, it, people: [] };
      grp.people.push(p.name);
      groups.set(g, grp);
    }
    for (const [k, t] of this.sent) if (Date.now() - t > 86400e3) this.sent.delete(k);
    for (const { label, it, people } of groups.values()) {
      const who = people.length === 1 ? people[0] : people.length === 2 ? `${people[0]} and ${people[1]}` : `${people[0]} and ${people.length - 1} others`;
      this.d.notify({ kind: 'friend', hold: true, title: `${who} started ${label}`, body: it ? 'You have this game. Jump in?' : 'Not in your library', id: it ? it.id : null });
    }
  }
}

module.exports = { TrayAlerts };
