/* global api, S, $, h, icon, prefs, displayName, visible, isGrouped, isDupe, notInstalled, artFor, fmtHours, timeAgo, SOURCES,
   setView, launch, openDetails, openMenu, showToast, surprise, openSettings, spatial, setTV, fillEl, hashHue, render, syncDiscord,
   childrenOf, descendants, catPath, categoryMenu, newCategory, dropTarget, addManual, smartList, smartEditor, matchSmart,
   groupMinutes, NP, sendMedia, openAppleMusic, powerMenu, keepFocus, tile, renderLibraryOverview, STATUS_NAMES, clockText,
   confirmBox, ACCENTS, applyAccent */
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
  ['anime', 'Anime', 'tv'],
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
// Guide tabs, like the Xbox guide: Home, Friends, Music and Quick settings. LB / RB switch them.
const GUIDE_TABS = [['home', 'Home', 'home'], ['friends', 'Friends', 'users'], ['alerts', 'Alerts', 'bell'], ['music', 'Music', 'music'], ['sound', 'Sound', 'sliders'], ['quick', 'Quick settings', 'gear']];
function openGuide(tab) {
  if (tab) S.guideTab = tab;
  if (!S.guideTab) { const saved = prefs.get('guideTab', 'home'); S.guideTab = GUIDE_TABS.some(([k]) => k === saved) ? saved : 'home'; }
  const g = guideEl();
  refreshGuideExtras();
  if (S.guideOpen) { renderGuide(); return; }
  S.guideOpen = true;
  if (g) { g.classList.add('gd-anim'); clearTimeout(openGuide.t); openGuide.t = setTimeout(() => g.classList.remove('gd-anim'), 700); }
  renderGuide();
  document.body.classList.add('guide-open');
  syncDiscord();
  setTimeout(() => focusGuide(), 60);
}
function focusGuide() {
  const g = guideEl();
  if (!g) return;
  const f = g.querySelector('.gd-body .gd-page.active') || g.querySelector('.gd-body [data-first]') || g.querySelector('.gd-body button') || g.querySelector('.gd-tabs .on');
  if (f) spatial.focusEl(f);
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
function guideTab(delta) {
  const i = GUIDE_TABS.findIndex(([k]) => k === S.guideTab);
  const next = GUIDE_TABS[(i + delta + GUIDE_TABS.length) % GUIDE_TABS.length][0];
  S.guideTab = next;
  prefs.set('guideTab', next);
  renderGuide();
  setTimeout(focusGuide, 20);
}
// Runs an action from the guide: close it first so the page or dialog is in front.
const fromGuide = (fn) => () => { closeGuide(); setTimeout(fn, 10); };

function guideFriendRow(p, i) {
  const since = p.status === 'ingame' && typeof friendSince === 'function' ? friendSince(p) : 0;
  const forMin = since ? Math.max(1, Math.round((Date.now() - since) / 60000)) : 0;
  const forTxt = forMin ? ` · ${forMin >= 60 ? `${Math.floor(forMin / 60)} h ${forMin % 60} min` : `${forMin} min`}` : '';
  const base = (() => { const a = (p.accounts || []).find((x) => x.activity); return a ? a.activity : p.status === 'ingame' ? 'In a game' : p.status === 'away' ? 'Away' : p.status === 'offline' ? 'Offline' : 'Online'; })();
  const act = base + forTxt;
  const av = avatarFor(p);
  return h('button', { class: `gd-friend st-${p.status}`, 'data-k': `fr:${p.name}`, title: `${p.name} · ${act}`, style: `--d:${Math.min(i, 10)}`, onclick: fromGuide(() => openFriendProfile(p)) },
    h('div', { class: 'f-avwrap' }, av, h('span', { class: `f-badge st-${p.status}` })), h('div', { class: 'hf-text' }, h('b', {}, p.name), h('span', {}, act)));
}

function guideHome() {
  const running = S.lib.items.find((it) => it.running && it.kind === 'game');
  const cur = pageOf(S.view.type);
  const online = (S.friends.people || []).filter((p) => p.status && p.status !== 'offline');
  const recent = S.lib.items.filter((it) => it.kind === 'game' && !it.hidden && !isGrouped(it) && it.lastPlayed && !it.running && (it.installed || it.manual)).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 5);
  return [
    guideDownloads(),
    running ? h('div', { class: 'gd-game', style: '--d:0' }, h('div', { class: 'gd-art' }, artFor(running)),
      h('div', { class: 'gd-gtext' }, h('span', { class: 'gd-kicker' }, h('span', { class: 'live-dot' }), 'Playing now'), h('b', {}, displayName(running)),
        h('span', { class: 'gd-sub' }, fmtHours(groupMinutes(running)) || ''),
        h('button', { class: 'btn primary', 'data-k': 'g:back', 'data-first': '', onclick: fromGuide(async () => { const r = await api.focusGame(running.id); if (!r || !r.ok) launch(running.id); }) }, icon('play'), 'Back to game'))) : null,
    !running && S.console && S.console.current ? h('div', { class: 'gd-game', style: '--d:0' },
      h('div', { class: 'gd-art' }, h('div', { class: 'gd-xbadge' }, icon('gamepad'))),
      h('div', { class: 'gd-gtext' }, h('span', { class: 'gd-kicker' }, h('span', { class: 'live-dot' }), 'On Xbox'), h('b', {}, S.console.current.name),
        h('span', { class: 'gd-sub' }, [S.console.current.device, typeof consoleMins === 'function' && typeof consoleTime === 'function' ? consoleTime(consoleMins(S.console.current)) : ''].filter(Boolean).join(' · ')),
        h('button', { class: 'btn', 'data-k': 'g:xbox', onclick: fromGuide(() => typeof openConsoleHistory === 'function' && openConsoleHistory()) }, icon('clock'), 'Play history'))) : null,
    h('div', { class: 'gd-qgrid', style: '--d:1' },
      h('button', { 'data-k': 'g:roll', title: 'Spin the reel for a game', onclick: fromGuide(() => surprise()) }, icon('dice'), 'Roll a game'),
      h('button', { 'data-k': 'g:rollanime', title: 'Spin the reel for an anime', onclick: fromGuide(() => { setView({ type: 'anime' }); setTimeout(() => { if (typeof animeSpin === 'function') animeSpin(); }, 350); }) }, icon('tv'), 'Roll an anime')),
    recent.length ? h('div', { class: 'gd-sec', style: '--d:1' }, h('div', { class: 'gd-label' }, 'Recent'),
      h('div', { class: 'gd-recent' }, recent.map((it) => h('button', { class: 'gd-rcard', 'data-k': `r:${it.id}`, title: `Play ${displayName(it)}`, onclick: fromGuide(() => launch(it.id)) }, artFor(it))))) : null,
    h('nav', { class: 'gd-pages' }, MAIN_PAGES.map(([type, label, ic], i) => h('button', { class: 'gd-page' + (cur === type ? ' active' : ''), 'data-k': `p:${type}`, style: `--d:${i + 2}`, onclick: fromGuide(() => setView({ type })) },
      icon(ic), h('span', {}, label),
      type === 'friends' && online.length ? h('span', { class: 'count' }, `${online.length} online`) : null,
      type === 'remoteplay' && S.stream.open ? h('span', { class: 'live-dot' }) : null))),
  ];
}

