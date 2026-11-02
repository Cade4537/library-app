/* global S, h, icon, prefs, Sfx, actionGame, statBox, keyList, bumpText, drawBoardBg, hexA, ACC, artFor, displayName, isGrouped */
// Six more Arcade games: Gem Merge, Vault Sweeper, Ember Flight, Sky Raiders, Vault Runner and Memory Vault.
// They use the same game frame as the others: Pause and Quit buttons, a pause menu,
// keyboard, mouse and controller, and everything stops when the game closes.

const DIR_KEYS = { w: 'up', a: 'left', s: 'down', d: 'right', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', p: 'p' };
const DXY = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Turns the controller stick or D-pad into single steps, with repeat while held.
function padStepper(repeat = true) {
  let last = '', t = 0;
  return (g, dt) => {
    const p = g.held.pad();
    const d = Math.abs(p.x) > Math.abs(p.y) ? (p.x < -0.5 ? 'left' : p.x > 0.5 ? 'right' : '') : (p.y < -0.5 ? 'up' : p.y > 0.5 ? 'down' : '');
    if (!d) { last = ''; return null; }
    if (d !== last) { last = d; t = -240; return d; }
    if (!repeat) return null;
    t += dt;
    if (t >= 110) { t = 0; return d; }
    return null;
  };
}
const rr = (ctx, x, y, w, h2, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h2, r); };

