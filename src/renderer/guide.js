/* global api, S, $, h, icon, prefs, displayName, visible, isGrouped, isDupe, notInstalled, artFor, fmtHours, timeAgo, SOURCES,
   setView, launch, openDetails, openMenu, showToast, surprise, openSettings, spatial, setTV, fillEl, hashHue, render, syncDiscord,
   childrenOf, descendants, catPath, categoryMenu, newCategory, dropTarget, addManual, smartList, smartEditor, matchSmart,
   groupMinutes, NP, sendMedia, openAppleMusic, powerMenu, keepFocus, tile, renderLibraryOverview, STATUS_NAMES, clockText */
// 0.12.1: the guide (an Xbox style menu that slides over any page), the Library tabs,
// and the Surprise me page.

// ---------- the guide ----------
const MAIN_PAGES = [
  ['hub', 'Home', 'home'],
  ['library', 'Library', 'grid'],
  ['deals', 'Deals & News', 'tag'],
  ['friends', 'Social', 'users'],
  ['stats', 'Statistics', 'chart'],
  ['surprise', 'Surprise me', 'dice'],
  ['remoteplay', 'Xbox Remote Play', 'gamepad'],
];
const LIB_TYPES = new Set(['library', 'games', 'apps', 'favorites', 'recent', 'backlog', 'added', 'home', 'arcade', 'category', 'smart', 'launcher', 'uncategorized', 'hidden', 'libcollections', 'libcategories', 'liblaunchers', 'libmanage']);
function pageOf(type) {
  if (type === 'discord') return 'friends';
  if (LIB_TYPES.has(type)) return 'library';
  if (type === 'storage' || type === 'launchers') return 'library';
  return type;
}

function guideEl() { return document.getElementById('guide'); }
function openGuide() {
  if (S.guideOpen) return;
  S.guideOpen = true;
  renderGuide();
  document.body.classList.add('guide-open');
  syncDiscord();
  setTimeout(() => { const g = guideEl(); const f = g && (g.querySelector('.gd-page.active') || g.querySelector('button')); if (f) spatial.focusEl(f); }, 60);
}
function closeGuide() {
  if (!S.guideOpen) return false;
  S.guideOpen = false;
  document.body.classList.remove('guide-open');
  syncDiscord();
  setTimeout(() => spatial.focusDefault(), 220);
  return true;
}
function toggleGuide() { if (S.guideOpen) closeGuide(); else openGuide(); }
// Runs an action from the guide: close it first so the page or dialog is in front.
const fromGuide = (fn) => () => { closeGuide(); setTimeout(fn, 10); };

