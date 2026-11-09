/* global spinOverlay, Sfx, toggleRow, openMenu, renderHub, api, S, $, h, icon, prefs, fillEl, keepFocus, openModal, showToast, setView, timeAgo, norm, openSettings, openConnectionsHelp, confirmBox */
// 0.16.5: the Anime page. Your AniList list (Watching, Planned, Completed, Paused, Dropped, All),
// with a Surprise me picker that chooses from the lists you pick, show details, and (signed in)
// episode, status and score updates.

const A_TABS = [
  ['watching', 'Watching', ['CURRENT', 'REPEATING']],
  ['planned', 'Planned', ['PLANNING']],
  ['completed', 'Completed', ['COMPLETED']],
  ['paused', 'Paused', ['PAUSED']],
  ['dropped', 'Dropped', ['DROPPED']],
  ['all', 'All', null],
];
const A_STATUS = { CURRENT: 'Watching', REPEATING: 'Rewatching', PLANNING: 'Planned', COMPLETED: 'Completed', PAUSED: 'Paused', DROPPED: 'Dropped' };
const A_POOLS = [['planned', 'Planned'], ['watching', 'Watching'], ['completed', 'Completed'], ['all', 'All']];
const A_SORTS = [['updated', 'Recently updated'], ['title', 'Title'], ['score', 'Your score'], ['avg', 'AniList score'], ['progress', 'Progress'], ['airing', 'Next episode'], ['year', 'Newest']];

let animeQuery = '';
let animeBusy = false;

function animeTabStatuses(tab) { const t = A_TABS.find((x) => x[0] === tab); return t ? t[2] : null; }
function animeIn(tab) { const st = animeTabStatuses(tab); const list = (S.anime && S.anime.entries) || []; return st ? list.filter((e) => st.includes(e.status)) : list; }

async function loadAnime(force) {
  if (!api.animeList || animeBusy) return;
  animeBusy = true;
  if (S.view.type === 'anime') renderAnimePage(true);
  try { S.anime = await api.animeList(!!force); } catch (e) { S.anime = { ...(S.anime || {}), error: e.message }; }
  animeBusy = false;
  if (S.view.type === 'anime') renderAnimePage(true);
  if (S.view.type === 'hub') { const b = $('#hubView'); if (b) b.dataset.sig = ''; if (typeof renderHub === 'function') renderHub(); }
}

