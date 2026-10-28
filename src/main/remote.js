// Phone remote: a small web app served on your home network. Open it on your phone to browse
// the library, start games on this PC, install owned games, and manage storage for installed games.
// Pairing uses a secret link (shown as a QR code in Settings). Only devices on your own network
// (private addresses) can connect, and every request must carry the secret.
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 47820;

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && isPrivate(a.address)) out.push(a.address);
  }
  return out;
}
function isPrivate(ip) {
  const v = String(ip || '').replace(/^::ffff:/, '');
  return /^10\./.test(v) || /^192\.168\./.test(v) || /^172\.(1[6-9]|2\d|3[01])\./.test(v) || v === '127.0.0.1' || v === '::1' || /^169\.254\./.test(v);
}

class RemoteServer {
  // api: { library(), launch(id), install(id), uninstall(id), drives(), status() }
  constructor(store, api) {
    this.store = store;
    this.api = api;
    this.server = null;
    this.error = null;
  }

  get token() {
    const s = this.store.data.settings;
    if (!s.remoteToken) { s.remoteToken = crypto.randomBytes(18).toString('base64url'); this.store.changed(); }
    return s.remoteToken;
  }

  info() {
    const ips = lanAddresses();
    return { on: !!this.server, port: PORT, ips, url: ips.length ? `http://${ips[0]}:${PORT}/?t=${this.token}` : null, error: this.error };
  }

  newToken() { this.store.data.settings.remoteToken = crypto.randomBytes(18).toString('base64url'); this.store.changed(); return this.info(); }

  start() {
    if (this.server) return this.info();
    this.error = null;
    const srv = http.createServer((req, res) => this.handle(req, res).catch(() => { try { res.writeHead(500); res.end(); } catch {} }));
    srv.on('error', (e) => { this.error = e.code === 'EADDRINUSE' ? `Port ${PORT} is busy` : e.message; this.server = null; });
    srv.listen(PORT, '0.0.0.0');
    srv.keepAliveTimeout = 5000;
    this.server = srv;
    return this.info();
  }

  stop() {
    if (this.server) { this.server.close(); this.server.closeAllConnections && this.server.closeAllConnections(); }
    this.server = null;
  }

