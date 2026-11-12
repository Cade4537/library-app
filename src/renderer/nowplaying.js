/* global api, S, h, icon, prefs, NP, sendMedia, npArtist, npSourceLabel, openAppleMusic, fmtTime, showToast, renderHubMusic */
// 0.18.0: Now Playing. A full screen view of what is playing in Apple Music or Spotify (or any player
// Windows knows about): the album art and the artist's photo, colors taken from the cover, floating
// light, and lyrics that follow the song word by word when timed lyrics exist.

const NPX = { key: '', lyrics: null, extras: {}, palette: null, open: false, offset: 0, els: null, raf: 0, line: -1, particles: [], lastMove: 0 };

const npKey = (st) => (st && st.active ? `${st.title}|${st.artist}` : '');
// Where the song is right now, in seconds (smoothly, between the player's updates).
function npPos() {
  const st = NP.state;
  if (!st || !st.active) return 0;
  const p = NP.base + (st.status === 'Playing' ? (Date.now() - NP.at) / 1000 : 0);
  return Math.max(0, st.dur ? Math.min(st.dur, p) : p);
}
const npLyricsOn = () => prefs.get('npLyrics', true);

// ---------- new song: fetch lyrics and artwork ----------
async function npTrackChanged() {
  const st = NP.state;
  const key = npKey(st);
  if (key === NPX.key) return;
  NPX.key = key;
  NPX.lyrics = null; NPX.extras = {}; NPX.line = -1;
  NPX.offset = Number((prefs.get('npOffsets', {}) || {})[key]) || 0;
  if (!key) { npRender(); return; }
  const track = { title: st.title, artist: st.artist, album: st.album, dur: st.dur };
  npRender();
  if (S.lib.settings.musicEnabled === false) return;
  const [ly, ex] = await Promise.all([
    npLyricsOn() && api.musicLyrics ? api.musicLyrics(track).catch(() => null) : null,
    api.musicExtras ? api.musicExtras(track).catch(() => ({})) : {},
  ]);
  if (NPX.key !== key) return; // the song changed meanwhile
  NPX.lyrics = ly; NPX.extras = ex || {};
  npPalette(NPX.extras.art || st.art, st.art);
  npRender();
  if (S.view.type === 'hub' && typeof renderHubMusic === 'function') renderHubMusic();
}

// ---------- colors from the album cover ----------
function npPalette(src, fallback) {
  // Some image hosts do not allow reading their pixels; then the player's own thumbnail is used.
  if (!src) { if (fallback) return npPalette(fallback); NPX.palette = null; npApplyPalette(); return; }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const c = document.createElement('canvas'); c.width = 48; c.height = 48;
      const x = c.getContext('2d', { willReadFrequently: true });
      x.drawImage(img, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data;
      // Bucket colorful pixels by hue and keep the three strongest.
      const buckets = new Map();
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const sat = mx ? (mx - mn) / mx : 0;
        if (mx < 40 || sat < 0.22) continue;
        let hh = 0;
        if (mx !== mn) { if (mx === r) hh = ((g - b) / (mx - mn)) % 6; else if (mx === g) hh = (b - r) / (mx - mn) + 2; else hh = (r - g) / (mx - mn) + 4; }
        const k = Math.round(((hh * 60 + 360) % 360) / 24);
        const o = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
        o.n += 1 + sat; o.r += r; o.g += g; o.b += b;
        buckets.set(k, o);
      }
      const top = [...buckets.values()].sort((a, b) => b.n - a.n).slice(0, 3).map((o) => [o.r, o.g, o.b].map((v) => Math.round(v / (o.n / (1 + 0.5)) * 0.66)));
      NPX.palette = top.length ? top.map(([r, g, b]) => `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`) : null;
    } catch { if (fallback && fallback !== src) { npPalette(fallback); return; } NPX.palette = null; }
    npApplyPalette();
  };
  img.onerror = () => { if (fallback && fallback !== src) { npPalette(fallback); return; } NPX.palette = null; npApplyPalette(); };
  img.src = src;
}
function npApplyPalette() {
  const p = NPX.palette || ['#ff2e4d', '#7a3cff', '#00b3ff'];
  const root = NPX.els && NPX.els.root;
  if (!root) return;
  root.style.setProperty('--c1', p[0]);
  root.style.setProperty('--c2', p[1] || p[0]);
  root.style.setProperty('--c3', p[2] || p[1] || p[0]);
}

