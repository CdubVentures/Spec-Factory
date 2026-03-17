import { toPosix } from './publishPrimitives.js';

export function outputModernKey(parts = []) {
  return toPosix('output', ...parts);
}

export function outputLegacyKey(storage, parts = []) {
  return storage.resolveOutputKey('output', ...parts);
}

export async function readJsonDual(storage, parts = []) {
  const modern = await storage.readJsonOrNull(outputModernKey(parts));
  if (modern) {
    return modern;
  }
  return await storage.readJsonOrNull(outputLegacyKey(storage, parts));
}

export async function writeJsonDual(storage, parts = [], payload = {}) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), 'utf8');
  await storage.writeObject(outputModernKey(parts), body, { contentType: 'application/json' });
  await storage.writeObject(outputLegacyKey(storage, parts), body, { contentType: 'application/json' });
}

export async function writeTextDual(storage, parts = [], text = '', contentType = 'text/plain; charset=utf-8') {
  const body = Buffer.from(String(text || ''), 'utf8');
  await storage.writeObject(outputModernKey(parts), body, { contentType });
  await storage.writeObject(outputLegacyKey(storage, parts), body, { contentType });
}

export async function writeBufferDual(storage, parts = [], buffer, contentType = 'application/octet-stream') {
  await storage.writeObject(outputModernKey(parts), buffer, { contentType });
  await storage.writeObject(outputLegacyKey(storage, parts), buffer, { contentType });
}

export async function listOutputKeys(storage, parts = []) {
  const prefixes = [outputModernKey(parts), outputLegacyKey(storage, parts)];
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
