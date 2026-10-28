/* global S, $, h, icon, prefs, Sfx, gameShell, fmtBig, parseBig, renderArcade */
// More Arcade games: Block Breaker, Snake, Paddle Duel and Blackjack.
// Every game has on-screen Pause and Quit buttons, a pause menu (Resume, Restart, Quit),
// keyboard and controller controls, and stops its loop and listeners when closed.

// ---------- shared helpers ----------
const ACC = () => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e11d2e';

// Held keys and controller state, read every frame by the action games.
function heldInput() {
  const keys = new Set();
  const down = (e) => keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const up = (e) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  const blur = () => keys.clear();
  window.addEventListener('keydown', down, true);
  window.addEventListener('keyup', up, true);
  window.addEventListener('blur', blur);
  return {
    has: (...k) => k.some((x) => keys.has(x)),
    pad() {
      const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
      const g = pads[0];
      if (!g) return { x: 0, y: 0 };
      let x = g.axes[0] || 0, y = g.axes[1] || 0;
      if (Math.abs(x) < 0.2) x = 0; if (Math.abs(y) < 0.2) y = 0;
      if (g.buttons[14] && g.buttons[14].pressed) x = -1; if (g.buttons[15] && g.buttons[15].pressed) x = 1;
      if (g.buttons[12] && g.buttons[12].pressed) y = -1; if (g.buttons[13] && g.buttons[13].pressed) y = 1;
      return { x, y };
    },
    off() { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); },
  };
}

// Scales a canvas to fit the stage while drawing in fixed logical units (W x H).
function fitCanvas(canvas, stage, W, H) {
  const s = Math.min((stage.clientWidth - 20) / W, (stage.clientHeight - 20) / H);
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * s * dpr); canvas.height = Math.round(H * s * dpr);
  canvas.style.width = `${Math.round(W * s)}px`; canvas.style.height = `${Math.round(H * s)}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  return s;
}

// The pause / game over card shown over the play area.
function overlayMsg(stage) {
  const msg = h('div', { class: 'game-msg' });
  stage.append(msg);
  return {
    show(title, sub, buttons) {
      msg.replaceChildren(h('div', { class: 'gm-t' }, title), sub ? h('div', { class: 'gm-s' }, sub) : null,
        h('div', { class: 'gm-btns' }, buttons.map(([label, ic, fn, primary]) => h('button', { class: `btn big ${primary ? 'primary' : 'glass'}`, onclick: fn }, icon(ic), label))));
      msg.classList.add('on');
      setTimeout(() => { const b = msg.querySelector('button'); if (b) b.focus(); }, 50);
    },
    hide() { msg.classList.remove('on'); },
    get on() { return msg.classList.contains('on'); },
  };
}

// Keys handled while a game is open. Esc always toggles pause.
function gameKeys(map, input, onEsc, isTyping) {
  const onKey = (e) => {
    if (isTyping && isTyping(e)) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEsc(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement.closest('.game-msg, .game-side, .bj-actions')) return;
    const k = map[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    input(k, e.repeat);
  };
  document.addEventListener('keydown', onKey, true);
  return () => document.removeEventListener('keydown', onKey, true);
}

const sideButtons = (pause, quit) => h('div', { class: 'gs-box gs-actions' },
  h('div', { class: 'row', style: { gap: '6px' } },
    h('button', { class: 'btn', style: { flex: 1 }, onclick: pause }, icon('pause'), 'Pause'),
    h('button', { class: 'btn', style: { flex: 1 }, onclick: quit }, icon('exit'), 'Quit')));
const keyList = (...rows) => h('div', { class: 'gs-keys' }, rows.map(([k, t]) => (k ? h('div', {}, h('b', {}, k), ` ${t}`) : h('div', { class: 'gs-note' }, t))));
const statBox = (pairs) => h('div', { class: 'gs-box' }, pairs.flatMap(([label, el]) => [h('div', { class: 'gs-l' }, label), el]));

// A standard action game: canvas, loop, pause menu, held input.
function actionGame({ title, W, H, side, keys, onButton, reset, update, draw, pausedSub }) {
  let raf, last = performance.now(), paused = false, over = false;
  const held = heldInput();
  let unKeys = () => {};
  const shell = gameShell(title, () => { cancelAnimationFrame(raf); held.off(); unKeys(); window.removeEventListener('resize', fit); if (S.view.type === 'arcade') renderArcade(); });
  const { canvas, side: sideEl, root } = shell;
  const stage = root.querySelector('.game-stage');
  const ctx = canvas.getContext('2d');
  const msg = overlayMsg(stage);
  const fx = makeFx();
  let readyAt = 0;
  const api = {
    held, ctx, W, H, fx,
    get ready() { return performance.now() >= readyAt; },
    countdown(ms = 1800) { readyAt = performance.now() + ms; },
    get paused() { return paused; },
    pause(v) { if (over) return; paused = v; if (v) msg.show('Paused', pausedSub ? pausedSub() : null, [['Resume', 'play', () => api.pause(false), true], ['Restart', 'refresh', () => api.restart()], ['Quit', 'exit', () => shell.close()]]); else { msg.hide(); last = performance.now(); } },
    gameOver(title2, sub) { over = true; fx.shake(8); setTimeout(() => { if (over) msg.show(title2, sub, [['Play again', 'refresh', () => api.restart(), true], ['Quit', 'exit', () => shell.close()]]); }, 650); },
    restart() { over = false; paused = false; msg.hide(); fx.clear(); reset(api); api.countdown(); last = performance.now(); },
    close: () => shell.close(),
    get over() { return over; },
  };
  sideEl.append(...side(api), sideButtons(() => api.pause(!paused), () => shell.close()));
  const fit = () => fitCanvas(canvas, stage, W, H);
  window.addEventListener('resize', fit);
  fit();
  const press = (k, rep) => {
    if (k === 'menu' || k === 'p') return api.pause(!paused);
    if (k === 'view') return shell.close();
    if (over) { if (k === 'a' || k === 'start') api.restart(); return; }
    if (paused) { if (k === 'a') api.pause(false); return; }
    if (onButton) onButton(api, k, rep);
  };
  window.arcadeInput = (k, rep) => { if (!['up', 'down', 'left', 'right'].includes(k)) press(k, rep); };
  unKeys = gameKeys(keys, press, () => (over ? shell.close() : api.pause(!paused)));
  reset(api);
  api.countdown();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(34, now - last); last = now;
    if (!paused) fx.update(dt);
    if (!paused && !over && api.ready) update(api, dt);
    ctx.clearRect(0, 0, W, H);
    fx.begin(ctx);
    draw(api, now);
    // 3, 2, 1 before play starts.
    if (!api.ready && !paused && !over) {
      const left = (readyAt - now) / 1000;
      const n = Math.ceil(left / 0.6);
      const u = 1 - ((left % 0.6) / 0.6);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(1.4 - u * 0.4, 1.4 - u * 0.4);
      ctx.globalAlpha = 1 - u * 0.6; ctx.fillStyle = '#ffffff'; ctx.shadowColor = ACC(); ctx.shadowBlur = 30;
      ctx.font = `900 ${Math.round(H / 4)}px 'Segoe UI Variable Display', 'Segoe UI', system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(n >= 1 ? String(n) : 'Go', 0, 0); ctx.restore();
    }
    fx.end(ctx, W, H);
  };
  raf = requestAnimationFrame(loop);
  return api;
}

