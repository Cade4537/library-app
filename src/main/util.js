const { spawn } = require('child_process');
const fs = require('fs');
const fsp = fs.promises;
const crypto = require('crypto');

// Runs a PowerShell script and returns its text output (or null on failure).
function runPowerShell(script, timeoutMs = 45000) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') return resolve(null);
    const full =
      "[Console]::OutputEncoding=[Text.Encoding]::UTF8\n$ProgressPreference='SilentlyContinue'\n$ErrorActionPreference='SilentlyContinue'\n" +
      script;
    const encoded = Buffer.from(full, 'utf16le').toString('base64');
    let ps;
    try {
      ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded], {
        windowsHide: true,
      });
    } catch {
      return resolve(null);
    }
    const chunks = [];
    ps.stdout.on('data', (d) => chunks.push(d));
    ps.stderr.on('data', () => {});
    const timer = setTimeout(() => {
      try { ps.kill(); } catch {}
      resolve(null);
    }, timeoutMs);
    ps.on('error', () => { clearTimeout(timer); resolve(null); });
    ps.on('close', () => { clearTimeout(timer); resolve(Buffer.concat(chunks).toString('utf8').trim()); });
  });
}

async function runPowerShellJson(script, timeoutMs) {
  const out = await runPowerShell(script, timeoutMs);
  if (!out) return null;
  const clean = out.replace(/^﻿/, '');
  try { return JSON.parse(clean); } catch {}
  const i = clean.search(/[\[{]/);
  if (i >= 0) { try { return JSON.parse(clean.slice(i)); } catch {} }
  return null;
}

async function exists(p) {
  if (!p) return false;
  try { await fsp.access(p); return true; } catch { return false; }
}

async function readJson(p) {
  try { return JSON.parse((await fsp.readFile(p, 'utf8')).replace(/^﻿/, '')); } catch { return null; }
}

async function listDir(p) {
  try { return await fsp.readdir(p, { withFileTypes: true }); } catch { return []; }
}

const hash = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);

const asArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Word overlap score between two names, 0 to 1.
function similarity(a, b) {
  const A = new Set(normName(a).split(' ').filter(Boolean));
  const B = new Set(normName(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / new Set([...A, ...B]).size;
}

// Splits a command line argument string, keeping quoted parts together.
function splitArgs(str) {
  const out = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(String(str || '')))) out.push(m[1] !== undefined ? m[1] : m[2]);
  return out;
}

module.exports = { runPowerShell, runPowerShellJson, exists, readJson, listDir, hash, asArray, normName, similarity, splitArgs, fsp };
