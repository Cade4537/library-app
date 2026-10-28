/* global api, S, $, h, icon, prefs, norm, displayName, SOURCES, SOURCE_ORDER, fmtHours, timeAgo, visible, shown, isGrouped,
   notInstalled, launch, openModal, openMenu, confirmBox, showToast, setView, render, renderSidebar, renderGrid, catPath,
   childrenOf, descendants, fmtBytes, artFor, uninstallGame, openDetails, toggleRow, hashHue, renderHeader */
// 0.11.0: one card per game, backlog, deals, smart collections, news, launch options,
// moving games between drives, friend alerts, app and phone remote settings.

// replaceChildren that skips empty slots (null would show up as the text "null").
const fillEl = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));

// ---------- one card per game ----------
// The same game on several launchers (for example Steam and Xbox) becomes one card.
// The best copy leads (installed first, then the most played); the others are reachable from it.
const DUPES = { of: new Map(), groups: new Map() };
const SRC_RANK = ['steam', 'xbox', 'epic', 'gog', 'ubisoft', 'rockstar', 'riot', 'curseforge'];
function computeMerge() {
  DUPES.of.clear(); DUPES.groups.clear();
  const byName = new Map();
  for (const it of S.lib.items) {
    if (it.kind !== 'game' || it.hidden || it.missing || it.unmerged || isGrouped(it)) continue;
    if (!(it.installed || it.manual || it.owned)) continue;
    const k = norm(displayName(it)).replace(/\b(game of the year|goty|definitive|complete|deluxe|standard|edition|for windows|pc)\b/g, '').replace(/\s+/g, ' ').trim();
    if (k.length < 2) continue;
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(it);
  }
  for (const list of byName.values()) {
    if (list.length < 2 || new Set(list.map((x) => x.source)).size < 2) continue;
    list.sort((a, b) => (b.installed ? 1 : 0) - (a.installed ? 1 : 0) || (b.minutes || 0) - (a.minutes || 0) || SRC_RANK.indexOf(a.source) - SRC_RANK.indexOf(b.source));
    const [lead, ...rest] = list;
    DUPES.groups.set(lead.id, rest);
    for (const r of rest) DUPES.of.set(r.id, lead.id);
  }
}
// A copy that is folded into another card. Only applies to the views that show what you can play.
function isDupe(it) { return DUPES.of.has(it.id) && !S.search; }
const dupesOf = (it) => DUPES.groups.get(it.id) || [];
const groupMinutes = (it) => (it.minutes || 0) + dupesOf(it).reduce((a, o) => a + (o.minutes || 0), 0);

// ---------- backlog ----------
const STATUS_NAMES = { backlog: 'Backlog', playing: 'Playing', beaten: 'Beaten', completed: '100%', dropped: 'Dropped' };
function setStatus(it, status) { api.updateItem(it.id, { status: status || null }); if (status) showToast(`${displayName(it)}: ${STATUS_NAMES[status]}`); }

function backlogBox(it) {
  const seg = h('div', { class: 'seg det-status' });
  const fill = (cur) => fillEl(seg, ...[['', 'None'], ...Object.entries(STATUS_NAMES)].map(([k, n]) => h('button', { class: (cur || '') === k ? 'on' : '', onclick: () => { setStatus(it, k); fill(k); } }, n)));
  fill(it.status);
  let rating = it.rating || 0;
  const stars = h('div', { class: 'det-stars', title: 'Your rating' });
  const drawStars = () => fillEl(stars, ...[1, 2, 3, 4, 5].map((n) => h('button', { class: n <= rating ? 'on' : '', 'aria-label': `${n} stars`, onclick: () => { rating = rating === n ? 0 : n; api.updateItem(it.id, { rating }); drawStars(); } }, '★')));
  drawStars();
  const notes = h('textarea', { class: 'text-input det-notes', placeholder: 'Your notes: where you left off, builds, codes…', rows: '2', spellcheck: 'true' });
  notes.value = it.notes || '';
  notes.addEventListener('keydown', (e) => e.stopPropagation());
  notes.addEventListener('blur', () => { if ((notes.value || '') !== (it.notes || '')) api.updateItem(it.id, { notes: notes.value.slice(0, 4000) }); });
  return h('div', { class: 'det-backlog' },
    h('div', { class: 'row', style: { gap: '12px', flexWrap: 'wrap', alignItems: 'center' } }, seg, stars,
      it.kind === 'game' ? h('button', { class: 'link-btn', onclick: () => api.openExternal(`https://howlongtobeat.com/?q=${encodeURIComponent(displayName(it))}`) }, 'How long to beat?') : null),
    notes);
}

