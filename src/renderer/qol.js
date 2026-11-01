/* global api, S, $, h, icon, prefs, displayName, visible, isGrouped, notInstalled, artFor, fmtHours, timeAgo, SOURCES, norm,
   setView, launch, openDetails, openMenu, showToast, openSettings, spatial, setTV, fillEl, render, viewItems, pickCategory,
   STATUS_NAMES, MAIN_PAGES, toggleGuide, openGuide, renderGuide, addManual, confirmBox, openShots, toggleRow, COLLATE */
// 0.14.0 quality of life: command palette, undo, picking several cards, auto controller mode,
// do not disturb for friend alerts, downloads and controller battery for the guide, your screenshots,
// and the Quality of life settings.

// ---------- undo ----------
// Changes an item and offers Undo on the pop up. Works for one item or many.
function undoable(ids, patch, label) {
  const list = (Array.isArray(ids) ? ids : [ids]).map((id) => S.byId.get(id)).filter(Boolean);
  if (!list.length) return;
  const before = list.map((it) => [it.id, Object.fromEntries(Object.keys(patch).map((k) => [k, it[k] === undefined ? null : it[k]]))]);
  for (const it of list) api.updateItem(it.id, patch);
  showUndo(label, () => { for (const [id, prev] of before) api.updateItem(id, prev); showToast('Undone'); });
}
function showUndo(text, undo) {
  const box = $('#toasts');
  if (!box) return;
  let done = false;
  const btn = h('button', { class: 'toast-undo', onclick: () => { if (done) return; done = true; undo(); t.remove(); } }, 'Undo');
  const t = h('div', { class: 'toast has-undo' }, h('span', { class: 'toast-ic' }, icon('check')), h('span', {}, text), btn);
  box.append(t);
  while (box.children.length > 4) box.firstChild.remove();
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 6500);
}
// Ctrl+Z undoes the newest change that still shows Undo.
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey && (e.key === 'z' || e.key === 'Z')) || ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
  const btns = document.querySelectorAll('#toasts .toast-undo');
  if (btns.length) { e.preventDefault(); btns[btns.length - 1].click(); }
});

// ---------- picking several cards ----------
// S comes from app.js, which loads after this file; the set is made once the page is ready.
let selAnchor = null;
function syncSelection() {
  for (const c of document.querySelectorAll('#grid .card')) c.classList.toggle('selected', S.sel.has(c.dataset.id));
  document.body.classList.toggle('selecting', S.sel.size > 0);
  const bar = $('#selBar');
  if (!bar) return;
  bar.hidden = !S.sel.size;
  if (!S.sel.size) return;
  const items = [...S.sel].map((id) => S.byId.get(id)).filter(Boolean);
  const allFav = items.every((it) => it.favorite);
  const games = items.filter((it) => it.kind === 'game');
  fillEl(bar,
    h('span', { class: 'sel-count' }, `${S.sel.size} selected`),
    h('button', { class: 'btn', onclick: () => { undoable([...S.sel], { favorite: !allFav }, allFav ? `Removed ${S.sel.size} from favorites` : `Added ${S.sel.size} to favorites`); } }, icon('star'), allFav ? 'Unfavorite' : 'Favorite'),
    h('button', { class: 'btn', onclick: async () => { const c = await pickCategory(null); if (c !== undefined) undoable([...S.sel], { categoryId: c }, `Moved ${S.sel.size} ${c ? `to ${(S.cats.get(c) || {}).name || 'category'}` : 'out of their category'}`); } }, icon('folder'), 'Move'),
    games.length ? h('button', { class: 'btn', onclick: (e) => openMenu([...Object.entries(STATUS_NAMES).map(([k, n]) => ({ label: n, run: () => undoable(games.map((g) => g.id), { status: k }, `${games.length} set to ${n}`) })), '-', { label: 'No status', run: () => undoable(games.map((g) => g.id), { status: null }, 'Status cleared') }], { el: e.currentTarget }) }, icon('list'), 'Status') : null,
    h('button', { class: 'btn', onclick: () => { const n = S.sel.size; undoable([...S.sel], { hidden: !items.every((it) => it.hidden) }, items.every((it) => it.hidden) ? `${n} back` : `${n} hidden`); clearSelection(); } }, icon('eyeOff'), items.every((it) => it.hidden) ? 'Unhide' : 'Hide'),
    h('button', { class: 'btn', onclick: () => { for (const it of viewItems()) S.sel.add(it.id); syncSelection(); } }, 'Select all'),
    h('button', { class: 'icon-btn', title: 'Clear (Esc)', onclick: () => clearSelection() }, icon('close')));
}
// Ctrl+click picks a card, Shift+click picks a range; while picking, a plain click adds or removes.
function selectClick(e, id) {
  if (!(e.ctrlKey || e.metaKey || e.shiftKey || S.sel.size)) return false;
  if (e.shiftKey && selAnchor) {
    const ids = viewItems().map((it) => it.id);
    const a = ids.indexOf(selAnchor);
    const b = ids.indexOf(id);
    if (a >= 0 && b >= 0) for (let i = Math.min(a, b); i <= Math.max(a, b); i++) S.sel.add(ids[i]);
  } else if (S.sel.has(id)) S.sel.delete(id);
  else S.sel.add(id);
  selAnchor = id;
  syncSelection();
  return true;
}
function clearSelection() {
  if (!S.sel.size) return false;
  S.sel.clear();
  selAnchor = null;
  syncSelection();
  return true;
}

