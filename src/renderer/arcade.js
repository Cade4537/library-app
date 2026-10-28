/* global S, $, h, icon, prefs, syncDiscord, Sfx, showToast */
// Arcade: two small games built into Crimson Vault.
//  Vault Blocks: falling block puzzle. Clear lines, levels speed up.
//  Peg Drop: drop balls through pegs into point slots. Pretend points only, nothing real.
// Both run on a canvas and stop completely (loop, sounds, listeners) when closed.

const ARCADE = [
  { id: 'blocks', name: 'Vault Blocks', sub: 'Stack falling blocks and clear lines', best: () => prefs.get('blocksBest', 0), bestLabel: 'Best score' },
  { id: 'pegs', name: 'Peg Drop', sub: 'Drop balls through the pegs into point slots', best: () => prefs.get('pegsBank', 1000), bestLabel: 'Points' },
  { id: 'bj', name: 'Blackjack', sub: 'Beat the dealer to 21 without going over', best: () => prefs.get('pegsBank', 1000), bestLabel: 'Points' },
  { id: 'breaker', name: 'Block Breaker', sub: 'Bounce the ball and smash every brick', best: () => prefs.get('breakerBest', 0), bestLabel: 'Best score' },
  { id: 'snake', name: 'Snake', sub: 'Eat, grow and don\'t hit yourself', best: () => prefs.get('snakeBest', 0), bestLabel: 'Best score' },
  { id: 'duel', name: 'Paddle Duel', sub: 'Classic paddle tennis, against the computer or a friend', best: () => prefs.get('duelWins', 0), bestLabel: 'Wins' },
];

function renderArcade() {
  const box = $('#arcadeView');
  box.replaceChildren(
    h('div', { class: 'arc-grid' }, ARCADE.map((g) => h('button', { class: `arc-tile arc-${g.id}`, onclick: () => openGame(g.id) },
      h('canvas', { class: 'arc-preview', width: 360, height: 220, 'data-game': g.id }),
      h('div', { class: 'arc-info' }, h('div', { class: 'arc-name' }, g.name), h('div', { class: 'arc-sub' }, g.sub),
        h('div', { class: 'arc-best' }, `${g.bestLabel}: ${fmtBig(Number(g.best()) || 0)}`)),
      h('span', { class: 'arc-play' }, icon('play'), 'Play')))),
    h('div', { class: 'help', style: { marginTop: '14px' } }, 'Works with mouse, keyboard or controller. Peg Drop and Blackjack share pretend points that only live in this app.'));
  box.querySelectorAll('.arc-preview').forEach(drawPreview);
}

function drawPreview(c) {
  const x = c.getContext('2d');
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e11d2e';
  x.fillStyle = '#0c0c0e'; x.fillRect(0, 0, c.width, c.height);
  if (c.dataset.game === 'blocks') {
    const cols = BLOCK_COLORS;
    const s = 20;
    const rows = ['..........', '.......Z..', '....TTTZZ.', 'I...OT.LZ.', 'I.SSOOLLL.', 'IJSS.OO.JJ', 'IJJJLLL..J'];
    rows.forEach((r, yy) => [...r].forEach((ch, xx) => { if (ch !== '.') drawCell(x, 80 + xx * s, 70 + yy * s, s, cols['IJLOSTZ'.indexOf(ch) + 1]); }));
    x.strokeStyle = '#2a2a30'; x.strokeRect(79.5, 9.5, 201, 201);
  } else if (c.dataset.game !== 'pegs') {
    drawPreview2(c);
  } else {
    for (let r = 0; r < 7; r++) for (let i = 0; i <= r + 2; i++) { x.fillStyle = '#cfcfd5'; x.beginPath(); x.arc(180 + (i - (r + 2) / 2) * 26, 30 + r * 22, 3, 0, 7); x.fill(); }
    [['x5', '#ff3040'], ['x2', '#f0452a'], ['x1', '#8a8a93'], ['x.5', '#4a4a52'], ['x1', '#8a8a93'], ['x2', '#f0452a'], ['x5', '#ff3040']].forEach(([t, col], i) => { x.fillStyle = col; x.fillRect(77 + i * 30, 190, 27, 18); x.fillStyle = '#fff'; x.font = 'bold 10px Segoe UI'; x.textAlign = 'center'; x.fillText(t, 90.5 + i * 30, 203); });
    x.fillStyle = accent; x.shadowColor = accent; x.shadowBlur = 12; x.beginPath(); x.arc(195, 98, 7, 0, 7); x.fill(); x.shadowBlur = 0;
  }
}

