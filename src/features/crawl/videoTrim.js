/**
 * Trims a WebM video file to a specific time window using ffmpeg.
 * Graceful fallback: if ffmpeg is not installed or trim fails,
 * the original untrimmed video is kept.
 */

import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { rename, unlink } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// WHY: On Windows, winget installs ffmpeg but the running process may not
// have the updated PATH. Resolve the ffmpeg binary path once at module load.
function resolveFfmpegPath() {
  try {
    execFileSync('ffmpeg', ['-version'], { timeout: 3000, stdio: 'ignore' });
    return 'ffmpeg';
  } catch { /* not in PATH */ }

  if (process.platform === 'win32') {
    try {
      const wingetPkgs = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
      if (existsSync(wingetPkgs)) {
        const ffmpegDirs = readdirSync(wingetPkgs).filter((d) => d.startsWith('Gyan.FFmpeg'));
        for (const dir of ffmpegDirs) {
          const binDir = path.join(wingetPkgs, dir);
          try {
            const sub = readdirSync(binDir).find((s) => existsSync(path.join(binDir, s, 'bin', 'ffmpeg.exe')));
            if (sub) return path.join(binDir, sub, 'bin', 'ffmpeg.exe');
          } catch { /* scan failed */ }
        }
      }
    } catch { /* not accessible */ }
  }

  return 'ffmpeg';
}

const _ffmpegBin = resolveFfmpegPath();

/**
 * @param {string} inputPath — path to the .webm file
 * @param {number} startSec  — trim start in seconds (relative to video start)
 * @param {number} endSec    — trim end in seconds (relative to video start)
 */
export async function trimVideo(inputPath, startSec, endSec) {
  if (startSec >= endSec || endSec <= 0) return;

  const tmpPath = inputPath + '.trimmed.webm';
  try {
    await execFileAsync(_ffmpegBin, [
      '-y', '-i', inputPath,
      '-ss', String(startSec),
      '-to', String(endSec),
      '-c', 'copy',
      tmpPath,
    ], { timeout: 10000 });
    await unlink(inputPath);
    await rename(tmpPath, inputPath);
  } catch {
    // WHY: ffmpeg not installed or trim failed — keep untrimmed original.
    try { await unlink(tmpPath); } catch { /* cleanup best-effort */ }
  }
}
