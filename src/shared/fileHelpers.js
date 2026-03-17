import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

export async function safeReadJson(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch { return null; }
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

export async function markEnumSuggestionStatus(category, field, value, status = 'accepted', helperRoot = '') {
  const sugPath = path.join(helperRoot, category, '_suggestions', 'enums.json');
  const doc = await safeReadJson(sugPath);
  if (!doc || !Array.isArray(doc.suggestions)) return;
  const normalized = String(value).trim().toLowerCase();
  let changed = false;
  for (const s of doc.suggestions) {
    if (String(s.field_key || '').trim() === field &&
        String(s.value || '').trim().toLowerCase() === normalized &&
        s.status === 'pending') {
      s.status = status;
      s.resolved_at = new Date().toISOString();
      changed = true;
    }
  }
  if (changed) {
    await fs.writeFile(sugPath, JSON.stringify(doc, null, 2));
  }
}

export function safeJoin(basePath, ...parts) {
  const resolved = path.resolve(basePath, ...parts);
  const root = path.resolve(basePath);
  if (resolved === root) return resolved;
  if (!resolved.startsWith(`${root}${path.sep}`)) return null;
  return resolved;
}