// ---------- the screen ----------
function openNowPlaying() {
  if (NPX.open) return;
  if (!NP.state.active) { showToast('Nothing is playing right now'); return; }
  NPX.open = true;
  const e = {};
  e.bgArt = h('div', { class: 'npx-bgart' });
  e.blobs = h('div', { class: 'npx-blobs' }, h('i'), h('i'), h('i'));
  e.artist = h('div', { class: 'npx-artistimg' });
  e.canvas = h('canvas', { class: 'npx-fx' });
  e.art = h('img', { class: 'npx-art', alt: '' });
  e.title = h('div', { class: 'npx-title' });
  e.by = h('div', { class: 'npx-by' });
  e.meta = h('div', { class: 'npx-meta' });
  e.src = h('div', { class: 'npx-src' });
  e.fill = h('i');
  e.bar = h('div', { class: 'npx-bar', title: 'Click to jump', onclick: (ev) => { const r = e.bar.getBoundingClientRect(); const st = NP.state; if (!st.dur) return; npSeek(((ev.clientX - r.left) / r.width) * st.dur); } }, e.fill);
  e.cur = h('span'); e.dur = h('span');
  e.toggle = h('button', { class: 'npx-play', title: 'Play or pause (Space)', onclick: () => sendMedia('toggle') });
  e.lyrics = h('div', { class: 'npx-lyrics' });
  e.lyBtn = h('button', { class: 'npx-tool', title: 'Lyrics on or off (L)', onclick: () => npToggleLyrics() }, icon('chat'), 'Lyrics');
  e.offsetBox = h('div', { class: 'npx-offset', title: 'If the words run early or late, nudge them' },
    h('button', { onclick: () => npNudge(-0.5) }, '−0.5 s'), h('span'), h('button', { onclick: () => npNudge(0.5) }, '+0.5 s'));
  e.root = h('div', { class: 'npx', tabindex: '-1' },
    e.bgArt, e.blobs, e.artist, e.canvas, h('div', { class: 'npx-shade' }),
    h('div', { class: 'npx-top' }, e.src, h('div', { class: 'npx-tools' }, e.lyBtn,
      h('button', { class: 'npx-tool', title: 'Full screen (F)', onclick: () => npFull() }, icon('expand')),
      h('button', { class: 'npx-tool', title: 'Close (Esc)', onclick: closeNowPlaying }, icon('close')))),
    h('div', { class: 'npx-main' },
      h('div', { class: 'npx-left' },
        h('div', { class: 'npx-artwrap' }, e.art, h('div', { class: 'npx-artglow' })),
        e.title, e.by, e.meta,
        e.bar, h('div', { class: 'npx-times' }, e.cur, e.dur),
        h('div', { class: 'npx-ctrls' },
          h('button', { title: 'Previous (P)', onclick: () => sendMedia('prev') }, icon('prev')),
          e.toggle,
          h('button', { title: 'Next (N)', onclick: () => sendMedia('next') }, icon('next')))),
      h('div', { class: 'npx-right' }, e.lyrics, e.offsetBox)));
  NPX.els = e;
  document.body.append(e.root);
  requestAnimationFrame(() => e.root.classList.add('in'));
  e.root.focus();
  // Controls and the cursor fade away when the mouse rests, for a cleaner view.
  NPX.lastMove = performance.now();
  e.root.addEventListener('mousemove', () => { NPX.lastMove = performance.now(); e.root.classList.remove('idle'); });
  e.root.addEventListener('keydown', npKeys);
  // A little 3D tilt on the cover that follows the mouse.
  e.root.addEventListener('mousemove', (ev) => { const r = e.art.getBoundingClientRect(); const dx = (ev.clientX - (r.left + r.width / 2)) / innerWidth, dy = (ev.clientY - (r.top + r.height / 2)) / innerHeight; e.art.style.setProperty('--rx', `${(-dy * 5).toFixed(2)}deg`); e.art.style.setProperty('--ry', `${(dx * 6).toFixed(2)}deg`); });
  NPX.particles = Array.from({ length: 42 }, () => npParticle(true));
  npApplyPalette();
  npPalette((NPX.extras && NPX.extras.art) || NP.state.art, NP.state.art);
  npRender();
  npLoop();
}
function closeNowPlaying() {
  if (!NPX.open) return;
  NPX.open = false;
  cancelAnimationFrame(NPX.raf);
  const r = NPX.els.root;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  r.classList.remove('in');
  setTimeout(() => r.remove(), 380);
  NPX.els = null;
}
function npFull() { const r = NPX.els && NPX.els.root; if (!r) return; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else r.requestFullscreen().catch(() => {}); }
function npToggleLyrics() { prefs.set('npLyrics', !npLyricsOn()); NPX.key = ''; npTrackChanged(); }
function npSeek(sec) {
  sec = Math.max(0, sec);
  api.mediaCommand(`seek:${sec.toFixed(2)}`);
  // Move our own clock right away so the lyrics follow without waiting for the player.
  NP.base = sec; NP.at = Date.now();
}
function npNudge(d) {
  NPX.offset = Math.round((NPX.offset + d) * 10) / 10;
  const all = prefs.get('npOffsets', {}) || {};
  if (NPX.offset) all[NPX.key] = NPX.offset; else delete all[NPX.key];
  const keys = Object.keys(all); if (keys.length > 300) delete all[keys[0]];
  prefs.set('npOffsets', all);
  npRender();
}
function npKeys(ev) {
  const k = ev.key;
  if (k === 'Escape') { ev.preventDefault(); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else closeNowPlaying(); }
  else if (k === ' ') { ev.preventDefault(); sendMedia('toggle'); }
  else if (k.toLowerCase() === 'n') sendMedia('next');
  else if (k.toLowerCase() === 'p') sendMedia('prev');
  else if (k.toLowerCase() === 'l') npToggleLyrics();
  else if (k.toLowerCase() === 'f') npFull();
  else if (k === 'ArrowRight') npSeek(npPos() + 5);
  else if (k === 'ArrowLeft') npSeek(npPos() - 5);
  else return;
  ev.stopPropagation();
}

