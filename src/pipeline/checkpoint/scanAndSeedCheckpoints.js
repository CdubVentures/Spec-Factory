// WHY: Async scanner that walks the checkpoint disk layout and calls
// seedFromCheckpoint for each valid checkpoint found. Used for DB recovery
// when the SQLite database is lost or needs rebuilding from durable artifacts.

import path from 'node:path';
import { listDirs, safeReadJson } from '../../shared/fileHelpers.js';
import { seedFromCheckpoint } from './seedFromCheckpoint.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

function categoryMatches(checkpoint, specDb) {
  const cpCat = String(
    checkpoint.category || checkpoint.run?.category || '',
  ).trim();
  return cpCat === specDb.category;
}

export async function scanAndSeedCheckpoints({ specDb, indexLabRoot, productRoot }) {
  if (!specDb) throw new Error('scanAndSeedCheckpoints requires specDb');
  if (!indexLabRoot) throw new Error('scanAndSeedCheckpoints requires indexLabRoot');

  const stats = {
    products_found: 0,
    products_seeded: 0,
    runs_found: 0,
    runs_seeded: 0,
    sources_seeded: 0,
    artifacts_seeded: 0,
    cooldowns_seeded: 0,
    errors: [],
  };

  // Phase 1: Product checkpoints (products first → seeds products + queue tables)
  // WHY: Scan productRoot (.workspace/products/). Fall back to indexLabRoot/products when
  // productRoot is not provided (backward compat for tests/callers).
  const scanDirs = [];
  const effectiveProductRoot = productRoot || path.join(indexLabRoot, 'products');
  const primaryDirs = await listDirs(effectiveProductRoot);
  for (const d of primaryDirs) {
    scanDirs.push({ dir: d, base: effectiveProductRoot });
  }
  for (const { dir, base } of scanDirs) {
    const filePath = path.join(base, dir, 'product.json');
    const cp = await safeReadJson(filePath);
    if (!cp || cp.checkpoint_type !== 'product') continue;
    stats.products_found += 1;
    if (!categoryMatches(cp, specDb)) continue;
    try {
      const r = seedFromCheckpoint({ specDb, checkpoint: cp });
      if (r.product_seeded) stats.products_seeded += 1;
      stats.cooldowns_seeded += r.cooldowns_seeded || 0;
    } catch (err) {
      stats.errors.push({ file: filePath, error: String(err.message || err) });
    }
  }

  // Phase 2: Crawl checkpoints (runs second → seeds product_runs with is_latest logic)
  const topDirs = await listDirs(indexLabRoot);
  const runEntries = [];
  for (const dir of topDirs) {
    if (dir === 'products') continue;
    const filePath = path.join(indexLabRoot, dir, 'run.json');
    const cp = await safeReadJson(filePath);
    if (!cp || cp.checkpoint_type !== 'crawl') continue;
    stats.runs_found += 1;
    if (!categoryMatches(cp, specDb)) continue;
    runEntries.push({ filePath, cp, createdAt: cp.created_at || '' });
  }

  // Sort oldest first → newest processed last → gets is_latest=true
  runEntries.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const { filePath, cp } of runEntries) {
    try {
      const r = seedFromCheckpoint({ specDb, checkpoint: cp });
      stats.runs_seeded += 1;
      stats.sources_seeded += r.sources_seeded;
      stats.artifacts_seeded += r.artifacts_seeded;
    } catch (err) {
      stats.errors.push({ file: filePath, error: String(err.message || err) });
    }
  }

  return stats;
}
