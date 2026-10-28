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
  const api = {
    held, ctx, W, H,
    get paused() { return paused; },
    pause(v) { if (over) return; paused = v; if (v) msg.show('Paused', pausedSub ? pausedSub() : null, [['Resume', 'play', () => api.pause(false), true], ['Restart', 'refresh', () => api.restart()], ['Quit', 'exit', () => shell.close()]]); else { msg.hide(); last = performance.now(); } },
    gameOver(title2, sub) { over = true; msg.show(title2, sub, [['Play again', 'refresh', () => api.restart(), true], ['Quit', 'exit', () => shell.close()]]); },
    restart() { over = false; paused = false; msg.hide(); reset(api); last = performance.now(); },
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
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(34, now - last); last = now;
    if (!paused && !over) update(api, dt);
    draw(api, now);
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
  const upd = () => { scoreEl.textContent = score.toLocaleString(); livesEl.textContent = '♥'.repeat(Math.max(0, lives)) || '0'; levelEl.textContent = String(level); bestEl.textContent = Math.max(best(), score).toLocaleString(); };
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
          }
          for (const br of bricks) {
            if (br.hp <= 0) continue;
            const cx = Math.max(br.x, Math.min(b.x, br.x + br.w)), cy = Math.max(br.y, Math.min(b.y, br.y + br.h));
            const dx = b.x - cx, dy = b.y - cy;
            if (dx * dx + dy * dy <= b.r * b.r) {
              if (Math.abs(dx) > Math.abs(dy)) b.vx = Math.sign(dx || -b.vx) * Math.abs(b.vx); else b.vy = Math.sign(dy || -b.vy) * Math.abs(b.vy);
              br.hp--;
              score += br.hp <= 0 ? (ROWS - br.row) * 10 : 5;
              Sfx.tick(br.hp <= 0 ? 1.5 : 1.2);
              if (br.hp <= 0 && Math.random() < 0.12) drops.push({ x: br.x + br.w / 2, y: br.y + br.h, kind: Math.random() < 0.5 ? 'W' : '+' });
              upd();
              break;
            }
          }
        }
        if (b.y > H + 20) balls.splice(i, 1);
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.y += 0.18 * dt;
        if (d.y > paddle.y - 10 && d.y < paddle.y + 10 && Math.abs(d.x - paddle.x) < paddle.w / 2 + 10) {
          if (d.kind === 'W') wideUntil = performance.now() + 12000;
          else if (balls[0]) { const b0 = balls[0]; balls.push({ ...b0, vx: -b0.vx, r: 8 }); }
          Sfx.land(); drops.splice(i, 1);
        } else if (d.y > H) drops.splice(i, 1);
      }
      if (!balls.length) {
        lives--; upd();
        if (lives <= 0) { if (score > best()) prefs.set('breakerBest', score); g.gameOver(score > 0 && score >= best() ? 'New best!' : 'Game over', `${score.toLocaleString()} points · level ${level}`); return; }
        balls = [newBall()]; launched = false; Sfx.tick(0.5);
      }
      if (bricks.every((br) => br.hp <= 0)) { level++; Sfx.land(); buildLevel(); upd(); }
    },
    draw(g, now) {
      const { ctx } = g;
      ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W, H);
      for (const br of bricks) {
        if (br.hp <= 0) continue;
        ctx.fillStyle = br.color; ctx.globalAlpha = br.hp > 1 ? 1 : 0.85;
        ctx.beginPath(); ctx.roundRect(br.x, br.y, br.w, br.h, 5); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(br.x + 3, br.y + 3, br.w - 6, 4);
        if (br.hp > 1) { ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2; ctx.strokeRect(br.x + 2, br.y + 2, br.w - 4, br.h - 4); }
      }
      for (const d of drops) { ctx.fillStyle = d.kind === 'W' ? '#ffd257' : '#3ddc84'; ctx.beginPath(); ctx.arc(d.x, d.y, 11, 0, 7); ctx.fill(); ctx.fillStyle = '#0b0b0d'; ctx.font = '800 13px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(d.kind, d.x, d.y + 1); }
      const acc = ACC();
      ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.roundRect(paddle.x - paddle.w / 2, paddle.y - paddle.h / 2, paddle.w, paddle.h, 7); ctx.fill(); ctx.shadowBlur = 0;
      for (const b of balls) { ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.shadowBlur = 0; }
      if (!launched && !g.paused && !g.over) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '600 18px Segoe UI'; ctx.textAlign = 'center'; ctx.fillText('Press Space or A to launch', W / 2, H / 2 + 60); }
    },
  });
  const cv = document.querySelector('.game .game-canvas');
  cv.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mouseX = ((e.clientX - r.left) / r.width) * W; });
  cv.addEventListener('pointerdown', () => { if (!api.paused && !api.over) launch(); });
}

