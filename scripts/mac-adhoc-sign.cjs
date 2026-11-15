// electron-builder afterPack hook: ad-hoc sign the Mac app.
// With no signing identity, electron-builder leaves Electron's original signature broken after it
// edits the bundle, and Apple silicon Macs then report the app as "damaged". An ad-hoc signature
// keeps the bundle valid, so Gatekeeper shows the usual "unverified developer" prompt instead,
// which people can get past with Control-click > Open or Privacy & Security > Open Anyway.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function adHocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], { stdio: 'inherit' });
  console.log(`Ad-hoc signed ${app}`);
};
