// 0.18.1: SteelSeries Sonar. Sonar (part of SteelSeries GG) runs a small control server on this PC.
// GG writes where to find it into coreProps.json; GG's own server then tells us Sonar's address.
// Everything stays on this computer (127.0.0.1). Sonar's control routes are not officially documented;
// these are the ones used by the open source SteelSeries-NET-API and steelseries-sonar-py projects.
const fs = require('fs');
const path = require('path');
const https = require('https');

const CORE_PROPS = [
  path.join(process.env.ProgramData || 'C:\\ProgramData', 'SteelSeries', 'GG', 'coreProps.json'),
  path.join(process.env.ProgramData || 'C:\\ProgramData', 'SteelSeries', 'SteelSeries Engine 3', 'coreProps.json'),
];
// Our name, Sonar's name in its data, and Sonar's name in its control routes.
const CHANNELS = [
  { id: 'master', json: 'masters', route: 'Master', label: 'Master' },
  { id: 'game', json: 'game', route: 'game', label: 'Game' },
  { id: 'chat', json: 'chatRender', route: 'chatRender', label: 'Chat' },
  { id: 'media', json: 'media', route: 'media', label: 'Media' },
  { id: 'aux', json: 'aux', route: 'aux', label: 'Aux' },
  { id: 'mic', json: 'chatCapture', route: 'chatCapture', label: 'Mic' },
];
const MIXES = { monitoring: 'Your mix', streaming: 'Stream mix' };
const LOOPBACK = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

// GG's server uses a certificate it makes itself, so it is only trusted here, for this computer only.
function ggGet(hostPort, p) {
  return new Promise((resolve, reject) => {
    const [host, port] = hostPort.split(':');
    const req = https.request({ host, port: Number(port) || 443, path: p, method: 'GET', rejectUnauthorized: false, timeout: 4000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { body += d; if (body.length > 2e6) req.destroy(); });
      res.on('end', () => { if (res.statusCode !== 200) return reject(new Error(`GG answered ${res.statusCode}`)); try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    });
    req.on('timeout', () => req.destroy(new Error('GG did not answer')));
    req.on('error', reject);
    req.end();
  });
}

class Sonar {
  constructor() {
    this.base = '';
    this.found = 0;
  }

  // Sonar's address changes every time GG starts, so it is looked up again when a call fails.
  async discover(force) {
    if (!force && this.base && Date.now() - this.found < 5 * 60 * 1000) return this.base;
    if (process.platform !== 'win32') throw new Error('Sonar only runs on Windows.');
    const file = CORE_PROPS.find((f) => fs.existsSync(f));
    if (!file) throw Object.assign(new Error('SteelSeries GG is not installed (or has never been opened).'), { code: 'nogg' });
    let props;
    try { props = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw new Error('Could not read SteelSeries GG settings.'); }
    const gg = String(props.ggEncryptedAddress || '');
    if (!LOOPBACK.test(gg)) throw new Error('SteelSeries GG address looks wrong. Restart GG.');
    let apps;
    try { apps = await ggGet(gg, '/subApps'); } catch { throw Object.assign(new Error('SteelSeries GG is not running. Open GG and try again.'), { code: 'ggoff' }); }
    const s = apps && apps.subApps && apps.subApps.sonar;
    if (!s) throw new Error('Sonar was not found in SteelSeries GG.');
    if (s.isEnabled === false) throw Object.assign(new Error('Sonar is turned off in SteelSeries GG. Turn it on in GG, Sonar.'), { code: 'sonaroff' });
    const addr = s.metadata && s.metadata.webServerAddress;
    if (!s.isRunning || !addr) throw Object.assign(new Error('Sonar is starting up. Try again in a moment.'), { code: 'starting' });
    let u;
    try { u = new URL(addr); } catch { throw new Error('Sonar gave an address that could not be used.'); }
    if (!LOOPBACK.test(u.host) || u.protocol !== 'http:') throw new Error('Sonar is not on this computer.');
    this.base = `${u.protocol}//${u.host}`;
    this.found = Date.now();
    return this.base;
  }

  async call(method, route, retry = true) {
    const base = await this.discover();
    let res;
    try {
      res = await fetch(`${base}/${route}`, { method, headers: method === 'PUT' ? { 'Content-Length': '0' } : {}, signal: AbortSignal.timeout(4000) });
    } catch (e) {
      // GG restarted (new address): look it up again once.
      if (retry) { this.base = ''; await this.discover(true); return this.call(method, route, false); }
      throw new Error('Sonar did not answer.');
    }
    if (res.status === 404 && retry && route === 'v1/chatMix') return this.call(method, 'chatMix', false);
    if (!res.ok) throw new Error(`Sonar answered ${res.status}`);
    const text = await res.text();
    try { return text ? JSON.parse(text) : null; } catch { return text; }
  }

  // Everything the mixer shows: mode, every channel's volume and mute, chat mix.
  async state() {
    const mode = String(await this.call('GET', 'mode')).replace(/"/g, '') === 'stream' ? 'stream' : 'classic';
    const v = await this.call('GET', mode === 'stream' ? 'volumeSettings/streamer/' : 'volumeSettings/classic/');
    const pick = (node) => (node && typeof node === 'object' ? { volume: Number(node.volume) || 0, muted: !!node.muted } : null);
    const channels = CHANNELS.map((c) => {
      const node = c.id === 'master' ? v && v.masters : v && v.devices && v.devices[c.json];
      if (mode === 'classic') return { ...c, classic: pick(node && node.classic) };
      const st = node && node.stream;
      const mixes = {};
      if (st && typeof st === 'object') for (const [k, n] of Object.entries(st)) { const key = /personal|monitor/i.test(k) ? 'monitoring' : /stream/i.test(k) ? 'streaming' : k; mixes[key] = pick(n); }
      return { ...c, mixes };
    }).filter((c) => (mode === 'classic' ? c.classic : Object.keys(c.mixes).length));
    let chatMix = null;
    try { const m = await this.call('GET', 'v1/chatMix'); if (m && typeof m.balance === 'number') chatMix = { balance: m.balance, state: m.state || '' }; } catch {}
    return { ok: true, mode, channels, chatMix, mixes: MIXES };
  }

  channel(id) { const c = CHANNELS.find((x) => x.id === id); if (!c) throw new Error('Unknown channel'); return c; }
  setVolume(id, volume, mix, mode) {
    const c = this.channel(id);
    const v = Math.max(0, Math.min(1, Number(volume) || 0)).toFixed(2);
    if (mode === 'stream') return this.call('PUT', `volumeSettings/streamer/${mix === 'streaming' ? 'streaming' : 'monitoring'}/${c.route}/volume/${v}`);
    return this.call('PUT', `volumeSettings/classic/${c.route}/Volume/${v}`);
  }
  setMute(id, muted, mix, mode) {
    const c = this.channel(id);
    const m = muted ? 'true' : 'false';
    if (mode === 'stream') return this.call('PUT', `volumeSettings/streamer/${mix === 'streaming' ? 'streaming' : 'monitoring'}/${c.route}/isMuted/${m}`);
    return this.call('PUT', `volumeSettings/classic/${c.route}/Mute/${m}`);
  }
  setChatMix(balance) { return this.call('PUT', `v1/chatMix?balance=${Math.max(-1, Math.min(1, Number(balance) || 0)).toFixed(2)}`); }
  setMode(mode) { return this.call('PUT', `mode/${mode === 'stream' ? 'stream' : 'classic'}`); }
}

module.exports = { Sonar, CHANNELS };
