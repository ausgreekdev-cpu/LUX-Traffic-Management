const { execSync } = require('child_process');
const path = require('path');

exports.default = async function(context) {
  const backendDir = path.join(context.appOutDir, 'resources', 'backend');
  console.log('[afterPack] Rebuilding better-sqlite3 for system Node ABI in:', backendDir);
  try {
    execSync('npm rebuild better-sqlite3', { cwd: backendDir, stdio: 'inherit' });
    console.log('[afterPack] Rebuild complete');
  } catch (e) {
    console.error('[afterPack] Rebuild failed:', e.message);
    throw e;
  }
};