function renderGuide() {
  const g = guideEl();
  if (!g) return;
  const running = S.lib.items.find((it) => it.running && it.kind === 'game');
  const online = (S.friends.people || []).filter((p) => p.status && p.status !== 'offline');
  const playing = online.filter((p) => p.status === 'ingame');
  const people = [...playing, ...online.filter((p) => !playing.includes(p))].slice(0, 5);
  const st = (typeof NP !== 'undefined' && NP.state) || {};
  const cur = pageOf(S.view.type);
  const act = (p) => { const a = (p.accounts || []).find((x) => x.activity); return a ? a.activity : p.status === 'ingame' ? 'In a game' : 'Online'; };
  const av = (p) => (p.avatar ? h('img', { class: 'f-av', src: p.avatar, alt: '' }) : h('div', { class: 'f-av f-init' }, (p.name[0] || '?').toUpperCase()));
  const music = S.lib.settings.musicEnabled !== false && st.active;
  fillEl(g,
    h('div', { class: 'gd-head' }, h('span', { class: 'brand-mark' }), h('span', { class: 'gd-brand' }, 'Crimson Vault'), h('span', { class: 'gd-clock' }, clockText())),
    running || music ? h('div', { class: 'gd-now' },
      running ? h('div', { class: 'gd-game' }, h('div', { class: 'gd-art' }, artFor(running)),
        h('div', { class: 'gd-gtext' }, h('span', { class: 'gd-kicker' }, h('span', { class: 'live-dot' }), 'Playing now'), h('b', {}, displayName(running)),
          h('button', { class: 'btn primary', onclick: fromGuide(async () => { const r = await api.focusGame(running.id); if (!r || !r.ok) launch(running.id); }) }, icon('play'), 'Back to game'))) : null,
      music ? h('div', { class: 'gd-music' }, st.art ? h('img', { src: st.art, alt: '' }) : h('span', { class: 'gd-mart' }, icon('music')),
        h('div', { class: 'gd-mtext' }, h('b', {}, st.title || 'Unknown track'), h('span', {}, String(st.artist || '').split(' — ')[0])),
        h('button', { class: 'icon-btn', title: 'Previous', onclick: () => sendMedia('prev') }, icon('prev')),
        h('button', { class: 'icon-btn', title: 'Play or pause', onclick: () => { sendMedia('toggle'); setTimeout(renderGuide, 60); } }, icon(st.status === 'Playing' ? 'pause' : 'play')),
        h('button', { class: 'icon-btn', title: 'Next', onclick: () => sendMedia('next') }, icon('next'))) : null) : null,
    h('nav', { class: 'gd-pages' }, MAIN_PAGES.map(([type, label, ic]) => h('button', { class: 'gd-page' + (cur === type ? ' active' : ''), onclick: fromGuide(() => setView({ type })) },
      icon(ic), h('span', {}, label),
      type === 'friends' && online.length ? h('span', { class: 'count' }, `${online.length} online`) : null,
      type === 'remoteplay' && S.stream.open ? h('span', { class: 'live-dot' }) : null))),
    h('div', { class: 'gd-sec' }, h('div', { class: 'gd-label' }, 'Friends online'),
      people.length ? people.map((p) => h('button', { class: `gd-friend st-${p.status}`, onclick: fromGuide(() => setView({ type: 'friends' })) },
        h('div', { class: 'f-avwrap' }, av(p), h('span', { class: `f-badge st-${p.status}` })), h('div', { class: 'hf-text' }, h('b', {}, p.name), h('span', {}, act(p)))))
        : h('div', { class: 'help', style: { padding: '2px 4px' } }, S.friends.configured ? 'Nobody is online right now.' : 'Connect Steam, Xbox or Epic in Settings.')),
    h('div', { class: 'gd-quick' },
      h('button', { onclick: fromGuide(() => { $('#search').focus(); $('#search').select(); }) }, icon('search'), 'Search'),
      h('button', { onclick: fromGuide(() => openSettings()) }, icon('gear'), 'Settings'),
      h('button', { onclick: fromGuide(() => setTV(!S.tv)) }, icon('tv'), S.tv ? 'Exit controller' : 'Controller mode'),
      h('button', { class: 'power', onclick: (e) => powerMenu({ el: e.currentTarget }) }, icon('power'), 'Power')),
    h('div', { class: 'gd-hint' }, h('b', { class: 'pb sh' }, 'View'), 'opens the guide', h('b', { class: 'pb b' }, 'B'), 'closes'));
}

// ---------- Library tabs ----------
const LIB_TABS = [
  ['library', 'Overview'],
  ['games', 'Games'],
  ['apps', 'Apps'],
  ['libcollections', 'Collections'],
  ['libcategories', 'Categories'],
  ['liblaunchers', 'Launchers'],
  ['libmanage', 'Manage'],
];
function libTabOf(type) {
  if (type === 'smart') return 'libcollections';
  if (type === 'category' || type === 'uncategorized') return 'libcategories';
  if (type === 'launcher') return 'liblaunchers';
  if (type === 'hidden') return 'libmanage';
  return LIB_TABS.some(([t]) => t === type) ? type : 'library';
}
function libTabs() {
  const cur = libTabOf(S.view.type);
  return h('div', { class: 'page-tabs' }, LIB_TABS.map(([type, label]) => h('button', { class: cur === type ? 'on' : '', 'data-tab': type, onclick: () => setView({ type }) }, label)));
}
const isLibraryView = (type) => LIB_TYPES.has(type);

const mosaicOf = (list, fallback) => {
  const covers = list.filter((it) => it.coverUrl).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (b.minutes || 0) - (a.minutes || 0)).slice(0, 4);
  return h('div', { class: 'coll-mosaic n' + Math.max(1, covers.length) }, covers.length ? covers.map((it) => h('img', { src: it.coverUrl, alt: '', loading: 'lazy', draggable: 'false' }))
    : h('div', { class: 'coll-empty', style: fallback ? { background: `hsl(${hashHue(fallback) % 360} 45% 18%)` } : {} }, fallback ? fallback[0].toUpperCase() : icon('sparkle')));
};
const collTile = (k, title, sub, list, onclick, extra) => h('button', { class: 'coll' + (extra || ''), 'data-k': k, onclick }, mosaicOf(list, title),
  h('div', { class: 'coll-info' }, h('div', { class: 'coll-name' }, title), h('div', { class: 'coll-sub' }, sub)));