function guideFriends() {
  const people = S.friends.people || [];
  const order = { ingame: 0, online: 1, busy: 1, away: 2, offline: 3 };
  const on = people.filter((p) => p.status && p.status !== 'offline').sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4) || a.name.localeCompare(b.name));
  const off = people.length - on.length;
  return [
    h('div', { class: 'gd-label' }, on.length ? `${on.length} online` : 'Friends'),
    on.length ? h('div', { class: 'gd-flist' }, on.map(guideFriendRow))
      : h('div', { class: 'gd-empty' }, icon('users'), h('span', {}, S.friends.configured ? 'Nobody is online right now.' : 'Connect Steam, Xbox or Epic in Settings to see friends.')),
    h('button', { class: 'gd-wide', 'data-k': 'f:all', onclick: fromGuide(() => setView({ type: 'friends' })) }, icon('users'), off ? `All friends · ${off} offline` : 'Open Social'),
  ];
}

function guideMusic() {
  const st = (typeof NP !== 'undefined' && NP.state) || {};
  if (S.lib.settings.musicEnabled === false) return [h('div', { class: 'gd-empty' }, icon('music'), h('span', {}, 'The music player is off. Turn it on in Settings.'))];
  if (!st.active) return [h('div', { class: 'gd-empty' }, icon('music'), h('span', {}, 'Nothing playing')), h('button', { class: 'gd-wide', 'data-k': 'm:open', 'data-first': '', onclick: () => openAppleMusic() }, icon('music'), 'Open Apple Music'), h('button', { class: 'gd-wide', 'data-k': 'm:sonar', onclick: () => { if (typeof closeGuide === 'function') closeGuide(); openSoundMixer(); } }, icon('sliders'), 'Sound mixer (Sonar)')];
  const playing = st.status === 'Playing';
  const pos = Math.min(st.dur || 0, NP.base + (playing ? (Date.now() - NP.at) / 1000 : 0));
  return [
    h('div', { class: 'gd-player' },
      st.art ? h('div', { class: 'gd-pbg', style: `background-image:url("${String(st.art).replace(/"/g, '%22')}")` }) : null,
      st.art ? h('img', { class: 'gd-part', src: st.art, alt: '' }) : h('div', { class: 'gd-part' }, icon('music')),
      h('b', { class: 'gd-ptitle' }, st.title || 'Unknown track'),
      h('span', { class: 'gd-partist' }, String(st.artist || '').replace(/\s+—\s+/, ' · ')),
      h('div', { class: 'gd-pbar' + (st.dur && st.canSeek !== false ? ' seek' : ''), title: st.dur ? 'Click to jump' : undefined, onclick: (e) => {
        if (!st.dur) return;
        const r = e.currentTarget.getBoundingClientRect();
        const sec = Math.max(0, Math.min(st.dur, ((e.clientX - r.left) / r.width) * st.dur));
        sendMedia(`seek:${Math.round(sec)}`);
        NP.base = sec; NP.at = Date.now();
        e.currentTarget.firstChild.style.width = `${Math.round((sec / st.dur) * 100)}%`;
      } }, h('span', { style: { width: `${st.dur ? Math.round((pos / st.dur) * 100) : 0}%` } })),
      h('div', { class: 'gd-pctrl' },
        h('button', { class: 'icon-btn', 'data-k': 'm:prev', title: 'Previous', onclick: () => { sendMedia('prev'); } }, icon('prev')),
        h('button', { class: 'icon-btn main', 'data-k': 'm:toggle', 'data-first': '', title: playing ? 'Pause' : 'Play', onclick: () => { sendMedia('toggle'); setTimeout(renderGuide, 60); } }, icon(playing ? 'pause' : 'play')),
        h('button', { class: 'icon-btn', 'data-k': 'm:next', title: 'Next', onclick: () => { sendMedia('next'); } }, icon('next')))),
    h('button', { class: 'gd-wide', 'data-k': 'm:now', onclick: () => { if (typeof closeGuide === 'function') closeGuide(); openNowPlaying(); } }, icon('expand'), 'Now Playing with lyrics'),
    h('button', { class: 'gd-wide', 'data-k': 'm:sonar', onclick: () => { if (typeof closeGuide === 'function') closeGuide(); openSoundMixer(); } }, icon('sliders'), 'Sound mixer (Sonar)'),
    st.isApple ? h('button', { class: 'gd-wide', 'data-k': 'm:open', onclick: () => openAppleMusic() }, icon('music'), 'Open Apple Music') : null,
  ];
}

