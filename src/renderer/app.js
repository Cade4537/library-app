/* global icon, hydrateIcons, spatial */
const api = window.library;
const $ = (s, r = document) => r.querySelector(s);

// ---------- helpers ----------
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    e.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return e;
}

const prefs = {
  get(k, d) {
    try { const v = localStorage.getItem('lib.' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('lib.' + k, JSON.stringify(v)); } catch {}
  },
};

const norm = (s) => String(s || '').toLowerCase().replace(/[™®©]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const displayName = (it) => it.customName || it.name;

function hashHue(s) {
  let x = 0;
  for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) >>> 0;
  return 340 + (x % 34); // stays in the red range to match the theme
}

function timeAgo(t) {
  if (!t) return 'Never played';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  const d = Math.floor(s / 86400);
  if (d === 1) return 'Yesterday';
  if (d < 30) return `${d} days ago`;
  return new Date(t).toLocaleDateString();
}

const SOURCES = {
  steam: 'Steam', epic: 'Epic', gog: 'GOG', ubisoft: 'Ubisoft', xbox: 'Xbox', rockstar: 'Rockstar', riot: 'Riot',
  curseforge: 'CurseForge', app: 'App', msstore: 'Store', manual: 'Added',
};
const SOURCE_ORDER = Object.keys(SOURCES);

// ---------- state ----------
const S = {
  lib: { items: [], categories: [], settings: {} },
  byId: new Map(),
  cats: new Map(),
  kids: new Map(),
  view: prefs.get('view', { type: 'home' }),
  search: '',
  source: 'all',
  sort: prefs.get('sort', 'name'),
  size: prefs.get('size', 170),
  collapsed: new Set(prefs.get('collapsed', [])),
  surprisePool: prefs.get('surprisePool', 'installed'),
  libMode: prefs.get('libMode', 'installed'),
  modals: [],
  menuReturn: null,
  keyErrorShown: false,
  update: { status: 'dev' },
  version: '',
};

function indexLibrary(snap) {
  S.lib = snap;
  S.byId = new Map(snap.items.map((i) => [i.id, i]));
  S.cats = new Map(snap.categories.map((c) => [c.id, c]));
  S.kids = new Map();
  for (const c of snap.categories) {
    const k = c.parentId || null;
    if (!S.kids.has(k)) S.kids.set(k, []);
    S.kids.get(k).push(c);
  }
  for (const list of S.kids.values()) list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  S.related = new Map();
  for (const it of snap.items) {
    if (!isGrouped(it)) continue;
    if (!S.related.has(it.parentId)) S.related.set(it.parentId, []);
    S.related.get(it.parentId).push(it);
  }
  for (const list of S.related.values()) list.sort((a, b) => displayName(a).localeCompare(displayName(b)));
  if (S.view.type === 'category' && !S.cats.has(S.view.id)) S.view = { type: 'home' };
}

const childrenOf = (id) => S.kids.get(id || null) || [];
function descendants(id) {
  const out = new Set([id]);
  const stack = [id];
  while (stack.length) for (const c of childrenOf(stack.pop())) { out.add(c.id); stack.push(c.id); }
  return out;
}
function catPath(id) {
  const parts = [];
  let c = S.cats.get(id);
  while (c) { parts.unshift(c); c = c.parentId ? S.cats.get(c.parentId) : null; }
  return parts;
}
// A helper app tucked under its suite's main app (for example Blackmagic RAW Player under DaVinci Resolve).
function isGrouped(it) {
  if (!it.parentId || it.ungrouped) return false;
  const p = S.byId.get(it.parentId);
  return !!(p && !p.missing && p.installed !== false);
}
// Owned on Steam or GOG but not installed on this PC.
const notInstalled = (it) => !it.installed && !it.manual && !!it.owned;
const shown = (it) => !it.hidden && (it.installed || it.manual || (S.libMode === 'all' && !!it.owned));
const visible = (it) => shown(it) && !isGrouped(it);
const relatedOf = (id) => (S.related && S.related.get(id)) || [];

// ---------- filtering ----------
function baseItems(view = S.view) {
  // While searching, helper apps are included so they can still be found by name.
  let list = S.lib.items.filter((it) => (view.type === 'hidden' ? it.hidden : S.search ? shown(it) : visible(it)));
  switch (view.type) {
    case 'favorites': list = list.filter((it) => it.favorite); break;
    case 'recent': list = list.filter((it) => it.lastPlayed > 0); break;
    case 'uncategorized': list = list.filter((it) => !it.categoryId || !S.cats.has(it.categoryId)); break;
    case 'category': {
      const set = descendants(view.id);
      list = list.filter((it) => set.has(it.categoryId));
      break;
    }
  }
  return list;
}

function viewItems() {
  let list = baseItems();
  if (S.source !== 'all') list = list.filter((it) => it.source === S.source);
  if (S.search) {
    const words = norm(S.search).split(' ').filter(Boolean);
    list = list.filter((it) => { const n = norm(displayName(it)); return words.every((w) => n.includes(w)); });
  }
  const byName = (a, b) => displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base', numeric: true });
  const sort = S.view.type === 'recent' ? 'played' : S.sort;
  if (sort === 'played') list.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || byName(a, b));
  else if (sort === 'added') list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0) || byName(a, b));
  else if (sort === 'most') list.sort((a, b) => (b.playCount || 0) - (a.playCount || 0) || byName(a, b));
  else list.sort(byName);
  return list;
}

function viewTitle(view = S.view) {
  switch (view.type) {
    case 'home': return 'Home';
    case 'favorites': return 'Favorites';
    case 'recent': return 'Recently played';
    case 'uncategorized': return 'Uncategorized';
    case 'hidden': return 'Hidden';
    case 'category': return (S.cats.get(view.id) || {}).name || 'Category';
    default: return 'Library';
  }
}

function setView(v) {
  S.view = v;
  S.source = 'all';
  prefs.set('view', v);
  render();
  $('#content').scrollTop = 0;
}

// ---------- artwork ----------
function artFor(it) {
  const art = h('div', { class: 'art' + (it.coverFit === 'contain' ? ' contain' : '') });
  if (it.coverUrl) {
    if (it.coverFit === 'contain') art.append(h('img', { class: 'bg', src: it.coverUrl, alt: '', draggable: 'false' }));
    art.append(h('img', { class: 'cover', src: it.coverUrl, alt: '', draggable: 'false', loading: 'lazy' }));
  } else {
    const hue = hashHue(it.name);
    art.style.background = `linear-gradient(155deg, hsl(${hue % 360} 58% 27%), hsl(${(hue + 12) % 360} 35% 8%))`;
    const fb = h('div', { class: 'fallback' });
    if (it.iconUrl) fb.append(h('img', { src: it.iconUrl, alt: '', draggable: 'false' }));
    else fb.append(h('div', { class: 'initial' }, (displayName(it).match(/[A-Za-z0-9]/) || ['?'])[0].toUpperCase()));
    fb.append(h('div', { class: 'fname' }, displayName(it)));
    art.append(fb);
  }
  return art;
}

// ---------- cards ----------
const cardCache = new Map();

function cardSig(it) {
  return [displayName(it), it.coverUrl, it.iconUrl, it.coverFit, it.favorite, it.source, it.missing, it.hidden, relatedOf(it.id).length, isGrouped(it), notInstalled(it)].join('|');
}

function buildCard(id) {
  const card = h('button', { class: 'card', 'data-id': id, draggable: 'true' });
  card.addEventListener('click', () => launch(id));
  card.addEventListener('contextmenu', (e) => { e.preventDefault(); itemMenu(id, { x: e.clientX, y: e.clientY }); });
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/x-item', id);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  return card;
}

