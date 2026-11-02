/* global api, S, $, h, icon, prefs, norm, displayName, notInstalled, artFor, timeAgo, launch, openDetails, openModal, fillEl,
   PLAT, STATUS_LABEL, friendMenu, gameFromActivity, openSettings, openConnectionsHelp, setFriends, keepFocus, setView */
// 0.16.0: the Friends page, friend cards that cope with long names and long game titles,
// a profile pop up for each friend, and a short history of what friends played.

// ---------- what friends played (kept on this PC) ----------
const friendKey = (p) => (p.accounts && p.accounts[0] ? p.accounts[0].key : p.name);
const actOf = (p) => { const a = (p.accounts || []).find((x) => x.activity && x.status !== 'offline'); return a ? String(a.activity) : ''; };
const gameName = (txt) => String(txt || '').replace(/^playing\s+/i, '').replace(/^last seen [^:]*:\s*/i, '').trim();
function trackFriendHistory(st) {
  const hist = prefs.get('friendHistory', {});
  let changed = false;
  for (const p of (st && st.people) || []) {
    if (p.status !== 'ingame') continue;
    const game = gameName(actOf(p)).split(/\s+[-|•·]\s+/)[0].trim();
    if (!game) continue;
    const k = friendKey(p);
    const list = hist[k] || [];
    if (list[0] && norm(list[0].game) === norm(game)) { if (Date.now() - list[0].last > 60000) { list[0].last = Date.now(); changed = true; } continue; }
    list.unshift({ game, at: Date.now(), last: Date.now() });
    hist[k] = list.slice(0, 15);
    changed = true;
  }
  if (changed) {
    const keys = Object.keys(hist);
    if (keys.length > 300) for (const k of keys.slice(0, keys.length - 300)) delete hist[k];
    prefs.set('friendHistory', hist);
  }
}
const historyOf = (p) => prefs.get('friendHistory', {})[friendKey(p)] || [];

