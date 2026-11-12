/* global api, S, $, h, icon, prefs, fillEl, openMenu, openModal, showToast, setView, timeAgo, norm, displayName, fmtHours,
   openDetails, launch, renameItem, undoable, focusedCardId, goBack, openSettings, catPath, descendants, openStore, SOURCES,
   openFriendProfile, friendKey, avatarFor, historyOf, gameFromActivity, artFor, notInstalled, renderFriendsPage, keepFocus,
   openAnimeDetails, loadAnime, animeIn, untilText, MAIN_PAGES, isGrouped, confirmBox, toggleRow, fmtBytes */
// 0.17.0: a hundred smaller improvements across the app. Each block says what it adds.
// Wrappers run once every script has loaded, so they always wrap the final version of a function.

const PLUS = {};

// ---------- small helpers ----------
const copyText = (t, label) => navigator.clipboard.writeText(String(t)).then(() => showToast(label || `Copied ${t}`)).catch(() => showToast('Could not copy', 'error'));
const isTyping = () => { const el = document.activeElement; return !!el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable); };
const PAGE_KEYS = [['hub', 'Home'], ['library', 'Library'], ['deals', 'Deals & News'], ['stats', 'Statistics'], ['friends', 'Social'], ['anime', 'Anime'], ['arcade', 'Arcade'], ['surprise', 'Surprise me'], ['remoteplay', 'Xbox Remote Play']];

