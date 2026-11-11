/* global GAMES3, prefs, Sfx, actionGame, statBox, keyList, drawBoardBg, ACC, h, padStepper, rr, DIR_KEYS, DXY, CLUES, bumpText */
// Four puzzle games for the Arcade: Vault Crossword, Vault Sudoku, Vault Word Search and Vault Maze.
// Each uses the same game frame as the others (Pause and Quit, pause menu, keyboard, mouse and controller).

const fmtClock = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const UI_FONT = "'Segoe UI Variable Display', 'Segoe UI', system-ui";

// A row of choices in the side panel (difficulty, size and so on). Picking one starts a new game.
function choiceBox(label, opts, prefKey, def, g, after) {
  const box = h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, label));
  const row = h('div', { class: 'seg wrap pz-seg' });
  const draw = () => row.replaceChildren(...opts.map(([v, name]) => h('button', {
    class: String(prefs.get(prefKey, def)) === String(v) ? 'on' : '',
    onclick: (e) => { e.currentTarget.blur(); prefs.set(prefKey, v); draw(); if (after) after(); else g.restart(); },
  }, name)));
  draw();
  box.append(row);
  return box;
}
const sideBtn = (label, fn) => h('button', { class: 'btn', style: { flex: 1 }, onclick: (e) => { e.currentTarget.blur(); fn(); } }, label);

// =====================================================================
// Vault Crossword
// =====================================================================
function buildCrossword(N = 13, target = 14) {
  const pool = [...new Map(CLUES.map(([w, c]) => [w, c])).entries()];
  let best = null;
  for (let attempt = 0; attempt < 24; attempt++) {
    const words = shuffle(pool.slice());
    const grid = Array.from({ length: N }, () => Array(N).fill(null));
    const placed = [];
    const at = (r, c) => (r >= 0 && c >= 0 && r < N && c < N ? grid[r][c] : null);
    const inside = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
    const fits = (w, r, c, dr, dc) => {
      if (at(r - dr, c - dc) || at(r + dr * w.length, c + dc * w.length)) return -1;
      let cross = 0;
      for (let i = 0; i < w.length; i++) {
        const rr2 = r + dr * i, cc = c + dc * i;
        if (!inside(rr2, cc)) return -1;
        const cur = grid[rr2][cc];
        if (cur) { if (cur !== w[i]) return -1; cross++; continue; }
        // No side by side letters except where words cross.
        if (at(rr2 + dc, cc + dr) || at(rr2 - dc, cc - dr)) return -1;
      }
      return cross < w.length ? cross : -1;
    };
    const put = (w, clue, r, c, dr, dc) => { for (let i = 0; i < w.length; i++) grid[r + dr * i][c + dc * i] = w[i]; placed.push({ w, clue, r, c, dr, dc }); };
    const first = words.find(([w]) => w.length >= 6) || words[0];
    put(first[0], first[1], Math.floor(N / 2), Math.floor((N - first[0].length) / 2), 0, 1);
    for (const [w, clue] of words) {
      if (placed.length >= target) break;
      if (placed.some((p) => p.w === w)) continue;
      const opts = [];
      for (const p of placed) {
        const [dr, dc] = p.dr ? [0, 1] : [1, 0];
        for (let i = 0; i < p.w.length; i++) for (let j = 0; j < w.length; j++) {
          if (p.w[i] !== w[j]) continue;
          const r = p.r + p.dr * i - dr * j, c = p.c + p.dc * i - dc * j;
          const x = fits(w, r, c, dr, dc);
          if (x > 0) opts.push({ r, c, dr, dc, x: x + Math.random() * 0.5 });
        }
      }
      if (!opts.length) continue;
      opts.sort((a, b) => b.x - a.x);
      const o = opts[0];
      put(w, clue, o.r, o.c, o.dr, o.dc);
    }
    if (!best || placed.length > best.placed.length) best = { grid, placed };
    if (placed.length >= target) break;
  }
  // Crop to the letters in use.
  let r0 = N, r1 = 0, c0 = N, c1 = 0;
  best.grid.forEach((row, r) => row.forEach((v, c) => { if (v) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); } }));
  const rows = r1 - r0 + 1, cols = c1 - c0 + 1;
  const sol = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => best.grid[r + r0][c + c0]));
  const words = best.placed.map((p) => ({ ...p, r: p.r - r0, c: p.c - c0 }));
  // Numbers, in reading order.
  const starts = [...new Set(words.map((w) => w.r * 100 + w.c))].sort((a, b) => a - b);
  for (const w of words) { w.n = starts.indexOf(w.r * 100 + w.c) + 1; w.across = !!w.dc; }
  words.sort((a, b) => a.n - b.n);
  return { rows, cols, sol, words, nums: new Map(starts.map((k, i) => [k, i + 1])) };
}

