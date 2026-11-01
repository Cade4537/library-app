/* global api, S, $, h, icon, prefs, artFor, displayName, SOURCES, SOURCE_ORDER, fmtHours, timeAgo, visible, childrenOf, descendants,
   setView, openDetails, launch, hashHue, render, renderSidebar, spatial */
// Stats page, collections wall, the "Back to game" bar, card layout switch and the startup animation.

// ---------- collections wall (Home) ----------
function renderCollections() {
  const sec = $('#collections');
  if (!sec) return;
  const show = S.view.type === 'home' && !S.search && S.source === 'all' && prefs.get('showCollections', true);
  const root = childrenOf(null).find((c) => /^games$/i.test(c.name));
  const tiles = [];
  if (show && root) {
    for (const c of childrenOf(root.id)) {
      const set = descendants(c.id);
      const list = S.lib.items.filter((it) => visible(it) && set.has(it.categoryId));
      if (!list.length) continue;
      const covers = list.filter((it) => it.coverUrl).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (b.minutes || 0) - (a.minutes || 0)).slice(0, 4);
      tiles.push({ c, n: list.length, covers, mins: list.reduce((a, it) => a + (it.minutes || 0), 0) });
    }
    tiles.sort((a, b) => b.n - a.n);
  }
  sec.hidden = tiles.length < 2;
  if (sec.hidden) return;
  const key = tiles.map((t) => `${t.c.id}:${t.n}:${t.covers.map((x) => x.coverUrl).join(',')}`).join('|');
  if (sec.dataset.key === key) return;
  sec.dataset.key = key;
  sec.replaceChildren(
    h('div', { class: 'sec-head' }, h('h3', { class: 'section-title' }, 'Your collections'),
      h('button', { class: 'link-btn', onclick: () => { prefs.set('showCollections', false); renderCollections(); } }, 'Hide')),
    h('div', { class: 'coll-row' }, tiles.map((t) => {
      const mosaic = h('div', { class: 'coll-mosaic n' + Math.max(1, t.covers.length) },
        t.covers.length ? t.covers.map((it) => h('img', { src: it.coverUrl, alt: '', loading: 'lazy', draggable: 'false' }))
          : h('div', { class: 'coll-empty', style: { background: `hsl(${hashHue(t.c.name) % 360} 45% 18%)` } }, t.c.name[0]));
      return h('button', { class: 'coll', onclick: () => setView({ type: 'category', id: t.c.id }) }, mosaic,
        h('div', { class: 'coll-info' }, h('div', { class: 'coll-name' }, t.c.name), h('div', { class: 'coll-sub' }, `${t.n} ${t.n === 1 ? 'game' : 'games'}${t.mins ? ` · ${fmtHours(t.mins)}` : ''}`)));
    })));
}

// ---------- card layout: covers or wide banners ----------
function applyLayout() {
  const wide = S.layout === 'wide';
  $('#grid').classList.toggle('wide', wide);
}
function layoutSwitch() {
  const mk = (k, ic, title) => h('button', { class: S.layout === k ? 'on' : '', title, onclick: () => { S.layout = k; prefs.set('layout', k); applyLayout(); render(); } }, icon(ic));
  return h('div', { class: 'seg icons' }, mk('grid', 'grid', 'Covers'), mk('wide', 'rows', 'Wide banners'));
}

