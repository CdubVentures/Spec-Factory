import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { trimVideo } from '../videoTrim.js';

describe('trimVideo', () => {
  it('does not crash when ffmpeg is not installed', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-test-'));
    const fakePath = path.join(tmpDir, 'test.webm');
    fs.writeFileSync(fakePath, 'fake-video-content');

    // Should not throw — graceful fallback
    await trimVideo(fakePath, 1, 5);

    // Original file should still exist (untrimmed)
    assert.ok(fs.existsSync(fakePath));
    assert.equal(fs.readFileSync(fakePath, 'utf8'), 'fake-video-content');

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not crash with invalid time range', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-test-'));
    const fakePath = path.join(tmpDir, 'test.webm');
    fs.writeFileSync(fakePath, 'fake');

    // startSec >= endSec — should return early
    await trimVideo(fakePath, 5, 3);
    assert.ok(fs.existsSync(fakePath));

    // endSec <= 0
    await trimVideo(fakePath, 0, 0);
    assert.ok(fs.existsSync(fakePath));

    fs.rmSync(tmpDir, { recursive: true });
  });

  it('does not leave temp files on failure', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trim-test-'));
    const fakePath = path.join(tmpDir, 'test.webm');
    fs.writeFileSync(fakePath, 'fake');

    await trimVideo(fakePath, 0, 5);

    // No .trimmed.webm leftover
    const files = fs.readdirSync(tmpDir);
    assert.equal(files.length, 1);
    assert.equal(files[0], 'test.webm');

    fs.rmSync(tmpDir, { recursive: true });
  });
});
