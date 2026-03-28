/**
 * Trims a WebM video file to a specific time window using ffmpeg.
 * Graceful fallback: if ffmpeg is not installed or trim fails,
 * the original untrimmed video is kept.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { rename, unlink } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

/**
 * @param {string} inputPath — path to the .webm file
 * @param {number} startSec  — trim start in seconds (relative to video start)
 * @param {number} endSec    — trim end in seconds (relative to video start)
 */
export async function trimVideo(inputPath, startSec, endSec) {
  if (startSec >= endSec || endSec <= 0) return;

  const tmpPath = inputPath + '.trimmed.webm';
  try {
    await execFileAsync('ffmpeg', [
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
    // This is expected on systems without ffmpeg. Non-fatal.
    try { await unlink(tmpPath); } catch { /* cleanup best-effort */ }
  }
}