// ---------- command palette (Ctrl+K) ----------
const PAL_ACTIONS = () => [
  ...MAIN_PAGES.map(([type, label, ic]) => ({ label, hint: 'Page', ic, run: () => setView({ type }) })),
  ...[['games', 'Games', 'gamepad'], ['apps', 'Apps', 'grid'], ['favorites', 'Favorites', 'star'], ['backlog', 'Backlog', 'list'], ['arcade', 'Arcade', 'joystick'], ['storage', 'Storage', 'drive'], ['launchers', 'Launchers', 'rocket'], ['hidden', 'Hidden', 'eyeOff'], ['libcategories', 'Categories', 'folder'], ['libcollections', 'Collections', 'sparkle']]
    .map(([type, label, ic]) => ({ label, hint: 'Library', ic, run: () => setView({ type }) })),
  { label: 'Open the guide', hint: 'G', ic: 'menu', run: () => openGuide() },
  { label: 'Settings', hint: 'Action', ic: 'gear', run: () => openSettings() },
  { label: S.tv ? 'Leave controller mode' : 'Controller mode', hint: 'Action', ic: 'tv', run: () => setTV(!S.tv) },
  { label: 'Surprise me: spin now', hint: 'Action', ic: 'dice', run: () => { setView({ type: 'surprise' }); setTimeout(() => window.surprise && surprise(), 300); } },
  { label: 'Rescan launchers', hint: 'Action', ic: 'refresh', run: () => { showToast('Scanning launchers'); api.rescan(); } },
  { label: 'Add a game or app', hint: 'Action', ic: 'plus', run: () => addManual() },
  { label: 'Full screen', hint: 'F11', ic: 'expand', run: () => api.toggleFullscreen() },
  { label: 'Check deals now', hint: 'Action', ic: 'tag', run: () => { setView({ type: 'deals' }); } },
  { label: 'Sleep', hint: 'Power', ic: 'clock', run: async () => { if (await confirmBox('Sleep?', 'Your PC goes to sleep.', 'Sleep')) api.power('sleep'); } },
  { label: 'Lock', hint: 'Power', ic: 'eyeOff', run: () => api.power('lock') },
  { label: 'Restart PC', hint: 'Power', ic: 'refresh', run: async () => { if (await confirmBox('Restart?', 'Your PC restarts in a few seconds.', 'Restart')) api.power('restart'); } },
  { label: 'Shut down PC', hint: 'Power', ic: 'power', run: async () => { if (await confirmBox('Shut down?', 'Your PC shuts down in a few seconds.', 'Shut down')) api.power('shutdown'); } },
  { label: 'Quit Crimson Vault', hint: 'Power', ic: 'exit', run: () => api.power('quit') },
];
// Scores how well a name matches what you typed: whole word starts first, then letters in order.
function palScore(name, q) {
  const n = norm(name);
  if (!q) return 1;
  if (n.startsWith(q)) return 100 - n.length / 100;
  if (n.includes(' ' + q)) return 80 - n.length / 100;
  if (n.includes(q)) return 60 - n.length / 100;
  const initials = n.split(' ').map((w) => w[0]).join('');
  if (initials.startsWith(q.replace(/ /g, ''))) return 50;
  let i = 0;
  for (const ch of n) if (ch === q[i]) i++;
  return i === q.length ? 20 - n.length / 100 : 0;
}
function openPalette() {
  if (document.querySelector('.palette')) return;
  const input = h('input', { class: 'pal-input', placeholder: 'Type a game, page or action…', spellcheck: 'false', autocomplete: 'off' });
  const list = h('div', { class: 'pal-list' });
  const back = h('div', { class: 'pal-back' });
  const box = h('div', { class: 'palette', role: 'dialog' }, h('div', { class: 'pal-top' }, icon('search'), input, h('b', { class: 'pal-key' }, 'Esc')), list,
    h('div', { class: 'pal-foot' }, h('span', {}, h('b', {}, 'Enter'), ' open'), h('span', {}, h('b', {}, 'Shift+Enter'), ' details'), h('span', {}, h('b', {}, '↑ ↓'), ' move')));
  let rows = [];
  let at = 0;
  const close = () => { back.remove(); box.remove(); S.modals = S.modals.filter((f) => f !== close); };
  const pick = (r, details) => { close(); if (details && r.item) openDetails(r.item.id); else r.run(); };
  const draw = () => {
    const q = norm(input.value);
    const items = S.lib.items.filter((it) => !it.hidden && !isGrouped(it) && (it.installed || it.manual || it.owned))
      .map((it) => ({ item: it, label: displayName(it), hint: it.running ? 'Playing' : notInstalled(it) ? `Install · ${SOURCES[it.source] || ''}` : SOURCES[it.source] || '', run: () => launch(it.id), s: palScore(displayName(it), q) + (it.lastPlayed ? Math.min(8, (it.lastPlayed / 1e12)) : 0) }));
    const acts = PAL_ACTIONS().map((a) => ({ ...a, s: palScore(a.label, q) + (q ? 0 : -50) }));
    rows = [...items, ...acts].filter((r) => r.s > 0).sort((a, b) => b.s - a.s || COLLATE.compare(a.label, b.label));
    if (!q) rows = [...S.lib.items.filter((it) => it.lastPlayed && !it.hidden && !isGrouped(it)).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 6).map((it) => ({ item: it, label: displayName(it), hint: it.running ? 'Playing' : `Played ${timeAgo(it.lastPlayed).toLowerCase()}`, run: () => launch(it.id) })), ...PAL_ACTIONS().slice(0, 7)];
    rows = rows.slice(0, 40);
    at = Math.min(at, Math.max(0, rows.length - 1));
    fillEl(list, rows.length ? rows.map((r, i) => {
      const el = h('button', { class: 'pal-row' + (i === at ? ' on' : ''), onmouseenter: () => { at = i; mark(); }, onclick: (e) => pick(r, e.shiftKey) },
        r.item ? h('div', { class: 'pal-art' }, artFor(r.item)) : h('span', { class: 'pal-ic' }, icon(r.ic || 'play')),
        h('span', { class: 'pal-label' }, r.label), h('span', { class: 'pal-hint' }, r.hint || ''));
      return el;
    }) : h('div', { class: 'pal-empty' }, 'Nothing matches'));
    if (!q) list.prepend(h('div', { class: 'pal-sec' }, 'Recent and quick actions'));
  };
  const mark = () => { [...list.querySelectorAll('.pal-row')].forEach((el, i) => el.classList.toggle('on', i === at)); const on = list.querySelector('.pal-row.on'); if (on) on.scrollIntoView({ block: 'nearest' }); };
  input.addEventListener('input', () => { at = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); at = Math.min(rows.length - 1, at + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); at = Math.max(0, at - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (rows[at]) pick(rows[at], e.shiftKey); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  back.addEventListener('mousedown', close);
  document.body.append(back, box);
  S.modals.push(close);
  draw();
  input.focus();
}
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openPalette(); }
});

