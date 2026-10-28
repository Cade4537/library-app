/* global api, S, $, h, icon, prefs, openModal, openDetails, launch, artFor, displayName, visible, SOURCES, fmtHours, timeAgo,
   childrenOf, descendants, hashHue, render, renderSidebar, setHeroBg, heroUrlFor, spatial, hydrateIcons, showToast, closeTopLayer, notInstalled */
// Discord tab, accent colors, the collapsible sidebar and the full screen controller mode.

// ---------- accent colors ----------
const ACCENTS = {
  crimson: { name: 'Crimson', c: '#e11d2e', hover: '#f5394a' },
  scarlet: { name: 'Scarlet', c: '#ff3040', hover: '#ff5866' },
  ruby: { name: 'Ruby', c: '#c8174f', hover: '#e0336a' },
  blood: { name: 'Blood', c: '#a3101e', hover: '#c21a2b' },
  ember: { name: 'Ember', c: '#f0452a', hover: '#ff6347' },
  rose: { name: 'Rose', c: '#ff4d7a', hover: '#ff7097' },
};

function applyAccent(key) {
  const a = ACCENTS[key] || ACCENTS.crimson;
  S.accent = ACCENTS[key] ? key : 'crimson';
  prefs.set('accent', S.accent);
  const r = parseInt(a.c.slice(1, 3), 16), g = parseInt(a.c.slice(3, 5), 16), b = parseInt(a.c.slice(5, 7), 16);
  const root = document.documentElement.style;
  root.setProperty('--accent', a.c);
  root.setProperty('--accent-hover', a.hover);
  root.setProperty('--accent-soft', `rgba(${r}, ${g}, ${b}, .14)`);
  root.setProperty('--blue', a.c);
}

// ---------- collapsible sidebar ----------
function setSideCollapsed(v) {
  S.sideCollapsed = v;
  prefs.set('sideCollapsed', v);
  document.body.classList.toggle('side-collapsed', v);
  const b = $('#sideToggle');
  if (b) b.title = v ? 'Show the sidebar' : 'Shrink the sidebar to icons';
  setTimeout(syncDiscord, 220);
}

// ---------- Discord tab ----------
// Discord and the Remote Play stream are native views laid over the page. They follow their
// placeholder box, and step aside while a menu, dialog or controller mode is on top.
const embedShown = { discord: false, stream: false };
function syncEmbed(kind, hostSel, viewType, send) {
  if (!api || !send) return;
  const clear = !S.modals.length && !document.querySelector('#menuRoot .menu') && !S.guideOpen;
  const host = $(hostSel);
  const on = S.view.type === viewType && clear && host && !host.closest('[hidden]') && (kind !== 'stream' || (S.stream && S.stream.open));
  if (!on) {
    if (embedShown[kind]) { send(null); embedShown[kind] = false; }
    return;
  }
  const r = host.getBoundingClientRect();
  send({ x: r.left, y: r.top, width: r.width, height: r.height });
  embedShown[kind] = true;
}
function syncDiscord() {
  syncEmbed('discord', '#discordHost', 'discord', api && api.discordBounds);
  syncEmbed('stream', '#streamHost', 'remoteplay', api && api.streamBounds);
}

// Screen share from the Discord tab: pick a screen or window.
function pickShareSource({ id, list }) {
  let chosen = null;
  const screens = list.filter((s) => s.screen);
  const windows = list.filter((s) => !s.screen);
  const tile = (s) => h('button', { class: 'src-tile', onclick: () => { chosen = s.id; m.close(); } },
    h('img', { src: s.thumb, alt: '' }), h('span', {}, s.name));
  const m = openModal({
    title: 'Share your screen',
    body: h('div', {},
      screens.length ? [h('h3', { class: 'section-title' }, 'Screens'), h('div', { class: 'src-grid' }, screens.map(tile))] : null,
      windows.length ? [h('h3', { class: 'section-title', style: { marginTop: '16px' } }, 'Windows'), h('div', { class: 'src-grid' }, windows.map(tile))] : null),
    actions: [{ label: 'Cancel' }],
    cls: 'wide',
    onClose: () => api.discordSource(id, chosen),
  });
}

// ---------- full screen controller mode ----------
function tvRows() {
  const games = S.lib.items.filter((it) => visible(it) && it.kind === 'game');
  const apps = S.lib.items.filter((it) => visible(it) && it.kind !== 'game');
  const byName = (a, b) => displayName(a).localeCompare(displayName(b), undefined, { numeric: true, sensitivity: 'base' });
  const rows = [];
  const recent = S.lib.items.filter((it) => visible(it) && it.lastPlayed).sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0) || b.lastPlayed - a.lastPlayed).slice(0, 14);
  if (recent.length) rows.push(['Continue playing', recent]);
  const fav = S.lib.items.filter((it) => visible(it) && it.favorite).sort(byName);
  if (fav.length) rows.push(['Favorites', fav]);
  const root = childrenOf(null).find((c) => /^games$/i.test(c.name));
  if (root) {
    const cats = childrenOf(root.id).map((c) => {
      const set = descendants(c.id);
      return [c.name, games.filter((it) => set.has(it.categoryId)).sort(byName)];
    }).filter(([, list]) => list.length).sort((a, b) => b[1].length - a[1].length);
    rows.push(...cats);
    const placed = new Set(cats.flatMap(([, l]) => l.map((it) => it.id)));
    const rest = games.filter((it) => !placed.has(it.id)).sort(byName);
    if (rest.length) rows.push([cats.length ? 'More games' : 'Games', rest]);
  } else if (games.length) rows.push(['Games', games.sort(byName)]);
  if (apps.length) rows.push(['Apps', apps.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || byName(a, b)).slice(0, 40)]);
  return rows;
}

