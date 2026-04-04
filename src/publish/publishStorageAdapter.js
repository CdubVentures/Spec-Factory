import { toPosix } from './publishPrimitives.js';

export function outputKey(parts = []) {
  return toPosix('output', ...parts);
}

export async function readJson(storage, parts = []) {
  return await storage.readJsonOrNull(outputKey(parts));
}

export async function writeJson(storage, parts = [], payload = {}) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  await storage.writeObject(outputKey(parts), body, { contentType: 'application/json' });
}

export async function writeText(storage, parts = [], text = '', contentType = 'text/plain; charset=utf-8') {
  const body = Buffer.from(String(text || ''), 'utf8');
  await storage.writeObject(outputKey(parts), body, { contentType });
}

export async function writeBuffer(storage, parts = [], buffer, contentType = 'application/octet-stream') {
  await storage.writeObject(outputKey(parts), buffer, { contentType });
}

// WHY: listKeys() does NOT strip the specs/outputs/ prefix, so it can
// still find files in raw legacy directories on disk. Keep dual-listing
// for backward compat with old data.
export async function listOutputKeys(storage, parts = []) {
  const prefixes = [outputKey(parts), storage.resolveOutputKey('output', ...parts)];
  const seen = new Set();
  const out = [];
  for (const prefix of prefixes) {
    const keys = await storage.listKeys(prefix);
    for (const key of keys) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out.sort();
}