// ---------- shared overlay ----------
function gameShell(title, onClose) {
  const canvas = h('canvas', { class: 'game-canvas' });
  const side = h('div', { class: 'game-side' });
  const closeBtn = h('button', { class: 'icon-btn game-close', title: 'Close (Esc)' }, icon('close'));
  const root = h('div', { class: 'game' }, h('div', { class: 'game-top' }, h('div', { class: 'game-title' }, icon('dice'), title), h('span', { class: 'spacer' }), closeBtn),
    h('div', { class: 'game-body' }, h('div', { class: 'game-stage' }, canvas), side));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    S.modals = S.modals.filter((f) => f !== close);
    window.arcadeInput = null;
    onClose();
    root.classList.add('out');
    setTimeout(() => { root.remove(); syncDiscord(); }, 220);
  };
  closeBtn.addEventListener('click', close);
  document.body.append(root);
  S.modals.push(close);
  syncDiscord();
  requestAnimationFrame(() => root.classList.add('in'));
  return { root, canvas, side, close };
}

function openGame(id) {
  if (document.querySelector('.game')) return;
  if (id === 'blocks') vaultBlocks();
  else if (id === 'pegs') pegDrop();
  else if (id === 'bj') blackjack();
  else if (id === 'breaker') blockBreaker();
  else if (id === 'snake') snakeGame();
  else if (id === 'duel') paddleDuel();
}

// ---------- Vault Blocks ----------
const BLOCK_COLORS = [null, '#ff3b4b', '#c8174f', '#f0452a', '#ffb02e', '#e8e8ee', '#a3101e', '#ff6b8a'];
const SHAPES = {
  1: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]], // I
  2: [[2, 0, 0], [2, 2, 2], [0, 0, 0]], // J
  3: [[0, 0, 3], [3, 3, 3], [0, 0, 0]], // L
  4: [[4, 4], [4, 4]], // O
  5: [[0, 5, 5], [5, 5, 0], [0, 0, 0]], // S
  6: [[0, 6, 0], [6, 6, 6], [0, 0, 0]], // T
  7: [[7, 7, 0], [0, 7, 7], [0, 0, 0]], // Z
};

function drawCell(x, px, py, s, color, alpha = 1) {
  x.globalAlpha = alpha;
  x.fillStyle = color; x.fillRect(px + 1, py + 1, s - 2, s - 2);
  x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(px + 1, py + 1, s - 2, Math.max(2, s * 0.16));
  x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(px + 1, py + s - 1 - Math.max(2, s * 0.14), s - 2, Math.max(2, s * 0.14));
  x.globalAlpha = 1;
}

