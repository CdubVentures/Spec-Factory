import fsNode from 'node:fs/promises';
import pathNode from 'node:path';

export function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function parseCsvList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseJsonArg(name, value, defaultValue) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  try {
    return JSON.parse(String(value));
  } catch (error) {
    throw new Error(`Invalid JSON for --${name}: ${error.message}`);
  }
}

export function looksHttpUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function filterKeysByBrand(storage, keys, brand) {
  if (!brand) {
    return keys;
  }

  const expected = String(brand).trim().toLowerCase();
  const selected = [];
  for (const key of keys) {
    const job = await storage.readJsonOrNull(key);
    if (!job) {
      continue;
    }
    const currentBrand = String(job.identityLock?.brand || '').trim().toLowerCase();
    if (currentBrand === expected) {
      selected.push(key);
    }
  }
  return selected;
}

export function parseQueuePriority(value, fallback = 3) {
  const parsed = Number.parseInt(String(value || ''), 10);
  const resolved = Number.isFinite(parsed) ? parsed : fallback;
  return Math.max(1, Math.min(5, resolved));
}

export async function assertCategorySchemaReady({ category, storage, config }) {
  const { loadCategoryConfig } = await import('../../categories/loader.js');
  let categoryConfig;
  try {
    categoryConfig = await loadCategoryConfig(category, { storage, config });
  } catch (error) {
    throw new Error(
      `Category '${category}' is not configured. Generate category_authority/${category}/_generated/field_rules.json first. (${error.message})`
    );
  }

  if (!Array.isArray(categoryConfig.fieldOrder) || categoryConfig.fieldOrder.length === 0) {
    throw new Error(`Category '${category}' has no field order in generated field rules.`);
  }
}

export async function openSpecDbForCategory(config, category) {
  const normalizedCategory = String(category || '').trim();
  if (!normalizedCategory) return null;
  try {
    const { SpecDb } = await import('../../db/specDb.js');
    const dbDir = pathNode.join(config.specDbDir || '.workspace/db', normalizedCategory);
    await fsNode.mkdir(dbDir, { recursive: true });
    const dbPath = pathNode.join(dbDir, 'spec.sqlite');
    return new SpecDb({ dbPath, category: normalizedCategory });
  } catch {
    return null;
  }
}
