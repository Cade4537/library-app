/* global api, S, h, icon, prefs, openMenu, showToast, norm */
// 0.17.0: Watch sites for the Anime page. You list the sites you use (in order); for each show,
// Crimson Vault opens the exact page when AniList knows it, otherwise that site's own search,
// otherwise a web search limited to that site that jumps straight to the first result.

// Legal streaming services with a known search page. {q} is the show's title.
const WATCH_PRESETS = {
  'crunchyroll.com': { name: 'Crunchyroll', search: 'https://www.crunchyroll.com/search?q={q}', aliases: ['crunchyroll'] },
  'hidive.com': { name: 'HIDIVE', search: 'https://www.hidive.com/search?q={q}', aliases: ['hidive'] },
  'netflix.com': { name: 'Netflix', search: 'https://www.netflix.com/search?q={q}', aliases: ['netflix'] },
  'hulu.com': { name: 'Hulu', search: 'https://www.hulu.com/search?q={q}', aliases: ['hulu'] },
  'primevideo.com': { name: 'Prime Video', search: 'https://www.primevideo.com/search/?phrase={q}', aliases: ['amazon', 'prime video', 'amazon prime video'] },
  'disneyplus.com': { name: 'Disney+', search: 'https://www.disneyplus.com/search?q={q}', aliases: ['disney plus', 'disney+'] },
  'max.com': { name: 'Max', search: 'https://play.max.com/search?q={q}', aliases: ['max', 'hbo max'] },
  'youtube.com': { name: 'YouTube', search: 'https://www.youtube.com/results?search_query={q}', aliases: ['youtube'] },
  'tubitv.com': { name: 'Tubi', search: 'https://tubitv.com/search/{q}', aliases: ['tubi', 'tubi tv'] },
  'retrocrush.tv': { name: 'RetroCrush', search: '', aliases: ['retrocrush'] },
};
const WATCH_DEFAULT = ['crunchyroll.com', 'hidive.com', 'netflix.com', 'hulu.com', 'primevideo.com'];

// Turns whatever was typed ("https://www.Crunchyroll.com/videos") into "crunchyroll.com".
function cleanDomain(s) {
  let d = String(s || '').trim().toLowerCase();
  d = d.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : '';
}
function watchSites() {
  const list = prefs.get('animeSites', null);
  return (Array.isArray(list) ? list : WATCH_DEFAULT.map((d) => ({ domain: d }))).filter((x) => x && cleanDomain(x.domain));
}
const siteName = (d) => (WATCH_PRESETS[d] ? WATCH_PRESETS[d].name : d.replace(/\.[a-z]+$/, '').replace(/^./, (c) => c.toUpperCase()));
function searchTitle(e) {
  const pref = prefs.get('animeTitleLang', 'english');
  return (pref === 'romaji' ? e.romaji || e.title : e.title || e.romaji).trim();
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; } };

// Every place this show can be opened, in your order: { site, domain, url, exact }.
function watchTargets(e) {
  const out = [];
  const q = encodeURIComponent(searchTitle(e));
  for (const s of watchSites()) {
    const d = cleanDomain(s.domain);
    const preset = WATCH_PRESETS[d];
    // 1. AniList's own link to this show on that site.
    const exact = (e.streams || []).find((x) => { const hh = hostOf(x.url); return hh === d || hh.endsWith(`.${d}`) || (preset && preset.aliases.includes(norm(x.site))); });
    if (exact) { out.push({ site: siteName(d), domain: d, url: exact.url, exact: true }); continue; }
    // 2. Your own search link, then the site's known search page.
    const tpl = (s.template && /^https:\/\//i.test(s.template) && s.template.includes('{title}') ? s.template.replace('{title}', '{q}') : '') || (preset && preset.search) || '';
    if (tpl) { out.push({ site: siteName(d), domain: d, url: tpl.replace('{q}', q), exact: false }); continue; }
    // 3. A web search limited to that site that opens the first result.
    out.push({ site: siteName(d), domain: d, url: `https://duckduckgo.com/?q=${encodeURIComponent(`\\ site:${d} ${searchTitle(e)}`)}`, exact: false, web: true });
  }
  // AniList links for sites not on your list come last.
  for (const x of e.streams || []) if (!out.some((o) => o.url === x.url)) out.push({ site: x.site, domain: hostOf(x.url), url: x.url, exact: true, extra: true });
  return out;
}
const watchLabel = (t) => `${t.exact ? 'Watch on' : 'Find on'} ${t.site}`;
function watchOpen(t) { if (t) api.openExternal(t.url); }

// A "Watch on" button with a small arrow that lists every other site.
function watchButton(e, { primary = true, onGo } = {}) {
  const ts = watchTargets(e);
  if (!ts.length) return h('button', { class: 'btn' + (primary ? ' primary' : ''), onclick: () => { if (onGo) onGo(); api.openExternal(e.url); } }, icon('play'), 'Open on AniList');
  const go = (t) => { if (onGo) onGo(); watchOpen(t); };
  const main = h('button', { class: 'btn' + (primary ? ' primary' : ''), title: ts[0].exact ? ts[0].url : `Searches ${ts[0].site} for ${searchTitle(e)}`, onclick: () => go(ts[0]) }, icon(ts[0].exact ? 'play' : 'search'), watchLabel(ts[0]));
  if (ts.length < 2) return main;
  const more = h('button', { class: 'btn split-more' + (primary ? ' primary' : ''), title: 'Other sites', 'aria-label': 'Other sites', onclick: (ev) => { ev.stopPropagation(); watchMenu(e, { el: more }, onGo); } }, icon('chevronDown'));
  return h('span', { class: 'split-btn' }, main, more);
}
function watchMenu(e, pos, onGo) {
  const ts = watchTargets(e);
  openMenu(ts.map((t) => ({ label: watchLabel(t), hint: t.exact ? 'exact page' : t.web ? 'web search' : 'site search', run: () => { if (onGo) onGo(); watchOpen(t); } })), pos);
}

// The "Where to watch" row in the details window.
function watchRow(e, onGo) {
  const ts = watchTargets(e);
  if (!ts.length) return null;
  return h('div', { class: 'an-streams' },
    h('h3', { class: 'section-title' }, 'Where to watch'),
    h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, ts.map((t) => h('button', { class: 'btn' + (t.exact ? ' exact' : ''), title: t.exact ? 'AniList links straight to this show' : t.web ? `Web search on ${t.domain}` : `Searches ${t.site}`, onclick: () => { if (onGo) onGo(); watchOpen(t); } }, icon(t.exact ? 'check' : 'search'), t.site))),
    h('div', { class: 'help', style: { marginTop: '6px' } }, 'Check mark: the exact page. Magnifier: a search for the show on that site. Change the list in Settings, Connections, AniList.'));
}