function renderLibraryHub() {
  const box = $('#libraryView');
  if (!box) return;
  const type = S.view.type;
  if (box.dataset.type !== type) { box.dataset.type = type; box.dataset.sig = ''; }
  if (type === 'library') return renderLibraryOverview(box);
  const vis = S.lib.items.filter(visible);
  const games = vis.filter((it) => it.kind === 'game');
  let sig;
  let build;
  if (type === 'libcollections') {
    const root = childrenOf(null).find((c) => /^games$/i.test(c.name));
    const folders = root ? childrenOf(root.id).map((c) => { const set = descendants(c.id); return { c, list: games.filter((it) => set.has(it.categoryId)) }; }).filter((x) => x.list.length).sort((a, b) => b.list.length - a.list.length) : [];
    const smart = smartList().map((c) => ({ c, list: vis.filter((it) => matchSmart(c, it)) }));
    sig = JSON.stringify([folders.map((f) => [f.c.id, f.list.length, f.list.slice(0, 4).map((x) => x.coverUrl)]), smart.map((x) => [x.c.id, x.c.name, x.list.length])]);
    build = () => [
      h('section', { class: 'hub-sec' }, h('div', { class: 'sec-head' }, h('h3', { class: 'section-title' }, 'Smart collections'), h('button', { class: 'link-btn', onclick: () => smartEditor(null) }, '+ New smart collection')),
        h('div', { class: 'coll-row' }, smart.map(({ c, list }) => {
          const b = collTile(`s:${c.id}`, c.name, `${list.length} · fills itself`, list, () => setView({ type: 'smart', id: c.id }), ' smart');
          b.addEventListener('contextmenu', (e) => { e.preventDefault(); smartEditor(c); });
          return b;
        }), h('button', { class: 'coll add', 'data-k': 's:new', onclick: () => smartEditor(null) }, h('div', { class: 'coll-plus' }, icon('plus'), h('span', {}, 'New smart collection'))))),
      folders.length ? h('section', { class: 'hub-sec' }, h('h3', { class: 'section-title' }, 'Genres'),
        h('div', { class: 'coll-row' }, folders.map((f) => collTile(`c:${f.c.id}`, f.c.name, `${f.list.length} ${f.list.length === 1 ? 'game' : 'games'}`, f.list, () => setView({ type: 'category', id: f.c.id }))))) : null,
    ];
  } else if (type === 'libcategories') {
    const counts = new Map();
    for (const it of vis) { let c = S.cats.get(it.categoryId); while (c) { counts.set(c.id, (counts.get(c.id) || 0) + 1); c = c.parentId ? S.cats.get(c.parentId) : null; } }
    const uncat = vis.filter((it) => !it.categoryId || !S.cats.has(it.categoryId));
    sig = JSON.stringify([S.lib.categories.map((c) => [c.id, c.name, c.parentId, c.order]), [...counts], uncat.length]);
    const catTile = (c) => {
      const set = descendants(c.id);
      const list = vis.filter((it) => set.has(it.categoryId));
      const kids = childrenOf(c.id);
      const b = collTile(`cat:${c.id}`, c.name, `${counts.get(c.id) || 0}${kids.length ? ` · ${kids.length} folders` : ''}`, list, () => setView({ type: 'category', id: c.id }));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); categoryMenu(c.id, { x: e.clientX, y: e.clientY }); });
      dropTarget(b, { item: (id) => { api.updateItem(id, { categoryId: c.id }); showToast(`Moved to ${c.name}`); } });
      return b;
    };
    build = () => [
      ...childrenOf(null).map((root) => h('section', { class: 'hub-sec' },
        h('div', { class: 'sec-head' }, h('button', { class: 'sec-link', onclick: () => setView({ type: 'category', id: root.id }) }, h('h3', { class: 'section-title' }, `${root.name} · ${counts.get(root.id) || 0}`)),
          h('button', { class: 'link-btn', onclick: () => newCategory(root.id) }, `+ Folder in ${root.name}`)),
        childrenOf(root.id).length ? h('div', { class: 'coll-row' }, childrenOf(root.id).filter((c) => counts.get(c.id) || childrenOf(c.id).length || !/^(action|adventure|rpg|shooter|strategy|simulation|racing|sports|puzzle|horror|survival|mmo|casual|indie|demos)$/i.test(c.name)).map(catTile))
          : h('div', { class: 'help' }, 'No folders yet.'))),
      h('section', { class: 'hub-sec' }, h('div', { class: 'chip-row' },
        h('button', { class: 'chip', 'data-k': 'cat:uncat', onclick: () => setView({ type: 'uncategorized' }) }, icon('inbox'), 'Uncategorized', h('span', { class: 'count' }, uncat.length)),
        h('button', { class: 'chip ghost', 'data-k': 'cat:new', onclick: () => newCategory(null) }, icon('plus'), 'New category'))),
      h('div', { class: 'help' }, 'Right click a folder to rename, move or delete it. Drag games onto a folder to move them.'),
    ];
  } else if (type === 'liblaunchers') {
    const bySource = new Map();
    for (const it of games) { if (!bySource.has(it.source)) bySource.set(it.source, []); bySource.get(it.source).push(it); }
    const list = [...bySource].sort((a, b) => b[1].length - a[1].length);
    sig = JSON.stringify(list.map(([s, l]) => [s, l.length, l.slice(0, 4).map((x) => x.coverUrl)]));
    build = () => [
      h('section', { class: 'hub-sec' }, h('div', { class: 'coll-row' }, list.map(([src, l]) => collTile(`src:${src}`, SOURCES[src] || src, `${l.length} ${l.length === 1 ? 'game' : 'games'} · ${fmtHours(l.reduce((a, it) => a + (it.minutes || 0), 0)) || 'not played'}`, l, () => setView({ type: 'launcher', source: src }), ` src-${src} src-tile`)))),
      h('section', { class: 'hub-sec' }, h('div', { class: 'chip-row' }, h('button', { class: 'chip', 'data-k': 'src:manage', onclick: () => setView({ type: 'launchers' }) }, icon('rocket'), 'Open, install or update launchers'))),
    ];
  } else if (type === 'libmanage') {
    const hidden = S.lib.items.filter((it) => it.hidden).length;
    const uncat = vis.filter((it) => !it.categoryId || !S.cats.has(it.categoryId)).length;
    const free = S.drives ? S.drives.reduce((a, d) => a + d.free, 0) : null;
    sig = JSON.stringify([hidden, uncat, free, !!S.lib.scanning]);
    build = () => [h('div', { class: 'lib-tiles' },
      tile('m:storage', 'drive', 'Storage', free != null ? `${(free / 1e9).toFixed(0)} GB free` : 'Drives and big games', () => setView({ type: 'storage' })),
      tile('m:launchers', 'rocket', 'Launchers', 'Open, install or update', () => setView({ type: 'launchers' })),
      tile('m:uncat', 'inbox', 'Uncategorized', `${uncat}`, () => setView({ type: 'uncategorized' })),
      tile('m:hidden', 'eyeOff', 'Hidden', `${hidden}`, () => setView({ type: 'hidden' })),
      tile('m:add', 'plus', 'Add a game or app', 'Any program, shortcut or link', () => addManual()),
      tile('m:rescan', 'refresh', 'Rescan launchers', S.lib.scanning ? 'Scanning now' : 'Find new installs', () => { if (!S.lib.scanning) { showToast('Scanning launchers'); api.rescan(); } }),
      tile('m:covers', 'image', 'Find missing covers', 'Ask Steam and SteamGridDB again', async () => { await api.refetchCovers(); showToast('Looking for missing covers'); }))];
  } else return;
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  keepFocus(box, () => fillEl(box, ...build()));
}