// ---------- Gem Merge (slide and merge numbers) ----------
function gemMerge() {
  const N = 4, CELL = 120, GAP = 14, W = N * CELL + (N + 1) * GAP, H = W;
  let grid, tiles, score, won, moved, nextId = 1;
  const scoreEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' }), topEl = h('div', { class: 'gs-v' });
  const best = () => prefs.get('mergeBest', 0);
  const upd = () => { bumpText(scoreEl, score.toLocaleString()); bestEl.textContent = Math.max(best(), score).toLocaleString(); topEl.textContent = String(Math.max(0, ...tiles.map((t) => t.v))); };
  const pos = (i) => GAP + i * (CELL + GAP);
  const spawn = () => {
    const free = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!grid[y][x]) free.push([x, y]);
    if (!free.length) return;
    const [x, y] = free[Math.floor(Math.random() * free.length)];
    const t = { id: nextId++, v: Math.random() < 0.9 ? 2 : 4, x, y, px: x, py: y, born: performance.now() };
    grid[y][x] = t; tiles.push(t);
  };
  const reset = () => { grid = [...Array(N)].map(() => Array(N).fill(null)); tiles = []; score = 0; won = false; spawn(); spawn(); upd(); };
  const canMove = () => {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const t = grid[y][x];
      if (!t) return true;
      if (x < N - 1 && grid[y][x + 1] && grid[y][x + 1].v === t.v) return true;
      if (y < N - 1 && grid[y + 1][x] && grid[y + 1][x].v === t.v) return true;
    }
    return false;
  };
  const slide = (g, dir) => {
    const [dx, dy] = DXY[dir];
    const order = [...Array(N).keys()];
    const xs = dx > 0 ? order.slice().reverse() : order;
    const ys = dy > 0 ? order.slice().reverse() : order;
    moved = false;
    const merged = new Set();
    const now = performance.now();
    for (const t of tiles) { t.px = t.x; t.py = t.y; t.mt = now; }
    for (const y of ys) for (const x of xs) {
      const t = grid[y][x];
      if (!t) continue;
      let cx = x, cy = y;
      while (true) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) break;
        const o = grid[ny][nx];
        if (!o) { grid[cy][cx] = null; grid[ny][nx] = t; cx = nx; cy = ny; moved = true; continue; }
        if (o.v === t.v && !merged.has(o.id) && !o.dead) {
          grid[cy][cx] = null; t.dead = true; t.x = nx; t.y = ny;
          o.v *= 2; o.pop = now; merged.add(o.id); score += o.v; moved = true;
          const px = pos(nx) + CELL / 2, py = pos(ny) + CELL / 2;
          g.fx.burst(px, py, [ACC(), '#ffffff', '#ffd257'], Math.min(26, 6 + Math.log2(o.v) * 2), 3.2, { size: 4, gravity: 0.03 });
          if (o.v >= 128) g.fx.text(px, py - 20, `+${o.v}`, '#ffd257', 20, 700);
          if (o.v === 2048 && !won) { won = true; g.fx.banner('2048!', 'Keep going for a bigger gem', '#ffd257', 2200); g.fx.flash('#ffd257', 0.3); Sfx.land(); }
          cx = -1; break;
        }
        break;
      }
      if (cx >= 0) { t.x = cx; t.y = cy; }
    }
    setTimeout(() => { tiles = tiles.filter((t) => !t.dead); }, 130);
    if (moved) {
      Sfx.tick(merged.size ? 1.5 : 0.9);
      setTimeout(() => {
        spawn(); upd();
        if (!canMove()) { const isBest = score > best(); if (isBest) prefs.set('mergeBest', score); g.gameOver(isBest ? 'New best!' : 'No moves left', `${score.toLocaleString()} points · biggest gem ${Math.max(...tiles.map((t) => t.v))}`); }
      }, 120);
    }
    upd();
  };
  const step = padStepper(false);
  const COLORS = { 2: '#2a2a30', 4: '#34343c', 8: '#7a1d2b', 16: '#9a1f30', 32: '#b81e33', 64: '#d81f36', 128: '#f0452a', 256: '#ff6b3d', 512: '#ffb02e', 1024: '#ffd257', 2048: '#fff1a8' };
  actionGame({
    title: 'Gem Merge', W, H, noCountdown: true,
    side: () => [statBox([['Score', scoreEl], ['Best', bestEl], ['Biggest gem', topEl]]), keyList(['W A S D', 'slide'], ['Arrows', 'slide too'], ['Esc / P', 'pause'], [null, 'Controller: stick or D-pad to slide. Two matching gems merge into one worth double.'])],
    keys: DIR_KEYS,
    onButton: (g, k) => { if (DXY[k]) slide(g, k); },
    pausedSub: () => `${score.toLocaleString()} points`,
    reset,
    update(g, dt) { const d = step(g, dt); if (d) slide(g, d); },
    draw(g, now) {
      const { ctx } = g;
      drawBoardBg(ctx, W, H, now, ACC(), 0);
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { ctx.fillStyle = 'rgba(255,255,255,.045)'; rr(ctx, pos(x), pos(y), CELL, CELL, 14); ctx.fill(); }
      for (const t of [...tiles].sort((a, b) => Number(!!b.dead) - Number(!!a.dead))) {
        const u = t.mt ? Math.min(1, (now - t.mt) / 110) : 1;
        const e = 1 - Math.pow(1 - u, 3);
        const x = pos(t.px + (t.x - t.px) * e), y = pos(t.py + (t.y - t.py) * e);
        let sc = 1;
        if (t.born && now - t.born < 160) sc = 0.4 + ((now - t.born) / 160) * 0.6;
        if (t.pop && now - t.pop < 180) sc = 1 + Math.sin(((now - t.pop) / 180) * Math.PI) * 0.12;
        ctx.save(); ctx.translate(x + CELL / 2, y + CELL / 2); ctx.scale(sc, sc);
        const col = COLORS[t.v] || '#ffffff';
        if (t.v >= 64) { ctx.shadowColor = col; ctx.shadowBlur = 22; }
        ctx.fillStyle = col; rr(ctx, -CELL / 2, -CELL / 2, CELL, CELL, 14); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,.12)'; rr(ctx, -CELL / 2, -CELL / 2, CELL, CELL * 0.45, 14); ctx.fill();
        ctx.fillStyle = t.v >= 1024 ? '#2a1600' : '#ffffff';
        ctx.font = `800 ${t.v >= 1000 ? 38 : t.v >= 100 ? 46 : 54}px 'Segoe UI Variable Display', 'Segoe UI', system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(t.v), 0, 3);
        ctx.restore();
      }
    },
  });
}

// ---------- Vault Sweeper (find the safe squares) ----------
function vaultSweeper() {
  const C = 16, R = 12, MINES = 32, CELL = 46, W = C * CELL, H = R * CELL;
  let cells, cur, started, firstDone, opened, flags, done;
  const timeEl = h('div', { class: 'gs-v' }), leftEl = h('div', { class: 'gs-v' }), winsEl = h('div', { class: 'gs-v' });
  const at = (x, y) => (x >= 0 && y >= 0 && x < C && y < R ? cells[y * C + x] : null);
  const around = (x, y) => { const o = []; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) { const c = at(x + dx, y + dy); if (c) o.push(c); } return o; };
  const reset = () => {
    cells = []; for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) cells.push({ x, y, mine: false, open: false, flag: false, n: 0, t: 0 });
    cur = { x: Math.floor(C / 2), y: Math.floor(R / 2) }; started = 0; firstDone = false; opened = 0; flags = 0; done = false;
    leftEl.textContent = String(MINES); timeEl.textContent = '0:00'; winsEl.textContent = String(prefs.get('sweepWins', 0));
  };
  const place = (sx, sy) => {
    const safe = new Set([sy * C + sx, ...around(sx, sy).map((c) => c.y * C + c.x)]);
    let n = 0;
    while (n < MINES) { const i = Math.floor(Math.random() * cells.length); if (safe.has(i) || cells[i].mine) continue; cells[i].mine = true; n++; }
    for (const c of cells) c.n = around(c.x, c.y).filter((o) => o.mine).length;
  };
  const open = (g, x, y) => {
    const c = at(x, y);
    if (!c || c.open || c.flag || done) return;
    if (!firstDone) { place(x, y); firstDone = true; started = performance.now(); }
    if (c.mine) {
      done = true; c.open = true; c.t = performance.now(); c.boom = true;
      for (const m of cells) if (m.mine) { m.open = true; m.t = performance.now() + Math.random() * 500; }
      g.fx.burst(x * CELL + CELL / 2, y * CELL + CELL / 2, ['#ff3b4b', '#ffd257', '#ffffff'], 60, 6, { size: 6 }); g.fx.shake(12); g.fx.flash('#ff3b4b', 0.45); Sfx.tick(0.3);
      g.gameOver('Trap!', `${opened} of ${C * R - MINES} safe squares opened`);
      return;
    }
    const stack = [c]; let wave = 0;
    while (stack.length) {
      const k = stack.pop();
      if (k.open || k.flag) continue;
      k.open = true; k.t = performance.now() + wave++ * 6; opened++;
      if (k.n === 0) for (const o of around(k.x, k.y)) if (!o.open && !o.mine) stack.push(o);
    }
    Sfx.tick(1.2 + Math.min(0.8, wave / 60));
    if (opened === C * R - MINES) {
      done = true;
      const secs = Math.round((performance.now() - started) / 1000);
      prefs.set('sweepWins', prefs.get('sweepWins', 0) + 1);
      const isBest = !prefs.get('sweepBest', 0) || secs < prefs.get('sweepBest', 0);
      if (isBest) prefs.set('sweepBest', secs);
      for (const m of cells) if (m.mine) m.flag = true;
      g.fx.banner('Cleared!', isBest ? 'Fastest clear yet' : null, '#3ddc84', 2000); Sfx.land();
      g.gameOver(isBest ? 'New best time!' : 'Grid cleared', `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    }
  };
  const flag = (x, y) => {
    const c = at(x, y);
    if (!c || c.open || done) return;
    c.flag = !c.flag; flags += c.flag ? 1 : -1; leftEl.textContent = String(MINES - flags); Sfx.tick(c.flag ? 1.8 : 1);
  };
  // Opening a number with the right number of flags around it opens the rest.
  const chord = (g, x, y) => {
    const c = at(x, y);
    if (!c || !c.open || !c.n) return false;
    const ar = around(x, y);
    if (ar.filter((o) => o.flag).length !== c.n) return false;
    for (const o of ar) if (!o.open && !o.flag) open(g, o.x, o.y);
    return true;
  };
  const act = (g) => { if (!chord(g, cur.x, cur.y)) open(g, cur.x, cur.y); };
  const step = padStepper(true);
  const NUM = ['', '#4fa3ff', '#3ddc84', '#ff5d6c', '#b26cf5', '#ffb02e', '#3ee6e6', '#ffffff', '#9b9ba3'];
  actionGame({
    title: 'Vault Sweeper', W, H, noCountdown: true,
    side: () => [statBox([['Time', timeEl], ['Traps left', leftEl], ['Wins', winsEl]]), keyList(['Click', 'open'], ['Right click', 'flag'], ['W A S D', 'move'], ['Space', 'open'], ['F', 'flag'], [null, 'Controller: stick to move, A to open, X to flag. Numbers show how many traps touch that square.'])],
    keys: { ...DIR_KEYS, ' ': 'a', Enter: 'a', f: 'x', e: 'x' },
    onButton: (g, k) => { if (DXY[k]) { cur.x = Math.max(0, Math.min(C - 1, cur.x + DXY[k][0])); cur.y = Math.max(0, Math.min(R - 1, cur.y + DXY[k][1])); } else if (k === 'a') act(g); else if (k === 'x' || k === 'y') flag(cur.x, cur.y); },
    onPointer: (g, e) => { const p = g.point(e); const x = Math.floor(p.x / CELL), y = Math.floor(p.y / CELL); cur = { x, y }; if (e.button === 2) flag(x, y); else if (!chord(g, x, y)) open(g, x, y); },
    reset,
    update(g, dt) {
      const d = step(g, dt);
      if (d) { cur.x = Math.max(0, Math.min(C - 1, cur.x + DXY[d][0])); cur.y = Math.max(0, Math.min(R - 1, cur.y + DXY[d][1])); }
      if (started && !done) { const s = Math.floor((performance.now() - started) / 1000); timeEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
    },
    draw(g, now) {
      const { ctx } = g;
      drawBoardBg(ctx, W, H, now, ACC(), 0);
      for (const c of cells) {
        const x = c.x * CELL, y = c.y * CELL;
        const shown = c.open && now >= c.t;
        if (!shown) {
          ctx.fillStyle = (c.x + c.y) % 2 ? '#26262c' : '#2c2c33'; rr(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 7); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.05)'; rr(ctx, x + 2, y + 2, CELL - 4, (CELL - 4) * 0.4, 7); ctx.fill();
          if (c.flag) { ctx.fillStyle = ACC(); ctx.beginPath(); ctx.moveTo(x + 17, y + 12); ctx.lineTo(x + 33, y + 19); ctx.lineTo(x + 17, y + 26); ctx.fill(); ctx.fillStyle = '#e8e8ee'; ctx.fillRect(x + 15, y + 11, 3, 24); }
        } else {
          const u = Math.min(1, (now - c.t) / 160);
          ctx.globalAlpha = 0.4 + u * 0.6;
          ctx.fillStyle = c.mine ? (c.boom ? '#ff3b4b' : '#3a1218') : 'rgba(255,255,255,.035)';
          rr(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 7); ctx.fill();
          if (c.mine) { ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x + CELL / 2, y + CELL / 2, 9, 0, 7); ctx.fill(); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; for (let a = 0; a < 4; a++) { const r = (a * Math.PI) / 4; ctx.beginPath(); ctx.moveTo(x + CELL / 2 + Math.cos(r) * 14, y + CELL / 2 + Math.sin(r) * 14); ctx.lineTo(x + CELL / 2 - Math.cos(r) * 14, y + CELL / 2 - Math.sin(r) * 14); ctx.stroke(); } }
          else if (c.n) { ctx.fillStyle = NUM[c.n]; ctx.font = "800 24px 'Segoe UI', system-ui"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(c.n), x + CELL / 2, y + CELL / 2 + 1); }
          ctx.globalAlpha = 1;
        }
      }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.shadowColor = ACC(); ctx.shadowBlur = 12;
      rr(ctx, cur.x * CELL + 1.5, cur.y * CELL + 1.5, CELL - 3, CELL - 3, 8); ctx.stroke(); ctx.shadowBlur = 0;
    },
  });
}

