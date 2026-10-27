// Friends from Steam and Xbox with online status and what they are playing.
// People with matching names on both are shown as one person; links can be changed by hand.
const { similarity, normName } = require('./util');

const STEAM_STATES = { 0: 'offline', 1: 'online', 2: 'busy', 3: 'away', 4: 'away', 5: 'online', 6: 'online' };

async function steamFriends(settings, steamId) {
  const key = String(settings.steamApiKey || '').trim();
  if (!key || !steamId) return null;
  const res = await fetch(`https://api.steampowered.com/ISteamUser/GetFriendList/v1/?key=${key}&steamid=${steamId}&relationship=friend`, { signal: AbortSignal.timeout(20000) });
  if (res.status === 401) throw new Error('Steam friends list is private. Set Friends list to Public in Steam privacy settings.');
  if (!res.ok) throw new Error(`Steam friends error ${res.status}`);
  const ids = (((await res.json()).friendslist || {}).friends || []).map((f) => f.steamid);
  const people = [];
  for (let i = 0; i < ids.length; i += 100) {
    const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${ids.slice(i, i + 100).join(',')}`, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) continue;
    for (const p of ((await r.json()).response || {}).players || []) {
      const status = STEAM_STATES[p.personastate] || 'offline';
      people.push({
        key: `steam:${p.steamid}`,
        platform: 'steam',
        name: p.personaname,
        avatar: p.avatarfull || p.avatarmedium || '',
        status: p.gameextrainfo ? 'ingame' : status,
        activity: p.gameextrainfo ? `Playing ${p.gameextrainfo}` : '',
        profile: p.profileurl || `https://steamcommunity.com/profiles/${p.steamid}`,
        lastSeen: p.lastlogoff ? p.lastlogoff * 1000 : 0,
      });
    }
  }
  return people;
}

async function xboxFriends(xbox) {
  if (!xbox || !xbox.configured) return null;
  const j = await xbox.friends();
  return (j.people || []).map((p) => {
    const online = /online/i.test(p.presenceState || '');
    const text = p.presenceText || '';
    const playing = online && text && !/^(online|home|xbox app)$/i.test(text) && !/^last seen/i.test(text);
    return {
      key: `xbox:${p.xuid}`,
      platform: 'xbox',
      name: p.gamertag || p.displayName,
      altName: p.displayName,
      avatar: p.displayPicRaw || '',
      status: playing ? 'ingame' : online ? 'online' : 'offline',
      activity: playing ? (/^playing /i.test(text) ? text : `Playing ${text}`) : online ? '' : text,
      profile: `https://www.xbox.com/play/user/${encodeURIComponent(p.gamertag || '')}`,
    };
  });
}

const RANK = { ingame: 0, online: 1, busy: 2, away: 3, offline: 4 };
const sameName = (a, b) => normName(a.name) === normName(b.name) || similarity(a.name, b.name) >= 0.8 ||
  (a.altName && normName(a.altName) === normName(b.name)) || (b.altName && normName(b.altName) === normName(a.name));

// Groups accounts into people: manual links first, then automatic name matches (one account per platform).
function combine(accounts, links) {
  const manual = links.groups || [];
  const blocked = new Set((links.unlinked || []).map((p) => p.slice().sort().join('|')));
  const byKey = new Map(accounts.map((a) => [a.key, a]));
  const used = new Set();
  const people = [];
  for (const g of manual) {
    const accs = g.map((k) => byKey.get(k)).filter(Boolean);
    if (!accs.length) continue;
    accs.forEach((a) => used.add(a.key));
    people.push({ accounts: accs, manual: true });
  }
  const order = ['steam', 'xbox', 'epic'];
  const rest = accounts.filter((a) => !used.has(a.key)).sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform));
  for (const a of rest) {
    if (used.has(a.key)) continue;
    used.add(a.key);
    const group = [a];
    for (const b of rest) {
      if (used.has(b.key) || group.some((g) => g.platform === b.platform)) continue;
      if (group.some((g) => blocked.has([g.key, b.key].sort().join('|')))) continue;
      if (group.some((g) => sameName(g, b))) { used.add(b.key); group.push(b); }
    }
    people.push(group.length > 1 ? { accounts: group, auto: true } : { accounts: group });
  }
  for (const p of people) {
    p.accounts.sort((a, b) => RANK[a.status] - RANK[b.status]);
    p.id = p.accounts.map((a) => a.key).join('+');
    p.name = p.accounts[0].name;
    p.avatar = (p.accounts.find((a) => a.avatar) || {}).avatar || '';
    p.status = p.accounts[0].status;
  }
  return people.sort((a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name));
}