// ---------- Snake ----------
function snakeGame() {
  const C = 28, R = 20, CELL = 30, W = C * CELL, H = R * CELL;
  let snake, dir, queue, food, bonus, score, tickMs, acc, ate;
  const scoreEl = h('div', { class: 'gs-v' }), lenEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' });
  const best = () => prefs.get('snakeBest', 0);
  const upd = () => { scoreEl.textContent = score.toLocaleString(); lenEl.textContent = String(snake.length); bestEl.textContent = Math.max(best(), score).toLocaleString(); };
  const free = () => { let p; do { p = { x: Math.floor(Math.random() * C), y: Math.floor(Math.random() * R) }; } while (snake.some((s) => s.x === p.x && s.y === p.y)); return p; };
  const reset = () => { snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }]; dir = { x: 1, y: 0 }; queue = []; food = free(); bonus = null; score = 0; tickMs = 120; acc = 0; ate = 0; upd(); };
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
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
        if (head.x < 0 || head.y < 0 || head.x >= C || head.y >= R || snake.some((s, i) => i < snake.length - 1 && s.x === head.x && s.y === head.y)) {
          Sfx.tick(0.4);
          const isBest = score > best();
          if (isBest) prefs.set('snakeBest', score);
          g.gameOver(isBest ? 'New best!' : 'Game over', `${score.toLocaleString()} points · length ${snake.length}`);
          return;
        }
        snake.unshift(head);
        let grew = false;
        if (head.x === food.x && head.y === food.y) { score += 1; ate++; grew = true; food = free(); Sfx.tick(1.6); tickMs = Math.max(55, tickMs - 2.5); if (ate % 5 === 0) bonus = { ...free(), until: performance.now() + 6000 }; }
        if (bonus && head.x === bonus.x && head.y === bonus.y) { score += 5; grew = true; bonus = null; Sfx.land(); }
        if (!grew) snake.pop();
        if (bonus && performance.now() > bonus.until) bonus = null;
        upd();
      }
    },
    draw(g, now) {
      const { ctx } = g;
      ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.025)';
      for (let y = 0; y < R; y++) for (let x = (y % 2); x < C; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
      const pulse = 1 + Math.sin(now / 160) * 0.08;
      ctx.fillStyle = '#3ddc84'; ctx.beginPath(); ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, CELL * 0.32 * pulse, 0, 7); ctx.fill();
      if (bonus) { const left = (bonus.until - now) / 6000; ctx.globalAlpha = Math.max(0.3, left); ctx.fillStyle = '#ffd257'; ctx.shadowColor = '#ffd257'; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(bonus.x * CELL + CELL / 2, bonus.y * CELL + CELL / 2, CELL * 0.4 * pulse, 0, 7); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1; }
      const acc2 = ACC();
      snake.forEach((s, i) => {
        const t = i / Math.max(1, snake.length - 1);
        ctx.fillStyle = i === 0 ? '#ffffff' : acc2; ctx.globalAlpha = i === 0 ? 1 : 1 - t * 0.55;
        ctx.beginPath(); ctx.roundRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4, 7); ctx.fill();
      });
      ctx.globalAlpha = 1;
      const hd = snake[0]; ctx.fillStyle = '#0b0b0d';
      const ex = dir.y !== 0 ? 6 : 0, ey = dir.x !== 0 ? 6 : 0;
      [[-1], [1]].forEach(([s]) => { ctx.beginPath(); ctx.arc(hd.x * CELL + CELL / 2 + dir.x * 5 + s * ex, hd.y * CELL + CELL / 2 + dir.y * 5 + s * ey, 3, 0, 7); ctx.fill(); });
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
    s1El.textContent = String(s1); s2El.textContent = String(s2);
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
      const steps = 3;
      for (let s = 0; s < steps; s++) {
        ball.x += ball.vx * dt / steps; ball.y += ball.vy * dt / steps;
        if (ball.y < 8) { ball.y = 8; ball.vy = Math.abs(ball.vy); Sfx.tick(0.8); }
        if (ball.y > H - 8) { ball.y = H - 8; ball.vy = -Math.abs(ball.vy); Sfx.tick(0.8); }
        const hitPaddle = (px, py, side2) => {
          if (Math.abs(ball.x - px) < PW / 2 + 8 && Math.abs(ball.y - py) < PH / 2 + 8 && Math.sign(ball.vx) === side2) {
            const rel = (ball.y - py) / (PH / 2);
            const sp = Math.min(0.95, Math.hypot(ball.vx, ball.vy) * 1.06);
            const a = rel * 0.9;
            ball.vx = -side2 * Math.cos(a) * sp; ball.vy = Math.sin(a) * sp;
            ball.x = px - side2 * (PW / 2 + 9);
            hits++; Sfx.tick(1.4);
          }
        };
        hitPaddle(30, p1.y, -1);
        hitPaddle(W - 30, p2.y, 1);
      }
      if (ball.x < -20 || ball.x > W + 20) {
        if (ball.x < 0) s2++; else s1++;
        Sfx.land(); upd();
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
      ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.setLineDash([10, 12]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.font = '800 120px Segoe UI'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(s1), W / 4, H / 2); ctx.fillText(String(s2), W * 3 / 4, H / 2);
      const acc = ACC();
      ctx.fillStyle = acc; ctx.shadowColor = acc; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.roundRect(30 - PW / 2, p1.y - PH / 2, PW, PH, 6); ctx.fill();
      ctx.fillStyle = '#e8e8ee'; ctx.shadowColor = '#fff';
      ctx.beginPath(); ctx.roundRect(W - 30 - PW / 2, p2.y - PH / 2, PW, PH, 6); ctx.fill();
      ctx.shadowBlur = 12; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ball.x, ball.y, 8, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      if (serveAt && !g.paused && !g.over) { ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '600 16px Segoe UI'; ctx.fillText('Get ready', W / 2, H / 2 + 60); }
    },
  });
}

