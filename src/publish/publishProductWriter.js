import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import semver from 'semver';
import {
  nowIso,
  normalizeToken,
  isObject,
  parseDateMs,
  toNumber,
  toInt,
  csvEscape
} from './publishPrimitives.js';
import {
  outputKey,
  readJson,
  writeJson,
  writeText,
  writeBuffer,
  listOutputKeys
} from './publishStorageAdapter.js';
import {
  inferProductIdFromKey,
  normalizeSpecForCompact,
  toJsonLdProduct,
  toMarkdownRecord
} from './publishSpecBuilders.js';

export async function readLatestArtifacts(storage, category, productId, specDb = null) {
  // WHY: SQL is sole source. File reads to latest/{normalized,provenance,summary}.json removed —
  // no field values are produced by the pipeline yet. Will return data once validation stage exists.
  const normalized = specDb ? specDb.getNormalizedForProduct(productId) : null;
  const provenance = specDb ? (specDb.getProvenanceForProduct(category, productId) ?? {}) : {};
  const summary = specDb ? specDb.getSummaryForProduct(productId) : null;
  return {
    normalized: isObject(normalized) && isObject(normalized.fields) ? normalized : null,
    provenance: isObject(provenance) ? provenance : {},
    summary: isObject(summary) ? summary : {}
  };
}

export async function readPublishedCurrent(storage, category, productId) {
  return await readJson(storage, [category, 'published', productId, 'current.json']);
}

export async function readPublishedProductChangelog(storage, category, productId) {
  const parsed = await readJson(storage, [category, 'published', productId, 'changelog.json']);
  if (!isObject(parsed) || !Array.isArray(parsed.entries)) {
    return {
      version: 1,
      category,
      product_id: productId,
      generated_at: nowIso(),
      entries: []
    };
  }
  return parsed;
}

export async function writePublishedProductFiles({
  storage,
  category,
  productId,
  fullRecord,
  previousRecord,
  changes,
  warnings = []
}) {
  const previousVersion = semver.valid(String(previousRecord?.published_version || ''))
    ? String(previousRecord.published_version)
    : null;
  const changed = changes.length > 0 || !previousRecord;
  const nextVersion = !previousRecord
    ? '1.0.0'
    : (changed ? (semver.inc(previousVersion || '1.0.0', 'patch') || '1.0.0') : (previousVersion || '1.0.0'));

  if (!changed && previousRecord) {
    return {
      changed: false,
      published_version: nextVersion,
      change_count: 0,
      warnings
    };
  }

  const nextRecord = {
    ...fullRecord,
    published_version: nextVersion,
    published_at: nowIso()
  };

  if (previousRecord && previousVersion) {
    await writeJson(
      storage,
      [category, 'published', productId, 'versions', `v${previousVersion}.json`],
      previousRecord
    );
  }

  await Promise.all([
    writeJson(storage, [category, 'published', productId, 'current.json'], nextRecord),
    writeJson(storage, [category, 'published', productId, 'compact.json'], normalizeSpecForCompact(nextRecord)),
    writeJson(storage, [category, 'published', productId, 'provenance.json'], {
      product_id: productId,
      category,
      generated_at: nowIso(),
      fields: fullRecord.provenance,
      warnings
    }),
    writeJson(storage, [category, 'published', productId, 'schema_product.jsonld'], toJsonLdProduct(nextRecord)),
    writeText(storage, [category, 'published', productId, 'current.md'], toMarkdownRecord(nextRecord), 'text/markdown; charset=utf-8')
  ]);

  const changelog = await readPublishedProductChangelog(storage, category, productId);
  const entry = {
    version: nextVersion,
    published_at: nextRecord.published_at,
    change_count: changes.length,
    changes
  };
  changelog.generated_at = nowIso();
  changelog.entries = [entry, ...changelog.entries.filter((row) => row?.version !== nextVersion)].slice(0, 200);
  await writeJson(storage, [category, 'published', productId, 'changelog.json'], changelog);

  return {
    changed: true,
    published_version: nextVersion,
    change_count: changes.length,
    warnings
  };
}
export async function listPublishedCurrentRecords(storage, category) {
  const keys = await listOutputKeys(storage, [category, 'published']);
  const currentKeys = keys.filter((key) => String(key || '').replace(/\\/g, '/').endsWith('/current.json'));
  const byProduct = new Map();

  for (const key of currentKeys) {
    const productId = inferProductIdFromKey(key);
    if (!productId) {
      continue;
    }
    const payload = await storage.readJsonOrNull(key);
    if (!isObject(payload)) {
      continue;
    }
    const previous = byProduct.get(productId);
    if (!previous) {
      byProduct.set(productId, payload);
      continue;
    }
    if (parseDateMs(payload.published_at) >= parseDateMs(previous.published_at)) {
      byProduct.set(productId, payload);
    }
  }

  return [...byProduct.values()].sort((a, b) => String(a.product_id || '').localeCompare(String(b.product_id || '')));
}