// Epic shares your friends list but not live status, so this shows when each friend was last online.
async function epicFriends(epic) {
  if (!epic || !epic.connected) return null;
  const me = epic.accountId;
  const sum = await epic.get(`https://friends-public-service-prod.ol.epicgames.com/friends/api/v1/${me}/summary`);
  const ids = (sum.friends || []).map((f) => f.accountId).filter(Boolean);
  const names = new Map();
  for (const f of sum.friends || []) if (f.displayName) names.set(f.accountId, f.displayName);
  for (let i = 0; i < ids.length; i += 100) {
    const missing = ids.slice(i, i + 100).filter((id) => !names.has(id));
    if (!missing.length) continue;
    try {
      const list = await epic.get(`https://account-public-service-prod.ol.epicgames.com/account/api/public/account?${missing.map((id) => `accountId=${id}`).join('&')}`);
      for (const a of list || []) names.set(a.id, a.displayName || (a.externalAuths && Object.values(a.externalAuths)[0] && Object.values(a.externalAuths)[0].externalDisplayName) || '');
    } catch {}
  }
  let lastOnline = {};
  try { lastOnline = await epic.get(`https://presence-public-service-prod.ol.epicgames.com/presence/api/v1/_/${me}/last-online`); } catch {}
  return ids.map((id) => {
    const lo = lastOnline[id] && lastOnline[id][0] && Date.parse(lastOnline[id][0].last_online);
    const recent = lo && Date.now() - lo < 10 * 60 * 1000;
    return {
      key: `epic:${id}`,
      platform: 'epic',
      name: names.get(id) || 'Epic friend',
      avatar: '',
      status: recent ? 'online' : 'offline',
      activity: lo ? (recent ? 'Online recently' : `Last online ${ago(lo)}`) : '',
      profile: 'https://store.epicgames.com/',
    };
  });
}

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

class Friends {
  constructor(store, send, getSteamId, xbox, epic) {
    this.xbox = xbox;
    this.epic = epic;
    this.store = store;
    this.send = send;
    this.getSteamId = getSteamId;
    this.state = { people: [], errors: [], updated: 0, configured: false };
    this.timer = null;
    this.busy = false;
    if (!store.data.friendLinks) store.data.friendLinks = { groups: [], unlinked: [] };
  }

  start() {
    this.refresh();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.refresh(), 90 * 1000);
  }

  async refresh() {
    if (this.busy) return this.state;
    this.busy = true;
    const s = this.store.data.settings;
    const errors = [];
    let accounts = [];
    const steamId = await this.getSteamId();
    const results = await Promise.all([
      steamFriends(s, steamId).catch((e) => { errors.push(`Steam: ${e.message}`); return []; }),
      xboxFriends(this.xbox).catch((e) => { errors.push(`Xbox: ${e.message}`); return []; }),
      epicFriends(this.epic).catch((e) => { errors.push(`Epic: ${e.message}`); return []; }),
    ]);
    const configured = results.some((r) => r !== null);
    for (const r of results) if (r) accounts = accounts.concat(r);
    if (configured && accounts.length) this.accounts = accounts;
    this.state = { people: combine(this.accounts || accounts, this.store.data.friendLinks), errors, updated: Date.now(), configured };
    this.busy = false;
    this.send(this.state);
    return this.state;
  }

  relink() {
    this.state = { ...this.state, people: combine(this.accounts || [], this.store.data.friendLinks) };
    this.store.changed();
    this.send(this.state);
  }

  // Joins two people (each given by its account keys) into one.
  link(keysA, keysB) {
    const L = this.store.data.friendLinks;
    const all = [...new Set([...keysA, ...keysB])];
    L.groups = L.groups.filter((g) => !g.some((k) => all.includes(k)));
    L.groups.push(all);
    L.unlinked = L.unlinked.filter((p) => !(all.includes(p[0]) && all.includes(p[1])));
    this.relink();
  }

  // Splits a person back into separate accounts and stops them being matched again automatically.
  unlink(keys) {
    const L = this.store.data.friendLinks;
    L.groups = L.groups.filter((g) => !g.some((k) => keys.includes(k)));
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) L.unlinked.push([keys[i], keys[j]]);
    this.relink();
  }
}

module.exports = { Friends, combine };