// ---------- Blackjack ----------
// Six decks, dealer stands on 17, blackjack pays 3 to 2, double on the first two cards, one split.
// Uses the same pretend points as Peg Drop.
function blackjack() {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  let bank = Number(prefs.get('pegsBank', 1000)) || 1000;
  let bet = Number(prefs.get('bjBet', 50)) || 50;
  let shoe = [], dealer = [], hands = [], active = 0, phase = 'bet', holeHidden = true, paused = false;
  const stats = prefs.get('bjStats', { w: 0, l: 0, p: 0 });
  const save = () => { prefs.set('pegsBank', bank); prefs.set('bjBet', bet); prefs.set('bjStats', stats); };
  const newShoe = () => { shoe = []; for (let d = 0; d < 6; d++) for (const s of SUITS) for (const r of RANKS) shoe.push({ r, s }); for (let i = shoe.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; } };
  const draw = () => { if (shoe.length < 6 * 52 * 0.25) newShoe(); return shoe.pop(); };
  const val = (cards) => { let t = 0, aces = 0; for (const c of cards) { if (c.r === 'A') { aces++; t += 11; } else t += ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r); } while (t > 21 && aces) { t -= 10; aces--; } return { t, soft: aces > 0 }; };
  const isBJ = (cards) => cards.length === 2 && val(cards).t === 21;

  let unKeys = () => {};
  const shell = gameShell('Blackjack', () => { unKeys(); save(); if (S.view.type === 'arcade') renderArcade(); });
  const { canvas, side, root } = shell;
  canvas.remove();
  const stage = root.querySelector('.game-stage');
  const table = h('div', { class: 'bj-table' });
  stage.append(table);
  const msg = overlayMsg(stage);
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
      h('button', { class: 'btn', onclick: () => { if (phase !== 'bet') return; bank = 1000; save(); upd(); render(); } }, icon('refresh'), 'Reset points')),
    keyList(['Space', 'deal'], ['H', 'hit'], ['S', 'stand'], ['D', 'double'], ['P', 'split'], ['Esc', 'pause'], [null, 'Controller: A hit or deal, B stand, X double, Y split, Menu pause. Pretend points only, shared with Peg Drop.']));
  const clampBet = (v) => Math.max(1, Math.min(Math.floor(Number.isFinite(v) ? v : 1), 1e300));
  function setBet(v) { if (phase !== 'bet' && phase !== 'done') return; bet = clampBet(v); save(); upd(); }
  betIn.addEventListener('change', () => { const v = parseBig(betIn.value); if (Number.isFinite(v)) setBet(v); else upd(); });
  betIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') betIn.blur(); });
  betIn.addEventListener('blur', () => setTimeout(upd, 0));
  function upd() {
    bankEl.textContent = fmtBig(Math.floor(bank));
    statEl.textContent = `Won ${stats.w} · Lost ${stats.l} · Push ${stats.p}`;
    if (document.activeElement !== betIn) betIn.value = fmtBig(bet);
    betIn.disabled = !(phase === 'bet' || phase === 'done');
  }

  const cardEl = (c, i, hidden) => h('div', { class: `bj-card${hidden ? ' back' : ''}${c && (c.s === '♥' || c.s === '♦') ? ' red' : ''}`, style: { animationDelay: `${i * 0.08}s` } },
    hidden ? h('span', { class: 'bj-gem' }) : [h('span', { class: 'bj-r' }, c.r, h('i', {}, c.s)), h('span', { class: 'bj-s' }, c.s), h('span', { class: 'bj-r bot' }, c.r, h('i', {}, c.s))]);
  const handTotal = (cards) => { const v = val(cards); return v.t > 21 ? `${v.t} bust` : isBJ(cards) ? 'Blackjack' : v.soft && v.t < 21 ? `${v.t - 10} / ${v.t}` : String(v.t); };
  const btn = (label, key, fn, ok, primary) => h('button', { class: `btn big ${primary ? 'primary' : 'glass'}`, disabled: !ok, onclick: fn }, label, h('span', { class: 'bj-key' }, key));
  function render() {
    const canDouble = phase === 'play' && hands[active] && hands[active].cards.length === 2 && bank >= hands[active].bet;
    const canSplit = phase === 'play' && hands.length === 1 && hands[0].cards.length === 2 && hands[0].cards[0].r === hands[0].cards[1].r && bank >= hands[0].bet;
    table.replaceChildren(
      h('div', { class: 'bj-row' }, h('div', { class: 'bj-label' }, 'Dealer', dealer.length ? h('b', {}, holeHidden ? handTotal([dealer[0]]) : handTotal(dealer)) : null),
        h('div', { class: 'bj-cards' }, dealer.map((c, i) => cardEl(c, i, i === 1 && holeHidden)))),
      h('div', { class: 'bj-mid' }, phase === 'bet' ? h('div', { class: 'bj-hint' }, `Bet ${fmtBig(bet)} and press Deal`) : null),
      h('div', { class: 'bj-hands' }, hands.map((hd, hi) => h('div', { class: `bj-row${hi === active && phase === 'play' ? ' active' : ''}` },
        h('div', { class: 'bj-label' }, hands.length > 1 ? `Hand ${hi + 1}` : 'You', h('b', {}, handTotal(hd.cards)), h('span', { class: 'bj-bet' }, fmtBig(hd.bet)), hd.result ? h('span', { class: `bj-res ${hd.result}` }, { win: 'Win', lose: 'Lose', push: 'Push', bj: 'Blackjack' }[hd.result]) : null),
        h('div', { class: 'bj-cards' }, hd.cards.map((c, i) => cardEl(c, i, false)))))),
      h('div', { class: 'bj-actions' },
        phase === 'bet' || phase === 'done'
          ? btn(phase === 'done' ? 'Deal again' : 'Deal', 'Space', deal, bank >= 1, true)
          : [btn('Hit', 'H', hit, phase === 'play', true), btn('Stand', 'S', stand, phase === 'play'), btn('Double', 'D', dbl, canDouble), btn('Split', 'P', split, canSplit)]));
    upd();
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function deal() {
    if (!(phase === 'bet' || phase === 'done') || paused) return;
    if (bet > bank) { bet = clampBet(bank); }
    if (bank < 1) return;
    bank -= bet; save();
    dealer = []; hands = [{ cards: [], bet, done: false, result: null }]; active = 0; holeHidden = true; phase = 'deal';
    for (let i = 0; i < 2; i++) { hands[0].cards.push(draw()); render(); Sfx.tick(1.4); await sleep(230); dealer.push(draw()); render(); Sfx.tick(1.4); await sleep(230); }
    if (isBJ(hands[0].cards) || isBJ(dealer)) { await finishRound(); return; }
    phase = 'play'; render();
  }
  function hit() {
    if (phase !== 'play' || paused) return;
    const hd = hands[active]; hd.cards.push(draw()); Sfx.tick(1.4);
    if (val(hd.cards).t >= 21) return next();
    render();
  }
  function stand() { if (phase !== 'play' || paused) return; next(); }
  function dbl() {
    const hd = hands[active];
    if (phase !== 'play' || paused || hd.cards.length !== 2 || bank < hd.bet) return;
    bank -= hd.bet; hd.bet *= 2; hd.cards.push(draw()); Sfx.tick(1.4); save(); next();
  }
  function split() {
    if (phase !== 'play' || paused || hands.length !== 1) return;
    const hd = hands[0];
    if (hd.cards.length !== 2 || hd.cards[0].r !== hd.cards[1].r || bank < hd.bet) return;
    bank -= hd.bet; save();
    const aces = hd.cards[0].r === 'A';
    hands = [{ cards: [hd.cards[0], draw()], bet: hd.bet, result: null }, { cards: [hd.cards[1], draw()], bet: hd.bet, result: null }];
    Sfx.tick(1.4);
    if (aces) { active = 1; return next(); } // split aces get one card each
    active = 0;
    if (val(hands[0].cards).t === 21) return next();
    render();
  }
  function next() {
    if (active < hands.length - 1) { active++; if (val(hands[active].cards).t === 21) return next(); render(); return; }
    finishRound();
  }
  async function finishRound() {
    phase = 'dealer'; holeHidden = false; render(); await sleep(450);
    const allBust = hands.every((hd) => val(hd.cards).t > 21);
    const playerBJ = hands.length === 1 && isBJ(hands[0].cards);
    if (!allBust && !playerBJ && !isBJ(dealer)) {
      while (val(dealer).t < 17) { dealer.push(draw()); render(); Sfx.tick(1.2); await sleep(420); }
    }
    const d = val(dealer).t;
    for (const hd of hands) {
      const p = val(hd.cards).t;
      if (hands.length === 1 && isBJ(hd.cards) && !isBJ(dealer)) { hd.result = 'bj'; bank += hd.bet * 2.5; }
      else if (p > 21) hd.result = 'lose';
      else if (isBJ(dealer) && !(hands.length === 1 && isBJ(hd.cards))) hd.result = 'lose';
      else if (d > 21 || p > d) { hd.result = 'win'; bank += hd.bet * 2; }
      else if (p === d) { hd.result = 'push'; bank += hd.bet; }
      else hd.result = 'lose';
      if (hd.result === 'win' || hd.result === 'bj') stats.w++; else if (hd.result === 'push') stats.p++; else stats.l++;
    }
    if (hands.some((hd) => hd.result === 'win' || hd.result === 'bj')) Sfx.land(); else Sfx.tick(0.5);
    phase = 'done'; save(); render();
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
  unKeys = gameKeys({ ' ': 'deal', enter: 'deal', Enter: 'deal', h: 'hit', s: 'stand', d: 'double', p: 'split', ArrowUp: 'up', ArrowDown: 'down' }, input, () => setPause(!paused), (e) => e.target === betIn);
  newShoe();
  render();
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
