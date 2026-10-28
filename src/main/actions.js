// Things to do before a game starts and after it closes: run a program, close programs,
// switch the Windows power plan, or start an OBS recording.
const { spawn, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const PLANS = {
  high: '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c',
  balanced: '381b4222-f694-41f0-9685-ff5bb260df2e',
  saver: 'a1841308-3541-4fab-bc81-f71556f20b4a',
  ultimate: 'e9a42b02-d5df-448d-aa00-03f14749eb61',
};

const run = (cmd, args) => new Promise((resolve) => {
  execFile(cmd, args, { windowsHide: true, timeout: 15000 }, (err, out) => resolve(err ? null : String(out || '')));
});

const startDetached = (file, args, cwd) => new Promise((resolve) => {
  try {
    const child = spawn(file, args || [], { cwd: cwd || path.dirname(file), detached: true, stdio: 'ignore' });
    child.once('error', () => resolve(false));
    child.once('spawn', () => { child.unref(); resolve(true); });
  } catch { resolve(false); }
});

// "a b "c d"" -> ['a', 'b', 'c d']
function splitArgs(str) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(str || '')))) out.push(m[1] != null ? m[1] : m[2]);
  return out;
}

function findObs() {
  const roots = [process.env.ProgramFiles, process.env['ProgramFiles(x86)'], 'C:\\Program Files', 'D:\\Program Files'].filter(Boolean);
  for (const r of roots) {
    const p = path.join(r, 'obs-studio', 'bin', '64bit', 'obs64.exe');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

async function activePlan() {
  const out = await run('powercfg', ['/getactivescheme']);
  const m = out && out.match(/[0-9a-f]{8}-[0-9a-f-]{27}/i);
  return m ? m[0] : null;
}

// One action. Returns a short note when something could not be done.
async function doAction(a, ctx) {
  if (!a || !a.type) return null;
  if (process.platform !== 'win32') return null;
  switch (a.type) {
    case 'run': {
      if (!a.path) return null;
      const ok = await startDetached(a.path, splitArgs(a.args));
      return ok ? null : `Could not start ${path.basename(a.path)}`;
    }
    case 'close': {
      // Asks each program to close normally (like clicking X), no force.
      for (const name of String(a.names || '').split(/[,;]+/).map((x) => x.trim()).filter(Boolean)) {
        await run('taskkill', ['/IM', /\.exe$/i.test(name) ? name : `${name}.exe`]);
      }
      return null;
    }
    case 'power': {
      const guid = PLANS[a.plan];
      if (!guid) return null;
      if (!ctx.savedPlan) ctx.savedPlan = await activePlan();
      const out = await run('powercfg', ['/setactive', guid]);
      return out == null ? `The ${a.plan} power plan is not on this PC` : null;
    }
    case 'restorePower': {
      if (ctx.savedPlan) await run('powercfg', ['/setactive', ctx.savedPlan]);
      return null;
    }
    case 'obs': {
      const obs = findObs();
      if (!obs) return 'OBS was not found';
      await startDetached(obs, ['--startrecording', '--minimize-to-tray'], path.dirname(obs));
      return null;
    }
    default:
      return null;
  }
}

async function runActions(list, ctx = {}) {
  const notes = [];
  for (const a of list || []) {
    try { const n = await doAction(a, ctx); if (n) notes.push(n); } catch {}
  }
  return notes;
}

// Adds launch arguments where the launcher supports them.
function withArgs(launch, args, it) {
  const extra = String(args || '').trim();
  if (!extra || !launch) return launch;
  if (launch.type === 'exe') return { ...launch, args: [...(launch.args || []), ...splitArgs(extra)] };
  if (it && it.source === 'steam' && it.steamAppId) return { type: 'url', target: `steam://run/${it.steamAppId}//${encodeURIComponent(extra)}/` };
  return launch;
}

module.exports = { runActions, withArgs, splitArgs, findObs };