// ---------- Surprise me page ----------
const SP = { get f() { return prefs.get('surpriseFilter', { source: '', folder: '', only: '' }); }, set f(v) { prefs.set('surpriseFilter', v); } };
function surpriseFromPage() {
  const f = SP.f;
  const owned = S.surprisePool === 'owned';
  const set = f.folder && S.cats.has(f.folder) ? descendants(f.folder) : null;
  const pool = S.lib.items.filter((it) => it.kind === 'game' && !it.hidden && !isGrouped(it) && !isDupe(it)
    && (it.installed || it.manual || (owned && it.owned))
    && (!f.source || it.source === f.source)
    && (!set || set.has(it.categoryId))
    && (f.only !== 'unplayed' || !(groupMinutes(it) > 0 || it.lastPlayed))
    && (f.only !== 'backlog' || it.status === 'backlog')
    && (f.only !== 'favorites' || it.favorite)
    && (f.only !== 'short' || (it.meta && it.meta.sizeBytes && it.meta.sizeBytes < 8e9)));
  return { pool, from: 'your picks' };
}
function onSurpriseLanded(it) {
  const list = prefs.get('spinHistory', []).filter((x) => x.id !== it.id);
  list.unshift({ id: it.id, at: Date.now() });
  prefs.set('spinHistory', list.slice(0, 12));
  if (S.view.type === 'surprise') { const b = $('#surpriseView'); if (b) b.dataset.sig = ''; setTimeout(renderSurprisePage, 1200); }
}
function renderSurprisePage() {
  const box = $('#surpriseView');
  if (!box) return;
  const f = SP.f;
  const { pool } = surpriseFromPage();
  const games = S.lib.items.filter((it) => it.kind === 'game' && !it.hidden && !isGrouped(it));
  const sources = [...new Set(games.map((it) => it.source))].sort((a, b) => (SOURCES[a] || a).localeCompare(SOURCES[b] || b));
  const root = childrenOf(null).find((c) => /^games$/i.test(c.name));
  const folders = root ? childrenOf(root.id).filter((c) => { const s2 = descendants(c.id); return games.some((it) => s2.has(it.categoryId)); }) : [];
  const hist = prefs.get('spinHistory', []).map((x) => ({ ...x, it: S.byId.get(x.id) })).filter((x) => x.it);
  const sig = JSON.stringify([f, S.surprisePool, pool.length, sources, folders.map((c) => c.id), hist.map((x) => x.id + x.it.coverUrl)]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const setF = (patch) => { SP.f = { ...SP.f, ...patch }; renderSurprisePage(); };
  const chip = (k, label, on, run) => h('button', { class: 'chip' + (on ? ' on' : ''), 'data-k': k, onclick: run }, label);
  const covers = pool.filter((it) => it.coverUrl).sort(() => Math.random() - 0.5).slice(0, 7);
  keepFocus(box, () => fillEl(box,
    h('div', { class: 'sp-hero' },
      h('div', { class: 'sp-fan' }, covers.map((it, i) => h('div', { class: 'sp-fancard', style: `--i:${i - (covers.length - 1) / 2}` }, artFor(it)))),
      h('div', { class: 'sp-text' },
        h('div', { class: 'hero-kicker' }, 'Surprise me'),
        h('div', { class: 'sp-title' }, 'Can\'t decide? Spin for it.'),
        h('div', { class: 'hero-sub' }, pool.length ? `Picks from ${pool.length} ${pool.length === 1 ? 'game' : 'games'}` : 'No games match these choices'),
        h('button', { class: 'btn primary big sp-go', 'data-k': 'sp:go', disabled: !pool.length, onclick: () => surprise() }, icon('dice'), 'Spin'))),
    h('section', { class: 'hub-sec sp-opts' },
      h('div', { class: 'sp-row' }, h('label', {}, 'Pick from'), h('div', { class: 'chip-row' },
        chip('sp:inst', 'Installed games', S.surprisePool !== 'owned', () => { S.surprisePool = 'installed'; prefs.set('surprisePool', 'installed'); renderSurprisePage(); }),
        chip('sp:own', 'All owned games', S.surprisePool === 'owned', () => { S.surprisePool = 'owned'; prefs.set('surprisePool', 'owned'); renderSurprisePage(); }))),
      h('div', { class: 'sp-row' }, h('label', {}, 'Only'), h('div', { class: 'chip-row' },
        [['', 'Anything'], ['unplayed', 'Never played'], ['backlog', 'Backlog'], ['favorites', 'Favorites'], ['short', 'Small games (under 8 GB)']].map(([k, n]) => chip(`sp:o:${k}`, n, (f.only || '') === k, () => setF({ only: k }))))),
      folders.length ? h('div', { class: 'sp-row' }, h('label', {}, 'Genre'), h('div', { class: 'chip-row' },
        chip('sp:g:', 'Any', !f.folder, () => setF({ folder: '' })), folders.map((c) => chip(`sp:g:${c.id}`, c.name, f.folder === c.id, () => setF({ folder: c.id }))))) : null,
      h('div', { class: 'sp-row' }, h('label', {}, 'Launcher'), h('div', { class: 'chip-row' },
        chip('sp:s:', 'Any', !f.source, () => setF({ source: '' })), sources.map((src) => chip(`sp:s:${src}`, SOURCES[src] || src, f.source === src, () => setF({ source: src })))))),
    hist.length ? h('section', { class: 'hub-sec' }, h('div', { class: 'sec-head' }, h('h3', { class: 'section-title' }, 'Past picks'),
      h('button', { class: 'link-btn', onclick: () => { prefs.set('spinHistory', []); box.dataset.sig = ''; renderSurprisePage(); } }, 'Clear')),
      h('div', { class: 'sp-hist' }, hist.map(({ it, at }) => h('button', { class: 'lr-card', 'data-k': `sph:${it.id}`, onclick: () => openDetails(it.id) }, artFor(it),
        h('div', { class: 'lr-info' }, h('b', {}, displayName(it)), h('span', {}, timeAgo(at))))))) : null));
}