// ---------- auto controller mode ----------
// Picking up a controller switches to controller mode; really using the mouse switches back.
let autoTv = false;
let mouseRun = { d: 0, t: 0, x: null, y: null };
window.addEventListener('padmode', (e) => {
  if (!e.detail || S.tv || !prefs.get('autoTv', true) || S.modals.length) return;
  autoTv = true;
  setTV(true);
  showToast('Controller mode on. Move the mouse to leave.');
});
window.addEventListener('mousemove', (e) => {
  if (!S.tv || !autoTv) return;
  const now = performance.now();
  if (now - mouseRun.t > 1200) mouseRun = { d: 0, t: now, x: e.clientX, y: e.clientY };
  mouseRun.d += Math.hypot(e.clientX - mouseRun.x, e.clientY - mouseRun.y);
  mouseRun.x = e.clientX; mouseRun.y = e.clientY;
  if (mouseRun.d > 450) { autoTv = false; mouseRun.d = 0; setTV(false); }
});

// ---------- do not disturb: friend alerts wait while you play ----------
const heldAlerts = [];
function gameIsRunning() { return S.lib.items.some((it) => it.running && it.kind === 'game'); }
function holdAlert(text) {
  if (S.lib.settings.dndWhilePlaying === false || !gameIsRunning()) return false;
  heldAlerts.push(text);
  return true;
}
setInterval(() => {
  if (!heldAlerts.length || gameIsRunning()) return;
  const list = heldAlerts.splice(0);
  showToast(list.length === 1 ? list[0] : `While you played: ${list.slice(0, 3).join(' · ')}${list.length > 3 ? ` and ${list.length - 3} more` : ''}`);
}, 8000);

