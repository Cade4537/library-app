// Discord Rich Presence: shows the game you are playing on your Discord profile.
// Talks to the Discord app on this PC through its local pipe (no sign in needed).
// It needs a Discord Application ID, which sets the name Discord shows ("Playing Crimson Vault").
const net = require('net');
const crypto = require('crypto');

const OP = { HANDSHAKE: 0, FRAME: 1, CLOSE: 2, PING: 3, PONG: 4 };

class DiscordRpc {
  constructor() {
    this.sock = null;
    this.ready = false;
    this.clientId = null;
    this.want = null; // the activity we want shown (null clears it)
    this.sent = undefined;
    this.buf = Buffer.alloc(0);
    this.retry = null;
  }

  configure(clientId, enabled) {
    const id = enabled && /^\d{15,25}$/.test(String(clientId || '').trim()) ? String(clientId).trim() : null;
    if (id === this.clientId) return;
    this.close();
    this.clientId = id;
    if (id) this.connect();
  }

  connect(n = 0) {
    if (!this.clientId || this.sock || process.platform !== 'win32') return;
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
      this.sock = null; this.ready = false; this.sent = undefined; this.buf = Buffer.alloc(0);
      this.later();
    });
  }

  // Discord not running: try again in a minute.
  later() {
    clearTimeout(this.retry);
    if (this.clientId) this.retry = setTimeout(() => this.connect(), 60000);
  }

  write(op, obj) {
    if (!this.sock) return;
    const data = Buffer.from(JSON.stringify(obj));
    const head = Buffer.alloc(8);
    head.writeInt32LE(op, 0);
    head.writeInt32LE(data.length, 4);
    this.sock.write(Buffer.concat([head, data]));
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
      if (op === OP.PING) this.write(OP.PONG, msg);
      else if (op === OP.CLOSE) { try { this.sock.destroy(); } catch {} }
      else if (msg && msg.evt === 'READY') { this.ready = true; this.flush(); }
    }
  }

  // activity: { details, state, start, image, imageText } or null
  set(activity) {
    this.want = activity;
    this.flush();
  }

  flush() {
    if (!this.ready) return;
    const key = JSON.stringify(this.want);
    if (key === this.sent) return;
    this.sent = key;
    const a = this.want;
    this.write(OP.FRAME, {
      cmd: 'SET_ACTIVITY',
      nonce: crypto.randomUUID(),
      args: {
        pid: process.pid,
        activity: a ? {
          details: String(a.details || '').slice(0, 128) || undefined,
          state: a.state ? String(a.state).slice(0, 128) : undefined,
          timestamps: a.start ? { start: Math.floor(a.start / 1000) } : undefined,
          assets: a.image ? { large_image: a.image, large_text: (a.imageText || a.details || '').slice(0, 128) } : undefined,
          instance: false,
        } : null,
      },
    });
  }

  close() {
    clearTimeout(this.retry);
    if (this.sock) { try { this.sock.destroy(); } catch {} }
    this.sock = null; this.ready = false; this.sent = undefined;
  }
}

module.exports = { DiscordRpc };
