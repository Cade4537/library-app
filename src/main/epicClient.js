// Keeps a working Epic access token and makes signed requests for the library, playtime and friends.
const { epicAccess } = require('./auth');

class EpicClient {
  constructor(store) {
    this.store = store;
    this.access = null;
    this.pending = null;
  }

  get auth() { return this.store.data.settings.epicAuth || null; }
  get connected() { return !!(this.auth && this.auth.refreshToken); }
  get accountId() { return this.auth && this.auth.accountId; }

  async token() {
    if (this.access && this.access.expiresAt > Date.now() + 60000) return this.access.token;
    if (!this.connected) throw new Error('Not signed in to Epic');
    // Refresh tokens rotate, so only one refresh may run at a time.
    if (!this.pending) {
      this.pending = epicAccess(this.auth)
        .then((r) => {
          this.store.data.settings.epicAuth = r.auth;
          this.store.changed();
          this.access = { token: r.accessToken, expiresAt: r.expiresAt };
        })
        .finally(() => { this.pending = null; });
    }
    await this.pending;
    return this.access.token;
  }

  reset() { this.access = null; }

  async get(url) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(20000) });
    if (res.status === 401) { this.access = null; throw new Error('Epic sign in expired. Sign in again in Settings.'); }
    if (!res.ok) throw new Error(`Epic error ${res.status}`);
    return res.json();
  }

  async remove(url) {
    const res = await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${await this.token()}` }, signal: AbortSignal.timeout(20000) });
    if (res.status === 401) { this.access = null; throw new Error('Epic sign in expired. Sign in again in Settings.'); }
    if (!res.ok && res.status !== 404) throw new Error(`Epic error ${res.status}`);
  }
}

module.exports = { EpicClient };
