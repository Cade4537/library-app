// 0.18.0: lyrics and artwork for the Now Playing screen.
// Lyrics come from LRCLIB (lrclib.net), a free public lyrics database with line timings. Nothing is
// stored in Crimson Vault itself: each song's lyrics are requested while it plays and kept in memory.
// Artwork: the album cover in high resolution from Apple's public iTunes search, and an artist photo
// from Deezer's public search. Neither needs an account or key.

const UA = 'CrimsonVault (https://github.com/Cade4537/library-app)';
const TIMEOUT = 10000;

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// Apple Music for Windows sends "Artist — Album" in the artist field; tidy names for searching.
function clean(t) {
  const artist = String(t.artist || '').split(/\s+—\s+/)[0].trim();
  const album = String(t.album || String(t.artist || '').split(/\s+—\s+/)[1] || '').trim();
  const title = String(t.title || '').trim();
  // Search without "(feat. X)", "[Remastered 2011]" and similar when the exact name finds nothing.
  const bare = title.replace(/\s*[([](feat\.?|ft\.?|with|remaster|remastered|deluxe|live|explicit|clean|radio edit|bonus)[^)\]]*[)\]]/gi, '').replace(/\s+-\s+(remaster(ed)?|live|radio edit|single version).*$/i, '').trim();
  return { artist, album, title, bare, dur: Math.round(Number(t.dur) || 0) };
}

// "[01:23.45] words" lines into [{ t: seconds, text }].
function parseLrc(lrc) {
  const out = [];
  for (const raw of String(lrc || '').split(/\r?\n/)) {
    const tags = [...raw.matchAll(/\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    if (!tags.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of tags) {
      const frac = m[3] ? Number(m[3]) / (m[3].length === 3 ? 1000 : 100) : 0;
      out.push({ t: Number(m[1]) * 60 + Number(m[2]) + frac, text });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

class Lyrics {
  constructor() {
    this.cache = new Map(); // key -> result (last 60 songs)
    this.extraCache = new Map();
  }

  remember(map, key, val) {
    map.delete(key);
    map.set(key, val);
    while (map.size > 60) map.delete(map.keys().next().value);
  }

  // { synced: [{t, text}] | null, plain: string | null, instrumental, source }
  async lyrics(track) {
    const c = clean(track);
    if (!c.title || !c.artist) return { none: true };
    const key = `${c.artist}|${c.title}|${c.album}`.toLowerCase();
    if (this.cache.has(key)) return this.cache.get(key);
    let hit = null;
    try {
      // 1. Exact match by name, artist, album and length.
      const q = new URLSearchParams({ track_name: c.title, artist_name: c.artist });
      if (c.album) q.set('album_name', c.album);
      if (c.dur) q.set('duration', String(c.dur));
      hit = await getJson(`https://lrclib.net/api/get?${q}`);
      // 2. A search, preferring synced lyrics with a length close to the song's.
      if (!hit || (!hit.syncedLyrics && !hit.plainLyrics && !hit.instrumental)) {
        for (const title of [...new Set([c.title, c.bare])]) {
          const list = await getJson(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: title, artist_name: c.artist })}`);
          const ok = (list || []).filter((x) => !c.dur || !x.duration || Math.abs(x.duration - c.dur) <= 4);
          hit = ok.find((x) => x.syncedLyrics) || ok.find((x) => x.plainLyrics) || ok.find((x) => x.instrumental) || null;
          if (hit) break;
        }
      }
    } catch (e) {
      return { error: 'Lyrics could not be reached right now.' };
    }
    const synced = hit && hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : null;
    const r = hit
      ? { synced: synced && synced.length ? synced : null, plain: hit.plainLyrics || null, instrumental: !!hit.instrumental, source: 'LRCLIB' }
      : { none: true };
    this.remember(this.cache, key, r);
    return r;
  }

  // { art, artistImage, year, genre, albumUrl }
  async extras(track) {
    const c = clean(track);
    if (!c.title) return {};
    const key = `${c.artist}|${c.title}`.toLowerCase();
    if (this.extraCache.has(key)) return this.extraCache.get(key);
    const out = {};
    try {
      const j = await getJson(`https://itunes.apple.com/search?media=music&entity=song&limit=8&term=${encodeURIComponent(`${c.artist} ${c.bare || c.title}`)}`);
      const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      const list = (j && j.results) || [];
      const r = list.find((x) => norm(x.trackName) === norm(c.title) && norm(x.artistName).includes(norm(c.artist).slice(0, 6))) || list.find((x) => norm(x.artistName).includes(norm(c.artist).slice(0, 6))) || null;
      if (r) {
        if (r.artworkUrl100) out.art = r.artworkUrl100.replace(/100x100bb/, '1200x1200bb');
        if (r.releaseDate) out.year = new Date(r.releaseDate).getFullYear();
        if (r.primaryGenreName) out.genre = r.primaryGenreName;
        if (r.collectionName) out.album = r.collectionName;
        if (r.collectionViewUrl) out.albumUrl = r.collectionViewUrl;
      }
    } catch {}
    try {
      const d = await getJson(`https://api.deezer.com/search/artist?limit=3&q=${encodeURIComponent(c.artist)}`);
      const a = d && d.data && d.data.find((x) => String(x.name).toLowerCase() === c.artist.toLowerCase()) || (d && d.data && d.data[0]);
      if (a && a.picture_xl && !/\/artist\/\/|\/images\/artist\/\//.test(a.picture_xl)) out.artistImage = a.picture_xl;
    } catch {}
    this.remember(this.extraCache, key, out);
    return out;
  }
}

module.exports = { Lyrics, parseLrc };