// ---------- Ember Flight (tap to fly) ----------
function emberFlight() {
  const W = 480, H = 720;
  let y, vy, gates, score, t, sparks, dead;
  const scoreEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' });
  const best = () => prefs.get('flightBest', 0);
  const reset = () => { y = H / 2; vy = 0; gates = []; score = 0; t = 0; sparks = []; dead = false; bumpText(scoreEl, '0'); bestEl.textContent = String(best()); };
  const flap = () => { if (dead) return; vy = -7.6; Sfx.tick(1.4); for (let i = 0; i < 6; i++) sparks.push({ x: 120, y: y + 10, vx: -1 - Math.random() * 2, vy: 1 + Math.random() * 2, life: 1 }); };
  const crash = (g) => {
    dead = true; g.fx.burst(130, y, ['#ffb02e', ACC(), '#ffffff'], 40, 5, { size: 5 }); g.fx.shake(10); g.fx.flash('#ff3b4b', 0.35); Sfx.tick(0.3);
    const isBest = score > best(); if (isBest) prefs.set('flightBest', score);
    g.gameOver(isBest ? 'New best!' : 'Crashed', `${score} ${score === 1 ? 'gate' : 'gates'}`);
  };
  actionGame({
    title: 'Ember Flight', W, H,
    side: () => [statBox([['Gates', scoreEl], ['Best', bestEl]]), keyList(['Space / W / Click', 'fly up'], ['Esc / P', 'pause'], [null, 'Controller: A to fly up. Fly through the gaps; they get tighter as you go.'])],
    keys: { ' ': 'a', w: 'a', ArrowUp: 'a', p: 'p' },
    onButton: (_g, k) => { if (k === 'a' || k === 'x') flap(); },
    onPointer: () => flap(),
    pausedSub: () => `${score} gates`,
    reset,
    update(g, dt) {
      const k = dt / 16.7;
      t += dt;
      vy = Math.min(11, vy + 0.42 * k); y += vy * k;
      const speed = 3.2 + Math.min(2.6, score * 0.06);
      if (!gates.length || gates[gates.length - 1].x < W - 250) {
        const gap = Math.max(150, 220 - score * 3);
        gates.push({ x: W + 40, top: 80 + Math.random() * (H - 160 - gap), gap, done: false });
      }
      for (const gt of gates) {
        gt.x -= speed * k;
        if (!gt.done && gt.x + 36 < 120) { gt.done = true; score++; bumpText(scoreEl, String(score)); Sfx.tick(1.8); g.fx.text(130, y - 30, '+1', '#ffd257', 20, 600); if (score % 10 === 0) g.fx.banner(`${score}!`, null, '#ffd257', 1100); }
        if (gt.x < 136 && gt.x + 72 > 104 && (y - 14 < gt.top || y + 14 > gt.top + gt.gap)) return crash(g);
      }
      gates = gates.filter((gt) => gt.x > -100);
      if (y > H - 16 || y < 0) return crash(g);
      for (const s of sparks) { s.x += s.vx * k; s.y += s.vy * k; s.life -= 0.04 * k; }
      sparks = sparks.filter((s) => s.life > 0);
      return undefined;
    },
    draw(g, now) {
      const { ctx } = g;
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#120a10'); sky.addColorStop(1, '#2a0d14'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 40; i++) { const sx = ((i * 97 - now * 0.02 * (1 + (i % 3))) % W + W) % W; ctx.fillStyle = `rgba(255,255,255,${0.1 + (i % 4) * 0.08})`; ctx.fillRect(sx, (i * 53) % H, 2, 2); }
      for (const gt of gates) {
        const grad = ctx.createLinearGradient(gt.x, 0, gt.x + 72, 0); grad.addColorStop(0, '#4a0f18'); grad.addColorStop(0.5, ACC()); grad.addColorStop(1, '#4a0f18');
        ctx.fillStyle = grad; rr(ctx, gt.x, -10, 72, gt.top + 10, 10); ctx.fill(); rr(ctx, gt.x, gt.top + gt.gap, 72, H - gt.top - gt.gap + 10, 10); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(gt.x + 6, gt.top - 6, 60, 4); ctx.fillRect(gt.x + 6, gt.top + gt.gap + 2, 60, 4);
      }
      for (const s of sparks) { ctx.globalAlpha = s.life; ctx.fillStyle = '#ffb02e'; ctx.fillRect(s.x, s.y, 3, 3); }
      ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(120, y); ctx.rotate(Math.max(-0.5, Math.min(1, vy / 12)));
      ctx.shadowColor = '#ffb02e'; ctx.shadowBlur = 24;
      const body = ctx.createRadialGradient(-3, -3, 2, 0, 0, 16); body.addColorStop(0, '#fff1a8'); body.addColorStop(0.5, '#ffb02e'); body.addColorStop(1, '#f0452a');
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#2a0d14'; ctx.beginPath(); ctx.arc(6, -4, 3, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = "900 64px 'Segoe UI Variable Display', 'Segoe UI', system-ui"; ctx.textAlign = 'center'; ctx.globalAlpha = 0.25; ctx.fillText(String(score), W / 2, 110); ctx.globalAlpha = 1;
    },
  });
}

