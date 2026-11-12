/* global api, S, $, h, icon, prefs, displayName, visible, isGrouped, isDupe, notInstalled, artFor, fmtHours, timeAgo, SOURCES, norm,
   setView, launch, openDetails, showToast, fillEl, renderGuide, dupesOf, groupMinutes, childrenOf, descendants, STATUS_NAMES */
// 0.15.0: alerts history for the guide, play history and "More like this" in details,
// finding the game a friend is playing, and the genre helpers for Stats.

// ---------- alerts history ----------
// Pop ups that matter (friends, sessions, deals, downloads, storage) are kept for the guide's Alerts tab.
const ALERT_ICONS = { friend: 'users', session: 'clock', deal: 'tag', download: 'download', storage: 'drive', reminder: 'clock', info: 'bell' };
function alertList() { return prefs.get('alerts', []); }
function pushAlert(a) {
  const list = alertList();
  // The same alert again within 30 minutes is not saved twice.
  if (list.slice(0, 15).some((x) => x.title === a.title && Date.now() - x.at < 30 * 60000)) return;
  list.unshift({ title: String(a.title || ''), body: String(a.body || ''), at: a.at || Date.now(), kind: a.kind || 'info', id: a.id || null });
  prefs.set('alerts', list.slice(0, 60));
  if (S.guideOpen) renderGuide();
}
const unreadAlerts = () => { const seen = prefs.get('alertsSeen', 0); return alertList().filter((a) => a.at > seen).length; };
const ALERT_KIND_NAMES = { friend: 'Friends', session: 'Sessions', xbox: 'Xbox', deal: 'Deals', download: 'Downloads', storage: 'Storage', anime: 'Anime', reminder: 'Reminders', info: 'Other' };
function guideAlerts() {
  const all = alertList();
  prefs.set('alertsSeen', Date.now());
  if (!all.length) return [h('div', { class: 'gd-empty' }, icon('bell'), h('span', {}, 'No alerts yet. Friend activity, session summaries, deals and downloads show up here.'))];
  // Filter chips, only for the kinds actually in the list.
  const kinds = [...new Set(all.map((a) => a.kind || 'info'))];
  if (S.alertFilter && !kinds.includes(S.alertFilter)) S.alertFilter = null;
  const list = S.alertFilter ? all.filter((a) => (a.kind || 'info') === S.alertFilter) : all;
  return [
    kinds.length > 1 ? h('div', { class: 'gd-afilters' },
      h('button', { class: 'chip' + (!S.alertFilter ? ' on' : ''), 'data-k': 'af:all', onclick: () => { S.alertFilter = null; renderGuide(); } }, `All · ${all.length}`),
      kinds.map((k) => h('button', { class: 'chip' + (S.alertFilter === k ? ' on' : ''), 'data-k': `af:${k}`, onclick: () => { S.alertFilter = S.alertFilter === k ? null : k; renderGuide(); } }, `${ALERT_KIND_NAMES[k] || k} · ${all.filter((a) => (a.kind || 'info') === k).length}`))) : null,
    h('div', { class: 'gd-flist' }, list.slice(0, 40).map((a, i) => h('button', { class: `gd-alert k-${a.kind}`, 'data-k': `al:${a.at}`, style: `--d:${Math.min(i, 10)}`, onclick: () => { if (a.id && S.byId.has(a.id)) { S.guideOpen = false; document.body.classList.remove('guide-open'); openDetails(a.id); } else if (a.kind === 'deal') setView({ type: 'deals' }); else if (a.kind === 'storage') setView({ type: 'storage' }); else if (a.kind === 'xbox' && typeof openConsoleHistory === 'function') openConsoleHistory(); else if (a.kind === 'anime') { S.guideOpen = false; document.body.classList.remove('guide-open'); setView({ type: 'anime' }); const mid = String(a.id || '').split(':')[1]; const e = mid && S.anime && (S.anime.entries || []).find((x) => String(x.mediaId) === mid); if (e) setTimeout(() => openAnimeDetails(e), 120); } } },
      h('span', { class: 'gd-aic' }, icon(ALERT_ICONS[a.kind] || 'bell')),
      h('div', { class: 'hf-text' }, h('b', {}, a.title), a.body ? h('span', {}, a.body) : null),
      h('span', { class: 'gd-atime' }, timeAgo(a.at))))),
    h('button', { class: 'gd-wide', 'data-k': 'al:clear', onclick: () => { prefs.set('alerts', []); renderGuide(); } }, icon('close'), 'Clear alerts'),
  ];
}
document.addEventListener('DOMContentLoaded', () => { if (api.onAlert) api.onAlert((a) => pushAlert(a)); });

// ---------- the game in a friend's status ----------
function gameFromActivity(text) {
  const t = norm(String(text || '').replace(/^playing\s+/i, ''));
  if (t.length < 3) return null;
  let best = null;
  for (const it of S.lib.items) {
    if (it.kind !== 'game' || it.hidden || isGrouped(it) || !(it.installed || it.owned || it.manual)) continue;
    const n = norm(displayName(it));
    if (n.length > 2 && t.startsWith(n) && (!best || n.length > norm(displayName(best)).length)) best = it;
  }
  return best;
}