function untilText(at) {
  const m = Math.max(0, Math.round((at - Date.now()) / 60000));
  if (m < 60) return `${m}m`;
  const hrs = Math.floor(m / 60);
  if (hrs < 24) return `${hrs}h ${m % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}
const epText = (e) => `${e.progress}${e.episodes ? ` / ${e.episodes}` : ''} ep`;
const animeArt = (e, cls = 'an-cover') => h('div', { class: cls, style: `--c:${e.color || '#3a3a44'}` },
  e.cover ? h('img', { src: e.cover, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (ev) => ev.target.remove() }) : null,
  h('span', { class: 'an-fallback' }, e.title));

// ---------- the page ----------
function renderAnimePage(force) {
  const box = $('#animeView');
  if (!box) return;
  // Never redraw in the middle of a Surprise me spin; it redraws itself when it lands.
  if (S.animeSpinning) return;
  const a = S.anime;
  if (!a) { if (!animeBusy) loadAnime(false); fillEl(box, h('div', { class: 'an-loading' }, h('div', { class: 'spinner' }), 'Loading your anime list')); return; }
  if (!a.configured) { fillEl(box, animeSetup()); return; }
  const tab = prefs.get('animeTab', 'watching');
  const sort = prefs.get('animeSort', 'updated');
  const q = norm(animeQuery);
  let list = animeIn(tab).filter((e) => !q || norm(e.title).includes(q) || norm(e.romaji).includes(q) || e.genres.some((g) => norm(g).includes(q)));
  const by = {
    updated: (x, y) => y.updatedAt - x.updatedAt,
    title: (x, y) => x.title.localeCompare(y.title),
    score: (x, y) => y.score - x.score || y.avg - x.avg,
    avg: (x, y) => y.avg - x.avg,
    progress: (x, y) => (y.episodes ? y.progress / y.episodes : 0) - (x.episodes ? x.progress / x.episodes : 0),
    airing: (x, y) => (x.next ? x.next.at : 9e15) - (y.next ? y.next.at : 9e15),
    year: (x, y) => y.year - x.year,
  }[sort] || (() => 0);
  list = list.slice().sort(by);
  const sig = JSON.stringify([tab, sort, q, a.updated, a.error, a.canEdit, animeBusy, list.length, list.slice(0, 60).map((e) => [e.mediaId, e.progress, e.status, e.score])]);
  if (!force && box.dataset.sig === sig && box.childElementCount) return;
  box.dataset.sig = sig;
  const counts = Object.fromEntries(A_TABS.map(([k]) => [k, animeIn(k).length]));
  const search = h('input', { class: 'text-input', placeholder: 'Find a show or genre', value: animeQuery, spellcheck: 'false' });
  search.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') { animeQuery = ''; renderAnimePage(true); } });
  search.addEventListener('input', () => { animeQuery = search.value; renderAnimePage(); const s2 = box.querySelector('.an-search input'); if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); } });
  const sortSel = h('select', { class: 'text-input an-sort', onchange: (e) => { prefs.set('animeSort', e.target.value); renderAnimePage(true); } }, A_SORTS.map(([k, n]) => h('option', { value: k, selected: k === sort }, n)));
  const watching = animeIn('watching');
  const airingSoon = watching.filter((e) => e.next).sort((x, y) => x.next.at - y.next.at).slice(0, 6);
  const watchedMins = (a.entries || []).reduce((t, e) => t + (e.progress || 0) * (e.duration || 24), 0);
  keepFocus(box, () => fillEl(box,
    h('div', { class: 'an-head' },
      a.user && a.user.avatar ? h('img', { class: 'an-avatar', src: a.user.avatar, alt: '', referrerpolicy: 'no-referrer' }) : h('div', { class: 'an-avatar an-avatar-blank' }, icon('tv')),
      h('div', { class: 'an-who' }, h('b', {}, a.user ? a.user.name : 'AniList'), h('span', {}, `${(a.entries || []).length} shows · ${Math.round(watchedMins / 60).toLocaleString()} hours watched${a.canEdit ? '' : ' · read only'}`)),
      h('div', { class: 'an-head-btns' },
        a.canEdit ? h('button', { class: 'btn', onclick: animeAddSearch }, icon('plus'), 'Add anime') : h('button', { class: 'btn', title: 'Sign in to change episodes, status and scores from here', onclick: () => openConnectionsHelp('anilist') }, 'Sign in to edit'),
        h('button', { class: 'btn', disabled: animeBusy, onclick: () => loadAnime(true) }, icon('refresh'), animeBusy ? 'Updating' : 'Refresh'),
        h('button', { class: 'btn', onclick: () => api.openExternal(a.user && a.user.url ? a.user.url : 'https://anilist.co/home') }, 'Open AniList'))),
    a.error ? h('div', { class: 'note err' }, a.error) : null,
    animeSurprisePanel(),
    airingSoon.length ? h('section', { class: 'an-sec' },
      h('h3', { class: 'section-title' }, 'Next episodes'),
      h('div', { class: 'an-airing' }, airingSoon.map((e) => h('button', { class: 'an-air', onclick: () => openAnimeDetails(e) },
        animeArt(e, 'an-air-art'),
        h('div', { class: 'an-air-text' }, h('b', { title: e.title }, e.title), h('span', {}, `Episode ${e.next.episode}`), h('span', { class: 'an-when' }, e.next.at <= Date.now() ? 'Out now' : `in ${untilText(e.next.at)}`)))))) : null,
    h('div', { class: 'an-tools' },
      h('div', { class: 'seg' }, A_TABS.map(([k, n]) => h('button', { class: tab === k ? 'on' : '', onclick: () => { prefs.set('animeTab', k); renderAnimePage(true); } }, n, h('span', { class: 'seg-count' }, String(counts[k] || 0))))),
      h('div', { class: 'search-mini an-search' }, icon('search'), search),
      sortSel),
    list.length ? h('div', { class: 'an-grid' }, list.map(animeCard))
      : h('div', { class: 'friends-empty' }, h('h3', {}, q ? 'Nothing matches that search' : 'Nothing here yet'), h('p', {}, q ? '' : 'Add shows on AniList and they show up here.'))));
}

function animeCard(e) {
  const pct = e.episodes ? Math.min(100, (e.progress / e.episodes) * 100) : e.progress ? 50 : 0;
  const canPlus = S.anime && S.anime.canEdit && ['CURRENT', 'REPEATING', 'PLANNING', 'PAUSED'].includes(e.status) && (!e.episodes || e.progress < e.episodes);
  const card = h('button', { class: `an-card st-${(e.status || '').toLowerCase()}`, title: e.title, 'data-k': `an:${e.mediaId}`, onclick: () => openAnimeDetails(e) },
    animeArt(e),
    e.score ? h('span', { class: 'an-score' }, icon('star'), String(Math.round(e.score * 10) / 10)) : null,
    prefs.get('animeTab', 'watching') === 'all' && e.status ? h('span', { class: 'an-status' }, A_STATUS[e.status] || e.status) : null,
    e.next && ['CURRENT', 'REPEATING'].includes(e.status) ? h('span', { class: 'an-next' }, `Ep ${e.next.episode} ${e.next.at <= Date.now() ? 'out' : `in ${untilText(e.next.at)}`}`) : null,
    h('div', { class: 'an-info' },
      h('div', { class: 'an-title' }, e.title),
      h('div', { class: 'an-meta' }, h('span', {}, epText(e)), e.format ? h('span', {}, fmtFormat(e.format)) : null),
      h('div', { class: 'an-bar' }, h('i', { style: `width:${pct}%` }))));
  if (canPlus) {
    card.append(h('span', { class: 'an-plus', role: 'button', title: 'Watched one more episode', onclick: (ev) => { ev.stopPropagation(); animePlusOne(e); } }, icon('plus'), '1'));
  }
  card.addEventListener('contextmenu', (ev) => { ev.preventDefault(); animeMenu(e, { x: ev.clientX, y: ev.clientY }); });
  return card;
}
const fmtFormat = (f) => ({ TV: 'TV', TV_SHORT: 'TV short', MOVIE: 'Movie', SPECIAL: 'Special', OVA: 'OVA', ONA: 'ONA', MUSIC: 'Music' }[f] || f);

function animeMenu(e, pos) {
  if (typeof openMenu !== 'function') return;
  const edit = S.anime && S.anime.canEdit;
  openMenu([
    { label: 'Details', run: () => openAnimeDetails(e) },
    ...(e.streams.length ? [{ label: `Watch on ${e.streams[0].site}`, run: () => api.openExternal(e.streams[0].url) }] : []),
    { label: 'Open on AniList', run: () => api.openExternal(e.url) },
    ...(edit ? ['-', ...Object.entries(A_STATUS).filter(([k]) => k !== e.status).map(([k, n]) => ({ label: `Move to ${n}`, run: () => animeSave(e, { status: k }) }))] : []),
  ], pos);
}

// ---------- changing your list (signed in) ----------
async function animeSave(e, patch, quiet) {
  const r = await api.animeSave(e.mediaId, patch);
  if (!r || !r.ok) { showToast((r && r.error) || 'Could not update AniList', 'error'); return false; }
  Object.assign(e, { status: r.entry.status, progress: r.entry.progress, score: r.entry.score, updatedAt: (r.entry.updatedAt || 0) * 1000 || Date.now() });
  if (S.anime && !S.anime.entries.includes(e)) S.anime.entries.unshift(e);
  if (!quiet) showToast(patch.status ? `${e.title}: ${A_STATUS[e.status] || e.status}` : 'AniList updated');
  if (S.view.type === 'anime') renderAnimePage(true);
  return true;
}
async function animePlusOne(e) {
  const n = e.progress + 1;
  const patch = { progress: n };
  if (e.episodes && n >= e.episodes) patch.status = 'COMPLETED';
  else if (e.status === 'PLANNING' || e.status === 'PAUSED') patch.status = 'CURRENT';
  const ok = await animeSave(e, patch, true);
  if (ok) showToast(patch.status === 'COMPLETED' ? `Finished ${e.title}!` : `${e.title}: episode ${n}${e.episodes ? ` of ${e.episodes}` : ''}`);
}

// ---------- details ----------
function openAnimeDetails(e) {
  const edit = S.anime && S.anime.canEdit;
  const close = () => { if (S.modals.length) S.modals[S.modals.length - 1](); };
  let desc = e.description || 'No description on AniList.';
  const long = desc.length > 420;
  const descEl = h('p', { class: 'an-desc' + (long ? ' clamp' : '') }, desc);
  const more = long ? h('button', { class: 'link-btn', onclick: () => { descEl.classList.toggle('clamp'); more.textContent = descEl.classList.contains('clamp') ? 'More' : 'Less'; } }, 'More') : null;
  // Your entry: status, episodes and score.
  let prog = e.progress, score = e.score, status = e.status;
  const progEl = h('b', {}, String(prog));
  const scoreEl = h('b', {}, score ? String(score) : '-');
  const stepProg = (d) => { prog = Math.max(0, Math.min(e.episodes || 9999, prog + d)); progEl.textContent = String(prog); };
  const scoreRange = h('input', { type: 'range', min: 0, max: 10, step: 0.5, value: score, oninput: (ev) => { score = Number(ev.target.value); scoreEl.textContent = score ? String(score) : '-'; } });
  const statusSeg = h('div', { class: 'seg wrap' });
  const drawSeg = () => statusSeg.replaceChildren(...Object.entries(A_STATUS).map(([k, n]) => h('button', { class: status === k ? 'on' : '', onclick: () => { status = k; if (k === 'COMPLETED' && e.episodes) { prog = e.episodes; progEl.textContent = String(prog); } drawSeg(); } }, n)));
  drawSeg();
  const body = h('div', { class: 'an-detail' },
    e.banner ? h('div', { class: 'an-banner', style: `background-image:url("${e.banner.replace(/"/g, '')}")` }) : h('div', { class: 'an-banner blank', style: `--c:${e.color || '#3a3a44'}` }),
    h('div', { class: 'an-d-top' },
      animeArt(e, 'an-d-cover'),
      h('div', { class: 'an-d-id' },
        h('h2', {}, e.title),
        e.romaji && e.romaji !== e.title ? h('div', { class: 'an-d-sub' }, e.romaji) : null,
        h('div', { class: 'an-d-facts' }, [fmtFormat(e.format), e.episodes ? `${e.episodes} episodes` : e.airing === 'RELEASING' ? 'Airing' : null, e.season, e.studio, e.avg ? `${e.avg}% on AniList` : null].filter(Boolean).map((t) => h('span', {}, t))),
        h('div', { class: 'an-genres' }, e.genres.slice(0, 6).map((g) => h('span', {}, g))),
        e.next ? h('div', { class: 'an-d-next' }, icon('clock'), `Episode ${e.next.episode} ${e.next.at <= Date.now() ? 'is out' : `in ${untilText(e.next.at)}`}`) : null)),
    descEl, more,
    e.status || edit ? h('div', { class: 'an-d-mine' },
      h('h3', { class: 'section-title' }, 'Your list'),
      edit ? h('div', { class: 'an-edit' },
        h('div', { class: 'field' }, h('label', {}, 'Status'), statusSeg),
        h('div', { class: 'an-edit-row' },
          h('div', { class: 'field' }, h('label', {}, `Episodes${e.episodes ? ` (of ${e.episodes})` : ''}`), h('div', { class: 'an-stepper' }, h('button', { class: 'btn', onclick: () => stepProg(-1) }, '−'), progEl, h('button', { class: 'btn', onclick: () => stepProg(1) }, '+'))),
          h('div', { class: 'field', style: { flex: 1 } }, h('label', {}, 'Your score'), h('div', { class: 'an-score-row' }, scoreRange, scoreEl))))
        : h('div', { class: 'an-d-facts' }, [A_STATUS[e.status], epText(e), e.score ? `Your score ${e.score}` : null, e.completedAt ? `Finished ${new Date(e.completedAt).toLocaleDateString()}` : null].filter(Boolean).map((t) => h('span', {}, t)))) : null,
    e.streams.length ? h('div', { class: 'an-streams' }, h('h3', { class: 'section-title' }, 'Where to watch'), h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, e.streams.map((s) => h('button', { class: 'btn', onclick: () => api.openExternal(s.url) }, icon('play'), s.site)))) : null);
  openModal({
    title: '',
    cls: 'an-modal',
    body,
    actions: [
      { label: 'Open on AniList', left: true, run: () => { api.openExternal(e.url); return false; } },
      ...(edit ? [{ label: 'Close' }, { label: e.status ? 'Save' : 'Add to my list', primary: true, run: async () => {
        const patch = {};
        if ((status || 'PLANNING') !== e.status) patch.status = status || 'PLANNING';
        if (prog !== e.progress) patch.progress = prog;
        if (score !== e.score) patch.score = score;
        if (!Object.keys(patch).length) return true;
        return (await animeSave(e, patch)) !== false;
      } }] : [{ label: 'Close', primary: true }]),
    ],
  });
}