// ---------- Block Breaker ----------
function blockBreaker() {
  const W = 800, H = 600, COLS = 10, ROWS = 6;
  const PALETTE = ['#ff3b4b', '#f0452a', '#ffb02e', '#e0336a', '#c8174f', '#a3101e'];
  let paddle, balls, bricks, score, lives, level, drops, wideUntil, launched;
  const scoreEl = h('div', { class: 'gs-v' }), livesEl = h('div', { class: 'gs-v' }), levelEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' });
  const best = () => prefs.get('breakerBest', 0);
  const side = () => [statBox([['Score', scoreEl], ['Lives', livesEl], ['Level', levelEl], ['Best', bestEl]]),
    keyList(['A / D', 'move'], ['Space', 'launch'], ['Mouse', 'also moves the paddle'], ['Esc / P', 'pause'], [null, 'Controller: stick to move, A to launch, Menu to pause. Catch the falling W (wide paddle) and + (extra ball).'])];
  const upd = () => { bumpText(scoreEl, score.toLocaleString()); bumpText(livesEl, '♥'.repeat(Math.max(0, lives)) || '0'); bumpText(levelEl, String(level)); bestEl.textContent = Math.max(best(), score).toLocaleString(); };
  let G = null; // the running game, for effects
  const speed = () => 0.42 + (level - 1) * 0.05;
  const newBall = () => ({ x: paddle.x, y: paddle.y - 12, vx: 0, vy: 0, r: 8 });
  const buildLevel = () => {
    bricks = [];
    const bw = (W - 60) / COLS, bh = 26;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (level > 1 && (r + c + level) % 7 === 0) continue; // a few gaps on later levels
      bricks.push({ x: 30 + c * bw, y: 70 + r * (bh + 6), w: bw - 6, h: bh, hp: r < Math.min(2, level) ? 2 : 1, color: PALETTE[r % PALETTE.length], row: r });
    }
    balls = [newBall()]; launched = false; drops = [];
  };
  const reset = () => { paddle = { x: W / 2, y: H - 40, w: 120, h: 14 }; score = 0; lives = 3; level = 1; wideUntil = 0; buildLevel(); upd(); };
  const launch = () => { if (launched) return; launched = true; const a = (-Math.PI / 2) + (Math.random() - 0.5) * 0.6; balls.forEach((b) => { b.vx = Math.cos(a) * speed(); b.vy = Math.sin(a) * speed(); }); Sfx.tick(1); };
  let mouseX = null;
  const api = actionGame({
    title: 'Block Breaker', W, H, side,
    keys: { a: 'left', d: 'right', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'a', p: 'p' },
    onButton: (_api, k) => { if (k === 'a') launch(); },
    pausedSub: () => `${score.toLocaleString()} points · level ${level}`,
    reset,
    update(g, dt) {
      G = g;
      const pad = g.held.pad();
      let dir = pad.x;
      if (g.held.has('a', 'ArrowLeft')) dir = -1;
      if (g.held.has('d', 'ArrowRight')) dir = 1;
      if (dir) { paddle.x += dir * 0.75 * dt; mouseX = null; }
      else if (mouseX != null) paddle.x += (mouseX - paddle.x) * Math.min(1, dt / 40);
      paddle.w = performance.now() < wideUntil ? 190 : 120;
      paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));
      if (!launched) { balls.forEach((b) => { b.x = paddle.x; b.y = paddle.y - 12; }); return; }
      for (let i = balls.length - 1; i >= 0; i--) {
        const b = balls[i];
        const steps = 3;
        for (let s = 0; s < steps; s++) {
          b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
          if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
          if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
          if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }
          // Paddle: where it hits sets the angle.
          if (b.vy > 0 && b.y + b.r >= paddle.y - paddle.h / 2 && b.y < paddle.y + paddle.h / 2 && Math.abs(b.x - paddle.x) < paddle.w / 2 + b.r) {
            const rel = Math.max(-1, Math.min(1, (b.x - paddle.x) / (paddle.w / 2)));
            const a = -Math.PI / 2 + rel * 1.05;
            const sp = Math.hypot(b.vx, b.vy);
            b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.y = paddle.y - paddle.h / 2 - b.r;
            Sfx.tick(0.9);
            paddle.squash = performance.now();
            g.fx.burst(b.x, paddle.y - paddle.h / 2, [ACC(), '#ffffff'], 8, 2.5, { angle: -Math.PI / 2, spread: 1.4, size: 3 });
          }
          for (const br of bricks) {
            if (br.hp <= 0) continue;
            const cx = Math.max(br.x, Math.min(b.x, br.x + br.w)), cy = Math.max(br.y, Math.min(b.y, br.y + br.h));
            const dx = b.x - cx, dy = b.y - cy;
            if (dx * dx + dy * dy <= b.r * b.r) {
              if (Math.abs(dx) > Math.abs(dy)) b.vx = Math.sign(dx || -b.vx) * Math.abs(b.vx); else b.vy = Math.sign(dy || -b.vy) * Math.abs(b.vy);
              br.hp--;
              const pts = br.hp <= 0 ? (ROWS - br.row) * 10 : 5;
              score += pts;
              if (br.hp <= 0) {
                br.gone = performance.now();
                g.fx.burst(br.x + br.w / 2, br.y + br.h / 2, [br.color, '#ffffff'], 18, 3.5, { size: 5 });
                g.fx.text(br.x + br.w / 2, br.y, `+${pts}`, '#ffd257', 16, 700);
                g.fx.shake(1.6);
              } else g.fx.burst(b.x, b.y, '#ffffff', 5, 2, { size: 2 });
              Sfx.tick(br.hp <= 0 ? 1.5 : 1.2);
              if (br.hp <= 0 && Math.random() < 0.12) drops.push({ x: br.x + br.w / 2, y: br.y + br.h, kind: Math.random() < 0.5 ? 'W' : '+' });
              upd();
              break;
            }
          }
        }
        b.trail = b.trail || []; b.trail.push([b.x, b.y]); if (b.trail.length > 10) b.trail.shift();
        if (b.y > H + 20) balls.splice(i, 1);
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.y += 0.18 * dt;
        if (d.y > paddle.y - 10 && d.y < paddle.y + 10 && Math.abs(d.x - paddle.x) < paddle.w / 2 + 10) {
          if (d.kind === 'W') wideUntil = performance.now() + 12000;
          else if (balls[0]) { const b0 = balls[0]; balls.push({ ...b0, vx: -b0.vx, r: 8 }); }
          Sfx.land(); drops.splice(i, 1);
          g.fx.burst(d.x, paddle.y, d.kind === 'W' ? '#ffd257' : '#3ddc84', 24, 4, { angle: -Math.PI / 2, spread: 2 });
          g.fx.text(d.x, paddle.y - 30, d.kind === 'W' ? 'Wide paddle!' : 'Extra ball!', d.kind === 'W' ? '#ffd257' : '#3ddc84', 20, 1000);
        } else if (d.y > H) drops.splice(i, 1);
      }
      if (!balls.length) {
        lives--; upd();
        g.fx.shake(10); g.fx.flash('#ff3b4b', 0.35);
        if (lives <= 0) { if (score > best()) prefs.set('breakerBest', score); g.gameOver(score > 0 && score >= best() ? 'New best!' : 'Game over', `${score.toLocaleString()} points · level ${level}`); return; }
        balls = [newBall()]; launched = false; Sfx.tick(0.5);
      }
      if (bricks.every((br) => br.hp <= 0)) { level++; Sfx.land(); g.fx.flash('#ffffff', 0.3); g.fx.banner(`Level ${level}`, 'Faster ball, new wall', '#ff3b4b', 1500); buildLevel(); upd(); g.countdown(1500); }
    },
    draw(g, now) {
      const { ctx } = g;
      const acc = ACC();
      drawBoardBg(ctx, W, H, now, acc, 40);
      for (const br of bricks) {
        if (br.hp <= 0) continue;
        const bg = ctx.createLinearGradient(0, br.y, 0, br.y + br.h);
        bg.addColorStop(0, br.color); bg.addColorStop(1, hexA(br.color, 0.7));
        ctx.fillStyle = bg; ctx.shadowColor = br.color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.roundRect(br.x, br.y, br.w, br.h, 6); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.roundRect(br.x + 4, br.y + 3, br.w - 8, 5, 3); ctx.fill();
        if (br.hp > 1) { ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(br.x + 2, br.y + 2, br.w - 4, br.h - 4, 5); ctx.stroke(); }
      }
      for (const d of drops) {
        const col = d.kind === 'W' ? '#ffd257' : '#3ddc84';
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(d.x, d.y, 12 + Math.sin(now / 120) * 1.5, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#0b0b0d'; ctx.font = '900 13px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.kind, d.x, d.y + 1);
      }
      // Paddle: glows, squashes a little on each hit, shows the wide paddle timer.
      const sq = paddle.squash && now - paddle.squash < 160 ? 1 - (now - paddle.squash) / 160 : 0;
      const pw = paddle.w * (1 + sq * 0.08), ph = paddle.h * (1 - sq * 0.3);
      const pg = ctx.createLinearGradient(0, paddle.y - ph / 2, 0, paddle.y + ph / 2);
      pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.35, acc); pg.addColorStop(1, hexA(acc, 0.8));
      ctx.fillStyle = pg; ctx.shadowColor = acc; ctx.shadowBlur = 22;
      ctx.beginPath(); ctx.roundRect(paddle.x - pw / 2, paddle.y - ph / 2, pw, ph, 8); ctx.fill(); ctx.shadowBlur = 0;
      if (now < wideUntil) { ctx.fillStyle = '#ffd257'; ctx.fillRect(paddle.x - pw / 2, paddle.y + ph / 2 + 4, pw * ((wideUntil - now) / 12000), 3); }
      for (const b of balls) {
        (b.trail || []).forEach(([tx, ty], i, arr) => { ctx.globalAlpha = (i + 1) / arr.length * 0.35; ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(tx, ty, b.r * (0.4 + (i / arr.length) * 0.6), 0, 7); ctx.fill(); });
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 16; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      }
      if (!launched && g.ready && !g.paused && !g.over) { ctx.globalAlpha = 0.6 + Math.sin(now / 300) * 0.3; ctx.fillStyle = '#fff'; ctx.font = '700 20px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Press Space or A to launch', W / 2, H / 2 + 60); ctx.globalAlpha = 1; }
    },
  });
  const cv = document.querySelector('.game .game-canvas');
  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mouseX = ((e.clientX - r.left) / r.width) * W; });
  cv.addEventListener('pointerdown', () => { if (!api.paused && !api.over) launch(); });
}