document.addEventListener('DOMContentLoaded', () => {
  // ===== Library: more in the right click menu =====
  // Copy name, copy folder path, reset a renamed game, find guides, the Steam store page.
  const baseItemMenu = window.itemMenu;
  window.itemMenu = (id, pos) => {
    const it = S.byId.get(id);
    if (!it) return baseItemMenu(id, pos);
    baseItemMenu(id, pos);
    const menu = document.querySelector('#menuRoot .menu');
    if (!menu) return;
    // A game that is already running: the first item brings it back instead of starting it again.
    if (it.running && api.focusGame) {
      const first = menu.querySelector('.menu-item');
      if (first) { const b = h('button', { class: 'menu-item', onclick: () => { menu.remove(); api.focusGame(id).then((r) => { if (!r || !r.ok) launch(id); }); } }, 'Back to game'); first.replaceWith(b); }
    }
    const extra = [
      { label: 'Copy name', run: () => copyText(displayName(it)) },
      it.installDir ? { label: 'Copy folder path', run: () => copyText(it.installDir, 'Folder path copied') } : null,
      it.customName ? { label: `Reset name to "${it.name}"`, run: () => { api.updateItem(id, { customName: null }); showToast(`Back to ${it.name}`); } } : null,
      it.kind === 'game' ? { label: 'Find guides online', run: () => api.openExternal(`https://duckduckgo.com/?q=${encodeURIComponent(`${displayName(it)} guide`)}`) } : null,
      it.steamAppId ? { label: 'Steam store page', run: () => openStore(`https://store.steampowered.com/app/${it.steamAppId}`, 'steam', it.steamAppId) } : null,
    ].filter(Boolean);
    const sep = menu.querySelector('.sep');
    const mk = (i) => { const b = h('button', { class: 'menu-item', onclick: () => { document.querySelector('#menuRoot .menu')?.remove(); i.run(); } }, i.label); return b; };
    const frag = [h('div', { class: 'sep' }), ...extra.map(mk)];
    if (sep) sep.before(...frag); else menu.append(...frag);
    // Keep it on screen after growing.
    const r = menu.getBoundingClientRect();
    if (r.bottom > innerHeight - 8) menu.style.top = `${Math.max(8, innerHeight - r.height - 8)}px`;
  };

  // ===== Categories: play something random from a category =====
  const baseCatMenu = window.categoryMenu;
  window.categoryMenu = (id, pos) => {
    baseCatMenu(id, pos);
    const menu = document.querySelector('#menuRoot .menu');
    const c = S.cats.get(id);
    if (!menu || !c) return;
    const ids = new Set([id, ...(typeof descendants === 'function' ? descendants(id) : [])]);
    const games = S.lib.items.filter((it) => ids.has(it.categoryId) && !it.hidden && (it.installed || it.manual));
    const b = h('button', { class: 'menu-item', disabled: !games.length, onclick: () => { menu.remove(); const g = games[Math.floor(Math.random() * games.length)]; showToast(`Launching ${displayName(g)}`); launch(g.id); } }, `Play something random (${games.length})`);
    menu.prepend(b, h('div', { class: 'sep' }));
  };

  // ===== Toasts: hover keeps them, and they can be clicked =====
  const baseToast = window.showToast;
  window.showToast = (text, kind = 'info', onClick) => {
    baseToast(text, kind);
    const t = [...document.querySelectorAll('#toasts .toast')].reverse().find((x) => x.dataset.text === text);
    if (!t || t.dataset.plus) return;
    t.dataset.plus = '1';
    const restart = () => { clearTimeout(t._t); t._t = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 2200); };
    t.addEventListener('mouseenter', () => clearTimeout(t._t));
    t.addEventListener('mouseleave', restart);
    if (onClick) { t.classList.add('clickable'); t.addEventListener('click', () => { t.remove(); onClick(); }); }
  };

  // ===== Details: more stats, achievement filters, next and previous game =====
  const baseDetails = window.openDetails;
  window.openDetails = (id) => {
    baseDetails(id);
    const it = S.byId.get(id);
    const panel = document.querySelector('.details-modal');
    if (!it || !panel) return;
    PLUS.detailsId = id;
    const statsRow = panel.querySelector('.det-stats');
    // Where this game ranks among your most played.
    if (it.kind === 'game' && it.minutes) {
      const rank = S.lib.items.filter((x) => x.kind === 'game' && !x.hidden && (x.minutes || 0) > it.minutes).length + 1;
      const kicker = panel.querySelector('.det-kicker');
      if (kicker && rank <= 25) kicker.append(` · your #${rank} most played`);
    }
    // Sessions Crimson Vault saw: how many, the longest, and this week.
    api.sessions().then((list) => {
      const mine = (list || []).filter((x) => x.id === id);
      if (!mine.length || !statsRow || !statsRow.isConnected) return;
      const longest = Math.max(...mine.map((x) => x.e - x.s)) / 60000;
      const week = mine.filter((x) => x.e > Date.now() - 7 * 86400000).reduce((a, x) => a + (x.e - Math.max(x.s, Date.now() - 7 * 86400000)), 0) / 60000;
      const stat = (label, v) => h('div', { class: 'stat' }, h('div', { class: 'stat-v' }, v), h('div', { class: 'stat-l' }, label));
      statsRow.append(stat('Sessions', String(mine.length)), stat('Longest session', fmtHours(longest) || `${Math.round(longest)} min`), week >= 1 ? stat('This week', fmtHours(week) || `${Math.round(week)} min`) : null);
      if (mine.some((x) => x.console)) statsRow.append(stat('On Xbox', fmtHours(mine.filter((x) => x.console).reduce((a, x) => a + (x.e - x.s), 0) / 60000) || 'under an hour'));
    }).catch(() => {});
    // Achievement filter: all, unlocked, locked; newest unlocks first.
    const achBox = panel.querySelector('.ach');
    if (achBox) {
      const addFilter = () => {
        const list = achBox.querySelector('.ach-list');
        if (!list || achBox.querySelector('.ach-filter')) return;
        const rows = [...list.children];
        const draw = (mode) => {
          for (const r of rows) r.hidden = mode === 'got' ? !r.classList.contains('got') : mode === 'locked' ? r.classList.contains('got') : false;
          const sorted = mode === 'got' ? rows.slice().sort((a, b) => (Date.parse(b.querySelector('.ach-when').textContent) || 0) - (Date.parse(a.querySelector('.ach-when').textContent) || 0)) : rows;
          list.append(...sorted);
          seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
        };
        const got = rows.filter((r) => r.classList.contains('got')).length;
        const seg = h('div', { class: 'seg ach-filter' }, [['all', `All ${rows.length}`], ['got', `Unlocked ${got}`], ['locked', `Locked ${rows.length - got}`]].map(([m, n]) => h('button', { 'data-m': m, onclick: () => draw(m) }, n)));
        list.before(seg);
        draw('all');
      };
      new MutationObserver((_, ob) => { if (achBox.querySelector('.ach-list')) { addFilter(); ob.disconnect(); } }).observe(achBox, { childList: true });
    }
    // How play time is counted for this game (some games leave programs running in the background).
    const top = panel.querySelector('.det-info');
    if (top && it.kind === 'game' && it.installed) {
      const cur = (it.meta && it.meta.countMode) || 'auto';
      const seg = h('div', { class: 'seg det-count' }, [['auto', 'Automatic'], ['window', 'Only with its window open'], ['any', 'Any of its programs']].map(([k, n]) => h('button', { class: cur === k ? 'on' : '', onclick: (ev) => { api.updateItem(id, { countMode: k }); seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === ev.currentTarget)); showToast(k === 'any' ? 'Counts whenever any of its programs runs' : k === 'window' ? 'Counts only while its window is open' : 'Automatic: counts while its window is open'); } }, n)));
      top.append(h('div', { class: 'det-countrow' }, h('span', { class: 'help' }, 'Counts as playing:'), seg));
    }
    // Hint for the next and previous keys.
    if (top) top.append(h('div', { class: 'det-keys help' }, '[ and ] for the previous and next game · Enter to play'));
  };
  // [ and ] move to the previous and next game in the grid; Enter plays.
  document.addEventListener('keydown', (e) => {
    const panel = document.querySelector('.details-modal');
    if (!panel || isTyping() || e.ctrlKey || e.altKey) return;
    if (e.key === '[' || e.key === ']') {
      const ids = [...document.querySelectorAll('#grid .card')].map((c) => c.dataset.id);
      const i = ids.indexOf(PLUS.detailsId);
      if (i < 0 || ids.length < 2) return;
      e.preventDefault();
      const next = ids[(i + (e.key === ']' ? 1 : -1) + ids.length) % ids.length];
      const close = S.modals[S.modals.length - 1];
      if (close) close();
      setTimeout(() => window.openDetails(next), 20);
    } else if (e.key === 'Enter' && document.activeElement && !document.activeElement.closest('button, a, input')) {
      e.preventDefault();
      const close = S.modals[S.modals.length - 1]; if (close) close();
      launch(PLUS.detailsId);
    }
  });

  // ===== Cards: a tooltip with hours and when you last played =====
  document.addEventListener('mouseover', (e) => {
    const card = e.target.closest && e.target.closest('.card[data-id]');
    if (!card || card.dataset.tip === String(S.lib.items.length)) return;
    const it = S.byId.get(card.dataset.id);
    if (!it) return;
    card.title = [displayName(it), it.minutes ? `${fmtHours(it.minutes)} played` : 'Not played yet', it.lastPlayed ? `last played ${timeAgo(it.lastPlayed).toLowerCase()}` : null, notInstalled(it) ? 'not installed' : null].filter(Boolean).join(' · ');
    card.dataset.tip = String(S.lib.items.length);
  });
  // Middle click on a card plays it.
  document.addEventListener('auxclick', (e) => {
    const card = e.button === 1 && e.target.closest && e.target.closest('.card[data-id]');
    if (card) { e.preventDefault(); launch(card.dataset.id); }
  });

  // ===== Keyboard shortcuts =====
  document.addEventListener('keydown', (e) => {
    if (S.modals.length || isTyping() || document.querySelector('.game, .spin, .palette')) return;
    const id = typeof focusedCardId === 'function' ? focusedCardId() : null;
    // F2 renames, Delete hides, Ctrl+D favorites the focused card.
    if (id && e.key === 'F2') { e.preventDefault(); renameItem(id); return; }
    if (id && e.key === 'Delete') { e.preventDefault(); const it = S.byId.get(id); undoable(id, { hidden: true }, `${displayName(it)} hidden`); return; }
    if (id && e.ctrlKey && e.key.toLowerCase() === 'd') { e.preventDefault(); const it = S.byId.get(id); undoable(id, { favorite: !it.favorite }, it.favorite ? 'Removed from favorites' : 'Added to favorites'); return; }
    // Ctrl+1 to Ctrl+9 jump to the main pages.
    if (e.ctrlKey && !e.shiftKey && /^[1-9]$/.test(e.key)) { const p = PAGE_KEYS[Number(e.key) - 1]; if (p) { e.preventDefault(); setView({ type: p[0] }); } return; }
    // Ctrl+, opens Settings.
    if (e.ctrlKey && e.key === ',') { e.preventDefault(); openSettings(); return; }
    // Alt+Left goes back.
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); goBack(); return; }
    // ? shows every shortcut.
    if (e.key === '?') { e.preventDefault(); shortcutSheet(); }
  });
  // The mouse's back button goes back too.
  window.addEventListener('mouseup', (e) => { if (e.button === 3 && !S.modals.length) { e.preventDefault(); goBack(); } });
  // Ctrl and + / - / 0 zoom the whole app, and it is remembered.
  const applyZoom = (z) => { z = Math.max(0.6, Math.min(1.6, Math.round(z * 10) / 10)); prefs.set('uiZoom', z); if (api.setZoom) api.setZoom(z); return z; };
  if (api.setZoom && prefs.get('uiZoom', 1) !== 1) api.setZoom(prefs.get('uiZoom', 1));
  document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey || e.altKey) return;
    if (e.key === '=' || e.key === '+') { e.preventDefault(); showToast(`Zoom ${Math.round(applyZoom(prefs.get('uiZoom', 1) + 0.1) * 100)}%`); }
    else if (e.key === '-') { e.preventDefault(); showToast(`Zoom ${Math.round(applyZoom(prefs.get('uiZoom', 1) - 0.1) * 100)}%`); }
    else if (e.key === '0') { e.preventDefault(); applyZoom(1); showToast('Zoom 100%'); }
  });

  // ===== The window title follows the page =====
  const baseSetView = window.setView;
  window.setView = (v, ...rest) => {
    const r = baseSetView(v, ...rest);
    try { document.title = `${typeof viewTitle === 'function' ? viewTitle() : ''} · Crimson Vault`.replace(/^ · /, ''); } catch {}
    return r;
  };

  // ===== Home: today's play time, a clock you can switch, favorites first =====
  const baseHub = window.renderHub;
  window.renderHub = (...a) => {
    const r = baseHub(...a);
    const head = document.querySelector('#hubView .hub-greet, #hubView .hub-top');
    const clock = document.getElementById('hubClock');
    if (clock && !clock.dataset.plus) {
      clock.dataset.plus = '1';
      clock.title = 'Click to switch 12 and 24 hour time';
      clock.style.cursor = 'pointer';
      clock.addEventListener('click', () => { prefs.set('clock24', !prefs.get('clock24', false)); clock.textContent = plusClock(); });
      clock.textContent = plusClock();
    }
    if (head && !head.querySelector('.hub-today')) {
      api.sessions().then((list) => {
        const from = new Date(); from.setHours(0, 0, 0, 0);
        const m = (list || []).filter((x) => x.e > from.getTime()).reduce((a, x) => a + (x.e - Math.max(x.s, from.getTime())), 0) / 60000;
        const sub = document.querySelector('#hubView .hub-date, #hubView .hub-sub');
        if (m >= 1 && sub && !sub.querySelector('.hub-today')) sub.append(h('span', { class: 'hub-today' }, ` · ${fmtHours(m) || `${Math.round(m)} min`} played today`));
      }).catch(() => {});
    }
    return r;
  };
  setInterval(() => { const c = document.getElementById('hubClock'); if (c && c.dataset.plus) c.textContent = plusClock(); }, 15000);

  // ===== Friends on Home: favorites first, and how many more are online =====
  const baseSide = window.hubSide;
  if (baseSide) window.hubSide = (online, playing) => {
    const favs = new Set(prefs.get('favFriends', []));
    const byFav = (a, b) => (favs.has(friendKey(b)) - favs.has(friendKey(a)));
    const el = baseSide(online.slice().sort(byFav), playing.slice().sort(byFav));
    const total = new Set([...playing, ...online]).size;
    const head = el.querySelector('.hub-friends .count');
    if (head && total > 5) head.textContent = `${online.length} online · ${total - 5} more`;
    return el;
  };

  // ===== Palette (Ctrl+K): your anime and every Settings section too =====
  window.plusPalActions = () => [
    { label: 'Keyboard shortcuts', hint: '?', ic: 'keyboard', run: () => shortcutSheet() },
    ...['Connections', 'Look', 'App', 'Alerts', 'Phone remote', 'Quality of life', 'Health'].map((sec) => ({ label: `Settings: ${sec}`, hint: 'Settings', ic: 'gear', run: () => { openSettings(); setTimeout(() => { const l = [...document.querySelectorAll('#settingsView .section-label')].find((x) => x.textContent.trim().toLowerCase() === sec.toLowerCase()); if (l) l.scrollIntoView({ block: 'start' }); }, 120); } })),
    ...((S.anime && S.anime.entries) || []).filter((e) => e.status === 'CURRENT' || e.status === 'PLANNING').slice(0, 60).map((e) => ({ label: e.title, hint: `Anime · ${e.status === 'CURRENT' ? 'Watching' : 'Planned'}`, ic: 'tv', run: () => openAnimeDetails(e) })),
  ];

  // ===== News: read posts dim, and the header counts the unread =====
  const read = () => new Set(prefs.get('newsRead', []));
  const baseNewsCard = window.newsCard;
  window.newsCard = (n) => {
    const el = baseNewsCard(n);
    if (read().has(n.url)) el.classList.add('read');
    return el;
  };
  const baseOpenNews = window.openNews;
  window.openNews = (n) => {
    const r = read(); r.add(n.url); prefs.set('newsRead', [...r].slice(-400));
    document.querySelectorAll('.news-card').forEach((c) => { if (c.querySelector('.news-title') && c.querySelector('.news-title').textContent === n.title) c.classList.add('read'); });
    return baseOpenNews(n);
  };

  // ===== Free games: mark one as claimed so it stops showing =====
  const baseFree = window.freeCard;
  window.freeCard = (f) => {
    const claimed = new Set(prefs.get('freeClaimed', []));
    const el = baseFree(f);
    if (claimed.has(f.url)) { el.hidden = true; return el; }
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openMenu([
        { label: 'Open store page', run: () => openStore(f.url, f.store) },
        { label: 'I claimed it, hide it', run: () => { const c = new Set(prefs.get('freeClaimed', [])); c.add(f.url); prefs.set('freeClaimed', [...c].slice(-300)); el.hidden = true; showToast(`${f.title} hidden`); } },
        { label: 'Copy link', run: () => copyText(f.url, 'Link copied') },
      ], { x: e.clientX, y: e.clientY });
    });
    el.title = `${f.title} · right click to mark as claimed`;
    return el;
  };
  // Wishlist deals: right click to copy the link or open in the browser.
  document.addEventListener('contextmenu', (e) => {
    const w = e.target.closest && e.target.closest('.wish');
    if (!w) return;
    e.preventDefault();
    const name = w.querySelector('.wish-name, .wish-title, b');
    openMenu([
      { label: 'Open', run: () => w.click() },
      { label: 'Search price history', run: () => api.openExternal(`https://isthereanydeal.com/search/?q=${encodeURIComponent(name ? name.textContent : '')}`) },
    ], { x: e.clientX, y: e.clientY });
  });

  // ===== Statistics: streak, longest session, platforms, Xbox and anime, export =====
  const baseStats = window.renderStats;
  window.renderStats = async (...a) => {
    await baseStats(...a);
    const box = $('#statsView');
    if (!box || box.querySelector('.st-plus')) return;
    const sessions = (await api.sessions().catch(() => [])) || [];
    const DAY = 86400000;
    const dayOf = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
    const days = new Set(sessions.map((x) => dayOf(x.s)));
    let streak = 0;
    for (let d = dayOf(Date.now()); days.has(d) || (streak === 0 && d === dayOf(Date.now())); d -= DAY) { if (days.has(d)) streak++; else if (streak === 0) continue; else break; if (streak > 3650) break; }
    let best = 0, run = 0, prev = 0;
    for (const d of [...days].sort((x, y) => x - y)) { run = prev && d - prev <= DAY * 1.5 ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    const longest = sessions.reduce((m, x) => (x.e - x.s > m.e - m.s ? x : m), { s: 0, e: 0 });
    const lg = longest.e ? S.byId.get(longest.id) : null;
    const consoleMin = sessions.filter((x) => x.console).reduce((t, x) => t + (x.e - x.s), 0) / 60000;
    const animeMin = ((S.anime && S.anime.entries) || []).reduce((t, e) => t + ((e.progress || 0) + (e.repeat || 0) * (e.episodes || 0)) * (e.duration || 24), 0);
    const tile = (label, value, sub, go) => h(go ? 'button' : 'div', { class: 'st-tile', onclick: go || null }, h('div', { class: 'st-v' }, value), h('div', { class: 'st-l' }, label), sub ? h('div', { class: 'st-s' }, sub) : null);
    const exportBtn = h('button', { class: 'btn', onclick: () => exportSessions(sessions) }, icon('download'), 'Export play history');
    box.append(h('div', { class: 'st-plus' },
      h('div', { class: 'st-tiles' },
        tile('Play streak', `${streak} ${streak === 1 ? 'day' : 'days'}`, best > 1 ? `best ${best} days in a row` : 'days in a row with play'),
        tile('Longest session', longest.e ? fmtHours((longest.e - longest.s) / 60000) || `${Math.round((longest.e - longest.s) / 60000)} min` : '-', lg ? `${displayName(lg)} · ${new Date(longest.s).toLocaleDateString()}` : 'tracked from now on', lg ? () => openDetails(lg.id) : null),
        consoleMin >= 1 ? tile('On Xbox', fmtHours(consoleMin) || `${Math.round(consoleMin)} min`, 'console and remote play', () => setView({ type: 'remoteplay' })) : null,
        animeMin ? tile('Anime watched', `${Math.round(animeMin / 60).toLocaleString()} hrs`, `${animeIn('completed').length} shows completed`, () => setView({ type: 'anime' })) : null),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '6px' } }, exportBtn)));
  };

  // ===== Friends: sort, last seen, collapsible offline, Steam messages, games in common =====
  const baseFriends = window.renderFriendsPage;
  window.renderFriendsPage = (force) => {
    baseFriends(force);
    const box = $('#friendsView');
    if (!box || box.querySelector('.fr-sortbar') || !S.friends.configured) return;
    const tools = box.querySelector('.fr-tools');
    if (tools) {
      const sort = prefs.get('friendSort', 'name');
      tools.append(h('div', { class: 'seg fr-sortbar' }, [['name', 'A to Z'], ['recent', 'Just started']].map(([k, n]) => h('button', { class: sort === k ? 'on' : '', onclick: () => { prefs.set('friendSort', k); renderFriendsPage(true); } }, n))));
      if (sort === 'recent') for (const grid of box.querySelectorAll('.friends-grid2')) {
        const cards = [...grid.children];
        const since = (c) => { const p = (S.friends.people || []).find((x) => x.name === (c.querySelector('.fc-name span') || {}).textContent); return p && typeof friendSince === 'function' ? friendSince(p) : 0; };
        cards.sort((a, b) => since(b) - since(a)).forEach((c) => grid.append(c));
      }
    }
    // Offline friends fold away (remembered).
    const offTitle = [...box.querySelectorAll('.section-title')].find((t) => /^Offline/.test(t.textContent));
    if (offTitle) {
      const grid = offTitle.nextElementSibling;
      const folded = prefs.get('friendsOfflineFolded', false);
      if (grid) grid.hidden = folded;
      offTitle.classList.add('foldable');
      offTitle.prepend(h('span', { class: 'fold-ic' + (folded ? '' : ' open') }, icon('chevronRight')));
      offTitle.addEventListener('click', () => { prefs.set('friendsOfflineFolded', !prefs.get('friendsOfflineFolded', false)); renderFriendsPage(true); });
      // What offline friends were last seen playing.
      if (grid) for (const card of grid.querySelectorAll('.fcard')) {
        const name = (card.querySelector('.fc-name span') || {}).textContent;
        const p = (S.friends.people || []).find((x) => x.name === name);
        const last = p && historyOf(p)[0];
        const st = card.querySelector('.fc-text');
        if (last && st && /offline/i.test(st.textContent)) st.textContent = `Played ${last.game} ${timeAgo(last.last || last.at).toLowerCase()}`;
      }
    }
  };
  const baseProfile = window.openFriendProfile;
  window.openFriendProfile = (p) => {
    baseProfile(p);
    const body = document.querySelector('.fp-modal .fp');
    if (!body) return;
    // Message a Steam friend straight from here.
    const steam = (p.accounts || []).find((a) => a.platform === 'steam' && /^steam:\d+$/.test(a.key));
    const accs = body.querySelector('.fp-accs');
    if (steam && accs) accs.append(h('button', { class: 'btn', onclick: () => api.openUrl(`steam://friends/message/${steam.key.split(':')[1]}`) }, icon('chat'), 'Message on Steam'));
    // Games you both have, with covers.
    const seen = [...new Map(historyOf(p).map((x) => [norm(x.game), gameFromActivity(x.game)]).filter(([, it]) => it)).values()];
    if (seen.length) {
      const help = [...body.querySelectorAll('.help')].find((x) => /You both have/.test(x.textContent));
      const row = h('div', { class: 'fp-common' }, seen.slice(0, 8).map((it) => h('button', { class: 'fp-common-it', title: displayName(it), onclick: () => { const c = S.modals[S.modals.length - 1]; if (c) c(); setTimeout(() => openDetails(it.id), 30); } }, artFor(it))));
      if (help) help.replaceWith(h('h3', { class: 'section-title' }, `Games you both have · ${seen.length}`), row);
      else body.append(h('h3', { class: 'section-title' }, `Games you both have · ${seen.length}`), row);
    }
  };

  // ===== Guide: your next anime episode on the guide's home tab =====
  const baseGuideHome = window.guideHome;
  if (baseGuideHome) window.guideHome = (...a) => {
    const el = baseGuideHome(...a);
    const w = S.anime && S.anime.configured ? animeIn('watching').filter((e) => e.next && e.next.at > Date.now()).sort((x, y) => x.next.at - y.next.at)[0] : null;
    const row = w ? h('button', { class: 'gd-row gd-anime', onclick: () => { if (typeof closeGuide === 'function') closeGuide(); setView({ type: 'anime' }); setTimeout(() => openAnimeDetails(w), 80); } }, icon('tv'), h('span', {}, h('b', {}, w.title), h('small', {}, `Episode ${w.next.episode} in ${untilText(w.next.at)}`))) : null;
    if (row && Array.isArray(el)) el.splice(el.length - 1, 0, h('div', { class: 'gd-sec', style: '--d:1' }, h('div', { class: 'gd-label' }, 'Next episode'), row));
    return el;
  };

  // ===== App commands from the tray and alerts =====
  if (api.onCommand) api.onCommand((c) => { if (c === 'anime') setView({ type: 'anime' }); });

  // ===== Settings: back up and restore, highlight matches, remember the section =====
  const baseSettingsPage = window.showSettingsPage;
  window.showSettingsPage = (o) => {
    baseSettingsPage(o);
    const box = $('#settingsView');
    const search = box && box.querySelector('.set-search');
    if (search && !search.dataset.plus) {
      search.dataset.plus = '1';
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        box.querySelectorAll('.field label, .field .toggle-row b, .field .tr-text b').forEach((el) => el.classList.toggle('set-hit', !!q && el.textContent.toLowerCase().includes(q)));
      });
    }
    // Back to the section you were reading last time.
    const last = prefs.get('settingsSection', '');
    if (last) setTimeout(() => { const l = [...box.querySelectorAll('.section-label')].find((x) => x.textContent === last); if (l && S.view.type === 'settings') l.scrollIntoView({ block: 'start' }); }, 60);
    const content = $('#content');
    const remember = () => { if (S.view.type !== 'settings') return; const on = box.querySelector('.set-nav-btn.on span'); if (on) prefs.set('settingsSection', on.textContent); };
    content.removeEventListener('scroll', PLUS.rememberSec || (() => {}));
    PLUS.rememberSec = remember;
    content.addEventListener('scroll', remember, { passive: true });
  };

  // ===== Reduce motion (Settings, Look) =====
  document.body.classList.toggle('calm', prefs.get('reduceMotion', false));

  // ===== What's new, once after each update =====
  setTimeout(() => {
    const v = S.version;
    if (!v) return;
    const seen = prefs.get('seenVersion', '');
    if (seen && seen !== v && WHATS_NEW[v]) whatsNew(v);
    prefs.set('seenVersion', v);
  }, 2500);
});

