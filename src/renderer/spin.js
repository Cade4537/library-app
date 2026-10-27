/* global S, $, h, icon, prefs, artFor, displayName, SOURCES, fmtHours, timeAgo, catPath, notInstalled, launch, openDetails,
   heroUrlFor, setHeroBg, syncDiscord, spatial, hashHue */
// Surprise me: a reel of covers that spins, slows down and lands on your game, with sound,
// a burst of sparks and the game's art filling the screen. Also the launch splash.

// ---------- sound (made on the fly, no files) ----------
const Sfx = {
  ctx: null,
  on() { return prefs.get('spinSound', true); },
  ac() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tick(pitch = 1) {
    if (!this.on()) return;
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator(); const g = ac.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(1300 * pitch, t); o.frequency.exponentialRampToValueAtTime(500 * pitch, t + 0.04);
    g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.06);
  },
  land() {
    if (!this.on()) return;
    const ac = this.ac(); if (!ac) return;
    const t = ac.currentTime;
    // A bright chord with a soft swell.
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ac.createOscillator(); const g = ac.createGain();
      o.type = i % 2 ? 'sine' : 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.03 + i * 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.connect(g).connect(ac.destination); o.start(t + i * 0.03); o.stop(t + 1.5);
    });
    // A short whoosh.
    const n = ac.createBuffer(1, ac.sampleRate * 0.4, ac.sampleRate); const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const src = ac.createBufferSource(); src.buffer = n;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.setValueAtTime(800, t); bp.frequency.exponentialRampToValueAtTime(4000, t + 0.35);
    const g = ac.createGain(); g.gain.value = 0.08;
    src.connect(bp).connect(g).connect(ac.destination); src.start(t);
  },
};