// Search AniList and add a show (signed in).
function animeAddSearch() {
  const input = h('input', { class: 'text-input', placeholder: 'Search AniList', spellcheck: 'false' });
  const results = h('div', { class: 'an-results' }, h('div', { class: 'help' }, 'Type a name and press Enter.'));
  const run = async () => {
    const q = input.value.trim();
    if (!q) return;
    results.replaceChildren(h('div', { class: 'help' }, 'Searching…'));
    const r = await api.animeSearch(q);
    if (!r.ok) { results.replaceChildren(h('div', { class: 'note err' }, r.error)); return; }
    const mine = new Map(((S.anime && S.anime.entries) || []).map((x) => [x.mediaId, x]));
    results.replaceChildren(...(r.results.length ? r.results.map((m) => {
      const have = mine.get(m.mediaId);
      return h('button', { class: 'an-res', onclick: () => { if (S.modals.length) S.modals[S.modals.length - 1](); setTimeout(() => openAnimeDetails(have || m), 30); } },
        animeArt(m, 'an-res-art'),
        h('div', { class: 'an-air-text' }, h('b', { title: m.title }, m.title), h('span', {}, [fmtFormat(m.format), m.episodes ? `${m.episodes} ep` : null, m.year || null].filter(Boolean).join(' · ')), have ? h('span', { class: 'an-when' }, A_STATUS[have.status] || 'On your list') : null));
    }) : [h('div', { class: 'help' }, 'Nothing found.')]));
  };
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') run(); });
  openModal({ title: 'Add anime', body: h('div', { class: 'an-add' }, h('div', { class: 'row' }, input, h('button', { class: 'btn primary', onclick: run }, 'Search')), results), actions: [{ label: 'Close' }] });
  setTimeout(() => input.focus(), 50);
}