function statusFilterBar() {
  const cur = S.statusFilter || 'backlog';
  const counts = {};
  for (const it of S.lib.items) if (it.status && visible(it)) counts[it.status] = (counts[it.status] || 0) + 1;
  return h('div', { class: 'seg' }, [...Object.entries(STATUS_NAMES), ['all', 'All']].map(([k, n]) => h('button', { class: cur === k ? 'on' : '', onclick: () => { S.statusFilter = k; render(); } }, n, k !== 'all' && counts[k] ? h('span', { class: 'count', style: { marginLeft: '6px' } }, counts[k]) : null)));
}

// ---------- details extras ----------
function detailsExtras(it, getModal) {
  const close = () => { const m = getModal(); if (m) m.close(); };
  const via = dupesOf(it).map((o) => h('button', { class: 'btn', title: `${notInstalled(o) ? 'Install' : 'Play'} the ${SOURCES[o.source] || o.source} copy`, onclick: () => { close(); launch(o.id); } },
    icon(notInstalled(o) ? 'download' : 'play'), `${notInstalled(o) ? 'Install via' : 'Play via'} ${SOURCES[o.source] || o.source}`));
  const more = [];
  if (it.kind === 'game' && !notInstalled(it)) more.push(h('button', { class: 'btn', onclick: () => launchOptions(it) }, icon('gear'), 'Launch options'));
  if (it.installed && !it.manual && it.kind === 'game') more.push(h('button', { class: 'btn', onclick: () => moveGame(it) }, icon('drive'), 'Move'));
  if (dupesOf(it).length) more.push(h('button', { class: 'btn', title: 'Show each launcher\'s copy as its own card', onclick: () => { close(); for (const x of [it, ...dupesOf(it)]) api.updateItem(x.id, { unmerged: true }); showToast('Showing each copy separately'); } }, 'Split copies'));
  const news = h('div', { class: 'det-news' });
  if (it.kind === 'game' && (it.source === 'steam' || it.steamAppId)) {
    api.news([it.id]).then((list) => {
      if (!list || !list.length) return;
      fillEl(news, h('h3', { class: 'section-title', style: { marginTop: '24px' } }, 'News'), h('div', { class: 'news-list' }, list.slice(0, 4).map(newsCard)));
    }).catch(() => {});
  }
  return { via, more, backlog: it.kind === 'game' ? backlogBox(it) : null, news };
}

// ---------- launch options ----------
const ACTION_KINDS = {
  obs: { name: 'Start OBS recording', when: 'before' },
  power: { name: 'Switch power plan', when: 'both' },
  close: { name: 'Close programs', when: 'both' },
  run: { name: 'Run a program', when: 'both' },
};
function launchOptions(it) {
  const o = JSON.parse(JSON.stringify(it.launchOpts || {}));
  o.before = o.before || []; o.after = o.after || [];
  const args = h('input', { class: 'text-input', value: o.args || '', placeholder: it.source === 'steam' ? 'For example -novid -high' : 'Extra arguments for the game', spellcheck: 'false' });
  const lists = { before: h('div', { class: 'act-list' }), after: h('div', { class: 'act-list' }) };
  const rowFor = (when, a, i) => {
    const del = h('button', { class: 'icon-btn small', title: 'Remove', onclick: () => { o[when].splice(i, 1); draw(); } }, icon('close'));
    let ctl = null;
    if (a.type === 'power') {
      ctl = h('select', { class: 'text-input' }, [['high', 'High performance'], ['ultimate', 'Ultimate performance'], ['balanced', 'Balanced'], ['saver', 'Power saver']].map(([v, n]) => h('option', { value: v, selected: a.plan === v }, n)));
      ctl.addEventListener('change', () => { a.plan = ctl.value; });
    } else if (a.type === 'close') {
      ctl = h('input', { class: 'text-input', value: a.names || '', placeholder: 'Program names, like Discord, Chrome', spellcheck: 'false' });
      ctl.addEventListener('input', () => { a.names = ctl.value; });
    } else if (a.type === 'run') {
      const pathIn = h('input', { class: 'text-input', value: a.path || '', placeholder: 'Program to run', spellcheck: 'false' });
      pathIn.addEventListener('input', () => { a.path = pathIn.value; });
      const argIn = h('input', { class: 'text-input', value: a.args || '', placeholder: 'Arguments (optional)', spellcheck: 'false', style: { maxWidth: '160px' } });
      argIn.addEventListener('input', () => { a.args = argIn.value; });
      ctl = h('div', { class: 'row', style: { gap: '6px', flex: 1 } }, pathIn, h('button', { class: 'btn', onclick: async () => { const f = await api.pickExe(); if (f) { a.path = f; pathIn.value = f; } } }, 'Browse'), argIn);
    } else if (a.type === 'obs') ctl = h('span', { class: 'help' }, 'Opens OBS and starts recording, tucked into the tray');
    return h('div', { class: 'act-row' }, h('b', {}, ACTION_KINDS[a.type].name), ctl, del);
  };
  const addMenu = (when, e) => openMenu(Object.entries(ACTION_KINDS).filter(([, k]) => k.when === 'both' || k.when === when).map(([type, k]) => ({ label: k.name, run: () => { o[when].push(type === 'power' ? { type, plan: when === 'before' ? 'high' : 'balanced' } : { type }); draw(); } })), { el: e.currentTarget });
  const draw = () => {
    for (const when of ['before', 'after']) fillEl(lists[when], ...o[when].map((a, i) => rowFor(when, a, i)), o[when].length ? null : h('div', { class: 'help' }, 'Nothing yet'));
  };
  draw();
  openModal({
    title: `Launch options: ${displayName(it)}`,
    body: h('div', {},
      h('div', { class: 'field' }, h('label', {}, 'Launch arguments'), args, h('div', { class: 'help' }, it.source === 'steam' ? 'Passed to the game through Steam.' : it.launch && it.launch.type === 'exe' ? 'Added after the program.' : 'This launcher may ignore extra arguments.')),
      h('div', { class: 'field' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('label', {}, 'Before playing'), h('button', { class: 'btn', onclick: (e) => addMenu('before', e) }, icon('plus'), 'Add')), lists.before),
      h('div', { class: 'field' }, h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('label', {}, 'After the game closes'), h('button', { class: 'btn', onclick: (e) => addMenu('after', e) }, icon('plus'), 'Add')), lists.after,
        h('div', { class: 'help' }, 'Runs once Crimson Vault sees the game close. A power plan changed before playing switches back by itself.'))),
    cls: 'wide',
    actions: [{ label: 'Cancel' }, { label: 'Save', primary: true, run: () => { o.args = args.value.trim(); api.updateItem(it.id, { launchOpts: o }); showToast('Launch options saved'); } }],
  });
}

