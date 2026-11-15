/* global S, api, h, icon, fillEl, openModal, openDetails, openShots, keyshopPanel, norm, prefs, showToast */
// 0.22.0: the Store page. Browse or search any game on Steam, not just the ones you own, and see its
// Steam price next to the lowest official and keyshop prices from GG.deals, with Loaded, Instant
// Gaming and every other offer one click away. Games you already own are marked and open your copy.

const STORE = { q: '', results: null, featured: null, timer: 0, seq: 0 };

function storeMoney(v, cur) {
  if (v == null || Number.isNaN(Number(v))) return '';
  if (Number(v) === 0) return 'Free';
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD' }).format(Number(v)); } catch { return `${v} ${cur || ''}`.trim(); }
}

// Your copy of a Steam game, if you have one.
function storeOwned(appid) {
  const id = String(appid);
  return S.lib.items.find((it) => it.kind === 'game' && String(it.steamAppId || '') === id) || null;
}

function storeCard(g) {
  const own = storeOwned(g.appid);
  const pr = g.price;
  const disc = g.discount || (pr && pr.initial > pr.final ? Math.round((1 - pr.final / pr.initial) * 100) : 0);
  return h('button', { class: 'sto-card', title: g.name, onclick: () => openStoreGame(g.appid, g) },
    h('div', { class: 'sto-img' }, h('img', { src: g.img, alt: '', loading: 'lazy', onerror: (e) => { e.target.remove(); } }),
      own ? h('span', { class: 'sto-own' }, icon('check'), 'Owned') : null),
    h('div', { class: 'sto-meta' },
      h('b', { class: 'sto-name' }, g.name),
      h('div', { class: 'sto-price' },
        disc > 0 ? h('span', { class: 'sto-disc' }, `-${disc}%`) : null,
        disc > 0 && pr ? h('s', {}, storeMoney(pr.initial, pr.currency)) : null,
        h('span', { class: 'sto-now' }, pr ? storeMoney(pr.final, pr.currency) : 'See price'))));
}

function storeRow(title, items) {
  return h('section', { class: 'sto-row' }, h('h3', { class: 'section-title' }, title), h('div', { class: 'sto-grid' }, items.map(storeCard)));
}

async function renderStorePage() {
  const box = $('#storeView');
  const input = h('input', { class: 'text-input sto-search', type: 'search', placeholder: 'Search any game on Steam', value: STORE.q, spellcheck: 'false', 'aria-label': 'Search the store' });
  const body = h('div', { class: 'sto-body' });
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; input.dispatchEvent(new Event('input')); } });
  input.addEventListener('input', () => {
    STORE.q = input.value;
    clearTimeout(STORE.timer);
    STORE.timer = setTimeout(() => drawStoreBody(body), 300);
  });
  fillEl(box,
    h('div', { class: 'sto-top' }, h('span', { class: 'sto-sicon' }, icon('search')), input),
    h('div', { class: 'help sto-help' }, S.lib.settings.ggDealsKey
      ? 'Prices from Steam. Open a game to compare official stores and keyshops like Loaded and Instant Gaming.'
      : 'Prices from Steam. Add a free GG.deals key in Settings, Connections to also compare official stores and keyshops when you open a game.'),
    body);
  drawStoreBody(body);
  setTimeout(() => input.focus(), 30);
}

async function drawStoreBody(body) {
  const seq = ++STORE.seq;
  const q = STORE.q.trim();
  if (q) {
    fillEl(body, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), `Searching for ${q}`));
    const r = await api.storeSearch(q).catch(() => ({ error: 'Steam store could not be reached.' }));
    if (seq !== STORE.seq) return;
    if (r.error) { fillEl(body, h('div', { class: 'friends-empty' }, h('h3', {}, 'Search did not work'), h('p', {}, r.error))); return; }
    if (!r.items.length) { fillEl(body, h('div', { class: 'friends-empty' }, h('h3', {}, `No games called ${q}`), h('p', {}, 'Try a shorter name or check the spelling. The store covers games sold on Steam.'))); return; }
    fillEl(body, storeRow(`Results for ${q}`, r.items));
    return;
  }
  if (!STORE.featured) {
    fillEl(body, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading the store'));
    STORE.featured = await api.storeFeatured().catch(() => ({ error: 'Steam store could not be reached.' }));
    if (seq !== STORE.seq) return;
  }
  const f = STORE.featured;
  if (f.error) { STORE.featured = null; fillEl(body, h('div', { class: 'friends-empty' }, h('h3', {}, 'The store did not load'), h('p', {}, f.error))); return; }
  fillEl(body, ...f.rows.map((r) => storeRow(r.title, r.items)));
}

