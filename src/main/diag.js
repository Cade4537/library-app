// Health log: crashes, hangs and memory use, written to diagnostics.log in the data folder
// so problems that happen while nobody is watching can be looked at later.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const MAX_BYTES = 512 * 1024;
let file = null;

function logFile() {
  if (!file) file = path.join(app.getPath('userData'), 'diagnostics.log');
  return file;
}

function log(event, detail) {
  try {
    const f = logFile();
    try { if (fs.statSync(f).size > MAX_BYTES) fs.renameSync(f, f.replace(/\.log$/, '.old.log')); } catch {}
    const line = `${new Date().toISOString()} ${event}${detail ? ' ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}\n`;
    fs.appendFileSync(f, line);
  } catch {}
}

function tail(n = 40) {
  try {
    const lines = fs.readFileSync(logFile(), 'utf8').trim().split('\n');
    return lines.slice(-n);
  } catch { return []; }
}

// Memory for every part of Crimson Vault (window, GPU, helpers, embedded Discord / Xbox pages).
function snapshot(extra = {}) {
  const byType = {};
  let total = 0;
  for (const m of app.getAppMetrics()) {
    const mb = Math.round(((m.memory && m.memory.workingSetSize) || 0) / 1024);
    byType[m.type] = (byType[m.type] || 0) + mb;
    total += mb;
  }
  const mem = process.memoryUsage();
  return {
    uptimeHours: Math.round((process.uptime() / 3600) * 10) / 10,
    totalMB: total,
    byTypeMB: byType,
    mainHeapMB: Math.round(mem.heapUsed / 1048576),
    processes: app.getAppMetrics().length,
    ...extra,
  };
}

module.exports = { log, tail, snapshot, logFile };
