// 0.16.5: AniList, for the Anime page. Reading a list only needs the AniList user name (lists are public
// unless the user made them private). Updating episodes, status and score needs a one time sign in through
// AniList's own page, using an API client the user creates at anilist.co/settings/developer.
const { BrowserWindow, session } = require('electron');

const API = 'https://graphql.anilist.co';
const PARTITION = 'persist:anilist';
const PIN = 'https://anilist.co/api/v2/oauth/pin';

const MEDIA_FIELDS = `
  id idMal siteUrl format status episodes duration season seasonYear averageScore popularity genres isAdult
  title { romaji english userPreferred }
  coverImage { extraLarge large color }
  bannerImage
  description(asHtml: false)
  studios(isMain: true) { nodes { name } }
  nextAiringEpisode { episode airingAt }
  externalLinks { site url type }
`;

const LIST_QUERY = `query ($name: String, $id: Int) {
  MediaListCollection(userName: $name, userId: $id, type: ANIME, sort: UPDATED_TIME_DESC) {
    user { id name avatar { large } siteUrl }
    lists { name status isCustomList entries {
      id status progress repeat updatedAt notes
      score(format: POINT_10_DECIMAL)
      startedAt { year month day } completedAt { year month day }
      media { ${MEDIA_FIELDS} }
    } }
  }
}`;

const SAVE = `mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int, $score: Float) {
  SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, score: $score) {
    id status progress score(format: POINT_10_DECIMAL) updatedAt
  }
}`;

const SEARCH = `query ($q: String) { Page(perPage: 20) { media(search: $q, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} } } }`;

class AniList {
  constructor(store) {
    this.store = store;
    this.cache = null;
    this.last = 0;
  }

  get s() { return this.store.data.settings; }
  get user() { return String(this.s.anilistUser || '').trim(); }
  get token() { const a = this.s.anilistAuth; return a && a.token && (!a.expiresAt || a.expiresAt > Date.now()) ? a.token : ''; }
  get configured() { return !!(this.user || this.token); }