// ---------- details: your play history ----------
function playHistory(it) {
  const box = h('div', { class: 'det-history' });
  const ids = new Set([it.id, ...dupesOf(it).map((o) => o.id)]);
  api.sessions().then((all) => {
    const list = (all || []).filter((x) => ids.has(x.id)).sort((a, b) => b.s - a.s);
    if (!list.length) return;
    const DAY = 86400000;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = [];
    for (let i = 29; i >= 0; i--) days.push({ t: today.getTime() - i * DAY, m: 0 });
    for (const x of list) {
      const i = Math.floor((x.s - days[0].t) / DAY);
      if (i >= 0 && i < 30) days[i].m += (x.e - x.s) / 60000;
    }
    const max = Math.max(1, ...days.map((d) => d.m));
    const mins = list.reduce((a, x) => a + (x.e - x.s) / 60000, 0);
    const avg = mins / list.length;
    const longest = list.reduce((a, x) => Math.max(a, (x.e - x.s) / 60000), 0);
    fillEl(box,
      h('h3', { class: 'section-title', style: { marginTop: '24px' } }, 'Your play history'),
      h('div', { class: 'hist-facts' },
        h('div', {}, h('b', {}, String(list.length)), h('span', {}, list.length === 1 ? 'session' : 'sessions')),
        list.some((x) => x.console) ? h('div', {}, h('b', {}, fmtHours(list.filter((x) => x.console).reduce((a, x) => a + (x.e - x.s) / 60000, 0)) || '0 min'), h('span', {}, 'on Xbox')) : null,
        h('div', {}, h('b', {}, fmtHours(avg) || '0 min'), h('span', {}, 'average')),
        h('div', {}, h('b', {}, fmtHours(longest) || '0 min'), h('span', {}, 'longest')),
        h('div', {}, h('b', {}, timeAgo(list[0].e)), h('span', {}, 'last time')),
        h('div', {}, h('b', {}, new Date(list[list.length - 1].s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })), h('span', {}, 'first seen'))),
      h('div', { class: 'hist-chart', title: 'Last 30 days' }, days.map((d) => h('span', { class: d.m ? 'on' : '', style: { height: `${Math.max(4, (d.m / max) * 100)}%` }, title: `${new Date(d.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${fmtHours(d.m) || 'not played'}` }))),
      h('div', { class: 'hist-axis' }, h('span', {}, '30 days ago'), h('span', {}, 'Today')));
  }).catch(() => {});
  return box;
}

// ---------- details: more like this ----------
function moreLikeThis(it) {
  if (it.kind !== 'game' || !it.categoryId) return null;
  const root = childrenOf(null).find((c) => /^games$/i.test(c.name));
  if (!root || it.categoryId === root.id) return null;
  const set = descendants(it.categoryId);
  const cat = S.cats.get(it.categoryId);
  const list = S.lib.items.filter((x) => x.id !== it.id && x.kind === 'game' && visible(x) && set.has(x.categoryId))
    .sort((a, b) => Number(!!b.installed) - Number(!!a.installed) || (a.status === 'backlog' ? -1 : 0) - (b.status === 'backlog' ? -1 : 0) || (groupMinutes(a) ? 1 : 0) - (groupMinutes(b) ? 1 : 0) || (b.lastPlayed || 0) - (a.lastPlayed || 0))
    .slice(0, 8);
  if (!list.length) return null;
  return h('div', { class: 'det-more' },
    h('div', { class: 'sec-head', style: { marginTop: '24px' } }, h('h3', { class: 'section-title' }, `More ${cat ? cat.name : 'like this'} in your library`),
      cat ? h('button', { class: 'link-btn', onclick: () => { if (S.modals.length) S.modals[S.modals.length - 1](); setView({ type: 'category', id: cat.id }); } }, 'See all') : null),
    h('div', { class: 'more-row' }, list.map((x) => h('button', { class: 'more-card', title: displayName(x), onclick: () => { if (S.modals.length) S.modals[S.modals.length - 1](); setTimeout(() => openDetails(x.id), 30); } },
      artFor(x), h('span', {}, displayName(x)), h('small', {}, groupMinutes(x) ? fmtHours(groupMinutes(x)) : x.status ? STATUS_NAMES[x.status] : notInstalled(x) ? 'Not installed' : 'Never played')))));
}

// ---------- Stats: hours by genre ----------
function genreRows() {
  const root = childrenOf(null).find((c) => /^games$/i.test(c.name));
  if (!root) return [];
  return childrenOf(root.id).map((c) => {
    const set = descendants(c.id);
    const mins = S.lib.items.filter((it) => it.kind === 'game' && !it.hidden && set.has(it.categoryId)).reduce((a, it) => a + (it.minutes || 0), 0);
    return { label: c.name, v: mins, go: () => setView({ type: 'category', id: c.id }) };
  }).filter((r) => r.v > 0).sort((a, b) => b.v - a.v).slice(0, 8);
}