// ---------- Sky Raiders (shoot the waves) ----------
function skyRaiders() {
  const W = 760, H = 640;
  let px, shots, bombs, foes, dir, wave, score, lives, cool, inv, step;
  const scoreEl = h('div', { class: 'gs-v' }), waveEl = h('div', { class: 'gs-v' }), livesEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' });
  const best = () => prefs.get('raidersBest', 0);
  const upd = () => { bumpText(scoreEl, score.toLocaleString()); waveEl.textContent = String(wave); livesEl.textContent = '♥'.repeat(Math.max(0, lives)); bestEl.textContent = Math.max(best(), score).toLocaleString(); };
  const spawnWave = () => {
    foes = [];
    const rows = Math.min(6, 3 + Math.floor(wave / 2));
    for (let r = 0; r < rows; r++) for (let c = 0; c < 10; c++) foes.push({ x: 90 + c * 58, y: 70 + r * 46, row: r, hp: r === 0 && wave > 2 ? 2 : 1, hit: 0 });
    dir = 1; step = 0.55 + wave * 0.12;
  };
  const reset = () => { px = W / 2; shots = []; bombs = []; wave = 1; score = 0; lives = 3; cool = 0; inv = 0; spawnWave(); upd(); };
  let firing = false;
  actionGame({
    title: 'Sky Raiders', W, H,
    side: () => [statBox([['Score', scoreEl], ['Wave', waveEl], ['Lives', livesEl], ['Best', bestEl]]), keyList(['A / D', 'move'], ['Space', 'fire'], ['Esc / P', 'pause'], [null, 'Controller: stick to move, A or RT to fire. Clear the wave before it reaches you.'])],
    keys: { a: 'left', d: 'right', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'a', w: 'a', ArrowUp: 'a', p: 'p' },
    onButton: (_g, k) => { if (k === 'a' || k === 'rt' || k === 'x') firing = true; },
    pausedSub: () => `Wave ${wave} · ${score.toLocaleString()} points`,
    reset,
    update(g, dt) {
      const k = dt / 16.7;
      const pad = g.held.pad();
      const mx = (g.held.has('a', 'ArrowLeft') ? -1 : 0) + (g.held.has('d', 'ArrowRight') ? 1 : 0) + pad.x;
      px = Math.max(30, Math.min(W - 30, px + mx * 6.5 * k));
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      const padFire = pads.some((gp) => (gp.buttons[0] && gp.buttons[0].pressed) || (gp.buttons[7] && gp.buttons[7].pressed));
      cool -= dt;
      if ((firing || g.held.has(' ', 'w', 'ArrowUp') || padFire) && cool <= 0) { shots.push({ x: px, y: H - 70 }); cool = 260; Sfx.tick(2.2); }
      firing = false;
      for (const s of shots) s.y -= 11 * k;
      shots = shots.filter((s) => s.y > -20);
      // The pack moves sideways and steps down at the edges.
      let edge = false;
      for (const f of foes) { f.x += dir * step * k * (1 + (40 - foes.length) * 0.02); if (f.x < 30 || f.x > W - 30) edge = true; }
      if (edge) { dir = -dir; for (const f of foes) f.y += 18; }
      for (const s of shots) for (const f of foes) {
        if (!s.dead && Math.abs(s.x - f.x) < 22 && Math.abs(s.y - f.y) < 16) {
          s.dead = true; f.hp--; f.hit = performance.now();
          if (f.hp <= 0) { f.dead = true; score += (6 - Math.min(5, f.row)) * 10; g.fx.burst(f.x, f.y, [ACC(), '#ffffff', '#ffb02e'], 16, 3.5, { size: 4 }); Sfx.tick(1.2); }
        }
      }
      shots = shots.filter((s) => !s.dead);
      foes = foes.filter((f) => !f.dead);
      if (Math.random() < (0.012 + wave * 0.004) * k && foes.length) { const f = foes[Math.floor(Math.random() * foes.length)]; bombs.push({ x: f.x, y: f.y + 14 }); }
      for (const b of bombs) b.y += (4 + wave * 0.3) * k;
      inv -= dt;
      for (const b of bombs) if (!b.dead && inv <= 0 && Math.abs(b.x - px) < 24 && b.y > H - 80 && b.y < H - 40) {
        b.dead = true; lives--; inv = 1500; g.fx.burst(px, H - 60, ['#ff3b4b', '#ffffff'], 30, 5, { size: 5 }); g.fx.shake(9); g.fx.flash('#ff3b4b', 0.3); Sfx.tick(0.4);
      }
      bombs = bombs.filter((b) => !b.dead && b.y < H + 10);
      if (lives <= 0 || foes.some((f) => f.y > H - 100)) {
        const isBest = score > best(); if (isBest) prefs.set('raidersBest', score); upd();
        return g.gameOver(isBest ? 'New best!' : 'Overrun', `Wave ${wave} · ${score.toLocaleString()} points`);
      }
      if (!foes.length) { wave++; score += 100; g.fx.banner(`Wave ${wave}`, '+100', '#ffd257', 1400); Sfx.land(); spawnWave(); bombs = []; g.countdown(1200); }
      upd();
      return undefined;
    },
    draw(g, now) {
      const { ctx } = g;
      drawBoardBg(ctx, W, H, now, ACC(), 0);
      for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 5) * 0.05})`; ctx.fillRect((i * 131) % W, ((i * 71 + now * 0.03 * (1 + (i % 3))) % H), 2, 2); }
      for (const f of foes) {
        const flash = now - f.hit < 90;
        ctx.save(); ctx.translate(f.x, f.y + Math.sin(now / 300 + f.x) * 2);
        ctx.fillStyle = flash ? '#ffffff' : f.hp > 1 ? '#ffb02e' : ['#ff3b4b', '#e0336a', '#c8174f', '#f0452a', '#ff6b8a', '#a3101e'][f.row % 6];
        ctx.beginPath(); ctx.moveTo(-18, -6); ctx.lineTo(0, -14); ctx.lineTo(18, -6); ctx.lineTo(14, 10); ctx.lineTo(6, 4); ctx.lineTo(0, 12); ctx.lineTo(-6, 4); ctx.lineTo(-14, 10); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#0b0b0d'; ctx.fillRect(-7, -4, 4, 4); ctx.fillRect(3, -4, 4, 4);
        ctx.restore();
      }
      ctx.fillStyle = '#ffffff'; ctx.shadowColor = ACC(); ctx.shadowBlur = 10;
      for (const s of shots) ctx.fillRect(s.x - 2, s.y - 10, 4, 14);
      ctx.shadowBlur = 0; ctx.fillStyle = '#ffb02e';
      for (const b of bombs) { ctx.beginPath(); ctx.arc(b.x, b.y, 5, 0, 7); ctx.fill(); }
      if (inv <= 0 || Math.floor(now / 100) % 2) {
        ctx.save(); ctx.translate(px, H - 58);
        ctx.shadowColor = ACC(); ctx.shadowBlur = 18; ctx.fillStyle = '#e8e8ee';
        ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(22, 14); ctx.lineTo(8, 8); ctx.lineTo(0, 16); ctx.lineTo(-8, 8); ctx.lineTo(-22, 14); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = ACC(); ctx.fillRect(-3, -8, 6, 10);
        ctx.restore();
      }
    },
  });
}

// ---------- Vault Runner (jump and duck) ----------
function vaultRunner() {
  const W = 900, H = 420, GROUND = 340;
  let y, vy, duck, obs, dist, speed, nextIn, jumps;
  const distEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' });
  const best = () => prefs.get('runnerBest', 0);
  const reset = () => { y = GROUND; vy = 0; duck = false; obs = []; dist = 0; speed = 6; nextIn = 900; jumps = 0; bumpText(distEl, '0 m'); bestEl.textContent = `${best()} m`; };
  const jump = () => { if (y >= GROUND - 0.5) { vy = -13.5; jumps = 1; Sfx.tick(1.3); } else if (jumps === 1) { vy = -10.5; jumps = 2; Sfx.tick(1.7); } };
  actionGame({
    title: 'Vault Runner', W, H,
    side: () => [statBox([['Distance', distEl], ['Best', bestEl]]), keyList(['Space / W', 'jump (twice for a double jump)'], ['S / Down', 'duck'], ['Esc / P', 'pause'], [null, 'Controller: A to jump, stick down or B to duck. Jump the crates, duck the drones.'])],
    keys: { ' ': 'a', w: 'a', ArrowUp: 'a', p: 'p' },
    onButton: (_g, k) => { if (k === 'a') jump(); },
    onPointer: () => jump(),
    pausedSub: () => `${Math.floor(dist)} m`,
    reset,
    update(g, dt) {
      const k = dt / 16.7;
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      duck = g.held.has('s', 'ArrowDown') || g.held.pad().y > 0.5 || pads.some((gp) => gp.buttons[1] && gp.buttons[1].pressed);
      vy += (duck && y < GROUND ? 1.4 : 0.7) * k; y = Math.min(GROUND, y + vy * k);
      if (y >= GROUND) { vy = 0; jumps = 0; }
      speed = Math.min(15, 6 + dist / 260);
      dist += speed * k * 0.16;
      bumpText(distEl, `${Math.floor(dist)} m`);
      nextIn -= dt * (speed / 6);
      if (nextIn <= 0) {
        const fly = dist > 60 && Math.random() < 0.35;
        obs.push(fly ? { x: W + 30, w: 46, h: 22, y: GROUND - 62, fly: true } : { x: W + 30, w: 30 + Math.random() * 26, h: 36 + Math.random() * 30, y: GROUND, fly: false });
        nextIn = 650 + Math.random() * 700;
      }
      const ph = duck ? 30 : 58, pw = duck ? 50 : 34;
      for (const o of obs) {
        o.x -= speed * k;
        const top = o.fly ? o.y - o.h / 2 : o.y - o.h, bottom = o.fly ? o.y + o.h / 2 : o.y;
        if (o.x < 120 + pw / 2 && o.x + o.w > 120 - pw / 2 && y > top && y - ph < bottom) {
          g.fx.burst(120, y - 30, [ACC(), '#ffffff'], 30, 5, { size: 5 }); g.fx.shake(10); g.fx.flash('#ff3b4b', 0.35); Sfx.tick(0.3);
          const m = Math.floor(dist); const isBest = m > best(); if (isBest) prefs.set('runnerBest', m);
          return g.gameOver(isBest ? 'New best!' : 'Ouch', `${m} m`);
        }
      }
      obs = obs.filter((o) => o.x > -80);
      if (Math.floor(dist / 250) > Math.floor((dist - speed * k * 0.16) / 250)) { g.fx.banner(`${Math.floor(dist / 250) * 250} m`, null, '#ffd257', 1000); Sfx.land(); }
      return undefined;
    },
    draw(g, now) {
      const { ctx } = g;
      const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#0b0b10'); sky.addColorStop(1, '#22090f'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      const off = (dist * 6) % 120;
      ctx.fillStyle = 'rgba(225,29,46,.08)';
      for (let i = -1; i < 9; i++) { const bx = i * 120 - off * 0.4; ctx.fillRect(bx, 150 + ((i * 37) % 60), 80, GROUND - 150); }
      ctx.fillStyle = '#16161b'; ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.strokeStyle = ACC(); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, GROUND + 1); ctx.lineTo(W, GROUND + 1); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.08)'; for (let i = 0; i < 20; i++) ctx.fillRect(((i * 60 - off) % W + W) % W, GROUND + 18, 26, 3);
      for (const o of obs) {
        if (o.fly) {
          ctx.save(); ctx.translate(o.x + o.w / 2, o.y + Math.sin(now / 120) * 3);
          ctx.fillStyle = '#ffb02e'; rr(ctx, -o.w / 2, -o.h / 2, o.w, o.h, 8); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(-o.w / 2 - 8, -o.h / 2 - 4, o.w + 16, 3);
          ctx.fillStyle = '#ff3b4b'; ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill(); ctx.restore();
        } else {
          ctx.fillStyle = '#3a1218'; rr(ctx, o.x, o.y - o.h, o.w, o.h, 4); ctx.fill();
          ctx.strokeStyle = ACC(); ctx.lineWidth = 2; ctx.strokeRect(o.x + 3, o.y - o.h + 3, o.w - 6, o.h - 6);
          ctx.beginPath(); ctx.moveTo(o.x + 3, o.y - o.h + 3); ctx.lineTo(o.x + o.w - 3, o.y - 3); ctx.stroke();
        }
      }
      const ph = duck ? 30 : 58, pw = duck ? 50 : 34;
      ctx.save(); ctx.translate(120, y);
      ctx.shadowColor = ACC(); ctx.shadowBlur = 16; ctx.fillStyle = '#e8e8ee'; rr(ctx, -pw / 2, -ph, pw, ph, 10); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = ACC(); rr(ctx, -pw / 2 + 6, -ph + 8, pw - 12, 10, 4); ctx.fill();
      if (y >= GROUND && !duck) { const leg = Math.sin(now / 60) * 6; ctx.fillStyle = '#e8e8ee'; ctx.fillRect(-10 + leg, -2, 8, 6); ctx.fillRect(2 - leg, -2, 8, 6); }
      ctx.restore();
    },
  });
}

// ---------- Memory Vault (match pairs of your covers) ----------
function memoryVault() {
  const C = 5, R = 4, CW = 128, CH = 170, GAP = 16, W = C * CW + (C + 1) * GAP, H = R * CH + (R + 1) * GAP;
  let cards, cur, picks, moves, pairs, lock, started;
  const movesEl = h('div', { class: 'gs-v' }), pairsEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' });
  const SYM = ['♠', '♥', '♦', '♣', '★', '☀', '☾', '♪', '⚑', '✦'];
  const imgs = new Map();
  const reset = () => {
    // Your own game covers when there are enough, otherwise symbols.
    const covers = S.lib.items.filter((it) => it.kind === 'game' && it.coverUrl && !it.hidden && !isGrouped(it)).sort(() => Math.random() - 0.5).slice(0, 10);
    const faces = covers.length >= 10 ? covers.map((it) => ({ img: it.coverUrl, name: displayName(it) })) : SYM.map((s) => ({ sym: s }));
    for (const f of faces) if (f.img && !imgs.has(f.img)) { const im = new Image(); im.src = f.img; imgs.set(f.img, im); }
    const deck = [...faces, ...faces].map((f, i) => ({ f, key: f.img || f.sym, i })).sort(() => Math.random() - 0.5);
    cards = deck.map((d, i) => ({ ...d, x: i % C, y: Math.floor(i / C), up: false, done: false, flip: 0, t: 0 }));
    cur = { x: 0, y: 0 }; picks = []; moves = 0; pairs = 0; lock = false; started = performance.now();
    movesEl.textContent = '0'; pairsEl.textContent = '0 / 10'; bestEl.textContent = prefs.get('memoryBest', 0) ? String(prefs.get('memoryBest', 0)) : '-';
  };
  const flipCard = (g, c) => {
    if (!c || lock || c.up || c.done) return;
    c.up = true; c.t = performance.now(); picks.push(c); Sfx.tick(1.3);
    if (picks.length < 2) return;
    moves++; movesEl.textContent = String(moves);
    const [a, b] = picks;
    if (a.key === b.key) {
      a.done = b.done = true; picks = []; pairs++; pairsEl.textContent = `${pairs} / 10`;
      for (const k of [a, b]) g.fx.burst(GAP + k.x * (CW + GAP) + CW / 2, GAP + k.y * (CH + GAP) + CH / 2, ['#3ddc84', '#ffffff', '#ffd257'], 18, 3.5, { size: 4, gravity: 0.03 });
      Sfx.land();
      if (pairs === 10) {
        const isBest = !prefs.get('memoryBest', 0) || moves < prefs.get('memoryBest', 0);
        if (isBest) prefs.set('memoryBest', moves);
        const secs = Math.round((performance.now() - started) / 1000);
        g.fx.banner('All matched!', null, '#3ddc84', 1800);
        g.gameOver(isBest ? 'New best!' : 'All matched', `${moves} moves · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
      }
    } else {
      lock = true;
      setTimeout(() => { a.up = b.up = false; a.t = b.t = performance.now(); picks = []; lock = false; }, 850);
    }
  };
  const cardAt = (x, y) => cards.find((c) => c.x === x && c.y === y);
  const step = padStepper(true);
  actionGame({
    title: 'Memory Vault', W, H, noCountdown: true,
    side: () => [statBox([['Moves', movesEl], ['Pairs', pairsEl], ['Fewest moves', bestEl]]), keyList(['Click', 'flip'], ['W A S D', 'move'], ['Space', 'flip'], [null, 'Controller: stick to move, A to flip. Uses your own game covers when you have at least 10.'])],
    keys: { ...DIR_KEYS, ' ': 'a', Enter: 'a' },
    onButton: (g, k) => { if (DXY[k]) { cur.x = (cur.x + DXY[k][0] + C) % C; cur.y = (cur.y + DXY[k][1] + R) % R; } else if (k === 'a') flipCard(g, cardAt(cur.x, cur.y)); },
    onPointer: (g, e) => { const p = g.point(e); const x = Math.floor((p.x - GAP / 2) / (CW + GAP)), y = Math.floor((p.y - GAP / 2) / (CH + GAP)); const c = cardAt(x, y); if (c) { cur = { x, y }; flipCard(g, c); } },
    pausedSub: () => `${pairs} of 10 pairs · ${moves} moves`,
    reset,
    update(g, dt) { const d = step(g, dt); if (d) { cur.x = (cur.x + DXY[d][0] + C) % C; cur.y = (cur.y + DXY[d][1] + R) % R; } },
    draw(g, now) {
      const { ctx } = g;
      drawBoardBg(ctx, W, H, now, ACC(), 0);
      for (const c of cards) {
        const x = GAP + c.x * (CW + GAP), y = GAP + c.y * (CH + GAP);
        const u = Math.min(1, (now - c.t) / 260);
        const showFace = c.up ? u > 0.5 : u < 0.5;
        const sx = Math.abs(Math.cos(u * Math.PI)) || 0.02;
        ctx.save(); ctx.translate(x + CW / 2, y + CH / 2); ctx.scale(sx, 1);
        if (c.done) ctx.globalAlpha = 0.55;
        if (showFace) {
          ctx.fillStyle = '#f4f4f6'; rr(ctx, -CW / 2, -CH / 2, CW, CH, 12); ctx.fill();
          const im = c.f.img && imgs.get(c.f.img);
          if (im && im.complete && im.naturalWidth) { ctx.save(); rr(ctx, -CW / 2 + 5, -CH / 2 + 5, CW - 10, CH - 10, 9); ctx.clip(); ctx.drawImage(im, -CW / 2 + 5, -CH / 2 + 5, CW - 10, CH - 10); ctx.restore(); }
          else { ctx.fillStyle = ['♥', '♦'].includes(c.f.sym) ? ACC() : '#16161a'; ctx.font = "64px 'Segoe UI Symbol', 'Segoe UI', system-ui"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.f.sym || '?', 0, 4); }
        } else {
          const bg = ctx.createLinearGradient(-CW / 2, -CH / 2, CW / 2, CH / 2); bg.addColorStop(0, hexA(ACC(), 0.9)); bg.addColorStop(1, '#2a0a10');
          ctx.fillStyle = bg; rr(ctx, -CW / 2, -CH / 2, CW, CH, 12); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; rr(ctx, -CW / 2 + 8, -CH / 2 + 8, CW - 16, CH - 16, 8); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(16, -4); ctx.lineTo(0, 20); ctx.lineTo(-16, -4); ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
      const x = GAP + cur.x * (CW + GAP), y = GAP + cur.y * (CH + GAP);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.shadowColor = ACC(); ctx.shadowBlur = 14; rr(ctx, x - 4, y - 4, CW + 8, CH + 8, 15); ctx.stroke(); ctx.shadowBlur = 0;
    },
  });
}