// ---------- move between drives ----------
function moveGame(it) {
  const name = displayName(it);
  const how = {
    steam: ['Steam opened. In Steam: Settings > Storage, pick the game and click Move.', 'steam://open/settings'],
    xbox: ['Windows Installed apps opened. Find the game, click the … menu and pick Move.', 'ms-settings:appsfeatures'],
    gog: ['GOG Galaxy can move games: open the game, click the settings icon > Manage installation > Move.', null],
    ubisoft: ['Ubisoft Connect can move games: open the game > Properties > Move.', null],
    epic: ['Epic does not move installs. Uninstall it, then reinstall and pick the other drive.', null],
  }[it.source];
  if (how && how[1]) api.openUrl(how[1]);
  else if (how) api.launch(it.id).catch(() => {});
  openModal({ title: `Move ${name}`, body: h('p', { class: 'help', style: { fontSize: '14px', margin: 0 } }, how ? how[0] : 'This game was not installed by a launcher. Move its folder yourself, then rescan.'), actions: [it.installDir ? { label: 'Open folder', left: true, run: () => { api.openFolder(it.id); return false; } } : null, { label: 'OK', primary: true }].filter(Boolean) });
}

// ---------- smart collections ----------
const smartList = () => S.lib.settings.smartCollections || [];
const smartById = (id) => smartList().find((c) => c.id === id);
function matchSmart(c, it) {
  if (!c) return false;
  const r = c.rules || {};
  if (r.kind !== 'all' && it.kind !== 'game') return false;
  const mins = groupMinutes(it);
  if (r.status && r.status.length && !r.status.includes(it.status || 'none')) return false;
  if (r.minHours && mins < r.minHours * 60) return false;
  if (r.maxHours && mins > r.maxHours * 60) return false;
  if (r.played === 'never' && (mins > 0 || it.lastPlayed)) return false;
  if (r.played === 'played' && !(mins > 0 || it.lastPlayed)) return false;
  if (r.recentDays && !(it.lastPlayed && Date.now() - it.lastPlayed < r.recentDays * 86400000)) return false;
  if (r.notRecentDays && it.lastPlayed && Date.now() - it.lastPlayed < r.notRecentDays * 86400000) return false;
  if (r.installed === 'yes' && !(it.installed || it.manual)) return false;
  if (r.installed === 'no' && (it.installed || it.manual)) return false;
  if (r.sources && r.sources.length && !r.sources.includes(it.source) && !dupesOf(it).some((o) => r.sources.includes(o.source))) return false;
  if (r.maxSizeGB && !(it.meta && it.meta.sizeBytes && it.meta.sizeBytes <= r.maxSizeGB * 1e9)) return false;
  if (r.minRating && !((it.rating || 0) >= r.minRating)) return false;
  if (r.folder && !descendants(r.folder).has(it.categoryId)) return false;
  if (r.favorite && !it.favorite) return false;
  return true;
}
const SMART_PRESETS = [
  { name: 'Never played', rules: { played: 'never', installed: 'yes' } },
  { name: 'Over 50 hours', rules: { minHours: 50 } },
  { name: 'Small games', rules: { installed: 'yes', maxSizeGB: 5 } },
  { name: 'Not played in a while', rules: { played: 'played', notRecentDays: 90, installed: 'yes' } },
];
function smartEditor(existing) {
  const c = existing ? JSON.parse(JSON.stringify(existing)) : { id: `sc${Date.now().toString(36)}`, name: '', rules: { played: 'any', installed: 'any' } };
  const r = c.rules;
  const nameIn = h('input', { class: 'text-input', value: c.name, placeholder: 'Name, like Short games', spellcheck: 'false' });
  const num = (k, ph) => { const el = h('input', { class: 'text-input small-num', type: 'number', min: '0', value: r[k] || '', placeholder: ph }); el.addEventListener('input', () => { r[k] = Number(el.value) || 0; }); return el; };
  const sel = (k, opts) => { const el = h('select', { class: 'text-input' }, opts.map(([v, n]) => h('option', { value: v, selected: (r[k] || opts[0][0]) === v }, n))); el.addEventListener('change', () => { r[k] = el.value; }); return el; };
  const chips = (k, opts) => {
    r[k] = r[k] || [];
    const box = h('div', { class: 'seg wrap' });
    const draw = () => fillEl(box, ...opts.map(([v, n]) => h('button', { class: r[k].includes(v) ? 'on' : '', onclick: () => { r[k] = r[k].includes(v) ? r[k].filter((x) => x !== v) : [...r[k], v]; draw(); } }, n)));
    draw();
    return box;
  };
  const folders = [['', 'Any folder'], ...S.lib.categories.map((cat) => [cat.id, catPath(cat.id).map((x) => x.name).join(' › ')])];
  const presets = existing ? null : h('div', { class: 'seg wrap' }, SMART_PRESETS.map((p) => h('button', { onclick: () => { saveSmart({ ...p, id: `sc${Date.now().toString(36)}` }); m.close(); } }, p.name)));
  const row = (label, ...kids) => h('div', { class: 'smart-row' }, h('label', {}, label), h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, ...kids));
  const m = openModal({
    title: existing ? `Edit ${existing.name}` : 'New smart collection',
    body: h('div', { class: 'smart-ed' },
      presets ? h('div', { class: 'field' }, h('label', {}, 'Quick start'), presets) : null,
      h('div', { class: 'field' }, h('label', {}, 'Name'), nameIn),
      row('Status', chips('status', [['none', 'No status'], ...Object.entries(STATUS_NAMES)])),
      row('Hours played', num('minHours', 'at least'), h('span', { class: 'help' }, 'to'), num('maxHours', 'at most')),
      row('Played', sel('played', [['any', 'Any'], ['never', 'Never played'], ['played', 'Played']]), h('span', { class: 'help' }, 'in the last'), num('recentDays', 'days'), h('span', { class: 'help' }, 'or not for'), num('notRecentDays', 'days')),
      row('Installed', sel('installed', [['any', 'Any'], ['yes', 'Installed'], ['no', 'Not installed']]), h('span', { class: 'help' }, 'max size'), num('maxSizeGB', 'GB')),
      row('Launchers', chips('sources', SRC_RANK.map((sx) => [sx, SOURCES[sx]]))),
      row('Folder', sel('folder', folders)),
      row('Your rating', sel('minRating', [['0', 'Any'], ['3', '3 stars or more'], ['4', '4 stars or more'], ['5', '5 stars']]))),
    cls: 'wide',
    actions: [
      existing ? { label: 'Delete', left: true, danger: true, run: async () => { if (await confirmBox(`Delete "${existing.name}"?`, 'The games stay where they are. Only this smart collection goes.', 'Delete')) { api.updateSettings({ smartCollections: smartList().filter((x) => x.id !== existing.id) }); if (S.view.type === 'smart' && S.view.id === existing.id) setView({ type: 'home' }); } } } : null,
      { label: 'Cancel' },
      { label: 'Save', primary: true, run: () => { c.name = nameIn.value.trim() || 'Smart collection'; r.minRating = Number(r.minRating) || 0; saveSmart(c); } },
    ].filter(Boolean),
  });
}
function saveSmart(c) {
  const list = smartList().filter((x) => x.id !== c.id);
  const old = smartList().findIndex((x) => x.id === c.id);
  if (old >= 0) list.splice(old, 0, c); else list.push(c);
  api.updateSettings({ smartCollections: list });
  setTimeout(() => setView({ type: 'smart', id: c.id }), 150);
}
function renderSmartSidebar() {
  const box = $('#smartList');
  if (!box) return;
  const list = smartList();
  fillEl(box, 
    h('div', { class: 'side-head' }, h('span', {}, 'Smart collections'), h('button', { class: 'icon-btn small', title: 'New smart collection', onclick: () => smartEditor(null) }, icon('plus'))),
    ...list.map((c) => {
      const n = S.lib.items.filter((it) => visible(it) && matchSmart(c, it)).length;
      const b = h('button', { class: 'cat-btn' + (S.view.type === 'smart' && S.view.id === c.id ? ' active' : ''), 'data-label': c.name, onclick: () => setView({ type: 'smart', id: c.id }) }, icon('sparkle'), h('span', { class: 'label' }, c.name), h('span', { class: 'count' }, n || ''));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); openMenu([{ label: 'Edit', run: () => smartEditor(c) }, { label: 'Delete', danger: true, run: async () => { if (await confirmBox(`Delete "${c.name}"?`, 'The games stay where they are. Only this smart collection goes.', 'Delete')) { api.updateSettings({ smartCollections: smartList().filter((x) => x.id !== c.id) }); if (S.view.type === 'smart' && S.view.id === c.id) setView({ type: 'home' }); } } }], { x: e.clientX, y: e.clientY }); });
      return b;
    }),
    list.length ? null : h('button', { class: 'cat-btn ghost-add', onclick: () => smartEditor(null) }, icon('plus'), h('span', { class: 'label' }, 'Add one, like "Never played"')));
}