// ---------- a friend card ----------
// A made up profile picture: two letters on a color picked from the name, so it stays the same.
function defaultAvatar(name, cls = 'f-av') {
  const n = String(name || '?');
  let hsh = 0;
  for (const ch of n) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  const words = n.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[^A-Za-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  const big = words.filter((w) => w.length > 1);
  if (big.length) words.splice(0, words.length, ...big);
  const letters = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || '?').slice(0, 2)).toUpperCase();
  return h('div', { class: `${cls} f-init f-made`, style: `--h:${hsh % 360};--h2:${(hsh >> 9) % 360}`, 'aria-hidden': 'true' }, letters);
}
// The real picture when there is one, the made up one when there is none or it fails to load.
function avatarFor(p, cls = 'f-av') {
  if (!p.avatar) return defaultAvatar(p.name, cls);
  const img = h('img', { class: cls, src: p.avatar, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer', decoding: 'async' });
  img.addEventListener('error', () => img.replaceWith(defaultAvatar(p.name, cls)), { once: true });
  return img;
}
const favFriends = () => new Set(prefs.get('favFriends', []));
const mutedFriends = () => new Set(prefs.get('mutedFriends', []));
function toggleFriendPref(key, p, on, off) {
  const set = new Set(prefs.get(key, []));
  const k = friendKey(p);
  const was = set.has(k);
  if (was) set.delete(k); else set.add(k);
  prefs.set(key, [...set]);
  showToast(was ? off : on);
  if (S.view.type === 'friends') renderFriendsPage(true);
}
const toggleFavFriend = (p) => toggleFriendPref('favFriends', p, `${p.name} added to favorites`, `${p.name} removed from favorites`);
const toggleMuteFriend = (p) => toggleFriendPref('mutedFriends', p, `Alerts muted for ${p.name}`, `Alerts back on for ${p.name}`);
function playingFor(p) { const t = typeof friendSince === 'function' ? friendSince(p) : 0; return t ? Math.max(1, Math.round((Date.now() - t) / 60000)) : 0; }
const fmtMins = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
function statusText(p) {
  const act = actOf(p);
  if (p.status === 'ingame' && act) return gameName(act);
  if (p.status === 'offline') { const a = (p.accounts || []).find((x) => x.activity); return a && a.activity ? a.activity : 'Offline'; }
  return STATUS_LABEL[p.status] || 'Online';
}
function friendCardV2(p) {
  const game = p.status === 'ingame' ? gameFromActivity(actOf(p)) : null;
  const text = statusText(p);
  const mins = p.status === 'ingame' ? playingFor(p) : 0;
  const fav = favFriends().has(friendKey(p));
  const muted = mutedFriends().has(friendKey(p));
  const card = h('button', { class: `fcard st-${p.status}${game ? ' has-game' : ''}${fav ? ' fav' : ''}`, title: `${p.name} · ${text}${mins ? ` · for ${fmtMins(mins)}` : ''}` },
    fav || muted ? h('div', { class: 'fc-flags' }, fav ? h('span', { title: 'Favorite' }, icon('star')) : null, muted ? h('span', { title: 'Alerts muted' }, icon('eyeOff')) : null) : null,
    h('div', { class: 'f-avwrap' }, avatarFor(p), h('span', { class: `f-badge st-${p.status}` })),
    h('div', { class: 'fc-body' },
      h('div', { class: 'fc-name' }, h('span', {}, p.name), p.accounts.length > 1 ? h('span', { class: 'f-linked', title: 'Linked accounts' }, icon('link')) : null),
      h('div', { class: `fc-status st-${p.status}` }, p.status === 'ingame' ? h('span', { class: 'fc-play' }, icon('play')) : null, h('span', { class: 'fc-text' }, text), mins ? h('span', { class: 'fc-for' }, fmtMins(mins)) : null),
      h('div', { class: 'fc-plats' }, p.accounts.map((a) => h('span', { class: `fc-plat src-${a.platform} st-${a.status}`, title: `${PLAT[a.platform] || a.platform}: ${a.name} · ${a.activity || STATUS_LABEL[a.status] || ''}` }, PLAT[a.platform] || a.platform)))),
    game ? h('div', { class: 'fc-game' }, artFor(game)) : null);
  if (game) {
    const join = h('span', { class: 'fc-join', role: 'button', title: notInstalled(game) ? `Install ${displayName(game)}` : `Play ${displayName(game)} too`, onclick: (e) => { e.stopPropagation(); launch(game.id); } }, icon(notInstalled(game) ? 'download' : 'play'), notInstalled(game) ? 'Install' : 'Join');
    card.querySelector('.fc-body').append(join);
  }
  card.addEventListener('click', () => openFriendProfile(p));
  card.addEventListener('contextmenu', (e) => { e.preventDefault(); friendMenu(p, { x: e.clientX, y: e.clientY }); });
  return card;
}

// ---------- the Friends page ----------
let friendQuery = '';
function renderFriendsPage(force) {
  const box = $('#friendsView');
  if (!box) return;
  const f = S.friends;
  // Only redraw when something you can see changed, so hovering and scrolling stay smooth.
  const sig = JSON.stringify([f.configured, (f.people || []).map((p) => [p.name, p.status, p.avatar, p.accounts.map((a) => [a.key, a.status, a.activity]), Math.floor(playingFor(p) / 1)]), f.errors, prefs.get('friendFilter', 'all'), prefs.get('friendPlat', ''), friendQuery, S.search, prefs.get('favFriends', []), prefs.get('mutedFriends', []), S.console && S.console.current && [S.console.current.name, Math.floor((Date.now() - S.console.current.s) / 60000)], S.console && (S.console.recent || []).length, S.console && S.console.enabled]);
  if (!force && box.dataset.sig === sig && box.childElementCount) return;
  box.dataset.sig = sig;
  if (!f.configured) {
    fillEl(box, h('div', { class: 'friends-empty' },
      h('h3', {}, 'Connect Steam, Xbox or Epic to see friends'),
      h('p', {}, 'Sign in to Xbox or Epic, or add a Steam Web API key, in Settings. Friends with the same name on more than one are matched automatically.'),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn primary', onclick: openSettings }, 'Open Settings'),
        h('button', { class: 'btn', onclick: () => openConnectionsHelp('xbox') }, 'How to connect'))));
    return;
  }
  const filt = prefs.get('friendFilter', 'all');
  const plat = prefs.get('friendPlat', '');
  const q = norm(friendQuery || S.search);
  const all = f.people || [];
  const people = all.filter((p) => (!q || norm(p.name).includes(q) || p.accounts.some((a) => norm(a.name).includes(q) || norm(a.activity || '').includes(q)))
    && (!plat || p.accounts.some((a) => a.platform === plat))
    && (filt === 'all' || (filt === 'playing' ? p.status === 'ingame' : filt === 'online' ? p.status !== 'offline' : p.status === 'offline')));
  const count = (fn) => all.filter(fn).length;
  // Favorites first; friends in the same game sit next to each other.
  const favs = favFriends();
  const byName = (a, b) => (favs.has(friendKey(b)) - favs.has(friendKey(a))) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  people.sort(byName);
  const gameOf = (p) => norm(gameName(actOf(p)).split(/\s+[-|•·]\s+/)[0]);
  const playing = people.filter((p) => p.status === 'ingame').sort((a, b) => (favs.has(friendKey(b)) - favs.has(friendKey(a))) || gameOf(a).localeCompare(gameOf(b)) || byName(a, b));
  const online = people.filter((p) => p.status === 'online' || p.status === 'busy');
  const away = people.filter((p) => p.status === 'away');
  const offline = people.filter((p) => p.status === 'offline');
  const plats = [...new Set(all.flatMap((p) => p.accounts.map((a) => a.platform)))];
  const refresh = h('button', { class: 'chip', onclick: async () => { refresh.disabled = true; setFriends(await api.refreshFriends()); } }, icon('refresh'), 'Refresh');
  const search = h('input', { class: 'text-input', placeholder: 'Find a friend or game', value: friendQuery, spellcheck: 'false' });
  search.addEventListener('keydown', (e) => e.stopPropagation());
  search.addEventListener('input', () => { friendQuery = search.value; renderFriendsPage(); const s2 = box.querySelector('.fr-search input'); if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); } });
  const section = (title, list, cls = '') => (list.length ? [h('h3', { class: 'section-title' }, `${title} · ${list.length}`), h('div', { class: `friends-grid2 ${cls}` }, list.map(friendCardV2))] : []);
  keepFocus(box, () => fillEl(box,
    h('div', { class: 'fr-stats' },
      h('div', {}, h('b', {}, String(count((p) => p.status === 'ingame'))), h('span', {}, 'playing')),
      h('div', {}, h('b', {}, String(count((p) => p.status !== 'offline'))), h('span', {}, 'online')),
      h('div', {}, h('b', {}, String(all.length)), h('span', {}, 'friends')),
      h('div', { class: 'fr-updated' }, refresh, f.updated ? h('span', { class: 'count fr-ago', 'data-t': f.updated }, `Updated ${timeAgo(f.updated).toLowerCase()}`) : null)),
    typeof consoleYouCard === 'function' ? consoleYouCard() : null,
    h('div', { class: 'fr-tools' },
      h('div', { class: 'search-mini fr-search' }, icon('search'), search),
      h('div', { class: 'seg' }, [['all', 'All'], ['playing', 'Playing'], ['online', 'Online'], ['offline', 'Offline']].map(([k, n]) => h('button', { class: filt === k ? 'on' : '', onclick: () => { prefs.set('friendFilter', k); renderFriendsPage(true); } }, n))),
      plats.length > 1 ? h('div', { class: 'seg' }, [['', 'Every platform'], ...plats.map((x) => [x, PLAT[x] || x])].map(([k, n]) => h('button', { class: plat === k ? 'on' : '', onclick: () => { prefs.set('friendPlat', k); renderFriendsPage(true); } }, n))) : null),
    f.errors && f.errors.length ? h('div', { class: 'note err' }, f.errors.join(' ')) : null,
    ...section('Playing now', playing, 'playing'),
    ...section('Online', online),
    ...section('Away', away),
    ...section('Offline', offline, 'offline'),
    people.length ? null : h('div', { class: 'friends-empty' }, h('h3', {}, q ? 'Nobody matches that search' : 'No friends here'))));
}

