import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

// WHY: Detect ffmpeg at module load. Checks PATH first, then falls back to
// known winget install location. On Windows, winget updates the system PATH
// but child processes inherit the parent's old PATH until a full restart.
function detectFfmpeg() {
  // Try PATH first
  try {
    execFileSync('ffmpeg', ['-version'], { timeout: 3000, stdio: 'ignore' });
    return true;
  } catch { /* not in current PATH */ }

  // Fallback: check winget install directory (Windows)
  if (process.platform === 'win32') {
    try {
      const wingetPkgs = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
      if (existsSync(wingetPkgs)) {
        const ffmpegDirs = readdirSync(wingetPkgs).filter((d) => d.startsWith('Gyan.FFmpeg'));
        for (const dir of ffmpegDirs) {
          const binDir = path.join(wingetPkgs, dir);
          // Walk one level to find the versioned folder with bin/ffmpeg.exe
          try {
            const sub = readdirSync(binDir).find((s) => existsSync(path.join(binDir, s, 'bin', 'ffmpeg.exe')));
            if (sub) {
              const ffmpegPath = path.join(binDir, sub, 'bin', 'ffmpeg.exe');
              execFileSync(ffmpegPath, ['-version'], { timeout: 3000, stdio: 'ignore' });
              return true;
            }
          } catch { /* scan failed */ }
        }
      }
    } catch { /* winget dir not accessible */ }
  }

  return false;
}

let _ffmpegAvailable = detectFfmpeg();

export function createInfraHealthRoutes({
  jsonRes,
  DIST_ROOT,
  processRef = process,
} = {}) {
  return async function handleInfraHealth(parts, _params, method, _req, res) {
    if (parts[0] !== 'health' && !(parts.length === 0 && method === 'GET')) {
      return false;
    }

    return jsonRes(res, 200, {
      ok: true,
      service: 'gui-server',
      dist_root: DIST_ROOT,
      cwd: processRef.cwd(),
      isPkg: typeof processRef.pkg !== 'undefined',
      ffmpegAvailable: _ffmpegAvailable,
    });
  };
}