// ---------- Snake ----------
function snakeGame() {
  const C = 28, R = 20, CELL = 30, W = C * CELL, H = R * CELL;
  let snake, dir, queue, food, bonus, score, tickMs, acc, ate, prev = [];
  const scoreEl = h('div', { class: 'gs-v' }), lenEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' });
  const best = () => prefs.get('snakeBest', 0);
  const upd = () => { bumpText(scoreEl, score.toLocaleString()); bumpText(lenEl, String(snake.length)); bestEl.textContent = Math.max(best(), score).toLocaleString(); };
  const free = () => { let p; do { p = { x: Math.floor(Math.random() * C), y: Math.floor(Math.random() * R) }; } while (snake.some((s) => s.x === p.x && s.y === p.y)); return p; };
  const reset = () => { snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }]; prev = snake.map((p) => ({ ...p })); dir = { x: 1, y: 0 }; queue = []; food = free(); bonus = null; score = 0; tickMs = 120; acc = 0; ate = 0; upd(); };
  const turn = (d) => {
    const lastDir = queue.length ? queue[queue.length - 1] : dir;
    if (d.x === -lastDir.x && d.y === -lastDir.y) return;
    if (d.x === lastDir.x && d.y === lastDir.y) return;
    if (queue.length < 3) queue.push(d);
  };
  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  let padLast = '';
  actionGame({
    title: 'Snake', W, H,
    side: () => [statBox([['Score', scoreEl], ['Length', lenEl], ['Best', bestEl]]), keyList(['W A S D', 'turn'], ['Arrows', 'turn too'], ['Esc / P', 'pause'], [null, 'Controller: stick or D-pad to turn, Menu to pause. Gold food is worth 5 and fades away.'])],
    keys: { w: 'up', a: 'left', s: 'down', d: 'right', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', p: 'p' },
    onButton: (_g, k) => { if (DIRS[k]) turn(DIRS[k]); },
    pausedSub: () => `${score.toLocaleString()} points`,
    reset,
    update(g, dt) {
      const pad = g.held.pad();
      const pd = Math.abs(pad.x) > Math.abs(pad.y) ? (pad.x < 0 ? 'left' : pad.x > 0 ? 'right' : '') : (pad.y < 0 ? 'up' : pad.y > 0 ? 'down' : '');
      if (pd && pd !== padLast) turn(DIRS[pd]);
      padLast = pd;
      acc += dt;
      while (acc >= tickMs) {
        acc -= tickMs;
        if (queue.length) dir = queue.shift();
        prev = snake.map((p) => ({ ...p }));
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= C || head.y >= R || snake.some((s, i) => i < snake.length - 1 && s.x === head.x && s.y === head.y)) {
          Sfx.tick(0.4);
          g.fx.flash('#ff3b4b', 0.4);
          snake.forEach((sg, i) => { if (i % 2 === 0) g.fx.burst(sg.x * CELL + CELL / 2, sg.y * CELL + CELL / 2, [ACC(), '#ffffff'], 4, 3, { size: 5 }); });
          acc = tickMs; prev = snake.map((p) => ({ ...p }));
          const isBest = score > best();
          if (isBest) prefs.set('snakeBest', score);
          g.gameOver(isBest ? 'New best!' : 'Game over', `${score.toLocaleString()} points · length ${snake.length}`);
          return;
        }
        snake.unshift(head);
        let grew = false;
        if (head.x === food.x && head.y === food.y) { g.fx.burst(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, ['#3ddc84', '#ffffff'], 14, 3, { size: 4, gravity: 0 }); g.fx.text(food.x * CELL + CELL / 2, food.y * CELL, '+1', '#3ddc84', 18, 700); score += 1; ate++; grew = true; food = free(); Sfx.tick(1.6); tickMs = Math.max(55, tickMs - 2.5); if (ate % 5 === 0) bonus = { ...free(), until: performance.now() + 6000 }; }
        if (bonus && head.x === bonus.x && head.y === bonus.y) { g.fx.burst(bonus.x * CELL + CELL / 2, bonus.y * CELL + CELL / 2, ['#ffd257', '#ffffff'], 30, 4.5, { size: 5, gravity: 0 }); g.fx.text(bonus.x * CELL + CELL / 2, bonus.y * CELL, '+5', '#ffd257', 24, 900); g.fx.shake(3); score += 5; grew = true; bonus = null; Sfx.land(); }
        if (!grew) snake.pop();
        if (bonus && performance.now() > bonus.until) bonus = null;
        upd();
      }
    },
    draw(g, now) {
      const { ctx } = g;
      const acc2 = ACC();
      drawBoardBg(ctx, W, H, now, acc2, 0);
      ctx.fillStyle = 'rgba(255,255,255,.022)';
      for (let y = 0; y < R; y++) for (let x = (y % 2); x < C; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      const pulse = 1 + Math.sin(now / 160) * 0.1;
      const fxp = food.x * CELL + CELL / 2, fyp = food.y * CELL + CELL / 2;
      const fg = ctx.createRadialGradient(fxp, fyp, 0, fxp, fyp, CELL);
      fg.addColorStop(0, 'rgba(61,220,132,.35)'); fg.addColorStop(1, 'rgba(61,220,132,0)'); ctx.fillStyle = fg; ctx.fillRect(fxp - CELL, fyp - CELL, CELL * 2, CELL * 2);
      ctx.fillStyle = '#3ddc84'; ctx.beginPath(); ctx.arc(fxp, fyp, CELL * 0.3 * pulse, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(fxp - 3, fyp - 3, CELL * 0.08, 0, 7); ctx.fill();
      if (bonus) { const left = (bonus.until - now) / 6000; ctx.globalAlpha = Math.max(0.3, left); ctx.fillStyle = '#ffd257'; ctx.shadowColor = '#ffd257'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.arc(bonus.x * CELL + CELL / 2, bonus.y * CELL + CELL / 2, CELL * 0.4 * pulse, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      // Smooth movement: each piece glides from where it was to where it is now.
      const t = g.over ? 1 : Math.max(0, Math.min(1, acc / tickMs));
      const pts = snake.map((sg, i) => { const p0 = prev[i] || prev[prev.length - 1] || sg; return { x: (p0.x + (sg.x - p0.x) * t) * CELL + CELL / 2, y: (p0.y + (sg.y - p0.y) * t) * CELL + CELL / 2 }; });
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.shadowColor = acc2; ctx.shadowBlur = 18;
      for (let i = pts.length - 1; i > 0; i--) {
        const a = pts[i], b = pts[i - 1];
        if (Math.abs(a.x - b.x) > CELL * 1.5 || Math.abs(a.y - b.y) > CELL * 1.5) continue;
        ctx.strokeStyle = hexA(acc2, 1 - (i / pts.length) * 0.55);
        ctx.lineWidth = CELL * (0.78 - (i / pts.length) * 0.25);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      const hp = pts[0];
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(hp.x, hp.y, CELL * 0.42, 0, 7); ctx.fill();
      ctx.fillStyle = '#0b0b0d';
      const ex = dir.y !== 0 ? 6 : 0, ey = dir.x !== 0 ? 6 : 0;
      [-1, 1].forEach((sgn) => { ctx.beginPath(); ctx.arc(hp.x + dir.x * 5 + sgn * ex, hp.y + dir.y * 5 + sgn * ey, 3, 0, 7); ctx.fill(); });
    },
  });
}

// ---------- Paddle Duel ----------
function paddleDuel() {
  const W = 800, H = 500, PH = 90, PW = 14, WIN = 7;
  let mode = prefs.get('duelMode', 'normal'); // easy / normal / hard / two
  let p1, p2, ball, s1, s2, serveAt, hits;
  const s1El = h('div', { class: 'gs-v' }), s2El = h('div', { class: 'gs-v' });
  const modeSeg = h('div', { class: 'seg gs-risk' });
  const MODES = { easy: 'Easy', normal: 'Normal', hard: 'Hard', two: '2 players' };
  const upd = () => {
    bumpText(s1El, String(s1)); bumpText(s2El, String(s2));
    modeSeg.replaceChildren(...Object.entries(MODES).map(([k, n]) => h('button', { class: k === mode ? 'on' : '', onclick: () => { mode = k; prefs.set('duelMode', k); api.restart(); } }, n)));
  };
  const serve = (toLeft) => { ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, toLeft }; serveAt = performance.now() + 900; hits = 0; };
  const reset = () => { p1 = { y: H / 2 }; p2 = { y: H / 2 }; s1 = 0; s2 = 0; serve(Math.random() < 0.5); upd(); };
  const api = actionGame({
    title: 'Paddle Duel', W, H,
    side: () => [statBox([['You', s1El], [mode === 'two' ? 'Player 2' : 'Computer', s2El]]), h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Opponent'), modeSeg),
      keyList(['W / S', 'move (player 1)'], ['↑ / ↓', 'move (player 2, or you in 1 player)'], ['Esc / P', 'pause'], [null, `First to ${WIN} wins. Controller: stick to move, Menu to pause.`])],
    keys: { p: 'p' },
    pausedSub: () => `${s1} : ${s2}`,
    reset,
    update(g, dt) {
      const pad = g.held.pad();
      let d1 = pad.y;
      if (g.held.has('w')) d1 = -1; if (g.held.has('s')) d1 = 1;
      if (mode !== 'two') { if (g.held.has('ArrowUp')) d1 = -1; if (g.held.has('ArrowDown')) d1 = 1; }
      p1.y += d1 * 0.62 * dt;
      if (mode === 'two') {
        let d2 = 0; if (g.held.has('ArrowUp')) d2 = -1; if (g.held.has('ArrowDown')) d2 = 1;
        p2.y += d2 * 0.62 * dt;
      } else {
        const sp = { easy: 0.3, normal: 0.42, hard: 0.6 }[mode];
        const err = { easy: 40, normal: 18, hard: 6 }[mode];
        const target = ball.vx > 0 ? ball.y + Math.sin(performance.now() / 300) * err : H / 2;
        const diff = target - p2.y;
        p2.y += Math.max(-sp * dt, Math.min(sp * dt, diff));
      }
      p1.y = Math.max(PH / 2, Math.min(H - PH / 2, p1.y)); p2.y = Math.max(PH / 2, Math.min(H - PH / 2, p2.y));
      if (serveAt) {
        if (performance.now() < serveAt) return;
        serveAt = 0; const a = (Math.random() - 0.5) * 0.8; const sp = 0.36;
        ball.vx = Math.cos(a) * sp * (ball.toLeft ? -1 : 1); ball.vy = Math.sin(a) * sp;
      }
      ball.trail = ball.trail || []; ball.trail.push([ball.x, ball.y]); if (ball.trail.length > 14) ball.trail.shift();
      const steps = 3;
      for (let s = 0; s < steps; s++) {
        ball.x += ball.vx * dt / steps; ball.y += ball.vy * dt / steps;
        if (ball.y < 8) { ball.y = 8; ball.vy = Math.abs(ball.vy); Sfx.tick(0.8); g.fx.burst(ball.x, 4, '#ffffff', 4, 2, { angle: Math.PI / 2, size: 2, gravity: 0 }); }
        if (ball.y > H - 8) { ball.y = H - 8; ball.vy = -Math.abs(ball.vy); Sfx.tick(0.8); g.fx.burst(ball.x, H - 4, '#ffffff', 4, 2, { angle: -Math.PI / 2, size: 2, gravity: 0 }); }
        const hitPaddle = (px, py, side2) => {
          if (Math.abs(ball.x - px) < PW / 2 + 8 && Math.abs(ball.y - py) < PH / 2 + 8 && Math.sign(ball.vx) === side2) {
            const rel = (ball.y - py) / (PH / 2);
            const sp = Math.min(0.95, Math.hypot(ball.vx, ball.vy) * 1.06);
            const a = rel * 0.9;
            ball.vx = -side2 * Math.cos(a) * sp; ball.vy = Math.sin(a) * sp;
            ball.x = px - side2 * (PW / 2 + 9);
            hits++; Sfx.tick(1.4);
            (side2 < 0 ? p1 : p2).hit = performance.now();
            g.fx.burst(ball.x, ball.y, [side2 < 0 ? ACC() : '#e8e8ee', '#ffffff'], 12, 3.5, { angle: side2 < 0 ? 0 : Math.PI, spread: 1.4, size: 3, gravity: 0 });
            if (hits % 5 === 0) g.fx.text(W / 2, 40, `Rally ${hits}!`, '#ffd257', 22, 900);
          }
        };
        hitPaddle(30, p1.y, -1);
        hitPaddle(W - 30, p2.y, 1);
      }
      if (ball.x < -20 || ball.x > W + 20) {
        const leftScored = ball.x > 0;
        if (ball.x < 0) s2++; else s1++;
        Sfx.land(); upd();
        g.fx.shake(7); g.fx.flash(leftScored ? ACC() : '#e8e8ee', 0.25);
        g.fx.burst(leftScored ? W - 10 : 10, ball.y, [leftScored ? ACC() : '#e8e8ee', '#ffffff'], 40, 6, { angle: leftScored ? Math.PI : 0, spread: 1.6, size: 4, gravity: 0 });
        if (s1 < WIN && s2 < WIN) g.fx.banner(`${s1} : ${s2}`, leftScored ? (mode === 'two' ? 'Player 1 scores' : 'You score') : (mode === 'two' ? 'Player 2 scores' : 'Computer scores'), leftScored ? ACC() : '#e8e8ee', 1100);
        if (s1 >= WIN || s2 >= WIN) {
          const youWin = s1 > s2;
          if (mode !== 'two' && youWin) prefs.set('duelWins', prefs.get('duelWins', 0) + 1);
          g.gameOver(mode === 'two' ? (youWin ? 'Player 1 wins' : 'Player 2 wins') : youWin ? 'You win!' : 'Computer wins', `${s1} : ${s2}`);
          return;
        }
        serve(ball.x > W / 2);
      }
    },
    draw(g, now) {
      const { ctx } = g;
      const acc = ACC();
      drawBoardBg(ctx, W, H, now, acc, 0);
      ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 2; ctx.strokeRect(6, 6, W - 12, H - 12);
      ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.setLineDash([10, 14]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2, 14); ctx.lineTo(W / 2, H - 14); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 60, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.font = '900 140px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(s1), W / 4, H / 2); ctx.fillText(String(s2), W * 3 / 4, H / 2);
      const drawPaddle = (x, p, col) => {
        const sq = p.hit && now - p.hit < 180 ? 1 - (now - p.hit) / 180 : 0;
        const w = PW * (1 + sq * 0.5), hgt = PH * (1 - sq * 0.12);
        const gr = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
        gr.addColorStop(0, hexA(col, 0.8)); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, hexA(col, 0.8));
        ctx.fillStyle = gr; ctx.shadowColor = col; ctx.shadowBlur = 22 + sq * 20;
        ctx.beginPath(); ctx.roundRect(x - w / 2, p.y - hgt / 2, w, hgt, 7); ctx.fill(); ctx.shadowBlur = 0;
      };
      drawPaddle(30, p1, acc);
      drawPaddle(W - 30, p2, '#c8c8d2');
      (ball.trail || []).forEach(([tx, ty], i, arr) => { ctx.globalAlpha = ((i + 1) / arr.length) * 0.4; ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(tx, ty, 8 * (0.3 + (i / arr.length) * 0.7), 0, 7); ctx.fill(); });
      ctx.globalAlpha = 1;
      const spd = Math.hypot(ball.vx, ball.vy);
      ctx.shadowColor = spd > 0.6 ? '#ffd257' : '#ffffff'; ctx.shadowBlur = 18; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, 8, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      if (serveAt && g.ready && !g.paused && !g.over) { ctx.globalAlpha = 0.5 + Math.sin(now / 150) * 0.3; ctx.fillStyle = '#fff'; ctx.font = '700 16px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('Serve', W / 2, H / 2 + 80); ctx.globalAlpha = 1; }
    },
  });
}

// ---------- Blackjack ----------
// Six decks, dealer stands on 17, blackjack pays 3 to 2, double on the first two cards, one split.
// Has its own pretend points (starts at 10,000), separate from Peg Drop.
// The table is built once; each new card is added on its own and slides in from the shoe,
// so cards already on the table never redraw or flicker.
function blackjack() {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const START = 10000;
  let bank = Number(prefs.get('bjBank', START));
  if (!Number.isFinite(bank)) bank = START;
  let bet = Number(prefs.get('bjBet', 100)) || 100;
  let shoe = [], dealer = [], hands = [], active = 0, phase = 'bet', holeHidden = true, paused = false;
  const stats = prefs.get('bjStats', { w: 0, l: 0, p: 0 });
  const save = () => { prefs.set('bjBank', bank); prefs.set('bjBet', bet); prefs.set('bjStats', stats); };
  const newShoe = () => { shoe = []; for (let d = 0; d < 6; d++) for (const su of SUITS) for (const r of RANKS) shoe.push({ r, s: su }); for (let i = shoe.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [shoe[i], shoe[k]] = [shoe[k], shoe[i]]; } };
  const take = () => { if (shoe.length < 6 * 52 * 0.25) newShoe(); return shoe.pop(); };
  const val = (cards) => { let t = 0, aces = 0; for (const c of cards) { if (c.r === 'A') { aces++; t += 11; } else t += ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r); } while (t > 21 && aces) { t -= 10; aces--; } return { t, soft: aces > 0 }; };
  const isBJ = (cards) => cards.length === 2 && val(cards).t === 21;

  let unKeys = () => {};
  const timers = new Set();
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); };
  const sleep = (ms) => new Promise((r) => later(r, ms));
  const shell = gameShell('Blackjack', () => { unKeys(); timers.forEach(clearTimeout); save(); if (S.view.type === 'arcade') renderArcade(); });
  const { canvas, side, root } = shell;
  canvas.remove();
  const stage = root.querySelector('.game-stage');

  // ----- the table, built once -----
  const shoeEl = h('div', { class: 'bj-shoe' }, h('div', { class: 'bj-card back' }, h('span', { class: 'bj-gem' })), h('div', { class: 'bj-card back' }, h('span', { class: 'bj-gem' })));
  const dTotal = h('b', { class: 'bj-total' });
  const dCards = h('div', { class: 'bj-cards' });
  const dealerRow = h('div', { class: 'bj-row dealer' }, h('div', { class: 'bj-label' }, 'Dealer', dTotal), dCards);
  const chips = h('div', { class: 'bj-chips' });
  const chipAmt = h('div', { class: 'bj-chip-amt' });
  const hint = h('div', { class: 'bj-hint' });
  const result = h('div', { class: 'bj-result' });
  const center = h('div', { class: 'bj-center' }, h('div', { class: 'bj-stack' }, chips, chipAmt), hint, result);
  const handsEl = h('div', { class: 'bj-hands' });
  const actions = h('div', { class: 'bj-actions' });
  const table = h('div', { class: 'bj-table' },
    h('div', { class: 'bj-arc' }, 'Blackjack pays 3 to 2 · Dealer stands on 17'),
    shoeEl, dealerRow, center, handsEl, actions);
  stage.append(table);
  const msg = overlayMsg(stage);

  // ----- side panel -----
  const bankEl = h('div', { class: 'gs-v' }), statEl = h('div', { class: 'gs-s' });
  const betIn = h('input', { class: 'text-input gs-in', spellcheck: 'false', title: 'Type an amount, like 500, 2.5M or 1Dc' });
  const sb = (label, fn) => h('button', { class: 'chip', onclick: fn }, label);
  side.append(
    h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Points'), bankEl, statEl),
    h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Bet'), betIn,
      h('div', { class: 'gs-chips' }, sb('Min', () => setBet(1)), sb('½', () => setBet(bet / 2)), sb('×2', () => setBet(bet * 2)), sb('×10', () => setBet(bet * 10)), sb('Max', () => setBet(bank)))),
    h('div', { class: 'gs-box gs-actions' },
      h('div', { class: 'row', style: { gap: '6px' } },
        h('button', { class: 'btn', style: { flex: 1 }, onclick: () => setPause(!paused) }, icon('pause'), 'Pause'),
        h('button', { class: 'btn', style: { flex: 1 }, onclick: () => shell.close() }, icon('exit'), 'Quit')),
      h('button', { class: 'btn', onclick: () => resetPoints() }, icon('refresh'), 'Reset to 10,000')),
    keyList(['Space', 'deal'], ['H', 'hit'], ['S', 'stand'], ['D', 'double'], ['P', 'split'], ['Esc', 'pause'], [null, 'Controller: A hit or deal, B stand, X double, Y split, Menu pause. Pretend points only, separate from Peg Drop.']));
  const clampBet = (v) => Math.max(1, Math.min(Math.floor(Number.isFinite(v) ? v : 1), 1e300));
  function setBet(v) { if (phase !== 'bet' && phase !== 'done') return; bet = clampBet(v); save(); upd(); renderCenter(); }
  betIn.addEventListener('change', () => { const v = parseBig(betIn.value); if (Number.isFinite(v)) setBet(v); else upd(); });
  betIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') betIn.blur(); });
  betIn.addEventListener('blur', () => later(upd, 0));
  let shownBank = bank;
  let countRaf = 0;
  function upd() {
    // Points count up or down to the new total instead of jumping.
    cancelAnimationFrame(countRaf);
    const from = shownBank, to = bank, t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / 500);
      shownBank = from + (to - from) * (1 - Math.pow(1 - u, 3));
      bankEl.textContent = fmtBig(Math.floor(shownBank));
      if (u < 1 && bankEl.isConnected) countRaf = requestAnimationFrame(step); else shownBank = to;
    };
    if (from !== to) { bankEl.classList.toggle('up', to > from); bankEl.classList.toggle('down', to < from); countRaf = requestAnimationFrame(step); } else bankEl.textContent = fmtBig(Math.floor(bank));
    statEl.textContent = `Won ${stats.w} · Lost ${stats.l} · Push ${stats.p}`;
    if (document.activeElement !== betIn) betIn.value = fmtBig(bet);
    betIn.disabled = !(phase === 'bet' || phase === 'done');
  }
  function resetPoints() {
    if (!(phase === 'bet' || phase === 'done')) return;
    bank = START; save(); upd(); renderCenter();
    showResult('Points reset', '10,000 to play with', 'push');
  }

  // ----- cards -----
  const makeCard = (c, faceDown, deal) => {
    const red = c.s === '♥' || c.s === '♦';
    const el = h('div', { class: `bj-card3d${faceDown ? ' down' : ''}` },
      h('div', { class: 'bj-inner' },
        h('div', { class: `bj-card front${red ? ' red' : ''}` }, h('span', { class: 'bj-r' }, c.r, h('i', {}, c.s)), h('span', { class: 'bj-s' }, c.s), h('span', { class: 'bj-r bot' }, c.r, h('i', {}, c.s))),
        h('div', { class: 'bj-card back' }, h('span', { class: 'bj-gem' }))));
    if (deal) {
      // Start on top of the shoe, then glide into place.
      requestAnimationFrame(() => {
        const a = shoeEl.getBoundingClientRect(), b = el.getBoundingClientRect();
        el.style.transition = 'none';
        el.style.transform = `translate(${a.left - b.left}px, ${a.top - b.top}px) rotate(-14deg) scale(.9)`;
        el.style.opacity = '0.6';
        requestAnimationFrame(() => {
          el.style.transition = 'transform .42s cubic-bezier(.2,.8,.2,1), opacity .2s';
          el.style.transform = ''; el.style.opacity = '';
        });
      });
    }
    return el;
  };
  // Adds only the cards that are new; never rebuilds the ones already showing.
  const syncCards = (box, cards, hideIndex) => {
    if (box.children.length > cards.length) box.replaceChildren();
    for (let i = box.children.length; i < cards.length; i++) box.append(makeCard(cards[i], i === hideIndex, true));
    if (hideIndex == null) for (const el of box.querySelectorAll('.bj-card3d.down')) el.classList.remove('down');
  };
  const totalText = (cards) => { const v = val(cards); return v.t > 21 ? `${v.t} · Bust` : isBJ(cards) ? 'Blackjack' : v.soft && v.t < 21 ? `${v.t - 10} / ${v.t}` : String(v.t); };
  let handEls = [];
  const buildHands = (dealAll) => {
    handEls = hands.map(() => {
      const total = h('b', { class: 'bj-total' }), betTag = h('span', { class: 'bj-bet' }), res = h('span', { class: 'bj-res' }), cards = h('div', { class: 'bj-cards' });
      const row = h('div', { class: 'bj-row' }, h('div', { class: 'bj-label' }, h('span', { class: 'bj-name' }), total, betTag, res), cards);
      return { row, total, betTag, res, cards };
    });
    handsEl.replaceChildren(...handEls.map((x) => x.row));
    if (!dealAll) hands.forEach((hd, i) => { for (const c of hd.cards) handEls[i].cards.append(makeCard(c, false, false)); });
  };
  function renderTable() {
    syncCards(dCards, dealer, holeHidden && dealer.length > 1 ? 1 : null);
    bumpText(dTotal, dealer.length ? (holeHidden ? totalText([dealer[0]]) : totalText(dealer)) : '');
    dTotal.hidden = !dealer.length;
    if (handEls.length !== hands.length) buildHands(true);
    hands.forEach((hd, i) => {
      const e = handEls[i];
      syncCards(e.cards, hd.cards, null);
      e.row.querySelector('.bj-name').textContent = hands.length > 1 ? `Hand ${i + 1}` : 'You';
      bumpText(e.total, totalText(hd.cards));
      e.betTag.textContent = fmtBig(hd.bet);
      e.row.classList.toggle('active', phase === 'play' && i === active && hands.length > 1);
      e.row.classList.toggle('bust', val(hd.cards).t > 21);
      e.res.className = `bj-res${hd.result ? ` ${hd.result} on` : ''}`;
      e.res.textContent = hd.result ? { win: 'Win', lose: 'Lose', push: 'Push', bj: 'Blackjack' }[hd.result] : '';
    });
    renderCenter();
    renderActions();
    upd();
  }
  function renderCenter() {
    const amount = phase === 'bet' || phase === 'done' ? bet : hands.reduce((a, hd) => a + hd.bet, 0);
    const n = Math.max(1, Math.min(7, Math.floor(Math.log10(Math.max(1, amount))) + 1));
    const COLORS = ['#e8e8ee', '#ff3b4b', '#3d7bff', '#3ddc84', '#16161a', '#b44cff', '#ffb02e'];
    if (chips.childElementCount !== n || chips.dataset.c !== String(n)) {
      chips.dataset.c = String(n);
      chips.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', { class: 'bj-chip', style: { '--c': COLORS[i % COLORS.length], bottom: `${i * 5}px` } })));
    }
    chipAmt.textContent = fmtBig(amount);
    hint.textContent = phase === 'bet' ? 'Set your bet and deal' : phase === 'done' ? 'Deal again or change your bet' : '';
  }
  const actBtn = (label, key, fn, ok, primary) => h('button', { class: `btn big ${primary ? 'primary' : 'glass'}`, disabled: !ok, onclick: fn }, label, h('span', { class: 'bj-key' }, key));
  function renderActions() {
    const hd = hands[active];
    const canDouble = phase === 'play' && hd && hd.cards.length === 2 && bank >= hd.bet;
    const canSplit = phase === 'play' && hands.length === 1 && hd && hd.cards.length === 2 && hd.cards[0].r === hd.cards[1].r && bank >= hd.bet;
    const key = `${phase}|${canDouble}|${canSplit}|${bank >= 1}`;
    if (actions.dataset.key === key) return;
    actions.dataset.key = key;
    actions.replaceChildren(...(phase === 'bet' || phase === 'done'
      ? [actBtn(phase === 'done' ? 'Deal again' : 'Deal', 'Space', deal, bank >= 1, true)]
      : [actBtn('Hit', 'H', hit, phase === 'play', true), actBtn('Stand', 'S', stand, phase === 'play'), actBtn('Double', 'D', dbl, canDouble), actBtn('Split', 'P', split, canSplit)]));
  }
  function showResult(title, sub, kind) {
    result.className = `bj-result ${kind}`;
    result.replaceChildren(h('div', { class: 'bj-rt' }, title), sub ? h('div', { class: 'bj-rs' }, sub) : null);
    void result.offsetWidth; result.classList.add('on');
  }
  const hideResult = () => result.classList.remove('on');

  // ----- play -----
  async function deal() {
    if (!(phase === 'bet' || phase === 'done') || paused) return;
    if (bet > bank) bet = clampBet(bank);
    if (bank < 1) { showResult('Out of points', 'Reset to 10,000 to keep playing', 'lose'); return; }
    hideResult();
    bank -= bet; save();
    dealer = []; hands = [{ cards: [], bet, result: null }]; active = 0; holeHidden = true; phase = 'deal';
    dCards.replaceChildren(); buildHands(true);
    renderTable();
    for (let i = 0; i < 2; i++) {
      hands[0].cards.push(take()); renderTable(); Sfx.tick(1.4); await sleep(320);
      dealer.push(take()); renderTable(); Sfx.tick(1.4); await sleep(320);
    }
    if (isBJ(hands[0].cards) || isBJ(dealer)) { await finishRound(); return; }
    phase = 'play'; renderTable();
  }
  function hit() {
    if (phase !== 'play' || paused) return;
    const hd = hands[active]; hd.cards.push(take()); Sfx.tick(1.4);
    renderTable();
    if (val(hd.cards).t >= 21) { phase = 'wait'; renderActions(); later(next, 450); }
  }
  function stand() { if (phase !== 'play' || paused) return; next(); }
  function dbl() {
    const hd = hands[active];
    if (phase !== 'play' || paused || hd.cards.length !== 2 || bank < hd.bet) return;
    bank -= hd.bet; hd.bet *= 2; hd.cards.push(take()); Sfx.tick(1.4); save();
    phase = 'wait'; renderTable(); later(next, 500);
  }
  function split() {
    if (phase !== 'play' || paused || hands.length !== 1) return;
    const hd = hands[0];
    if (hd.cards.length !== 2 || hd.cards[0].r !== hd.cards[1].r || bank < hd.bet) return;
    bank -= hd.bet; save();
    const aces = hd.cards[0].r === 'A';
    hands = [{ cards: [hd.cards[0]], bet: hd.bet, result: null }, { cards: [hd.cards[1]], bet: hd.bet, result: null }];
    buildHands(false);
    phase = 'wait'; renderTable();
    later(() => { hands[0].cards.push(take()); renderTable(); Sfx.tick(1.4); }, 250);
    later(() => {
      hands[1].cards.push(take()); renderTable(); Sfx.tick(1.4);
      if (aces) { active = 1; next(); return; } // split aces get one card each
      active = 0; phase = 'play';
      if (val(hands[0].cards).t === 21) next(); else renderTable();
    }, 550);
  }
  function next() {
    if (active < hands.length - 1) { active++; phase = 'play'; if (val(hands[active].cards).t === 21) return next(); renderTable(); return; }
    finishRound();
  }
  async function finishRound() {
    phase = 'dealer'; renderActions();
    await sleep(250);
    holeHidden = false; renderTable(); Sfx.tick(1.1);
    await sleep(600);
    const allBust = hands.every((hd) => val(hd.cards).t > 21);
    const playerBJ = hands.length === 1 && isBJ(hands[0].cards);
    if (!allBust && !playerBJ && !isBJ(dealer)) {
      while (val(dealer).t < 17) { dealer.push(take()); renderTable(); Sfx.tick(1.2); await sleep(560); }
    }
    const d = val(dealer).t;
    let net = 0, staked = 0;
    for (const hd of hands) {
      const p = val(hd.cards).t;
      staked += hd.bet;
      if (hands.length === 1 && isBJ(hd.cards) && !isBJ(dealer)) { hd.result = 'bj'; bank += hd.bet * 2.5; net += hd.bet * 1.5; }
      else if (p > 21) { hd.result = 'lose'; net -= hd.bet; }
      else if (isBJ(dealer) && !(hands.length === 1 && isBJ(hd.cards))) { hd.result = 'lose'; net -= hd.bet; }
      else if (d > 21 || p > d) { hd.result = 'win'; bank += hd.bet * 2; net += hd.bet; }
      else if (p === d) { hd.result = 'push'; bank += hd.bet; }
      else { hd.result = 'lose'; net -= hd.bet; }
      if (hd.result === 'win' || hd.result === 'bj') stats.w++; else if (hd.result === 'push') stats.p++; else stats.l++;
    }
    phase = 'done'; save(); renderTable();
    const anyBJ = hands.some((hd) => hd.result === 'bj');
    if (net > 0) { Sfx.land(); showResult(anyBJ ? 'Blackjack!' : d > 21 ? 'Dealer busts!' : 'You win!', `+${fmtBig(Math.round(net))} points`, 'win'); }
    else if (net < 0) { Sfx.tick(0.5); showResult(hands.every((hd) => val(hd.cards).t > 21) ? 'Bust' : isBJ(dealer) ? 'Dealer blackjack' : 'Dealer wins', `−${fmtBig(Math.round(-net))} points`, 'lose'); }
    else showResult('Push', 'Your bet comes back', 'push');
  }
  function setPause(v) {
    paused = v;
    if (v) msg.show('Paused', `${fmtBig(Math.floor(bank))} points`, [['Resume', 'play', () => setPause(false), true], ['Quit', 'exit', () => shell.close()]]);
    else msg.hide();
  }
  const input = (k) => {
    if (k === 'menu' || k === 'esc') return setPause(!paused);
    if (k === 'view') return shell.close();
    if (paused) { if (k === 'a') setPause(false); return; }
    if (phase === 'bet' || phase === 'done') { if (k === 'a' || k === 'deal') deal(); else if (k === 'up') setBet(bet * 2); else if (k === 'down') setBet(bet / 2); return; }
    if (k === 'a' || k === 'hit') hit(); else if (k === 'b' || k === 'stand') stand(); else if (k === 'x' || k === 'double') dbl(); else if (k === 'y' || k === 'split') split();
  };
  window.arcadeInput = (k) => input(k);
  unKeys = gameKeys({ ' ': 'deal', Enter: 'deal', h: 'hit', s: 'stand', d: 'double', p: 'split', ArrowUp: 'up', ArrowDown: 'down' }, input, () => setPause(!paused), (e) => e.target === betIn);
  newShoe();
  renderTable();
}