// ---------- sparks ----------
function burst(canvas, x, y, color) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * dpr; canvas.height = canvas.clientHeight * dpr;
  ctx.scale(dpr, dpr);
  const cols = [color, '#ffffff', '#ffd257', color, '#ff8f99'];
  const parts = [];
  for (let i = 0; i < 140; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = 4 + Math.random() * 11;
    parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 1, decay: 0.008 + Math.random() * 0.014, size: 2 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], shard: Math.random() < 0.6 });
  }
  let raf = 0;
  let currentItems = [];
  const step = () => {
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    let alive = 0;
    for (const p of parts) {
      if (p.life <= 0) continue;
      alive++;
      p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.22; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= p.decay;
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
      if (p.shard) { ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.6, 0); ctx.lineTo(0, p.size); ctx.lineTo(-p.size * 0.6, 0); ctx.fill(); }
      else { ctx.beginPath(); ctx.arc(0, 0, p.size * 0.45, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    if (alive && canvas.isConnected) raf = requestAnimationFrame(step);
    else ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

// ---------- the reel ----------
function spinOverlay(pool, from) {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e11d2e';
  const ITEM = 176, GAP = 18, STEP = ITEM + GAP, WIN_AT = 42, COUNT = 50;
  let last = null;
  let busy = false;
  let stopFx = null;
  let raf = 0;

  const bg = h('div', { class: 'spin-bg' });
  const bg2 = h('div', { class: 'spin-bg' });
  const strip = h('div', { class: 'spin-strip' });
  const reel = h('div', { class: 'spin-reel' }, strip);
  const ring = h('div', { class: 'spin-ring' });
  const fx = h('canvas', { class: 'spin-fx' });
  const kicker = h('div', { class: 'spin-kicker' }, `Picking from ${from}`);
  const name = h('div', { class: 'spin-name' });
  const meta = h('div', { class: 'spin-meta' });
  const playBtn = h('button', { class: 'btn primary big spin-play' });
  const againBtn = h('button', { class: 'btn glass big' }, icon('dice'), 'Spin again');
  const detBtn = h('button', { class: 'btn glass big' }, 'Details');
  const result = h('div', { class: 'spin-result' }, kicker, name, meta, h('div', { class: 'spin-actions' }, playBtn, againBtn, detBtn));
  const soundBtn = h('button', { class: 'icon-btn spin-sound', title: 'Sound' });
  const setSoundIcon = () => soundBtn.replaceChildren(h('span', { class: 'spin-sound-txt' }, Sfx.on() ? 'Sound on' : 'Sound off'));
  setSoundIcon();
  soundBtn.addEventListener('click', () => { prefs.set('spinSound', !Sfx.on()); setSoundIcon(); });
  const closeBtn = h('button', { class: 'icon-btn spin-close', title: 'Close (Esc)' }, icon('close'));
  const hints = h('div', { class: 'spin-hints' },
    h('span', {}, h('b', { class: 'pb a' }, 'A'), 'Play'), h('span', {}, h('b', { class: 'pb x' }, 'X'), 'Spin again'), h('span', {}, h('b', { class: 'pb b' }, 'B'), 'Close'));
  const root = h('div', { class: 'spin' + (reduce ? ' reduce' : '') }, bg, bg2,
    h('div', { class: 'spin-vignette' }),
    h('div', { class: 'spin-top' }, h('div', { class: 'spin-title' }, icon('dice'), 'Surprise me'), h('span', { class: 'spacer' }), soundBtn, closeBtn),
    h('div', { class: 'spin-stage' }, reel, ring, h('div', { class: 'spin-pointer top' }), h('div', { class: 'spin-pointer bottom' })),
    result, fx, hints);

  let bgFlip = false;
  const setBg = (it) => {
    const next = bgFlip ? bg : bg2; const prev = bgFlip ? bg2 : bg; bgFlip = !bgFlip;
    next.classList.remove('real');
    next.style.backgroundImage = it.coverUrl ? `url("${it.coverUrl}")` : 'none';
    next.style.backgroundColor = it.coverUrl ? '' : `hsl(${hashHue(it.name) % 360} 45% 14%)`;
    next.classList.add('on'); prev.classList.remove('on');
    const info = S.storeInfo.get(it.id);
    if (info) setHeroBg(next, it, info);
    else heroUrlFor(it, (inf) => { if (next.classList.contains('on')) setHeroBg(next, it, inf); });
  };

  const close = () => {
    cancelAnimationFrame(raf);
    if (stopFx) stopFx();
    root.classList.add('out');
    S.modals = S.modals.filter((f) => f !== close);
    document.removeEventListener('keydown', onKey, true);
    setTimeout(() => { root.remove(); syncDiscord(); }, 260);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === ' ' && !busy && document.activeElement !== againBtn) { e.preventDefault(); spin(); }
  };

  const pickWinner = () => {
    if (pool.length === 1) return pool[0];
    let w;
    do { w = pool[Math.floor(Math.random() * pool.length)]; } while (w === last);
    return w;
  };

  const fill = (winner) => {
    const items = [];
    for (let i = 0; i < COUNT; i++) items.push(i === WIN_AT ? winner : pool[Math.floor(Math.random() * pool.length)]);
    strip.replaceChildren(...items.map((it, i) => h('div', { class: 'spin-item', 'data-i': i }, artFor(it))));
    return items;
  };

  const showResult = (it) => {
    const ach = it.meta && it.meta.achievements && it.meta.achievements.total ? it.meta.achievements : null;
    const cat = it.categoryId ? catPath(it.categoryId).map((c) => c.name).slice(-1)[0] : null;
    name.textContent = displayName(it);
    meta.replaceChildren(...[
      h('span', { class: `chip-src src-${it.source}` }, SOURCES[it.source] || it.source),
      cat ? h('span', {}, cat) : null,
      h('span', {}, it.minutes ? `${fmtHours(it.minutes)} played` : 'Never played'),
      it.lastPlayed ? h('span', {}, `Last played ${timeAgo(it.lastPlayed).toLowerCase()}`) : null,
      ach ? h('span', {}, icon('trophy'), `${ach.have}/${ach.total}`) : null,
    ].filter(Boolean));
    playBtn.replaceChildren(icon(notInstalled(it) ? 'download' : 'play'), notInstalled(it) ? 'Install' : 'Play');
    playBtn.onclick = () => { close(); launch(it.id); };
    detBtn.onclick = () => { close(); openDetails(it.id); };
  };

  const spin = () => {
    if (busy) return;
    busy = true;
    root.classList.remove('landed');
    root.classList.add('spinning');
    [playBtn, againBtn, detBtn].forEach((b) => { b.disabled = true; });
    if (stopFx) stopFx();
    const winner = pickWinner();
    last = winner;
    currentItems = fill(winner);
    heroUrlFor(winner); // start loading the winner's art while the reel spins
    const reelW = reel.clientWidth;
    const center = reelW / 2 - ITEM / 2;
    const start = -(4 * STEP) + center;
    const jitter = (Math.random() - 0.5) * ITEM * 0.55;
    const end = -(WIN_AT * STEP) + center + jitter;
    const dur = reduce ? 900 : 4300 + Math.random() * 600;
    const t0 = performance.now();
    let lastIdx = -1;
    let lastBgIdx = -1;
    const ease = (t) => 1 - Math.pow(1 - t, 4.2);
    strip.style.transform = `translate3d(${start}px,0,0)`;
    const frame = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      const x = start + (end - start) * ease(t);
      strip.style.transform = `translate3d(${x}px,0,0)`;
      const idx = Math.round((center - x) / STEP);
      if (idx !== lastIdx) {
        lastIdx = idx;
        Sfx.tick(0.9 + Math.min(0.5, t * 0.5));
        const hot = strip.querySelector('.hot'); if (hot) hot.classList.remove('hot');
        const el = strip.children[idx]; if (el) el.classList.add('hot');
        // Change the backdrop now and then while spinning (not every card, it would flicker).
        if (t > 0.35 && idx !== lastBgIdx && (idx % 3 === 0 || t > 0.8)) { lastBgIdx = idx; const it = currentItems[idx]; if (it) setBg(it); }
      }
      const speed = (end - start) * (1 - t) ** 3.2 / dur * 16;
      strip.style.filter = !reduce && Math.abs(speed) > 9 ? `blur(${Math.min(3, Math.abs(speed) / 12)}px)` : '';
      if (t < 1) { raf = requestAnimationFrame(frame); return; }
      // Settle exactly on the winner.
      strip.style.filter = '';
      strip.style.transition = 'transform .45s cubic-bezier(.34,1.56,.64,1)';
      strip.style.transform = `translate3d(${-(WIN_AT * STEP) + center}px,0,0)`;
      setTimeout(() => { strip.style.transition = ''; }, 460);
      land(winner);
    };
    raf = requestAnimationFrame(frame);
  };

  const land = (winner) => {
    root.classList.remove('spinning');
    root.classList.add('landed');
    const el = strip.children[WIN_AT];
    if (el) el.classList.add('win');
    setBg(winner);
    showResult(winner);
    Sfx.land();
    const r = reel.getBoundingClientRect();
    ring.classList.remove('pulse'); void ring.offsetWidth; ring.classList.add('pulse');
    if (!reduce) stopFx = burst(fx, r.left + r.width / 2, r.top + r.height / 2, accent);
    setTimeout(() => {
      busy = false;
      [playBtn, againBtn, detBtn].forEach((b) => { b.disabled = false; });
      spatial.focusEl(playBtn);
    }, reduce ? 200 : 650);
  };

  againBtn.addEventListener('click', () => spin());
  closeBtn.addEventListener('click', close);
  document.body.append(root);
  S.modals.push(close);
  document.addEventListener('keydown', onKey, true);
  syncDiscord();
  requestAnimationFrame(() => root.classList.add('in'));
  setTimeout(spin, reduce ? 50 : 350);
  return { close, spinAgain: spin };
}

// ---------- launch splash ----------
function launchSplash(it) {
  if (!it || it.kind !== 'game') return;
  const old = $('.launch-splash'); if (old) old.remove();
  const bg = h('div', { class: 'ls-bg', style: it.coverUrl ? { backgroundImage: `url("${it.coverUrl}")` } : {} });
  const info = S.storeInfo.get(it.id);
  if (info) setHeroBg(bg, it, info);
  const el = h('div', { class: 'launch-splash' }, bg, h('div', { class: 'ls-shade' }),
    h('div', { class: 'ls-card' }, artFor(it)),
    h('div', { class: 'ls-text' }, h('div', { class: 'ls-kicker' }, notInstalled(it) ? 'Opening the store' : `Launching on ${SOURCES[it.source] || 'your PC'}`), h('div', { class: 'ls-name' }, displayName(it)), h('div', { class: 'ls-bar' }, h('span'))));
  const done = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
  el.addEventListener('click', done);
  document.body.append(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(done, 3200);
}