// Text and artwork for the current song (called on every update from the player).
function npRender() {
  const e = NPX.els;
  if (!e) return;
  const st = NP.state;
  if (!st.active) { e.title.textContent = 'Nothing playing'; e.by.textContent = ''; return; }
  const ex = NPX.extras || {};
  const art = ex.art || st.art || '';
  if (art && e.art.dataset.src !== art) {
    e.art.dataset.src = art;
    const pre = new Image();
    pre.onload = () => { if (e.art.dataset.src === art) { e.art.src = art; e.bgArt.style.backgroundImage = `url("${art}")`; e.art.classList.remove('swap'); void e.art.offsetWidth; e.art.classList.add('swap'); } };
    pre.src = art;
  }
  if (ex.artistImage) { if (e.artist.dataset.src !== ex.artistImage) { e.artist.dataset.src = ex.artistImage; e.artist.style.backgroundImage = `url("${ex.artistImage}")`; e.artist.classList.add('on'); } }
  else { e.artist.classList.remove('on'); e.artist.dataset.src = ''; }
  e.src.replaceChildren(icon('music'), npSourceLabel(st));
  e.title.textContent = st.title || 'Unknown track';
  e.by.textContent = String(st.artist || '').split(/\s+—\s+/)[0];
  e.meta.replaceChildren(...[ex.album || st.album || String(st.artist || '').split(/\s+—\s+/)[1], ex.year, ex.genre].filter(Boolean).map((t) => h('span', {}, String(t))));
  const want = st.status === 'Playing' ? 'pause' : 'play';
  if (e.toggle.dataset.icon !== want) { e.toggle.dataset.icon = want; e.toggle.replaceChildren(icon(want)); }
  e.root.classList.toggle('playing', st.status === 'Playing');
  e.lyBtn.classList.toggle('on', npLyricsOn());
  e.offsetBox.hidden = !(NPX.lyrics && NPX.lyrics.synced && npLyricsOn());
  e.offsetBox.querySelector('span').textContent = NPX.offset ? `${NPX.offset > 0 ? '+' : ''}${NPX.offset} s` : 'in sync';
  npBuildLyrics();
}