// ---------- downloads and controller battery for the guide ----------
const QOL = { downloads: [], battery: null, dlAt: 0 };
async function refreshGuideExtras() {
  const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
  const [dl, bat] = await Promise.all([api.downloads().catch(() => []), pads.length ? api.padBattery().catch(() => null) : null]);
  const changed = JSON.stringify([dl, bat]) !== JSON.stringify([QOL.downloads, QOL.battery]);
  QOL.downloads = dl || [];
  QOL.battery = bat;
  QOL.dlAt = Date.now();
  if (changed && S.guideOpen) renderGuide();
}
setInterval(() => { if (S.guideOpen) refreshGuideExtras(); }, 5000);
function guideDownloads() {
  const list = QOL.downloads;
  if (!list.length) return null;
  const gb = (b) => `${(b / 1e9).toFixed(1)} GB`;
  return h('div', { class: 'gd-sec gd-dl', style: '--d:1' }, h('div', { class: 'gd-label' }, `Downloads · ${list.length}`),
    list.slice(0, 4).map((d) => h('div', { class: 'gd-dlrow' + (d.paused ? ' paused' : '') },
      h('div', { class: 'gd-dltop' }, h('b', {}, d.name), h('span', {}, d.paused ? 'Paused' : d.queued ? 'Queued' : d.pct != null ? `${d.pct}%` : 'Installing')),
      d.pct != null ? h('div', { class: 'gd-dlbar' }, h('span', { style: { width: `${d.pct}%` } })) : h('div', { class: 'gd-dlbar indet' }, h('span')),
      d.total ? h('div', { class: 'gd-dlsub' }, `${gb(d.done)} of ${gb(d.total)} · ${SOURCES[d.source] || d.source}`) : h('div', { class: 'gd-dlsub' }, SOURCES[d.source] || d.source))));
}
function batteryBadge() {
  const b = QOL.battery;
  if (!b) return null;
  if (b.wired) return h('span', { class: 'gd-batt wired', title: 'Controller plugged in' }, icon('gamepad'), 'Wired');
  const lv = Math.max(0, Math.min(3, b.level || 0));
  return h('span', { class: `gd-batt lv${lv}`, title: ['Controller battery empty', 'Controller battery low', 'Controller battery medium', 'Controller battery full'][lv] },
    icon('gamepad'), h('i', { class: 'gd-cell' }, h('span'), h('span'), h('span')));
}