function fillCard(card, it) {
  const sig = cardSig(it);
  if (card.dataset.sig === sig) return;
  card.dataset.sig = sig;
  card.classList.toggle('missing', !!it.missing);
  card.classList.toggle('not-installed', notInstalled(it));
  const art = artFor(it);
  art.append(h('span', { class: `badge src-${it.source}` }, SOURCES[it.source] || it.source));
  if (it.favorite) art.append(h('span', { class: 'fav-mark' }, icon('star')));
  const more = h('span', { class: 'more-btn', title: 'Options' }, icon('more'));
  more.addEventListener('click', (e) => { e.stopPropagation(); itemMenu(it.id, { el: card }); });
  art.append(more);
  if (notInstalled(it)) art.append(h('span', { class: 'ni-badge' }, icon('download'), 'Not installed'));
  art.append(h('div', { class: 'play-pill' }, h('span', {}, icon(notInstalled(it) ? 'download' : 'play'), notInstalled(it) ? 'Install' : it.kind === 'game' ? 'Play' : 'Open')));
  const rel = relatedOf(it.id).length;
  const sub = rel ? h('span', { class: 'sub related-link', role: 'button', onclick: (e) => { e.stopPropagation(); relatedModal(it.id); } }, `+${rel} related ${rel === 1 ? 'app' : 'apps'}`)
    : isGrouped(it) ? h('div', { class: 'sub' }, `Part of ${(S.byId.get(it.parentId) || {}).name || 'a suite'}`) : null;
  card.replaceChildren(...[art, h('div', { class: 'title' }, displayName(it)), sub].filter(Boolean));
  card.title = displayName(it);
}

function cardFor(it) {
  let c = cardCache.get(it.id);
  if (!c) { c = buildCard(it.id); cardCache.set(it.id, c); }
  fillCard(c, it);
  return c;
}

// ---------- rendering ----------
function render() {
  renderNowPlaying();
  document.documentElement.style.setProperty('--card-w', `${S.size}px`);
  renderSidebar();
  renderHeader();
  renderJump();
  renderFilters();
  renderGrid();
  const scanning = !!S.lib.scanning;
  $('#scanStatus').hidden = !scanning;
  $('#rescanBtn').classList.toggle('spinning', scanning);
}

function navButton(type, label, ic, count) {
  const active = S.view.type === type;
  const b = h('button', { class: 'nav-btn' + (active ? ' active' : ''), 'data-nav': type, onclick: () => setView({ type }) },
    icon(ic), h('span', { class: 'label' }, label), count != null ? h('span', { class: 'count' }, count) : null);
  if (type === 'favorites' || type === 'hidden') {
    dropTarget(b, {
      item: (id) => {
        api.updateItem(id, type === 'favorites' ? { favorite: true } : { hidden: true });
        showToast(type === 'favorites' ? 'Added to favorites' : 'Hidden');
      },
    });
  }
  return b;
}

function renderSidebar() {
  const vis = S.lib.items.filter(visible);
  const nav = $('#nav');
  nav.replaceChildren(
    navButton('home', 'Home', 'home', vis.length),
    navButton('favorites', 'Favorites', 'star', vis.filter((i) => i.favorite).length),
    navButton('recent', 'Recently played', 'clock', null),
    navButton('uncategorized', 'Uncategorized', 'inbox', vis.filter((i) => !i.categoryId || !S.cats.has(i.categoryId)).length || null),
    navButton('hidden', 'Hidden', 'eyeOff', S.lib.items.filter((i) => i.hidden).length || null)
  );

  const counts = new Map();
  for (const it of vis) {
    let c = S.cats.get(it.categoryId);
    while (c) { counts.set(c.id, (counts.get(c.id) || 0) + 1); c = c.parentId ? S.cats.get(c.parentId) : null; }
  }

  const tree = $('#tree');
  const build = (parentId) =>
    childrenOf(parentId).map((c) => {
      const kids = childrenOf(c.id);
      const open = !S.collapsed.has(c.id);
      const active = S.view.type === 'category' && S.view.id === c.id;
      const twisty = h('button', { class: 'twisty' + (kids.length ? (open ? ' open' : '') : ' none'), tabindex: kids.length ? null : '-1', 'aria-label': open ? 'Collapse' : 'Expand' }, icon('chevronRight'));
      twisty.addEventListener('click', () => {
        if (S.collapsed.has(c.id)) S.collapsed.delete(c.id); else S.collapsed.add(c.id);
        prefs.set('collapsed', [...S.collapsed]);
        renderSidebar();
      });
      const btn = h('button', { class: 'cat-btn' + (active ? ' active' : ''), 'data-cat': c.id, draggable: 'true' },
        icon('folder'), h('span', { class: 'label' }, c.name), h('span', { class: 'count' }, counts.get(c.id) || ''));
      btn.addEventListener('click', () => setView({ type: 'category', id: c.id }));
      btn.addEventListener('contextmenu', (e) => { e.preventDefault(); categoryMenu(c.id, { x: e.clientX, y: e.clientY }); });
      btn.addEventListener('dragstart', (e) => { e.dataTransfer.setData('application/x-cat', c.id); e.dataTransfer.effectAllowed = 'move'; });
      const row = h('div', { class: 'cat-row' }, twisty, btn);
      dropTarget(row, {
        item: (id) => { api.updateItem(id, { categoryId: c.id }); showToast(`Moved to ${c.name}`); },
        cat: (id, before) => {
          if (id === c.id) return;
          if (before) api.moveCategory(id, c.parentId, c.id);
          else { api.moveCategory(id, c.id, null); S.collapsed.delete(c.id); }
        },
      });
      const wrap = h('div', { class: 'cat-node' }, row);
      if (kids.length && open) wrap.append(h('div', { class: 'cat-children' }, build(c.id)));
      return wrap;
    });
  tree.replaceChildren(...build(null));
}

// Handles drops of cards and categories. For categories, the top quarter of a row means "place before".
function dropTarget(el, handlers) {
  const clear = () => el.classList.remove('drop-into', 'drop-before');
  el.addEventListener('dragover', (e) => {
    const types = e.dataTransfer.types;
    const isItem = types.includes('application/x-item') && handlers.item;
    const isCat = types.includes('application/x-cat') && handlers.cat;
    if (!isItem && !isCat) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const before = isCat && e.clientY < r.top + r.height * 0.28;
    el.classList.toggle('drop-before', before);
    el.classList.toggle('drop-into', !before);
  });
  el.addEventListener('dragleave', (e) => { if (!el.contains(e.relatedTarget)) clear(); });
  el.addEventListener('drop', (e) => {
    const before = el.classList.contains('drop-before');
    clear();
    const item = e.dataTransfer.getData('application/x-item');
    const cat = e.dataTransfer.getData('application/x-cat');
    if (item && handlers.item) { e.preventDefault(); handlers.item(item); }
    else if (cat && handlers.cat) { e.preventDefault(); handlers.cat(cat, before); }
  });
}