// ---------- the clock ----------
function plusClock() { return new Date().toLocaleTimeString([], prefs.get('clock24', false) ? { hour: '2-digit', minute: '2-digit', hour12: false } : { hour: 'numeric', minute: '2-digit' }); }

// ---------- keyboard shortcut sheet ----------
function shortcutSheet() {
  const rows = [
    ['Everywhere', [['Ctrl+K', 'find anything'], ['Ctrl+F or /', 'search'], ['G', 'open the guide'], ['Ctrl+Alt+G', 'the guide from anywhere, even minimized'], ['Ctrl+1 to 9', 'Home, Library, Deals, Stats, Social, Anime, Arcade, Surprise me, Remote Play'], ['Ctrl+,', 'Settings'], ['Alt+Left or mouse back', 'go back'], ['Ctrl + / - / 0', 'zoom in, out, reset'], ['F11', 'full screen'], ['F5', 'scan launchers'], ['Ctrl+Z', 'undo the last change'], ['?', 'this list']]],
    ['A game card', [['Enter', 'details'], ['Middle click', 'play'], ['F2', 'rename'], ['Ctrl+D', 'favorite'], ['Delete', 'hide (with undo)'], ['Shift or Ctrl click', 'select several']]],
    ['Game details', [['Enter', 'play'], ['[ and ]', 'previous and next game'], ['Esc', 'close']]],
    ['Anime', [['/', 'search'], ['+ and -', 'one episode more or less (signed in)'], ['W', 'watch on your first site']]],
    ['Arcade', [['Esc or P', 'pause'], ['Switching windows', 'pauses the game']]],
  ];
  openModal({
    title: 'Keyboard shortcuts',
    cls: 'keys-modal',
    body: h('div', { class: 'keys-grid' }, rows.map(([title, list]) => h('div', { class: 'keys-sec' }, h('h3', { class: 'section-title' }, title), list.map(([k, d]) => h('div', { class: 'keys-row' }, h('span', { class: 'keys-k' }, k.split(' or ').map((x, i) => [i ? ' or ' : '', h('kbd', {}, x)]).flat()), h('span', {}, d)))))),
    actions: [{ label: 'Close', primary: true }],
  });
}