function vaultCrossword() {
  const W = 720, H = 780, TOP = 84;
  let pz, ent, cur, across, wrong, elapsed, solved, revealedAny;
  const timeEl = h('div', { class: 'gs-v' }), leftEl = h('div', { class: 'gs-v' }), winsEl = h('div', { class: 'gs-v' });
  const listBox = h('div', { class: 'gs-box pz-clues' });
  let G = null;
  const cell = () => Math.floor(Math.min((W - 40) / pz.cols, (H - TOP - 20) / pz.rows, 60));
  const origin = () => { const s = cell(); return { x: Math.round((W - s * pz.cols) / 2), y: TOP + Math.round((H - TOP - 10 - s * pz.rows) / 2), s }; };
  const isCell = (r, c) => r >= 0 && c >= 0 && r < pz.rows && c < pz.cols && !!pz.sol[r][c];
  const wordAt = (r, c, ac) => pz.words.find((w) => w.across === ac && (ac ? w.r === r && c >= w.c && c < w.c + w.w.length : w.c === c && r >= w.r && r < w.r + w.w.length));
  const curWord = () => wordAt(cur.r, cur.c, across) || wordAt(cur.r, cur.c, !across);
  const cellsOf = (w) => [...w.w].map((_, i) => ({ r: w.r + w.dr * i, c: w.c + w.dc * i }));
  const filled = () => pz.words.every((w) => cellsOf(w).every(({ r, c }) => ent[r][c]));
  const correct = () => pz.sol.every((row, r) => row.every((v, c) => !v || ent[r][c] === v));
  const left = () => pz.sol.reduce((a, row, r) => a + row.filter((v, c) => v && !ent[r][c]).length, 0);
  const select = (r, c, ac) => {
    if (!isCell(r, c)) return;
    if (ac === undefined) ac = across;
    if (!wordAt(r, c, ac)) ac = !ac;
    cur = { r, c }; across = ac;
    drawList();
  };
  const step = (dr, dc) => { let r = cur.r + dr, c = cur.c + dc; while (r >= 0 && c >= 0 && r < pz.rows && c < pz.cols) { if (isCell(r, c)) return select(r, c, dr ? false : dc ? true : across); r += dr; c += dc; } };
  const nextInWord = (dirn) => { const w = curWord(); if (!w) return; const cs = cellsOf(w); const i = cs.findIndex((x) => x.r === cur.r && x.c === cur.c); const n = cs[i + dirn]; if (n) cur = { r: n.r, c: n.c }; };
  const nextWord = (dirn = 1) => { const i = pz.words.indexOf(curWord()); const w = pz.words[(i + dirn + pz.words.length) % pz.words.length]; cur = { r: w.r, c: w.c }; across = w.across; drawList(); };
  const setLetter = (ch) => {
    if (solved) return;
    ent[cur.r][cur.c] = ch; wrong.delete(`${cur.r},${cur.c}`); Sfx.tick(1.3);
    const w = curWord();
    const atEnd = w && (() => { const cs = cellsOf(w); const l = cs[cs.length - 1]; return l.r === cur.r && l.c === cur.c; })();
    nextInWord(1);
    // Finished the word: jump to the next word that still has empty squares.
    if (w && atEnd && cellsOf(w).every(({ r, c }) => ent[r][c])) {
      const i = pz.words.indexOf(w);
      const next = [...pz.words.slice(i + 1), ...pz.words.slice(0, i)].find((x) => cellsOf(x).some(({ r, c }) => !ent[r][c]));
      if (next) { const e0 = cellsOf(next).find(({ r, c }) => !ent[r][c]); cur = { r: e0.r, c: e0.c }; across = next.across; drawList(); }
    }
    checkDone();
  };
  const checkDone = () => {
    leftEl.textContent = String(left());
    if (!filled()) return;
    if (correct()) {
      solved = true;
      if (!revealedAny) { prefs.set('crossWins', prefs.get('crossWins', 0) + 1); const b = prefs.get('crossBest', 0); if (!b || elapsed < b) prefs.set('crossBest', elapsed); }
      winsEl.textContent = String(prefs.get('crossWins', 0));
      Sfx.land();
      G.fx.burst(W / 2, H / 2, ['#2fbf71', '#ffffff', '#ffd257'], 70, 7, { size: 5, gravity: 0.05 });
      G.gameOver(revealedAny ? 'Finished' : 'Solved!', `${pz.words.length} words in ${fmtClock(elapsed)}${revealedAny ? ' (with help)' : ''}`);
    } else { Sfx.tick(0.5); G.fx.banner('Not quite', 'Something is off. Use Check to see what.', '#ffb02e', 1500); }
  };
  const check = () => { let n = 0; pz.sol.forEach((row, r) => row.forEach((v, c) => { if (v && ent[r][c] && ent[r][c] !== v) { wrong.add(`${r},${c}`); n++; } })); G.fx.banner(n ? `${n} wrong` : 'All good so far', null, n ? '#ff5d6c' : '#2fbf71', 1100); };
  const reveal = (cells) => { revealedAny = true; for (const { r, c } of cells) { ent[r][c] = pz.sol[r][c]; wrong.delete(`${r},${c}`); } checkDone(); };
  function drawList() {
    const w = curWord();
    const sec = (title, list) => [h('div', { class: 'gs-l' }, title), ...list.map((x) => h('button', { class: 'pz-clue' + (x === w ? ' on' : '') + (cellsOf(x).every(({ r, c }) => ent[r][c]) ? ' done' : ''), onclick: (e) => { e.currentTarget.blur(); cur = { r: x.r, c: x.c }; across = x.across; drawList(); } }, h('b', {}, String(x.n)), ` ${x.clue}`))];
    listBox.replaceChildren(...sec('Across', pz.words.filter((x) => x.across)), ...sec('Down', pz.words.filter((x) => !x.across)));
    const on = listBox.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', ' ': 'dir', Tab: 'tab', Enter: 'tab', Backspace: 'back', Delete: 'del' };
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') keys[ch] = `L:${ch}`;
  const pad = padStepper(true);
  actionGame({
    title: 'Vault Crossword', W, H, noCountdown: true,
    side: (g) => [
      statBox([['Time', timeEl], ['Letters left', leftEl], ['Solved', winsEl]]),
      h('div', { class: 'gs-box' }, h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } },
        sideBtn('Check', () => check()), sideBtn('Reveal letter', () => reveal([cur])), sideBtn('Reveal word', () => { const w = curWord(); if (w) reveal(cellsOf(w)); }), sideBtn('Reveal all', () => reveal(pz.words.flatMap(cellsOf))), sideBtn('New puzzle', () => g.restart()))),
      listBox,
      keyList(['Type', 'fill in'], ['Arrows', 'move'], ['Space', 'across or down'], ['Tab / Enter', 'next word'], ['Backspace', 'delete'], [null, 'Controller: stick to move, LB / RB change the letter, A switches across and down, Y checks, B deletes.']),
    ],
    keys,
    onButton: (g, k) => {
      if (solved) return;
      if (k.startsWith('L:')) setLetter(k.slice(2).toUpperCase());
      else if (DXY[k]) { const [dc, dr] = DXY[k]; if ((dr && across) || (dc && !across)) { const ac = !!dc; if (wordAt(cur.r, cur.c, ac)) { across = ac; drawList(); return; } } step(dr, dc); }
      else if (k === 'dir' || k === 'a') { if (wordAt(cur.r, cur.c, !across)) { across = !across; drawList(); } }
      else if (k === 'tab') nextWord(1);
      else if (k === 'back' || k === 'b') { if (ent[cur.r][cur.c]) ent[cur.r][cur.c] = ''; else { nextInWord(-1); ent[cur.r][cur.c] = ''; } leftEl.textContent = String(left()); }
      else if (k === 'del') { ent[cur.r][cur.c] = ''; leftEl.textContent = String(left()); }
      else if (k === 'rb' || k === 'lb') { const v = ent[cur.r][cur.c] || (k === 'rb' ? '@' : '['); const n = String.fromCharCode(((v.charCodeAt(0) - 65 + (k === 'rb' ? 1 : -1) + 26) % 26) + 65); ent[cur.r][cur.c] = n; wrong.delete(`${cur.r},${cur.c}`); leftEl.textContent = String(left()); Sfx.tick(1.2); }
      else if (k === 'y') check();
      else if (k === 'x') nextWord(1);
    },
    onPointer: (g, e) => {
      const p = g.point(e); const o = origin();
      const c = Math.floor((p.x - o.x) / o.s), r = Math.floor((p.y - o.y) / o.s);
      if (!isCell(r, c)) return;
      if (r === cur.r && c === cur.c) { if (wordAt(r, c, !across)) across = !across; drawList(); } else select(r, c);
    },
    pausedSub: () => `${left()} letters left · ${fmtClock(elapsed)}`,
    reset(g) {
      G = g;
      pz = buildCrossword();
      ent = pz.sol.map((row) => row.map(() => ''));
      wrong = new Set(); elapsed = 0; solved = false; revealedAny = false;
      const w0 = pz.words[0]; cur = { r: w0.r, c: w0.c }; across = w0.across;
      leftEl.textContent = String(left()); winsEl.textContent = String(prefs.get('crossWins', 0)); timeEl.textContent = '0:00';
      drawList();
      if (window.__pzTest) window.__pzTest.cross = { pz, ent, check: checkDone };
    },
    update(g, dt) {
      if (!solved) { elapsed += dt; timeEl.textContent = fmtClock(elapsed); }
      const d = pad(g, dt); if (d) { const [dc, dr] = DXY[d]; step(dr, dc); }
    },
    draw(g, now) {
      const { ctx } = g;
      drawBoardBg(ctx, W, H, now, ACC(), 0);
      const o = origin(), s = o.s, w = curWord();
      const inWord = new Set(w ? cellsOf(w).map(({ r, c }) => `${r},${c}`) : []);
      // The clue for the selected word.
      ctx.fillStyle = 'rgba(255,255,255,.06)'; rr(ctx, 20, 16, W - 40, 54, 12); ctx.fill();
      if (w) {
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = ACC(); ctx.font = `800 18px ${UI_FONT}`; ctx.fillText(`${w.n} ${w.across ? 'Across' : 'Down'}`, 36, 43);
        ctx.fillStyle = '#fff'; ctx.font = `600 18px ${UI_FONT}`;
        let t = w.clue; const maxW = W - 200; while (ctx.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -2);
        ctx.fillText(t === w.clue ? t : `${t}…`, 160, 43);
      }
      for (let r = 0; r < pz.rows; r++) for (let c = 0; c < pz.cols; c++) {
        if (!pz.sol[r][c]) continue;
        const x = o.x + c * s, y = o.y + r * s, k = `${r},${c}`;
        const isCur = r === cur.r && c === cur.c;
        ctx.fillStyle = isCur ? '#ffd257' : inWord.has(k) ? '#ffe9a8' : '#f2f2f5';
        ctx.fillRect(x + 1, y + 1, s - 2, s - 2);
        const n = pz.nums.get(r * 100 + c);
        if (n) { ctx.fillStyle = '#333'; ctx.font = `700 ${Math.max(9, s * 0.24)}px ${UI_FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText(String(n), x + 4, y + 3); }
        if (ent[r][c]) { ctx.fillStyle = wrong.has(k) ? '#d0021b' : '#111'; ctx.font = `800 ${s * 0.56}px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ent[r][c], x + s / 2, y + s / 2 + s * 0.06); }
        if (wrong.has(k)) { ctx.strokeStyle = '#d0021b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 4, y + s - 4); ctx.lineTo(x + s - 4, y + 4); ctx.stroke(); }
      }
    },
  });
}