function renderHeader() {
  const head = $('#viewHeader');
  const kids = [];
  if (S.view.type === 'category') {
    const path = catPath(S.view.id);
    if (path.length > 1) {
      kids.push(h('div', { class: 'crumbs' }, path.slice(0, -1).map((c) => [
        h('button', { onclick: () => setView({ type: 'category', id: c.id }) }, c.name), h('span', {}, '›'),
      ])));
    }
  }
  const total = viewItems().length;
  kids.push(h('div', { class: 'title-row' }, h('h1', {}, S.search ? `Results for "${S.search}"` : viewTitle()), h('span', { class: 'count' }, `${total} ${total === 1 ? 'item' : 'items'}`)));
  if (S.view.type === 'category' && !S.search) {
    const subs = childrenOf(S.view.id);
    const chips = subs.map((c) => {
      const n = baseItems({ type: 'category', id: c.id }).length;
      const chip = h('button', { class: 'chip', onclick: () => setView({ type: 'category', id: c.id }) }, c.name, h('span', { class: 'count' }, n));
      dropTarget(chip, { item: (id) => { api.updateItem(id, { categoryId: c.id }); showToast(`Moved to ${c.name}`); } });
      return chip;
    });
    chips.push(h('button', { class: 'chip ghost', onclick: () => newCategory(S.view.id) }, icon('plus'), 'Subcategory'));
    kids.push(h('div', { class: 'subcats' }, chips));
  }
  head.replaceChildren(...kids);
}

function renderJump() {
  const sec = $('#jump');
  const recent = S.view.type === 'home' && !S.search && S.source === 'all'
    ? S.lib.items.filter((it) => visible(it) && it.lastPlayed).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 6)
    : [];
  sec.hidden = !recent.length;
  if (!recent.length) return;
  const tiles = recent.map((it) => {
    const t = h('button', { class: 'tile', title: displayName(it) });
    if (it.coverUrl) t.append(h('div', { class: 'tile-bg', style: { backgroundImage: `url("${it.coverUrl}")` } }));
    else t.append(h('div', { class: 'tile-bg', style: { background: `hsl(${hashHue(it.name) % 360} 50% 22%)` } }));
    t.append(
      h('div', { class: 'tile-art' }, artFor(it)),
      h('div', { class: 'tile-info' },
        h('div', { class: 'tile-name' }, displayName(it)),
        h('div', { class: 'tile-sub' }, `${SOURCES[it.source] || ''} · ${timeAgo(it.lastPlayed)}`),
        h('span', { class: 'tile-play' }, icon('play'), it.kind === 'game' ? 'Play' : 'Open'))
    );
    t.addEventListener('click', () => launch(it.id));
    t.addEventListener('contextmenu', (e) => { e.preventDefault(); itemMenu(it.id, { x: e.clientX, y: e.clientY }); });
    return t;
  });
  sec.replaceChildren(h('h3', { class: 'section-title' }, 'Jump back in'), h('div', { class: 'jump-row' }, tiles));
}

const SORTS = { name: 'Name A to Z', played: 'Recently played', added: 'Recently added', most: 'Most played' };

function renderFilters() {
  const base = baseItems();
  const present = SOURCE_ORDER.filter((s) => base.some((it) => it.source === s));
  if (S.source !== 'all' && !present.includes(S.source)) S.source = 'all';
  const chip = (key, label, n) =>
    h('button', { class: 'chip' + (S.source === key ? ' active' : ''), onclick: () => { S.source = key; render(); } },
      key !== 'all' ? h('span', { class: `dot src-${key}`, style: { background: 'var(--src)' } }) : null, label, h('span', { class: 'count' }, n));
  const chips = present.length > 1 ? [chip('all', 'All', base.length), ...present.map((s) => chip(s, SOURCES[s], base.filter((it) => it.source === s).length))] : [];
  const sortBtn = h('button', { class: 'chip', onclick: (e) => openMenu(Object.entries(SORTS).map(([k, v]) => ({ label: v, hint: S.sort === k ? '✓' : '', run: () => { S.sort = k; prefs.set('sort', k); render(); } })), { el: e.currentTarget }) },
    'Sort: ', S.view.type === 'recent' ? SORTS.played : SORTS[S.sort], icon('chevron'));
  const range = h('input', { type: 'range', min: '120', max: '260', step: '10', value: String(S.size), title: 'Card size' });
  range.addEventListener('input', () => {
    S.size = +range.value;
    document.documentElement.style.setProperty('--card-w', `${S.size}px`);
    prefs.set('size', S.size);
  });
  const anyOwned = S.lib.items.some((it) => notInstalled(it) && !it.hidden);
  const modeSeg = anyOwned ? h('div', { class: 'seg' },
    h('button', { class: S.libMode === 'installed' ? 'on' : '', onclick: () => { S.libMode = 'installed'; prefs.set('libMode', 'installed'); render(); } }, 'Installed'),
    h('button', { class: S.libMode === 'all' ? 'on' : '', onclick: () => { S.libMode = 'all'; prefs.set('libMode', 'all'); render(); } }, 'All owned')) : null;
  $('#filters').replaceChildren(...[modeSeg].filter(Boolean), ...chips, h('span', { class: 'spacer' }),
    h('div', { class: 'row', style: { gap: '14px' } }, sortBtn, h('label', { class: 'size-ctl', title: 'Card size' }, icon('image'), range)));
}

function renderGrid() {
  const list = viewItems();
  const grid = $('#grid');
  const want = list.map(cardFor);
  const keep = new Set(want);
  for (const c of [...grid.children]) if (!keep.has(c)) c.remove();
  want.forEach((c, i) => { if (grid.children[i] !== c) grid.insertBefore(c, grid.children[i] || null); });

  const empty = $('#empty');
  empty.hidden = list.length > 0;
  if (!list.length) {
    let msg;
    if (S.search) msg = ['Nothing matches that search', 'Try a different name.'];
    else if (S.lib.scanning && !S.lib.items.length) msg = ['Scanning your launchers', 'Your games and apps will show up here in a moment.'];
    else if (S.view.type === 'favorites') msg = ['No favorites yet', 'Right click a card, press Y on a controller, or drag a card onto Favorites.'];
    else if (S.view.type === 'recent') msg = ['Nothing played yet', 'Games you launch from here will show up in this list.'];
    else if (S.view.type === 'hidden') msg = ['Nothing hidden', 'Hidden items stay out of every other view.'];
    else if (S.view.type === 'category') msg = ['This category is empty', 'Drag cards onto it in the sidebar, or use Move to category.'];
    else msg = ['Your library is empty', 'Press rescan or add something by hand.'];
    empty.replaceChildren(h('h3', {}, msg[0]), h('div', {}, msg[1]));
  }
}

// ---------- actions ----------
async function launch(id) {
  const it = S.byId.get(id);
  if (!it) return;
  if (notInstalled(it)) showToast(`Opening ${SOURCES[it.source] || 'the launcher'} to install ${displayName(it)}`);
  else showToast(`${it.kind === 'game' ? 'Launching' : 'Opening'} ${displayName(it)}`);
  const r = await api.launch(id);
  if (!r || !r.ok) showToast(`Could not launch: ${(r && r.error) || 'unknown error'}`, 'error');
}