// ---------- your screenshots in a game's details ----------
function shotsSection(it) {
  const box = h('div', { class: 'det-myshots' });
  api.screenshots(it.id).then((list) => {
    if (!list || !list.length) return;
    const shots = list.map((s) => ({ thumb: s.url, full: s.url }));
    fillEl(box,
      h('div', { class: 'sec-head', style: { marginTop: '24px' } }, h('h3', { class: 'section-title' }, `Your screenshots · ${list.length}`),
        h('button', { class: 'link-btn', onclick: () => api.showFile(list[0].path) }, 'Open folder')),
      h('div', { class: 'myshots' }, list.slice(0, 12).map((s, i) => h('button', { class: 'myshot', title: new Date(s.t).toLocaleString(), onclick: () => openShots(shots, i) },
        h('img', { src: s.url, alt: '', loading: 'lazy', decoding: 'async' })))));
  }).catch(() => {});
  return box;
}

// ---------- Quality of life settings ----------
function qolSettings(s) {
  const pick = (label, sub, key, opts, def) => {
    const cur = s[key] === undefined ? def : s[key];
    const seg = h('div', { class: 'seg wrap' });
    const draw = (v) => fillEl(seg, ...opts.map(([val, name]) => h('button', { class: String(v) === String(val) ? 'on' : '', onclick: () => { api.updateSettings({ [key]: val }); draw(val); } }, name)));
    draw(cur);
    return h('div', { class: 'field' }, h('label', {}, label), seg, sub ? h('div', { class: 'help' }, sub) : null);
  };
  return [
    h('div', { class: 'section-label' }, 'Quality of life'),
    h('div', { class: 'field' }, toggleRow('Do not disturb while playing', 'Friend and deal pop ups wait until you close the game, then show together', s.dndWhilePlaying !== false, (v) => api.updateSettings({ dndWhilePlaying: v }))),
    h('div', { class: 'field' }, toggleRow('Session summary', 'When a game closes: how long you played and any new achievements', s.sessionSummary !== false, (v) => api.updateSettings({ sessionSummary: v }))),
    pick('Play time reminder', 'A gentle pop up after this long in one sitting', 'playReminderHours', [[0, 'Off'], [1, '1 h'], [2, '2 h'], [3, '3 h'], [4, '4 h']], 0),
    pick('Low space warning', 'A pop up when a drive has less free space than this', 'lowSpaceGB', [[0, 'Off'], [10, '10 GB'], [30, '30 GB'], [50, '50 GB'], [100, '100 GB']], 30),
    h('div', { class: 'field' }, toggleRow('Auto controller mode', 'Pick up a controller to switch to controller mode; move the mouse to switch back', prefs.get('autoTv', true), (v) => prefs.set('autoTv', v))),
    h('div', { class: 'help' }, 'Shortcuts: Ctrl+K finds anything, G opens the guide, Ctrl+Z undoes, Ctrl or Shift+click picks several cards.'),
  ];
}

// The bar for picked cards, and keeping picks marked after the grid redraws.
document.addEventListener('DOMContentLoaded', () => {
  S.sel = new Set();
  const bar = h('div', { id: 'selBar', class: 'sel-bar', hidden: true });
  document.body.append(bar);
  new MutationObserver(() => { if (S.sel.size) for (const c of document.querySelectorAll('#grid .card')) c.classList.toggle('selected', S.sel.has(c.dataset.id)); }).observe($('#grid'), { childList: true });
});