// ---------- a friend's profile ----------
function openFriendProfile(p) {
  const act = actOf(p);
  const game = p.status === 'ingame' ? gameFromActivity(act) : null;
  // One row per game, newest first.
  const hist = [...new Map(historyOf(p).map((x) => [norm(String(x.game).split(/\s+[-|•·]\s+/)[0]), x])).values()];
  const mins = p.status === 'ingame' ? playingFor(p) : 0;
  const lastSeen = p.status !== 'ingame' && hist[0] ? hist[0] : null;
  const shared = [...new Map(hist.map((x) => [norm(x.game), gameFromActivity(x.game)]).filter(([, it]) => it)).values()];
  const close = () => { if (S.modals.length) S.modals[S.modals.length - 1](); };
  const body = h('div', { class: 'fp' },
    h('div', { class: 'fp-head' },
      h('div', { class: 'f-avwrap' }, avatarFor(p, 'fp-av'), h('span', { class: `f-badge st-${p.status}` })),
      h('div', { class: 'fp-id' },
        h('div', { class: 'fp-name', title: p.name }, p.name),
        h('div', { class: `fp-status st-${p.status}` }, h('span', { class: `f-dot st-${p.status}` }), p.status === 'ingame' ? `Playing ${gameName(act)}${mins ? ` · ${fmtMins(mins)}` : ''}` : statusText(p)),
        lastSeen ? h('div', { class: 'fp-seen', title: lastSeen.game }, `Last seen playing ${lastSeen.game} · ${timeAgo(lastSeen.last || lastSeen.at).toLowerCase()}`) : null,
        h('div', { class: 'fc-plats' }, p.accounts.map((a) => h('span', { class: `fc-plat src-${a.platform} st-${a.status}` }, PLAT[a.platform] || a.platform))))),
    p.status === 'ingame' && act ? h('div', { class: 'fp-now' },
      game ? h('div', { class: 'fp-now-art' }, artFor(game)) : h('div', { class: 'fp-now-art empty' }, icon('gamepad')),
      h('div', { class: 'fp-now-text' }, h('span', { class: 'fp-kicker' }, h('span', { class: 'live-dot' }), 'Playing now'), h('b', { title: gameName(act) }, gameName(act)),
        game ? h('span', {}, notInstalled(game) ? 'You own it, not installed' : 'You have this game') : h('span', {}, 'Not in your library')),
      game ? h('div', { class: 'fp-now-btns' },
        h('button', { class: 'btn primary', onclick: () => { close(); launch(game.id); } }, icon(notInstalled(game) ? 'download' : 'play'), notInstalled(game) ? 'Install' : 'Join'),
        h('button', { class: 'btn', onclick: () => { close(); setTimeout(() => openDetails(game.id), 30); } }, 'Details')) : null) : null,
    h('h3', { class: 'section-title' }, 'Accounts'),
    h('div', { class: 'fp-accs' }, p.accounts.map((a) => h('div', { class: 'fp-acc' },
      h('span', { class: `fc-plat src-${a.platform}` }, PLAT[a.platform] || a.platform),
      h('div', { class: 'fp-acc-text' }, h('b', { title: a.name }, a.name), h('span', { title: a.activity || '' }, a.activity || STATUS_LABEL[a.status] || '')),
      a.profile ? h('button', { class: 'btn', onclick: () => api.openExternal(a.profile) }, 'Open profile') : null))),
    h('h3', { class: 'section-title' }, 'Recently played'),
    hist.length ? h('div', { class: 'fp-hist' }, hist.slice(0, 8).map((x) => {
      const it = gameFromActivity(x.game);
      return h('button', { class: 'fp-hrow' + (it ? ' mine' : ''), disabled: !it, onclick: () => { if (it) { close(); setTimeout(() => openDetails(it.id), 30); } } },
        it ? h('div', { class: 'fp-hart' }, artFor(it)) : h('div', { class: 'fp-hart empty' }, icon('gamepad')),
        h('div', { class: 'fp-acc-text' }, h('b', { title: x.game }, x.game), h('span', {}, `${timeAgo(x.last || x.at)}${it ? ' · in your library' : ''}`)));
    })) : h('div', { class: 'help' }, 'Games show up here as Crimson Vault sees your friend play them.'),
    shared.length ? h('div', { class: 'help', style: { marginTop: '10px' } }, `You both have ${shared.length} ${shared.length === 1 ? 'game' : 'games'} from this list.`) : null);
  openModal({
    title: '',
    cls: 'fp-modal',
    body,
    actions: [
      { label: favFriends().has(friendKey(p)) ? 'Unfavorite' : 'Favorite', left: true, run: () => { toggleFavFriend(p); } },
      { label: mutedFriends().has(friendKey(p)) ? 'Unmute alerts' : 'Mute alerts', left: true, run: () => { toggleMuteFriend(p); } },
      { label: 'More', left: true, run: () => { friendMenu(p, { el: [...document.querySelectorAll('.fp-modal .modal-foot .left .btn')].pop() }); return false; } },
      { label: 'Close', primary: true }],
  });
}

// Keep "Updated 2 min ago" honest without redrawing the page.
setInterval(() => { for (const el of document.querySelectorAll('.fr-ago')) el.textContent = `Updated ${timeAgo(Number(el.dataset.t)).toLowerCase()}`; }, 30000);

// On the Friends page, / or Ctrl+F jumps to the friend search, and Esc clears it.
document.addEventListener('keydown', (e) => {
  if (!S.view || S.view.type !== 'friends' || S.modals.length) return;
  const input = document.querySelector('.fr-search input');
  if (!input) return;
  if ((e.key === '/' && !/input|textarea/i.test(document.activeElement.tagName)) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) { e.preventDefault(); e.stopPropagation(); input.focus(); input.select(); }
  else if (e.key === 'Escape' && document.activeElement === input && input.value) { e.preventDefault(); e.stopPropagation(); friendQuery = ''; renderFriendsPage(true); }
}, true);