// ---------- Surprise me ----------
function animeSurprisePanel() {
  const pool = prefs.get('animePool', 'planned');
  const short = prefs.get('animeShort', false);
  const genre = prefs.get('animeGenre', '');
  const genres = [...new Set(((S.anime && S.anime.entries) || []).flatMap((e) => e.genres))].sort();
  const n = animeSurprisePool().length;
  const stage = h('div', { class: 'an-sp-stage' }, S.animePick ? animePickCard(S.animePick, S.animeFresh) : h('div', { class: 'an-sp-empty' }, icon('dice'), h('span', {}, n ? `${n} ${n === 1 ? 'show' : 'shows'} to pick from` : 'Nothing matches these choices')));
  return h('section', { class: 'an-surprise' },
    h('div', { class: 'an-sp-left' },
      h('div', { class: 'an-sp-title' }, icon('dice'), 'Surprise me'),
      h('div', { class: 'help' }, 'Can\'t decide what to watch? Pick where to choose from.'),
      h('div', { class: 'seg' }, A_POOLS.map(([k, label]) => h('button', { class: pool === k ? 'on' : '', onclick: () => { prefs.set('animePool', k); S.animePick = null; renderAnimePage(true); } }, label, h('span', { class: 'seg-count' }, String(animeIn(k).length))))),
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } },
        h('button', { class: 'chip' + (short ? ' on' : ''), onclick: () => { prefs.set('animeShort', !short); S.animePick = null; renderAnimePage(true); } }, '13 episodes or less'),
        h('select', { class: 'text-input an-genre', onchange: (ev) => { prefs.set('animeGenre', ev.target.value); S.animePick = null; renderAnimePage(true); } },
          h('option', { value: '' }, 'Any genre'), genres.map((g) => h('option', { value: g, selected: g === genre }, g)))),
      h('button', { class: 'btn primary an-sp-go', disabled: !n, onclick: () => animeSpin() }, icon('dice'), S.animePick ? 'Pick again' : 'Pick an anime')),
    stage);
}
function animeSurprisePool() {
  const short = prefs.get('animeShort', false);
  const genre = prefs.get('animeGenre', '');
  return animeIn(prefs.get('animePool', 'planned')).filter((e) => (!short || (e.episodes && e.episodes <= 13)) && (!genre || e.genres.includes(genre)));
}
function animeSpin() {
  const pool = animeSurprisePool();
  if (!pool.length) return;
  const poolName = (A_POOLS.find((x) => x[0] === prefs.get('animePool', 'planned')) || [0, 'All'])[1];
  const extras = [prefs.get('animeShort', false) ? 'short' : '', prefs.get('animeGenre', '')].filter(Boolean).join(', ');
  // The same full screen reel as the games' Surprise me: spinning covers, sound, sparks and the show's banner.
  S.spin = spinOverlay(pool, `your ${poolName.toLowerCase()} anime${extras ? ` (${extras})` : ''}`, {
    primaryLabel: 'Watch',
    art: (e) => animeArt(e, 'art an-spin-art'),
    bg: (e) => (e.banner ? { url: e.banner, real: true } : e.cover ? { url: e.cover } : { color: e.color || '#15151a' }),
    show: (e, { name, meta, playBtn, detBtn, close }) => {
      S.animePick = e;
      const left = e.episodes ? Math.max(0, e.episodes - e.progress) : 0;
      const mins = (left || e.episodes) * (e.duration || 24);
      name.textContent = e.title;
      meta.replaceChildren(...[
        h('span', { class: 'chip-src an-src' }, A_STATUS[e.status] || 'AniList'),
        e.format ? h('span', {}, fmtFormat(e.format)) : null,
        e.episodes ? h('span', {}, e.progress && left ? `${left} of ${e.episodes} episodes left` : `${e.episodes} episodes`) : null,
        mins ? h('span', {}, icon('clock'), mins >= 60 ? `about ${Math.round(mins / 60)} h` : `${mins} min`) : null,
        e.season ? h('span', {}, e.season) : null,
        e.avg ? h('span', {}, icon('star'), `${e.avg}%`) : null,
        e.score ? h('span', {}, `Your score ${e.score}`) : null,
        e.genres.length ? h('span', {}, e.genres.slice(0, 3).join(', ')) : null,
      ].filter(Boolean));
      const s0 = e.streams[0];
      playBtn.replaceChildren(icon('play'), s0 ? `Watch on ${s0.site}` : 'Open on AniList');
      playBtn.onclick = () => { close(); api.openExternal(s0 ? s0.url : e.url); };
      detBtn.onclick = () => { close(); setTimeout(() => openAnimeDetails(e), 280); };
      // The panel on the page shows the pick too, for when the reel is closed.
      if (S.view.type === 'anime') renderAnimePage(true);
    },
  });
}

