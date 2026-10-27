const { shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

function spawnDetached(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(cmd, args || [], { cwd, detached: true, stdio: 'ignore', windowsHide: false });
    } catch (e) {
      return reject(e);
    }
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}

async function launchItem(it) {
  const l = it && it.launch;
  if (!l || !l.target) throw new Error('This item has no launch info');
  switch (l.type) {
    case 'url':
      await shell.openExternal(l.target);
      return;
    case 'exe':
      try {
        await spawnDetached(l.target, l.args, l.cwd || path.dirname(l.target));
      } catch (e) {
        // Programs that need admin rights fail to spawn directly; let Windows ask for permission instead.
        const err = await shell.openPath(l.target);
        if (err) throw new Error(err);
      }
      return;
    case 'path': {
      const err = await shell.openPath(l.target);
      if (err) throw new Error(err);
      return;
    }
    case 'aumid':
      await spawnDetached('explorer.exe', [`shell:AppsFolder\\${l.target}`]);
      return;
    default:
      throw new Error(`Unknown launch type ${l.type}`);
  }
}

module.exports = { launchItem };
