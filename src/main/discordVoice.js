// 0.19.0: your Discord voice call, read from the Discord desktop app on this PC over the same local
// pipe Rich Presence uses. Shows the channel you are in, who is there and who is talking, and can
// mute, deafen and leave. Needs your own Discord application (ID and client secret) and one Allow
// click inside Discord. Scopes asked for: rpc, rpc.voice.read, rpc.voice.write. The only network
// request is the sign in exchange with discord.com itself; everything else stays on this PC.
const net = require('net');
const crypto = require('crypto');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };
const SCOPES = ['rpc', 'rpc.voice.read', 'rpc.voice.write'];

class DiscordVoice {
  // d: { getTokens, saveTokens, push, log }
  constructor(d) {
    this.d = d;
    this.sock = null;
    this.buf = Buffer.alloc(0);
    this.clientId = null;
    this.secret = '';
    this.retry = null;
    this.pending = new Map(); // nonce -> { resolve, reject, t }
    this.authed = false;
    this.subbed = ''; // channel id whose events we listen to
    this.state = { setup: 'off', connected: false, authed: false, channel: null, users: [], mute: false, deaf: false, error: '' };
  }

  push() { this.d.push({ ...this.state, users: [...this.state.users] }); }

  configure(clientId, secret, enabled) {
    const id = enabled && /^\d{15,25}$/.test(String(clientId || '').trim()) ? String(clientId).trim() : null;
    const sec = String(secret || '').trim();
    if (id === this.clientId && sec === this.secret) return;
    this.close();
    this.clientId = id;
    this.secret = sec;
    this.state.setup = !enabled ? 'off' : !id ? 'no-id' : !sec ? 'no-secret' : 'ready';
    this.state.error = '';
    this.push();
    if (id && sec) this.connect();
  }

  close() {
    clearTimeout(this.retry);
    this.retry = null;
    if (this.sock) { try { this.sock.destroy(); } catch {} }
    this.sock = null;
    this.dropped();
  }

  dropped() {
    this.buf = Buffer.alloc(0);
    this.authed = false;
    this.subbed = '';
    for (const p of this.pending.values()) { clearTimeout(p.t); p.reject(new Error('Discord closed')); }
    this.pending.clear();
    Object.assign(this.state, { connected: false, authed: false, channel: null, users: [], error: this.state.error });
  }

  connect(n = 0) {
    if (!this.clientId || !this.secret || this.sock || process.platform !== 'win32') return;
    if (n > 9) { this.later(); return; }
    const sock = net.connect(`\\\\?\\pipe\\discord-ipc-${n}`);
    let opened = false;
    sock.once('connect', () => {
      opened = true;
      this.sock = sock;
      this.write(OP.HANDSHAKE, { v: 1, client_id: this.clientId });
    });
    sock.on('data', (d) => this.onData(d));
    sock.on('error', () => { if (!opened) { sock.destroy(); this.connect(n + 1); } });
    sock.on('close', () => {
      if (!opened) return;
      this.sock = null;
      this.dropped();
      this.push();
      this.later();
    });
  }

  later() {
    clearTimeout(this.retry);
    if (this.clientId && this.secret) this.retry = setTimeout(() => this.connect(), 60000);
  }

  write(op, obj) {
    if (!this.sock) return;
    const data = Buffer.from(JSON.stringify(obj));
    const head = Buffer.alloc(8);
    head.writeInt32LE(op, 0);
    head.writeInt32LE(data.length, 4);
    this.sock.write(Buffer.concat([head, data]));
  }

  // One command, answered by nonce.
  cmd(command, args, evt) {
    return new Promise((resolve, reject) => {
      if (!this.sock) { reject(new Error('The Discord app is not running.')); return; }
      const nonce = crypto.randomUUID();
      const t = setTimeout(() => { this.pending.delete(nonce); reject(new Error('Discord did not answer.')); }, 30000);
      this.pending.set(nonce, { resolve, reject, t });
      this.write(OP.FRAME, { cmd: command, args, evt, nonce });
    });
  }

  onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0);
      const len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) return;
      let msg = null;
      try { msg = JSON.parse(this.buf.slice(8, 8 + len).toString()); } catch {}
      this.buf = this.buf.slice(8 + len);
      if (op === OP.PING) { this.write(OP.PONG, msg); continue; }
      if (op === OP.CLOSE) { try { this.sock.destroy(); } catch {} continue; }
      if (!msg) continue;
      if (msg.nonce && this.pending.has(msg.nonce)) {
        const p = this.pending.get(msg.nonce);
        this.pending.delete(msg.nonce);
        clearTimeout(p.t);
        if (msg.evt === 'ERROR') p.reject(new Error((msg.data && msg.data.message) || 'Discord said no.'));
        else p.resolve(msg.data);
        continue;
      }
      if (msg.cmd === 'DISPATCH') this.onEvent(msg.evt, msg.data);
    }
  }

  async onEvent(evt, data) {
    const st = this.state;
    if (evt === 'READY') {
      st.connected = true;
      this.push();
      // A saved approval signs in quietly; otherwise wait for Connect in Settings.
      if (this.d.getTokens()) this.signIn().catch((e) => { st.error = e.message; this.push(); });
      return;
    }
    if (!this.authed) return;
    if (evt === 'VOICE_CHANNEL_SELECT') { this.refreshChannel().catch(() => {}); return; }
    if (evt === 'VOICE_SETTINGS_UPDATE') {
      if (data && typeof data === 'object') { st.mute = !!data.mute; st.deaf = !!data.deaf; this.push(); }
      return;
    }
    if (evt === 'SPEAKING_START' || evt === 'SPEAKING_STOP') {
      const u = st.users.find((x) => x.id === String(data && data.user_id));
      if (u) { u.speaking = evt === 'SPEAKING_START'; this.push(); }
      return;
    }
    if (evt === 'VOICE_STATE_CREATE' || evt === 'VOICE_STATE_UPDATE' || evt === 'VOICE_STATE_DELETE') {
      const vu = this.user(data);
      if (!vu) return;
      st.users = st.users.filter((x) => x.id !== vu.id);
      if (evt !== 'VOICE_STATE_DELETE') {
        const old = this.state.users.find((x) => x.id === vu.id);
        if (old) vu.speaking = old.speaking;
        st.users.push(vu);
      }
      st.users.sort((a, b) => a.name.localeCompare(b.name));
      this.push();
    }
  }

  user(vs) {
    const u = vs && vs.user;
    if (!u || !u.id) return null;
    const flags = vs.voice_state || {};
    return {
      id: String(u.id),
      name: vs.nick || u.global_name || u.username || 'Someone',
      avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=64` : '',
      mute: !!(flags.mute || flags.self_mute || flags.suppress),
      deaf: !!(flags.deaf || flags.self_deaf),
      speaking: false,
    };
  }

  async token(body) {
    const res = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.secret, ...body }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) {
      const why = j.error_description || j.error || `Discord sign in failed (${res.status}).`;
      // Discord's token endpoint insists on a redirect address, even for this local flow.
      if (/redirect_uri/i.test(why)) throw new Error('One more portal step: in your Discord application, OAuth2, add http://127.0.0.1 under Redirects, press Save Changes, then Connect voice again.');
      throw new Error(why);
    }
    this.d.saveTokens({ access: j.access_token, refresh: j.refresh_token || '', at: Date.now() });
    return j.access_token;
  }

  // The one time Allow popup inside Discord, started from Settings.
  async authorize() {
    if (!this.sock) this.connect();
    await new Promise((r) => setTimeout(r, this.sock ? 0 : 1500));
    if (!this.sock) throw new Error('The Discord app is not running on this PC.');
    const a = await this.cmd('AUTHORIZE', { client_id: this.clientId, scopes: SCOPES, prompt: 'none' });
    if (!a || !a.code) throw new Error('Discord did not hand back a sign in code.');
    await this.token({ grant_type: 'authorization_code', code: a.code, redirect_uri: 'http://127.0.0.1' });
    await this.signIn();
    return true;
  }

  async signIn() {
    const t = this.d.getTokens();
    if (!t || !t.access) throw new Error('Not approved yet.');
    try {
      await this.cmd('AUTHENTICATE', { access_token: t.access });
    } catch (e) {
      if (!t.refresh) { this.d.saveTokens(null); throw new Error('Discord sign in expired. Press Connect voice again.'); }
      try {
        const access = await this.token({ grant_type: 'refresh_token', refresh_token: t.refresh });
        await this.cmd('AUTHENTICATE', { access_token: access });
      } catch (e2) {
        this.d.saveTokens(null);
        throw new Error('Discord sign in expired. Press Connect voice again.');
      }
    }
    this.authed = true;
    this.state.authed = true;
    this.state.error = '';
    await this.cmd('SUBSCRIBE', undefined, 'VOICE_CHANNEL_SELECT').catch(() => {});
    await this.cmd('SUBSCRIBE', undefined, 'VOICE_SETTINGS_UPDATE').catch(() => {});
    try {
      const vs = await this.cmd('GET_VOICE_SETTINGS', {});
      if (vs) { this.state.mute = !!vs.mute; this.state.deaf = !!vs.deaf; }
    } catch {}
    await this.refreshChannel();
  }

  async refreshChannel() {
    const st = this.state;
    const c = await this.cmd('GET_SELECTED_VOICE_CHANNEL', {}).catch(() => null);
    if (!c || !c.id) {
      if (this.subbed) this.unsubChannel(this.subbed);
      this.subbed = '';
      st.channel = null;
      st.users = [];
      this.push();
      return;
    }
    st.channel = { id: String(c.id), name: c.name || 'Voice channel', guild: c.guild_id ? '' : 'Direct call' };
    st.users = (c.voice_states || []).map((v) => this.user(v)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
    if (this.subbed !== st.channel.id) {
      if (this.subbed) this.unsubChannel(this.subbed);
      this.subbed = st.channel.id;
      for (const evt of ['VOICE_STATE_CREATE', 'VOICE_STATE_UPDATE', 'VOICE_STATE_DELETE', 'SPEAKING_START', 'SPEAKING_STOP']) {
        this.cmd('SUBSCRIBE', { channel_id: this.subbed }, evt).catch(() => {});
      }
    }
    this.push();
  }

  unsubChannel(id) {
    for (const evt of ['VOICE_STATE_CREATE', 'VOICE_STATE_UPDATE', 'VOICE_STATE_DELETE', 'SPEAKING_START', 'SPEAKING_STOP']) {
      this.cmd('UNSUBSCRIBE', { channel_id: id }, evt).catch(() => {});
    }
  }

  setMute(v) { return this.cmd('SET_VOICE_SETTINGS', { mute: !!v }); }
  setDeaf(v) { return this.cmd('SET_VOICE_SETTINGS', { deaf: !!v }); }
  leave() { return this.cmd('SELECT_VOICE_CHANNEL', { channel_id: null, force: true }); }

  signOut() {
    this.d.saveTokens(null);
    this.authed = false;
    Object.assign(this.state, { authed: false, channel: null, users: [], error: '' });
    this.push();
  }
}

module.exports = { DiscordVoice };