  async gql(query, variables, auth) {
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(20000) });
    let j = null;
    try { j = await res.json(); } catch {}
    if (res.status === 429) throw new Error('AniList is busy right now (too many requests). Try again in a minute.');
    if (!res.ok || (j && j.errors && j.errors.length)) {
      const msg = (j && j.errors && j.errors[0] && j.errors[0].message) || `AniList answered ${res.status}`;
      if (/private/i.test(msg)) throw new Error('That AniList list is private. Sign in to AniList in Settings to see it.');
      if (/not found/i.test(msg)) throw new Error(`No AniList user called "${this.user}". Check the name in Settings.`);
      if (res.status === 401 || /invalid token|unauthorized/i.test(msg)) { delete this.s.anilistAuth; this.store.changed(); throw new Error('AniList sign in expired. Sign in again in Settings.'); }
      throw new Error(msg);
    }
    return j.data;
  }

  // The whole anime list, flattened to one entry per show.
  async list(force) {
    if (!this.configured) return { configured: false, entries: [] };
    if (!force && this.cache && Date.now() - this.last < 10 * 60 * 1000) return this.cache;
    // Signed in: use the account's own id, which also shows a private list.
    const vars = this.token && this.s.anilistAuth.userId ? { id: this.s.anilistAuth.userId } : { name: this.user };
    const d = await this.gql(LIST_QUERY, vars, !!this.token);
    const col = d.MediaListCollection || {};
    const seen = new Set();
    const entries = [];
    for (const l of col.lists || []) {
      for (const e of l.entries || []) {
        if (seen.has(e.media.id)) continue;
        seen.add(e.media.id);
        entries.push(slim(e));
      }
    }
    this.cache = { configured: true, user: col.user ? { name: col.user.name, avatar: col.user.avatar && col.user.avatar.large, url: col.user.siteUrl } : { name: this.user }, canEdit: !!this.token, entries, updated: Date.now() };
    this.last = Date.now();
    return this.cache;
  }

  async search(q) {
    const d = await this.gql(SEARCH, { q: String(q || '').slice(0, 100) }, !!this.token);
    return ((d.Page && d.Page.media) || []).filter((m) => !m.isAdult).map((m) => slim({ media: m, status: null, progress: 0, score: 0 }));
  }

  // Change an entry: status, episodes watched, score (0 to 10). Needs the sign in.
  async save(mediaId, patch) {
    if (!this.token) throw new Error('Sign in to AniList in Settings to update your list from here.');
    const v = { mediaId: Number(mediaId) };
    if (patch.status) v.status = patch.status;
    if (patch.progress != null) v.progress = Math.max(0, Math.floor(Number(patch.progress) || 0));
    if (patch.score != null) v.score = Math.max(0, Math.min(10, Number(patch.score) || 0));
    const d = await this.gql(SAVE, v, true);
    const r = d.SaveMediaListEntry;
    // Keep the cached list in step without fetching everything again.
    if (this.cache) {
      const e = this.cache.entries.find((x) => x.mediaId === Number(mediaId));
      if (e) Object.assign(e, { status: r.status, progress: r.progress, score: r.score, updatedAt: r.updatedAt * 1000 });
      else this.cache = null;
    }
    return r;
  }

  // Sign in through AniList's own page. AniList shows the token on its "pin" page, which is read from the address.
  signIn(parent, clientId) {
    const id = String(clientId || this.s.anilistClientId || '').trim();
    if (!/^\d+$/.test(id)) return Promise.resolve({ ok: false, error: 'Enter your AniList API client ID first (see How to set up).' });
    return new Promise((resolve) => {
      const win = new BrowserWindow({ width: 520, height: 760, parent, modal: !!parent, title: 'Sign in to AniList', autoHideMenuBar: true, backgroundColor: '#0b1622', webPreferences: { partition: PARTITION } });
      let done = false;
      const finish = async (url) => {
        if (done) return;
        const m = url && String(url).match(/[#&]access_token=([^&]+)/);
        if (url && !m) return;
        done = true;
        if (!win.isDestroyed()) win.close();
        if (!m) return resolve({ ok: false });
        const exp = String(url).match(/[#&]expires_in=(\d+)/);
        this.s.anilistAuth = { token: decodeURIComponent(m[1]), expiresAt: exp ? Date.now() + Number(exp[1]) * 1000 : 0 };
        this.s.anilistClientId = id;
        try {
          const d = await this.gql('{ Viewer { id name } }', {}, true);
          this.s.anilistAuth.userId = d.Viewer.id;
          this.s.anilistAuth.name = d.Viewer.name;
          if (!this.user) this.s.anilistUser = d.Viewer.name;
          this.cache = null;
          this.store.changed();
          resolve({ ok: true, name: d.Viewer.name });
        } catch (e) {
          delete this.s.anilistAuth;
          this.store.changed();
          resolve({ ok: false, error: e.message });
        }
      };
      const check = (u) => { if (u && /access_token=/.test(u)) finish(u); };
      win.webContents.on('will-redirect', (_e, u) => check(u));
      win.webContents.on('did-navigate', (_e, u) => check(u));
      win.webContents.on('did-navigate-in-page', (_e, u) => check(u));
      win.webContents.on('did-redirect-navigation', (_e, u) => check(u));
      win.on('closed', () => { if (!done) { done = true; resolve({ ok: false }); } });
      win.loadURL(`https://anilist.co/api/v2/oauth/authorize?client_id=${id}&response_type=token`);
    });
  }

  async signOut() {
    delete this.s.anilistAuth;
    this.cache = null;
    this.store.changed();
    await session.fromPartition(PARTITION).clearStorageData().catch(() => {});
  }
}

function slim(e) {
  const m = e.media || {};
  const t = m.title || {};
  const date = (d) => (d && d.year ? Date.UTC(d.year, (d.month || 1) - 1, d.day || 1) : 0);
  return {
    id: e.id || null,
    mediaId: m.id,
    status: e.status || null,
    progress: e.progress || 0,
    score: e.score || 0,
    repeat: e.repeat || 0,
    notes: e.notes || '',
    updatedAt: (e.updatedAt || 0) * 1000,
    startedAt: date(e.startedAt),
    completedAt: date(e.completedAt),
    title: t.english || t.userPreferred || t.romaji || 'Untitled',
    romaji: t.romaji || '',
    cover: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || '',
    color: (m.coverImage && m.coverImage.color) || '',
    banner: m.bannerImage || '',
    url: m.siteUrl || `https://anilist.co/anime/${m.id}`,
    format: m.format || '',
    airing: m.status || '',
    episodes: m.episodes || 0,
    duration: m.duration || 0,
    season: m.season ? `${m.season[0]}${m.season.slice(1).toLowerCase()} ${m.seasonYear || ''}`.trim() : m.seasonYear ? String(m.seasonYear) : '',
    year: m.seasonYear || 0,
    avg: m.averageScore || 0,
    popularity: m.popularity || 0,
    genres: m.genres || [],
    studio: (m.studios && m.studios.nodes && m.studios.nodes[0] && m.studios.nodes[0].name) || '',
    description: String(m.description || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim(),
    next: m.nextAiringEpisode ? { episode: m.nextAiringEpisode.episode, at: m.nextAiringEpisode.airingAt * 1000 } : null,
    streams: (m.externalLinks || []).filter((l) => l.type === 'STREAMING' && /^https:\/\//.test(l.url)).map((l) => ({ site: l.site, url: l.url })).slice(0, 6),
  };
}

module.exports = { AniList };
