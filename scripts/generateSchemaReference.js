#!/usr/bin/env node
/**
 * Generates docs/data-structure/schema-reference.html
 * by parsing the actual schema DDL files and layering audited rebuild metadata
 * on top. Table shape comes from the schema files; rebuild/source-edit truth is
 * maintained here as the rendered SSOT for durability audits.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// ── Load schema sources ──
const specSchema = fs.readFileSync(path.join(root, 'src/db/specDbSchema.js'), 'utf8');
const appSchema = fs.readFileSync(path.join(root, 'src/db/appDbSchema.js'), 'utf8');
const migrationsSrc = fs.readFileSync(path.join(root, 'src/db/specDbMigrations.js'), 'utf8');

// ── Parse CREATE TABLE blocks ──
function parseTables(ddl) {
  const tables = [];
  // Match CREATE TABLE ending with ); or ) at end of template literal / string
  // Greedy body match ensures we capture through nested parens (datetime('now'))
  const re = /CREATE\s+(VIRTUAL\s+)?TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)\s*(?:USING\s+(\w+)\s*)?\(([^;`]+)\)\s*[;`]/gis;
  let m;
  while ((m = re.exec(ddl)) !== null) {
    const isVirtual = !!m[1];
    const name = m[2];
    const engine = m[3] || null;
    const body = m[4];
    const columns = [];
    let pk = null;
    const fks = [];
    const uniques = [];

    for (const line of body.split('\n')) {
      const trimmed = line.trim().replace(/,$/, '');
      if (!trimmed || trimmed.startsWith('--')) continue;

      // Composite PK
      if (/^PRIMARY\s+KEY\s*\(/i.test(trimmed)) {
        const pkMatch = trimmed.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
        if (pkMatch) pk = pkMatch[1].trim();
        continue;
      }
      // UNIQUE constraint
      if (/^UNIQUE\s*\(/i.test(trimmed)) {
        const uMatch = trimmed.match(/UNIQUE\s*\(([^)]+)\)/i);
        if (uMatch) uniques.push(uMatch[1].trim());
        continue;
      }
      // CHECK constraint (standalone continuation line) — append to previous column
      if (/^CHECK\s*\(/i.test(trimmed)) {
        if (columns.length > 0) {
          // Extract full CHECK(...) including nested parens
          const checkMatch = trimmed.match(/CHECK\s*(\(.*\))/i);
          if (checkMatch) columns[columns.length - 1].constraints += ` CHECK${checkMatch[1]}`;
        }
        continue;
      }

      // Virtual table columns (FTS5)
      if (isVirtual) {
        const colName = trimmed.replace(/,.*/, '').trim();
        if (colName && !colName.startsWith('content=') && !colName.startsWith('tokenize=')) {
          columns.push({ name: colName, type: 'TEXT', constraints: 'FTS5', isPk: false, fk: null });
        }
        continue;
      }

      // Regular column
      const colMatch = trimmed.match(/^(\w+)\s+(TEXT|INTEGER|REAL|BLOB)(.*)$/i);
      if (!colMatch) continue;
      const colName = colMatch[1];
      const colType = colMatch[2].toUpperCase();
      let rest = colMatch[3].trim();

      const isPk = /PRIMARY\s+KEY/i.test(rest);
      if (isPk && !pk) pk = colName;

      const fkMatch = rest.match(/REFERENCES\s+(\w+)\s*\((\w+)\)/i);
      let fk = null;
      if (fkMatch) {
        fk = `${fkMatch[1]}(${fkMatch[2]})`;
        fks.push({ col: colName, ref: fk });
      }

      // Clean up constraints display
      rest = rest.replace(/REFERENCES\s+\w+\s*\(\w+\)(\s+ON\s+DELETE\s+CASCADE)?/i, '').trim();
      rest = rest.replace(/PRIMARY\s+KEY(\s+AUTOINCREMENT)?/i, m => m).trim();

      columns.push({ name: colName, type: colType, constraints: rest, isPk, fk });
    }

    tables.push({ name, columns, pk, fks, uniques, isVirtual, engine });
  }
  return tables;
}

// ── Parse indexes ──
function parseIndexes(ddl) {
  const indexes = {};
  const re = /CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+(\w+)\s+ON\s+(\w+)\(([^)]+)\)([^;]*);/gi;
  let m;
  while ((m = re.exec(ddl)) !== null) {
    const isUnique = !!m[1];
    const idxName = m[2];
    const table = m[3];
    const cols = m[4].trim();
    const where = m[5]?.trim() || '';
    if (!indexes[table]) indexes[table] = [];
    indexes[table].push({ name: idxName, cols, isUnique, where });
  }
  return indexes;
}