function animePickCard(e, fresh) {
  const left = e.episodes ? Math.max(0, e.episodes - e.progress) : 0;
  const mins = left * (e.duration || 24);
  return h('div', { class: 'an-pick' + (fresh ? ' fresh' : '') },
    animeArt(e, 'an-pick-art'),
    h('div', { class: 'an-pick-text' },
      h('span', { class: 'an-pick-kicker' }, A_STATUS[e.status] || ''),
      h('b', { title: e.title }, e.title),
      h('span', {}, [fmtFormat(e.format), e.episodes ? `${e.episodes} ep` : null, e.season, e.avg ? `${e.avg}%` : null].filter(Boolean).join(' · ')),
      e.progress && left ? h('span', {}, `${left} episodes left, about ${mins >= 60 ? `${Math.round(mins / 60)} h` : `${mins} min`}`) : e.episodes && !e.progress ? h('span', {}, `About ${Math.round((e.episodes * (e.duration || 24)) / 60)} h to watch`) : null,
      h('div', { class: 'an-genres' }, e.genres.slice(0, 4).map((g) => h('span', {}, g))),
      h('div', { class: 'row', style: { gap: '8px', marginTop: '6px', flexWrap: 'wrap' } },
        e.streams.length ? h('button', { class: 'btn primary', onclick: () => api.openExternal(e.streams[0].url) }, icon('play'), `Watch on ${e.streams[0].site}`) : null,
        h('button', { class: 'btn', onclick: () => openAnimeDetails(e) }, 'Details'))));
}

