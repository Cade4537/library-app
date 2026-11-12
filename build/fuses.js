// 0.18.4: Electron "fuses" are switches baked into the app's .exe at build time. These close ways
// another program could misuse Crimson Vault.exe: running it as a plain Node.js runner, injecting
// code through NODE_OPTIONS or a debugger flag, or loading code from outside the app package.
// They also encrypt the cookies (sign ins) Electron keeps on disk.
const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

exports.default = async function afterPack(ctx) {
  const name = ctx.packager.appInfo.productFilename;
  const exe = ctx.electronPlatformName === 'win32' ? path.join(ctx.appOutDir, `${name}.exe`)
    : ctx.electronPlatformName === 'darwin' ? path.join(ctx.appOutDir, `${name}.app`)
      : path.join(ctx.appOutDir, ctx.packager.executableName);
  await flipFuses(exe, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: ctx.electronPlatformName === 'darwin',
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableCookieEncryption]: true,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
  });
};