function itemMenu(id, pos) {
  const it = S.byId.get(id);
  if (!it) return;
  openMenu([
    { label: notInstalled(it) ? 'Install' : it.kind === 'game' ? 'Play' : 'Open', run: () => launch(id) },
    { label: it.favorite ? 'Remove from favorites' : 'Add to favorites', run: () => api.updateItem(id, { favorite: !it.favorite }) },
    '-',
    { label: 'Change cover', run: () => coverPicker(id) },
    { label: 'Rename', run: () => renameItem(id) },
    { label: 'Move to category', run: () => pickCategory(it.categoryId).then((c) => { if (c !== undefined) api.updateItem(id, { categoryId: c }); }) },
    { label: `Set as ${it.kind === 'game' ? 'app' : 'game'}`, run: () => api.updateItem(id, { kind: it.kind === 'game' ? 'app' : 'game' }) },
    { label: 'Open install folder', disabled: !it.installDir, run: () => api.openFolder(id) },
    relatedOf(id).length ? { label: `Related apps (${relatedOf(id).length})`, run: () => relatedModal(id) } : null,
    isGrouped(it) ? { label: 'Show as separate app', run: () => api.updateItem(id, { ungrouped: true }) } : null,
    isGrouped(it) ? { label: 'Make this the main app', run: () => { api.updateItem(id, { suiteMain: true }); showToast(`${displayName(it)} is now the main app`); } } : null,
    it.parentId && it.ungrouped && S.byId.has(it.parentId) ? { label: `Group under ${displayName(S.byId.get(it.parentId))}`, run: () => api.updateItem(id, { ungrouped: false }) } : null,
    '-',
    { label: it.hidden ? 'Unhide' : 'Hide', run: () => api.updateItem(id, { hidden: !it.hidden }) },
    it.manual ? { label: 'Remove from library', danger: true, run: () => confirmBox('Remove from library?', `${displayName(it)} will be removed. The program itself is not touched.`, 'Remove').then((ok) => ok && api.removeItem(id)) } : null,
  ].filter(Boolean), pos);
}

function categoryMenu(id, pos) {
  const c = S.cats.get(id);
  if (!c) return;
  openMenu([
    { label: 'Add subcategory', run: () => newCategory(id) },
    { label: 'Rename', run: () => promptText('Rename category', c.name).then((n) => n && api.renameCategory(id, n)) },
    { label: 'Move to top level', disabled: !c.parentId, run: () => api.moveCategory(id, null, null) },
    '-',
    { label: 'Delete', danger: true, run: () => confirmBox(`Delete "${c.name}"?`, 'Its items and subcategories move up one level. Nothing is uninstalled.', 'Delete').then((ok) => {
      if (!ok) return;
      if (S.view.type === 'category' && S.view.id === id) setView(c.parentId ? { type: 'category', id: c.parentId } : { type: 'home' });
      api.deleteCategory(id);
    }) },
  ], pos);
}

async function newCategory(parentId = null) {
  const parent = parentId ? S.cats.get(parentId) : null;
  const name = await promptText(parent ? `New subcategory in ${parent.name}` : 'New category', '', 'Name');
  if (!name) return;
  if (parentId) { S.collapsed.delete(parentId); prefs.set('collapsed', [...S.collapsed]); }
  await api.createCategory(name, parentId);
}

async function renameItem(id) {
  const it = S.byId.get(id);
  const name = await promptText('Rename', displayName(it), it.name);
  if (name === null) return;
  api.updateItem(id, { customName: name.trim() && name.trim() !== it.name ? name.trim() : null });
}

// ---------- menus ----------
function openMenu(items, pos) {
  closeMenu(false);
  const m = h('div', { class: 'menu', role: 'menu' },
    items.map((i) => (i === '-' ? h('div', { class: 'sep' }) : h('button', {
      class: 'menu-item' + (i.danger ? ' danger' : ''), disabled: !!i.disabled,
      onclick: () => { closeMenu(true); i.run(); },
    }, i.label, i.hint ? h('span', { class: 'hint' }, i.hint) : null))));
  S.menuReturn = document.activeElement;
  $('#menuRoot').append(m);
  const mw = m.offsetWidth;
  const mh = m.offsetHeight;
  let x;
  let y;
  if (pos && pos.el) {
    const r = pos.el.getBoundingClientRect();
    x = r.left;
    y = r.bottom + 6;
    if (y + mh > innerHeight - 8) y = Math.max(8, r.top - mh - 6);
  } else {
    x = pos ? pos.x : 100;
    y = pos ? pos.y : 100;
  }
  m.style.left = `${Math.max(8, Math.min(x, innerWidth - mw - 8))}px`;
  m.style.top = `${Math.max(8, Math.min(y, innerHeight - mh - 8))}px`;
  const first = m.querySelector('button:not([disabled])');
  if (first) first.focus();
}

function closeMenu(restore = true) {
  const m = $('#menuRoot .menu');
  if (!m) return false;
  m.remove();
  if (restore && S.menuReturn && document.contains(S.menuReturn)) S.menuReturn.focus({ preventScroll: true });
  return true;
}
document.addEventListener('mousedown', (e) => { if (!e.target.closest('.menu')) closeMenu(false); }, true);
window.addEventListener('blur', () => closeMenu(false));

// ---------- modals ----------
function openModal({ title, body, actions = [], cls = '', onClose }) {
  const back = h('div', { class: 'modal-back' });
  let closed = false;
  const ret = document.activeElement;
  const close = () => {
    if (closed) return;
    closed = true;
    back.remove();
    S.modals = S.modals.filter((f) => f !== close);
    if (onClose) onClose();
    if (ret && document.contains(ret)) ret.focus({ preventScroll: true });
  };
  const mk = (a) => h('button', {
    class: 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''),
    onclick: async () => { const r = a.run ? await a.run() : undefined; if (r !== false) close(); },
  }, a.label);
  const leftActions = actions.filter((a) => a.left);
  const foot = actions.length
    ? h('div', { class: 'modal-foot' },
      leftActions.length ? h('div', { class: 'left' }, leftActions.map(mk)) : null,
      actions.filter((a) => !a.left).map(mk))
    : null;
  const panel = h('div', { class: 'modal ' + cls, role: 'dialog' },
    title ? h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: close }, icon('close'))) : null,
    h('div', { class: 'modal-body' }, body),
    foot);
  back.append(panel);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  $('#modalRoot').append(back);
  S.modals.push(close);
  setTimeout(() => {
    const f = panel.querySelector('[autofocus]') || panel.querySelector('.modal-body input, .modal-body button') || panel.querySelector('.btn.primary, button');
    if (f) f.focus();
  }, 0);
  return { close, panel };
}

function closeTopLayer() {
  if (closeMenu(true)) return true;
  const top = S.modals[S.modals.length - 1];
  if (top) { top(); return true; }
  return false;
}

function promptText(title, value = '', placeholder = '') {
  return new Promise((resolve) => {
    let done = false;
    const input = h('input', { class: 'text-input', value, placeholder, autofocus: true, spellcheck: 'false' });
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const m = openModal({
      title,
      body: input,
      actions: [{ label: 'Cancel', run: () => finish(null) }, { label: 'Save', primary: true, run: () => finish(input.value.trim()) }],
      onClose: () => finish(null),
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { finish(input.value.trim()); m.close(); } });
    setTimeout(() => input.select(), 10);
  });
}

function confirmBox(title, text, okLabel = 'OK') {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openModal({
      title,
      body: h('p', { style: { margin: 0, color: 'var(--muted)' } }, text),
      actions: [{ label: 'Cancel', run: () => finish(false) }, { label: okLabel, danger: true, run: () => finish(true) }],
      onClose: () => finish(false),
    });
  });
}

// Resolves to a category id, null for "no category", or undefined if cancelled.
function pickCategory(current) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    let m;
    const pick = (v) => { finish(v); m.close(); };
    const rows = [];
    const walk = (pid, depth) => {
      for (const c of childrenOf(pid)) {
        rows.push(h('button', { class: c.id === current ? 'current' : '', style: { paddingLeft: `${10 + depth * 18}px` }, onclick: () => pick(c.id) }, icon('folder'), c.name));
        walk(c.id, depth + 1);
      }
    };
    walk(null, 0);
    rows.push(h('button', { class: !current ? 'current' : '', style: { paddingLeft: '10px' }, onclick: () => pick(null) }, icon('inbox'), 'No category'));
    m = openModal({
      title: 'Move to category',
      body: h('div', { class: 'picker' }, rows),
      actions: [{ label: 'Cancel', run: () => finish(undefined) }],
      onClose: () => finish(undefined),
    });
  });
}