// ---------- Back to game bar ----------
function renderResume() {
  const bar = $('#resumeBar');
  if (!bar) return;
  const it = S.lib.items.find((x) => x.running && x.kind === 'game');
  const show = !!it && !S.tv && S.view.type !== 'hub' && prefs.get('resumeBar', true) && !bar.dataset.dismissed?.includes(it ? it.id : '-');
  bar.hidden = !show;
  document.body.classList.toggle('resume-on', show);
  if (!show) return;
  if (bar.dataset.id === it.id && bar.dataset.min === String(Math.round((it.minutes || 0) / 6))) return;
  bar.dataset.id = it.id;
  bar.dataset.min = String(Math.round((it.minutes || 0) / 6));
  bar.replaceChildren(
    h('div', { class: 'rb-art' }, artFor(it)),
    h('div', { class: 'rb-text' }, h('div', { class: 'rb-kicker' }, h('span', { class: 'dot' }), 'Playing now'), h('div', { class: 'rb-name' }, displayName(it))),
    h('button', { class: 'btn primary', onclick: async () => { const r = await api.focusGame(it.id); if (!r || !r.ok) launch(it.id); } }, icon('play'), 'Back to game'),
    h('button', { class: 'icon-btn', title: 'Details', onclick: () => openDetails(it.id) }, icon('more')),
    h('button', { class: 'icon-btn', title: 'Hide until the next game', onclick: () => { bar.dataset.dismissed = (bar.dataset.dismissed || '') + ',' + it.id; renderResume(); } }, icon('close')));
}

// ---------- stats page ----------
const DAY = 86400000;
function dayStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

