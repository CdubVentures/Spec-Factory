import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';

import {
  createGuiStaticFileServer,
  resolveStaticMimeType,
} from '../staticFileServer.js';
import { createCaptureResponse } from './helpers/appApiTestBuilders.js';

async function createDistRoot(t, files) {
  const distRoot = await mkdtemp(path.join(os.tmpdir(), 'specfactory-static-'));
  t.after(async () => {
    await rm(distRoot, { recursive: true, force: true });
  });

  await Promise.all(
    Object.entries(files).map(async ([relativePath, content]) => {
      const filePath = path.join(distRoot, relativePath);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content, 'utf8');
    }),
  );

  return distRoot;
}

test('static file server streams requested assets with mime and cache headers', async (t) => {
  const distRoot = await createDistRoot(t, {
    'index.html': '<html>shell</html>',
    'assets/main.js': 'console.log("main");',
  });
  const serveStatic = createGuiStaticFileServer({
    distRoot,
    pathModule: path,
    createReadStream: fs.createReadStream,
  });

  const res = createCaptureResponse();
  serveStatic({ url: '/assets/main.js' }, res);
  await finished(res);

  assert.equal(res.body, 'console.log("main");');
  assert.equal(res.getHeader('Content-Type'), 'application/javascript');
  assert.equal(res.getHeader('Cache-Control'), 'no-cache, no-store, must-revalidate');
  assert.equal(res.getHeader('Pragma'), 'no-cache');
  assert.equal(res.getHeader('Expires'), '0');
});

test('static file server serves the SPA shell for extensionless routes', async (t) => {
  const distRoot = await createDistRoot(t, {
    'index.html': '<html>runtime ops</html>',
  });
  const serveStatic = createGuiStaticFileServer({
    distRoot,
    pathModule: path,
    createReadStream: fs.createReadStream,
  });

  const res = createCaptureResponse();
  serveStatic({ url: '/runtime-ops' }, res);
  await finished(res);

  assert.equal(res.body, '<html>runtime ops</html>');
  assert.equal(res.getHeader('Content-Type'), 'text/html');
});

test('static file server falls back to index.html when an asset is missing', async (t) => {
  const distRoot = await createDistRoot(t, {
    'index.html': '<html>fallback shell</html>',
  });
  const serveStatic = createGuiStaticFileServer({
    distRoot,
    pathModule: path,
    createReadStream: fs.createReadStream,
  });

  const res = createCaptureResponse();
  serveStatic({ url: '/assets/missing.js' }, res);
  await finished(res);

  assert.equal(res.body, '<html>fallback shell</html>');
  assert.equal(res.getHeader('Content-Type'), 'text/html');
});

test('static file server returns 404 when both the asset and shell are missing', async (t) => {
  const distRoot = await createDistRoot(t, {});
  const serveStatic = createGuiStaticFileServer({
    distRoot,
    pathModule: path,
    createReadStream: fs.createReadStream,
  });

  const res = createCaptureResponse();
  serveStatic({ url: '/assets/missing.js' }, res);
  await finished(res);

  assert.equal(res.statusCode, 404);
  assert.equal(res.body, 'Not Found');
});

test('resolveStaticMimeType maps known extensions and falls back to octet-stream', () => {
  assert.equal(resolveStaticMimeType('.css'), 'text/css');
  assert.equal(resolveStaticMimeType('.png'), 'image/png');
  assert.equal(resolveStaticMimeType('.unknown-ext'), 'application/octet-stream');
});