// ---------- news ----------
function newsCard(n) {
  const it = S.lib.items.find((x) => String(x.steamAppId) === String(n.appid));
  return h('button', { class: 'news-card', onclick: () => openNews(n) },
    h('div', { class: 'news-top' }, it ? h('span', { class: 'news-game' }, displayName(it)) : null, h('span', { class: 'news-date' }, timeAgo(n.date))),
    h('div', { class: 'news-title' }, n.title),
    n.text ? h('div', { class: 'news-text' }, n.text.slice(0, 180) + (n.text.length > 180 ? '…' : '')) : null);
}
// The full post inside Crimson Vault, with buttons to open the original in Steam or the browser.
function openNews(n) {
  const it = S.lib.items.find((x) => String(x.steamAppId) === String(n.appid));
  const body = h('div', { class: 'news-body' });
  let list = null;
  const kids = [];
  for (const b of n.blocks || []) {
    if (b.t === 'li') { if (!list) { list = h('ul', {}); kids.push(list); } list.append(h('li', {}, b.text)); continue; }
    list = null;
    if (b.t === 'h') kids.push(h('h3', {}, b.text));
    else if (b.t === 'p') kids.push(h('p', {}, b.text));
    else if (b.t === 'img') { const img = h('img', { src: b.src, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }); img.addEventListener('error', () => img.remove()); kids.push(img); }
    else if (b.t === 'vid') kids.push(h('button', { class: 'btn news-vid', onclick: () => api.openExternal(b.url) }, icon('play'), 'Watch the video'));
  }
  if (!kids.length) kids.push(h('p', {}, n.text || 'This post has no text. Open it to read it.'));
  fillEl(body, ...kids);
  const steamUrl = `steam://openurl/${n.url}`;
  const m = openModal({
    title: n.title,
    cls: 'wide news-modal',
    body: h('div', {},
      h('div', { class: 'news-meta' }, it ? h('b', {}, displayName(it)) : null, h('span', {}, new Date(n.date).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })), n.feed ? h('span', {}, n.feed) : null),
      body),
    actions: [
      { label: 'Open in browser', left: true, run: () => { api.openExternal(n.url); return false; } },
      { label: 'Close' },
      { label: 'Open in Steam', primary: true, run: () => { api.openUrl(steamUrl); } },
    ],
  });
  // Start at the top of the post, not at the first button inside it.
  setTimeout(() => { const pb = m.panel.querySelector('.modal-body'); if (pb) pb.scrollTop = 0; const f = m.panel.querySelector('.modal-foot .btn.primary'); if (f) f.focus({ preventScroll: true }); }, 20);
}