// ---------- play history as a spreadsheet file ----------
function exportSessions(sessions) {
  const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Game', 'Started', 'Ended', 'Minutes', 'Where'].map(esc).join(',')];
  for (const x of sessions.slice().sort((a, b) => a.s - b.s)) {
    const it = S.byId.get(x.id);
    rows.push([it ? displayName(it) : x.id, new Date(x.s).toLocaleString(), new Date(x.e).toLocaleString(), Math.round((x.e - x.s) / 60000), x.console ? 'Xbox' : 'PC'].map(esc).join(','));
  }
  const blob = new Blob([`﻿${rows.join('\r\n')}`], { type: 'text/csv' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `crimson-vault-play-history-${new Date().toISOString().slice(0, 10)}.csv` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showToast(`Exported ${sessions.length} sessions`);
}

// ---------- back up and restore your settings ----------
async function exportBackup() {
  const local = {};
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); local[k] = localStorage.getItem(k); }
  const data = { app: 'Crimson Vault', version: S.version, at: new Date().toISOString(), settings: await api.backupSettings(), prefs: local };
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `crimson-vault-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  showToast('Backup saved (no passwords or sign ins are in it)');
}
function importBackup() {
  const input = h('input', { type: 'file', accept: '.json,application/json' });
  input.addEventListener('change', async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { showToast('That file is not a Crimson Vault backup', 'error'); return; }
    if (!data || data.app !== 'Crimson Vault') { showToast('That file is not a Crimson Vault backup', 'error'); return; }
    if (!(await confirmBox('Restore this backup?', `From ${new Date(data.at).toLocaleString()}. Your settings and page preferences are replaced. Your library and sign ins are not touched.`, 'Restore'))) return;
    if (data.prefs) for (const [k, v] of Object.entries(data.prefs)) { try { localStorage.setItem(k, v); } catch {} }
    if (data.settings) await api.restoreSettings(data.settings);
    showToast('Restored. Reloading…');
    setTimeout(() => location.reload(), 900);
  });
  input.click();
}

// ---------- what's new ----------
const WHATS_NEW = {
  '0.18.4': ['Lyrics are now opt in: off by default, and the app explains where they come from (LRCLIB) before turning them on', 'Keys, tokens and sign ins in library.json are now encrypted with your Windows account', 'The app exe is hardened: no code injection through Node flags, cookies encrypted, app only loads its own code', 'New PRIVACY.md and TERMS.md explain exactly what the app reads, stores and sends', 'The project is now MIT licensed'],
  '0.18.3': ['The guide opens from your controller anywhere: the Xbox button, or View + Menu together', 'The controller works in the guide overlay even without focus', 'Fixed the guide overlay closing the instant it opened', 'Open the guide from the tray icon too', 'A warning if another app already owns the guide shortcut'],
  '0.18.2': ['The guide has a Sound tab: every Sonar channel, mute, chat mix and Classic or Streamer mode', 'Ctrl+Alt+G opens the guide over anything, even with Crimson Vault minimized or in the tray (change it in Settings)'],
  '0.17.0': ['Watch sites for anime: your own list of sites, exact pages when AniList knows them, searches otherwise', 'Keyboard shortcuts everywhere (press ? to see them)', 'Zoom with Ctrl and + or -', 'Statistics: play streak, longest session, Xbox and anime hours, export to a spreadsheet', 'Friends: sort by who just started, Steam messages, games you both have', 'Arcade: auto pause, hints, Vault Words hard mode and Copy result', 'Back up and restore your settings', 'And dozens of smaller fixes and touches'],
};
function whatsNew(v) {
  openModal({
    title: `What's new in ${v}`,
    body: h('ul', { class: 'whats-new' }, WHATS_NEW[v].map((t) => h('li', {}, t))),
    actions: [{ label: 'Full list', left: true, run: () => { api.openExternal('https://github.com/Cade4537/library-app#whats-new'); return false; } }, { label: 'Nice', primary: true }],
  });
}