// ---------- related apps ----------
function relatedModal(id) {
  const main = S.byId.get(id);
  if (!main) return;
  let m;
  const rows = relatedOf(id).map((r) => {
    const ic = r.iconUrl ? h('img', { src: r.iconUrl, alt: '' }) : h('span', { class: 'rel-initial' }, (displayName(r)[0] || '?').toUpperCase());
    const open = h('button', { class: 'rel-open', title: `Open ${displayName(r)}`, onclick: () => { m.close(); launch(r.id); } }, ic, h('span', { class: 'rel-name' }, displayName(r)));
    const split = h('button', { class: 'btn', title: 'Show this as its own card', onclick: () => { api.updateItem(r.id, { ungrouped: true }); showToast(`${displayName(r)} now shows as its own app`); m.close(); } }, 'Show separately');
    return h('div', { class: 'rel-row' }, open, split);
  });
  m = openModal({
    title: `${displayName(main)} related apps`,
    body: h('div', {}, h('p', { class: 'help', style: { margin: '0 0 12px', color: 'var(--faint)', fontSize: '12px' } }, `Support tools installed with ${main.suiteName || displayName(main)}. The main card opens ${displayName(main)}.`), h('div', { class: 'rel-list' }, rows)),
    actions: [{ label: 'Close' }],
  });
}

