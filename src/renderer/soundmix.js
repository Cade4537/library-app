/* global api, S, h, icon, prefs, openModal, showToast */
// 0.18.1: SteelSeries Sonar mixer. Volume and mute for each Sonar channel (Master, Game, Chat, Media,
// Aux, Mic), the chat mix dial, and Classic or Streamer mode. Changes made in GG show up here too.

const SM = { st: null, timer: 0, busy: 0, mix: 'monitoring', send: new Map() };
const SM_COLORS = { master: '#ffffff', game: '#ff4d6d', chat: '#3ddc84', media: '#4fa3ff', aux: '#ffb02e', mic: '#a78bfa' };
const SM_ICONS = { master: 'volume', game: 'gamepad', chat: 'chat', media: 'music', aux: 'sliders', mic: 'mic' };

function openSoundMixer() {
  if (document.querySelector('.sm-modal')) return;
  const body = h('div', { class: 'sm' }, h('div', { class: 'sm-msg' }, h('div', { class: 'spinner' }), 'Connecting to Sonar'));
  const close = openModal({ title: '', cls: 'sm-modal', body, actions: [{ label: 'Open SteelSeries GG', left: true, run: () => { api.openUrl('steelseries-gg://'); return false; } }, { label: 'Done', primary: true }] });
  const load = async () => {
    if (!document.body.contains(body)) { clearInterval(SM.timer); return; }
    // Do not redraw under a finger that is still moving a slider.
    if (Date.now() - SM.busy < 1500) return;
    const r = await api.sonarState().catch((e) => ({ ok: false, error: e.message }));
    if (!document.body.contains(body) || Date.now() - SM.busy < 1500) return;
    SM.st = r;
    smDraw(body);
  };
  clearInterval(SM.timer);
  SM.timer = setInterval(load, 2000);
  load();
  return close;
}