function guideQuick() {
  const ask = (label, text, action) => async () => { if (await confirmBox(`${label}?`, text, label)) { closeGuide(); const r = await api.power(action); if (r && r.error) showToast(r.error, 'error'); } };
  const toggle = (k, label, on, run) => h('button', { class: 'gd-toggle' + (on ? ' on' : ''), 'data-k': k, onclick: () => { run(!on); setTimeout(renderGuide, 30); } }, h('span', {}, label), h('span', { class: 'knob' }));
  return [
    h('div', { class: 'gd-qgrid' },
      h('button', { 'data-k': 'q:search', 'data-first': '', onclick: fromGuide(() => { $('#search').focus(); $('#search').select(); }) }, icon('search'), 'Search'),
      h('button', { 'data-k': 'q:tv', onclick: fromGuide(() => setTV(!S.tv)) }, icon('tv'), S.tv ? 'Exit controller' : 'Controller mode'),
      h('button', { 'data-k': 'q:fs', onclick: () => api.toggleFullscreen() }, icon('expand'), 'Full screen'),
      h('button', { 'data-k': 'q:settings', onclick: fromGuide(() => openSettings()) }, icon('gear'), 'All settings')),
    toggle('q:alerts', 'Friend alerts', prefs.get('friendAlerts', true), (v) => prefs.set('friendAlerts', v)),
    toggle('q:anim', 'Reduce motion', document.body.classList.contains('calm'), (v) => { prefs.set('calm', v); document.body.classList.toggle('calm', v); }),
    toggle('q:lyrics', 'Song lyrics (LRCLIB)', prefs.get('lyricsOptIn', false), (v) => prefs.set('lyricsOptIn', v)),
    toggle('q:rpc', 'Show on Discord', S.lib.settings.discordPresence !== false, (v) => api.updateSettings({ discordPresence: v })),
    toggle('q:rpcm', 'Music on Discord', S.lib.settings.discordPresence !== false && (S.lib.settings.discordMusic || 'always') !== 'off', (v) => api.updateSettings({ discordMusic: v ? 'always' : 'off' })),
    h('div', { class: 'gd-label' }, 'Accent'),
    h('div', { class: 'gd-accents' }, Object.entries(ACCENTS).map(([k, a]) => h('button', { class: 'gd-swatch' + (S.accent === k ? ' on' : ''), 'data-k': `a:${k}`, title: a.name, style: `--c:${a.c}`, onclick: () => { applyAccent(k); renderGuide(); } }))),
    h('div', { class: 'gd-label' }, 'Power'),
    h('div', { class: 'gd-qgrid' },
      h('button', { 'data-k': 'pw:sleep', onclick: ask('Sleep', 'Your PC goes to sleep.', 'sleep') }, icon('clock'), 'Sleep'),
      h('button', { 'data-k': 'pw:lock', onclick: () => { closeGuide(); api.power('lock'); } }, icon('eyeOff'), 'Lock'),
      h('button', { 'data-k': 'pw:restart', onclick: ask('Restart', 'Your PC restarts in a few seconds. Save your game first.', 'restart') }, icon('refresh'), 'Restart'),
      h('button', { class: 'danger', 'data-k': 'pw:off', onclick: ask('Shut down', 'Your PC shuts down in a few seconds. Save your game first.', 'shutdown') }, icon('power'), 'Shut down')),
    h('button', { class: 'gd-wide', 'data-k': 'pw:quit', onclick: () => api.power('quit') }, icon('exit'), 'Quit Crimson Vault'),
  ];
}

