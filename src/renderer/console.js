/* global api, S, $, h, icon, prefs, artFor, timeAgo, fmtHours, openModal, openDetails, setView, renderHub, renderFriendsPage, renderHeader, showToast */
// 0.16.0: what you play on your Xbox console (or through remote play), read from your own Xbox presence.

function consoleMins(c) { return Math.max(0, Math.round(((c.e || Date.now()) - c.s) / 60000)); }
function consoleTime(m) { return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; }
const DEVICE = { Scarlett: 'Xbox Series X|S', XboxSeries: 'Xbox Series X|S', XboxOne: 'Xbox One', Durango: 'Xbox One', Xbox360: 'Xbox 360', Android: 'Phone', iOS: 'Phone', Web: 'Cloud gaming', XboxCloud: 'Cloud gaming' };
const deviceName = (d) => DEVICE[d] || (d ? String(d) : 'Xbox');

function setConsole(st) {
  if (!st) return;
  const before = JSON.stringify(S.console && S.console.current);
  S.console = st;
  const changed = before !== JSON.stringify(st.current);
  if (S.view.type === 'friends') renderFriendsPage();
  if (changed && S.view.type === 'remoteplay') renderHeader();
  if (S.view.type === 'hub') { const b = $('#hubView'); if (b) b.dataset.sig = ''; renderHub(); }
}

// The card at the top of the Friends page: you, and what you are doing on Xbox.
function consoleYouCard() {
  const st = S.console;
  if (!st || !st.enabled) return null;
  const c = st.current;
  const it = c && c.id && S.byId.get(c.id);
  const last = (st.recent || [])[0];
  const tag = S.lib.settings.xboxGamertag || 'You';
  return h('button', { class: 'cv-you' + (c ? ' live' : ''), onclick: openConsoleHistory, title: 'Your Xbox play history' },
    h('div', { class: 'cv-you-art' }, it ? artFor(it) : h('div', { class: 'cv-you-ic' }, icon('gamepad'))),
    h('div', { class: 'cv-you-text' },
      h('span', { class: 'fp-kicker' + (c ? '' : ' idle') }, c ? h('span', { class: 'live-dot' }) : null, c ? `You on ${deviceName(c.device)}` : `${tag} on Xbox`),
      h('b', { title: c ? c.name : '' }, c ? c.name : last ? `Last: ${last.name}` : 'Not playing on Xbox'),
      h('span', { title: c && c.detail ? c.detail : '' }, c ? [consoleTime(consoleMins(c)), c.detail].filter(Boolean).join(' · ')
        : last ? `${timeAgo(last.e)} · ${consoleTime(consoleMins(last))}${last.ach && last.ach.length ? ` · ${last.ach.length} achievements` : ''}` : (st.error || 'Play on your console or through remote play and it shows up here'))),
    h('span', { class: 'cv-you-more' }, 'History', icon('chevronRight')));
}

// Every console session: game, device, how long, achievements unlocked.
function openConsoleHistory() {
  const st = S.console || {};
  const list = st.recent || [];
  const week = Date.now() - 7 * 86400000;
  const weekMins = list.filter((x) => x.s > week).reduce((a, x) => a + consoleMins(x), 0);
  const ach = list.reduce((a, x) => a + ((x.ach && x.ach.length) || 0), 0);
  const close = () => { if (S.modals.length) S.modals[S.modals.length - 1](); };
  const body = h('div', { class: 'cvh' },
    h('div', { class: 'hist-facts' },
      h('div', {}, h('b', {}, consoleTime(weekMins)), h('span', {}, 'this week')),
      h('div', {}, h('b', {}, String(list.length)), h('span', {}, 'sessions')),
      h('div', {}, h('b', {}, String(ach)), h('span', {}, 'achievements'))),
    st.current ? h('div', { class: 'cvh-row live' }, h('span', { class: 'live-dot' }), h('div', { class: 'fp-acc-text' }, h('b', {}, st.current.name), h('span', {}, `Playing now on ${deviceName(st.current.device)} · ${consoleTime(consoleMins(st.current))}`))) : null,
    list.length ? h('div', { class: 'cvh-list' }, list.map((x) => {
      const it = x.id && S.byId.get(x.id);
      return h('div', { class: 'cvh-row' },
        it ? h('button', { class: 'fp-hart', title: 'Details', onclick: () => { close(); setTimeout(() => openDetails(it.id), 30); } }, artFor(it)) : h('div', { class: 'fp-hart empty' }, icon('gamepad')),
        h('div', { class: 'fp-acc-text' },
          h('b', { title: x.name }, x.name),
          h('span', {}, `${new Date(x.s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${new Date(x.s).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · ${consoleTime(consoleMins(x))} · ${deviceName(x.device)}`),
          x.ach && x.ach.length ? h('div', { class: 'cvh-ach' }, x.ach.slice(0, 6).map((a) => h('span', { title: a.name }, icon('trophy'), a.name, a.gs ? h('i', {}, `${a.gs} G`) : null))) : null));
    })) : h('div', { class: 'help' }, 'Nothing yet. Play on your Xbox, or through Xbox Remote Play, while Crimson Vault is open (it can be in the tray) and each session lands here with its achievements.'),
    st.error ? h('div', { class: 'note err' }, st.error) : null,
    h('div', { class: 'help' }, 'Read from your Xbox profile\'s presence every minute or two, so very short sessions are skipped. Turn it off in Settings, Quality of life.'));
  openModal({
    title: 'Your Xbox play',
    cls: 'cvh-modal',
    body,
    actions: [
      { label: 'Check now', left: true, run: async () => { setConsole(await api.consoleCheck()); showToast('Checked your Xbox status'); return false; } },
      { label: 'Close', primary: true },
    ],
  });
}

document.addEventListener('DOMContentLoaded', () => {
  S.console = null;
  if (!api.consoleState) return;
  api.consoleState().then(setConsole).catch(() => {});
  api.onConsole(setConsole);
  // Keep the minutes counting on screen.
  setInterval(() => { if (S.console && S.console.current && ['friends', 'hub'].includes(S.view.type)) setConsole(S.console); }, 60000);
});