// ---------- previews on the Arcade page ----------
function drawPreview2(c) {
  const x = c.getContext('2d');
  const acc = ACC();
  const g = c.dataset.game;
  if (g === 'breaker') {
    const P = ['#ff3b4b', '#f0452a', '#ffb02e', '#e0336a', '#c8174f'];
    for (let r = 0; r < 5; r++) for (let i = 0; i < 8; i++) if ((r + i) % 5) { x.fillStyle = P[r]; x.fillRect(42 + i * 35, 24 + r * 16, 31, 12); }
    x.fillStyle = '#fff'; x.beginPath(); x.arc(200, 150, 6, 0, 7); x.fill();
    x.fillStyle = acc; x.fillRect(150, 190, 90, 9);
  } else if (g === 'snake') {
    const pts = [[6, 6], [7, 6], [8, 6], [9, 6], [9, 7], [9, 8], [10, 8], [11, 8], [12, 8], [12, 7]];
    pts.forEach(([a, b], i) => { x.fillStyle = i === pts.length - 1 ? '#fff' : acc; x.globalAlpha = 0.5 + (i / pts.length) * 0.5; x.fillRect(a * 18 + 20, b * 18, 16, 16); });
    x.globalAlpha = 1; x.fillStyle = '#3ddc84'; x.beginPath(); x.arc(15 * 18 + 28, 7 * 18 + 8, 7, 0, 7); x.fill();
  } else if (g === 'duel') {
    x.strokeStyle = 'rgba(255,255,255,.15)'; x.setLineDash([6, 8]); x.beginPath(); x.moveTo(180, 10); x.lineTo(180, 210); x.stroke(); x.setLineDash([]);
    x.fillStyle = acc; x.fillRect(30, 70, 9, 60); x.fillStyle = '#e8e8ee'; x.fillRect(321, 100, 9, 60);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(230, 90, 7, 0, 7); x.fill();
  } else if (g === 'bj') {
    const card = (cx, cy, r, s, red, rot) => { x.save(); x.translate(cx, cy); x.rotate(rot); x.fillStyle = '#f4f4f6'; x.beginPath(); x.roundRect(-36, -50, 72, 100, 8); x.fill(); x.fillStyle = red ? acc : '#16161a'; x.font = '800 20px Segoe UI'; x.textAlign = 'left'; x.fillText(r, -28, -26); x.font = '36px Segoe UI'; x.textAlign = 'center'; x.fillText(s, 0, 16); x.restore(); };
    card(150, 112, 'A', '♠', false, -0.12); card(210, 108, 'K', '♥', true, 0.1);
  }
}