// ---------- cover picker ----------
function coverPicker(id) {
  const it = S.byId.get(id);
  if (!it) return;
  const input = h('input', { class: 'text-input', value: displayName(it), spellcheck: 'false' });
  const results = h('div', {});
  let m;
  const load = async () => {
    results.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Looking for artwork'));
    const r = await api.coverOptions(id, input.value);
    const kids = [];
    if (r.error) kids.push(h('div', { class: 'note err' }, r.error));
    if (r.keyMissing) kids.push(h('div', { class: 'note' }, 'Add a free SteamGridDB API key in Settings to get many more cover options, including art for apps.'));
    const section = (title, list) => {
      if (!list.length) return null;
      return h('div', { class: 'cover-section' }, h('h4', {}, title), h('div', { class: 'cover-grid' }, list.map((o) => {
        const b = h('button', { class: 'cover-opt', title: o.label },
          h('img', { src: o.thumb, alt: '', loading: 'lazy', onerror: (e) => e.target.closest('.cover-opt').remove() }),
          h('span', { class: 'cap' }, o.label));
        b.addEventListener('click', async () => {
          b.disabled = true;
          const ok = await api.applyCover(id, o.url);
          if (ok) { showToast('Cover updated'); m.close(); } else { showToast('That image could not be downloaded', 'error'); b.disabled = false; }
        });
        return b;
      })));
    };
    const a = section('SteamGridDB', r.sgdb);
    const b = section('Steam', r.steam);
    if (!a && !b) kids.push(h('div', { class: 'loading' }, 'No artwork found. Try a different search or choose an image file.'));
    kids.push(a, b);
    results.replaceChildren(...kids.filter(Boolean));
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
  m = openModal({
    title: `Cover for ${displayName(it)}`,
    cls: 'wide',
    body: h('div', {}, h('div', { class: 'row', style: { marginBottom: '6px' } }, input, h('button', { class: 'btn', onclick: load }, icon('search'), 'Search')), results),
    actions: [
      { label: 'Choose image file', left: true, run: async () => { const ok = await api.coverFromFile(id); if (ok) showToast('Cover updated'); return ok ? undefined : false; } },
      { label: 'Reset to automatic', left: true, run: async () => { await api.resetCover(id); showToast('Looking for a cover again'); } },
      { label: 'Close' },
    ],
  });
  load();
}

// ---------- add by hand ----------
function addManual() {
  let type = 'path';
  let categoryId = S.view.type === 'category' ? S.view.id : (childrenOf(null).find((c) => /^games$/i.test(c.name)) || {}).id || null;
  const name = h('input', { class: 'text-input', placeholder: 'Shown on the card', spellcheck: 'false' });
  const target = h('input', { class: 'text-input', placeholder: 'C:\\Games\\MyGame\\game.exe', spellcheck: 'false' });
  const browse = h('button', { class: 'btn' }, 'Browse');
  const pathLabel = h('label', {}, 'Program or shortcut');
  const catBtn = h('button', { class: 'btn' });
  const setCatLabel = () => { catBtn.replaceChildren(icon('folder'), categoryId ? catPath(categoryId).map((c) => c.name).join(' › ') : 'No category'); };
  setCatLabel();
  catBtn.addEventListener('click', async () => { const c = await pickCategory(categoryId); if (c !== undefined) { categoryId = c; setCatLabel(); } });
  const segPath = h('button', { class: 'on' }, 'Program or shortcut');
  const segUrl = h('button', {}, 'Link or URL');
  const setType = (t) => {
    type = t;
    segPath.classList.toggle('on', t === 'path');
    segUrl.classList.toggle('on', t === 'url');
    browse.hidden = t === 'url';
    pathLabel.textContent = t === 'url' ? 'Link' : 'Program or shortcut';
    target.placeholder = t === 'url' ? 'https://… or steam://rungameid/…' : 'C:\\Games\\MyGame\\game.exe';
  };
  segPath.addEventListener('click', () => setType('path'));
  segUrl.addEventListener('click', () => setType('url'));
  browse.addEventListener('click', async () => {
    const f = await api.pickFile('program');
    if (!f) return;
    target.value = f;
    if (!name.value.trim()) name.value = f.split(/[\\/]/).pop().replace(/\.(exe|lnk|url|bat|cmd)$/i, '');
  });
  openModal({
    title: 'Add to library',
    body: h('div', {},
      h('div', { class: 'field' }, h('div', { class: 'seg' }, segPath, segUrl)),
      h('div', { class: 'field' }, pathLabel, h('div', { class: 'row' }, target, browse)),
      h('div', { class: 'field' }, h('label', {}, 'Name'), name),
      h('div', { class: 'field' }, h('label', {}, 'Category'), h('div', {}, catBtn), h('div', { class: 'help' }, 'Anything under Games counts as a game for Surprise me.'))),
    actions: [
      { label: 'Cancel' },
      { label: 'Add', primary: true, run: async () => {
        const t = target.value.trim();
        if (!t) { showToast('Pick a program or enter a link first', 'error'); return false; }
        await api.addManual({ name: name.value.trim(), target: t, type, categoryId });
        showToast(`Added ${name.value.trim() || 'item'}`);
      } },
    ],
  });
}

// ---------- settings ----------
function toggleRow(label, sub, on, onChange) {
  const b = h('button', { class: 'toggle' + (on ? ' on' : '') }, h('span', { class: 'tlabel' }, label, sub ? h('small', {}, sub) : null), h('span', { class: 'knob' }));
  b.addEventListener('click', () => { on = !on; b.classList.toggle('on', on); onChange(on); });
  return b;
}

function openSettings() {
  const s = { ...S.lib.settings };
  const key = h('input', { class: 'text-input', type: 'password', value: s.steamGridDbKey || '', placeholder: 'Paste your API key', spellcheck: 'false' });
  const show = h('button', { class: 'btn', onclick: () => { key.type = key.type === 'password' ? 'text' : 'password'; } }, 'Show');
  const cf = h('input', { class: 'text-input', value: s.curseforgeInstancesPath || '', placeholder: 'Default: %USERPROFILE%\\curseforge\\minecraft\\Instances', spellcheck: 'false' });
  const cfBrowse = h('button', { class: 'btn', onclick: async () => { const f = await api.pickFolder(); if (f) cf.value = f; } }, 'Browse');
  let includeApps = s.includeApps !== false;
  let musicEnabled = s.musicEnabled !== false;
  let gogOwned = s.gogOwned !== false;
  const os = S.lib.ownedStatus || {};
  const steamKey = h('input', { class: 'text-input', type: 'password', value: s.steamApiKey || '', placeholder: 'Paste your Steam Web API key', spellcheck: 'false' });
  const steamShow = h('button', { class: 'btn', onclick: () => { steamKey.type = steamKey.type === 'password' ? 'text' : 'password'; } }, 'Show');
  const steamId = h('input', { class: 'text-input', value: s.steamId || '', placeholder: os.steamId ? `Found automatically: ${os.steamId}` : 'Leave empty to detect from Steam', spellcheck: 'false' });
  const ownedLine = [];
  if (os.counts && Object.keys(os.counts).length) ownedLine.push(Object.entries(os.counts).map(([k, n]) => `${n} games on ${SOURCES[k] || k}`).join(', '));
  if (os.errors && os.errors.length) ownedLine.push(os.errors.join(' '));
  let musicAnyApp = !!s.musicAnyApp;
  const about = h('div', { class: 'about' });
  const fillAbout = () => {
    const u = S.update;
    const status = {
      dev: 'Updates work in the installed version',
      idle: 'Up to date',
      current: 'Up to date',
      checking: 'Checking for updates',
      downloading: `Downloading version ${u.next || ''} (${u.progress || 0}%)`,
      ready: `Version ${u.next} is ready to install`,
      error: u.error || 'Update check failed',
    }[u.status] || '';
    const btn = u.status === 'ready'
      ? h('button', { class: 'btn primary', onclick: () => api.installUpdate() }, 'Restart to update')
      : h('button', { class: 'btn', disabled: u.status === 'dev' || u.status === 'checking' || u.status === 'downloading', onclick: () => api.checkUpdate() }, 'Check for updates');
    about.replaceChildren(h('div', {}, h('b', {}, `Library ${S.version ? 'v' + S.version : ''}`), h('small', {}, status)), btn);
  };
  fillAbout();
  S.refreshAbout = () => { if (document.contains(about)) fillAbout(); };
  openModal({
    title: 'Settings',
    body: h('div', {},
      about,
      h('div', { class: 'field' },
        h('label', {}, 'SteamGridDB API key'),
        h('div', { class: 'row' }, key, show),
        h('div', { class: 'help' }, 'Free. Gives cover art for non Steam games and apps. ',
          h('button', { class: 'link-btn', onclick: () => openConnectionsHelp('sgdb') }, 'How to get a key'))),
      h('div', { class: 'field' },
        h('label', {}, 'CurseForge instances folder'),
        h('div', { class: 'row' }, cf, cfBrowse),
        h('div', { class: 'help' }, 'Only needed if you moved CurseForge\'s Minecraft folder.')),
      h('div', { class: 'section-label' }, 'Owned games'),
      ownedLine.length ? h('div', { class: os.errors && os.errors.length ? 'note err' : 'note' }, ownedLine.join(' ')) : null,
      h('div', { class: 'field' },
        h('label', {}, 'Steam Web API key'),
        h('div', { class: 'row' }, steamKey, steamShow),
        h('div', { class: 'help' }, 'Free. Lists every game on your Steam account, installed or not. Your Steam profile\'s Game details must be set to Public. ',
          h('button', { class: 'link-btn', onclick: () => openConnectionsHelp('steam') }, 'How to get a key'))),
      h('div', { class: 'field' },
        h('label', {}, 'SteamID or profile link'),
        steamId,
        h('div', { class: 'help' }, 'Optional. Only needed if the wrong Steam account is picked up.')),
      h('div', { class: 'field' }, toggleRow('GOG library', 'Reads owned GOG games from GOG Galaxy on this PC', gogOwned, (v) => { gogOwned = v; })),
      h('div', { class: 'section-label' }, 'Apps and music'),
      h('div', { class: 'field' }, toggleRow('Include Windows apps', 'Start Menu, Desktop and Microsoft Store apps', includeApps, (v) => { includeApps = v; })),
      h('div', { class: 'field' }, toggleRow('Apple Music player', 'Shows what is playing in the sidebar with play, pause and skip', musicEnabled, (v) => { musicEnabled = v; })),
      h('div', { class: 'field' }, toggleRow('Other music apps too', 'Falls back to Spotify, a browser, or whatever is playing when Apple Music is closed', musicAnyApp, (v) => { musicAnyApp = v; }))),
    actions: [
      { label: 'Help', left: true, run: () => { openConnectionsHelp(); return false; } },
      { label: 'Find missing covers', left: true, run: async () => { await api.refetchCovers(); showToast('Looking for missing covers'); return false; } },
      { label: 'Open data folder', left: true, run: () => { api.openDataFolder(); return false; } },
      { label: 'Cancel' },
      { label: 'Save', primary: true, run: async () => {
        await api.updateSettings({ steamGridDbKey: key.value.trim(), curseforgeInstancesPath: cf.value.trim(), includeApps, musicEnabled, musicAnyApp, steamApiKey: steamKey.value.trim(), steamId: steamId.value.trim(), gogOwned });
        S.keyErrorShown = false;
        showToast('Settings saved');
      } },
    ],
  });
}

// ---------- connections help ----------
const STEAM_DOMAIN = 'https://github.com/Cade4537/library-app';

function copyRow(text) {
  const btn = h('button', { class: 'btn', onclick: async () => { await api.copyText(text); btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); } }, 'Copy');
  return h('div', { class: 'copy-row' }, h('code', {}, text), btn);
}

function linkBtn(label, url) {
  return h('button', { class: 'btn primary small-btn', onclick: () => api.openExternal(url) }, label);
}

function helpSection(id, title, sub, steps) {
  return h('section', { class: 'help-sec', 'data-sec': id },
    h('h3', {}, title), sub ? h('p', { class: 'help-sub' }, sub) : null,
    h('ol', { class: 'help-steps' }, steps.map((st) => h('li', {}, st))));
}