// ---------- not set up yet ----------
function animeSetup() {
  const input = h('input', { class: 'text-input', placeholder: 'Your AniList user name', spellcheck: 'false', value: S.lib.settings.anilistUser || '' });
  const go = async () => {
    const v = input.value.trim();
    if (!v) return;
    await api.updateSettings({ anilistUser: v });
    S.anime = null;
    loadAnime(true);
  };
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') go(); });
  return h('div', { class: 'an-setup' },
    h('div', { class: 'an-setup-ic' }, icon('tv')),
    h('h2', {}, 'Your anime, from AniList'),
    h('p', {}, 'Enter your AniList user name to see what you are watching, have planned and have finished, and let Surprise me pick your next show. No password needed for that.'),
    h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } }, input, h('button', { class: 'btn primary', onclick: go }, 'Connect')),
    h('p', { class: 'help' }, 'To change episodes, status and scores from here, also sign in to AniList in Settings, Connections.'),
    h('div', { class: 'row', style: { gap: '8px', justifyContent: 'center' } },
      h('button', { class: 'btn', onclick: () => api.openExternal('https://anilist.co/signup') }, 'Make an AniList account'),
      h('button', { class: 'btn', onclick: () => openConnectionsHelp('anilist') }, 'How to sign in')));
}

// ---------- Settings, Connections ----------
function anilistConnBlock(s, connBlock) {
  const user = h('input', { class: 'text-input', placeholder: 'AniList user name', value: s.anilistUser || '', spellcheck: 'false' });
  const cid = h('input', { class: 'text-input', placeholder: 'API client ID (only to sign in)', value: s.anilistClientId || '', spellcheck: 'false', style: { maxWidth: '220px' } });
  for (const el of [user, cid]) el.addEventListener('keydown', (e) => e.stopPropagation());
  user.addEventListener('change', async () => { await api.updateSettings({ anilistUser: user.value.trim() }); S.anime = null; });
  cid.addEventListener('change', async () => { await api.updateSettings({ anilistClientId: cid.value.trim() }); });
  const btn = h('button', { class: 'btn', onclick: async () => {
    if (s.anilistConnected) {
      if (!(await confirmBox('Sign out of AniList?', 'Your list still shows using your user name. You just cannot change it from here.', 'Sign out'))) return;
      await api.animeSignOut(); S.anime = null; showToast('Signed out of AniList'); return;
    }
    btn.disabled = true;
    const r = await api.animeSignIn(cid.value.trim());
    btn.disabled = false;
    if (r && r.ok) { S.anime = null; showToast(`Signed in to AniList as ${r.name}`); } else if (r && r.error) showToast(r.error, 'error');
  } }, s.anilistConnected ? 'Sign out' : 'Sign in');
  return connBlock('AniList', !!(s.anilistUser || s.anilistConnected), s.anilistConnected ? `Signed in${s.anilistName ? ` as ${s.anilistName}` : ''}` : s.anilistUser ? `Reading ${s.anilistUser}'s list` : null, 'anilist',
    h('div', { class: 'help' }, 'Your anime list for the Anime page. The user name is enough to read a public list. Sign in to change episodes, status and scores, or to see a private list.'),
    h('div', { class: 'field', style: { marginTop: '10px' } }, h('label', {}, 'AniList user name'), user),
    h('div', { class: 'field' }, h('label', {}, 'Sign in'), h('div', { class: 'row' }, cid, btn)),
    toggleRow('New episode alerts', 'A pop up when a new episode of a show you are watching comes out', s.animeAlerts !== false, (v) => api.updateSettings({ animeAlerts: v })));
}

