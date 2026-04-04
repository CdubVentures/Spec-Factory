import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

export async function safeReadJson(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch { return null; }
}

// WHY: For seed paths where malformed JSON must NOT be treated as "empty."
// Returns null only for missing files (ENOENT). Throws on parse errors with
// a clear message so corrupt JSON is caught, not silently ignored.
export async function readJsonOrThrow(filePath) {
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
  try {
    return JSON.parse(text);
  } catch (parseErr) {
    throw new Error(`Invalid JSON in ${filePath}: ${parseErr.message}`);
  }
}

export async function safeStat(filePath) {
  try { return await fs.stat(filePath); } catch { return null; }
}

export async function listDirs(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
  } catch { return []; }
}

export async function listFiles(dirPath, ext = '') {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && (!ext || e.name.endsWith(ext)))
      .map(e => e.name)
      .sort();
  } catch { return []; }
}

export async function readJsonlEvents(filePath) {
  let text = '';
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export async function readGzipJsonlEvents(filePath) {
  let buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return [];
  }
  let text = '';
  try {
    text = zlib.gunzipSync(buffer).toString('utf8');
  } catch {
    return [];
  }
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function parseNdjson(text = '') {
  return String(text || '')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function safeJoin(basePath, ...parts) {
  const resolved = path.resolve(basePath, ...parts);
  const root = path.resolve(basePath);
  if (resolved === root) return resolved;
  if (!resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}