// The lyrics column: built once per song, then only classes and fills change.
function npBuildLyrics() {
  const e = NPX.els;
  const L = NPX.lyrics;
  const key = `${NPX.key}|${npLyricsOn()}|${L ? (L.synced ? 's' : L.plain ? 'p' : L.instrumental ? 'i' : L.error ? 'e' : 'n') : 'loading'}`;
  if (e.lyrics.dataset.key === key) return;
  e.lyrics.dataset.key = key;
  NPX.line = -1;
  e.root.classList.toggle('no-lyrics', !npLyricsOn() || !L || !(L.synced || L.plain));
  if (!npLyricsOn()) { e.lyrics.replaceChildren(); return; }
  if (!L) { e.lyrics.replaceChildren(h('div', { class: 'npx-ly-note' }, h('span', { class: 'npx-dots' }, h('i'), h('i'), h('i')), 'Finding the words')); return; }
  if (L.synced) {
    e.lyrics.replaceChildren(h('div', { class: 'npx-ly-pad' }), ...L.synced.map((ln, i) => {
      const words = ln.text ? ln.text.split(/(\s+)/) : [];
      const row = h('div', { class: `npx-line${ln.text ? '' : ' gap'}`, 'data-i': i, onclick: () => npSeek(ln.t - NPX.offset) },
        ln.text ? words.map((w) => (/^\s+$/.test(w) ? w : h('span', { class: 'w' }, w))) : h('span', { class: 'npx-dots' }, h('i'), h('i'), h('i')));
      return row;
    }), h('div', { class: 'npx-ly-pad' }), h('div', { class: 'npx-ly-src' }, `Lyrics from ${L.source}`));
    NPX.lineEls = [...e.lyrics.querySelectorAll('.npx-line')];
    return;
  }
  if (L.plain) {
    e.lyrics.replaceChildren(h('div', { class: 'npx-plain' }, L.plain.split(/\r?\n/).map((t) => h('div', { class: 'npx-pl' }, t || ' '))), h('div', { class: 'npx-ly-src' }, `Lyrics from ${L.source} (not timed)`));
    return;
  }
  if (L.instrumental) { e.lyrics.replaceChildren(h('div', { class: 'npx-ly-note big' }, icon('music'), 'Instrumental')); return; }
  e.lyrics.replaceChildren(h('div', { class: 'npx-ly-note' }, L.error || 'No lyrics found for this song'));
}

// ---------- every frame ----------
function npLoop() {
  if (!NPX.open || !NPX.els) return;
  const e = NPX.els;
  const st = NP.state;
  const pos = npPos();
  const pct = st.dur ? Math.min(100, (pos / st.dur) * 100) : 0;
  e.fill.style.width = `${pct}%`;
  e.cur.textContent = fmtTime(pos);
  e.dur.textContent = st.dur ? fmtTime(st.dur) : '';
  if (performance.now() - NPX.lastMove > 3200 && !e.root.matches(':focus-within button:focus-visible')) e.root.classList.add('idle');
  npLyricsFrame(pos);
  npParticles();
  NPX.raf = requestAnimationFrame(npLoop);
}

function npLyricsFrame(pos) {
  const L = NPX.lyrics;
  const e = NPX.els;
  if (!L || !npLyricsOn()) return;
  if (L.synced && NPX.lineEls) {
    const t = pos + NPX.offset + 0.15; // a hair early reads more naturally
    const lines = L.synced;
    let i = -1;
    for (let k = 0; k < lines.length; k++) { if (lines[k].t <= t) i = k; else break; }
    if (i !== NPX.line) {
      const prev = NPX.line;
      NPX.line = i;
      NPX.lineEls.forEach((el, k) => { el.classList.toggle('past', k < i); el.classList.toggle('now', k === i); el.classList.toggle('next', k === i + 1); el.style.setProperty('--d', String(Math.min(4, Math.abs(k - i)))); });
      const cur = NPX.lineEls[Math.max(0, i)];
      if (cur) {
        const box = e.lyrics;
        box.scrollTo({ top: cur.offsetTop - box.clientHeight * 0.38, behavior: Math.abs(i - prev) > 3 ? 'auto' : 'smooth' });
      }
      // A soft pulse in the background on each new line.
      if (i >= 0 && lines[i].text) { NPX.pulse = performance.now(); e.root.classList.remove('beat'); void e.root.offsetWidth; e.root.classList.add('beat'); }
    }
    // Words light up across the line as it is sung (timed by letters, from this line to the next).
    const el = NPX.lineEls[i];
    if (el && lines[i].text) {
      const start = lines[i].t, end = (lines[i + 1] ? lines[i + 1].t : start + 5);
      const span = Math.max(0.6, Math.min(end - start, 12) * 0.92);
      const p = Math.max(0, Math.min(1, (t - start) / span));
      const ws = el._w || (el._w = [...el.querySelectorAll('.w')]);
      const total = ws.reduce((a, w) => a + w.textContent.length + 1, 0);
      let acc = 0;
      for (const w of ws) {
        const len = w.textContent.length + 1;
        const wp = Math.max(0, Math.min(1, (p * total - acc) / len));
        w.style.setProperty('--p', `${(wp * 100).toFixed(1)}%`);
        acc += len;
      }
    }
  } else if (L.plain) {
    // Untimed lyrics: scroll gently with the song.
    const st = NP.state;
    const box = e.lyrics;
    if (st.dur && box.scrollHeight > box.clientHeight && !box.matches(':hover')) box.scrollTop = Math.max(0, (pos / st.dur) * (box.scrollHeight - box.clientHeight) - 40);
  }
}

