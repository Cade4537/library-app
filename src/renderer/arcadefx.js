// Shared Arcade effects: particles, screen shake, flashes, floating text and banners,
// plus the animated board background. One small object per game, cleared when it closes.

function makeFx() {
  const parts = [];
  const texts = [];
  let shakeAmt = 0;
  let flashA = 0;
  let flashColor = '#ffffff';
  return {
    // A burst of sparks. Capped so a busy moment never slows the game down.
    burst(x, y, color, n = 16, speed = 3.2, opts = {}) {
      const room = Math.max(0, 500 - parts.length);
      for (let i = 0; i < Math.min(n, room); i++) {
        const a = opts.angle != null ? opts.angle + (Math.random() - 0.5) * (opts.spread || 1.2) : Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.9);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opts.lift || 0), life: 1, decay: 0.012 + Math.random() * 0.02, size: (opts.size || 3) * (0.6 + Math.random() * 0.8), color: Array.isArray(color) ? color[i % color.length] : color, g: opts.gravity == null ? 0.12 : opts.gravity, sq: Math.random() < 0.5, rot: Math.random() * 6 });
      }
    },
    text(x, y, str, color = '#ffffff', size = 22, life = 900) { if (texts.length < 30) texts.push({ x, y, str, color, size, t0: performance.now(), life, big: false }); },
    banner(str, sub, color = '#ffffff', life = 1300) { for (let i = texts.length - 1; i >= 0; i--) if (texts[i].big) texts.splice(i, 1); texts.push({ str, sub, color, t0: performance.now(), life, big: true }); },
    shake(a) { shakeAmt = Math.max(shakeAmt, a); },
    flash(color = '#ffffff', a = 0.35) { flashColor = color; flashA = Math.max(flashA, a); },
    clear() { parts.length = 0; texts.length = 0; shakeAmt = 0; flashA = 0; },
    update(dt) {
      const k = dt / 16.7;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.vx *= 0.985; p.vy = p.vy * 0.985 + p.g * k; p.x += p.vx * k; p.y += p.vy * k; p.rot += 0.15 * k; p.life -= p.decay * k;
        if (p.life <= 0) parts.splice(i, 1);
      }
      shakeAmt *= Math.pow(0.86, k); if (shakeAmt < 0.2) shakeAmt = 0;
      flashA *= Math.pow(0.88, k); if (flashA < 0.01) flashA = 0;
    },
    // Wrap the game's drawing: fx.begin(ctx) ... draw ... fx.end(ctx, W, H)
    begin(ctx) { ctx.save(); if (shakeAmt) ctx.translate((Math.random() - 0.5) * shakeAmt * 2, (Math.random() - 0.5) * shakeAmt * 2); },
    end(ctx, W, H) {
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        if (p.sq) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size / 2, 0, 7); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
      const now = performance.now();
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i];
        const u = (now - t.t0) / t.life;
        if (u >= 1) { texts.splice(i, 1); continue; }
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        if (t.big) {
          const pop = u < 0.15 ? 0.6 + (u / 0.15) * 0.5 : u < 0.25 ? 1.1 - ((u - 0.15) / 0.1) * 0.1 : 1;
          const a = u > 0.75 ? 1 - (u - 0.75) / 0.25 : 1;
          ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H * 0.42); ctx.scale(pop, pop);
          ctx.font = `900 ${Math.round(W / 11)}px 'Segoe UI Variable Display', 'Segoe UI', system-ui`;
          ctx.shadowColor = t.color; ctx.shadowBlur = 30; ctx.fillStyle = t.color; ctx.fillText(t.str, 0, 0);
          ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; ctx.globalAlpha = a * 0.9; ctx.fillText(t.str, 0, 0);
          if (t.sub) { ctx.font = `700 ${Math.round(W / 34)}px 'Segoe UI', system-ui`; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText(t.sub, 0, W / 14); }
          ctx.restore();
        } else {
          ctx.globalAlpha = 1 - u; ctx.fillStyle = t.color; ctx.font = `800 ${t.size}px 'Segoe UI', system-ui`;
          ctx.fillText(t.str, t.x, t.y - u * 40);
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
      if (flashA) { ctx.globalAlpha = flashA; ctx.fillStyle = flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    },
  };
}

// The board background: deep black with a slow crimson glow and a faint grid.
function drawBoardBg(ctx, W, H, now, accent, grid = 40) {
  ctx.fillStyle = '#08080a'; ctx.fillRect(0, 0, W, H);
  const gx = W * (0.5 + Math.sin(now / 5200) * 0.25), gy = H * (0.35 + Math.cos(now / 6100) * 0.2);
  const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.7);
  g.addColorStop(0, hexA(accent, 0.13)); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (grid) {
    ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = grid; x < W; x += grid) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
    for (let y = grid; y < H; y += grid) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
  }
}
function hexA(hex, a) {
  const m = String(hex).trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return `rgba(225,29,46,${a})`;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}

// A side panel number that pops when it changes.
function bumpText(el, text) {
  if (el.textContent === text) return;
  el.textContent = text;
  el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
}
