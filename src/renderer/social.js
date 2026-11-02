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
    const game = gameName(actOf(p));
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
function avatarFor(p, cls = 'f-av') {
  return p.avatar ? h('img', { class: cls, src: p.avatar, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : h('div', { class: `${cls} f-init`, style: `--h:${(p.name.charCodeAt(0) * 37) % 360}` }, (p.name[0] || '?').toUpperCase());
}
function statusText(p) {
  const act = actOf(p);
  if (p.status === 'ingame' && act) return gameName(act);
  if (p.status === 'offline') { const a = (p.accounts || []).find((x) => x.activity); return a && a.activity ? a.activity : 'Offline'; }
  return STATUS_LABEL[p.status] || 'Online';
}
function friendCardV2(p) {
  const game = p.status === 'ingame' ? gameFromActivity(actOf(p)) : null;
  const text = statusText(p);
  const card = h('button', { class: `fcard st-${p.status}${game ? ' has-game' : ''}`, title: `${p.name} · ${text}` },
    h('div', { class: 'f-avwrap' }, avatarFor(p), h('span', { class: `f-badge st-${p.status}` })),
    h('div', { class: 'fc-body' },
      h('div', { class: 'fc-name' }, h('span', {}, p.name), p.accounts.length > 1 ? h('span', { class: 'f-linked', title: 'Linked accounts' }, icon('link')) : null),
      h('div', { class: `fc-status st-${p.status}` }, p.status === 'ingame' ? h('span', { class: 'fc-play' }, icon('play')) : null, h('span', { class: 'fc-text' }, text)),
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
function renderFriendsPage() {
  const box = $('#friendsView');
  const f = S.friends;
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
  const playing = people.filter((p) => p.status === 'ingame');
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
      h('div', { class: 'fr-updated' }, refresh, f.updated ? h('span', { class: 'count' }, `Updated ${timeAgo(f.updated).toLowerCase()}`) : null)),
    typeof consoleYouCard === 'function' ? consoleYouCard() : null,
    h('div', { class: 'fr-tools' },
      h('div', { class: 'search-mini fr-search' }, icon('search'), search),
      h('div', { class: 'seg' }, [['all', 'All'], ['playing', 'Playing'], ['online', 'Online'], ['offline', 'Offline']].map(([k, n]) => h('button', { class: filt === k ? 'on' : '', onclick: () => { prefs.set('friendFilter', k); renderFriendsPage(); } }, n))),
      plats.length > 1 ? h('div', { class: 'seg' }, [['', 'Every platform'], ...plats.map((x) => [x, PLAT[x] || x])].map(([k, n]) => h('button', { class: plat === k ? 'on' : '', onclick: () => { prefs.set('friendPlat', k); renderFriendsPage(); } }, n))) : null),
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
  const hist = historyOf(p);
  const shared = [...new Map(hist.map((x) => [norm(x.game), gameFromActivity(x.game)]).filter(([, it]) => it)).values()];
  const close = () => { if (S.modals.length) S.modals[S.modals.length - 1](); };
  const body = h('div', { class: 'fp' },
    h('div', { class: 'fp-head' },
      h('div', { class: 'f-avwrap' }, avatarFor(p, 'fp-av'), h('span', { class: `f-badge st-${p.status}` })),
      h('div', { class: 'fp-id' },
        h('div', { class: 'fp-name', title: p.name }, p.name),
        h('div', { class: `fp-status st-${p.status}` }, h('span', { class: `f-dot st-${p.status}` }), p.status === 'ingame' ? `Playing ${gameName(act)}` : statusText(p)),
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
        h('div', { class: 'fp-acc-text' }, h('b', { title: x.game }, x.game), h('span', {}, `${timeAgo(x.at)}${it ? ' · in your library' : ''}`)));
    })) : h('div', { class: 'help' }, 'Games show up here as Crimson Vault sees your friend play them.'),
    shared.length ? h('div', { class: 'help', style: { marginTop: '10px' } }, `You both have ${shared.length} ${shared.length === 1 ? 'game' : 'games'} from this list.`) : null);
  openModal({
    title: '',
    cls: 'fp-modal',
    body,
    actions: [{ label: 'More', left: true, run: (e) => { friendMenu(p, { el: document.querySelector('.fp-modal .modal-foot .left .btn') }); return false; } }, { label: 'Close', primary: true }],
  });
}