async function renderStats() {
  const box = $('#statsView');
  const games = S.lib.items.filter((it) => it.kind === 'game' && !it.hidden);
  const installed = games.filter((it) => it.installed);
  const totalMin = games.reduce((a, it) => a + (it.minutes || 0), 0);
  let achHave = 0, achTotal = 0, perfect = 0;
  for (const it of games) {
    const a = it.meta && it.meta.achievements;
    if (a && a.total) { achHave += a.have; achTotal += a.total; if (a.have === a.total) perfect++; }
  }
  const tile = (label, value, sub) => h('div', { class: 'st-tile' }, h('div', { class: 'st-v' }, value), h('div', { class: 'st-l' }, label), sub ? h('div', { class: 'st-s' }, sub) : null);
  const bars = (rows, fmt) => {
    const max = Math.max(1, ...rows.map((r) => r.v));
    return h('div', { class: 'st-bars' }, rows.map((r) => h('button', { class: 'st-bar', onclick: r.go || null, title: r.title || r.label },
      h('span', { class: 'st-bl' }, r.dot ? h('span', { class: `dot src-${r.dot}`, style: { background: 'var(--src)' } }) : null, r.label),
      h('span', { class: 'st-track' }, h('span', { style: { width: `${Math.max(2, (r.v / max) * 100)}%` } })),
      h('span', { class: 'st-bv' }, fmt(r.v)))));
  };
  const top = [...games].filter((it) => it.minutes).sort((a, b) => b.minutes - a.minutes).slice(0, 10)
    .map((it) => ({ label: displayName(it), v: it.minutes, go: () => openDetails(it.id) }));
  const bySrc = {};
  for (const it of games) if (it.minutes) bySrc[it.source] = (bySrc[it.source] || 0) + it.minutes;
  const srcRows = SOURCE_ORDER.filter((s) => bySrc[s]).map((s) => ({ label: SOURCES[s], v: bySrc[s], dot: s })).sort((a, b) => b.v - a.v);
  const closest = games.filter((it) => it.meta && it.meta.achievements && it.meta.achievements.total && it.meta.achievements.have < it.meta.achievements.total)
    .sort((a, b) => (b.meta.achievements.have / b.meta.achievements.total) - (a.meta.achievements.have / a.meta.achievements.total)).slice(0, 6);

  const weekBox = h('div', { class: 'st-card' }, h('h3', { class: 'section-title' }, 'Last 14 days'), h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading'));
  const recapBox = h('div', { class: 'st-card st-recap' });
  box.replaceChildren(
    recapBox,
    h('div', { class: 'st-tiles' },
      tile('Hours played', fmtHours(totalMin) || '0 hrs', `across ${games.filter((g) => g.minutes).length} games`),
      tile('Games', String(games.length), `${installed.length} installed`),
      tile('Achievements', achTotal ? `${achHave.toLocaleString()}` : '0', achTotal ? `${Math.round((achHave / achTotal) * 100)}% of ${achTotal.toLocaleString()} in opened games` : 'Open a game\'s details to load them'),
      tile('Completed', String(perfect), perfect === 1 ? 'game with every achievement' : 'games with every achievement')),
    weekBox,
    (() => {
      const genres = genreRows();
      return genres.length ? h('div', { class: 'st-grid' },
        h('div', { class: 'st-card' }, h('h3', { class: 'section-title' }, 'Hours by genre'), bars(genres, fmtHours)),
        h('div', { class: 'st-card st-month' }, h('h3', { class: 'section-title' }, 'This month'), h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading'))) : null;
    })(),
    h('div', { class: 'st-grid' },
      h('div', { class: 'st-card' }, h('h3', { class: 'section-title' }, 'Most played'), top.length ? bars(top, fmtHours) : h('div', { class: 'loading' }, 'Play something and it shows up here.')),
      h('div', { class: 'st-card' }, h('h3', { class: 'section-title' }, 'Hours by launcher'), srcRows.length ? bars(srcRows, fmtHours) : h('div', { class: 'loading' }, 'No hours yet.'))),
    closest.length ? h('div', { class: 'st-card' }, h('h3', { class: 'section-title' }, 'Closest to 100%'),
      h('div', { class: 'st-close' }, closest.map((it) => {
        const a = it.meta.achievements; const pct = Math.round((a.have / a.total) * 100);
        return h('button', { class: 'st-cl', onclick: () => openDetails(it.id) }, h('div', { class: 'st-cl-art' }, artFor(it)),
          h('div', { class: 'st-cl-info' }, h('div', { class: 'st-cl-name' }, displayName(it)), h('div', { class: 'hero-ach' }, h('span', { style: { width: `${pct}%` } })), h('div', { class: 'st-s' }, `${a.have} of ${a.total} · ${pct}%`)));
      }))) : null);

  // Daily play time from the sessions Crimson Vault saw.
  const sessions = (await api.sessions().catch(() => [])) || [];
  weeklyRecap(recapBox, sessions);
  const monthBox = box.querySelector('.st-month');
  if (monthBox) {
    const from = new Date(); from.setDate(1); from.setHours(0, 0, 0, 0);
    const m = new Map();
    for (const x of sessions) if (x.e > from.getTime()) m.set(x.id, (m.get(x.id) || 0) + (x.e - Math.max(x.s, from.getTime())) / 60000);
    const rows = [...m].map(([id, v]) => ({ it: S.byId.get(id), v })).filter((r) => r.it).sort((a, b) => b.v - a.v).slice(0, 8).map((r) => ({ label: displayName(r.it), v: r.v, go: () => openDetails(r.it.id) }));
    monthBox.replaceChildren(h('h3', { class: 'section-title' }, `This month · ${new Date().toLocaleDateString(undefined, { month: 'long' })}`), rows.length ? bars(rows, fmtHours) : h('div', { class: 'loading' }, 'Nothing played this month yet.'));
  }
  const today = dayStart(Date.now());
  const days = Array.from({ length: 14 }, (_, i) => ({ t: today - (13 - i) * DAY, m: 0, games: new Map() }));
  for (const s of sessions) {
    for (const d of days) {
      const a = Math.max(s.s, d.t); const b = Math.min(s.e, d.t + DAY);
      if (b > a) { d.m += (b - a) / 60000; d.games.set(s.id, (d.games.get(s.id) || 0) + (b - a) / 60000); }
    }
  }
  const max = Math.max(60, ...days.map((d) => d.m));
  const week = days.slice(7).reduce((a, d) => a + d.m, 0);
  const names = (d) => [...d.games.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, m]) => `${(S.byId.get(id) && displayName(S.byId.get(id))) || 'A game'} ${fmtHours(m) || Math.round(m) + ' min'}`).join(', ');
  weekBox.replaceChildren(
    h('div', { class: 'sec-head' }, h('h3', { class: 'section-title' }, 'Last 14 days'), h('span', { class: 'count' }, week ? `${fmtHours(week) || Math.round(week) + ' min'} this week` : 'Tracked from now on, while Crimson Vault is open')),
    h('div', { class: 'st-days' }, days.map((d) => h('div', { class: 'st-day' + (d.t === today ? ' today' : ''), title: d.m ? names(d) : 'No play' },
      h('div', { class: 'st-col' }, h('span', { style: { height: `${(d.m / max) * 100}%` } })),
      h('div', { class: 'st-dl' }, new Date(d.t).toLocaleDateString([], { weekday: 'short' }).slice(0, 2))))));
}

// ---------- startup animation ----------
function playIntro() {
  if (!prefs.get('intro', true)) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const el = h('div', { class: 'intro' },
    h('div', { class: 'intro-glow' }),
    h('div', { class: 'intro-gem' }, h('span', { class: 'brand-mark' })),
    h('div', { class: 'intro-name' }, 'Crimson Vault'.split('').map((c, i) => h('span', { style: { animationDelay: `${0.45 + i * 0.035}s` } }, c === ' ' ? ' ' : c))));
  const done = () => { el.classList.add('out'); setTimeout(() => el.remove(), 500); };
  el.addEventListener('click', done);
  document.addEventListener('keydown', done, { once: true });
  document.body.append(el);
  setTimeout(done, 1700);
}

function wireExtras() {
  S.layout = prefs.get('layout', 'grid');
  applyLayout();
  playIntro();
}
document.addEventListener('DOMContentLoaded', wireExtras);

// This week vs last week, from the play sessions Crimson Vault saw.
function weeklyRecap(box, sessions) {
  const now = Date.now();
  const inRange = (from, to) => sessions.filter((x) => x.e > from && x.s < to).map((x) => ({ ...x, m: (Math.min(x.e, to) - Math.max(x.s, from)) / 60000 }));
  const week = inRange(now - 7 * DAY, now);
  const prev = inRange(now - 14 * DAY, now - 7 * DAY);
  const sum = (l) => l.reduce((a, x) => a + x.m, 0);
  const mins = sum(week);
  const before = sum(prev);
  if (!week.length && !prev.length) { box.remove(); return; }
  const byGame = new Map();
  for (const x of week) byGame.set(x.id, (byGame.get(x.id) || 0) + x.m);
  const topGames = [...byGame].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, m]) => [S.byId.get(id), m]).filter(([it]) => it);
  const longest = week.reduce((a, x) => (x.m > (a ? a.m : 0) ? x : a), null);
  const days = new Set(week.map((x) => dayStart(x.s))).size;
  const diff = before ? Math.round(((mins - before) / before) * 100) : null;
  box.replaceChildren(
    h('div', { class: 'sec-head' }, h('h3', { class: 'section-title' }, 'Your week'), h('span', { class: 'help' }, 'Last 7 days')),
    h('div', { class: 'recap' },
      h('div', { class: 'recap-big' }, h('b', {}, fmtHours(mins) || '0 min'), h('span', {}, diff == null ? 'played' : `played · ${diff >= 0 ? '+' : ''}${diff}% vs the week before`)),
      h('div', { class: 'recap-facts' },
        h('div', {}, h('b', {}, String(days)), h('span', {}, days === 1 ? 'day you played' : 'days you played')),
        h('div', {}, h('b', {}, String(week.length)), h('span', {}, week.length === 1 ? 'session' : 'sessions')),
        longest && S.byId.get(longest.id) ? h('div', {}, h('b', {}, fmtHours(longest.m)), h('span', {}, `longest, ${displayName(S.byId.get(longest.id))}`)) : null),
      topGames.length ? h('div', { class: 'recap-top' }, topGames.map(([it, m], i) => h('button', { class: 'recap-game', onclick: () => openDetails(it.id) },
        h('span', { class: 'recap-rank' }, String(i + 1)), h('div', { class: 'recap-art' }, artFor(it)), h('div', {}, h('b', {}, displayName(it)), h('span', {}, fmtHours(m)))))) : null));
}