function smDraw(body) {
  const r = SM.st;
  if (!r || !r.ok) {
    const code = r && r.code;
    body.replaceChildren(h('div', { class: 'sm-msg' },
      icon('headphones'),
      h('b', {}, code === 'nogg' ? 'SteelSeries GG is not installed' : code === 'ggoff' ? 'SteelSeries GG is not running' : code === 'sonaroff' ? 'Sonar is turned off' : 'Sonar is not reachable'),
      h('span', {}, (r && r.error) || 'Open SteelSeries GG and turn on Sonar.'),
      code === 'nogg' ? h('button', { class: 'btn', onclick: () => api.openExternal('https://steelseries.com/gg') }, 'Get SteelSeries GG') : null));
    return;
  }
  const stream = r.mode === 'stream';
  const mixKeys = stream ? Object.keys(r.mixes || {}) : [];
  if (stream && !mixKeys.includes(SM.mix)) SM.mix = mixKeys[0] || 'monitoring';
  const val = (c) => (stream ? (c.mixes && c.mixes[SM.mix]) : c.classic) || { volume: 0, muted: false };
  const strip = (c) => {
    const v = val(c);
    const pct = Math.round(v.volume * 100);
    const num = h('b', { class: 'sm-pct' }, `${pct}`);
    const range = h('input', { type: 'range', min: 0, max: 100, step: 1, value: pct, class: 'sm-range', 'aria-label': `${c.label} volume`, style: `--c:${SM_COLORS[c.id]};--v:${pct}%` });
    range.addEventListener('keydown', (e) => e.stopPropagation());
    range.addEventListener('input', () => {
      SM.busy = Date.now();
      num.textContent = range.value;
      range.style.setProperty('--v', `${range.value}%`);
      smQueue(`v:${c.id}`, () => api.sonarVolume(c.id, Number(range.value) / 100, SM.mix, r.mode));
    });
    const mute = h('button', { class: 'sm-mute' + (v.muted ? ' on' : ''), title: v.muted ? 'Unmute' : 'Mute', onclick: async () => {
      SM.busy = Date.now();
      const next = !mute.classList.contains('on');
      mute.classList.toggle('on', next);
      mute.replaceChildren(icon(next ? (c.id === 'mic' ? 'micOff' : 'volumeOff') : SM_ICONS[c.id]));
      col.classList.toggle('muted', next);
      const res = await api.sonarMute(c.id, next, SM.mix, r.mode);
      if (!res.ok) showToast(res.error || 'Sonar did not take that', 'error');
    } }, icon(v.muted ? (c.id === 'mic' ? 'micOff' : 'volumeOff') : SM_ICONS[c.id]));
    const col = h('div', { class: `sm-ch sm-${c.id}${v.muted ? ' muted' : ''}`, style: `--c:${SM_COLORS[c.id]}` },
      num, h('div', { class: 'sm-track' }, range), mute, h('span', { class: 'sm-name' }, c.label));
    return col;
  };
  const chat = r.chatMix;
  let chatEl = null;
  if (chat) {
    const knob = h('input', { type: 'range', min: -100, max: 100, step: 1, value: Math.round(chat.balance * 100), class: 'sm-chatmix', 'aria-label': 'Chat mix' });
    knob.addEventListener('keydown', (e) => e.stopPropagation());
    const label = h('span', { class: 'sm-cm-v' }, smChatLabel(chat.balance));
    knob.addEventListener('input', () => { SM.busy = Date.now(); label.textContent = smChatLabel(knob.value / 100); smQueue('chatmix', () => api.sonarChatMix(Number(knob.value) / 100)); });
    knob.addEventListener('dblclick', () => { knob.value = 0; knob.dispatchEvent(new Event('input')); });
    chatEl = h('div', { class: 'sm-cm' }, h('span', {}, icon('gamepad'), 'Game'), h('div', { class: 'sm-cm-mid' }, knob, label), h('span', {}, 'Chat', icon('chat')));
  }
  const modeSeg = h('div', { class: 'seg' }, [['classic', 'Classic'], ['stream', 'Streamer']].map(([k, n]) => h('button', { class: r.mode === k ? 'on' : '', onclick: async () => {
    if (r.mode === k) return;
    const res = await api.sonarMode(k);
    if (!res.ok) { showToast(res.error || 'Could not switch mode', 'error'); return; }
    showToast(k === 'stream' ? 'Sonar: Streamer mode' : 'Sonar: Classic mode');
    SM.busy = 0; SM.st = await api.sonarState(); smDraw(body);
  } }, n)));
  const mixSeg = stream && mixKeys.length > 1 ? h('div', { class: 'seg' }, mixKeys.map((k) => h('button', { class: SM.mix === k ? 'on' : '', onclick: () => { SM.mix = k; smDraw(body); } }, (r.mixes || {})[k] || k))) : null;
  body.replaceChildren(
    h('div', { class: 'sm-head' }, h('div', { class: 'sm-title' }, icon('headphones'), h('b', {}, 'Sound'), h('span', {}, 'SteelSeries Sonar')), h('div', { class: 'sm-modes' }, mixSeg, modeSeg)),
    h('div', { class: 'sm-strips' }, r.channels.map(strip)),
    chatEl,
    h('div', { class: 'help sm-foot' }, 'Changes go straight to Sonar. Double click the chat mix to center it.'));
}
const smChatLabel = (b) => (Math.abs(b) < 0.05 ? 'Balanced' : b < 0 ? `${Math.round(-b * 100)}% game` : `${Math.round(b * 100)}% chat`);

// Slider moves are sent at most every 70 ms, and the last value always arrives.
function smQueue(key, fn) {
  const q = SM.send.get(key) || {};
  q.fn = fn;
  if (q.t) { SM.send.set(key, q); return; }
  q.t = setTimeout(async () => {
    const cur = SM.send.get(key); SM.send.delete(key);
    const res = await cur.fn().catch(() => null);
    if (res && !res.ok) showToast(res.error || 'Sonar did not answer', 'error');
  }, 70);
  SM.send.set(key, q);
}

document.addEventListener('DOMContentLoaded', () => {
  // The palette (Ctrl+K) can open it too.
  const prev = window.plusPalActions;
  window.plusPalActions = () => [...(prev ? prev() : []), { label: 'Sound mixer (SteelSeries Sonar)', hint: 'Sound', ic: 'headphones', run: () => openSoundMixer() }];
});
