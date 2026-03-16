/**
 * File I/O, hashing, and directory utilities for the compiler.
 * Leaf node — no internal imports (uses own sortDeep/stableStringify).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const SHARED_SCHEMA_FILES = {
  'field_rules.json': 'base_field_schema.json',
  'ui_field_catalog.json': 'ui_field_catalog_schema.json',
  'known_values.json': 'known_values_schema.json',
  'parse_templates.json': 'parse_templates_schema.json',
  'cross_validation_rules.json': 'cross_validation_rules_schema.json',
  'field_groups.json': 'field_groups_schema.json',
  'key_migrations.json': 'key_migrations_schema.json',
  component_db: 'base_component_schema.json'
};

function isObjectLocal(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function sortDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortDeep(item));
  }
  if (!isObjectLocal(value)) {
    return value;
  }
  const out = {};
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
    out[key] = sortDeep(value[key]);
  }
  return out;
}

export function stableStringify(value) {
  return JSON.stringify(sortDeep(value), null, 2);
}

export async function writeJsonStable(filePath, payload) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${stableStringify(payload)}\n`, 'utf8');
}

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function stripVolatileKeys(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stripVolatileKeys(item));
  }
  if (!isObjectLocal(value)) {
    return value;
  }
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    if (
      key === 'generated_at' ||
      key === 'compiled_at' ||
      key === 'created_at' ||
      key === 'version_id'
    ) {
      continue;
    }
    out[key] = stripVolatileKeys(nested);
  }
  return out;
}

export async function hashFileWithMeta(filePath) {
  const buffer = await fs.readFile(filePath);
  const text = buffer.toString('utf8');
  try {
    const parsed = JSON.parse(text);
    const semantic = stableStringify(stripVolatileKeys(parsed));
    return {
      sha256: sha256Buffer(Buffer.from(semantic, 'utf8')),
      bytes: buffer.length
    };
  } catch {
    // Non-JSON files are hashed byte-for-byte.
  }
  return {
    sha256: sha256Buffer(buffer),
    bytes: buffer.length
  };
}

export async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureSharedSchemaPack(helperRootInput = '') {
  const helperRoot = path.resolve(helperRootInput || 'category_authority');
  const targetSharedRoot = path.join(helperRoot, '_global', '_shared');
  const sourceSharedRoot = path.resolve('category_authority', '_global', '_shared');
  await fs.mkdir(targetSharedRoot, { recursive: true });

  const copied = [];
  const missing = [];
  const fileNames = [...new Set(Object.values(SHARED_SCHEMA_FILES))];
  for (const fileName of fileNames) {
    const targetPath = path.join(targetSharedRoot, fileName);
    if (await fileExists(targetPath)) {
      continue;
    }
    const sourcePath = path.join(sourceSharedRoot, fileName);
    if (await fileExists(sourcePath)) {
      await fs.copyFile(sourcePath, targetPath);
      copied.push(targetPath);
      continue;
    }
    missing.push(fileName);
  }

  return {
    shared_root: targetSharedRoot,
    copied,
    missing
  };
}

export async function listJsonFilesRecursive(rootDir) {
  const out = [];
  async function walk(currentDir) {
    let entries = [];
    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
    for (const entry of entries) {
      const nextPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(nextPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.json')) {
        out.push(nextPath);
      }
    }
  }
  await walk(rootDir);
  out.sort((a, b) => a.localeCompare(b));
  return out;
}

export async function copyDirectoryRecursive(sourceDir, targetDir) {
  let entries = [];
  try {
    entries = await fs.readdir(sourceDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
  await fs.mkdir(targetDir, { recursive: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryRecursive(sourcePath, targetPath);
      continue;
    }
    if (entry.isFile()) {
      await fs.copyFile(sourcePath, targetPath);
    }
  }
}

export async function writeIfMissing(filePath, payload) {
  if (await fileExists(filePath)) {
    return false;
  }
  await writeJsonStable(filePath, payload);
  return true;
}