// The Home tile: what is airing next, or how many shows you are watching.
function animeTileText() {
  const a = S.anime;
  if (!a || !a.configured) return 'Track your anime with AniList';
  const w = animeIn('watching');
  const next = w.filter((e) => e.next && e.next.at > Date.now()).sort((x, y) => x.next.at - y.next.at)[0];
  if (next) return `${next.title} ep ${next.next.episode} in ${untilText(next.next.at)}`;
  return `${w.length} watching · ${animeIn('planned').length} planned`;
}

document.addEventListener('DOMContentLoaded', () => {
  S.anime = null;
  // Load once shortly after start so the Home tile has something to say.
  setTimeout(() => { if (S.lib && S.lib.settings && (S.lib.settings.anilistUser || S.lib.settings.anilistConnected)) loadAnime(false); }, 6000);
  // Countdowns and the list stay fresh while the page is open.
  setInterval(() => {
    const box = $('#animeView');
    if (S.view.type !== 'anime' || !S.anime || !S.anime.configured || !box) return;
    if (document.querySelector('.spin') || (document.activeElement && box.contains(document.activeElement) && /input|select/i.test(document.activeElement.tagName))) return;
    renderAnimePage(true);
  }, 60000);
  setInterval(() => { if (S.anime && S.anime.configured) loadAnime(false); }, 11 * 60000);
});