export function sortIndexItems(items = []) {
  return items
    .slice()
    .sort((a, b) => parseDateMs(b.published_at) - parseDateMs(a.published_at) || String(a.product_id).localeCompare(String(b.product_id)))
    .map((item) => ({
      product_id: item.product_id,
      category: item.category,
      published_version: item.published_version,
      published_at: item.published_at,
      brand: item.identity?.brand || '',
      base_model: item.identity?.base_model || '',
      model: item.identity?.model || '',
      variant: item.identity?.variant || '',
      coverage: toNumber(item.metrics?.coverage, 0),
      avg_confidence: toNumber(item.metrics?.avg_confidence, 0)
    }));
}

export async function writeCategoryIndexAndChangelog(storage, category) {
  const records = await listPublishedCurrentRecords(storage, category);
  const indexPayload = {
    version: 1,
    category,
    generated_at: nowIso(),
    total_products: records.length,
    items: sortIndexItems(records)
  };

  const categoryChangelogRows = [];
  for (const row of records) {
    const changelog = await readPublishedProductChangelog(storage, category, row.product_id);
    const latest = changelog.entries[0];
    if (!latest) {
      continue;
    }
    categoryChangelogRows.push({
      product_id: row.product_id,
      version: latest.version,
      published_at: latest.published_at,
      change_count: toInt(latest.change_count, 0)
    });
  }
  categoryChangelogRows.sort((a, b) => parseDateMs(b.published_at) - parseDateMs(a.published_at));

  const categoryChangelog = {
    version: 1,
    category,
    generated_at: nowIso(),
    items: categoryChangelogRows.slice(0, 500)
  };

  await Promise.all([
    writeJson(storage, [category, '_index.json'], indexPayload),
    writeJson(storage, [category, '_changelog.json'], categoryChangelog),
    writeJson(storage, [category, 'exports', 'feed.json'], {
      version: 1,
      category,
      generated_at: nowIso(),
      items: records
        .slice()
        .sort((a, b) => parseDateMs(b.published_at) - parseDateMs(a.published_at))
        .slice(0, 100)
        .map((item) => ({
          product_id: item.product_id,
          title: item.identity?.full_name || `${item.identity?.brand || ''} ${item.identity?.model || ''}`.trim(),
          published_version: item.published_version,
          published_at: item.published_at
        }))
    })
  ]);

  return {
    records,
    index_key: outputKey([category, '_index.json']),
    changelog_key: outputKey([category, '_changelog.json'])
  };
}