// ── Parse migration columns ──
function parseMigrationColumns(src) {
  const adds = {};
  // Capture everything after the type until the closing backtick
  const re = /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)\s+(TEXT|INTEGER|REAL)\s*([^`]*)/gi;
  let m;
  while ((m = re.exec(src)) !== null) {
    const table = m[1];
    const col = m[2];
    const type = m[3].toUpperCase();
    let rest = m[4].trim();
    // Strip REFERENCES for FK display (handled separately)
    const fkMatch = rest.match(/REFERENCES\s+(\w+)\s*\((\w+)\)/i);
    let fk = null;
    if (fkMatch) {
      fk = `${fkMatch[1]}(${fkMatch[2]})`;
      rest = rest.replace(/REFERENCES\s+\w+\s*\(\w+\)(\s+ON\s+DELETE\s+CASCADE)?/i, '').trim();
    }
    if (!adds[table]) adds[table] = [];
    adds[table].push({ name: col, type, constraints: rest || '', isPk: false, fk, fromMigration: true });
  }
  return adds;
}

// ── Store ownership map ──
const storeMap = {
  component_identity: 'componentStore', component_aliases: 'componentStore', component_values: 'componentStore',
  enum_lists: 'enumListStore', list_values: 'enumListStore',
  item_field_state: 'itemStateStore', item_component_links: 'itemStateStore', item_list_links: 'itemStateStore', product_review_state: 'itemStateStore',
  key_review_state: 'keyReviewStore', key_review_runs: 'keyReviewStore', key_review_run_sources: 'keyReviewStore', key_review_audit: 'keyReviewStore',
  products: 'queueProductStore', curation_suggestions: 'queueProductStore', component_review_queue: 'queueProductStore',
  llm_route_matrix: 'llmRouteSourceStore',
  bridge_events: 'sourceIntelStore',
  crawl_sources: 'artifactStore', source_screenshots: 'artifactStore', source_videos: 'artifactStore',
  runs: 'runMetaStore', run_artifacts: 'runArtifactStore',
  billing_entries: 'billingStore', field_studio_map: 'fieldStudioMapStore',
  knob_snapshots: 'telemetryIndexStore', query_index: 'telemetryIndexStore', url_index: 'telemetryIndexStore', prompt_index: 'telemetryIndexStore',
  data_authority_sync: 'specDb (direct)',
  field_key_order: 'fieldStudioMapStore', color_edition_finder: 'colorEditionFinderStore', color_edition_finder_runs: 'colorEditionFinderStore',
  field_candidates: 'fieldCandidateStore',
  brands: 'appDb', brand_categories: 'appDb', brand_renames: 'appDb', settings: 'appDb', studio_maps: 'appDb', color_registry: 'appDb',
  url_crawl_ledger: 'crawlLedgerStore', query_cooldowns: 'crawlLedgerStore',
  field_audit_cache: 'testModeRoutes (direct)',
};

// ── Persistence classification map ──
const persistenceMap = {
  // JSON-backed
  products: 'json',
  runs: 'json', run_artifacts: 'json', crawl_sources: 'json',
  url_crawl_ledger: 'json', query_cooldowns: 'json',
  color_edition_finder: 'json', color_edition_finder_runs: 'json',
  field_candidates: 'json',
  llm_route_matrix: 'json', field_key_order: 'json', field_studio_map: 'json',
  brands: 'json', brand_categories: 'json', brand_renames: 'json',
  settings: 'json', studio_maps: 'json', color_registry: 'json',
  source_screenshots: 'json', source_videos: 'json',
  // Deferred (review grid + partial rebuild)
  component_identity: 'deferred', component_aliases: 'deferred',
  component_values: 'deferred', enum_lists: 'deferred',
  list_values: 'deferred', item_field_state: 'deferred',
  item_component_links: 'deferred', item_list_links: 'deferred',
  product_review_state: 'deferred', key_review_state: 'deferred',
  component_review_queue: 'deferred',
  // DB-only
  curation_suggestions: 'db-only', billing_entries: 'db-only',
  bridge_events: 'db-only', key_review_runs: 'db-only',
  key_review_run_sources: 'db-only', key_review_audit: 'db-only',
  knob_snapshots: 'db-only', query_index: 'db-only',
  url_index: 'db-only', prompt_index: 'db-only',
  // System
  data_authority_sync: 'system',
  // DB-only ephemeral (audit cache, rebuilt on re-run)
  field_audit_cache: 'db-only',
};

const persistenceStatus = {
  json: { label: 'json', className: 'tag-persist-json' },
  'db-only': { label: 'db-only', className: 'tag-persist-db' },
  deferred: { label: 'deferred', className: 'tag-persist-deferred' },
  system: { label: 'system', className: 'tag-persist-system' },
};

function life(source, rebuild, sourceEdit, note, strict = 'no') {
  return { source, rebuild, sourceEdit, note, strict };
}

const lifecycleMap = {
  component_values: life(
    'category_authority/{cat}/_generated/component_db/*.json + category_authority/{cat}/_overrides/components/*.json',
    'partial',
    'yes',
    'Fresh rebuild honors current component files, but runtime component review edits are SQL-first and are lost unless mirrored back to JSON.'
  ),
  component_identity: life(
    'category_authority/{cat}/_generated/component_db/*.json + category_authority/{cat}/_overrides/components/*.json',
    'partial',
    'yes',
    'Fresh rebuild honors current component files, but runtime component review edits are SQL-first and are lost unless mirrored back to JSON.'
  ),
  component_aliases: life(
    'category_authority/{cat}/_generated/component_db/*.json + category_authority/{cat}/_overrides/components/*.json',
    'partial',
    'yes',
    'Fresh rebuild honors current component files, but runtime alias edits are SQL-first and are lost unless mirrored back to JSON.'
  ),
  enum_lists: life(
    'category_authority/{cat}/_generated/known_values.json + category_authority/{cat}/_control_plane/field_studio_map.json.data_lists[*].manual_values',
    'partial',
    'yes',
    'Current source files drive a fresh rebuild, but runtime enum/list review edits are SQL-first and not auto-exported.'
  ),
  list_values: life(
    'category_authority/{cat}/_generated/known_values.json + category_authority/{cat}/_control_plane/field_studio_map.json.data_lists[*].manual_values',
    'partial',
    'yes',
    'Current source files drive a fresh rebuild, but runtime enum/list review edits are SQL-first and not auto-exported.'
  ),
  item_field_state: life(
    'out/{cat}/{pid}/latest/normalized.json + out/{cat}/{pid}/latest/provenance.json + category_authority/{cat}/_overrides/overrides.json',
    'partial',
    'yes',
    'Fresh rebuild reflects current durable files, but some live review/AI state is not fully durable and these files are not narrow boot hash-gated surfaces.'
  ),
  product_review_state: life(
    'category_authority/{cat}/_overrides/overrides.json',
    'yes',
    'yes',
    'Consolidated overrides are the durable source for product review state. Existing-DB boot reconcile is indirect, but a fresh rebuild honors current file contents.'
  ),
  item_component_links: life(
    'Derived from latest/normalized.json + component seed surfaces',
    'partial',
    'yes',
    'Fresh rebuild reflects current normalized output and component sources, but runtime component edits not mirrored to JSON still disappear.'
  ),
  item_list_links: life(
    'Derived from latest/normalized.json + enum/list seed surfaces',
    'partial',
    'yes',
    'Fresh rebuild reflects current normalized output and enum/list sources, but runtime enum review edits not mirrored to JSON still disappear.'
  ),
  products: life(
    '.workspace/products/{pid}/product.json',
    'yes',
    'yes',
    'Product identity rows rebuild from product checkpoints.',
    'yes'
  ),
  curation_suggestions: life(
    'none',
    'no',
    'na',
    'Runtime queue state only.'
  ),
  component_review_queue: life(
    'none',
    'no',
    'na',
    'Runtime queue state only.'
  ),
  llm_route_matrix: life(
    'category_authority/{cat}/_control_plane/llm_route_matrix.json',
    'yes',
    'yes',
    'Current JSON rows are honored on fresh rebuild; empty rows reset to defaults.',
    'yes'
  ),
  key_review_state: life(
    'Derived from rebuilt item/component/list tables',
    'partial',
    'yes',
    'The current state shell is reconstructed from rebuilt durable surfaces, but run/source/audit history is not.'
  ),
  key_review_runs: life(
    'none',
    'no',
    'na',
    'AI run history is SQL-only today.'
  ),
  key_review_run_sources: life(
    'none',
    'no',
    'na',
    'AI source-packet history is SQL-only today.'
  ),
  key_review_audit: life(
    'none',
    'no',
    'na',
    'Audit trail is SQL-only today.'
  ),
  billing_entries: life(
    'none (legacy _billing/ledger/*.jsonl import only)',
    'no',
    'no',
    'Current runtime writes billing rows directly to SQL. Legacy JSONL import exists, but there is no normal deleted-DB rebuild path.'
  ),
  data_authority_sync: life(
    'system-managed metadata',
    'system',
    'na',
    'Operational sync metadata recreated by the system as seed/reconcile runs.',
    'na'
  ),
  bridge_events: life(
    'none',
    'no',
    'na',
    'This table itself is not rebuilt. Completed-run equivalents survive separately in run_artifacts.run_summary.'
  ),
  runs: life(
    '.workspace/runs/{runId}/run.json',
    'yes',
    'yes',
    'Run rows rebuild from run checkpoints.',
    'yes'
  ),
  run_artifacts: life(
    '.workspace/runs/{runId}/run.json',
    'yes',
    'yes',
    'Artifact rows rebuild from run checkpoint payloads.',
    'yes'
  ),
  crawl_sources: life(
    '.workspace/runs/{runId}/run.json.sources',
    'yes',
    'yes',
    'Fresh rebuild honors current run checkpoint sources that carry valid source metadata.',
    'yes'
  ),
  source_screenshots: life(
    '.workspace/runs/{runId}/run.json + screenshot files on disk',
    'yes',
    'partial',
    'Rebuild from JSON is correct, but rows are only usable if the referenced screenshot files remain on disk.',
    'ext-dep'
  ),
  source_videos: life(
    '.workspace/runs/{runId}/run.json + video files on disk',
    'yes',
    'partial',
    'Rebuild from JSON is correct, but rows are only usable if the referenced video files remain on disk.',
    'ext-dep'
  ),
  knob_snapshots: life(
    'none',
    'no',
    'na',
    'Telemetry rows are SQL-only.'
  ),
  query_index: life(
    'none',
    'no',
    'na',
    'Telemetry rows are SQL-only.'
  ),
  url_index: life(
    'none',
    'no',
    'na',
    'Telemetry rows are SQL-only.'
  ),
  prompt_index: life(
    'none',
    'no',
    'na',
    'Telemetry rows are SQL-only.'
  ),
  url_crawl_ledger: life(
    '.workspace/runs/{runId}/run.json.sources',
    'yes',
    'yes',
    'Fresh rebuild honors run checkpoint sources. Product checkpoint sources are ignored today.',
    'yes'
  ),
  query_cooldowns: life(
    '.workspace/products/{pid}/product.json.query_cooldowns',
    'yes',
    'yes',
    'Cooldown rows rebuild from product checkpoints.',
    'yes'
  ),
  field_studio_map: life(
    'category_authority/{cat}/_control_plane/field_studio_map.json',
    'yes',
    'yes',
    'Fresh rebuild auto-compiles if the map changed since last compile, then seeds from fresh generated artifacts.',
    'yes'
  ),
  field_key_order: life(
    'category_authority/{cat}/_control_plane/field_key_order.json',
    'yes',
    'yes',
    'Fresh rebuild honors the current key-order file.',
    'yes'
  ),
  color_edition_finder: life(
    '.workspace/products/{pid}/color_edition.json',
    'yes',
    'yes',
    'Color edition state rebuilds from the per-product JSON mirror.',
    'yes'
  ),
  color_edition_finder_runs: life(
    '.workspace/products/{pid}/color_edition.json',
    'yes',
    'yes',
    'Per-run LLM discovery detail rebuilds from the per-product JSON mirror.',
    'yes'
  ),
  field_candidates: life(
    '.workspace/products/{pid}/product.json → candidates[]',
    'yes',
    'yes',
    'Validated candidate values per (product, field, value). Rebuilds from product.json candidates[]. Status column tracks candidate vs resolved.',
    'yes'
  ),
  field_audit_cache: life(
    'Re-run via POST /api/v1/test-mode/validate',
    'yes',
    'no',
    'Ephemeral cache of field contract audit results. Delete DB → re-run audit → repopulates.'
  ),
  brands: life(
    'category_authority/_global/brand_registry.json',
    'yes',
    'yes',
    'Fresh rebuild honors current brand registry contents.',
    'yes'
  ),
  brand_categories: life(
    'category_authority/_global/brand_registry.json',
    'yes',
    'yes',
    'Fresh rebuild honors current brand-category mappings.',
    'yes'
  ),
  brand_renames: life(
    'category_authority/_global/brand_registry.json',
    'yes',
    'yes',
    'Fresh rebuild and existing-DB reseed honor the current rename history from brand_registry.json via clean-slate per-brand reconcile.',
    'yes'
  ),
  settings: life(
    '.workspace/global/user-settings.json',
    'yes',
    'yes',
    'Fresh rebuild honors current settings JSON.',
    'yes'
  ),
  studio_maps: life(
    '.workspace/global/user-settings.json',
    'yes',
    'yes',
    'Fresh rebuild honors current studio-map JSON.',
    'yes'
  ),
  color_registry: life(
    'category_authority/_global/color_registry.json',
    'yes',
    'yes',
    'Fresh rebuild and existing-DB reconcile honor current color registry contents. If the file is missing, bootstrap seeds the default palette and writes the durable JSON.',
    'yes'
  ),
};

// ── Domain groups ──
const specDbGroups = [
  { label: 'Component Identity', tables: ['component_identity', 'component_aliases', 'component_values'] },
  { label: 'Enum / List Management', tables: ['enum_lists', 'list_values'] },
  { label: 'Item State', tables: ['item_field_state', 'item_component_links', 'item_list_links', 'product_review_state'] },
  { label: 'Catalog & Queue', tables: ['products', 'curation_suggestions', 'component_review_queue'] },
  { label: 'LLM Route Configuration', tables: ['llm_route_matrix'] },
  { label: 'Key Review', tables: ['key_review_state', 'key_review_runs', 'key_review_run_sources', 'key_review_audit'] },
  { label: 'Billing', tables: ['billing_entries'] },
  { label: 'Bridge Events', tables: ['bridge_events'] },
  { label: 'Runs & Artifacts', tables: ['runs', 'run_artifacts'] },
  { label: 'Data Sync', tables: ['data_authority_sync'] },
  { label: 'Crawl Artifacts', tables: ['crawl_sources', 'source_screenshots', 'source_videos'] },
  { label: 'Telemetry Indexes', tables: ['knob_snapshots', 'query_index', 'url_index', 'prompt_index'] },
  { label: 'Field Studio', tables: ['field_studio_map', 'field_key_order'] },
  { label: 'Crawl Ledger', tables: ['url_crawl_ledger', 'query_cooldowns'] },
  { label: 'Color & Edition', tables: ['color_edition_finder', 'color_edition_finder_runs'] },
  { label: 'Publisher Pipeline', tables: ['field_candidates'] },
  { label: 'Field Audit', tables: ['field_audit_cache'] },
];

const appDbGroups = [
  { label: 'Global State', tables: ['brands', 'brand_categories', 'brand_renames', 'settings', 'studio_maps', 'color_registry'] },
];

// ── Parse everything ──
const specTables = parseTables(specSchema);
const migrationTables = parseTables(migrationsSrc);
const appTables = parseTables(appSchema);
const allTables = [...specTables, ...migrationTables, ...appTables];
const tableMap = Object.fromEntries(allTables.map(t => [t.name, t]));

// Merge indexes by combining arrays per table, not overwriting
function mergeIndexes(...sources) {
  const merged = {};
  for (const src of sources) {
    for (const [table, idxList] of Object.entries(src)) {
      if (!merged[table]) merged[table] = [];
      merged[table].push(...idxList);
    }
  }
  return merged;
}
const allIndexes = mergeIndexes(parseIndexes(specSchema), parseIndexes(migrationsSrc), parseIndexes(appSchema));

// Merge migration columns
const migCols = parseMigrationColumns(migrationsSrc);
for (const [table, cols] of Object.entries(migCols)) {
  if (tableMap[table]) {
    for (const col of cols) {
      if (!tableMap[table].columns.find(c => c.name === col.name)) {
        tableMap[table].columns.push(col);
      }
    }
  }
}

// ── Source usage scan ──
const CODE_FILE_RE = /\.(?:js|jsx|ts|tsx|mjs|cjs)$/i;

function normalizeRelPath(relPath) {
  return relPath.replace(/\\/g, '/');
}

function listTrackedSourceFiles() {
  try {
    return execFileSync('git', ['ls-files', '-co', '--exclude-standard', 'src', 'tools/gui-react/src'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split(/\r?\n/)
      .map(line => normalizeRelPath(line.trim()))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function isUsageCandidate(relPath) {
  if (!CODE_FILE_RE.test(relPath)) return false;
  if (/(^|\/)(e2e|__tests__|tests)(\/|$)/i.test(relPath)) return false;
  if (/\.(?:test|spec)\.[^.]+$/i.test(relPath)) return false;
  return relPath.startsWith('src/') || relPath.startsWith('tools/gui-react/src/');
}

function readUsageText(relPath) {
  try {
    const text = fs.readFileSync(path.join(root, relPath), 'utf8');
    return text.includes('\u0000') ? null : text;
  } catch {
    return null;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDirectTableUsagePatterns(tableName) {
  const escaped = escapeRegex(tableName);
  return [
    new RegExp(`CREATE\\s+(?:VIRTUAL\\s+)?TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${escaped}\\b`, 'i'),
    new RegExp(`(?:INSERT(?:\\s+OR\\s+[A-Z_]+)?\\s+INTO|REPLACE\\s+INTO)\\s+${escaped}\\b`, 'i'),
    new RegExp(`UPDATE\\s+${escaped}\\b`, 'i'),
    new RegExp(`DELETE\\s+FROM\\s+${escaped}\\b`, 'i'),
    new RegExp(`\\bFROM\\s+${escaped}\\b`, 'i'),
    new RegExp(`\\bJOIN\\s+${escaped}\\b`, 'i'),
    new RegExp(`\\b${escaped}\\b\\s+MATCH\\b`, 'i'),
    new RegExp(`name\\s*=\\s*['"\`]${escaped}['"\`]`, 'i'),
    new RegExp(`['"\`]${escaped}['"\`]`),
  ];
}

function detectDirectTableUsage(text, tableName) {
  return buildDirectTableUsagePatterns(tableName).some(pattern => pattern.test(text));
}

function collectDirectTablesFromText(text, tableNames) {
  const tables = new Set();
  if (!text) return tables;
  for (const tableName of tableNames) {
    if (detectDirectTableUsage(text, tableName)) {
      tables.add(tableName);
    }
  }
  return tables;
}

function addAll(target, values) {
  for (const value of values || []) target.add(value);
}

function sameSet(left, right) {
  if (!left && !right) return true;
  if (!left || !right) return false;
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}

function readRepoText(relPath) {
  try {
    return fs.readFileSync(path.join(root, relPath), 'utf8');
  } catch {
    return '';
  }
}

function readStringLiteral(text, startIndex) {
  let index = startIndex;
  while (index < text.length && /\s/.test(text[index])) index += 1;
  const quote = text[index];
  if (!quote || !['"', '\'', '`'].includes(quote)) return null;
  let value = '';
  index += 1;
  while (index < text.length) {
    const ch = text[index];
    if (ch === '\\') {
      value += ch;
      if (index + 1 < text.length) {
        value += text[index + 1];
      }
      index += 2;
      continue;
    }
    if (ch === quote) {
      return { value, endIndex: index + 1 };
    }
    value += ch;
    index += 1;
  }
  return null;
}

function findMatchingBrace(text, openIndex) {
  let depth = 0;
  let index = openIndex;
  let quote = null;
  let inLineComment = false;
  let inBlockComment = false;

  while (index < text.length) {
    const ch = text[index];
    const next = text[index + 1];

    if (inLineComment) {
      if (ch === '\n') inLineComment = false;
      index += 1;
      continue;
    }

    if (inBlockComment) {
      if (ch === '*' && next === '/') {
        inBlockComment = false;
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (quote) {
      if (ch === '\\') {
        index += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      index += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      inLineComment = true;
      index += 2;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      index += 2;
      continue;
    }

    if (ch === '"' || ch === '\'' || ch === '`') {
      quote = ch;
      index += 1;
      continue;
    }

    if (ch === '{') {
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }

    index += 1;
  }

  return -1;
}

const RESERVED_METHOD_NAMES = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'do',
  'try',
  'return',
]);

function extractNamedBlocks(text, headerRe, { advanceToBlockEnd = true } = {}) {
  const blocks = new Map();
  let match;
  while ((match = headerRe.exec(text)) !== null) {
    const name = match[1];
    if (!name || RESERVED_METHOD_NAMES.has(name)) continue;
    const openBraceIndex = match.index + match[0].lastIndexOf('{');
    const closeBraceIndex = findMatchingBrace(text, openBraceIndex);
    if (closeBraceIndex < 0) break;
    blocks.set(name, text.slice(openBraceIndex + 1, closeBraceIndex));
    if (advanceToBlockEnd) {
      headerRe.lastIndex = closeBraceIndex + 1;
    }
  }
  return blocks;
}

function extractClassMethods(text) {
  return extractNamedBlocks(text, /^[ \t]*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm);
}

function extractFunctionDeclarations(text) {
  return extractNamedBlocks(
    text,
    /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
    { advanceToBlockEnd: false }
  );
}

function extractTransactionHelpers(text) {
  return extractNamedBlocks(
    text,
    /this\.([A-Za-z_$][\w$]*)\s*=\s*this\.db\.transaction\(\([^)]*\)\s*=>\s*\{/g
  );
}

function extractPreparedStatements(text, mode) {
  const statements = new Map();
  const pattern = mode === 'class'
    ? /this\.(\_[A-Za-z_$][\w$]*)\s*=\s*this\.db\.prepare\(\s*/g
    : /(\_[A-Za-z_$][\w$]*)\s*:\s*db\.prepare\(\s*/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const name = match[1];
    const literal = readStringLiteral(text, pattern.lastIndex);
    if (!literal) continue;
    statements.set(name, literal.value);
    pattern.lastIndex = literal.endIndex;
  }
  return statements;
}

function resolveSymbolTables({ bodies, bodyDirectTables, initialTables, getRefs }) {
  const resolved = new Map();
  for (const [symbolId, tables] of initialTables.entries()) {
    resolved.set(symbolId, new Set(tables));
  }
  for (const symbolId of bodies.keys()) {
    if (!resolved.has(symbolId)) {
      resolved.set(symbolId, new Set());
    }
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const [symbolId, body] of bodies.entries()) {
      const next = new Set(resolved.get(symbolId) || []);
      addAll(next, bodyDirectTables.get(symbolId));
      for (const refId of getRefs(symbolId, body)) {
        addAll(next, resolved.get(refId));
      }
      if (!sameSet(next, resolved.get(symbolId))) {
        resolved.set(symbolId, next);
        changed = true;
      }
    }
  }

  return resolved;
}

function buildStoreUsageInfo(tableNames, specStatementTables) {
  const storeDir = path.join(root, 'src/db/stores');
  const storeFiles = fs.readdirSync(storeDir)
    .filter(fileName => fileName.endsWith('.js'))
    .sort((left, right) => left.localeCompare(right));
  const factoryNameToNamespace = new Map();
  const functionNamesByNamespace = new Map();
  const methodTables = new Map();

  for (const fileName of storeFiles) {
    const namespace = fileName.replace(/\.js$/i, '');
    const text = readRepoText(path.join('src/db/stores', fileName));
    const factoryMatch = text.match(/export function (create[A-Za-z_$][\w$]*)\s*\(/);
    if (factoryMatch) {
      factoryNameToNamespace.set(factoryMatch[1], namespace);
    }

    const functionBodies = extractFunctionDeclarations(text);
    const functionNames = new Set(functionBodies.keys());
    functionNamesByNamespace.set(namespace, functionNames);

    const bodies = new Map();
    const bodyDirectTables = new Map();
    for (const [name, body] of functionBodies.entries()) {
      const symbolId = `store:${namespace}#${name}`;
      bodies.set(symbolId, body);
      bodyDirectTables.set(symbolId, collectDirectTablesFromText(body, tableNames));
    }

    const resolved = resolveSymbolTables({
      bodies,
      bodyDirectTables,
      initialTables: specStatementTables,
      getRefs(symbolId, body) {
        const refs = new Set();
        const localName = symbolId.split('#')[1];

        let match;
        const stmtRe = /stmts\.(\_[A-Za-z_$][\w$]*)\b/g;
        while ((match = stmtRe.exec(body)) !== null) {
          refs.add(`stmt#${match[1]}`);
        }

        for (const fnName of functionNames) {
          if (fnName === localName) continue;
          const callRe = new RegExp(`\\b${escapeRegex(fnName)}\\s*\\(`);
          if (callRe.test(body)) {
            refs.add(`store:${namespace}#${fnName}`);
          }
        }

        return refs;
      },
    });

    for (const name of functionNames) {
      methodTables.set(`store:${namespace}#${name}`, resolved.get(`store:${namespace}#${name}`) || new Set());
    }
  }

  return { factoryNameToNamespace, functionNamesByNamespace, methodTables };
}

function buildAppDbUsageInfo(tableNames) {
  const text = readRepoText('src/db/appDb.js');
  const statementSql = extractPreparedStatements(text, 'class');
  const initialTables = new Map();
  for (const [stmtName, sql] of statementSql.entries()) {
    initialTables.set(`appDb#${stmtName}`, collectDirectTablesFromText(sql, tableNames));
  }

  const bodies = new Map();
  const bodyDirectTables = new Map();
  const helperBodies = extractTransactionHelpers(text);
  for (const [name, body] of helperBodies.entries()) {
    const symbolId = `appDb#${name}`;
    bodies.set(symbolId, body);
    bodyDirectTables.set(symbolId, collectDirectTablesFromText(body, tableNames));
  }

  const methodBodies = extractClassMethods(text);
  for (const [name, body] of methodBodies.entries()) {
    const symbolId = `appDb#${name}`;
    bodies.set(symbolId, body);
    bodyDirectTables.set(symbolId, collectDirectTablesFromText(body, tableNames));
  }

  const methodNames = new Set(methodBodies.keys());
  const resolved = resolveSymbolTables({
    bodies,
    bodyDirectTables,
    initialTables,
    getRefs(symbolId, body) {
      const refs = new Set();
      const localName = symbolId.split('#')[1];

      let match;
      const privateRe = /this\.(\_[A-Za-z_$][\w$]*)\b/g;
      while ((match = privateRe.exec(body)) !== null) {
        refs.add(`appDb#${match[1]}`);
      }

      const methodRe = /this\.([A-Za-z_$][\w$]*)\s*\(/g;
      while ((match = methodRe.exec(body)) !== null) {
        const methodName = match[1];
        if (methodName === localName) continue;
        if (methodNames.has(methodName)) {
          refs.add(`appDb#${methodName}`);
        }
      }

      return refs;
    },
  });

  return { methodNames, resolved };
}

function buildSpecStatementTables(tableNames) {
  const text = readRepoText('src/db/specDbStatements.js');
  const statementSql = extractPreparedStatements(text, 'object');
  const tablesByStatement = new Map();
  for (const [stmtName, sql] of statementSql.entries()) {
    tablesByStatement.set(`stmt#${stmtName}`, collectDirectTablesFromText(sql, tableNames));
  }
  return tablesByStatement;
}

function buildSpecDbUsageInfo(tableNames, specStatementTables, storeUsageInfo) {
  const text = readRepoText('src/db/specDb.js');
  const initialTables = new Map(specStatementTables);
  for (const [symbolId, tablesForSymbol] of storeUsageInfo.methodTables.entries()) {
    initialTables.set(symbolId, new Set(tablesForSymbol));
  }
  const storeFieldToNamespace = new Map();
  let storeMatch;
  const storeFieldRe = /this\.(\_[A-Za-z_$][\w$]*)\s*=\s*(create[A-Za-z_$][\w$]*)\s*\(/g;
  while ((storeMatch = storeFieldRe.exec(text)) !== null) {
    const fieldName = storeMatch[1];
    const factoryName = storeMatch[2];
    const namespace = storeUsageInfo.factoryNameToNamespace.get(factoryName);
    if (namespace) {
      storeFieldToNamespace.set(fieldName, namespace);
    }
  }

  const methodBodies = extractClassMethods(text);
  const methodNames = new Set(methodBodies.keys());
  const bodies = new Map();
  const bodyDirectTables = new Map();
  for (const [name, body] of methodBodies.entries()) {
    const symbolId = `specDb#${name}`;
    bodies.set(symbolId, body);
    bodyDirectTables.set(symbolId, collectDirectTablesFromText(body, tableNames));
  }

  const resolved = resolveSymbolTables({
    bodies,
    bodyDirectTables,
    initialTables,
    getRefs(symbolId, body) {
      const refs = new Set();
      const localName = symbolId.split('#')[1];

      let match;
      const storeMethodRe = /this\.(\_[A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
      while ((match = storeMethodRe.exec(body)) !== null) {
        const storeField = match[1];
        const storeMethod = match[2];
        const namespace = storeFieldToNamespace.get(storeField);
        const functionNames = namespace ? storeUsageInfo.functionNamesByNamespace.get(namespace) : null;
        if (namespace && functionNames?.has(storeMethod)) {
          refs.add(`store:${namespace}#${storeMethod}`);
        }
      }

      const privateRe = /this\.(\_[A-Za-z_$][\w$]*)\b/g;
      while ((match = privateRe.exec(body)) !== null) {
        const fieldName = match[1];
        if (!storeFieldToNamespace.has(fieldName)) {
          refs.add(`stmt#${fieldName}`);
        }
      }

      const methodRe = /this\.([A-Za-z_$][\w$]*)\s*\(/g;
      while ((match = methodRe.exec(body)) !== null) {
        const methodName = match[1];
        if (methodName === localName) continue;
        if (methodNames.has(methodName)) {
          refs.add(`specDb#${methodName}`);
        }
      }

      return refs;
    },
  });

  return { methodNames, resolved };
}

export function buildTableUsageAccessors(tables = allTables) {
  const tableNames = [...new Set(tables.map(table => table.name))];
  const accessors = Object.fromEntries(
    tableNames.map(tableName => [tableName, { calls: new Set(), refs: new Set() }])
  );

  const specStatementTables = buildSpecStatementTables(tableNames);
  const storeUsageInfo = buildStoreUsageInfo(tableNames, specStatementTables);
  const appDbUsageInfo = buildAppDbUsageInfo(tableNames);
  const specDbUsageInfo = buildSpecDbUsageInfo(tableNames, specStatementTables, storeUsageInfo);

  for (const [symbolId, tablesForSymbol] of specStatementTables.entries()) {
    const refName = symbolId.split('#')[1];
    for (const tableName of tablesForSymbol) {
      accessors[tableName]?.refs.add(refName);
    }
  }

  for (const [symbolId, tablesForSymbol] of appDbUsageInfo.resolved.entries()) {
    const name = symbolId.split('#')[1];
    const isPublicMethod = appDbUsageInfo.methodNames.has(name) && name !== 'constructor';
    for (const tableName of tablesForSymbol) {
      if (isPublicMethod) {
        accessors[tableName]?.calls.add(name);
      } else if (name.startsWith('_')) {
        accessors[tableName]?.refs.add(name);
      }
    }
  }

  for (const [symbolId, tablesForSymbol] of specDbUsageInfo.resolved.entries()) {
    const name = symbolId.split('#')[1];
    if (!specDbUsageInfo.methodNames.has(name) || name === 'constructor') continue;
    for (const tableName of tablesForSymbol) {
      accessors[tableName]?.calls.add(name);
    }
  }

  return Object.fromEntries(
    Object.entries(accessors).map(([tableName, groups]) => [
      tableName,
      {
        calls: [...groups.calls].sort((left, right) => left.localeCompare(right)),
        refs: [...groups.refs].sort((left, right) => left.localeCompare(right)),
      },
    ])
  );
}

const TABLE_USAGE_ACCESSORS = buildTableUsageAccessors(allTables);

function buildTableUsagePatterns(tableName) {
  const patterns = [...buildDirectTableUsagePatterns(tableName)];

  const accessors = TABLE_USAGE_ACCESSORS[tableName];
  if (accessors) {
    for (const accessor of accessors.calls || []) {
      patterns.push(new RegExp(`(?:\\b[A-Za-z_$][\\w$]*|this)\\.${escapeRegex(accessor)}\\s*\\(`));
    }
    for (const accessor of accessors.refs || []) {
      patterns.push(new RegExp(`\\b${escapeRegex(accessor)}\\b`));
    }
  }

  return patterns;
}

export function detectTableUsage(text, tableName) {
  return buildTableUsagePatterns(tableName).some(pattern => pattern.test(text));
}

function buildTableUsageMap(tables) {
  const usage = Object.fromEntries(
    tables.map(table => [table.name, { src: new Set(), gui: new Set() }])
  );

  const candidates = listTrackedSourceFiles().filter(isUsageCandidate);
  const tableNames = [...new Set(tables.map(table => table.name))];

  for (const relPath of candidates) {
    const text = readUsageText(relPath);
    if (!text) continue;

    const bucket = relPath.startsWith('tools/gui-react/src/') ? 'gui' : 'src';
    for (const tableName of tableNames) {
      if (detectTableUsage(text, tableName)) {
        usage[tableName][bucket].add(relPath);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(usage).map(([tableName, groups]) => [
      tableName,
      {
        src: [...groups.src].sort((left, right) => left.localeCompare(right)),
        gui: [...groups.gui].sort((left, right) => left.localeCompare(right)),
      },
    ])
  );
}

const tableUsageMap = buildTableUsageMap(allTables);

// ── HTML generators ──
const rebuildStatus = {
  yes: { label: 'rebuild yes', className: 'tag-life-yes' },
  partial: { label: 'rebuild partial', className: 'tag-life-partial' },
  no: { label: 'rebuild no', className: 'tag-life-no' },
  system: { label: 'system', className: 'tag-life-system' },
};

const sourceEditStatus = {
  yes: { label: 'source edit yes', className: 'tag-sync-yes' },
  partial: { label: 'source edit partial', className: 'tag-sync-partial' },
  no: { label: 'source edit no', className: 'tag-sync-no' },
  na: { label: 'source edit n/a', className: 'tag-sync-na' },
};

const strictStatus = {
  yes: { label: 'strict yes', className: 'tag-strict-yes' },
  no: { label: 'strict no', className: 'tag-strict-no' },
  na: { label: 'strict n/a', className: 'tag-strict-na' },
  'ext-dep': { label: 'strict ext-dep', className: 'tag-strict-ext' },
};

// ── CQRS compliance indicator ──
// ✓ = verified compliant with CQRS dual-state mandate (dual-write confirmed in code, or intentionally ephemeral)
// ✗ = not compliant (deferred scope, missing write-back, or durability gap)
const cqrsCompliance = {
  // JSON-backed strict yes — full dual-write, rebuild both ways
  products: true,
  runs: true, run_artifacts: true, crawl_sources: true,
  url_crawl_ledger: true, query_cooldowns: true,
  color_edition_finder: true, color_edition_finder_runs: true,
  field_candidates: true,
  llm_route_matrix: true, field_key_order: true, field_studio_map: true,
  brands: true, brand_categories: true, brand_renames: true,
  settings: true, studio_maps: true, color_registry: true,
  // JSON-backed ext-dep — rebuild correct, external fs dependency
  source_screenshots: true, source_videos: true,
  // DB-only intentionally ephemeral (telemetry / runtime queues / audit trails)
  key_review_runs: true, key_review_run_sources: true, key_review_audit: true,
  knob_snapshots: true, query_index: true, url_index: true, prompt_index: true,
  bridge_events: true, curation_suggestions: true,
  // DB-only ephemeral — audit cache, rebuilt on re-run
  field_audit_cache: true,
  // System-managed — auto-recreated
  data_authority_sync: true,
  // Deferred — not scoped, missing write-back paths
  component_identity: false, component_aliases: false, component_values: false,
  enum_lists: false, list_values: false,
  item_field_state: false, item_component_links: false, item_list_links: false,
  product_review_state: false, key_review_state: false,
  component_review_queue: false,
  // DB-only with durability gap
  billing_entries: false,
};

const schemaTableNames = new Set(allTables.map((t) => t.name));
const lifecycleTableNames = new Set(Object.keys(lifecycleMap));
const missingLifecycle = [...schemaTableNames].filter((name) => !lifecycleTableNames.has(name));
const extraLifecycle = [...lifecycleTableNames].filter((name) => !schemaTableNames.has(name));
if (missingLifecycle.length || extraLifecycle.length) {
  const parts = [];
  if (missingLifecycle.length) parts.push(`missing lifecycle metadata: ${missingLifecycle.join(', ')}`);
  if (extraLifecycle.length) parts.push(`lifecycle metadata for unknown tables: ${extraLifecycle.join(', ')}`);
  throw new Error(`schema-reference lifecycle map out of sync: ${parts.join(' | ')}`);
}

function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function renderAuditTag(statusMap, key) {
  const status = statusMap[key];
  if (!status) throw new Error(`Unknown lifecycle badge status: ${key}`);
  return `<span class="tag ${status.className}">${esc(status.label)}</span>`;
}

function renderLifecycleBlock(tableName) {
  const lifecycle = lifecycleMap[tableName];
  if (!lifecycle) throw new Error(`Missing lifecycle metadata for table: ${tableName}`);
  return `<div class="life-section">
    <div class="idx-label">Rebuild Audit</div>
    <div class="life-grid">
      <div class="life-item">
        <div class="life-k">Durable source</div>
        <div class="life-v">${esc(lifecycle.source)}</div>
      </div>
      <div class="life-item">
        <div class="life-k">Deleted-DB rebuild</div>
        <div class="life-v">${renderAuditTag(rebuildStatus, lifecycle.rebuild)}</div>
      </div>
      <div class="life-item">
        <div class="life-k">Source add/remove honored</div>
        <div class="life-v">${renderAuditTag(sourceEditStatus, lifecycle.sourceEdit)}</div>
      </div>
      <div class="life-item">
        <div class="life-k">No-known-caveat audit</div>
        <div class="life-v">${renderAuditTag(strictStatus, lifecycle.strict)}</div>
      </div>
      <div class="life-item life-item-wide">
        <div class="life-k">Audit note</div>
        <div class="life-v">${esc(lifecycle.note)}</div>
      </div>
    </div>
  </div>`;
}

function renderUsageSection(title, files, emptyText) {
  const countLabel = `${files.length} file${files.length === 1 ? '' : 's'}`;
  const body = files.length
    ? `<ul class="usage-file-list">${files.map(file => `<li><code>${esc(file)}</code></li>`).join('')}</ul>`
    : `<div class="usage-empty">${esc(emptyText)}</div>`;

  return `<div class="usage-section">
    <div class="usage-head">
      <div class="usage-title">${esc(title)}</div>
      <div class="usage-count">${esc(countLabel)}</div>
    </div>
    ${body}
  </div>`;
}

function renderTableCard(t) {
  const store = storeMap[t.name] || '—';
  const colCount = t.columns.length;
  const hasFk = t.fks.length > 0;
  const pkLabel = t.pk || '—';
  const usage = tableUsageMap[t.name] || { src: [], gui: [] };

  const lifecycle = lifecycleMap[t.name];

  let tagsHtml = `<span class="tag tag-pk">PK: ${esc(pkLabel)}</span>`;
  tagsHtml += `<span class="tag tag-usage-src">SRC: ${usage.src.length}</span>`;
  tagsHtml += `<span class="tag tag-usage-gui">GUI: ${usage.gui.length}</span>`;
  if (hasFk) tagsHtml += `<span class="tag tag-fk">FK</span>`;
  if (t.isVirtual) tagsHtml += `<span class="tag tag-virtual">${esc(t.engine || 'VIRTUAL')}</span>`;
  tagsHtml += `<span class="tag tag-cols">${colCount} cols</span>`;
  tagsHtml += `<span class="tag tag-store">${esc(store)}</span>`;
  tagsHtml += renderAuditTag(rebuildStatus, lifecycle.rebuild);
  tagsHtml += renderAuditTag(sourceEditStatus, lifecycle.sourceEdit);
  const persist = persistenceMap[t.name];
  if (persist) tagsHtml += renderAuditTag(persistenceStatus, persist);
  tagsHtml += renderAuditTag(strictStatus, lifecycle.strict);
  const cqrsPass = cqrsCompliance[t.name];
  if (cqrsPass === true) {
    tagsHtml += `<span class="tag tag-cqrs-pass">\u2713</span>`;
  } else if (cqrsPass === false) {
    tagsHtml += `<span class="tag tag-cqrs-fail">\u2717</span>`;
  }

  let colRows = '';
  for (const c of t.columns) {
    const rowClass = c.isPk ? ' class="pk-row"' : '';
    let constr = esc(c.constraints);
    if (c.fk) constr += ` <span class="fk-indicator">FK &rarr; ${esc(c.fk)}</span>`;
    if (c.fromMigration) constr += ` <span class="migr-indicator">via migration</span>`;
    colRows += `<tr${rowClass}><td class="cn">${esc(c.name)}</td><td class="ct">${esc(c.type)}</td><td class="cc">${constr}</td></tr>\n`;
  }

  const idxList = allIndexes[t.name] || [];
  let idxHtml = '';
  if (idxList.length || t.uniques.length) {
    idxHtml = '<div class="idx-section"><div class="idx-label">Indexes</div>';
    for (const u of t.uniques) {
      idxHtml += `<div class="idx-item">UNIQUE(${esc(u)})</div>`;
    }
    for (const idx of idxList) {
      const u = idx.isUnique ? 'UNIQUE ' : '';
      const w = idx.where ? ` ${esc(idx.where)}` : '';
      idxHtml += `<div class="idx-item">${u}${esc(idx.name)} (${esc(idx.cols)})${w}</div>`;
    }
    idxHtml += '</div>';
  }

  return `<details class="table-card" data-table="${esc(t.name)}">
  <summary><span class="tname">${esc(t.name)}</span><span class="tags">${tagsHtml}</span></summary>
  <div class="card-body">
    ${renderLifecycleBlock(t.name)}
    <table class="col-table"><thead><tr><th>Column</th><th>Type</th><th>Constraints</th></tr></thead>
    <tbody>${colRows}</tbody></table>
    ${idxHtml}
    ${renderUsageSection('Source Files', usage.src, 'No non-test src code files detected.')}
    ${renderUsageSection('GUI / Tools Files', usage.gui, 'No non-test tools/gui-react/src code files detected.')}
  </div>
</details>`;
}

function renderGroups(groups) {
  let html = '';
  for (const g of groups) {
    const cards = g.tables.map(name => tableMap[name]).filter(Boolean).map(renderTableCard).join('\n');
    if (!cards) continue;
    html += `<div class="domain-group">
  <div class="domain-label">${esc(g.label)}</div>
  ${cards}
</div>\n`;
  }
  return html;
}

// ── Assemble full HTML ──
const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Spec Factory \u2014 Schema Reference</title>
<style>
:root {
  --bg: #09090b; --s1: #18181b; --s2: #27272a; --s3: #3f3f46;
  --border: rgba(161,161,170,0.12); --border-f: rgba(161,161,170,0.25);
  --text: #fafafa; --t2: #a1a1aa; --t3: #71717a;
  --accent: #3b82f6; --accent-s: rgba(59,130,246,0.12);
  --green: #22c55e; --green-s: rgba(34,197,94,0.12);
  --amber: #f59e0b; --amber-s: rgba(245,158,11,0.12);
  --violet: #8b5cf6; --violet-s: rgba(139,92,246,0.12);
  --rose: #f43f5e; --cyan: #06b6d4;
  --mono: "SF Mono","Cascadia Code","Fira Code","JetBrains Mono",Consolas,monospace;
  --sans: "Inter","Segoe UI",system-ui,-apple-system,sans-serif;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:15px;-webkit-font-smoothing:antialiased}
body{font-family:var(--sans);background:var(--bg);color:var(--text);line-height:1.6;min-height:100vh}
.page{max-width:1280px;margin:0 auto;padding:48px 24px 96px}
.header{margin-bottom:48px}
.header h1{font-size:2rem;font-weight:700;letter-spacing:-0.03em;margin-bottom:8px}
.header p{color:var(--t2);max-width:720px;font-size:0.92rem}
.header .meta{display:flex;gap:24px;margin-top:16px;font-size:0.8rem;color:var(--t3);text-transform:uppercase;letter-spacing:0.06em;font-weight:600}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1px;background:var(--border);border-radius:12px;overflow:hidden;margin-bottom:48px}
.stat{background:var(--s1);padding:20px 24px;display:flex;flex-direction:column;gap:4px}
.stat .n{font-size:1.75rem;font-weight:700;letter-spacing:-0.02em}
.stat .l{font-size:0.75rem;color:var(--t3);text-transform:uppercase;letter-spacing:0.08em;font-weight:600}
.surface{margin-bottom:56px}
.surface-head{display:flex;align-items:baseline;gap:12px;margin-bottom:6px;padding-bottom:12px;border-bottom:1px solid var(--border)}
.surface-head h2{font-size:1.35rem;font-weight:700;letter-spacing:-0.02em}
.surface-desc{color:var(--t2);font-size:0.88rem;margin-bottom:24px;max-width:800px}
.domain-group{margin-bottom:32px}
.domain-label{font-size:0.72rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--t3);margin-bottom:8px;padding-left:2px}
.table-card{background:var(--s1);border:1px solid var(--border);border-radius:10px;margin-bottom:6px;overflow:hidden;transition:border-color 0.15s}
.table-card:hover{border-color:var(--border-f)}
.table-card summary{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;cursor:pointer;list-style:none;font-size:0.9rem}
.table-card summary::-webkit-details-marker{display:none}
.table-card summary::after{content:"+";font-size:1.1rem;font-weight:300;color:var(--t3);transition:transform 0.15s;margin-left:8px}
.table-card[open] summary::after{content:"\\2212"}
.tname{font-family:var(--mono);font-weight:600;font-size:0.88rem;letter-spacing:-0.01em}
.tags{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.tag{font-size:0.68rem;font-weight:700;letter-spacing:0.04em;padding:2px 8px;border-radius:99px;text-transform:uppercase;white-space:nowrap}
.tag-store{background:var(--accent-s);color:var(--accent)}
.tag-pk{background:var(--green-s);color:var(--green)}
.tag-usage-src{background:rgba(59,130,246,0.16);color:#93c5fd;border:1px solid rgba(59,130,246,0.24)}
.tag-usage-gui{background:rgba(245,158,11,0.16);color:#fbbf24;border:1px solid rgba(245,158,11,0.24)}
.tag-fk{background:var(--violet-s);color:var(--violet)}
.tag-virtual{background:var(--amber-s);color:var(--amber)}
.tag-cols{background:var(--s2);color:var(--t2)}
.tag-life-yes{background:var(--green-s);color:var(--green)}
.tag-life-partial{background:var(--amber-s);color:var(--amber)}
.tag-life-no{background:rgba(244,63,94,0.12);color:var(--rose)}
.tag-life-system{background:rgba(6,182,212,0.12);color:var(--cyan)}
.tag-sync-yes{background:rgba(6,182,212,0.12);color:var(--cyan)}
.tag-sync-partial{background:var(--amber-s);color:var(--amber)}
.tag-sync-no{background:rgba(244,63,94,0.12);color:var(--rose)}
.tag-sync-na{background:var(--s2);color:var(--t2)}
.tag-strict-yes{background:rgba(13,148,136,0.12);color:var(--teal)}
.tag-strict-no{background:rgba(244,63,94,0.12);color:var(--rose)}
.tag-strict-na{background:var(--s2);color:var(--t2)}
.tag-strict-ext{background:rgba(99,102,241,0.15);color:#818cf8;border:1px solid rgba(99,102,241,0.25)}
.tag-persist-json{background:rgba(34,197,94,0.18);color:#4ade80;border:1px solid rgba(34,197,94,0.25)}
.tag-persist-db{background:rgba(245,158,11,0.18);color:#fbbf24;border:1px solid rgba(245,158,11,0.25)}
.tag-persist-deferred{background:rgba(168,85,247,0.18);color:#c084fc;border:1px solid rgba(168,85,247,0.25)}
.tag-persist-system{background:rgba(6,182,212,0.18);color:#22d3ee;border:1px solid rgba(6,182,212,0.25)}
.tag-cqrs-pass{background:rgba(34,197,94,0.2);color:#4ade80;border:1px solid rgba(34,197,94,0.3);font-size:0.78rem;min-width:22px;text-align:center}
.tag-cqrs-fail{background:rgba(244,63,94,0.2);color:#f87171;border:1px solid rgba(244,63,94,0.3);font-size:0.78rem;min-width:22px;text-align:center}
.card-body{border-top:1px solid var(--border);padding:16px}
.legend{background:var(--s1);border:1px solid var(--border);border-radius:12px;padding:16px 18px;margin-bottom:24px;color:var(--t2);font-size:0.84rem}
.legend p{margin:0 0 10px}
.legend p:last-child{margin-bottom:0}
.audit-callout{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:24px}
.audit-callout-item{background:linear-gradient(180deg,rgba(15,23,42,0.98),rgba(15,23,42,0.9));border:1px solid var(--border);border-radius:12px;padding:14px 16px}
.audit-callout-k{font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);margin-bottom:6px}
.audit-callout-v{color:var(--t2);font-size:0.84rem;line-height:1.5}
.audit-callout-v strong{color:var(--text)}
.badge-table{width:100%;border-collapse:collapse;margin:12px 0 14px;font-size:0.8rem}
.badge-table th{text-align:left;padding:8px 10px;font-size:0.68rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);border-bottom:1px solid var(--border);background:var(--s2)}
.badge-table td{padding:8px 10px;border-bottom:1px solid var(--border);vertical-align:top}
.badge-table tr:last-child td{border-bottom:none}
.badge-table code{font-size:0.78rem}
.col-table{width:100%;border-collapse:collapse;font-size:0.82rem}
.col-table th{text-align:left;padding:6px 10px;font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);border-bottom:1px solid var(--border)}
.col-table td{padding:5px 10px;border-bottom:1px solid var(--border);vertical-align:top}
.col-table tr:last-child td{border-bottom:none}
.col-table .cn{font-family:var(--mono);font-weight:500;color:var(--text);font-size:0.82rem}
.col-table .ct{font-family:var(--mono);color:var(--t3);font-size:0.78rem}
.col-table .cc{color:var(--t2);font-size:0.78rem}
.pk-row .cn{color:var(--green)}
.fk-indicator{color:var(--violet);font-size:0.72rem}
.migr-indicator{color:var(--amber);font-size:0.68rem;font-weight:600;text-transform:uppercase;letter-spacing:0.04em}
.idx-section{margin-top:12px}
.idx-label{font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);margin-bottom:4px}
.idx-item{font-family:var(--mono);font-size:0.78rem;color:var(--t2);padding:2px 0}
.usage-section{margin-top:12px;padding:12px 14px;background:var(--s2);border:1px solid var(--border);border-radius:10px}
.usage-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:8px}
.usage-title{font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3)}
.usage-count{font-size:0.72rem;color:var(--t2)}
.usage-file-list{list-style:none;display:grid;gap:6px}
.usage-file-list li{margin:0}
.usage-file-list code{display:block;font-size:0.78rem;color:var(--t2);word-break:break-word}
.usage-empty{font-size:0.78rem;color:var(--t3)}
.life-section{margin-bottom:14px;padding:12px 14px;background:var(--s2);border:1px solid var(--border);border-radius:10px}
.life-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 14px}
.life-item{min-width:0}
.life-item-wide{grid-column:1 / -1}
.life-k{font-size:0.7rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--t3);margin-bottom:4px}
.life-v{color:var(--t2);font-size:0.8rem;word-break:break-word}
.filter-wrap{margin-bottom:32px}
.filter-input{width:min(480px,100%);background:var(--s1);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font:inherit;font-size:0.88rem;color:var(--text);outline:none;transition:border-color 0.15s}
.filter-input:focus{border-color:var(--accent)}
.filter-input::placeholder{color:var(--t3)}
@media(max-width:768px){.page{padding:24px 16px 64px}.header h1{font-size:1.5rem}.stats{grid-template-columns:repeat(2,1fr)}.tags{gap:4px}.table-card summary{flex-wrap:wrap;gap:8px}.life-grid{grid-template-columns:1fr}.audit-callout{grid-template-columns:1fr}}
</style>
</head>
<body>
<div class="page">

<header class="header">
  <h1>Schema Reference</h1>
  <p>Complete inventory of all SQL tables across Spec Factory's two database surfaces. Each table shows its columns, primary key, foreign keys, indexes, owning store module, audited rebuild status, and whether add/remove edits in the durable source are honored on a deleted-DB rebuild.</p>
  <div class="meta">
    <span>Generated ${new Date().toISOString().slice(0, 10)}</span>
    <span>Schema + Rebuild SSOT</span>
  </div>
</header>

<div class="stats">
  <div class="stat"><div class="n">${specTables.length + migrationTables.length}</div><div class="l">SpecDb Tables</div></div>
  <div class="stat"><div class="n">${appTables.length}</div><div class="l">AppDb Tables</div></div>
  <div class="stat"><div class="n">${new Set(Object.values(storeMap)).size}</div><div class="l">Store Modules</div></div>
  <div class="stat"><div class="n">${allTables.length}</div><div class="l">Total Tables</div></div>
  <div class="stat"><div class="n">${Object.values(persistenceMap).filter(v => v === 'json').length}</div><div class="l">JSON-backed</div></div>
  <div class="stat"><div class="n">${Object.values(persistenceMap).filter(v => v === 'db-only').length}</div><div class="l">DB-only</div></div>
  <div class="stat"><div class="n">${Object.values(persistenceMap).filter(v => v === 'deferred').length}</div><div class="l">Deferred</div></div>
  <div class="stat"><div class="n">${Object.values(cqrsCompliance).filter(v => v === true).length}</div><div class="l">CQRS \u2713</div></div>
  <div class="stat"><div class="n">${Object.values(cqrsCompliance).filter(v => v === false).length}</div><div class="l">CQRS \u2717</div></div>
</div>

<div class="audit-callout">
  <div class="audit-callout-item">
    <div class="audit-callout-k">Auto-derived</div>
    <div class="audit-callout-v"><strong>Tables, columns, keys, indexes, store ownership, and non-test code file counts</strong> are generated from the live schema and code references.</div>
  </div>
  <div class="audit-callout-item">
    <div class="audit-callout-k">Manual audit metadata</div>
    <div class="audit-callout-v"><strong>Rebuild, source edit, strict badges, and lifecycle notes</strong> are maintained as audited judgments in this generator and must be updated when behavior changes.</div>
  </div>
</div>

<div class="legend">
  <p><strong>Badge meaning:</strong> <code>rebuild yes/partial/no</code> answers whether a deleted SQLite file can be reconstructed from the current durable source. <code>source edit yes/partial/no</code> answers whether add/remove edits in that durable source are honored on a fresh rebuild.</p>
  <p><strong>Interpretation:</strong> <code>rebuild yes</code> + <code>source edit yes</code> means a fresh deleted-DB rebuild is expected to reflect the authoritative durable source set for that table. It is not a blanket claim that every runtime path, existing-DB reconcile path, write-back path, or non-authoritative file is perfect. <code>strict yes</code> is the closest thing to “perfect” in this audit, including add/remove edits in the authoritative durable source set being reflected on that fresh rebuild.</p>
  <table class="badge-table">
    <thead>
      <tr>
        <th>Badge</th>
        <th>What it means</th>
        <th>What it does not mean</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>rebuild yes</code></td>
        <td>A deleted DB can be rebuilt for that table from the current authoritative durable source set without depending on hidden SQL-only state.</td>
        <td>Not a promise that existing-DB reconcile, runtime write-back, or every upstream file path is perfect.</td>
      </tr>
      <tr>
        <td><code>rebuild partial</code></td>
        <td>Some rebuild path exists, but it has a known loss, omission, authority split, or dependency that prevents a full deleted-DB guarantee.</td>
        <td>Not safe to treat as lossless.</td>
      </tr>
      <tr>
        <td><code>rebuild no</code></td>
        <td>No current durable source can fully restore that table on a deleted-DB rebuild.</td>
        <td>Not recoverable unless a new durability surface is added.</td>
      </tr>
      <tr>
        <td><code>system</code></td>
        <td>System-managed operational metadata, not a user durability surface.</td>
        <td>Not a user-editable source-of-truth claim.</td>
      </tr>
      <tr>
        <td><code>strict yes</code></td>
        <td>No known caveat remains for the deleted-DB rebuild contract or authoritative source-edit contract for that table. Add/remove edits in the authoritative durable source set are expected to be reflected on a fresh rebuild.</td>
        <td>Still assumes valid source payloads and the documented authoritative source set; it is not a promise about unrelated runtime behavior.</td>
      </tr>
      <tr>
        <td><code>strict no</code></td>
        <td>At least one known caveat still applies, even if the table is rebuildable or source-editable in a narrower sense.</td>
        <td>Not the same as unrebuildable; it means “works, but not clean enough to be caveat-free.”</td>
      </tr>
      <tr>
        <td><code>strict n/a</code></td>
        <td>The strict user-durability concept does not apply, usually because the table is system-managed metadata.</td>
        <td>Not a missing audit.</td>
      </tr>
      <tr>
        <td><code>strict ext-dep</code></td>
        <td>Rebuild logic is correct and seeds from JSON, but the table references external artifacts (files on disk, S3 objects) that must survive independently for rows to be fully usable.</td>
        <td>Not a code-level rebuild defect; the SQL+JSON contract is honored. The caveat is an operational dependency on external storage.</td>
      </tr>
      <tr>
        <td><code>source edit yes</code></td>
        <td>Direct add/remove edits in the authoritative durable source set are expected to show up on a fresh deleted-DB rebuild.</td>
        <td>Not a promise that runtime SQL edits write back out, or that non-authoritative mirrors also control the row.</td>
      </tr>
      <tr>
        <td><code>source edit partial</code></td>
        <td>Some direct source edits propagate, but delete handling, multi-source authority, generated artifacts, or another caveat prevents a full guarantee.</td>
        <td>Not safe to assume arbitrary edits will always land cleanly.</td>
      </tr>
      <tr>
        <td><code>source edit no</code></td>
        <td>Direct edits in the cited durable source are not currently a reliable way to drive that table on rebuild.</td>
        <td>Not an editable rebuild surface.</td>
      </tr>
      <tr>
        <td><code>source edit n/a</code></td>
        <td>No user-editable durable source applies to that table.</td>
        <td>Not a missing audit; the concept does not apply there.</td>
      </tr>
      <tr>
        <td><code>json</code></td>
        <td>Table is backed by a durable JSON source and can be rebuilt from it on a deleted-DB rebuild.</td>
        <td>Not a promise that every column round-trips perfectly; partial-rebuild caveats may still apply.</td>
      </tr>
      <tr>
        <td><code>db-only</code></td>
        <td>Table lives only in SQL with no durable JSON backing. Data is lost on a deleted-DB rebuild.</td>
        <td>Not necessarily a bug; some tables (telemetry, audit trails) are intentionally ephemeral.</td>
      </tr>
      <tr>
        <td><code>deferred</code></td>
        <td>Schema and some frontend/backend wiring exist, but the feature is not scoped or fully implemented yet.</td>
        <td>Not dead code; it is pre-wired for a planned feature.</td>
      </tr>
      <tr>
        <td><code>system</code></td>
        <td>System-managed operational metadata, auto-recreated by the runtime.</td>
        <td>Not a user-editable persistence surface.</td>
      </tr>
      <tr>
        <td><code>\u2713</code></td>
        <td>CQRS compliant: table meets the Dual-State Architecture Mandate. Either JSON-backed with verified dual-write (edits propagate both ways and rebuild is correct), or intentionally ephemeral per the db-only carve-out (telemetry, runtime queues, audit trails).</td>
        <td>Not a guarantee of zero bugs; it means the architectural contract is satisfied.</td>
      </tr>
      <tr>
        <td><code>\u2717</code></td>
        <td>Not CQRS compliant: table has a known gap — deferred scope with missing write-back paths, or a durability concern that has not been addressed.</td>
        <td>Not necessarily broken; deferred tables are pre-wired for planned features.</td>
      </tr>
    </tbody>
  </table>
  <p>This generator now enforces lifecycle coverage for every live table. If a schema table is added without rebuild metadata, generation fails.</p>
</div>

<div class="filter-wrap">
  <input class="filter-input" id="filter" type="search" placeholder="Filter tables or columns\u2026">
</div>

<section class="surface">
  <div class="surface-head">
    <h2>SpecDb</h2>
    <span class="tag" style="background:var(--accent-s);color:var(--accent)">Per-Category</span>
    <span class="tag tag-cols">${specTables.length + migrationTables.length} tables (${specTables.length} schema + ${migrationTables.length} migration)</span>
  </div>
  <p class="surface-desc">One SQLite database per category (<code>.workspace/db/{category}/spec.sqlite</code>). ${specTables.length + migrationTables.length} tables from DDL (${specTables.length} in specDbSchema.js + ${migrationTables.length} migration-created). Holds all domain data: products, components, reviews, evidence, billing, telemetry, source intelligence, URL crawl ledger, and query cooldowns.</p>
  ${renderGroups(specDbGroups)}
</section>

<section class="surface">
  <div class="surface-head">
    <h2>AppDb</h2>
    <span class="tag" style="background:var(--green-s);color:var(--green)">Global</span>
    <span class="tag tag-cols">${appTables.length} tables</span>
  </div>
  <p class="surface-desc">Single global database at <code>.workspace/db/app.sqlite</code>. Cross-category state: brands, user settings, field studio maps, and color registry.</p>
  ${renderGroups(appDbGroups)}
</section>


</div>

<script>
const filter = document.getElementById('filter');
filter?.addEventListener('input', () => {
  const q = filter.value.toLowerCase();
  document.querySelectorAll('.table-card').forEach(card => {
    const name = card.dataset.table || '';
    const body = card.querySelector('.card-body')?.textContent?.toLowerCase() || '';
    card.style.display = (name.includes(q) || body.includes(q)) ? '' : 'none';
  });
  document.querySelectorAll('.domain-group').forEach(group => {
    const visible = [...group.querySelectorAll('.table-card')].filter(c => c.style.display !== 'none');
    group.style.display = visible.length ? '' : 'none';
  });
});
</script>
</body>
</html>`;

export function writeSchemaReferenceFile() {
  const outPath = path.join(root, 'docs/data-structure-html/schema-reference.html');
  fs.writeFileSync(outPath, html, 'utf8');
  return {
    outPath,
    htmlKb: (html.length / 1024).toFixed(1),
    tableCounts: {
      spec: specTables.length,
      migration: migrationTables.length,
      app: appTables.length,
      total: allTables.length,
    },
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = writeSchemaReferenceFile();
  console.log(`Written ${result.htmlKb}KB to ${path.relative(root, result.outPath)}`);
  console.log(
    `Tables: ${result.tableCounts.spec} spec + ${result.tableCounts.migration} migration + ${result.tableCounts.app} app = ${result.tableCounts.total} total`
  );
}
