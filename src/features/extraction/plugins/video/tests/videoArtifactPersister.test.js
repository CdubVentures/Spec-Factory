import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { persistVideoArtifact } from '../videoArtifactPersister.js';

function makeTempDir(prefix = 'vid-test-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFakeVideo(dir, filename = 'fetch-1.webm') {
  fs.mkdirSync(dir, { recursive: true });
  const videoPath = path.join(dir, filename);
  const bytes = Buffer.alloc(1024, 0xAB);
  fs.writeFileSync(videoPath, bytes);
  return videoPath;
}

test('persistVideoArtifact copies video to videoDir and returns metadata', () => {
  const srcDir = makeTempDir('vid-src-');
  const dstDir = path.join(makeTempDir('vid-dst-'), 'video');
  const videoPath = writeFakeVideo(srcDir);

  const result = persistVideoArtifact({
    videoPath,
    videoDir: dstDir,
    workerId: 'fetch-1',
    url: 'https://razer.com/viper',
  });

  assert.ok(result, 'should return metadata');
  assert.equal(result.filename, 'fetch-1.webm');
  assert.equal(result.worker_id, 'fetch-1');
  assert.equal(result.size_bytes, 1024);
  assert.equal(result.format, 'webm');
  assert.equal(typeof result.content_hash, 'string');
  assert.ok(result.content_hash.length > 10);
  assert.equal(typeof result.captured_at, 'string');

  const destPath = path.join(dstDir, 'fetch-1.webm');
  assert.ok(fs.existsSync(destPath), 'file should exist in videoDir');
  assert.equal(fs.readFileSync(destPath).length, 1024);

  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.rmSync(path.dirname(dstDir), { recursive: true, force: true });
});

test('persistVideoArtifact returns null for missing source file', () => {
  const dstDir = path.join(makeTempDir('vid-dst-'), 'video');

  const result = persistVideoArtifact({
    videoPath: '/nonexistent/fetch-1.webm',
    videoDir: dstDir,
    workerId: 'fetch-1',
    url: 'https://razer.com/viper',
  });

  assert.equal(result, null);
  fs.rmSync(path.dirname(dstDir), { recursive: true, force: true });
});

test('persistVideoArtifact returns null for empty workerId', () => {
  const srcDir = makeTempDir('vid-src-');
  const dstDir = path.join(makeTempDir('vid-dst-'), 'video');
  const videoPath = writeFakeVideo(srcDir);

  const result = persistVideoArtifact({
    videoPath,
    videoDir: dstDir,
    workerId: '',
    url: 'https://razer.com/viper',
  });

  assert.equal(result, null);
  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.rmSync(path.dirname(dstDir), { recursive: true, force: true });
});

test('persistVideoArtifact creates videoDir if missing', () => {
  const srcDir = makeTempDir('vid-src-');
  const dstDir = path.join(makeTempDir('vid-dst-'), 'deeply', 'nested', 'video');
  const videoPath = writeFakeVideo(srcDir);

  const result = persistVideoArtifact({
    videoPath,
    videoDir: dstDir,
    workerId: 'fetch-3',
    url: 'https://rtings.com/mouse',
  });

  assert.ok(result);
  assert.ok(fs.existsSync(path.join(dstDir, 'fetch-3.webm')));

  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.rmSync(path.resolve(dstDir, '../../..'), { recursive: true, force: true });
});

test('persistVideoArtifact calls insertVideo when provided', () => {
  const srcDir = makeTempDir('vid-src-');
  const dstDir = path.join(makeTempDir('vid-dst-'), 'video');
  const videoPath = writeFakeVideo(srcDir);
  const inserted = [];

  const result = persistVideoArtifact({
    videoPath,
    videoDir: dstDir,
    workerId: 'fetch-2',
    url: 'https://rtings.com/mouse',
    insertVideo: (row) => inserted.push(row),
    runContext: { category: 'mouse', productId: 'mouse-razer-viper', runId: 'run-001', host: 'rtings.com' },
  });

  assert.ok(result);
  assert.equal(inserted.length, 1);
  assert.equal(inserted[0].worker_id, 'fetch-2');
  assert.equal(inserted[0].category, 'mouse');
  assert.equal(inserted[0].product_id, 'mouse-razer-viper');
  assert.equal(inserted[0].run_id, 'run-001');
  assert.equal(inserted[0].format, 'webm');
  assert.equal(inserted[0].size_bytes, 1024);

  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.rmSync(path.dirname(dstDir), { recursive: true, force: true });
});

test('persistVideoArtifact continues when insertVideo throws', () => {
  const srcDir = makeTempDir('vid-src-');
  const dstDir = path.join(makeTempDir('vid-dst-'), 'video');
  const videoPath = writeFakeVideo(srcDir);

  const result = persistVideoArtifact({
    videoPath,
    videoDir: dstDir,
    workerId: 'fetch-4',
    url: 'https://example.com',
    insertVideo: () => { throw new Error('SQL exploded'); },
    runContext: { category: 'mouse', productId: 'test', runId: 'run-x', host: 'example.com' },
  });

  assert.ok(result, 'should still return metadata despite SQL failure');
  assert.equal(result.filename, 'fetch-4.webm');
  assert.ok(fs.existsSync(path.join(dstDir, 'fetch-4.webm')));

  fs.rmSync(srcDir, { recursive: true, force: true });
  fs.rmSync(path.dirname(dstDir), { recursive: true, force: true });
});
