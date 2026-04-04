// ── Consolidated Overrides I/O ───────────────────────────────────────────────
//
// Reads and writes the per-category consolidated overrides.json (v2 format).
// One file per category at: category_authority/{cat}/_overrides/overrides.json
// This is the JSON SSOT for override state. SQL tables are derived cache.
//
// WHY src/shared/: consumed by seed.js, catalogProductLoader, publishSpecBuilders,
// overrideWorkflow, and artifactMigration — crosses feature boundaries.

import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso } from './primitives.js';

// ── Write Serialization ─────────────────────────────────────────────────────
// WHY: Per-category promise chain prevents concurrent read-modify-write from
// losing updates. Single-user app, but multiple async operations can overlap.

const writeLocks = new Map();

function withCategoryLock(category, fn) {
  const prev = writeLocks.get(category) || Promise.resolve();
  const next = prev.then(fn, fn);
  writeLocks.set(category, next);
  return next;
}

// ── Path Resolution ─────────────────────────────────────────────────────────

export function resolveConsolidatedOverridePath({ config = {}, category }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  return path.join(helperRoot, category, '_overrides', 'overrides.json');
}

// ── Read ─────────────────────────────────────────────────────────────────────

function emptyEnvelope(category) {
  return {
    version: 2,
    category,
    updated_at: nowIso(),
    products: {},
  };
}

export async function readConsolidatedOverrides({ config = {}, category }) {
  const filePath = resolveConsolidatedOverridePath({ config, category });
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        version: parsed.version ?? 2,
        category: parsed.category ?? category,
        updated_at: parsed.updated_at ?? nowIso(),
        products: (parsed.products && typeof parsed.products === 'object' && !Array.isArray(parsed.products))
          ? parsed.products
          : {},
      };
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return emptyEnvelope(category);
    // Invalid JSON or other read error — return empty
  }
  return emptyEnvelope(category);
}

export async function readProductFromConsolidated({ config = {}, category, productId }) {
  const envelope = await readConsolidatedOverrides({ config, category });
  const entry = envelope.products[productId];
  return entry && typeof entry === 'object' ? entry : null;
}

// ── Write ────────────────────────────────────────────────────────────────────

export async function writeConsolidatedOverrides({ config = {}, category, envelope }) {
  const filePath = resolveConsolidatedOverridePath({ config, category });
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const tmpPath = filePath + '.tmp';
  const output = {
    ...envelope,
    version: 2,
    category,
    updated_at: nowIso(),
  };
  await fs.writeFile(tmpPath, JSON.stringify(output, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

// ── Upsert (serialized read-modify-write) ────────────────────────────────────

export async function upsertProductInConsolidated({ config = {}, category, productId, productEntry }) {
  return withCategoryLock(category, async () => {
    const envelope = await readConsolidatedOverrides({ config, category });
    envelope.products[productId] = productEntry;
    await writeConsolidatedOverrides({ config, category, envelope });
  });
}

// ── Remove (serialized read-modify-write) ────────────────────────────────────

export async function removeProductFromConsolidated({ config = {}, category, productId }) {
  return withCategoryLock(category, async () => {
    const envelope = await readConsolidatedOverrides({ config, category });
    delete envelope.products[productId];
    await writeConsolidatedOverrides({ config, category, envelope });
  });
}