function openConnectionsHelp(focus) {
  const body = h('div', { class: 'help-body' },
    h('p', { class: 'help-sub', style: { marginTop: 0 } }, 'Some features need a free key from another service. A key is like a password that lets this app ask that service for your info. Each one takes about a minute. Keys stay on this PC.'),
    helpSection('steam', 'Steam: show every game you own', 'Lets the app list games on your Steam account that are not installed.', [
      ['Open the Steam key page and sign in with your Steam account. ', linkBtn('Open Steam key page', 'https://steamcommunity.com/dev/apikey')],
      ['In the Domain Name box, paste this:', copyRow(STEAM_DOMAIN)],
      'Check "I agree to the Steam Web API Terms of Use" and click Register. Steam may ask you to confirm in the Steam mobile app.',
      'Copy the Key it shows (a long mix of letters and numbers).',
      'In this app, open Settings, paste it into Steam Web API key, and click Save.',
      ['Make your game list visible: on your Steam privacy page, set Game details to Public. ', linkBtn('Open Steam privacy settings', 'https://steamcommunity.com/my/edit/settings')],
    ]),
    h('p', { class: 'help-note' }, 'If Steam says your account is limited, it needs at least $5 spent on Steam before it can make keys.'),
    helpSection('sgdb', 'SteamGridDB: cover art for everything else', 'Gives covers to games from other launchers and to apps.', [
      ['Open SteamGridDB and click Login. You can sign in with Steam. ', linkBtn('Open SteamGridDB', 'https://www.steamgriddb.com')],
      ['Go to your API page. ', linkBtn('Open SteamGridDB API page', 'https://www.steamgriddb.com/profile/preferences/api')],
      'Click Generate API Key and copy it.',
      'In this app, open Settings, paste it into SteamGridDB API key, and click Save. Covers start filling in right away.',
    ]),
    helpSection('gog', 'GOG', null, [
      'Nothing to set up. If GOG Galaxy is installed and signed in on this PC, your GOG games show up automatically.',
    ]),
    helpSection('music', 'Apple Music', null, [
      'Nothing to set up. Play something in Apple Music and it shows in the sidebar.',
    ]));
  openModal({ title: 'Connections help', body, cls: 'wide help-modal', actions: [{ label: 'Close' }] });
  if (focus) setTimeout(() => {
    const sec = document.querySelector(`.help-sec[data-sec="${focus}"]`);
    if (sec) { sec.scrollIntoView({ block: 'start' }); sec.classList.add('flash'); }
  }, 50);
}

// ---------- surprise me ----------
function surprisePool() {
  const isGame = (it) => it.kind === 'game';
  const installedOnly = S.surprisePool === 'installed';
  const ok = (it) => isGame(it) && (!installedOnly || it.installed || it.manual);
  const savedMode = S.libMode;
  if (!installedOnly) S.libMode = 'all';
  let pool = viewItems().filter(ok);
  S.libMode = savedMode;
  let from = S.search ? 'your search' : viewTitle();
  if (S.view.type === 'home' && !S.search && S.source === 'all') from = 'your games';
  if (!pool.length) { pool = S.lib.items.filter((it) => !it.hidden && !isGrouped(it) && (it.installed || it.manual || (!installedOnly && it.owned)) && ok(it)); from = 'your games'; }
  return { pool, from };
}

function surprise() {
  const { pool, from } = surprisePool();
  if (!pool.length) { showToast('No games to pick from yet'); return; }
  let pick = null;
  const bg = h('div', { class: 'surprise-bg' });
  const cardHolder = h('div', { class: 'surprise-card' });
  const name = h('div', { class: 'surprise-name' });
  const meta = h('div', { class: 'surprise-meta' });
  const playBtn = h('button', { class: 'btn primary' }, icon('play'), 'Play');
  const againBtn = h('button', { class: 'btn' }, icon('dice'), 'Pick again');
  const closeBtn = h('button', { class: 'btn' }, 'Close');
  const inner = h('div', { class: 'surprise-inner' }, cardHolder,
    h('div', { class: 'surprise-info' }, h('div', { class: 'surprise-kicker' }, `Picked from ${from}`), name, meta, h('div', { class: 'surprise-actions' }, playBtn, againBtn, closeBtn)));
  const m = openModal({ body: [bg, inner], cls: 'surprise' });
  m.panel.querySelector('.modal-body').style.padding = '0';

  const show = (it) => {
    cardHolder.replaceChildren(artFor(it));
    name.textContent = displayName(it);
    const cat = it.categoryId ? catPath(it.categoryId).map((c) => c.name).join(' › ') : 'No category';
    meta.textContent = `${SOURCES[it.source] || it.source} · ${cat} · ${timeAgo(it.lastPlayed)}`;
    bg.style.backgroundImage = it.coverUrl ? `url("${it.coverUrl}")` : 'none';
    playBtn.replaceChildren(icon(notInstalled(it) ? 'download' : 'play'), notInstalled(it) ? 'Install' : 'Play');
  };
  const roll = () => {
    const panel = m.panel;
    panel.classList.add('shuffling');
    [playBtn, againBtn].forEach((b) => (b.disabled = true));
    let n = pool.length > 1 ? 12 : 0;
    const step = () => {
      let next = pool[Math.floor(Math.random() * pool.length)];
      if (pool.length > 1) while (next === pick) next = pool[Math.floor(Math.random() * pool.length)];
      pick = next;
      show(pick);
      if (n-- > 0) setTimeout(step, 55 + (12 - n) * 9);
      else {
        panel.classList.remove('shuffling');
        [playBtn, againBtn].forEach((b) => (b.disabled = false));
        playBtn.focus();
      }
    };
    step();
  };
  playBtn.addEventListener('click', () => { m.close(); launch(pick.id); });
  againBtn.addEventListener('click', roll);
  closeBtn.addEventListener('click', () => m.close());
  roll();
}

function surpriseModeMenu(e) {
  openMenu([
    { label: 'Installed games', hint: S.surprisePool === 'installed' ? '✓' : '', run: () => { S.surprisePool = 'installed'; prefs.set('surprisePool', 'installed'); showToast('Surprise me picks from installed games'); } },
    { label: 'All owned games', hint: S.surprisePool === 'owned' ? '✓' : '', run: () => { S.surprisePool = 'owned'; prefs.set('surprisePool', 'owned'); showToast('Surprise me picks from every game you own, installed or not'); } },
  ], { el: e.currentTarget });
}

// ---------- now playing ----------
const NP = { state: { active: false }, base: 0, at: 0, built: null, els: null };