function vaultBlocks() {
  const W = 10, H = 20;
  let grid, cur, bag, next, hold, canHold, score, lines, level, dropMs, acc, last, over, paused, raf, clearing;
  const best = () => prefs.get('blocksBest', 0);
  const scoreEl = h('div', { class: 'gs-v' }); const linesEl = h('div', { class: 'gs-v' }); const levelEl = h('div', { class: 'gs-v' }); const bestEl = h('div', { class: 'gs-v' });
  const nextC = h('canvas', { class: 'gs-next', width: 120, height: 230 }); const holdC = h('canvas', { class: 'gs-hold', width: 120, height: 90 });
  const msg = h('div', { class: 'game-msg' });
  const shell = gameShell('Vault Blocks', () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', fit); if (S.view.type === 'arcade') renderArcade(); });
  const { canvas, side, root } = shell;
  root.querySelector('.game-stage').append(msg);
  side.append(
    h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Hold'), holdC),
    h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Next'), nextC),
    h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Score'), scoreEl, h('div', { class: 'gs-l' }, 'Lines'), linesEl, h('div', { class: 'gs-l' }, 'Level'), levelEl, h('div', { class: 'gs-l' }, 'Best'), bestEl),
    h('div', { class: 'gs-box gs-actions' },
      h('button', { class: 'btn', onclick: () => setPause(!paused) }, icon('pause'), 'Pause'),
      h('button', { class: 'btn', onclick: () => shell.close() }, icon('exit'), 'Quit')),
    h('div', { class: 'gs-keys' },
      h('div', {}, h('b', {}, 'A / D'), ' move left / right'), h('div', {}, h('b', {}, 'S'), ' soft drop'), h('div', {}, h('b', {}, 'Space'), ' hard drop'),
      h('div', {}, h('b', {}, 'Q / E'), ' rotate left / right'), h('div', {}, h('b', {}, 'C'), ' hold'), h('div', {}, h('b', {}, 'Esc / P'), ' pause'),
      h('div', { class: 'gs-note' }, 'Controller: stick to move, A / B rotate, Y hard drop, LB hold, Menu pause.')));

  const ctx = canvas.getContext('2d');
  let cell = 30;
  const fit = () => {
    const stage = root.querySelector('.game-stage');
    cell = Math.max(16, Math.floor(Math.min((stage.clientHeight - 20) / H, (stage.clientWidth - 20) / W)));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = W * cell * dpr; canvas.height = H * cell * dpr;
    canvas.style.width = `${W * cell}px`; canvas.style.height = `${H * cell}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  const newBag = () => { const b = [1, 2, 3, 4, 5, 6, 7]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const take = () => { if (bag.length < 7) bag.push(...newBag()); return bag.shift(); };
  const spawn = (t) => {
    const m = SHAPES[t].map((r) => r.slice());
    cur = { t, m, x: Math.floor((W - m[0].length) / 2), y: t === 1 ? -1 : 0 };
    canHold = true;
    if (collide(cur.m, cur.x, cur.y)) { over = true; finish(); }
  };
  const collide = (m, ox, oy) => {
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m[y].length; x++) {
      if (!m[y][x]) continue;
      const gx = ox + x, gy = oy + y;
      if (gx < 0 || gx >= W || gy >= H) return true;
      if (gy >= 0 && grid[gy][gx]) return true;
    }
    return false;
  };
  const rotate = (dir) => {
    if (cur.t === 4) return;
    const n = cur.m.length;
    const r = Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => (dir > 0 ? cur.m[n - 1 - x][y] : cur.m[x][n - 1 - y])));
    for (const k of [0, -1, 1, -2, 2]) if (!collide(r, cur.x + k, cur.y)) { cur.m = r; cur.x += k; Sfx.tick(1.3); return; }
    if (!collide(r, cur.x, cur.y - 1)) { cur.m = r; cur.y -= 1; Sfx.tick(1.3); }
  };
  const ghostY = () => { let y = cur.y; while (!collide(cur.m, cur.x, y + 1)) y++; return y; };
  const lock = () => {
    for (let y = 0; y < cur.m.length; y++) for (let x = 0; x < cur.m[y].length; x++) if (cur.m[y][x] && cur.y + y >= 0) grid[cur.y + y][cur.x + x] = cur.m[y][x];
    if (cur.y < 0 && cur.m.some((r, y) => r.some((v) => v) && cur.y + y < 0)) { over = true; finish(); return; }
    const full = [];
    for (let y = 0; y < H; y++) if (grid[y].every(Boolean)) full.push(y);
    if (full.length) {
      clearing = { rows: full, t: performance.now() };
      score += [0, 100, 300, 500, 800][full.length] * level;
      lines += full.length;
      level = 1 + Math.floor(lines / 10);
      dropMs = Math.max(70, 800 * Math.pow(0.86, level - 1));
      if (full.length === 4) Sfx.land(); else Sfx.tick(0.7);
    } else Sfx.tick(0.6);
    spawn(next.shift()); next.push(take());
    updateSide();
  };
  const step = () => { if (!collide(cur.m, cur.x, cur.y + 1)) { cur.y++; return true; } lock(); return false; };
  const hard = () => { let n = 0; while (!collide(cur.m, cur.x, cur.y + 1)) { cur.y++; n++; } score += n * 2; lock(); };
  const doHold = () => {
    if (!canHold) return;
    const t = cur.t;
    if (hold) spawn(hold); else { spawn(next.shift()); next.push(take()); }
    hold = t; canHold = false; updateSide();
  };
  const updateSide = () => {
    scoreEl.textContent = score.toLocaleString(); linesEl.textContent = String(lines); levelEl.textContent = String(level); bestEl.textContent = Math.max(best(), score).toLocaleString();
    const mini = (c, list) => {
      const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
      list.forEach((t, i) => { const m = SHAPES[t]; const s = 18; const w = m[0].length * s; m.forEach((r, yy) => r.forEach((v, xx) => { if (v) drawCell(x, (c.width - w) / 2 + xx * s, 10 + i * 74 + yy * s, s, BLOCK_COLORS[v], c === holdC && !canHold ? 0.35 : 1); })); });
    };
    mini(holdC, hold ? [hold] : []);
    mini(nextC, next.slice(0, 3));
  };
  const finish = () => {
    if (score > best()) { prefs.set('blocksBest', score); showMsg('New best!', `${score.toLocaleString()} points · ${lines} lines`, true); Sfx.land(); }
    else showMsg('Game over', `${score.toLocaleString()} points · ${lines} lines`, true);
  };
  const showMsg = (t, sub, again) => {
    msg.replaceChildren(h('div', { class: 'gm-t' }, t), sub ? h('div', { class: 'gm-s' }, sub) : null,
      h('div', { class: 'gm-btns' },
        again ? h('button', { class: 'btn primary big', onclick: start }, icon('refresh'), 'Play again') : h('button', { class: 'btn primary big', onclick: () => setPause(false) }, icon('play'), 'Resume'),
        again ? null : h('button', { class: 'btn glass big', onclick: () => { setPause(false); start(); } }, icon('refresh'), 'Restart'),
        h('button', { class: 'btn glass big', onclick: () => shell.close() }, icon('exit'), 'Quit')));
    msg.classList.add('on');
    const b = msg.querySelector('button'); if (b) setTimeout(() => b.focus(), 50);
  };
  const setPause = (v) => { if (over) return; paused = v; if (v) showMsg('Paused', `${score.toLocaleString()} points · ${lines} lines`, false); else { msg.classList.remove('on'); last = performance.now(); } };

  const draw = (now) => {
    ctx.clearRect(0, 0, W * cell, H * cell);
    ctx.fillStyle = '#0b0b0d'; ctx.fillRect(0, 0, W * cell, H * cell);
    ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
    for (let x = 1; x < W; x++) { ctx.beginPath(); ctx.moveTo(x * cell + 0.5, 0); ctx.lineTo(x * cell + 0.5, H * cell); ctx.stroke(); }
    for (let y = 1; y < H; y++) { ctx.beginPath(); ctx.moveTo(0, y * cell + 0.5); ctx.lineTo(W * cell, y * cell + 0.5); ctx.stroke(); }
    const flash = clearing ? Math.min(1, (now - clearing.t) / 220) : 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (grid[y][x]) {
      if (clearing && clearing.rows.includes(y)) { ctx.fillStyle = `rgba(255,255,255,${1 - flash})`; ctx.fillRect(x * cell, y * cell, cell, cell); }
      else drawCell(ctx, x * cell, y * cell, cell, BLOCK_COLORS[grid[y][x]]);
    }
    if (!over && cur) {
      const gy = ghostY();
      cur.m.forEach((r, yy) => r.forEach((v, xx) => { if (v && gy + yy >= 0) { ctx.strokeStyle = BLOCK_COLORS[v]; ctx.globalAlpha = 0.45; ctx.strokeRect(( cur.x + xx) * cell + 2.5, (gy + yy) * cell + 2.5, cell - 5, cell - 5); ctx.globalAlpha = 1; } }));
      cur.m.forEach((r, yy) => r.forEach((v, xx) => { if (v && cur.y + yy >= 0) drawCell(ctx, (cur.x + xx) * cell, (cur.y + yy) * cell, cell, BLOCK_COLORS[v]); }));
    }
    if (clearing && flash >= 1) {
      for (const y of clearing.rows) { grid.splice(y, 1); grid.unshift(Array(W).fill(0)); }
      clearing = null;
    }
  };
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    if (!paused && !over && !clearing) {
      acc += now - last;
      while (acc >= dropMs) { acc -= dropMs; step(); if (over) break; }
    }
    last = now;
    draw(now);
  };
  const input = (k, rep) => {
    if (k === 'view') return shell.close();
    if (over) { if (k === 'a') start(); return true; }
    if (k === 'menu' || k === 'p') return setPause(!paused);
    if (paused) { if (k === 'a') setPause(false); return true; }
    if (clearing) return true;
    if (k === 'left') { if (!collide(cur.m, cur.x - 1, cur.y)) { cur.x--; Sfx.tick(1.6); } }
    else if (k === 'right') { if (!collide(cur.m, cur.x + 1, cur.y)) { cur.x++; Sfx.tick(1.6); } }
    else if (k === 'down') { if (step()) score += 1; acc = 0; updateSide(); }
    else if (k === 'up' || k === 'y' || k === 'rb') { if (!rep) hard(); }
    else if (k === 'a') rotate(1);
    else if (k === 'b' || k === 'x') rotate(-1);
    else if (k === 'lb') doHold();
    return true;
  };
  window.arcadeInput = input;
  // A / D move, S soft drop, Space hard drop, Q / E rotate, C hold. Arrow keys still work too.
  const KEYS = { a: 'left', A: 'left', d: 'right', D: 'right', s: 'down', S: 'down', ' ': 'up', q: 'b', Q: 'b', e: 'a', E: 'a', c: 'lb', C: 'lb', p: 'p', P: 'p', ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down', ArrowUp: 'up' };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (over) shell.close(); else setPause(!paused); return; }
    if ((e.key === 'Enter' || e.key === ' ') && (paused || over) && document.activeElement && document.activeElement.closest('.game-msg, .game-side')) return;
    const k = KEYS[e.key];
    if (!k) return;
    e.preventDefault(); e.stopPropagation();
    input(k, e.repeat);
  };
  document.addEventListener('keydown', onKey, true);
  function start() {
    grid = Array.from({ length: H }, () => Array(W).fill(0));
    bag = newBag(); next = [take(), take(), take(), take()]; hold = 0; canHold = true;
    score = 0; lines = 0; level = 1; dropMs = 800; acc = 0; last = performance.now(); over = false; paused = false; clearing = null;
    msg.classList.remove('on');
    spawn(take());
    updateSide();
  }
  fit();
  window.addEventListener('resize', fit);
  start();
  raf = requestAnimationFrame(loop);
}

// ---------- Peg Drop ----------
// Risk levels: the higher the risk, the bigger the edges and the smaller the middle.
const RISKS = {
  low: { name: 'Low', slots: [5.6, 2.1, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 2.1, 5.6] },
  medium: { name: 'Medium', slots: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22] },
  high: { name: 'High', slots: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76] },
  extreme: { name: 'Extreme', slots: [1000, 26, 4, 0.4, 0.1, 0, 0.1, 0.4, 4, 26, 1000] },
};
const SLOTS = RISKS.medium.slots; // used by the preview tile
const BIG_NAMES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'];
const BIG_FULL = { K: 'thousand', M: 'million', B: 'billion', T: 'trillion', Qa: 'quadrillion', Qi: 'quintillion', Sx: 'sextillion', Sp: 'septillion', Oc: 'octillion', No: 'nonillion', Dc: 'decillion' };

// 1234 -> "1,234", 2.5e9 -> "2.5B", 1e33 -> "1Dc"; anything past the named sizes uses e notation.
function fmtBig(n) {
  if (!Number.isFinite(n)) return '∞';
  const a = Math.abs(n);
  if (a < 1e6) return n.toLocaleString(undefined, { maximumFractionDigits: a < 100 ? 2 : 0 });
  const tier = Math.floor(Math.log10(a) / 3);
  if (tier < BIG_NAMES.length) return `${(n / 10 ** (tier * 3)).toLocaleString(undefined, { maximumFractionDigits: 2 })}${BIG_NAMES[tier]}`;
  return n.toExponential(2).replace('e+', 'e');
}
// "250", "1.5M", "2 dc", "1e33" -> a number.
function parseBig(str) {
  const t = String(str || '').trim().replace(/,/g, '');
  if (!t) return NaN;
  if (/^[\d.]+e\d+$/i.test(t)) return Number(t);
  const m = t.match(/^([\d.]+)\s*([a-z]*)$/i);
  if (!m) return NaN;
  const num = Number(m[1]);
  if (!m[2]) return num;
  const idx = BIG_NAMES.findIndex((x) => x && x.toLowerCase() === m[2].toLowerCase());
  return idx > 0 ? num * 10 ** (idx * 3) : NaN;
}

function pegDrop() {
  const ROWS = 10; // the last row has one more peg than there are slots
  let bank = Number(prefs.get('pegsBank', 1000)) || 1000;
  let bet = Number(prefs.get('pegsBet', 50)) || 50;
  let count = prefs.get('pegsCount', 1);
  let risk = RISKS[prefs.get('pegsRisk', 'medium')] ? prefs.get('pegsRisk', 'medium') : 'medium';
  let aim = 0.5, auto = false, autoT = 0, paused = false, raf, last = performance.now(), resetArm = 0, best = Number(prefs.get('pegsBest', 1000)) || 1000;
  const balls = [], queue = [], pops = [], hits = new Map();
  let queueT = 0;
  const slots = () => RISKS[risk].slots;

  const bankEl = h('div', { class: 'gs-v' });
  const bestEl = h('div', { class: 'gs-s' });
  const lastEl = h('div', { class: 'gs-s' }, 'Drop a ball to start');
  const betIn = h('input', { class: 'text-input gs-in', spellcheck: 'false', title: 'Type an amount, like 500, 2.5M or 1Dc (decillion)' });
  const countIn = h('input', { class: 'text-input gs-in small', type: 'number', min: '1', max: '100' });
  const riskSeg = h('div', { class: 'seg gs-risk' });
  const dropBtn = h('button', { class: 'btn primary big' }, icon('play'), 'Drop');
  const autoBtn = h('button', { class: 'btn' }, 'Auto: off');
  const resetBtn = h('button', { class: 'btn' }, icon('refresh'), 'Reset points');
  const msg = h('div', { class: 'game-msg' });
  const shell = gameShell('Peg Drop', () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', fit); save(); if (S.view.type === 'arcade') renderArcade(); });
  const { canvas, side, root } = shell;
  root.querySelector('.game-stage').append(msg);
  const sb = (label, fn) => h('button', { class: 'chip', onclick: fn }, label);
  side.append(
    h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Points'), bankEl, bestEl, lastEl),
    h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Bet per ball'), betIn,
      h('div', { class: 'gs-chips' }, sb('Min', () => setBet(1)), sb('½', () => setBet(bet / 2)), sb('×2', () => setBet(bet * 2)), sb('×10', () => setBet(bet * 10)), sb('Max', () => setBet(Math.floor(bank / Math.max(1, count)))))),
    h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Balls per drop'),
      h('div', { class: 'gs-count' }, sb('−', () => setCount(count - 1)), countIn, sb('+', () => setCount(count + 1))),
      h('div', { class: 'gs-chips' }, ...[1, 5, 10, 25, 100].map((n) => sb(String(n), () => setCount(n))))),
    h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Risk'), riskSeg),
    h('div', { class: 'gs-box gs-actions' }, dropBtn, autoBtn,
      h('div', { class: 'row', style: { gap: '6px' } },
        h('button', { class: 'btn', style: { flex: 1 }, onclick: () => setPause(true) }, icon('pause'), 'Pause'),
        h('button', { class: 'btn', style: { flex: 1 }, onclick: () => shell.close() }, icon('exit'), 'Quit')),
      resetBtn),
    h('div', { class: 'gs-keys' },
      h('div', {}, h('b', {}, 'A / D'), ' aim'), h('div', {}, h('b', {}, 'W / S'), ' bet ×2 / ½'), h('div', {}, h('b', {}, 'Space'), ' drop'), h('div', {}, h('b', {}, 'X'), ' auto drop'), h('div', {}, h('b', {}, 'Esc'), ' pause'),
      h('div', { class: 'gs-note' }, 'Pretend points only. Nothing here is real money.')));

  const save = () => { prefs.set('pegsBank', bank); prefs.set('pegsBet', bet); prefs.set('pegsCount', count); prefs.set('pegsRisk', risk); prefs.set('pegsBest', best); };
  const clampBet = (v) => { if (!Number.isFinite(v) || v < 1) v = 1; return Math.min(Math.floor(v), 1e300); };
  function setBet(v) { bet = clampBet(v); upd(); save(); }
  function setCount(v) { count = Math.max(1, Math.min(100, Math.floor(Number(v) || 1))); upd(); save(); }
  betIn.addEventListener('change', () => { const v = parseBig(betIn.value); if (Number.isFinite(v)) setBet(v); else upd(); });
  betIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') betIn.blur(); });
  countIn.addEventListener('change', () => setCount(countIn.value));
  betIn.addEventListener('blur', () => setTimeout(upd, 0));
  countIn.addEventListener('blur', () => setTimeout(upd, 0));
  countIn.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') countIn.blur(); });
  const inFlight = () => balls.length + queue.length;
  function upd() {
    bankEl.textContent = fmtBig(Math.floor(bank));
    const word = Object.entries(BIG_FULL).find(([k]) => fmtBig(bank).endsWith(k));
    bankEl.title = word ? `${bank.toLocaleString()} (${word[1]})` : bank.toLocaleString();
    bestEl.textContent = `Best: ${fmtBig(Math.floor(best))}`;
    if (document.activeElement !== betIn) betIn.value = fmtBig(bet);
    if (document.activeElement !== countIn) countIn.value = String(count);
    riskSeg.replaceChildren(...Object.entries(RISKS).map(([k, r]) => h('button', { class: k === risk ? 'on' : '', disabled: inFlight() > 0 && k !== risk, title: `Edges pay x${r.slots[0]}, middle pays x${r.slots[5]}`, onclick: () => { if (inFlight()) return; risk = k; save(); upd(); } }, r.name)));
    autoBtn.textContent = auto ? 'Auto: on' : 'Auto: off';
    autoBtn.classList.toggle('primary', auto);
    dropBtn.replaceChildren(icon('play'), count > 1 ? `Drop ${count} balls (${fmtBig(bet * count)})` : `Drop (${fmtBig(bet)})`);
  }
  resetBtn.addEventListener('click', () => {
    if (Date.now() - resetArm > 3000) { resetArm = Date.now(); resetBtn.replaceChildren(icon('refresh'), 'Click again to reset'); setTimeout(() => resetBtn.replaceChildren(icon('refresh'), 'Reset points'), 3000); return; }
    reset();
  });
  function reset() {
    balls.length = 0; queue.length = 0; pops.length = 0; auto = false;
    bank = 1000; bet = 50; resetArm = 0;
    lastEl.textContent = 'Points reset to 1,000. Good luck.';
    resetBtn.replaceChildren(icon('refresh'), 'Reset points');
    save(); upd();
  }

  const ctx = canvas.getContext('2d');
  let Wd = 600, Ht = 600, gap = 40, top = 50, pegs = [], slotY = 0, slotW = 0, left = 0;
  function fit() {
    const stage = root.querySelector('.game-stage');
    const size = Math.min(stage.clientWidth - 20, (stage.clientHeight - 20) * 1.25);
    Wd = Math.max(360, size);
    gap = Wd / (RISKS.low.slots.length + 1);
    top = gap * 0.9;
    Ht = top + ROWS * gap * 0.62 + 6 + gap * 0.55 + 24;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Wd * dpr; canvas.height = Ht * dpr; canvas.style.width = `${Wd}px`; canvas.style.height = `${Ht}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    pegs = [];
    for (let r = 0; r < ROWS; r++) { const n = r + 3; for (let i = 0; i < n; i++) pegs.push({ x: Wd / 2 + (i - (n - 1) / 2) * gap, y: top + r * gap * 0.62 }); }
    slotY = top + ROWS * gap * 0.62 + 6;
    slotW = gap;
    left = Wd / 2 - (slots().length / 2) * slotW;
  }
  function drop() {
    if (paused) return;
    const n = Math.min(count, Math.floor(bank / bet));
    if (n < 1) { lastEl.textContent = 'Not enough points. Lower the bet or reset.'; auto = false; upd(); return; }
    bank -= bet * n;
    for (let i = 0; i < n; i++) queue.push(bet);
    if (n < count) lastEl.textContent = `Only enough points for ${n} ${n === 1 ? 'ball' : 'balls'}.`;
    upd();
  }
  const R = () => Math.max(4, gap * 0.12);
  const PR = () => Math.max(2.5, gap * 0.07);
  // Light, bouncy and a little unpredictable. Time runs at about half speed so the ball is easy to follow.
  function physics(dtRaw) {
    const dt = dtRaw * 0.5;
    const g = gap * 0.00055;
    const now = performance.now();
    if (queue.length && now - queueT > 110 && balls.length < 250) {
      queueT = now;
      const spread = gap * 0.9;
      balls.push({ x: Wd / 2 + (aim - 0.5) * spread + (Math.random() - 0.5) * gap * 0.3, y: top - gap * 0.6, vx: (Math.random() - 0.5) * 0.25, vy: 0, bet: queue.shift(), trail: [] });
      Sfx.tick(0.8);
      upd();
    }
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      for (let s = 0; s < 4; s++) {
        const st = dt / 4;
        b.vy += g * st;
        b.vx += (Math.random() - 0.5) * 0.0006 * gap * st; // a little drift in the air
        b.x += b.vx * st; b.y += b.vy * st;
        for (const p of pegs) {
          const dx = b.x - p.x, dy = b.y - p.y; const d = Math.hypot(dx, dy); const min = R() + PR();
          if (d < min && d > 0) {
            const nx = dx / d, ny = dy / d;
            b.x = p.x + nx * min; b.y = p.y + ny * min;
            const dot = b.vx * nx + b.vy * ny;
            if (dot < 0) { b.vx -= 1.75 * dot * nx; b.vy -= 1.75 * dot * ny; } // bouncy
            b.vx += (Math.random() - 0.5) * 0.22 * gap / 40; // unpredictable kick
            b.vy *= 0.72;
            if (Math.abs(b.vx) < 0.02) b.vx += (Math.random() < 0.5 ? -1 : 1) * 0.05; // never balance on a peg
            if (!p.lit || now - p.lit > 90) { p.lit = now; if (balls.length < 12) Sfx.tick(1.2 + (b.y / Ht) * 0.6); }
          }
        }
        const lo = left + R(), hi = left + slots().length * slotW - R();
        if (b.y > top) { if (b.x < lo) { b.x = lo; b.vx = Math.abs(b.vx) * 0.6; } if (b.x > hi) { b.x = hi; b.vx = -Math.abs(b.vx) * 0.6; } }
      }
      b.trail.push([b.x, b.y]); if (b.trail.length > 8) b.trail.shift();
      if (b.y > slotY + 8) {
        const sl = slots();
        const idx = Math.max(0, Math.min(sl.length - 1, Math.floor((b.x - left) / slotW)));
        const win = b.bet * sl[idx];
        bank = Math.min(bank + win, 1e300);
        if (bank > best) best = bank;
        hits.set(idx, now);
        if (pops.length < 40) pops.push({ x: left + idx * slotW + slotW / 2, y: slotY, t: now, text: win ? `+${fmtBig(Math.round(win))}` : '0', big: sl[idx] >= 10 });
        lastEl.textContent = `Last: x${sl[idx]} = ${fmtBig(Math.round(win))} points`;
        if (sl[idx] >= 10) Sfx.land(); else if (balls.length < 12) Sfx.tick(sl[idx] >= 1 ? 1.8 : 0.5);
        balls.splice(i, 1);
        upd();
        save();
      }
    }
  }
  const slotColor = (m) => (m >= 50 ? '#ff2a3a' : m >= 10 ? '#ff3040' : m >= 4 ? '#f0452a' : m >= 2 ? '#e0336a' : m >= 1 ? '#6b6b75' : m > 0 ? '#3a3a42' : '#202024');
  function draw(now) {
    ctx.clearRect(0, 0, Wd, Ht);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e11d2e';
    const ax = Wd / 2 + (aim - 0.5) * gap * 0.9;
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.moveTo(ax - 8, 6); ctx.lineTo(ax + 8, 6); ctx.lineTo(ax, 18); ctx.fill();
    for (const p of pegs) {
      const lit = p.lit && now - p.lit < 220;
      ctx.fillStyle = lit ? accent : '#d6d6dc';
      if (lit) { ctx.shadowColor = accent; ctx.shadowBlur = 12; }
      ctx.beginPath(); ctx.arc(p.x, p.y, PR() * (lit ? 1.4 : 1), 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    }
    slots().forEach((m, i) => {
      const x = left + i * slotW; const hit = hits.get(i); const bump = hit && now - hit < 300 ? (1 - (now - hit) / 300) * 6 : 0;
      ctx.fillStyle = slotColor(m); ctx.beginPath(); ctx.roundRect(x + 2, slotY + bump, slotW - 4, gap * 0.55, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.max(9, gap * (String(m).length > 3 ? 0.2 : 0.25))}px Segoe UI, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`x${m}`, x + slotW / 2, slotY + bump + gap * 0.28);
    });
    for (const b of balls) {
      b.trail.forEach(([x, y], i) => { ctx.fillStyle = `rgba(255,80,90,${(i + 1) / 24})`; ctx.beginPath(); ctx.arc(x, y, R() * 0.8, 0, 7); ctx.fill(); });
      ctx.fillStyle = accent; ctx.shadowColor = accent; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(b.x, b.y, R(), 0, 7); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); ctx.arc(b.x - R() * 0.3, b.y - R() * 0.3, R() * 0.3, 0, 7); ctx.fill();
    }
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; const t = (now - p.t) / 1100;
      if (t > 1) { pops.splice(i, 1); continue; }
      ctx.globalAlpha = 1 - t; ctx.fillStyle = p.big ? '#ffd257' : '#fff'; ctx.font = `800 ${p.big ? 22 : 15}px Segoe UI, system-ui`; ctx.textAlign = 'center';
      ctx.fillText(p.text, p.x, p.y - 14 - t * 40); ctx.globalAlpha = 1;
    }
  }
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(40, now - last); last = now;
    if (!paused) {
      if (auto && !queue.length && now - autoT > 650) { autoT = now; drop(); }
      physics(dt);
    }
    draw(now);
  }
  function setPause(v) {
    paused = v;
    if (v) {
      msg.replaceChildren(h('div', { class: 'gm-t' }, 'Paused'), h('div', { class: 'gm-s' }, `${fmtBig(Math.floor(bank))} points`),
        h('div', { class: 'gm-btns' },
          h('button', { class: 'btn primary big', onclick: () => setPause(false) }, icon('play'), 'Resume'),
          h('button', { class: 'btn glass big', onclick: () => { reset(); setPause(false); } }, icon('refresh'), 'Reset points'),
          h('button', { class: 'btn glass big', onclick: () => shell.close() }, icon('exit'), 'Quit')));
      msg.classList.add('on');
      setTimeout(() => { const b = msg.querySelector('button'); if (b) b.focus(); }, 50);
    } else { msg.classList.remove('on'); last = performance.now(); }
  }
  const input = (k) => {
    if (k === 'menu' || k === 'view' || k === 'b' || k === 'p') return setPause(!paused);
    if (paused) { if (k === 'a') setPause(false); return true; }
    if (k === 'left') aim = Math.max(0, aim - 0.1);
    else if (k === 'right') aim = Math.min(1, aim + 0.1);
    else if (k === 'up') setBet(bet * 2);
    else if (k === 'down') setBet(bet / 2);
    else if (k === 'lb') setCount(count - 1);
    else if (k === 'rb') setCount(count + 1);
    else if (k === 'a') drop();
    else if (k === 'x') { auto = !auto; upd(); }
    return true;
  };
  window.arcadeInput = input;
  const KEYS = { a: 'left', A: 'left', d: 'right', D: 'right', w: 'up', W: 'up', s: 'down', S: 'down', ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ' ': 'a', x: 'x', X: 'x', p: 'p', P: 'p' };
  const onKey = (e) => {
    if (e.target === betIn || e.target === countIn) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setPause(!paused); return; }
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.tagName === 'BUTTON' && (paused || document.activeElement.closest('.game-side'))) return;
    const k = KEYS[e.key]; if (!k) return;
    e.preventDefault(); e.stopPropagation(); input(k);
  };
  document.addEventListener('keydown', onKey, true);
  dropBtn.addEventListener('click', drop);
  autoBtn.addEventListener('click', () => { auto = !auto; upd(); });
  window.addEventListener('resize', fit);
  if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h2) { this.rect(x, y, w, h2); };
  fit();
  upd();
  raf = requestAnimationFrame(loop);
}