// =====================================================================
// Vault Sudoku
// =====================================================================
function sudokuSolveCount(b, limit = 2) {
  // b: array of 81 numbers (0 empty). Counts solutions up to limit.
  let count = 0;
  const rowM = Array(9).fill(0), colM = Array(9).fill(0), boxM = Array(9).fill(0);
  const bi = (i) => Math.floor(Math.floor(i / 9) / 3) * 3 + Math.floor((i % 9) / 3);
  for (let i = 0; i < 81; i++) if (b[i]) { const m = 1 << b[i]; rowM[Math.floor(i / 9)] |= m; colM[i % 9] |= m; boxM[bi(i)] |= m; }
  const go = () => {
    if (count >= limit) return;
    // The empty cell with the fewest options.
    let best = -1, bestOpts = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (b[i]) continue;
      const used = rowM[Math.floor(i / 9)] | colM[i % 9] | boxM[bi(i)];
      let n = 0; for (let d = 1; d <= 9; d++) if (!(used & (1 << d))) n++;
      if (n < bestN) { bestN = n; best = i; bestOpts = ~used; if (n === 0) return; }
    }
    if (best < 0) { count++; return; }
    const r = Math.floor(best / 9), c = best % 9, x = bi(best);
    for (let d = 1; d <= 9; d++) {
      if (!(bestOpts & (1 << d))) continue;
      const m = 1 << d;
      b[best] = d; rowM[r] |= m; colM[c] |= m; boxM[x] |= m;
      go();
      b[best] = 0; rowM[r] &= ~m; colM[c] &= ~m; boxM[x] &= ~m;
      if (count >= limit) return;
    }
  };
  go();
  return count;
}
function sudokuMake(level) {
  // A full grid: fill the three diagonal boxes at random, then solve the rest.
  const b = Array(81).fill(0);
  for (let k = 0; k < 3; k++) { const ds = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]); for (let i = 0; i < 9; i++) b[(k * 3 + Math.floor(i / 3)) * 9 + k * 3 + (i % 3)] = ds[i]; }
  const fill = (i) => {
    if (i === 81) return true;
    if (b[i]) return fill(i + 1);
    const r = Math.floor(i / 9), c = i % 9;
    for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      let ok = true;
      for (let j = 0; j < 9 && ok; j++) if (b[r * 9 + j] === d || b[j * 9 + c] === d) ok = false;
      const br = r - (r % 3), bc = c - (c % 3);
      for (let y = 0; y < 3 && ok; y++) for (let x = 0; x < 3 && ok; x++) if (b[(br + y) * 9 + bc + x] === d) ok = false;
      if (!ok) continue;
      b[i] = d;
      if (fill(i + 1)) return true;
      b[i] = 0;
    }
    return false;
  };
  fill(0);
  const sol = b.slice();
  // Take numbers away while the puzzle still has only one answer.
  const keep = { easy: 40, medium: 32, hard: 26 }[level] || 32;
  const order = shuffle([...Array(81).keys()]);
  let clues = 81;
  for (const i of order) {
    if (clues <= keep) break;
    const v = b[i]; b[i] = 0;
    if (sudokuSolveCount(b.slice(), 2) !== 1) b[i] = v; else clues--;
  }
  return { puzzle: b, sol };
}