function renderGuide() {
  const g = guideEl();
  if (!g) return;
  const tab = S.guideTab || 'home';
  const online = (S.friends.people || []).filter((p) => p.status && p.status !== 'offline').length;
  const st = (typeof NP !== 'undefined' && NP.state) || {};
  const me = S.lib.settings.xboxGamertag || S.lib.settings.epicName || 'Player';
  const unread = tab === 'alerts' ? 0 : unreadAlerts();
  const body = tab === 'friends' ? guideFriends() : tab === 'alerts' ? guideAlerts() : tab === 'music' ? guideMusic() : tab === 'sound' && typeof guideSound === 'function' ? guideSound() : tab === 'quick' ? guideQuick() : guideHome();
  keepFocus(g, () => fillEl(g,
    h('div', { class: 'gd-head' },
      h('div', { class: 'gd-me' }, h('div', { class: 'gd-avatar' }, (me[0] || 'P').toUpperCase(), h('span', { class: 'f-badge st-online' })), h('div', { class: 'gd-metext' }, h('b', {}, me), h('span', {}, 'Online'))),
      batteryBadge(),
      h('div', { class: 'gd-time' }, h('b', {}, clockText()), h('span', {}, new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })))),
    h('div', { class: 'gd-tabs' },
      h('b', { class: 'pb sh gd-lb' }, 'LB'),
      GUIDE_TABS.map(([k, label, ic]) => h('button', { class: 'gd-tab' + (tab === k ? ' on' : ''), 'data-k': `t:${k}`, title: label, onclick: () => { S.guideTab = k; prefs.set('guideTab', k); renderGuide(); } }, icon(ic),
        k === 'home' && QOL.downloads.length ? h('i', { class: 'gd-dot dl' }, String(QOL.downloads.length)) : null,
        k === 'alerts' && unread ? h('i', { class: 'gd-dot al' }, String(Math.min(unread, 99))) : null,
        k === 'friends' && online ? h('i', { class: 'gd-dot' }, String(online)) : null,
        k === 'music' && st.active && st.status === 'Playing' ? h('i', { class: 'gd-eq' }, h('span'), h('span'), h('span')) : null)),
      h('b', { class: 'pb sh gd-rb' }, 'RB')),
    h('div', { class: 'gd-tabname' }, (GUIDE_TABS.find(([k]) => k === tab) || [])[1]),
    h('div', { class: `gd-body gdt-${tab}` }, body),
    h('div', { class: 'gd-hint' }, h('b', { class: 'pb a' }, 'A'), 'select', h('b', { class: 'pb b' }, 'B'), 'close', h('b', { class: 'pb sh' }, 'LB'), h('b', { class: 'pb sh' }, 'RB'), 'tabs')));
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
      dropTarget(b, { item: (id) => undoable(id, { categoryId: c.id }, `Moved to ${c.name}`) });
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
  // Skip the last few picks so the same game does not keep coming up (when there are enough others).
  const recent = new Set(prefs.get('spinHistory', []).slice(0, 5).map((x) => x.id));
  let out = pool.length > recent.size + 3 && prefs.get('spinFresh', true) ? pool.filter((it) => !recent.has(it.id)) : pool;
  // Backlog and never played games get a second ticket.
  if (prefs.get('spinNudge', true)) out = [...out, ...out.filter((it) => it.status === 'backlog' || !(groupMinutes(it) > 0 || it.lastPlayed))];
  return { pool: out, from: 'your picks' };
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
        h('div', { class: 'hero-sub' }, pool.length ? `Picks from ${new Set(pool).size} ${new Set(pool).size === 1 ? 'game' : 'games'}` : 'No games match these choices'),
        h('button', { class: 'btn primary big sp-go', 'data-k': 'sp:go', disabled: !pool.length, onclick: () => surprise() }, icon('dice'), 'Spin'))),
    h('section', { class: 'hub-sec sp-opts' },
      h('div', { class: 'sp-row' }, h('label', {}, 'Pick from'), h('div', { class: 'chip-row' },
        chip('sp:inst', 'Installed games', S.surprisePool !== 'owned', () => { S.surprisePool = 'installed'; prefs.set('surprisePool', 'installed'); renderSurprisePage(); }),
        chip('sp:own', 'All owned games', S.surprisePool === 'owned', () => { S.surprisePool = 'owned'; prefs.set('surprisePool', 'owned'); renderSurprisePage(); }))),
      h('div', { class: 'sp-row' }, h('label', {}, 'Only'), h('div', { class: 'chip-row' },
        [['', 'Anything'], ['unplayed', 'Never played'], ['backlog', 'Backlog'], ['favorites', 'Favorites'], ['short', 'Small games (under 8 GB)']].map(([k, n]) => chip(`sp:o:${k}`, n, (f.only || '') === k, () => setF({ only: k }))))),
      folders.length ? h('div', { class: 'sp-row' }, h('label', {}, 'Genre'), h('div', { class: 'chip-row' },
        chip('sp:g:', 'Any', !f.folder, () => setF({ folder: '' })), folders.map((c) => chip(`sp:g:${c.id}`, c.name, f.folder === c.id, () => setF({ folder: c.id }))))) : null,
      h('div', { class: 'sp-row' }, h('label', {}, 'Mix'), h('div', { class: 'chip-row' },
        chip('sp:fresh', 'Skip recent picks', prefs.get('spinFresh', true), () => { prefs.set('spinFresh', !prefs.get('spinFresh', true)); box.dataset.sig = ''; renderSurprisePage(); }),
        chip('sp:nudge', 'Favor backlog and unplayed', prefs.get('spinNudge', true), () => { prefs.set('spinNudge', !prefs.get('spinNudge', true)); box.dataset.sig = ''; renderSurprisePage(); }))),
      h('div', { class: 'sp-row' }, h('label', {}, 'Launcher'), h('div', { class: 'chip-row' },
        chip('sp:s:', 'Any', !f.source, () => setF({ source: '' })), sources.map((src) => chip(`sp:s:${src}`, SOURCES[src] || src, f.source === src, () => setF({ source: src })))))),
    hist.length ? h('section', { class: 'hub-sec' }, h('div', { class: 'sec-head' }, h('h3', { class: 'section-title' }, 'Past picks'),
      h('button', { class: 'link-btn', onclick: () => { prefs.set('spinHistory', []); box.dataset.sig = ''; renderSurprisePage(); } }, 'Clear')),
      h('div', { class: 'sp-hist' }, hist.map(({ it, at }) => h('button', { class: 'lr-card', 'data-k': `sph:${it.id}`, onclick: () => openDetails(it.id) }, artFor(it),
        h('div', { class: 'lr-info' }, h('b', {}, displayName(it)), h('span', {}, timeAgo(at))))))) : null));
}

// Music progress in the guide moves while it is open; keyboard Q / E switch guide tabs.
setInterval(() => {
  if (!S.guideOpen) return;
  const t = document.querySelector('#guide .gd-time b');
  if (t && typeof clockText === 'function') { const c = clockText(); if (t.textContent !== c) t.textContent = c; }
  if (S.guideTab !== 'music' || typeof NP === 'undefined') return;
  const st = NP.state || {};
  const bar = document.querySelector('#guide .gd-pbar span');
  if (!bar || !st.dur) return;
  const pos = Math.min(st.dur, NP.base + (st.status === 'Playing' ? (Date.now() - NP.at) / 1000 : 0));
  bar.style.width = `${(pos / st.dur) * 100}%`;
}, 1000);
document.addEventListener('keydown', (e) => {
  if (!S.guideOpen || e.ctrlKey || e.altKey || e.metaKey) return;
  if (e.key === 'q' || e.key === 'Q' || e.key === '[') { e.preventDefault(); guideTab(-1); }
  else if (e.key === 'e' || e.key === 'E' || e.key === ']') { e.preventDefault(); guideTab(1); }
});
document.addEventListener('DOMContentLoaded', () => { if (prefs.get('calm', false)) document.body.classList.add('calm'); });