  authed(req) {
    const t = this.token;
    const cookie = String(req.headers.cookie || '').split(';').map((x) => x.trim()).find((x) => x.startsWith('cv_t='));
    const given = (cookie && decodeURIComponent(cookie.slice(5))) || req.headers['x-cv-token'] || '';
    return given.length === t.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(t));
  }

  send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
    res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...extra });
    res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
  }

  async handle(req, res) {
    if (!isPrivate(req.socket.remoteAddress)) return this.send(res, 403, { error: 'Only your home network can use this.' });
    const url = new URL(req.url, 'http://x');
    // Pairing: the QR link carries the secret once; it is kept in a cookie after that.
    if (url.pathname === '/' && url.searchParams.get('t')) {
      if (url.searchParams.get('t') !== this.token) return this.send(res, 403, '<h3 style="font-family:sans-serif">This pairing link is old. Scan the QR code in Crimson Vault again.</h3>', 'text/html; charset=utf-8');
      return this.send(res, 302, '', 'text/plain', { Location: '/', 'Set-Cookie': `cv_t=${encodeURIComponent(this.token)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Strict` });
    }
    if (!this.authed(req)) {
      if (url.pathname === '/') return this.send(res, 401, PAIR_PAGE, 'text/html; charset=utf-8');
      return this.send(res, 401, { error: 'Not paired' });
    }
    if (url.pathname === '/') return this.send(res, 200, PHONE_PAGE, 'text/html; charset=utf-8', { 'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'" });
    if (url.pathname.startsWith('/cover/')) {
      const id = decodeURIComponent(url.pathname.slice(7));
      const it = this.store.data.items[id];
      if (!it || !it.cover || !fs.existsSync(it.cover)) return this.send(res, 404, '');
      res.writeHead(200, { 'Content-Type': /\.png$/i.test(it.cover) ? 'image/png' : 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
      return fs.createReadStream(it.cover).pipe(res);
    }
    if (url.pathname === '/api/library' && req.method === 'GET') return this.send(res, 200, await this.api.library());
    if (url.pathname === '/api/drives' && req.method === 'GET') return this.send(res, 200, await this.api.drives());
    if (url.pathname === '/api/status' && req.method === 'GET') return this.send(res, 200, await this.api.status());
    const m = url.pathname.match(/^\/api\/(launch|install|uninstall)\/(.+)$/);
    if (m && req.method === 'POST') {
      const id = decodeURIComponent(m[2]);
      if (!this.store.data.items[id]) return this.send(res, 404, { error: 'Not found' });
      return this.send(res, 200, await this.api[m[1]](id));
    }
    return this.send(res, 404, { error: 'Not found' });
  }
}

const PAIR_PAGE = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Crimson Vault</title>
<body style="margin:0;background:#0a0a0b;color:#eee;font-family:system-ui,Segoe UI,sans-serif;display:grid;place-items:center;height:100vh;text-align:center;padding:24px">
<div><div style="font-size:44px">💎</div><h2>Not paired yet</h2><p style="color:#999">On your PC, open Crimson Vault > Settings > Phone remote and scan the QR code with this phone.</p></div></body>`;

// The phone app: one page, no outside files.
const PHONE_PAGE = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0a0a0b"><title>Crimson Vault</title>
<style>
:root{--bg:#0a0a0b;--p:#141417;--p2:#1d1d21;--line:#2a2a30;--t:#f2f2f4;--m:#9b9ba3;--a:#e11d2e;--a2:#ff3b4b}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0;background:var(--bg);color:var(--t);font:15px/1.4 system-ui,'Segoe UI',sans-serif}
header{position:sticky;top:0;z-index:5;background:linear-gradient(var(--bg) 70%,transparent);padding:14px 16px 10px;padding-top:max(14px,env(safe-area-inset-top))}
.brand{display:flex;align-items:center;gap:8px;font-weight:800;letter-spacing:.14em;font-size:12px;text-transform:uppercase;color:var(--m)}
.gem{width:18px;height:16px;background:linear-gradient(160deg,#ff5a64,#a3101e);clip-path:polygon(18% 0,82% 0,100% 33%,50% 100%,0 33%)}
.tabs{display:flex;gap:6px;margin-top:12px}.tabs button{flex:1;height:38px;border-radius:10px;border:1px solid var(--line);background:var(--p);color:var(--m);font-weight:700}
.tabs button.on{background:var(--a);border-color:var(--a);color:#fff}
.bar{display:flex;gap:8px;margin-top:10px}input{flex:1;height:40px;border-radius:10px;border:1px solid var(--line);background:var(--p);color:var(--t);padding:0 12px;font-size:15px}
.seg{display:flex;gap:6px;margin-top:10px;overflow-x:auto}.seg button{flex:none;height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line);background:var(--p);color:var(--m);font-weight:600}
.seg button.on{background:#fff;color:#000}
main{padding:6px 16px 90px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:12px}
.card{position:relative;border:0;padding:0;background:none;color:inherit;text-align:left}
.art{aspect-ratio:2/3;border-radius:10px;overflow:hidden;background:var(--p2);position:relative;box-shadow:0 6px 16px rgba(0,0,0,.4)}
.art img{width:100%;height:100%;object-fit:cover;display:block}
.art .ini{position:absolute;inset:0;display:grid;place-items:center;font-size:30px;font-weight:800;color:rgba(255,255,255,.5);background:linear-gradient(155deg,#5a1622,#1a0a0d)}
.card.ni .art{filter:grayscale(.8) brightness(.6)}.tag{position:absolute;left:6px;bottom:6px;font-size:10px;font-weight:800;padding:2px 6px;border-radius:5px;background:rgba(0,0,0,.75)}
.tag.run{background:#3ddc84;color:#06210f}.name{font-size:12px;margin-top:6px;color:#d4d4da;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.sheet{position:fixed;inset:0;z-index:20;background:rgba(0,0,0,.6);display:none;align-items:flex-end}.sheet.on{display:flex}
.sheet .in{width:100%;background:var(--p);border-radius:18px 18px 0 0;padding:18px 16px;padding-bottom:max(18px,env(safe-area-inset-bottom));animation:up .25s ease-out}
@keyframes up{from{transform:translateY(40px);opacity:0}}
.sh-top{display:flex;gap:14px}.sh-art{width:90px;flex:none}.sh-name{font-size:20px;font-weight:800}.sh-sub{color:var(--m);font-size:13px;margin-top:4px}
.btns{display:flex;flex-direction:column;gap:8px;margin-top:16px}.btn{height:48px;border-radius:12px;border:1px solid var(--line);background:var(--p2);color:var(--t);font-size:16px;font-weight:700}
.btn.pri{background:var(--a);border-color:var(--a);color:#fff}.btn.dan{color:#ff8f99;border-color:#4a2229;background:transparent}
.drive{background:var(--p);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:10px}.drive b{font-size:16px}
.meter{height:8px;border-radius:5px;background:var(--p2);overflow:hidden;margin:8px 0 6px}.meter span{display:block;height:100%;background:linear-gradient(90deg,var(--a),var(--a2))}
.row{display:flex;align-items:center;gap:12px;padding:10px;border-radius:12px;background:var(--p);border:1px solid var(--line);margin-bottom:8px}
.row .thumb{width:40px;flex:none}.row .tx{flex:1;min-width:0}.row .tx div:first-child{font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.row .tx div+div{color:var(--m);font-size:12px}
.row button{height:34px;padding:0 12px;border-radius:9px;border:1px solid #4a2229;background:transparent;color:#ff8f99;font-weight:700}
.now{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:linear-gradient(90deg,rgba(61,220,132,.18),transparent);border:1px solid rgba(61,220,132,.35);margin-bottom:12px}
.toast{position:fixed;left:16px;right:16px;bottom:max(16px,env(safe-area-inset-bottom));background:#1d1d21;border:1px solid var(--line);border-left:3px solid var(--a);padding:12px 14px;border-radius:12px;opacity:0;transform:translateY(20px);transition:.25s;z-index:30}
.toast.on{opacity:1;transform:none}.empty{color:var(--m);text-align:center;padding:40px 10px}
h3{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--m);margin:18px 0 8px}
</style></head><body>
<header><div class="brand"><span class="gem"></span>Crimson Vault</div>
<div class="tabs"><button data-tab="lib" class="on">Library</button><button data-tab="sto">Storage</button></div>
<div id="libBar"><div class="bar"><input id="q" placeholder="Search your games" autocomplete="off"></div>
<div class="seg" id="seg"><button data-f="installed" class="on">Installed</button><button data-f="owned">Not installed</button><button data-f="recent">Recent</button><button data-f="fav">Favorites</button><button data-f="apps">Apps</button></div></div>
</header>
<main id="main"></main>
<div class="sheet" id="sheet"><div class="in" id="sheetIn"></div></div>
<div class="toast" id="toast"></div>
<script>
let lib=[],tab='lib',filter='installed',q='',status={};
const $=(s)=>document.querySelector(s);
const esc=(s)=>String(s==null?'':s).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtB=(n)=>{if(!n)return'';const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<4){n/=1024;i++}return n.toFixed(n<10&&i>2?1:0)+' '+u[i]};
const hrs=(m)=>!m?'':m<60?m+' min':(m/60).toFixed(m<600?1:0)+' hrs';
const toast=(t)=>{const e=$('#toast');e.textContent=t;e.classList.add('on');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('on'),2600)};
const api=async(p,m='GET')=>{const r=await fetch(p,{method:m});if(r.status===401){location.reload();throw 0}return r.json()};
const art=(it)=>it.cover?'<img loading="lazy" src="/cover/'+encodeURIComponent(it.id)+'">':'<div class="ini">'+esc((it.name.match(/[A-Za-z0-9]/)||['?'])[0])+'</div>';
async function load(){lib=await api('/api/library');status=await api('/api/status');render()}
function list(){let l=lib.filter((it)=>!it.hidden);
 if(filter==='installed')l=l.filter((it)=>it.installed&&it.kind==='game');
 else if(filter==='owned')l=l.filter((it)=>!it.installed&&it.owned&&it.kind==='game');
 else if(filter==='recent')l=l.filter((it)=>it.lastPlayed).sort((a,b)=>b.lastPlayed-a.lastPlayed).slice(0,40);
 else if(filter==='fav')l=l.filter((it)=>it.favorite);
 else if(filter==='apps')l=l.filter((it)=>it.kind!=='game'&&it.installed);
 if(q){const w=q.toLowerCase();l=l.filter((it)=>it.name.toLowerCase().includes(w))}
 if(filter!=='recent')l.sort((a,b)=>a.name.localeCompare(b.name));return l}
function render(){$('#libBar').style.display=tab==='lib'?'':'none';
 if(tab==='sto')return renderStorage();
 const l=list();const run=lib.find((it)=>it.running);
 $('#main').innerHTML=(run?'<div class="now"><b>Playing now</b> '+esc(run.name)+'</div>':'')+(l.length?'<div class="grid">'+l.map((it)=>'<button class="card'+(!it.installed&&it.owned?' ni':'')+'" data-id="'+esc(it.id)+'"><div class="art">'+art(it)+(it.running?'<span class="tag run">Playing</span>':!it.installed&&it.owned?'<span class="tag">Not installed</span>':'')+'</div><div class="name">'+esc(it.name)+'</div></button>').join('')+'</div>':'<div class="empty">Nothing here</div>');
 document.querySelectorAll('.card').forEach((c)=>c.onclick=()=>openSheet(c.dataset.id))}
function openSheet(id){const it=lib.find((x)=>x.id===id);if(!it)return;
 const ni=!it.installed&&it.owned;
 $('#sheetIn').innerHTML='<div class="sh-top"><div class="sh-art"><div class="art">'+art(it)+'</div></div><div><div class="sh-name">'+esc(it.name)+'</div><div class="sh-sub">'+esc([it.sourceName,hrs(it.minutes),it.size?fmtB(it.size):''].filter(Boolean).join(' · '))+'</div></div></div><div class="btns">'+
 (ni?'<button class="btn pri" data-a="install">Install on PC</button>':'<button class="btn pri" data-a="launch">'+(it.kind==='game'?'Play on PC':'Open on PC')+'</button>')+
 (it.installed&&it.kind==='game'?'<button class="btn dan" data-a="uninstall">Uninstall…</button>':'')+'<button class="btn" data-a="close">Close</button></div>';
 $('#sheet').classList.add('on');
 $('#sheetIn').querySelectorAll('[data-a]').forEach((b)=>b.onclick=()=>act(it,b.dataset.a))}
async function act(it,a){if(a==='close')return $('#sheet').classList.remove('on');
 if(a==='uninstall'&&!confirm('Uninstall '+it.name+' from your PC? The launcher on the PC may ask to confirm too.'))return;
 $('#sheet').classList.remove('on');const r=await api('/api/'+a+'/'+encodeURIComponent(it.id),'POST');
 toast(r.ok?(r.message||(a==='launch'?'Starting '+it.name+' on your PC':a==='install'?'Opening the install on your PC':'Uninstall started')):(r.error||'Something went wrong'));setTimeout(load,2500)}
async function renderStorage(){const d=await api('/api/drives');const inst=lib.filter((it)=>it.installed&&it.kind==='game'&&it.size).sort((a,b)=>b.size-a.size);
 $('#main').innerHTML='<h3>Drives</h3>'+(d||[]).map((x)=>'<div class="drive"><b>'+esc(x.id)+'</b> '+esc(x.label||'')+'<div class="meter"><span style="width:'+Math.round((1-x.free/x.size)*100)+'%"></span></div>'+fmtB(x.free)+' free of '+fmtB(x.size)+'</div>').join('')+
 '<h3>Installed games by size</h3>'+(inst.length?inst.map((it)=>'<div class="row"><div class="thumb"><div class="art">'+art(it)+'</div></div><div class="tx"><div>'+esc(it.name)+'</div><div>'+fmtB(it.size)+' · '+esc(it.drive||'')+'</div></div><button data-id="'+esc(it.id)+'">Uninstall</button></div>').join(''):'<div class="empty">No sizes yet</div>');
 document.querySelectorAll('.row button').forEach((b)=>b.onclick=()=>act(lib.find((x)=>x.id===b.dataset.id),'uninstall'))}
document.querySelectorAll('.tabs button').forEach((b)=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('.tabs button').forEach((x)=>x.classList.toggle('on',x===b));render()});
document.querySelectorAll('#seg button').forEach((b)=>b.onclick=()=>{filter=b.dataset.f;document.querySelectorAll('#seg button').forEach((x)=>x.classList.toggle('on',x===b));render()});
$('#q').oninput=(e)=>{q=e.target.value.trim();render()};$('#sheet').onclick=(e)=>{if(e.target.id==='sheet')$('#sheet').classList.remove('on')};
load();setInterval(()=>{if(document.visibilityState==='visible')load()},20000);
</script></body></html>`;

module.exports = { RemoteServer, lanAddresses, PORT };