// Floating specks of light in the cover's colors; they drift faster while music plays.
function npParticle(anywhere) {
  return { x: Math.random(), y: anywhere ? Math.random() : 1.05, r: 0.6 + Math.random() * 2.6, s: 0.15 + Math.random() * 0.6, a: 0.15 + Math.random() * 0.5, c: Math.floor(Math.random() * 3), w: Math.random() * Math.PI * 2 };
}
function npParticles() {
  const e = NPX.els;
  const cv = e.canvas;
  const w = cv.clientWidth, hh = cv.clientHeight;
  if (!w || !hh) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); }
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, hh);
  const pal = NPX.palette || ['#ff2e4d', '#7a3cff', '#00b3ff'];
  const playing = NP.state.status === 'Playing';
  const pulse = NPX.pulse ? Math.max(0, 1 - (performance.now() - NPX.pulse) / 700) : 0;
  const calm = document.body.classList.contains('calm');
  x.globalCompositeOperation = 'lighter';
  for (const p of NPX.particles) {
    if (!calm) { p.y -= (p.s * (playing ? 1 : 0.25)) / hh * 2.2; p.w += 0.01; p.x += Math.sin(p.w) * 0.0004; }
    if (p.y < -0.05) Object.assign(p, npParticle(false));
    const rad = p.r * (1 + pulse * 0.8) * 3;
    const g = x.createRadialGradient(p.x * w, p.y * hh, 0, p.x * w, p.y * hh, rad * 4);
    g.addColorStop(0, pal[p.c % pal.length]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.globalAlpha = Math.min(1, p.a * (0.7 + pulse * 0.6));
    x.fillStyle = g;
    x.beginPath(); x.arc(p.x * w, p.y * hh, rad * 4, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 1;
  x.globalCompositeOperation = 'source-over';
}

// The current lyric line, for the small music cards (Home and the sidebar).
function npCurrentLine() {
  const L = NPX.lyrics;
  if (!L || !L.synced || !npLyricsOn()) return '';
  const t = npPos() + NPX.offset + 0.15;
  let line = '';
  for (const l of L.synced) { if (l.t <= t) line = l.text; else break; }
  return line;
}

// ---------- hooks ----------
document.addEventListener('DOMContentLoaded', () => {
  // Every update from the player: notice new songs, keep the open screen current.
  const base = window.setMediaState;
  window.setMediaState = (st) => {
    if (st && st.active && typeof st.posExact === 'number') st = { ...st, pos: st.posExact };
    base(st);
    npTrackChanged();
    if (NPX.open) npRender();
    if (NPX.open && !NP.state.active) closeNowPlaying();
  };
  // The sidebar music card: clicking the cover opens Now Playing.
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest && ev.target.closest('#nowPlaying .np-art, #nowPlaying .np-expand, #hubMusic .hm-art, .gd-part');
    if (a && NP.state.active) { ev.preventDefault(); ev.stopPropagation(); openNowPlaying(); }
  }, true);
  // M opens Now Playing from anywhere (when you are not typing).
  document.addEventListener('keydown', (ev) => {
    if (NPX.open || ev.ctrlKey || ev.altKey || ev.metaKey || ev.key.toLowerCase() !== 'm') return;
    const el = document.activeElement;
    if (el && (/^(input|textarea|select)$/i.test(el.tagName) || el.isContentEditable)) return;
    if (S.modals.length || document.querySelector('.game, .spin, .palette')) return;
    if (NP.state.active) { ev.preventDefault(); openNowPlaying(); }
  });
  // The current line under the song on the small cards, once a second.
  setInterval(() => {
    const line = npCurrentLine();
    for (const el of document.querySelectorAll('.np-lyric')) if (el.textContent !== line) { el.textContent = line; el.classList.remove('fresh'); void el.offsetWidth; el.classList.add('fresh'); }
  }, 400);
});