function fmtTime(sec) {
  if (!sec || sec < 0) return '0:00';
  sec = Math.round(sec);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function npSourceLabel(st) {
  if (st.isApple) return 'Apple Music';
  const raw = String(st.app || '').split('!').pop().replace(/\.exe$/i, '');
  return raw && raw.toLowerCase() !== 'app' ? raw : 'Now playing';
}

function npArtist(st) {
  // Apple Music for Windows sends "Artist — Album" in the artist field.
  const parts = String(st.artist || '').split(/\s+\u2014\s+/);
  return [parts[0], st.album || parts[1]].filter(Boolean).join(' · ');
}

async function openAppleMusic() {
  const ok = await api.openAppleMusic();
  if (!ok) showToast('Apple Music is not installed. Opening the Microsoft Store page.');
}

function renderNowPlaying() {
  const box = $('#nowPlaying');
  const st = NP.state;
  const set = S.lib.settings || {};
  if (set.musicEnabled === false || st.unavailable) { box.replaceChildren(); NP.built = null; return; }
  if (!st.active) {
    if (NP.built === 'idle') return;
    NP.built = 'idle';
    box.replaceChildren(h('div', { class: 'np' },
      h('div', { class: 'np-top' }, h('div', { class: 'np-art empty' }, icon('music')),
        h('div', { class: 'np-text' }, h('div', { class: 'np-src' }, 'Apple Music'), h('div', { class: 'np-title' }, 'Nothing playing'))),
      h('button', { class: 'btn np-open', onclick: openAppleMusic }, 'Open Apple Music')));
    return;
  }
  if (NP.built !== 'active') {
    NP.built = 'active';
    const e = {};
    e.bg = h('div', { class: 'np-bg' });
    e.art = h('img', { class: 'np-art', alt: '' });
    e.src = h('div', { class: 'np-src' });
    e.title = h('div', { class: 'np-title' });
    e.artist = h('div', { class: 'np-artist' });
    e.fill = h('span', {});
    e.cur = h('span', {});
    e.dur = h('span', {});
    e.toggle = h('button', { class: 'main', title: 'Play or pause', onclick: () => sendMedia('toggle') });
    e.text = h('div', { class: 'np-text', title: 'Open Apple Music', style: { cursor: 'pointer' }, onclick: () => { if (NP.state.isApple) openAppleMusic(); } }, e.src, e.title, e.artist);
    box.replaceChildren(h('div', { class: 'np' }, e.bg,
      h('div', { class: 'np-top' }, e.art, e.text),
      h('div', { class: 'np-bar' }, e.fill),
      h('div', { class: 'np-times' }, e.cur, e.dur),
      h('div', { class: 'np-ctrls' },
        h('button', { title: 'Previous', onclick: () => sendMedia('prev') }, icon('prev')),
        e.toggle,
        h('button', { title: 'Next', onclick: () => sendMedia('next') }, icon('next')))));
    NP.els = e;
  }
  const e = NP.els;
  e.src.textContent = npSourceLabel(st);
  e.title.textContent = st.title || 'Unknown track';
  e.artist.textContent = npArtist(st);
  if (st.art) {
    if (e.art.getAttribute('src') !== st.art) { e.art.src = st.art; e.bg.style.backgroundImage = `url("${st.art}")`; }
    e.art.hidden = false;
  } else {
    e.art.removeAttribute('src');
    e.bg.style.backgroundImage = 'none';
  }
  const playing = st.status === 'Playing';
  const want = playing ? 'pause' : 'play';
  if (e.toggle.dataset.icon !== want) { e.toggle.dataset.icon = want; e.toggle.replaceChildren(icon(want)); }
  tickNowPlaying();
}

function tickNowPlaying() {
  const st = NP.state;
  if (NP.built !== 'active' || !NP.els) return;
  const playing = st.status === 'Playing';
  const pos = Math.min(st.dur || 0, NP.base + (playing ? (Date.now() - NP.at) / 1000 : 0));
  const pct = st.dur ? Math.max(0, Math.min(100, (pos / st.dur) * 100)) : 0;
  NP.els.fill.style.width = `${pct}%`;
  NP.els.cur.textContent = fmtTime(pos);
  NP.els.dur.textContent = st.dur ? fmtTime(st.dur) : '';
}
setInterval(tickNowPlaying, 1000);

function sendMedia(cmd) {
  api.mediaCommand(cmd);
  if (cmd === 'toggle' && NP.state.active) {
    // Flip the icon right away so the button feels instant.
    NP.base = NP.base + (NP.state.status === 'Playing' ? (Date.now() - NP.at) / 1000 : 0);
    NP.at = Date.now();
    NP.state = { ...NP.state, status: NP.state.status === 'Playing' ? 'Paused' : 'Playing' };
    renderNowPlaying();
  }
}

function setMediaState(st) {
  NP.state = st || { active: false };
  NP.base = st && st.pos ? st.pos : 0;
  NP.at = Date.now();
  renderNowPlaying();
}

// ---------- updates ----------
function setUpdateState(u) {
  const prev = S.update.status;
  S.update = u || { status: 'dev' };
  $('#updateBtn').hidden = S.update.status !== 'ready';
  if (S.update.status === 'ready' && prev !== 'ready') showToast(`Version ${S.update.next} is ready. Restart to update.`);
  if (S.refreshAbout) S.refreshAbout();
}

// ---------- toasts ----------
function showToast(text, kind = 'info') {
  const t = h('div', { class: 'toast' + (kind === 'error' ? ' error' : '') }, text);
  const box = $('#toasts');
  box.append(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 6000 : 3200);
}
window.showToast = showToast;

// ---------- controller and keyboard ----------
function focusedCardId() {
  const el = document.activeElement;
  const card = el && el.closest && el.closest('.card');
  return card ? card.dataset.id : null;
}

function cycleView(delta) {
  const btns = [...document.querySelectorAll('#nav .nav-btn, #tree .cat-btn')];
  const i = btns.findIndex((b) => b.classList.contains('active'));
  const next = btns[(i + delta + btns.length) % btns.length];
  if (next) next.click();
  setTimeout(() => spatial.focusDefault(), 30);
}

window.padActions = {
  a: () => { const el = document.activeElement; if (el && el !== document.body && el.click) el.click(); else spatial.focusDefault(); },
  b: () => {
    if (closeTopLayer()) return;
    const el = document.activeElement;
    if (el && !el.closest('#grid')) spatial.focusDefault();
  },
  x: () => { if (!S.modals.length) surprise(); },
  y: () => { const id = focusedCardId(); if (id) { const it = S.byId.get(id); api.updateItem(id, { favorite: !it.favorite }); showToast(it.favorite ? 'Removed from favorites' : 'Added to favorites'); } },
  lb: () => { if (!S.modals.length) cycleView(-1); },
  rb: () => { if (!S.modals.length) cycleView(1); },
  menu: () => { const id = focusedCardId(); if (id) itemMenu(id, { el: document.activeElement }); },
  view: () => { if (!S.modals.length) $('#search').focus(); },
  lt: () => $('#content').scrollBy({ top: -innerHeight * 0.7 }),
  rt: () => $('#content').scrollBy({ top: innerHeight * 0.7 }),
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (closeTopLayer()) { e.preventDefault(); return; }
    if (document.activeElement === $('#search') && S.search) { $('#search').value = ''; S.search = ''; render(); }
  } else if ((e.ctrlKey && e.key.toLowerCase() === 'f') || (e.key === '/' && document.activeElement.tagName !== 'INPUT')) {
    e.preventDefault();
    $('#search').focus();
    $('#search').select();
  } else if (e.key === 'F11') {
    e.preventDefault();
    api.toggleFullscreen();
  } else if (e.key === 'F5') {
    e.preventDefault();
    api.rescan();
  } else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
    const id = focusedCardId();
    if (id) { e.preventDefault(); itemMenu(id, { el: document.activeElement }); }
  }
});

// ---------- wiring ----------
function wire() {
  hydrateIcons();
  const search = $('#search');
  search.addEventListener('input', () => { S.search = search.value.trim(); renderHeader(); renderJump(); renderGrid(); });
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); spatial.focusDefault(); } });
  $('#surpriseBtn').addEventListener('click', surprise);
  $('#surpriseMode').addEventListener('click', surpriseModeMenu);
  $('#addBtn').addEventListener('click', addManual);
  $('#rescanBtn').addEventListener('click', () => { if (!S.lib.scanning) { showToast('Scanning launchers'); api.rescan(); } });
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#fullscreenBtn').addEventListener('click', () => api.toggleFullscreen());
  $('#newCatBtn').addEventListener('click', () => newCategory(null));
  dropTarget($('#catHead'), { cat: (id) => api.moveCategory(id, null, null) });
  api.onToast((t) => showToast(t.text, t.kind));
  api.onMedia(setMediaState);
  api.onUpdate(setUpdateState);
  $('#updateBtn').addEventListener('click', () => api.installUpdate());
  api.onFullscreen((v) => document.body.classList.toggle('fullscreen', v));
  api.onChange((snap) => {
    indexLibrary(snap);
    render();
    if (snap.coverKeyError && !S.keyErrorShown) { S.keyErrorShown = true; showToast('SteamGridDB rejected your API key. Check it in Settings.', 'error'); }
  });
}

(async function start() {
  wire();
  indexLibrary(await api.get());
  render();
  S.version = await api.version();
  setUpdateState(await api.getUpdate());
  setMediaState(await api.getMedia());
})();
