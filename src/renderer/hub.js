/* global api, S, $, h, icon, prefs, displayName, visible, isGrouped, notInstalled, artFor, fmtHours, timeAgo, fmtBytes, SOURCES,
   setView, launch, openDetails, openMenu, confirmBox, showToast, surprise, openSettings, startRemotePlay, heroUrlFor, setHeroBg,
   groupMinutes, dupesOf, smartList, smartEditor, matchSmart, childrenOf, descendants, NP, sendMedia, openAppleMusic, openStore,
   STORE_NAMES, openNews, newsCard, STATUS_NAMES, spatial, setTV, fillEl, hashHue, ARCADE, renderSidebar, render, isDupe */
// 0.12.0: the Home hub (a tile menu that works with mouse and controller), the Library hub,
// the news half of Deals & News, Back navigation and the power menu.

// ---------- shared ----------
const HUB = { deals: null, dealsAt: 0, news: null, newsKey: '', heroFor: '' };
const isGameItem = (it) => it.kind === 'game';
const gamesShown = () => S.lib.items.filter((it) => visible(it) && isGameItem(it));
const greet = () => { const hr = new Date().getHours(); return hr < 5 ? 'Late night' : hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'; };
const clockText = () => new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateText = () => new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

// Keeps the focused tile focused when a section is rebuilt (for controller users).
function keepFocus(box, build) {
  const a = document.activeElement;
  const key = a && box.contains(a) && a.dataset ? a.dataset.k : null;
  build();
  if (key) { const again = box.querySelector(`[data-k="${CSS.escape(key)}"]`); if (again) again.focus({ preventScroll: true }); }
}

function tile(k, ic, title, sub, onclick, cls = '') {
  return h('button', { class: `hub-tile ${cls}`, 'data-k': k, onclick },
    h('span', { class: 'ht-ic' }, icon(ic)),
    h('span', { class: 'ht-text' }, h('span', { class: 'ht-title' }, title), sub ? h('span', { class: 'ht-sub' }, sub) : null));
}

async function loadHubDeals() {
  if (HUB.deals && Date.now() - HUB.dealsAt < 30 * 60 * 1000) return HUB.deals;
  HUB.dealsAt = Date.now();
  try { HUB.deals = await api.deals(false); } catch { HUB.deals = null; }
  return HUB.deals;
}

// The three games you played the most, with Steam news.
function topPlayedSteam(n = 3) {
  return S.lib.items.filter((it) => isGameItem(it) && !it.hidden && !isGrouped(it) && !isDupe(it) && (it.source === 'steam' || it.steamAppId))
    .sort((a, b) => groupMinutes(b) - groupMinutes(a)).filter((it) => groupMinutes(it) > 0).slice(0, n);
}
async function newsForTop() {
  const top = topPlayedSteam(3);
  const key = top.map((it) => it.id).join(',');
  if (HUB.news && HUB.newsKey === key) return HUB.news;
  HUB.newsKey = key;
  if (!top.length) { HUB.news = []; return HUB.news; }
  let list = [];
  try { list = (await api.news(top.map((it) => it.id))) || []; } catch {}
  // Newest post from each game first, so one busy game does not crowd out the others.
  const firsts = [];
  const seen = new Set();
  for (const n of list) if (!seen.has(n.appid)) { seen.add(n.appid); firsts.push(n); }
  HUB.news = [...firsts, ...list.filter((n) => !firsts.includes(n))];
  return HUB.news;
}

function newsTile(n) {
  const it = S.lib.items.find((x) => String(x.steamAppId) === String(n.appid));
  const img = n.img ? h('img', { src: n.img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null;
  return h('button', { class: 'news-tile', 'data-k': `news:${n.gid || n.url}`, onclick: () => openNews(n) },
    h('div', { class: 'nt-img', style: it && it.coverUrl ? { backgroundImage: `url("${it.coverUrl}")` } : {} }, img),
    h('div', { class: 'nt-body' },
      h('div', { class: 'news-top' }, it ? h('span', { class: 'news-game' }, displayName(it)) : null, h('span', { class: 'news-date' }, timeAgo(n.date))),
      h('div', { class: 'news-title' }, n.title)));
}

// ---------- power ----------
function powerMenu(pos) {
  const ask = (label, text, action) => async () => { if (await confirmBox(`${label}?`, text, label)) { const r = await api.power(action); if (r && r.error) showToast(r.error, 'error'); } };
  openMenu([
    { label: 'Sleep', run: ask('Sleep', 'Your PC goes to sleep. Games keep their place.', 'sleep') },
    { label: 'Lock', run: () => api.power('lock') },
    { label: 'Restart', run: ask('Restart', 'Your PC restarts in a few seconds. Save your game first.', 'restart') },
    { label: 'Shut down', danger: true, run: ask('Shut down', 'Your PC shuts down in a few seconds. Save your game first.', 'shutdown') },
    '-',
    { label: 'Quit Crimson Vault', run: () => api.power('quit') },
  ], pos);
}

// ---------- Home hub ----------
function renderHub() {
  const box = $('#hubView');
  if (!box) return;
  const all = S.lib.items.filter((it) => !it.hidden && !isGrouped(it));
  const games = all.filter(isGameItem);
  const running = games.find((it) => it.running);
  const last = running || games.filter((it) => it.lastPlayed && (it.installed || it.manual)).sort((a, b) => b.lastPlayed - a.lastPlayed)[0]
    || games.filter((it) => it.installed).sort((a, b) => groupMinutes(b) - groupMinutes(a))[0];
  const online = (S.friends.people || []).filter((p) => p.status && p.status !== 'offline');
  const playing = online.filter((p) => p.status === 'ingame');
  const installed = games.filter((it) => it.installed || it.manual).length;
  const free = ((HUB.deals && HUB.deals.free) || []).filter((f) => f.now);
  const sale = ((HUB.deals && HUB.deals.wish && HUB.deals.wish.items) || []).filter((w) => w.discount > 0).length;
  const freeSpace = S.drives ? S.drives.reduce((a, d) => a + d.free, 0) : null;
  const news = prefs.get('showNews', true) ? (HUB.news || []).slice(0, 3) : [];
  const sig = JSON.stringify([last && [last.id, last.running, last.minutes, last.coverUrl], online.map((p) => p.name + p.status), installed, free.map((f) => f.title), sale, freeSpace, news.map((n) => n.url), S.stream.open, !!S.tv, new Date().getHours()]);
  if (box.dataset.sig !== sig) {
    box.dataset.sig = sig;
    keepFocus(box, () => fillEl(box,
      h('div', { class: 'hub-head' },
        h('div', {}, h('div', { class: 'hub-greet' }, greet()), h('div', { class: 'hub-date' }, dateText())),
        h('div', { class: 'hub-clock', id: 'hubClock' }, clockText())),
      h('div', { class: 'hub-main' }, hubHero(last), hubSide(online, playing)),
      h('div', { class: 'hub-tiles' },
        tile('t:library', 'grid', 'Library', `${installed} games installed`, () => setView({ type: 'library' }), 'big'),
        tile('t:deals', 'tag', 'Deals & News', free.length || sale ? [free.length ? `${free.length} free` : null, sale ? `${sale} on sale` : null].filter(Boolean).join(' · ') : 'Wishlist, free games, news', () => setView({ type: 'deals' })),
        tile('t:social', 'users', 'Social', online.length ? `${online.length} online${playing.length ? ` · ${playing.length} playing` : ''}` : 'Friends and Discord', () => setView({ type: 'friends' })),
        tile('t:stats', 'chart', 'Statistics', `${fmtHours(games.reduce((a, it) => a + (it.minutes || 0), 0)) || '0 hrs'} played`, () => setView({ type: 'stats' })),
        tile('t:surprise', 'dice', 'Surprise me', 'Let fate pick a game', () => setView({ type: 'surprise' }), 'accent'),
        tile('t:xbox', 'gamepad', 'Xbox Remote Play', S.stream.open ? 'Streaming now' : 'Play your console here', () => setView({ type: 'remoteplay' }))),
      free.length ? h('section', { class: 'hub-sec' },
        h('div', { class: 'sec-head' }, h('h3', { class: 'section-title' }, 'Free to keep'), h('button', { class: 'link-btn', onclick: () => setView({ type: 'deals' }) }, 'All deals')),
        h('div', { class: 'hub-free' }, free.slice(0, 4).map((f) => h('button', { class: `hub-freecard st-${f.store || 'epic'}`, 'data-k': `free:${f.store}:${f.title}`, onclick: () => openStore(f.url, f.store) },
          f.img ? h('img', { src: f.img, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null,
          h('div', { class: 'hf-info' }, h('span', { class: 'free-store' }, STORE_NAMES[f.store] || 'Epic'), h('span', { class: 'hf-title' }, f.title)))))) : null,
      news.length ? h('section', { class: 'hub-sec' },
        h('div', { class: 'sec-head' }, h('h3', { class: 'section-title' }, 'News from your most played'), h('button', { class: 'link-btn', onclick: () => setView({ type: 'deals' }) }, 'More news')),
        h('div', { class: 'hub-news' }, news.map(newsTile))) : null,
      h('div', { class: 'hub-utils' },
        h('button', { class: 'hub-util', 'data-k': 'u:search', onclick: () => { $('#search').focus(); } }, icon('search'), 'Search'),
        h('button', { class: 'hub-util', 'data-k': 'u:storage', onclick: () => setView({ type: 'storage' }) }, icon('drive'), freeSpace != null ? `Storage · ${fmtBytes(freeSpace)} free` : 'Storage'),
        h('button', { class: 'hub-util', 'data-k': 'u:launchers', onclick: () => setView({ type: 'launchers' }) }, icon('rocket'), 'Launchers'),
        h('button', { class: 'hub-util', 'data-k': 'u:settings', onclick: () => openSettings() }, icon('gear'), 'Settings'),
        h('button', { class: 'hub-util', 'data-k': 'u:tv', onclick: () => setTV(!S.tv) }, icon('tv'), S.tv ? 'Leave controller mode' : 'Controller mode'),
        h('button', { class: 'hub-util power', 'data-k': 'u:power', onclick: (e) => powerMenu({ el: e.currentTarget }) }, icon('power'), 'Power'))));
  }
  renderHubMusic();
  // Fill in the slower parts, then draw again once they arrive.
  if (!HUB.deals && !HUB.loadingDeals) { HUB.loadingDeals = true; loadHubDeals().then(() => { HUB.loadingDeals = false; if (S.view.type === 'hub') renderHub(); }); }
  const topKey = topPlayedSteam(3).map((it) => it.id).join(',');
  if (prefs.get('showNews', true) && HUB.newsKey !== topKey && !HUB.loadingNews) { HUB.loadingNews = true; newsForTop().then(() => { HUB.loadingNews = false; if (S.view.type === 'hub') renderHub(); }); }
}

function hubHero(it) {
  if (!it) {
    return h('div', { class: 'hub-hero empty' }, h('div', { class: 'hh-info' },
      h('div', { class: 'hero-kicker' }, 'Welcome'), h('div', { class: 'hero-name' }, 'Your games live here'),
      h('div', { class: 'hero-sub' }, 'Open the Library to start something, or let Surprise me pick.'),
      h('div', { class: 'hero-actions' }, h('button', { class: 'btn primary big', 'data-k': 'hero:lib', onclick: () => setView({ type: 'library' }) }, icon('grid'), 'Open Library'))));
  }
  const bg = h('div', { class: 'hero-bg' });
  if (it.coverUrl) bg.style.backgroundImage = `url("${it.coverUrl}")`;
  else bg.style.background = `hsl(${hashHue(it.name) % 360} 45% 16%)`;
  const info = heroUrlFor(it, (inf) => setHeroBg(bg, it, inf));
  if (S.storeInfo.get(it.id)) setHeroBg(bg, it, S.storeInfo.get(it.id));
  void info;
  const ach = it.meta && it.meta.achievements && it.meta.achievements.total ? it.meta.achievements : null;
  const mins = groupMinutes(it);
  const play = it.running
    ? h('button', { class: 'btn primary big', 'data-k': 'hero:play', onclick: async () => { const r = await api.focusGame(it.id); if (!r || !r.ok) launch(it.id); } }, icon('play'), 'Back to game')
    : h('button', { class: 'btn primary big', 'data-k': 'hero:play', onclick: () => launch(it.id) }, icon('play'), notInstalled(it) ? 'Install' : 'Play');
  return h('div', { class: 'hub-hero' + (it.running ? ' running' : '') }, bg, h('div', { class: 'hero-shade' }),
    h('div', { class: 'hh-art' }, artFor(it)),
    h('div', { class: 'hh-info' },
      h('div', { class: 'hero-kicker' }, it.running ? h('span', { class: 'live-dot' }) : null, it.running ? 'Playing now' : 'Jump back in'),
      h('div', { class: 'hero-name' }, displayName(it)),
      h('div', { class: 'hero-sub' }, [mins ? `${fmtHours(mins)} played` : null, it.lastPlayed && !it.running ? `Last played ${timeAgo(it.lastPlayed).toLowerCase()}` : null, it.status && STATUS_NAMES[it.status] ? STATUS_NAMES[it.status] : null].filter(Boolean).join(' · ')),
      ach ? h('div', { class: 'hero-ach', title: `${ach.have} of ${ach.total} achievements` }, h('span', { style: { width: `${Math.round((ach.have / ach.total) * 100)}%` } })) : null,
      h('div', { class: 'hero-actions' }, play,
        h('button', { class: 'btn glass big', 'data-k': 'hero:details', onclick: () => openDetails(it.id) }, icon('more'), 'Details'))));
}

function hubSide(online, playing) {
  const people = [...playing, ...online.filter((p) => !playing.includes(p))].slice(0, 5);
  const av = (p) => (p.avatar ? h('img', { class: 'f-av', src: p.avatar, alt: '' }) : h('div', { class: 'f-av f-init' }, (p.name[0] || '?').toUpperCase()));
  const act = (p) => { const a = (p.accounts || []).find((x) => x.activity); return a ? a.activity : p.status === 'ingame' ? 'In a game' : 'Online'; };
  return h('div', { class: 'hub-side' },
    h('button', { class: 'hub-card hub-friends', 'data-k': 'side:friends', onclick: () => setView({ type: 'friends' }) },
      h('div', { class: 'hc-head' }, icon('users'), h('span', {}, 'Friends'), h('span', { class: 'count' }, online.length ? `${online.length} online` : '')),
      people.length ? h('div', { class: 'hf-list' }, people.map((p) => h('div', { class: `hf-row st-${p.status}` }, h('div', { class: 'f-avwrap' }, av(p), h('span', { class: `f-badge st-${p.status}` })),
        h('div', { class: 'hf-text' }, h('b', {}, p.name), h('span', {}, act(p))))))
        : h('div', { class: 'help' }, S.friends.configured ? 'Nobody is online right now.' : 'Connect Steam, Xbox or Epic in Settings to see friends.')),
    h('div', { class: 'hub-card hub-music', id: 'hubMusic' }));
}

// The music card follows Apple Music on its own, without redrawing the whole page.
function renderHubMusic() {
  const box = document.getElementById('hubMusic');
  if (!box || typeof NP === 'undefined') return;
  const st = NP.state || {};
  const set = S.lib.settings || {};
  if (set.musicEnabled === false || st.unavailable) { box.hidden = true; return; }
  box.hidden = false;
  const key = JSON.stringify([st.active, st.title, st.artist, st.art, st.status]);
  if (box.dataset.key === key) return;
  box.dataset.key = key;
  if (!st.active) {
    fillEl(box, h('div', { class: 'hc-head' }, icon('music'), h('span', {}, 'Music')),
      h('div', { class: 'help' }, 'Nothing playing'),
      h('button', { class: 'btn', 'data-k': 'music:open', onclick: () => openAppleMusic() }, 'Open Apple Music'));
    return;
  }
  const playingNow = st.status === 'Playing';
  fillEl(box,
    st.art ? h('div', { class: 'hm-bg', style: { backgroundImage: `url("${st.art}")` } }) : null,
    h('div', { class: 'hm-top' }, st.art ? h('img', { class: 'hm-art', src: st.art, alt: '' }) : h('div', { class: 'hm-art' }, icon('music')),
      h('div', { class: 'hm-text' }, h('b', {}, st.title || 'Unknown track'), h('span', {}, String(st.artist || '').split(' — ')[0]))),
    h('div', { class: 'hm-ctrls' },
      h('button', { class: 'icon-btn', 'data-k': 'music:prev', title: 'Previous', onclick: () => sendMedia('prev') }, icon('prev')),
      h('button', { class: 'icon-btn main', 'data-k': 'music:toggle', title: playingNow ? 'Pause' : 'Play', onclick: () => sendMedia('toggle') }, icon(playingNow ? 'pause' : 'play')),
      h('button', { class: 'icon-btn', 'data-k': 'music:next', title: 'Next', onclick: () => sendMedia('next') }, icon('next'))));
}

// ---------- Library hub ----------
function renderLibraryOverview(box) {
  if (!box) return;
  const vis = S.lib.items.filter(visible);
  const games = vis.filter(isGameItem);
  const apps = vis.filter((it) => !isGameItem(it));
  const recent = vis.filter((it) => it.lastPlayed).sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0) || b.lastPlayed - a.lastPlayed).slice(0, 5);
  const fav = vis.filter((it) => it.favorite).length;
  const backlog = games.filter((it) => it.status === 'backlog').length;
  const hidden = S.lib.items.filter((it) => it.hidden).length;
  const uncat = vis.filter((it) => !it.categoryId || !S.cats.has(it.categoryId)).length;
  const root = childrenOf(null).find((c) => /^games$/i.test(c.name));
  const folders = root ? childrenOf(root.id).map((c) => { const set = descendants(c.id); const list = games.filter((it) => set.has(it.categoryId)); return { c, list }; }).filter((x) => x.list.length).sort((a, b) => b.list.length - a.list.length) : [];
  const bySource = new Map();
  for (const it of games) bySource.set(it.source, (bySource.get(it.source) || 0) + 1);
  const smart = smartList();
  const sig = JSON.stringify([recent.map((it) => [it.id, it.running, it.coverUrl, it.minutes]), games.length, apps.length, fav, backlog, hidden, uncat, folders.map((f) => [f.c.id, f.list.length, f.list.slice(0, 4).map((x) => x.coverUrl)]), [...bySource], smart.map((c) => c.id + c.name), S.libMode]);
  if (box.dataset.sig === sig) return;
  box.dataset.sig = sig;
  const mosaicUnused = (list) => { const covers = list.filter((it) => it.coverUrl).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (b.minutes || 0) - (a.minutes || 0)).slice(0, 4); return h('div', { class: 'coll-mosaic n' + Math.max(1, covers.length) }, covers.length ? covers.map((it) => h('img', { src: it.coverUrl, alt: '', loading: 'lazy', draggable: 'false' })) : h('div', { class: 'coll-empty' }, icon('sparkle'))); };
  keepFocus(box, () => fillEl(box,
    recent.length ? h('section', { class: 'hub-sec' }, h('h3', { class: 'section-title' }, 'Recently played'),
      h('div', { class: 'lib-recent' }, recent.map((it) => {
        const card = h('button', { class: 'lr-card' + (it.running ? ' running' : ''), 'data-k': `lr:${it.id}`, onclick: () => openDetails(it.id) },
          artFor(it),
          h('div', { class: 'lr-info' }, h('b', {}, displayName(it)), h('span', {}, it.running ? 'Playing now' : [groupMinutes(it) ? fmtHours(groupMinutes(it)) : null, timeAgo(it.lastPlayed)].filter(Boolean).join(' · '))));
        const playBtn = h('span', { class: 'lr-play', role: 'button', title: it.running ? 'Back to game' : 'Play', onclick: (e) => { e.stopPropagation(); if (it.running) api.focusGame(it.id); else launch(it.id); } }, icon('play'));
        card.append(playBtn);
        return card;
      }))) : null,
    h('section', { class: 'hub-sec' },
      h('div', { class: 'sec-head' }, h('h3', { class: 'section-title' }, 'Browse'),
        h('div', { class: 'seg' },
          h('button', { class: S.libMode === 'installed' ? 'on' : '', onclick: () => { S.libMode = 'installed'; prefs.set('libMode', 'installed'); render(); } }, 'Installed'),
          h('button', { class: S.libMode === 'all' ? 'on' : '', onclick: () => { S.libMode = 'all'; prefs.set('libMode', 'all'); render(); } }, 'All owned'))),
      h('div', { class: 'lib-tiles' },
        tile('l:games', 'gamepad', 'Games', `${games.length}`, () => setView({ type: 'games' }), 'big'),
        tile('l:apps', 'grid', 'Apps', `${apps.length}`, () => setView({ type: 'apps' })),
        tile('l:arcade', 'joystick', 'Arcade', `${ARCADE.length} mini games`, () => setView({ type: 'arcade' })),
        tile('l:backlog', 'list', 'Backlog', backlog ? `${backlog} waiting` : 'Plan what to play', () => setView({ type: 'backlog' })),
        tile('l:fav', 'star', 'Favorites', `${fav}`, () => setView({ type: 'favorites' })),
        tile('l:added', 'clock', 'Recently added', 'Newest first', () => setView({ type: 'added' })),
        tile('l:surprise', 'dice', 'Surprise me', 'Pick for me', () => setView({ type: 'surprise' }), 'accent'),
        tile('l:all', 'rows', 'Everything', `${vis.length} games and apps`, () => setView({ type: 'home' }))))));
}

// ---------- Deals & News: the news half ----------
async function appendDealNews(box) {
  const sec = h('section', { class: 'hub-sec deal-news' }, h('h3', { class: 'section-title', style: { marginTop: '28px' } }, 'News'), h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading news'));
  box.append(sec);
  const top = topPlayedSteam(3);
  const recentIds = S.lib.items.filter((it) => isGameItem(it) && it.lastPlayed && (it.source === 'steam' || it.steamAppId) && !top.includes(it)).sort((a, b) => b.lastPlayed - a.lastPlayed).slice(0, 5).map((it) => it.id);
  const [topNews, more] = await Promise.all([newsForTop(), recentIds.length ? api.news(recentIds).catch(() => []) : []]);
  if (!sec.isConnected) return;
  const seen = new Set((topNews || []).map((n) => n.url));
  const rest = (more || []).filter((n) => !seen.has(n.url));
  fillEl(sec,
    h('h3', { class: 'section-title', style: { marginTop: '28px' } }, top.length ? `From your most played: ${top.map(displayName).join(', ')}` : 'News'),
    topNews && topNews.length ? h('div', { class: 'hub-news' }, topNews.slice(0, 6).map(newsTile)) : h('div', { class: 'help' }, 'Play a few Steam games and their news shows up here.'),
    rest.length ? [h('h3', { class: 'section-title', style: { marginTop: '22px' } }, 'More news'), h('div', { class: 'news-list' }, rest.slice(0, 9).map(newsCard))] : null);
}

// ---------- Social tabs ----------
function socialTabs() {
  const discord = S.lib.settings.discordTab !== false;
  const cur = S.view.type;
  return h('div', { class: 'social-bar' },
    h('div', { class: 'seg' },
      h('button', { class: cur === 'friends' ? 'on' : '', onclick: () => setView({ type: 'friends' }) }, icon('users'), ' Friends'),
      discord ? h('button', { class: cur === 'discord' ? 'on' : '', onclick: () => setView({ type: 'discord' }) }, icon('chat'), ' Discord') : null),
    h('span', { style: { flex: 1 } }),
    h('label', { class: 'mini-toggle', title: 'A pop up when a friend starts playing a game you own' },
      h('input', { type: 'checkbox', checked: prefs.get('friendAlerts', true), onchange: (e) => prefs.set('friendAlerts', e.target.checked) }), 'Friend alerts'),
    h('label', { class: 'mini-toggle', title: 'Shows the game you are playing on your Discord profile' },
      h('input', { type: 'checkbox', checked: S.lib.settings.discordPresence !== false, onchange: (e) => api.updateSettings({ discordPresence: e.target.checked }) }), 'Discord status'));
}

// ---------- Back ----------
const NAV_BACK = [];
function pushHistory(from, to) {
  if (!from || JSON.stringify(from) === JSON.stringify(to)) return;
  NAV_BACK.push(from);
  if (NAV_BACK.length > 30) NAV_BACK.shift();
}
function goBack() {
  const v = NAV_BACK.pop();
  if (v) { setView(v, true); return true; }
  if (S.view.type !== 'hub') { setView({ type: 'hub' }, true); return true; }
  return false;
}

// ---------- wiring ----------
setInterval(() => { const c = document.getElementById('hubClock'); if (c) c.textContent = clockText(); }, 15000);
window.addEventListener('mouseup', (e) => { if (e.button === 3) { e.preventDefault(); if (!S.modals.length) goBack(); } });
