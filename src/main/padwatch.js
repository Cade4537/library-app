// 0.18.3: the controller, read by Crimson Vault itself, so the guide opens even while the app is
// minimized or in the tray (the page can only read a controller while its window has focus).
// A small PowerShell helper reads Xbox style controllers through XInput (built into Windows) and
// prints a line only when something changes. With no controller plugged in it checks once a second.
// Nothing is sent anywhere: the lines go straight to Crimson Vault on this PC.
const { spawn } = require('child_process');

const CS = `
using System;
using System.Runtime.InteropServices;
using System.Threading;
public static class CvPad {
  [StructLayout(LayoutKind.Sequential)] public struct GP { public ushort b; public byte lt; public byte rt; public short lx; public short ly; public short rx; public short ry; }
  [StructLayout(LayoutKind.Sequential)] public struct ST { public uint pkt; public GP g; }
  [DllImport("xinput1_4.dll", EntryPoint = "#100")] static extern uint GetEx(uint i, out ST s);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, IntPtr pid);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint a, uint b, bool attach);
  [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  // Windows only lets the app in front hand over focus, so join its input for a moment.
  public static void Front(long handle) {
    IntPtr h = new IntPtr(handle);
    IntPtr fg = GetForegroundWindow();
    uint me = GetCurrentThreadId();
    uint other = GetWindowThreadProcessId(fg, IntPtr.Zero);
    bool joined = other != 0 && other != me && AttachThreadInput(me, other, true);
    BringWindowToTop(h); SetForegroundWindow(h);
    if (joined) AttachThreadInput(me, other, false);
    if (GetForegroundWindow() != h) { keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero); SetForegroundWindow(h); }
  }
  public static void Run() {
    new Thread(() => {
      string line;
      while ((line = Console.ReadLine()) != null) {
        if (line.StartsWith("front:")) { long v; if (long.TryParse(line.Substring(6), out v)) { try { Front(v); } catch {} } }
        else if (line == "quit") Environment.Exit(0);
      }
      Environment.Exit(0);
    }) { IsBackground = true }.Start();
    int last = -1;
    while (true) {
      int mask = 0; bool any = false;
      for (uint i = 0; i < 4; i++) {
        ST s;
        if (GetEx(i, out s) != 0) continue;
        any = true;
        mask |= s.g.b;
        // Left stick counts as the d-pad.
        if (s.g.ly > 16000) mask |= 0x1; if (s.g.ly < -16000) mask |= 0x2;
        if (s.g.lx < -16000) mask |= 0x4; if (s.g.lx > 16000) mask |= 0x8;
        if (s.g.lt > 120) mask |= 0x10000; if (s.g.rt > 120) mask |= 0x20000;
      }
      if (mask != last) { Console.WriteLine("p " + mask); last = mask; }
      Thread.Sleep(any ? 33 : 1000);
    }
  }
}`;

// XInput button bits.
const BITS = { up: 0x1, down: 0x2, left: 0x4, right: 0x8, menu: 0x10, view: 0x20, ls: 0x40, rs: 0x80, lb: 0x100, rb: 0x200, guide: 0x400, a: 0x1000, b: 0x2000, x: 0x4000, y: 0x8000, lt: 0x10000, rt: 0x20000 };

class PadWatch {
  // onInput(name, repeat) for each press; onGuide() when the guide button (or View + Menu) is pressed.
  constructor({ onInput, onGuide, log }) {
    this.onInput = onInput;
    this.onGuide = onGuide;
    this.log = log || (() => {});
    this.proc = null;
    this.mask = 0;
    this.combo = null;
    this.timers = {};
    this.failures = 0;
    this.mode = 'both';
  }

  start(mode) {
    this.mode = mode || 'both';
    if (process.platform !== 'win32' || this.proc || this.mode === 'off') return;
    const ps = `$ProgressPreference='SilentlyContinue'\nAdd-Type -TypeDefinition @'\n${CS}\n'@\n[CvPad]::Run()`;
    try {
      this.proc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(ps, 'utf16le').toString('base64')], { windowsHide: true });
    } catch (e) { this.proc = null; this.log('pad-helper-failed', { e: e.message }); return; }
    const proc = this.proc;
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString('utf8');
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        const m = /^p (\d+)$/.exec(line);
        if (m) { this.failures = 0; this.update(Number(m[1])); }
      }
    });
    proc.stderr.on('data', (d) => this.log('pad-helper-error', { e: String(d).slice(0, 300) }));
    proc.on('close', () => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.clear();
      if (this.mode === 'off' || ++this.failures > 5) return;
      setTimeout(() => this.start(this.mode), 5000 * this.failures);
    });
  }

  stop() {
    const p = this.proc;
    this.proc = null;
    this.clear();
    if (p) { try { p.stdin.write('quit\n'); } catch {} setTimeout(() => { try { p.kill(); } catch {} }, 500); }
  }

  restart(mode) { this.stop(); this.failures = 0; this.start(mode); }

  // Bring a window to the front (the overlay, opened from the controller).
  front(handle) { if (this.proc) { try { this.proc.stdin.write(`front:${handle}\n`); } catch {} } }

  clear() { for (const t of Object.values(this.timers)) clearTimeout(t); this.timers = {}; clearTimeout(this.combo); this.combo = null; this.mask = 0; }

  update(mask) {
    const was = this.mask;
    this.mask = mask;
    const down = (n) => (mask & BITS[n]) && !(was & BITS[n]);
    // The Xbox button, or View + Menu together.
    if (this.mode !== 'combo' && down('guide')) { this.onGuide('guide'); return; }
    const both = (mask & BITS.view) && (mask & BITS.menu);
    if (this.mode !== 'guide' && both && !((was & BITS.view) && (was & BITS.menu))) { clearTimeout(this.timers.solo); delete this.timers.solo; this.onGuide('combo'); return; }
    for (const name of Object.keys(BITS)) {
      if (name === 'guide') continue;
      const on = mask & BITS[name];
      if (on && !(was & BITS[name])) {
        if (both && (name === 'view' || name === 'menu')) continue;
        // View and Menu wait a moment in case the other one follows (View + Menu opens the guide).
        if ((name === 'view' || name === 'menu') && this.mode !== 'guide' && this.mode !== 'off') {
          clearTimeout(this.timers.solo);
          this.timers.solo = setTimeout(() => { delete this.timers.solo; const m = this.mask; if (!((m & BITS.view) && (m & BITS.menu))) this.onInput(name, false); }, 150);
          continue;
        }
        this.onInput(name, false);
        // Directions repeat while held, like the app does.
        if (['up', 'down', 'left', 'right'].includes(name)) {
          const tick = (delay) => { this.timers[name] = setTimeout(() => { if (this.mask & BITS[name]) { this.onInput(name, true); tick(85); } }, delay); };
          tick(380);
        }
      } else if (!on && this.timers[name]) { clearTimeout(this.timers[name]); delete this.timers[name]; }
    }
  }
}

module.exports = { PadWatch, BITS };
