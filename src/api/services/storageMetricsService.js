import fs from 'node:fs/promises';
import path from 'node:path';

const KNOWN_ARTIFACT_TYPES = ['indexlab', 'run_output', 'runtime_traces'];

async function walkDirectory(dir) {
  const files = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkDirectory(fullPath));
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        files.push({ path: fullPath, size: stat.size });
      } catch {
        // Skip files we can't stat (permission errors, etc.)
      }
    }
  }
  return files;
}

export async function computeRunStorageMetrics(runDir) {
  const computed_at = new Date().toISOString();
  let topEntries;
  try {
    topEntries = await fs.readdir(runDir, { withFileTypes: true });
  } catch {
    return { total_size_bytes: 0, artifact_breakdown: [], computed_at };
  }

  const buckets = new Map();

  for (const entry of topEntries) {
    const fullPath = path.join(runDir, entry.name);
    if (entry.isDirectory()) {
      const type = KNOWN_ARTIFACT_TYPES.includes(entry.name) ? entry.name : 'other';
      const files = await walkDirectory(fullPath);
      if (files.length === 0) continue;
      const existing = buckets.get(type) || { type, count: 0, size_bytes: 0, path: `${type}/` };
      existing.count += files.length;
      existing.size_bytes += files.reduce((s, f) => s + f.size, 0);
      if (type === 'other') existing.path = 'other/';
      buckets.set(type, existing);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(fullPath);
        const existing = buckets.get('other') || { type: 'other', count: 0, size_bytes: 0, path: 'other/' };
        existing.count += 1;
        existing.size_bytes += stat.size;
        buckets.set('other', existing);
      } catch {
        // Skip files we can't stat
      }
    }
  }

  const artifact_breakdown = [...buckets.values()];
  const total_size_bytes = artifact_breakdown.reduce((s, e) => s + e.size_bytes, 0);

  return { total_size_bytes, artifact_breakdown, computed_at };
}

export async function computeRunStorageMetricsS3(storage, keyBase) {
  const computed_at = new Date().toISOString();
  if (!storage || !keyBase) {
    return { total_size_bytes: 0, artifact_breakdown: [], computed_at };
  }

  const prefix = `${keyBase.replace(/\/+$/, '')}/`;
  const keys = await storage.listKeys(prefix);
  if (!Array.isArray(keys) || keys.length === 0) {
    return { total_size_bytes: 0, artifact_breakdown: [], computed_at };
  }

  const buckets = new Map();
  for (const key of keys) {
    const relative = String(key || '').slice(prefix.length);
    if (!relative) continue;
    const firstSegment = relative.split('/')[0];
    const type = KNOWN_ARTIFACT_TYPES.includes(firstSegment) ? firstSegment : 'other';
    const existing = buckets.get(type) || { type, count: 0, size_bytes: 0, path: `${type}/` };
    existing.count += 1;
    // S3 listKeys doesn't return sizes; use headObject if available
    buckets.set(type, existing);
  }

  const artifact_breakdown = [...buckets.values()];
  const total_size_bytes = artifact_breakdown.reduce((s, e) => s + e.size_bytes, 0);

  return { total_size_bytes, artifact_breakdown, computed_at };
}

export async function recalculateAllStorageMetrics({
  runDataStorageState,
  indexLabRoot,
  listIndexLabRuns,
  resolveIndexLabRunDirectory,
  onProgress,
} = {}) {
  const errors = [];
  let runsScanned = 0;
  let runsUpdated = 0;
  let totalSizeBytes = 0;

  const runs = await listIndexLabRuns({ limit: 10000 });
  const total = runs.length;

  for (const run of runs) {
    const runId = String(run?.run_id || '').trim();
    if (!runId) continue;
    runsScanned += 1;

    try {
      const runDir = typeof resolveIndexLabRunDirectory === 'function'
        ? (await resolveIndexLabRunDirectory(runId).catch(() => ''))
        : '';
      if (!runDir) continue;

      const metaPath = path.join(runDir, 'run.json');
      let meta;
      try {
        meta = JSON.parse(await fs.readFile(metaPath, 'utf8'));
      } catch {
        continue;
      }

      if (meta.storage_metrics && meta.storage_metrics.computed_at) {
        totalSizeBytes += meta.storage_metrics.total_size_bytes || 0;
        continue;
      }

      // Walk the parent bundle directory (run dir's parent contains the artifact subdirectories)
      const bundleDir = path.dirname(runDir);
      const metrics = await computeRunStorageMetrics(bundleDir);
      meta.storage_metrics = metrics;

      await fs.writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
      runsUpdated += 1;
      totalSizeBytes += metrics.total_size_bytes;
    } catch (err) {
      errors.push({ run_id: runId, error: String(err?.message || err) });
    }

    if (typeof onProgress === 'function') {
      onProgress({ completed: runsScanned, total, currentRunId: runId });
    }
  }

  return { runsScanned, runsUpdated, totalSizeBytes, errors };
}