// ---------- extra Settings rows (added to Settings, App) ----------
function plusSettings() {
  return [
    h('div', { class: 'field' }, toggleRow('Reduce animations', 'Fewer moving effects across the app', prefs.get('reduceMotion', false), (v) => { prefs.set('reduceMotion', v); document.body.classList.toggle('calm', v); })),
    h('div', { class: 'field' }, toggleRow('Pause arcade games when you switch windows', 'So the clock and the action wait for you', prefs.get('arcadeAutoPause', true), (v) => prefs.set('arcadeAutoPause', v))),
    h('div', { class: 'field' }, h('label', {}, 'Zoom'), h('div', { class: 'row' }, [0.8, 0.9, 1, 1.1, 1.25].map((z) => h('button', { class: 'chip' + (prefs.get('uiZoom', 1) === z ? ' on' : ''), onclick: (e) => { prefs.set('uiZoom', z); if (api.setZoom) api.setZoom(z); e.currentTarget.parentNode.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.currentTarget.classList.add('on'); } }, `${Math.round(z * 100)}%`))), h('div', { class: 'help' }, 'Ctrl and + or - also zoom, Ctrl+0 resets.')),
    h('div', { class: 'field' }, h('label', {}, 'Backup'), h('div', { class: 'row', style: { gap: '8px' } }, h('button', { class: 'btn', onclick: exportBackup }, icon('download'), 'Back up settings'), h('button', { class: 'btn', onclick: importBackup }, icon('refresh'), 'Restore a backup')), h('div', { class: 'help' }, 'Saves your settings and page preferences to a file. Passwords, keys and sign ins are never included.')),
    h('div', { class: 'field' }, h('label', {}, 'Keyboard'), h('button', { class: 'btn', onclick: shortcutSheet }, icon('keyboard'), 'Keyboard shortcuts')),
  ];
}
