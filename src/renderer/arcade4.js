/* global GAMES3, prefs, Sfx, actionGame, statBox, keyList, drawBoardBg, ACC, h, WORDS_A, WORDS_V, padStepper, rr */
// Vault Words: guess the five letter word in six tries. A daily word (the same all day) and free play.
// Green: right letter, right spot. Gold: in the word, wrong spot. Grey: not in the word.

function vaultWords() {
  const W = 560, H = 790, TS = 80, TG = 10, BX = (W - (5 * TS + 4 * TG)) / 2, BY = 18;
  const KY = 590, KH = 56, KG = 7;
  const ROWS = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
  const C = { hit: '#2fbf71', near: '#e0a92e', miss: '#34343c', empty: 'rgba(255,255,255,.04)', line: 'rgba(255,255,255,.16)' };
  let mode = prefs.get('wordsMode', 'daily');
  let answer, guesses, marks, cur, done, won, reveal, shake, toast, keyCur, keyState, pop;
  const streakEl = h('div', { class: 'gs-v' }), winEl = h('div', { class: 'gs-v' }), playedEl = h('div', { class: 'gs-v' }), modeEl = h('div', { class: 'gs-v' });
  const distBox = h('div', { class: 'gs-box wd-dist' });

  // ---------- the daily word ----------
  const dayNo = () => { const d = new Date(); return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 86400000); };
  const dailyWord = (n) => {
    // A fixed shuffle of the list, so every day has its own word and none repeats for a long while.
    let s = 0x9e3779b9;
    const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
    const order = WORDS_A.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    return WORDS_A[order[((n % order.length) + order.length) % order.length]];
  };

  // ---------- scoring a guess (handles repeated letters) ----------
  const score = (guess, ans) => {
    const out = Array(5).fill('miss');
    const left = {};
    for (let i = 0; i < 5; i++) { if (guess[i] === ans[i]) out[i] = 'hit'; else left[ans[i]] = (left[ans[i]] || 0) + 1; }
    for (let i = 0; i < 5; i++) if (out[i] !== 'hit' && left[guess[i]]) { out[i] = 'near'; left[guess[i]]--; }
    return out;
  };
  const RANK = { miss: 1, near: 2, hit: 3 };
  const rebuildKeys = () => {
    keyState = {};
    guesses.forEach((g, r) => { if (reveal && reveal.row === r) return; for (let i = 0; i < 5; i++) { const k = g[i], m = marks[r][i]; if (!keyState[k] || RANK[m] > RANK[keyState[k]]) keyState[k] = m; } });
  };

  // ---------- stats ----------
  const stats = () => prefs.get('wordsStats', { played: 0, wins: 0, streak: 0, bestStreak: 0, dist: [0, 0, 0, 0, 0, 0], lastDaily: -1 });
  const showStats = () => {
    const s = stats();
    streakEl.textContent = `${s.streak} (best ${s.bestStreak})`;
    winEl.textContent = s.played ? `${Math.round((s.wins / s.played) * 100)}%` : '-';
    playedEl.textContent = String(s.played);
    modeEl.textContent = mode === 'daily' ? `Daily #${dayNo() + 1}` : 'Free play';
    const max = Math.max(1, ...s.dist);
    distBox.replaceChildren(h('div', { class: 'gs-l' }, 'Wins by guesses'), ...s.dist.map((n, i) => h('div', { class: 'wd-bar' }, h('span', {}, String(i + 1)), h('i', { style: `width:${Math.max(8, (n / max) * 100)}%` }, String(n)))));
  };
  const record = (win, tries) => {
    const s = stats();
    s.played++;
    if (win) { s.wins++; s.streak++; s.bestStreak = Math.max(s.bestStreak, s.streak); s.dist[tries - 1]++; } else s.streak = 0;
    prefs.set('wordsStats', s);
    showStats();
  };

  // ---------- saving the daily game, so it stays done for the day ----------
  const saveDaily = () => { if (mode === 'daily') prefs.set('wordsDaily', { day: dayNo(), guesses, done, won }); };

  const say = (text, ms = 1400) => { toast = { text, t: performance.now(), ms }; };
  const finish = (g) => {
    done = true;
    const tries = guesses.length;
    const wasDaily = mode === 'daily';
    record(won, tries);
    saveDaily();
    if (won) {
      Sfx.land();
      g.fx.burst(W / 2, BY + (tries - 1) * (TS + TG) + TS / 2, ['#2fbf71', '#ffffff', '#ffd257'], 50, 6, { size: 5, gravity: 0.06 });
      say(['Genius', 'Brilliant', 'Great', 'Nice', 'Good', 'Phew'][tries - 1], 2200);
    } else say(answer.toUpperCase(), 4000);
    // After the daily word, Play again starts a free play round.
    if (wasDaily) { mode = 'free'; prefs.set('wordsMode', 'free'); }
    setTimeout(() => g.gameOver(won ? `Solved in ${tries}` : 'Out of guesses', `${wasDaily ? `Daily #${dayNo() + 1} · ` : ''}The word was ${answer.toUpperCase()} · streak ${stats().streak}${wasDaily ? ' · a new daily word at midnight' : ''}`), 1200);
  };

  const submit = (g) => {
    if (done || reveal) return;
    if (cur.length < 5) { shake = performance.now(); say('Not enough letters'); Sfx.tick(0.6); return; }
    if (!WORDS_V.has(cur)) { shake = performance.now(); say('Not in the word list'); Sfx.tick(0.6); return; }
    guesses.push(cur); marks.push(score(cur, answer));
    reveal = { row: guesses.length - 1, t: performance.now() };
    cur = '';
    saveDaily();
  };
  const type = (ch) => { if (done || reveal || cur.length >= 5) return; cur += ch; pop = { i: cur.length - 1, t: performance.now() }; Sfx.tick(1.4); };
  const back = () => { if (done || reveal || !cur) return; cur = cur.slice(0, -1); Sfx.tick(0.9); };

  const startMode = (g, m) => { mode = m; prefs.set('wordsMode', m); g.restart(); };

  const reset = (g) => {
    guesses = []; marks = []; cur = ''; done = false; won = false; reveal = null; shake = 0; toast = null; pop = null;
    keyCur = keyCur || { r: 0, c: 0 };
    if (mode === 'daily') {
      answer = dailyWord(dayNo());
      const saved = prefs.get('wordsDaily', null);
      if (saved && saved.day === dayNo()) {
        guesses = saved.guesses || []; marks = guesses.map((x) => score(x, answer)); done = !!saved.done; won = !!saved.won;
        if (done) setTimeout(() => { say(won ? 'Done for today' : answer.toUpperCase(), 3000); mode = 'free'; prefs.set('wordsMode', 'free'); g.gameOver(won ? `Solved in ${guesses.length}` : 'Out of guesses', `You already played today's word (${answer.toUpperCase()}). Play again for free play, or come back after midnight.`); }, 50);
      }
    } else {
      let w;
      do w = WORDS_A[Math.floor(Math.random() * WORDS_A.length)]; while (w === answer);
      answer = w;
    }
    rebuildKeys();
    showStats();
  };

  // ---------- the on screen keyboard ----------
  const keyRects = [];
  ROWS.forEach((row, r) => {
    const units = [...row].reduce((a, k) => a + (k === '+' || k === '-' ? 1.5 : 1), 0);
    const kw = (W - 20 - (row.length - 1) * KG) / (r === 1 ? 10 : units);
    let x = r === 1 ? 10 + (kw + KG) / 2 : 10;
    [...row].forEach((k, c) => { const w = k === '+' || k === '-' ? kw * 1.5 : kw; keyRects.push({ k, r, c, x, y: KY + r * (KH + KG), w, h: KH }); x += w + KG; });
  });
  const keyAt = (r, c) => keyRects.find((k) => k.r === r && k.c === c);
  const pressKey = (g, k) => { if (k === '+') submit(g); else if (k === '-') back(); else type(k); };

  const keys = { Enter: 'enter', Backspace: 'back' };
  for (const ch of 'abcdefghijklmnopqrstuvwxyz') keys[ch] = `L:${ch}`;
  const step = padStepper(true);

  actionGame({
    title: 'Vault Words', W, H, noCountdown: true,
    side: (g) => [
      h('div', { class: 'gs-box' }, h('div', { class: 'gs-l' }, 'Mode'), modeEl,
        h('div', { class: 'row', style: { gap: '6px', marginTop: '8px' } },
          h('button', { class: 'btn', style: { flex: 1 }, onclick: (e) => { e.currentTarget.blur(); startMode(g, 'daily'); } }, 'Daily'),
          h('button', { class: 'btn', style: { flex: 1 }, onclick: (e) => { e.currentTarget.blur(); startMode(g, 'free'); } }, 'Free play'))),
      statBox([['Streak', streakEl], ['Wins', winEl], ['Played', playedEl]]),
      distBox,
      keyList(['Type', 'letters'], ['Enter', 'guess'], ['Backspace', 'delete'], ['Esc', 'pause'], [null, 'Green: right spot. Gold: in the word, wrong spot. Grey: not in the word. Controller: stick picks a key, A presses it, B deletes, X guesses.']),
    ],
    keys,
    onButton: (g, k) => {
      if (k.startsWith('L:')) type(k.slice(2));
      else if (k === 'enter' || k === 'x') submit(g);
      else if (k === 'back' || k === 'b') back();
      else if (k === 'a') { const kr = keyAt(keyCur.r, keyCur.c); if (kr) pressKey(g, kr.k); }
    },
    onPointer: (g, e) => { const p = g.point(e); const kr = keyRects.find((k) => p.x >= k.x && p.x <= k.x + k.w && p.y >= k.y && p.y <= k.y + k.h); if (kr) { keyCur = { r: kr.r, c: kr.c }; pressKey(g, kr.k); } },
    pausedSub: () => `${mode === 'daily' ? 'Daily word' : 'Free play'} · guess ${Math.min(6, guesses.length + 1)} of 6`,
    reset,
    update(g, dt) {
      const d = step(g, dt);
      if (d) {
        if (d === 'left' || d === 'right') { const n = ROWS[keyCur.r].length; keyCur.c = (keyCur.c + (d === 'left' ? n - 1 : 1)) % n; }
        else { keyCur.r = (keyCur.r + (d === 'up' ? 2 : 1)) % 3; keyCur.c = Math.min(keyCur.c, ROWS[keyCur.r].length - 1); }
      }
      // The flip of a guessed row ends: score it.
      if (reveal && performance.now() - reveal.t > 5 * 260 + 320) {
        const row = reveal.row;
        reveal = null;
        rebuildKeys();
        if (guesses[row] === answer) { won = true; finish(g); } else if (guesses.length >= 6) finish(g);
      }
    },
    draw(g, now) {
      const { ctx } = g;
      drawBoardBg(ctx, W, H, now, ACC(), 0);
      const sx = shake && now - shake < 400 ? Math.sin((now - shake) / 22) * 9 * (1 - (now - shake) / 400) : 0;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let r = 0; r < 6; r++) {
        const word = r < guesses.length ? guesses[r] : r === guesses.length ? cur : '';
        const rowX = r === guesses.length ? sx : 0;
        for (let i = 0; i < 5; i++) {
          const x = BX + i * (TS + TG) + rowX, y = BY + r * (TS + TG);
          const ch = word[i] || '';
          let m = r < guesses.length ? marks[r][i] : null;
          let sy = 1;
          if (reveal && reveal.row === r) {
            const u = (now - reveal.t - i * 260) / 320;
            if (u < 0) m = null; else if (u < 1) { sy = Math.abs(Math.cos(u * Math.PI)) || 0.02; if (u < 0.5) m = null; }
          }
          // A little bounce on the winning row.
          let by = 0;
          if (won && r === guesses.length - 1 && !reveal) { const u = (now - (toast ? toast.t : now) - i * 90) / 380; if (u > 0 && u < 1) by = -Math.sin(u * Math.PI) * 18; }
          const sc = pop && r === guesses.length && i === pop.i && now - pop.t < 120 ? 1.08 : 1;
          ctx.save(); ctx.translate(x + TS / 2, y + TS / 2 + by); ctx.scale(sc, sy * sc);
          if (m) { ctx.fillStyle = C[m]; rr(ctx, -TS / 2, -TS / 2, TS, TS, 8); ctx.fill(); }
          else { ctx.fillStyle = C.empty; rr(ctx, -TS / 2, -TS / 2, TS, TS, 8); ctx.fill(); ctx.strokeStyle = ch ? 'rgba(255,255,255,.45)' : C.line; ctx.lineWidth = 2; rr(ctx, -TS / 2 + 1, -TS / 2 + 1, TS - 2, TS - 2, 8); ctx.stroke(); }
          if (ch) { ctx.fillStyle = '#fff'; ctx.font = "800 40px 'Segoe UI Variable Display', 'Segoe UI', system-ui"; ctx.fillText(ch.toUpperCase(), 0, 2); }
          ctx.restore();
        }
      }
      // Keyboard (the picked key is only marked when a controller is plugged in)
      const padOn = !!(navigator.getGamepads && [...navigator.getGamepads()].some(Boolean));
      for (const kr of keyRects) {
        const st = keyState[kr.k];
        const sel = keyCur.r === kr.r && keyCur.c === kr.c;
        ctx.fillStyle = st === 'miss' ? '#1e1e22' : st ? C[st] : '#4a4a54';
        rr(ctx, kr.x, kr.y, kr.w, kr.h, 7); ctx.fill();
        if (sel && padOn) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.shadowColor = ACC(); ctx.shadowBlur = 12; rr(ctx, kr.x - 2, kr.y - 2, kr.w + 4, kr.h + 4, 9); ctx.stroke(); ctx.shadowBlur = 0; }
        ctx.fillStyle = st === 'miss' ? '#6c6c75' : '#fff';
        ctx.font = kr.k === '+' || kr.k === '-' ? "700 15px 'Segoe UI', system-ui" : "700 21px 'Segoe UI', system-ui";
        ctx.fillText(kr.k === '+' ? 'ENTER' : kr.k === '-' ? '⌫' : kr.k.toUpperCase(), kr.x + kr.w / 2, kr.y + kr.h / 2 + 1);
      }
      // Messages
      if (toast && now - toast.t < toast.ms) {
        const a = Math.min(1, (toast.ms - (now - toast.t)) / 250);
        ctx.save(); ctx.globalAlpha = a; ctx.font = "800 18px 'Segoe UI', system-ui";
        const tw = ctx.measureText(toast.text).width + 36;
        ctx.fillStyle = '#f4f4f6'; rr(ctx, W / 2 - tw / 2, BY + 2 * (TS + TG) + 20, tw, 44, 10); ctx.fill();
        ctx.fillStyle = '#111114'; ctx.fillText(toast.text, W / 2, BY + 2 * (TS + TG) + 43); ctx.restore();
      }
    },
  });
}

// The Arcade tile picture.
function drawPreviewWords(x, acc) {
  const rows = [['c', 'r', 'a', 'n', 'e'], ['s', 'l', 'a', 't', 'e'], ['v', 'a', 'u', 'l', 't']];
  const cols = [['miss', 'miss', 'hit', 'miss', 'miss'], ['miss', 'near', 'hit', 'near', 'miss'], ['hit', 'hit', 'hit', 'hit', 'hit']];
  const C = { hit: '#2fbf71', near: '#e0a92e', miss: '#34343c' };
  rows.forEach((row, r) => row.forEach((ch, i) => {
    x.fillStyle = C[cols[r][i]]; x.beginPath(); x.roundRect(95 + i * 36, 34 + r * 52, 32, 44, 6); x.fill();
    x.fillStyle = '#fff'; x.font = '800 18px Segoe UI'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch.toUpperCase(), 111 + i * 36, 57 + r * 52);
  }));
  x.textBaseline = 'alphabetic';
  x.strokeStyle = acc; x.lineWidth = 2; x.beginPath(); x.roundRect(91, 134, 180, 52, 8); x.stroke();
}

GAMES3.words = vaultWords;
