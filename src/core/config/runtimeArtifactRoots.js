import os from 'node:os';
import path from 'node:path';

const DEFAULT_RUNTIME_ARTIFACT_DIR = 'spec-factory';

// WHY: Runs must survive reboots. os.tmpdir() is volatile on most OSes.
// Use the platform-standard persistent app-data directory instead.
function persistentAppDataRoot() {
  if (process.platform === 'win32') {
    const localAppData = String(process.env.LOCALAPPDATA || '').trim();
    if (localAppData) return localAppData;
    return path.join(os.homedir(), 'AppData', 'Local');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  const xdg = String(process.env.XDG_DATA_HOME || '').trim();
  if (xdg) return xdg;
  return path.join(os.homedir(), '.local', 'share');
}

function defaultRuntimeArtifactRoot() {
  return path.resolve(persistentAppDataRoot(), DEFAULT_RUNTIME_ARTIFACT_DIR);
}

export function defaultLocalOutputRoot() {
  return path.resolve(defaultRuntimeArtifactRoot(), 'output');
}

export function defaultIndexLabRoot() {
  return path.resolve(defaultRuntimeArtifactRoot(), 'indexlab');
}