const GAMES3 = { merge: gemMerge, sweep: vaultSweeper, flight: emberFlight, raiders: skyRaiders, runner: vaultRunner, memory: memoryVault };

// Small pictures for the Arcade tiles.
function drawPreview3(c, x, acc) {
  const g = c.dataset.game;
  if (g === 'merge') {
    const vals = [[2, 4, 8, 0], [16, 32, 64, 2], [128, 256, 0, 4], [512, 1024, 2048, 8]];
    const col = { 2: '#2a2a30', 4: '#34343c', 8: '#7a1d2b', 16: '#9a1f30', 32: '#b81e33', 64: '#d81f36', 128: '#f0452a', 256: '#ff6b3d', 512: '#ffb02e', 1024: '#ffd257', 2048: '#fff1a8' };
    vals.forEach((row, yy) => row.forEach((v, xx) => { x.fillStyle = v ? col[v] : 'rgba(255,255,255,.05)'; x.beginPath(); x.roundRect(110 + xx * 36, 30 + yy * 42, 32, 38, 6); x.fill(); if (v) { x.fillStyle = v >= 1024 ? '#2a1600' : '#fff'; x.font = `800 ${v >= 1000 ? 9 : 12}px Segoe UI`; x.textAlign = 'center'; x.fillText(String(v), 126 + xx * 36, 54 + yy * 42); } }));
  } else if (g === 'sweep') {
    const N = ['', '#4fa3ff', '#3ddc84', '#ff5d6c'];
    for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 12; xx++) {
      const open = (xx + yy * 3) % 5 > 1;
      x.fillStyle = open ? 'rgba(255,255,255,.04)' : '#2c2c33'; x.fillRect(48 + xx * 22, 30 + yy * 22, 20, 20);
      const n = (xx * 7 + yy * 3) % 4;
      if (open && n) { x.fillStyle = N[n]; x.font = '800 12px Segoe UI'; x.textAlign = 'center'; x.fillText(String(n), 58 + xx * 22, 45 + yy * 22); }
    }
    x.fillStyle = acc; x.beginPath(); x.moveTo(240, 98); x.lineTo(252, 104); x.lineTo(240, 110); x.fill();
  } else if (g === 'flight') {
    x.fillStyle = acc; x.fillRect(200, 0, 40, 70); x.fillRect(200, 150, 40, 70); x.fillRect(320, 0, 40, 40); x.fillRect(320, 120, 40, 100);
    x.shadowColor = '#ffb02e'; x.shadowBlur = 16; x.fillStyle = '#ffb02e'; x.beginPath(); x.arc(120, 112, 13, 0, 7); x.fill(); x.shadowBlur = 0;
  } else if (g === 'raiders') {
    for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) { x.fillStyle = ['#ff3b4b', '#e0336a', '#f0452a'][r]; x.beginPath(); x.moveTo(70 + i * 38 - 12, 40 + r * 30); x.lineTo(70 + i * 38, 32 + r * 30); x.lineTo(70 + i * 38 + 12, 40 + r * 30); x.lineTo(70 + i * 38, 52 + r * 30); x.fill(); }
    x.fillStyle = '#fff'; x.fillRect(178, 140, 3, 12); x.fillStyle = '#e8e8ee'; x.beginPath(); x.moveTo(180, 176); x.lineTo(196, 200); x.lineTo(164, 200); x.fill();
  } else if (g === 'runner') {
    x.fillStyle = '#16161b'; x.fillRect(0, 170, 360, 50); x.strokeStyle = acc; x.beginPath(); x.moveTo(0, 171); x.lineTo(360, 171); x.stroke();
    x.fillStyle = '#e8e8ee'; x.beginPath(); x.roundRect(90, 110, 24, 40, 6); x.fill();
    x.fillStyle = '#3a1218'; x.fillRect(200, 140, 28, 30); x.strokeStyle = acc; x.strokeRect(202, 142, 24, 26);
    x.fillStyle = '#ffb02e'; x.beginPath(); x.roundRect(290, 120, 36, 16, 6); x.fill();
  } else if (g === 'memory') {
    for (let yy = 0; yy < 2; yy++) for (let xx = 0; xx < 5; xx++) {
      const up = (xx + yy) % 3 === 0;
      x.fillStyle = up ? '#f4f4f6' : acc; x.beginPath(); x.roundRect(50 + xx * 54, 30 + yy * 84, 46, 74, 6); x.fill();
      if (up) { x.fillStyle = (xx + yy) % 2 ? acc : '#16161a'; x.font = '26px Segoe UI Symbol'; x.textAlign = 'center'; x.fillText(['♠', '♥', '★', '♪'][(xx + yy) % 4], 73 + xx * 54, 76 + yy * 84); }
    }
  }
}