async function openStoreGame(appid, preview) {
  const own = storeOwned(appid);
  const heroBg = h('div', { class: 'det-hero', style: { backgroundImage: `url("https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_hero.jpg")` } });
  const name = (preview && preview.name) || 'Game';
  const title = h('h2', { class: 'det-name' }, name);
  const kicker = h('div', { class: 'det-kicker' }, own ? 'In your library' : 'Steam store');
  const steamPrice = h('div', { class: 'sto-steam' });
  const about = h('div', { class: 'det-about' }, h('div', { class: 'loading' }, h('span', { class: 'spinner' }), 'Loading'));
  const actions = h('div', { class: 'det-actions' },
    own ? h('button', { class: 'btn primary', onclick: () => { m.close(); openDetails(own.id); } }, icon('play'), 'Open in library') : null,
    h('button', { class: own ? 'btn' : 'btn primary', onclick: () => api.openUrl(`steam://store/${appid}`) }, icon('external'), 'Steam store page'));
  let m;
  const body = h('div', { class: 'det' },
    heroBg, h('div', { class: 'det-hero-shade' }),
    h('div', { class: 'det-top' },
      h('div', { class: 'det-art sto-art' }, h('img', { src: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`, alt: '', onerror: (e) => { e.target.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/header.jpg`; } })),
      h('div', { class: 'det-info' }, kicker, title, steamPrice, actions,
        keyshopPanel(name, () => api.storePrices(appid)))),
    about);
  m = openModal({ title: null, body, cls: 'wide details-modal' });
  m.panel.querySelector('.modal-body').style.padding = '0';
  const info = await api.storeApp(appid).catch(() => null);
  if (!info) { about.replaceChildren(h('p', { class: 'det-desc' }, 'Steam did not return details for this game.')); return; }
  title.textContent = info.name || name;
  if (info.bg) heroBg.style.backgroundImage = `url("${info.hero}"), url("${info.bg}")`;
  const pr = info.price;
  fillEl(steamPrice,
    h('span', { class: 'sto-steam-l' }, 'Steam'),
    info.free ? h('b', {}, 'Free to play')
      : pr ? h('span', {}, pr.discount ? h('span', { class: 'sto-disc' }, `-${pr.discount}%`) : null, pr.discount ? h('s', {}, storeMoney(pr.initial, pr.currency)) : null, h('b', {}, storeMoney(pr.final, pr.currency)))
        : h('b', {}, info.date && /^Coming/.test(info.date) ? info.date : 'Not for sale on Steam'));
  const facts = [info.date ? ['Released', info.date] : null, info.devs.length ? ['Developer', info.devs.join(', ')] : null, info.pubs.length ? ['Publisher', info.pubs.join(', ')] : null, info.genres.length ? ['Genre', info.genres.join(', ')] : null, info.metacritic ? ['Metacritic', String(info.metacritic)] : null].filter(Boolean);
  fillEl(about,
    info.desc ? h('p', { class: 'det-desc' }, info.desc) : null,
    facts.length ? h('div', { class: 'det-facts' }, facts.map(([k, v]) => h('div', {}, h('span', {}, k), v))) : null,
    info.shots.length ? h('div', { class: 'det-shots' }, info.shots.map((sh, i) => h('button', { class: 'shot', onclick: () => openShots(info.shots, i) }, h('img', { src: sh.thumb, alt: '', loading: 'lazy' })))) : null);
}