function vaultSudoku() {
  const W = 640, H = 704, S9 = 64, GX = (W - S9 * 9) / 2, GY = 24, PY = GY + S9 * 9 + 26, PW = 50, PH = 60;
  let pz, val, notes, given, cur, pen, noteMode, mistakes, elapsed, done, undo, hinted;
  const level = () => prefs.get('sudokuLevel', 'medium');
  const timeEl = h('div', { class: 'gs-v' }), mistEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' }), modeEl = h('div', { class: 'gs-v' });
  let G = null;
  const bestKey = () => `sudokuBest_${level()}`;
  const showBest = () => { const b = prefs.get(bestKey(), 0); bestEl.textContent = b ? fmtClock(b) : '-'; };
  const showMode = () => { modeEl.textContent = noteMode ? 'Notes' : 'Numbers'; };
  const picker = () => [...Array(9).keys()].map((i) => ({ k: String(i + 1), x: (W - (11 * PW + 10 * 6)) / 2 + i * (PW + 6) })).concat([{ k: 'erase' }, { k: 'notes' }].map((o, j) => ({ ...o, x: (W - (11 * PW + 10 * 6)) / 2 + (9 + j) * (PW + 6) })));
  const countOf = (d) => val.filter((v) => v === d).length;
  const conflict = (i) => {
    const v = val[i]; if (!v) return false;
    const r = Math.floor(i / 9), c = i % 9;
    for (let j = 0; j < 9; j++) { if (j !== c && val[r * 9 + j] === v) return true; if (j !== r && val[j * 9 + c] === v) return true; }
    const br = r - (r % 3), bc = c - (c % 3);
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) { const k = (br + y) * 9 + bc + x; if (k !== i && val[k] === v) return true; }
    return false;
  };
  const place = (d) => {
    const i = cur.r * 9 + cur.c;
    if (done || given[i]) return;
    if (noteMode && d) { undo.push({ i, v: val[i], n: notes[i] }); notes[i] ^= 1 << d; Sfx.tick(1.6); return; }
    undo.push({ i, v: val[i], n: notes[i] });
    val[i] = val[i] === d ? 0 : d; notes[i] = 0;
    if (d && val[i] && val[i] !== pz.sol[i]) { mistakes++; bumpText(mistEl, String(mistakes)); Sfx.tick(0.5); G.fx.shake(3); }
    else if (d) {
      Sfx.tick(1.3);
      // Clear that number from notes in the same row, column and box.
      const r = cur.r, c = cur.c, br = r - (r % 3), bc = c - (c % 3);
      for (let j = 0; j < 81; j++) { const jr = Math.floor(j / 9), jc = j % 9; if (jr === r || jc === c || (jr >= br && jr < br + 3 && jc >= bc && jc < bc + 3)) notes[j] &= ~(1 << d); }
    }
    if (val.every((v, k) => v === pz.sol[k])) finish();
  };
  const finish = () => {
    done = true;
    const isBest = !hinted && (!prefs.get(bestKey(), 0) || elapsed < prefs.get(bestKey(), 0));
    if (isBest) prefs.set(bestKey(), elapsed);
    prefs.set('sudokuWins', prefs.get('sudokuWins', 0) + 1);
    showBest(); Sfx.land();
    G.fx.burst(W / 2, GY + S9 * 4.5, ['#2fbf71', '#ffffff', '#ffd257'], 80, 7, { size: 5, gravity: 0.05 });
    G.gameOver(isBest ? 'New best time!' : 'Solved!', `${level()[0].toUpperCase()}${level().slice(1)} in ${fmtClock(elapsed)} · ${mistakes} ${mistakes === 1 ? 'mistake' : 'mistakes'}${hinted ? ` · ${hinted} hints` : ''}`);
  };
  const hint = () => {
    if (done) return;
    const i0 = cur.r * 9 + cur.c;
    const i = !given[i0] && val[i0] !== pz.sol[i0] ? i0 : val.findIndex((v, k) => v !== pz.sol[k]);
    if (i < 0) return;
    undo.push({ i, v: val[i], n: notes[i] });
    val[i] = pz.sol[i]; notes[i] = 0; hinted++; cur = { r: Math.floor(i / 9), c: i % 9 };
    Sfx.tick(1.8);
    if (val.every((v, k) => v === pz.sol[k])) finish();
  };
  const doUndo = () => { const u = undo.pop(); if (!u || done) return; val[u.i] = u.v; notes[u.i] = u.n; cur = { r: Math.floor(u.i / 9), c: u.i % 9 }; };
  const keys = { ...DIR_KEYS, Backspace: 'erase', Delete: 'erase', 0: 'erase', n: 'notes', u: 'undo', z: 'undo', h: 'hint' };
  for (let d = 1; d <= 9; d++) keys[String(d)] = `d${d}`;
  const pad = padStepper(true);
  const move = (k) => { const [dx, dy] = DXY[k]; cur = { r: (cur.r + dy + 9) % 9, c: (cur.c + dx + 9) % 9 }; };
  actionGame({
    title: 'Vault Sudoku', W, H, noCountdown: true,
    side: (g) => [
      choiceBox('Difficulty', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], 'sudokuLevel', 'medium', g),
      statBox([['Time', timeEl], ['Mistakes', mistEl], ['Best time', bestEl], ['Entering', modeEl]]),
      h('div', { class: 'gs-box' }, h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, sideBtn('Undo', doUndo), sideBtn('Hint', hint), sideBtn('New puzzle', () => g.restart()))),
      keyList(['1 to 9', 'place a number'], ['N', 'notes on or off'], ['0 / Backspace', 'erase'], ['Arrows / W A S D', 'move'], ['U / Z', 'undo'], ['H', 'hint'], [null, 'Controller: stick to move, LB / RB pick the number, A places it, B erases, Y switches notes, X undoes. Wrong numbers show in red.']),
    ],
    keys,
    onButton: (g, k) => {
      if (DXY[k]) move(k);
      else if (k[0] === 'd' && k.length === 2) place(+k[1]);
      else if (k === 'erase' || k === 'b') { const i = cur.r * 9 + cur.c; if (!given[i] && (val[i] || notes[i])) { undo.push({ i, v: val[i], n: notes[i] }); val[i] = 0; notes[i] = 0; } }
      else if (k === 'notes' || k === 'y') { noteMode = !noteMode; showMode(); }
      else if (k === 'undo' || k === 'x') doUndo();
      else if (k === 'hint') hint();
      else if (k === 'rb') pen = (pen % 9) + 1;
      else if (k === 'lb') pen = ((pen + 7) % 9) + 1;
      else if (k === 'a') place(pen);
    },
    onPointer: (g, e) => {
      const p = g.point(e);
      if (p.y >= GY && p.y < GY + S9 * 9 && p.x >= GX && p.x < GX + S9 * 9) {
        cur = { r: Math.floor((p.y - GY) / S9), c: Math.floor((p.x - GX) / S9) };
        // Right click clears the square.
        if (e.button === 2) { const i = cur.r * 9 + cur.c; if (!given[i] && (val[i] || notes[i])) { undo.push({ i, v: val[i], n: notes[i] }); val[i] = 0; notes[i] = 0; } }
        return;
      }
      if (p.y >= PY && p.y < PY + PH) {
        const b = picker().find((o) => p.x >= o.x && p.x < o.x + PW);
        if (!b) return;
        if (b.k === 'erase') { const i = cur.r * 9 + cur.c; if (!given[i]) { undo.push({ i, v: val[i], n: notes[i] }); val[i] = 0; notes[i] = 0; } }
        else if (b.k === 'notes') { noteMode = !noteMode; showMode(); }
        else { pen = +b.k; place(+b.k); }
      }
    },
    pausedSub: () => `${level()} · ${fmtClock(elapsed)} · ${mistakes} mistakes`,
    reset(g) {
      G = g;
      pz = sudokuMake(level());
      val = pz.puzzle.slice(); given = pz.puzzle.map((v) => !!v); notes = Array(81).fill(0);
      cur = { r: 4, c: 4 }; pen = 1; noteMode = false; mistakes = 0; elapsed = 0; done = false; undo = []; hinted = 0;
      mistEl.textContent = '0'; timeEl.textContent = '0:00'; showBest(); showMode();
      if (window.__pzTest) window.__pzTest.sudoku = { pz, val, place: (r, c, d) => { cur = { r, c }; noteMode = false; place(d); } };
    },
    update(g, dt) {
      if (!done) { elapsed += dt; timeEl.textContent = fmtClock(elapsed); }
      const d = pad(g, dt); if (d) move(d);
    },
    draw(g, now) {
      const { ctx } = g;
      drawBoardBg(ctx, W, H, now, ACC(), 0);
      const ci = cur.r * 9 + cur.c, cv = val[ci];
      const br = cur.r - (cur.r % 3), bc = cur.c - (cur.c % 3);
      for (let i = 0; i < 81; i++) {
        const r = Math.floor(i / 9), c = i % 9, x = GX + c * S9, y = GY + r * S9;
        const peer = r === cur.r || c === cur.c || (r >= br && r < br + 3 && c >= bc && c < bc + 3);
        const same = cv && val[i] === cv;
        ctx.fillStyle = i === ci ? 'rgba(255,210,87,.38)' : same ? 'rgba(79,163,255,.26)' : peer ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.03)';
        ctx.fillRect(x, y, S9, S9);
        if (val[i]) {
          const bad = !given[i] && val[i] !== pz.sol[i];
          ctx.fillStyle = given[i] ? '#f2f2f5' : bad ? '#ff5d6c' : conflict(i) ? '#ffb02e' : '#7fc4ff';
          ctx.font = `${given[i] ? 800 : 600} 32px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(val[i]), x + S9 / 2, y + S9 / 2 + 2);
        } else if (notes[i]) {
          ctx.fillStyle = '#a0a0ab'; ctx.font = `600 14px ${UI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          for (let d = 1; d <= 9; d++) if (notes[i] & (1 << d)) ctx.fillText(String(d), x + 12 + ((d - 1) % 3) * 20, y + 12 + Math.floor((d - 1) / 3) * 20);
        }
      }
      // Lines: thin for cells, thick for boxes.
      for (let k = 0; k <= 9; k++) {
        ctx.strokeStyle = k % 3 === 0 ? 'rgba(255,255,255,.7)' : 'rgba(255,255,255,.16)'; ctx.lineWidth = k % 3 === 0 ? 3 : 1;
        ctx.beginPath(); ctx.moveTo(GX + k * S9, GY); ctx.lineTo(GX + k * S9, GY + 9 * S9); ctx.moveTo(GX, GY + k * S9); ctx.lineTo(GX + 9 * S9, GY + k * S9); ctx.stroke();
      }
      // The number picker.
      for (const b of picker()) {
        const isPen = b.k === String(pen), isNotes = b.k === 'notes' && noteMode;
        const full = /^\d$/.test(b.k) && countOf(+b.k) >= 9;
        ctx.fillStyle = isNotes ? ACC() : isPen ? hexA5(ACC(), 0.45) : 'rgba(255,255,255,.08)';
        rr(ctx, b.x, PY, PW, PH, 10); ctx.fill();
        ctx.fillStyle = full ? 'rgba(255,255,255,.25)' : '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (/^\d$/.test(b.k)) { ctx.font = `800 26px ${UI_FONT}`; ctx.fillText(b.k, b.x + PW / 2, PY + PH / 2 - 6); ctx.font = `600 11px ${UI_FONT}`; ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillText(String(9 - countOf(+b.k)), b.x + PW / 2, PY + PH - 11); }
        else { ctx.font = `700 12px ${UI_FONT}`; ctx.fillText(b.k === 'erase' ? 'Erase' : 'Notes', b.x + PW / 2, PY + PH / 2); }
      }
    },
  });
}
// A color with transparency, from #rrggbb.
function hexA5(hex, a) { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

// =====================================================================
// Vault Word Search
// =====================================================================
const WS_THEMES = {
  Gaming: ['CONTROLLER', 'ARCADE', 'PIXEL', 'LEVEL', 'BOSS', 'QUEST', 'LOOT', 'RESPAWN', 'COMBO', 'SPEEDRUN', 'HEADSET', 'CONSOLE', 'SAVEPOINT', 'JOYSTICK', 'PLAYER'],
  Animals: ['TIGER', 'EAGLE', 'SHARK', 'WHALE', 'RABBIT', 'TURTLE', 'PENGUIN', 'GIRAFFE', 'MONKEY', 'SPIDER', 'ZEBRA', 'DOLPHIN', 'OCTOPUS', 'PANTHER', 'KOALA'],
  Space: ['PLANET', 'COMET', 'GALAXY', 'ORBIT', 'ASTEROID', 'SATURN', 'NEBULA', 'ECLIPSE', 'METEOR', 'ROCKET', 'GRAVITY', 'JUPITER', 'MERCURY', 'TELESCOPE', 'COSMOS'],
  Food: ['PIZZA', 'BURGER', 'TACO', 'PASTA', 'CHEESE', 'HONEY', 'COOKIE', 'DONUT', 'WAFFLE', 'PANCAKE', 'MANGO', 'POTATO', 'NOODLE', 'PRETZEL', 'SANDWICH'],
  Sports: ['SOCCER', 'TENNIS', 'HOCKEY', 'GOLF', 'BOXING', 'BASEBALL', 'FOOTBALL', 'SKIING', 'SURFING', 'CYCLING', 'TROPHY', 'REFEREE', 'STADIUM', 'MEDAL', 'SPRINT'],
  Nature: ['RIVER', 'OCEAN', 'ISLAND', 'DESERT', 'FOREST', 'VOLCANO', 'GLACIER', 'CANYON', 'MEADOW', 'THUNDER', 'RAINBOW', 'WATERFALL', 'MOUNTAIN', 'VALLEY', 'BREEZE'],
  Music: ['GUITAR', 'PIANO', 'DRUMS', 'VIOLIN', 'TRUMPET', 'CONCERT', 'MELODY', 'RHYTHM', 'CHORUS', 'TEMPO', 'SINGER', 'BASS', 'FLUTE', 'HARMONY', 'ENCORE'],
  Photography: ['CAMERA', 'LENS', 'SHUTTER', 'FOCUS', 'TRIPOD', 'FLASH', 'PORTRAIT', 'STUDIO', 'APERTURE', 'EXPOSURE', 'ZOOM', 'FRAME', 'LIGHTING', 'SNAPSHOT', 'GALLERY'],
};
function vaultWordSearch() {
  let wsHint = null;
  const W = 700, H = 700;
  let N, grid, words, found, sel, drag, cursorRC, elapsed, done, theme, colors;
  const timeEl = h('div', { class: 'gs-v' }), leftEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' });
  const listBox = h('div', { class: 'gs-box pz-words' });
  let G = null;
  const level = () => prefs.get('wsLevel', 'easy');
  const DIRS_EASY = [[0, 1], [1, 0], [1, 1]];
  const DIRS_HARD = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];
  const HUES = ['#ff5d6c', '#ffb02e', '#ffd257', '#3ddc84', '#4fd1c5', '#4fa3ff', '#a78bfa', '#f472b6'];
  const cs = () => Math.floor((W - 40) / N);
  const org = () => ({ x: (W - cs() * N) / 2, y: (H - cs() * N) / 2 });
  const showList = () => {
    listBox.replaceChildren(h('div', { class: 'gs-l' }, `${theme} · ${words.length - found.length} to find`),
      h('div', { class: 'pz-wlist' }, words.map((w) => { const f = found.find((x) => x.w === w.w); return h('span', { class: f ? 'found' : '', style: f ? `--c:${f.color}` : '' }, w.w); })));
    leftEl.textContent = String(words.length - found.length);
  };
  const build = () => {
    const lv = level();
    N = lv === 'hard' ? 15 : 12;
    const dirs = lv === 'hard' ? DIRS_HARD : DIRS_EASY;
    const names = Object.keys(WS_THEMES);
    theme = prefs.get('wsTheme', 'Random');
    if (!WS_THEMES[theme]) theme = names[Math.floor(Math.random() * names.length)];
    const want = lv === 'hard' ? 12 : 9;
    for (let attempt = 0; attempt < 40; attempt++) {
      grid = Array.from({ length: N }, () => Array(N).fill(''));
      words = [];
      for (const w of shuffle(WS_THEMES[theme].filter((x) => x.length <= N).slice())) {
        if (words.length >= want) break;
        const tries = [];
        for (let k = 0; k < 120; k++) {
          const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
          const r = Math.floor(Math.random() * N), c = Math.floor(Math.random() * N);
          const er = r + dr * (w.length - 1), ec = c + dc * (w.length - 1);
          if (er < 0 || ec < 0 || er >= N || ec >= N) continue;
          let ok = true, overlap = 0;
          for (let i = 0; i < w.length && ok; i++) { const v = grid[r + dr * i][c + dc * i]; if (v && v !== w[i]) ok = false; else if (v) overlap++; }
          if (ok && overlap < w.length) tries.push({ r, c, dr, dc, overlap });
          if (tries.length > 8) break;
        }
        if (!tries.length) continue;
        tries.sort((a, b) => b.overlap - a.overlap);
        const t = tries[0];
        for (let i = 0; i < w.length; i++) grid[t.r + t.dr * i][t.c + t.dc * i] = w[i];
        words.push({ w, ...t });
      }
      if (words.length >= want) break;
    }
    const AZ = 'ABCDEFGHIJKLMNOPRSTUWY';
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) grid[r][c] = AZ[Math.floor(Math.random() * AZ.length)];
    words.sort((a, b) => a.w.localeCompare(b.w));
  };
  const cellAt = (p) => { const o = org(), s = cs(); const c = Math.floor((p.x - o.x) / s), r = Math.floor((p.y - o.y) / s); return r >= 0 && c >= 0 && r < N && c < N ? { r, c } : null; };
  // A straight line from a to b (snaps to the nearest of the eight directions).
  const line = (a, b) => {
    let dr = b.r - a.r, dc = b.c - a.c;
    const len = Math.max(Math.abs(dr), Math.abs(dc));
    if (!len) return [a];
    const ang = Math.round(Math.atan2(dr, dc) / (Math.PI / 4));
    const DIR8 = { 0: [0, 1], 1: [1, 1], 2: [1, 0], 3: [1, -1], 4: [0, -1], '-4': [0, -1], '-1': [-1, 1], '-2': [-1, 0], '-3': [-1, -1] };
    [dr, dc] = DIR8[ang];
    const out = [];
    for (let i = 0; i <= len; i++) { const r = a.r + dr * i, c = a.c + dc * i; if (r < 0 || c < 0 || r >= N || c >= N) break; out.push({ r, c }); }
    return out;
  };
  const tryWord = (cells) => {
    if (cells.length < 2) return;
    const str = cells.map(({ r, c }) => grid[r][c]).join('');
    const rev = [...str].reverse().join('');
    const w = words.find((x) => !found.some((f) => f.w === x.w) && (x.w === str || x.w === rev) && cellsMatch(x, cells));
    if (!w) { Sfx.tick(0.6); return; }
    const color = HUES[found.length % HUES.length];
    found.push({ w: w.w, cells, color });
    Sfx.land();
    const o = org(), s = cs(), m = cells[Math.floor(cells.length / 2)];
    G.fx.burst(o.x + m.c * s + s / 2, o.y + m.r * s + s / 2, [color, '#ffffff'], 24, 4, { size: 4, gravity: 0.04 });
    showList();
    if (found.length === words.length) {
      done = true;
      const key = `wsBest_${level()}`;
      const isBest = !prefs.get(key, 0) || elapsed < prefs.get(key, 0);
      if (isBest) prefs.set(key, elapsed);
      bestEl.textContent = fmtClock(prefs.get(key, 0));
      G.gameOver(isBest ? 'New best time!' : 'All found!', `${theme} · ${words.length} words in ${fmtClock(elapsed)}`);
    }
  };
  // The selection has to be exactly where the word is (so a lucky copy elsewhere does not count twice).
  const cellsMatch = (w, cells) => {
    const a = cells[0], b = cells[cells.length - 1];
    const er = w.r + w.dr * (w.w.length - 1), ec = w.c + w.dc * (w.w.length - 1);
    return (a.r === w.r && a.c === w.c && b.r === er && b.c === ec) || (b.r === w.r && b.c === w.c && a.r === er && a.c === ec);
  };
  const pad = padStepper(true);
  let listening = false;
  actionGame({
    title: 'Vault Word Search', W, H, noCountdown: true,
    side: (g) => [
      choiceBox('Difficulty', [['easy', 'Easy'], ['hard', 'Hard']], 'wsLevel', 'easy', g),
      choiceBox('Theme', [['Random', 'Random'], ...Object.keys(WS_THEMES).map((k) => [k, k])], 'wsTheme', 'Random', g),
      statBox([['Time', timeEl], ['Words left', leftEl], ['Best time', bestEl]]),
      h('div', { class: 'gs-box' }, h('div', { class: 'row', style: { gap: '6px' } }, sideBtn('Hint (+15 s)', () => { if (done) return; const left = words.filter((x) => !found.some((f) => f.w === x.w)); if (!left.length) return; const w = left[Math.floor(Math.random() * left.length)]; wsHint = { r: w.r, c: w.c, t: performance.now() }; elapsed += 15000; Sfx.tick(1.6); }), sideBtn('New puzzle', () => g.restart()))),
      listBox,
      keyList(['Drag', 'over a word'], ['Arrows / W A S D', 'move'], ['Space', 'start, then end a word'], [null, 'Easy: across, down and diagonal. Hard: every direction, backwards too. Controller: stick to move, A to start and end.']),
    ],
    keys: { ...DIR_KEYS, ' ': 'a', Enter: 'a' },
    onButton: (g, k) => {
      if (done) return;
      if (DXY[k]) { const [dx, dy] = DXY[k]; cursorRC = { r: (cursorRC.r + dy + N) % N, c: (cursorRC.c + dx + N) % N }; }
      else if (k === 'a') { if (!sel) sel = { a: { ...cursorRC } }; else { tryWord(line(sel.a, cursorRC)); sel = null; } }
      else if (k === 'b') sel = null;
    },
    onPointer: (g, e) => {
      if (done) return;
      const c = cellAt(g.point(e));
      if (!c) return;
      drag = { a: c, b: c }; cursorRC = { ...c };
      try { g.canvas.setPointerCapture(e.pointerId); } catch {}
      if (!listening) {
        listening = true;
        g.canvas.addEventListener('pointermove', (ev) => { if (!drag) return; const c2 = cellAt(g.point(ev)); if (c2) drag.b = c2; });
        const up = () => { if (!drag) return; const d = drag; drag = null; if (!done && !g.paused) tryWord(line(d.a, d.b)); };
        g.canvas.addEventListener('pointerup', up);
        g.canvas.addEventListener('pointercancel', () => { drag = null; });
      }
    },
    pausedSub: () => `${words.length - found.length} words left · ${fmtClock(elapsed)}`,
    reset(g) {
      G = g; build(); found = []; wsHint = null; sel = null; drag = null; cursorRC = { r: 0, c: 0 }; elapsed = 0; done = false;
      colors = null;
      const b = prefs.get(`wsBest_${level()}`, 0); bestEl.textContent = b ? fmtClock(b) : '-'; timeEl.textContent = '0:00';
      showList();
      if (window.__pzTest) window.__pzTest.ws = { words, org, cs };
    },
    update(g, dt) {
      if (!done) { elapsed += dt; timeEl.textContent = fmtClock(elapsed); }
      const d = pad(g, dt); if (d) { const [dx, dy] = DXY[d]; cursorRC = { r: (cursorRC.r + dy + N) % N, c: (cursorRC.c + dx + N) % N }; }
    },
    draw(g, now) {
      const { ctx } = g;
      drawBoardBg(ctx, W, H, now, ACC(), 0);
      const o = org(), s = cs();
      ctx.fillStyle = 'rgba(255,255,255,.04)'; rr(ctx, o.x - 8, o.y - 8, s * N + 16, s * N + 16, 14); ctx.fill();
      const band = (cells, color, alpha) => {
        const a = cells[0], b = cells[cells.length - 1];
        ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineWidth = s * 0.78;
        ctx.beginPath(); ctx.moveTo(o.x + a.c * s + s / 2, o.y + a.r * s + s / 2); ctx.lineTo(o.x + b.c * s + s / 2, o.y + b.r * s + s / 2); ctx.stroke(); ctx.restore();
      };
      for (const f of found) band(f.cells, f.color, 0.42);
      if (drag) band(line(drag.a, drag.b), '#ffffff', 0.25);
      if (sel) band(line(sel.a, cursorRC), '#ffffff', 0.25);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${Math.round(s * 0.5)}px ${UI_FONT}`;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) { ctx.fillStyle = '#ececf1'; ctx.fillText(grid[r][c], o.x + c * s + s / 2, o.y + r * s + s / 2 + 1); }
      const padOn = !!(navigator.getGamepads && [...navigator.getGamepads()].some(Boolean));
      if (padOn || sel) { ctx.strokeStyle = ACC(); ctx.lineWidth = 3; rr(ctx, o.x + cursorRC.c * s + 2, o.y + cursorRC.r * s + 2, s - 4, s - 4, 8); ctx.stroke(); }
      // A hint: a pulsing ring on the first letter of a word you have not found.
      if (wsHint && now - wsHint.t < 3000) { const u = (now - wsHint.t) / 3000; ctx.save(); ctx.globalAlpha = 1 - u; ctx.strokeStyle = '#ffd257'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(o.x + wsHint.c * s + s / 2, o.y + wsHint.r * s + s / 2, s * (0.45 + 0.25 * Math.sin(u * Math.PI * 6)), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
    },
  });
}

// =====================================================================
// Vault Maze
// =====================================================================
function vaultMaze() {
  let mazeHint = null;
  // The shortest way from where you are to the flag.
  const mazePath = () => {
    const D = [[-1, 0, 1], [0, 1, 2], [1, 0, 4], [0, -1, 8]];
    const key = (r, c) => r * 1000 + c;
    const prev = new Map([[key(player.r, player.c), null]]);
    const q = [[player.r, player.c]];
    while (q.length) {
      const [r, c] = q.shift();
      if (r === rows - 1 && c === cols - 1) break;
      for (const [dr, dc, bit] of D) { if (walls[r][c] & bit) continue; const k = key(r + dr, c + dc); if (!prev.has(k)) { prev.set(k, [r, c]); q.push([r + dr, c + dc]); } }
    }
    const out = []; let at = [rows - 1, cols - 1];
    while (at) { out.unshift(at); at = prev.get(key(at[0], at[1])); }
    return out;
  };
  const W = 760, H = 760;
  let cols, rows, walls, player, trail, elapsed, level, done, gems, got, moves, glow;
  const levelEl = h('div', { class: 'gs-v' }), timeEl = h('div', { class: 'gs-v' }), gemEl = h('div', { class: 'gs-v' }), bestEl = h('div', { class: 'gs-v' });
  let G = null;
  const fog = () => prefs.get('mazeFog', false);
  const sizeFor = (lv) => Math.min(31, 7 + lv * 2);
  // walls[r][c] bits: 1 top, 2 right, 4 bottom, 8 left.
  const build = () => {
    cols = rows = sizeFor(level);
    walls = Array.from({ length: rows }, () => Array(cols).fill(15));
    const seen = Array.from({ length: rows }, () => Array(cols).fill(false));
    const stack = [[0, 0]]; seen[0][0] = true;
    const D = [[-1, 0, 1, 4], [0, 1, 2, 8], [1, 0, 4, 1], [0, -1, 8, 2]];
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const next = shuffle(D.slice()).find(([dr, dc]) => { const nr = r + dr, nc = c + dc; return nr >= 0 && nc >= 0 && nr < rows && nc < cols && !seen[nr][nc]; });
      if (!next) { stack.pop(); continue; }
      const [dr, dc, a, b] = next;
      walls[r][c] &= ~a; walls[r + dr][c + dc] &= ~b; seen[r + dr][c + dc] = true;
      stack.push([r + dr, c + dc]);
    }
    // A few extra openings on bigger mazes, so there is more than one way through.
    for (let k = 0; k < Math.floor(level * 1.5); k++) {
      const r = 1 + Math.floor(Math.random() * (rows - 2)), c = 1 + Math.floor(Math.random() * (cols - 2));
      const [dr, dc, a, b] = D[Math.floor(Math.random() * 4)];
      walls[r][c] &= ~a; walls[r + dr][c + dc] &= ~b;
    }
    // Gems to collect on the way (optional, for points).
    gems = new Set();
    while (gems.size < Math.min(12, 2 + level)) { const r = Math.floor(Math.random() * rows), c = Math.floor(Math.random() * cols); if ((r || c) && !(r === rows - 1 && c === cols - 1)) gems.add(`${r},${c}`); }
    player = { r: 0, c: 0, x: 0, y: 0 }; trail = new Set(['0,0']); moves = 0; done = false;
  };
  const cell = () => Math.floor((W - 40) / cols);
  const org = () => ({ x: (W - cell() * cols) / 2, y: (H - cell() * rows) / 2 });
  const go = (k) => {
    if (done) return;
    const bit = { up: 1, right: 2, down: 4, left: 8 }[k];
    if (walls[player.r][player.c] & bit) { Sfx.tick(0.4); return; }
    const [dx, dy] = DXY[k];
    player.r += dy; player.c += dx; moves++;
    trail.add(`${player.r},${player.c}`);
    const key = `${player.r},${player.c}`;
    if (gems.has(key)) { gems.delete(key); got++; bumpText(gemEl, String(got)); Sfx.tick(2.2); const o = org(), s = cell(); G.fx.burst(o.x + player.c * s + s / 2, o.y + player.r * s + s / 2, ['#ffd257', '#ffffff'], 14, 3, { size: 3, gravity: 0.03 }); }
    else Sfx.tick(1.1);
    if (player.r === rows - 1 && player.c === cols - 1) win();
  };
  const win = () => {
    const best = prefs.get('mazeBest', 0);
    if (level > best) prefs.set('mazeBest', level);
    bestEl.textContent = `Level ${Math.max(best, level)}`;
    done = true; Sfx.land(); glow = performance.now();
    G.fx.banner(`Level ${level} cleared`, `${fmtClock(elapsed)} · ${moves} steps`, '#3ddc84', 1400);
    level++;
    setTimeout(() => { build(); levelEl.textContent = String(level); }, 900);
  };
  const pad = padStepper(true);
  actionGame({
    title: 'Vault Maze', W, H, noCountdown: true,
    side: (g) => [
      choiceBox('Fog', [[false, 'Off'], [true, 'On']], 'mazeFog', false, g, () => {}),
      statBox([['Level', levelEl], ['Time', timeEl], ['Gems', gemEl], ['Best', bestEl]]),
      h('div', { class: 'gs-box' }, h('div', { class: 'row', style: { gap: '6px', flexWrap: 'wrap' } }, sideBtn('Show the way (+10 s)', () => { if (done) return; mazeHint = { path: mazePath(), t: performance.now() }; elapsed += 10000; Sfx.tick(1.6); }), sideBtn('New maze', () => build()), sideBtn('Back to level 1', () => g.restart()))),
      keyList(['Arrows / W A S D', 'move'], ['Hold', 'to keep going'], ['Esc / P', 'pause'], [null, 'Reach the flag in the bottom corner. Each level gets bigger. Fog only shows what is near you. Controller: stick or D-pad.']),
    ],
    keys: { ...DIR_KEYS },
    onButton: (g, k) => { if (DXY[k]) go(k); },
    onPointer: (g, e) => {
      // Click next to the player to step toward that side.
      const p = g.point(e), o = org(), s = cell();
      const dx = p.x - (o.x + player.c * s + s / 2), dy = p.y - (o.y + player.r * s + s / 2);
      if (Math.abs(dx) < s / 2 && Math.abs(dy) < s / 2) return;
      go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    },
    pausedSub: () => `Level ${level} · ${fmtClock(elapsed)}`,
    reset(g) {
      G = g; level = 1; got = 0; elapsed = 0; done = false; glow = 0; mazeHint = null;
      build();
      levelEl.textContent = '1'; gemEl.textContent = '0'; timeEl.textContent = '0:00';
      const b = prefs.get('mazeBest', 0); bestEl.textContent = b ? `Level ${b}` : '-';
      if (window.__pzTest) window.__pzTest.maze = { get walls() { return walls; }, get rows() { return rows; }, get level() { return level; }, go };
    },
    update(g, dt) {
      elapsed += dt; timeEl.textContent = fmtClock(elapsed);
      const d = pad(g, dt); if (d) go(d);
      // The dot glides between cells.
      const k = Math.min(1, dt / 70);
      player.x += (player.c - player.x) * k; player.y += (player.r - player.y) * k;
      if (Math.abs(player.c - player.x) > 2 || Math.abs(player.r - player.y) > 2) { player.x = player.c; player.y = player.r; }
    },
    draw(g, now) {
      const { ctx } = g;
      drawBoardBg(ctx, W, H, now, ACC(), 0);
      const o = org(), s = cell();
      ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(o.x, o.y, s * cols, s * rows);
      for (const t of trail) { const [r, c] = t.split(',').map(Number); ctx.fillStyle = hexA5(ACC(), 0.12); ctx.fillRect(o.x + c * s + 1, o.y + r * s + 1, s - 2, s - 2); }
      // Exit flag.
      const ex = o.x + (cols - 1) * s, ey = o.y + (rows - 1) * s;
      ctx.fillStyle = 'rgba(61,220,132,.25)'; ctx.fillRect(ex + 1, ey + 1, s - 2, s - 2);
      ctx.fillStyle = '#3ddc84'; ctx.fillRect(ex + s * 0.3, ey + s * 0.2, s * 0.07, s * 0.6);
      ctx.beginPath(); ctx.moveTo(ex + s * 0.37, ey + s * 0.2); ctx.lineTo(ex + s * 0.75, ey + s * 0.33); ctx.lineTo(ex + s * 0.37, ey + s * 0.46); ctx.fill();
      for (const gk of gems) { const [r, c] = gk.split(',').map(Number); const cx = o.x + c * s + s / 2, cy = o.y + r * s + s / 2, q = s * 0.2; ctx.fillStyle = '#ffd257'; ctx.beginPath(); ctx.moveTo(cx, cy - q); ctx.lineTo(cx + q, cy); ctx.lineTo(cx, cy + q); ctx.lineTo(cx - q, cy); ctx.fill(); }
      ctx.strokeStyle = 'rgba(255,255,255,.78)'; ctx.lineWidth = Math.max(2, s * 0.09); ctx.lineCap = 'round';
      ctx.beginPath();
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const w = walls[r][c], x = o.x + c * s, y = o.y + r * s;
        if (w & 1) { ctx.moveTo(x, y); ctx.lineTo(x + s, y); }
        if (w & 8) { ctx.moveTo(x, y); ctx.lineTo(x, y + s); }
        if (r === rows - 1 && (w & 4)) { ctx.moveTo(x, y + s); ctx.lineTo(x + s, y + s); }
        if (c === cols - 1 && (w & 2)) { ctx.moveTo(x + s, y); ctx.lineTo(x + s, y + s); }
      }
      ctx.stroke();
      // The way out, for three seconds after asking.
      if (mazeHint && now - mazeHint.t < 3000) {
        ctx.save(); ctx.globalAlpha = 1 - (now - mazeHint.t) / 3000; ctx.strokeStyle = '#ffd257'; ctx.lineWidth = Math.max(3, s * 0.18); ctx.lineJoin = 'round'; ctx.setLineDash([s * 0.3, s * 0.25]);
        ctx.beginPath(); mazeHint.path.forEach(([r, c], i) => { const x = o.x + c * s + s / 2, y = o.y + r * s + s / 2; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }); ctx.stroke(); ctx.restore();
      }
      const px = o.x + player.x * s + s / 2, py = o.y + player.y * s + s / 2;
      if (fog()) {
        const rad = s * 3.2;
        const gr = ctx.createRadialGradient(px, py, rad * 0.4, px, py, rad);
        gr.addColorStop(0, 'rgba(8,8,10,0)'); gr.addColorStop(1, 'rgba(8,8,10,.97)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      }
      ctx.shadowColor = ACC(); ctx.shadowBlur = 18; ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(px, py, s * 0.3, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = ACC(); ctx.beginPath(); ctx.arc(px, py, s * 0.16, 0, Math.PI * 2); ctx.fill();
    },
  });
}

Object.assign(GAMES3, { crossword: vaultCrossword, sudoku: vaultSudoku, wordsearch: vaultWordSearch, maze: vaultMaze });

// Arcade tile pictures.
function drawPreview5(g, x, acc) {
  x.textAlign = 'center'; x.textBaseline = 'middle';
  if (g === 'crossword') {
    const pat = ['.###..', '.#..#.', '######', '.#..#.', '.####.'];
    pat.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '#') { x.fillStyle = r === 2 && c < 4 ? '#ffe9a8' : '#f2f2f5'; x.fillRect(96 + c * 30, 34 + r * 30, 28, 28); } }));
    x.fillStyle = '#111'; x.font = '800 16px Segoe UI'; [...'CLUE'].forEach((ch, i) => x.fillText(ch, 110 + i * 30, 109));
    x.fillStyle = acc; x.fillRect(96, 94, 28, 28); x.fillStyle = '#111'; x.fillText('C', 110, 109);
  } else if (g === 'sudoku') {
    for (let i = 0; i <= 9; i++) { x.strokeStyle = i % 3 ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.7)'; x.lineWidth = i % 3 ? 1 : 2; x.beginPath(); x.moveTo(110 + i * 16, 28); x.lineTo(110 + i * 16, 172); x.moveTo(110, 28 + i * 16); x.lineTo(254, 28 + i * 16); x.stroke(); }
    x.font = '700 11px Segoe UI'; const d = '5 3 7 6 1 9 8 6 4 8 3 2 7 6 1';
    d.split(' ').forEach((n, i) => { x.fillStyle = i % 4 ? '#f2f2f5' : acc; x.fillText(n, 118 + ((i * 4) % 9) * 16, 36 + ((i * 2) % 9) * 16); });
  } else if (g === 'wordsearch') {
    const L = 'QZPIXELRAKBOSSMTLOOTEARCADEYQUESTN';
    x.font = '700 13px Segoe UI';
    for (let r = 0; r < 6; r++) for (let c = 0; c < 9; c++) { x.fillStyle = '#d8d8de'; x.fillText(L[(r * 9 + c) % L.length], 82 + c * 24, 40 + r * 24); }
    x.globalAlpha = 0.45; x.strokeStyle = acc; x.lineWidth = 18; x.lineCap = 'round'; x.beginPath(); x.moveTo(130, 40); x.lineTo(226, 40); x.stroke();
    x.strokeStyle = '#3ddc84'; x.beginPath(); x.moveTo(82, 64); x.lineTo(154, 136); x.stroke(); x.globalAlpha = 1;
  } else if (g === 'maze') {
    x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 3; x.lineCap = 'round';
    const segs = [[100, 30, 260, 30], [100, 30, 100, 190], [100, 190, 260, 190], [260, 30, 260, 160], [130, 30, 130, 100], [130, 130, 230, 130], [160, 60, 230, 60], [230, 60, 230, 100], [160, 60, 160, 160], [190, 90, 190, 190], [130, 160, 160, 160]];
    x.beginPath(); for (const [a, b, c, d] of segs) { x.moveTo(a, b); x.lineTo(c, d); } x.stroke();
    x.shadowColor = acc; x.shadowBlur = 12; x.fillStyle = '#fff'; x.beginPath(); x.arc(115, 45, 8, 0, 7); x.fill(); x.shadowBlur = 0;
    x.fillStyle = '#3ddc84'; x.fillRect(240, 165, 4, 20); x.beginPath(); x.moveTo(244, 165); x.lineTo(256, 170); x.lineTo(244, 175); x.fill();
  }
  x.textBaseline = 'alphabetic';
}