// Settings: the list of sites, in order, with an optional search link for each.
function watchSitesEditor() {
  const box = h('div', { class: 'ws-edit' });
  const save = (list) => { prefs.set('animeSites', list); draw(); };
  const draw = () => {
    const list = watchSites();
    const add = h('input', { class: 'text-input', placeholder: 'Add a site, like crunchyroll.com', spellcheck: 'false' });
    const doAdd = () => {
      const d = cleanDomain(add.value);
      if (!d) { showToast('Type a site address like crunchyroll.com', 'error'); return; }
      if (list.some((x) => cleanDomain(x.domain) === d)) { showToast(`${d} is already on the list`); return; }
      save([...list, { domain: d }]);
    };
    add.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.key === 'Enter') { ev.preventDefault(); doAdd(); } });
    const presetsLeft = Object.keys(WATCH_PRESETS).filter((d) => !list.some((x) => cleanDomain(x.domain) === d));
    box.replaceChildren(
      h('div', { class: 'ws-list' }, list.map((s, i) => {
        const d = cleanDomain(s.domain);
        const tpl = h('input', { class: 'text-input ws-tpl', placeholder: WATCH_PRESETS[d] && WATCH_PRESETS[d].search ? 'Optional: your own search link with {title}' : 'Optional: search link with {title} (otherwise a web search)', value: s.template || '', spellcheck: 'false' });
        tpl.addEventListener('keydown', (ev) => ev.stopPropagation());
        tpl.addEventListener('change', () => { const v = tpl.value.trim(); if (v && !(/^https:\/\//i.test(v) && v.includes('{title}'))) { showToast('A search link must start with https:// and contain {title}', 'error'); return; } const l = watchSites(); l[i] = { ...l[i], template: v || undefined }; prefs.set('animeSites', l); });
        return h('div', { class: 'ws-row' },
          h('span', { class: 'ws-n' }, String(i + 1)),
          h('div', { class: 'ws-main' }, h('b', {}, siteName(d)), h('span', {}, d)),
          tpl,
          h('button', { class: 'icon-btn', title: 'Move up', disabled: i === 0, onclick: () => { const l = watchSites(); [l[i - 1], l[i]] = [l[i], l[i - 1]]; save(l); } }, icon('chevronUp')),
          h('button', { class: 'icon-btn', title: 'Move down', disabled: i === list.length - 1, onclick: () => { const l = watchSites(); [l[i + 1], l[i]] = [l[i], l[i + 1]]; save(l); } }, icon('chevronDown')),
          h('button', { class: 'icon-btn', title: 'Remove', onclick: () => save(watchSites().filter((_, j) => j !== i)) }, icon('close')));
      })),
      h('div', { class: 'row', style: { gap: '8px', marginTop: '8px' } }, add, h('button', { class: 'btn', onclick: doAdd }, icon('plus'), 'Add')),
      presetsLeft.length ? h('div', { class: 'ws-presets' }, h('span', { class: 'help' }, 'Quick add:'), presetsLeft.map((d) => h('button', { class: 'chip', onclick: () => save([...watchSites(), { domain: d }]) }, WATCH_PRESETS[d].name))) : null);
  };
  draw();
  const lang = h('div', { class: 'seg' });
  const drawLang = () => lang.replaceChildren(...[['english', 'English title'], ['romaji', 'Japanese title']].map(([k, n]) => h('button', { class: prefs.get('animeTitleLang', 'english') === k ? 'on' : '', onclick: () => { prefs.set('animeTitleLang', k); drawLang(); } }, n)));
  drawLang();
  return h('div', {},
    h('div', { class: 'field', style: { marginTop: '12px' } }, h('label', {}, 'Watch sites, in order'), h('div', { class: 'help' }, 'Watch on uses the first site that fits. Crimson Vault opens the exact page when AniList knows it, otherwise it searches that site for the show.'), box),
    h('div', { class: 'field' }, h('label', {}, 'Search using'), lang, h('div', { class: 'help' }, 'Smaller sites often list shows under the Japanese name.')));
}