export async function writeCsvExport(storage, category, records) {
  const fieldSet = new Set();
  for (const row of records) {
    for (const key of Object.keys(row.specs || {})) {
      fieldSet.add(key);
    }
  }
  const fields = [...fieldSet].sort((a, b) => a.localeCompare(b));
  const headers = ['product_id', 'brand', 'base_model', 'model', 'variant', 'published_version', 'published_at', ...fields];

  const lines = [headers.map(csvEscape).join(',')];
  for (const row of records) {
    const line = [
      row.product_id,
      row.identity?.brand || '',
      row.identity?.base_model || '',
      row.identity?.model || '',
      row.identity?.variant || '',
      row.published_version,
      row.published_at,
      ...fields.map((field) => {
        const value = row.specs?.[field];
        if (Array.isArray(value)) {
          return value.join('|');
        }
        if (isObject(value)) {
          return JSON.stringify(value);
        }
        return value ?? '';
      })
    ];
    lines.push(line.map(csvEscape).join(','));
  }

  await writeText(storage, [category, 'exports', 'all_products.csv'], `${lines.join('\n')}\n`, 'text/csv; charset=utf-8');
  return outputKey([category, 'exports', 'all_products.csv']);
}

export async function writeSqliteExport(storage, category, records) {
  const fileParts = [category, 'exports', 'all_products.sqlite'];
  const modern = outputKey(fileParts);

  const script = [
    'import json, sqlite3, sys',
    'db_path = sys.argv[1]',
    'rows = json.loads(sys.argv[2])',
    'conn = sqlite3.connect(db_path)',
    'cur = conn.cursor()',
    'cur.execute("CREATE TABLE IF NOT EXISTS products (product_id TEXT PRIMARY KEY, category TEXT, brand TEXT, base_model TEXT, model TEXT, variant TEXT, published_version TEXT, published_at TEXT, specs_json TEXT)")',
    'for row in rows:',
    '  cur.execute("INSERT OR REPLACE INTO products (product_id, category, brand, base_model, model, variant, published_version, published_at, specs_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (row.get("product_id", ""), row.get("category", ""), ((row.get("identity") or {}).get("brand", "")), ((row.get("identity") or {}).get("base_model", "")), ((row.get("identity") or {}).get("model", "")), ((row.get("identity") or {}).get("variant", "")), row.get("published_version", ""), row.get("published_at", ""), json.dumps(row.get("specs") or {})))',
    'conn.commit()',
    'conn.close()'
  ].join('\n');

  const tmpDir = path.resolve(os.tmpdir(), 'specfactory-phase9');
  await fs.mkdir(tmpDir, { recursive: true });
  const dbPath = path.join(tmpDir, `${category}_all_products.sqlite`);

  const run = spawnSync('python', ['-c', script, dbPath, JSON.stringify(records)], {
    encoding: 'utf8'
  });
  if (run.status !== 0) {
    return {
      ok: false,
      error: String(run.stderr || run.stdout || 'sqlite_export_failed').trim() || 'sqlite_export_failed'
    };
  }

  const bytes = await fs.readFile(dbPath);
  await writeBuffer(storage, fileParts, bytes, 'application/vnd.sqlite3');
  return {
    ok: true,
    key: modern,
  };
}

export async function writeBulkExports(storage, category, format = 'all') {
  const records = await listPublishedCurrentRecords(storage, category);
  const normalizedFormat = normalizeToken(format || 'all');
  const allowedFormats = new Set(['all', 'csv', 'sqlite']);
  if (!allowedFormats.has(normalizedFormat)) {
    throw new Error(`publish_invalid_format:${normalizedFormat}; expected all|csv|sqlite`);
  }
  const written = {};

  if (normalizedFormat === 'all' || normalizedFormat === 'csv') {
    written.csv_key = await writeCsvExport(storage, category, records);
  }
  if (normalizedFormat === 'all' || normalizedFormat === 'sqlite') {
    const sqlite = await writeSqliteExport(storage, category, records);
    written.sqlite = sqlite;
  }

  await writeJson(storage, [category, 'exports', 'feed.json'], {
    version: 1,
    category,
    generated_at: nowIso(),
    items: records
      .slice()
      .sort((a, b) => parseDateMs(b.published_at) - parseDateMs(a.published_at))
      .slice(0, 100)
      .map((row) => ({
        product_id: row.product_id,
        title: row.identity?.full_name || `${row.identity?.brand || ''} ${row.identity?.model || ''}`.trim(),
        published_version: row.published_version,
        published_at: row.published_at
      }))
  });

  return {
    record_count: records.length,
    ...written
  };
}