let newsKey = '';
function renderNews() {
  const sec = $('#news');
  if (!sec) return;
  const show = S.view.type === 'home' && !S.search && S.source === 'all' && prefs.get('showNews', true);
  if (!show) { sec.hidden = true; return; }
  const ids = S.lib.items.filter((it) => it.kind === 'game' && it.lastPlayed && (it.source === 'steam' || it.steamAppId)).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 6).map((it) => it.id);
  const key = ids.join(',');
  if (!ids.length) { sec.hidden = true; return; }
  if (key === newsKey) { sec.hidden = !sec.childElementCount; return; }
  newsKey = key;
  api.news(ids).then((list) => {
    if (!list || !list.length) { sec.hidden = true; return; }
    sec.hidden = false;
    fillEl(sec, h('div', { class: 'sec-head' }, h('h3', { class: 'section-title' }, 'News for your games'), h('button', { class: 'link-btn', onclick: () => { prefs.set('showNews', false); sec.hidden = true; } }, 'Hide')),
      h('div', { class: 'news-list' }, list.slice(0, 6).map(newsCard)));
  }).catch(() => { sec.hidden = true; });
}

// ---------- store pages: launcher or browser ----------
const STORE_NAMES = { epic: 'Epic', steam: 'Steam', gog: 'GOG', ubisoft: 'Ubisoft' };
function launcherFor(url, store, appid) {
  const u = String(url || '');
  if (appid) return { name: 'Steam', url: `steam://store/${appid}` };
  const app = u.match(/store\.steampowered\.com\/app\/(\d+)/);
  if (app) return { name: 'Steam', url: `steam://store/${app[1]}` };
  if (/^https:\/\/(store\.steampowered|steamcommunity)\.com/.test(u) || (store === 'steam' && /^https:/.test(u))) return { name: 'Steam', url: `steam://openurl/${u}` };
  const ep = u.match(/store\.epicgames\.com\/(?:[a-z-]+\/)?p\/([^/?#]+)/i);
  if (ep) return { name: 'Epic', url: `com.epicgames.launcher://store/p/${ep[1]}` };
  if (/store\.epicgames\.com\/(?:[a-z-]+\/)?free-games/i.test(u)) return { name: 'Epic', url: 'com.epicgames.launcher://store/free-games' };
  if (/^https:\/\/(www\.)?gog\.com\//.test(u)) return { name: 'GOG Galaxy', url: `goggalaxy://openStoreUrl/${u.replace(/^https:\/\//, '')}` };
  return null;
}
function openStore(url, store, appid) {
  const l = launcherFor(url, store, appid);
  const mode = prefs.get('storeOpen', 'launcher');
  if (!l || mode === 'browser') return api.openExternal(url);
  if (mode === 'launcher') return api.openUrl(l.url);
  let remember = false;
  openModal({
    title: 'Open the store page',
    body: h('div', {}, h('p', { class: 'help', style: { fontSize: '14px', marginTop: 0 } }, `Open it in ${l.name} or in your web browser?`),
      toggleRow('Remember my choice', 'Change it later in Settings > App', false, (v) => { remember = v; })),
    actions: [
      { label: 'Cancel' },
      { label: 'Browser', run: () => { if (remember) prefs.set('storeOpen', 'browser'); api.openExternal(url); } },
      { label: l.name, primary: true, run: () => { if (remember) prefs.set('storeOpen', 'launcher'); api.openUrl(l.url); } },
    ],
  });
}
function freeCard(f) {
  const date = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const when = f.now ? (f.end ? `Free until ${date(f.end)}` : 'Free for a limited time') : `Free from ${date(f.start)}`;
  return h('button', { class: `free-card st-${f.store || 'epic'}` + (f.now ? ' now' : ''), onclick: () => openStore(f.url, f.store) },
    f.img ? h('img', { src: f.img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : h('div', { class: 'wish-ph' }, h('span', {}, f.title)),
    h('div', { class: 'free-info' },
      h('div', { class: 'row', style: { gap: '8px', alignItems: 'center' } }, h('span', { class: 'free-store' }, STORE_NAMES[f.store] || 'Epic'), h('span', { class: 'free-tag' }, f.now ? 'Free now' : 'Coming soon')),
      h('div', { class: 'free-title' }, f.title),
      h('div', { class: 'help' }, when, f.worth ? h('s', { style: { marginLeft: '8px' } }, f.worth) : null)));
}

// ---------- deals ----------
let dealsData = null;
async function renderDeals(force) {
  const box = $('#dealsView');
  if (!dealsData || force) fillEl(box, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Checking prices'));
  try { dealsData = await api.deals(!!force); } catch { dealsData = null; }
  if (S.view.type !== 'deals') return;
  const d = dealsData || {};
  const free = d.free || [];
  const wish = (d.wish && d.wish.items) || [];
  const sort = prefs.get('dealSort', 'discount');
  const sorted = [...wish].sort((a, b) => sort === 'price' ? (a.price ?? 1e9) - (b.price ?? 1e9) : sort === 'name' ? a.name.localeCompare(b.name) : (b.discount - a.discount) || ((a.price ?? 1e9) - (b.price ?? 1e9)));
  const onSale = wish.filter((w) => w.discount > 0).length;
  const money = (v) => (v == null ? '' : v === 0 ? 'Free' : `$${v.toFixed(2)}`);
  fillEl(box, 
    h('div', { class: 'deal-head' },
      h('div', {}, h('div', { class: 'help' }, d.at ? `Updated ${timeAgo(d.at).toLowerCase()}. Checks again every 6 hours and tells you when a price drops.` : '')),
      h('button', { class: 'btn', onclick: () => renderDeals(true) }, icon('refresh'), 'Check now')),
    free.length ? h('div', {}, h('h3', { class: 'section-title' }, `Free to keep · ${[...new Set(free.map((f) => STORE_NAMES[f.store] || 'Epic'))].join(', ')}`),
      h('div', { class: 'free-row' }, [...free].sort((a, b) => (b.now - a.now) || (a.end || 9e15) - (b.end || 9e15)).map(freeCard))) : h('div', { class: 'help', style: { marginBottom: '8px' } }, 'No free games on Epic, Steam, GOG or Ubisoft right now.'),
    h('div', { class: 'sec-head', style: { marginTop: '22px' } },
      h('h3', { class: 'section-title' }, `Your Steam wishlist${wish.length ? ` · ${wish.length} games, ${onSale} on sale` : ''}`),
      wish.length ? h('div', { class: 'seg' }, [['discount', 'Biggest sale'], ['price', 'Cheapest'], ['name', 'A to Z']].map(([k, n]) => h('button', { class: sort === k ? 'on' : '', onclick: () => { prefs.set('dealSort', k); renderDeals(); } }, n))) : null),
    d.wish && d.wish.error ? h('div', { class: 'note err' }, d.wish.error) : null,
    wish.length ? h('div', { class: 'wish-grid' }, sorted.map((w) => h('button', { class: 'wish' + (w.discount ? ' sale' : ''), onclick: () => openStore(w.url, 'steam', w.appid) },
      h('div', { class: 'wish-img' }, wishImg(w), w.discount ? h('span', { class: 'wish-off' }, `−${w.discount}%`) : null),
      h('div', { class: 'wish-info' }, h('div', { class: 'wish-name' }, w.name),
        h('div', { class: 'wish-price' }, w.comingSoon ? h('span', { class: 'help' }, 'Coming soon') : [w.discount ? h('s', {}, money(w.original)) : null, h('b', {}, money(w.price))],
          w.low != null && w.price != null && w.price <= w.low && w.discount ? h('span', { class: 'wish-low' }, 'Lowest seen') : null))))) : d.wish && !d.wish.error ? h('div', { class: 'loading' }, 'Your wishlist is empty.') : null);
}

// Wishlist art: tries each picture Steam lists, then falls back to a tile with the name.
function wishImg(w) {
  const list = [...new Set([...(w.imgs || []), w.img].filter(Boolean))];
  const ph = h('div', { class: 'wish-ph', style: { '--h': String(hashHue ? hashHue(w.name) : 0) } }, h('span', {}, w.name));
  if (!list.length) return ph;
  let n = 0;
  const img = h('img', { src: list[0], alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => { n++; if (n < list.length) img.src = list[n]; else img.replaceWith(ph); });
  return img;
}

// ---------- friend alerts ----------
let prevPlaying = null;
function friendAlerts(st) {
  const now = new Map();
  for (const p of (st && st.people) || []) for (const a of p.accounts || []) if (a.status === 'ingame' && a.activity) now.set(`${a.key}`, { who: p.name, what: String(a.activity).replace(/^playing\s+/i, ''), avatar: p.avatar });
  if (prevPlaying && prefs.get('friendAlerts', true)) {
    for (const [k, v] of now) {
      if (prevPlaying.has(k) && prevPlaying.get(k).what === v.what) continue;
      const mine = S.lib.items.find((it) => it.kind === 'game' && (it.installed || it.owned) && norm(displayName(it)).length > 2 && norm(v.what).startsWith(norm(displayName(it))));
      if (!mine) continue;
      showToast(`${v.who} started playing ${displayName(mine)}`);
      if (!document.hasFocus() && 'Notification' in window) { try { new Notification(`${v.who} is playing ${displayName(mine)}`, { body: 'You own this game. Jump in?', silent: false, icon: v.avatar || undefined }); } catch {} }
    }
  }
  prevPlaying = now;
}

// ---------- settings: app, alerts, phone remote ----------
function storeSeg() {
  const seg = h('div', { class: 'seg' });
  const draw = () => fillEl(seg, ...[['launcher', 'The launcher'], ['ask', 'Ask each time'], ['browser', 'Browser']].map(([k, n]) => h('button', { class: prefs.get('storeOpen', 'launcher') === k ? 'on' : '', onclick: () => { prefs.set('storeOpen', k); draw(); } }, n)));
  draw();
  return h('div', {}, seg, h('div', { class: 'help' }, 'For Steam, Epic and GOG pages from Deals. Ubisoft pages always open in the browser.'));
}
function moreSettingsSections(s, state) {
  state.closeToTray = s.closeToTray !== false;
  state.startWithWindows = !!s.startWithWindows;
  state.hotkey = s.hotkey === undefined ? 'Control+Alt+Space' : s.hotkey;
  state.dealAlerts = s.dealAlerts !== false;
  const hk = h('input', { class: 'text-input', value: state.hotkey, placeholder: 'Press keys, or leave empty for none', readonly: true, title: 'Click, then press the keys you want' });
  hk.addEventListener('keydown', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (e.key === 'Backspace' || e.key === 'Delete') { hk.value = ''; state.hotkey = ''; return; }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
    const parts = [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Super'].filter(Boolean);
    if (!parts.length) return;
    const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
    hk.value = state.hotkey = [...parts, key].join('+');
  });
  // Phone remote
  const qr = h('div', { class: 'qr-box' });
  const remoteToggle = toggleRow('Phone remote', 'Browse your library, start games, install and uninstall from your phone on the same Wi-Fi', !!s.remoteEnabled, async (v) => { drawRemote(await api.remoteSet(v)); });
  const drawRemote = (info) => {
    if (!info || !info.enabled) { fillEl(qr, h('div', { class: 'help' }, 'Turn on to pair your phone. Windows may ask to allow Crimson Vault on private networks: click Allow.')); return; }
    if (!info.url) { fillEl(qr, h('div', { class: 'note err', style: { margin: 0 } }, info.error || info.qrError || 'No home network found.')); return; }
    const others = (info.ips || []).slice(1);
    fillEl(qr,
      info.qr ? h('img', { src: info.qr, alt: 'QR code to pair your phone', class: 'qr-img' }) : null,
      h('div', { class: 'qr-side' },
        info.qrError ? h('div', { class: 'note err', style: { margin: 0 } }, info.qrError) : h('div', { class: 'help' }, 'Scan with your phone\'s camera, then add the page to your home screen. Your phone must be on the same Wi-Fi.'),
        h('code', { class: 'qr-url' }, info.qr ? info.url.replace(/\?t=.*/, '') : info.url),
        info.qr ? null : h('button', { class: 'btn', style: { justifySelf: 'start' }, onclick: () => { api.copyText(info.url); showToast('Pairing link copied'); } }, 'Copy pairing link'),
        others.length ? h('div', { class: 'help' }, `Phone can't connect? This PC also has ${others.join(', ')}. Swap it into the link if that is your Wi-Fi.`) : null,
        info.error ? h('div', { class: 'note err', style: { margin: 0 } }, info.error) : null,
        h('button', { class: 'link-btn', onclick: async () => { if (await confirmBox('Make a new pairing code?', 'Phones paired before will need to scan the new code.', 'New code')) drawRemote(await api.remoteNewToken()); } }, 'Unpair all phones (new code)')));
  };
  api.remoteInfo().then(drawRemote).catch(() => {});
  return [
    h('div', { class: 'section-label' }, 'App'),
    h('div', { class: 'field' }, toggleRow('Keep running in the tray', 'Closing the window keeps Crimson Vault in the tray, so tracking and alerts keep working', state.closeToTray, (v) => { state.closeToTray = v; })),
    h('div', { class: 'field' }, toggleRow('Start with Windows', 'Opens quietly in the tray when you sign in', state.startWithWindows, (v) => { state.startWithWindows = v; })),
    h('div', { class: 'field' }, h('label', {}, 'Show / hide shortcut'), hk, h('div', { class: 'help' }, 'Works from anywhere, even in other apps. Click the box and press keys; Backspace turns it off.')),
    h('div', { class: 'field' }, h('label', {}, 'Open store pages in'), storeSeg()),
    h('div', { class: 'section-label' }, 'Alerts'),
    h('div', { class: 'field' }, toggleRow('Friend alerts', 'A pop up when a friend starts playing a game you own', prefs.get('friendAlerts', true), (v) => prefs.set('friendAlerts', v))),
    h('div', { class: 'field' }, toggleRow('Deal alerts', 'A pop up when a wishlist game drops in price or Epic has new free games', state.dealAlerts, (v) => { state.dealAlerts = v; })),
    h('div', { class: 'field' }, toggleRow('News on Home', 'Steam news for the games you played last', prefs.get('showNews', true), (v) => { prefs.set('showNews', v); newsKey = ''; })),
    h('div', { class: 'section-label' }, 'Phone remote'),
    h('div', { class: 'field' }, remoteToggle, qr),
  ];
}

function wireMore() {
  if (api.onCommand) api.onCommand((c) => { if (c === 'surprise') window.surprise && surprise(); if (c === 'tv') window.setTV && setTV(true); });
  if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch {} }
}
document.addEventListener('DOMContentLoaded', wireMore);