function tvFeature(it) {
  const tv = $('#tv');
  if (!tv || !it) return;
  const bg = tv.querySelector('.tv-bg');
  bg.classList.remove('real');
  bg.style.backgroundImage = it.coverUrl ? `url("${it.coverUrl}")` : '';
  bg.style.backgroundColor = it.coverUrl ? '' : `hsl(${hashHue(it.name) % 360} 45% 14%)`;
  const cur = it.id;
  // Wait until focus settles before asking Steam, so scrolling fast does not send dozens of lookups.
  clearTimeout(tvFeature.timer);
  if (S.storeInfo.has(it.id)) { const info = S.storeInfo.get(it.id); if (info) setHeroBg(bg, it, info); }
  else tvFeature.timer = setTimeout(() => heroUrlFor(it, (info) => { if (tv.dataset.focus === cur) setHeroBg(bg, it, info); }), 450);
  tv.dataset.focus = it.id;
  const ach = it.meta && it.meta.achievements && it.meta.achievements.total ? it.meta.achievements : null;
  tv.querySelector('.tv-feature').replaceChildren(
    h('div', { class: 'tv-kicker' }, [SOURCES[it.source], it.running ? 'Playing now' : null, notInstalled(it) ? 'Not installed' : null].filter(Boolean).join(' · ')),
    h('div', { class: 'tv-name' }, displayName(it)),
    h('div', { class: 'tv-sub' }, [it.minutes ? `${fmtHours(it.minutes)} played` : null, it.lastPlayed && !it.running ? `Last played ${timeAgo(it.lastPlayed).toLowerCase()}` : null, ach ? `${ach.have} of ${ach.total} achievements` : null].filter(Boolean).join(' · ')));
}

// Controller mode now uses the Home hub, full screen. The old row screen stays hidden.
function renderTV() { const tv = $('#tv'); if (tv) tv.hidden = true; }

function tvClock() {
  const el = $('#tv .tv-clock');
  if (el) el.textContent = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function setTV(on) {
  S.tv = on;
  document.body.classList.toggle('ctl-mode', on);
  $('#tv').hidden = true;
  if (api.setFullscreen) api.setFullscreen(on);
  if (on) setView({ type: 'hub' });
  else render();
  syncDiscord();
  setTimeout(() => spatial.focusDefault(), 80);
}

// LB / RB in controller mode: jump to the row above or below, keeping roughly the same spot.
function tvJumpRow(delta) {
  const cur = document.activeElement && document.activeElement.closest && document.activeElement.closest('.tv-card');
  const sections = [...document.querySelectorAll('#tv .tv-section')];
  if (!sections.length) return;
  const at = cur ? sections.indexOf(cur.closest('.tv-section')) : -1;
  const next = sections[Math.max(0, Math.min(sections.length - 1, at + delta))];
  if (!next || (cur && next === cur.closest('.tv-section'))) return;
  const cards = [...next.querySelectorAll('.tv-card')];
  let pick = cards[0];
  if (cur) {
    const x = cur.getBoundingClientRect().left;
    pick = cards.reduce((best, c) => (Math.abs(c.getBoundingClientRect().left - x) < Math.abs(best.getBoundingClientRect().left - x) ? c : best), cards[0]);
  }
  spatial.focusEl(pick);
}

function wireFeatures() {
  applyAccent(S.accent);
  document.body.classList.toggle('side-collapsed', !!S.sideCollapsed);
  $('#sideToggle').addEventListener('click', () => toggleGuide());
  $('#guideBack').addEventListener('mousedown', () => closeGuide());
  $('#tvBtn').addEventListener('click', () => setTV(true));
  $('#tvExit').addEventListener('click', () => setTV(false));
  $('#streamStartBtn').addEventListener('click', () => startRemotePlay('inapp'));
  if (api.streamState) api.streamState().then((st) => { S.stream = st; if (S.view.type === 'remoteplay') render(); });
  window.addEventListener('resize', syncDiscord);
  const host = $('#discordHost');
  if (window.ResizeObserver && host) new ResizeObserver(() => syncDiscord()).observe(host);
  const sHost = $('#streamHost');
  if (window.ResizeObserver && sHost) new ResizeObserver(() => syncDiscord()).observe(sHost);
  if (api.onStreamState) api.onStreamState((st) => { S.stream = st; if (S.view.type === 'remoteplay' || !st.open) render(); else renderSidebar(); });
  if (api.onDiscordPickSource) api.onDiscordPickSource(pickShareSource);
  setInterval(tvClock, 15000);
  document.addEventListener('keydown', (e) => {
    if (!S.tv) return;
    if (e.key === 'Escape' && S.view.type === 'hub' && !S.modals.length && !document.querySelector('#menuRoot .menu')) { e.preventDefault(); setTV(false); }
  });
  hydrateIcons();
  // Open in controller mode when that is turned on in Settings.
  const wait = setInterval(() => {
    if (!S.lib || !S.lib.items.length) return;
    clearInterval(wait);
    if (S.lib.settings.tvOnStart) setTV(true);
  }, 300);
  setTimeout(() => clearInterval(wait), 20000);
}

document.addEventListener('DOMContentLoaded', wireFeatures);
