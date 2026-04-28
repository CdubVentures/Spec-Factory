// WHY: Hash-gated reseed for field_studio_map.json.
// On boot, compares SHA256 of JSON file against stored hash. If changed:
// 1. Wipes and re-imports field_studio_map table
// 2. Reconciles list_values source='manual' rows from data_lists manual_values
// 3. Populates compiled_rules + boot_config from _generated/ + categoryConfig
// If field_overrides changed, logs a warning (compile may be needed for
// generated artifacts to be correct).

import fsSync from 'node:fs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { sha256Hex } from '../../shared/contentHash.js';
import { hashJson } from '../../ingest/compileUtils.js';
import { normalizeFieldStudioMap } from '../../ingest/compileMapNormalization.js';
import { loadCategoryConfig } from '../../categories/loader.js';
import { loadFieldRules } from '../../field-rules/loader.js';

function normalizeToken(s) {
  return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function reseedFieldStudioMapFromJson({ specDb, helperRoot }) {
  if (!specDb || !helperRoot) return { reseeded: false };
  const category = specDb.category;
  if (!category) return { reseeded: false };

  const jsonPath = path.join(helperRoot, category, '_control_plane', 'field_studio_map.json');

  let raw;
  try {
    raw = fsSync.readFileSync(jsonPath, 'utf8');
  } catch {
    return { reseeded: false };
  }

  const currentHash = sha256Hex(raw);
  const storedHash = specDb.getFileSeedHash('field_studio_map');
  if (currentHash && currentHash === storedHash) {
    let compiledRulesReseeded = false;
    try {
      const compiledResult = await reseedCompiledRulesAndBootConfig({ specDb, helperRoot });
      compiledRulesReseeded = compiledResult?.reseeded === true;
    } catch {
      // Non-fatal — compiled rules will be populated on next compile
    }
    return { reseeded: false, compiledRulesReseeded };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in ${jsonPath}: ${err.message}`);
  }

  const map = parsed && typeof parsed === 'object' ? parsed : {};

  const tx = specDb.db.transaction(() => {
    // 1. Wipe + re-import field_studio_map table
    specDb.db.prepare('DELETE FROM field_studio_map WHERE id = 1').run();
    if (Object.keys(map).length > 0) {
      // WHY: normalize before hashing so the stored map_hash matches what
      // compileProcessCompletion will compute — prevents compileStale drift.
      const normalizedMap = normalizeFieldStudioMap(map);
      const mapHash = hashJson(normalizedMap);
      specDb.upsertFieldStudioMap(JSON.stringify(normalizedMap), mapHash);
    }

    // 2. Reconcile list_values source='manual' from data_lists manual_values
    const reseedDataLists = Array.isArray(map.data_lists) ? map.data_lists
      : Array.isArray(map.enum_lists) ? map.enum_lists : [];

    // Build expected set from data_lists
    const expectedManual = new Set();
    for (const dl of reseedDataLists) {
      const fieldKey = String(dl.field || '').trim();
      if (!fieldKey) continue;
      const values = Array.isArray(dl.manual_values) ? dl.manual_values
        : Array.isArray(dl.values) ? dl.values : [];
      for (const value of values) {
        const trimmed = String(value || '').trim();
        if (!trimmed) continue;
        expectedManual.add(`${fieldKey}::${normalizeToken(trimmed)}`);

        specDb.upsertListValue({
          fieldKey,
          value: trimmed,
          normalizedValue: normalizeToken(trimmed),
          source: 'manual',
          overridden: 0,
          needsReview: 0,
          sourceTimestamp: null,
        });
      }
    }

    // Delete stale manual rows not in JSON
    const existingManual = specDb.db
      .prepare("SELECT field_key, value FROM list_values WHERE category = ? AND source = 'manual'")
      .all(category);
    let manualRemoved = 0;
    for (const row of existingManual) {
      const key = `${row.field_key}::${normalizeToken(row.value)}`;
      if (!expectedManual.has(key)) {
        specDb.db.prepare("DELETE FROM list_values WHERE category = ? AND field_key = ? AND value = ? AND source = 'manual'")
          .run(category, row.field_key, row.value);
        manualRemoved++;
      }
    }

    return { manualRemoved };
  });

  const { manualRemoved } = tx();

  // WHY: Compile-before-seed is handled by specDbSyncService.isCompileStale().
  // Reseed runs after seed, so generated artifacts are already fresh.

  specDb.setFileSeedHash('field_studio_map', currentHash);

  // 3. Populate compiled_rules + boot_config from _generated/ + categoryConfig
  // WHY: field_studio_map is the single SSOT for compiled field rules.
  // All consumers (pipeline, engine, review) read from here.
  // Must complete before app serves — sessionCache reads from compiled_rules.
  try {
    await reseedCompiledRulesAndBootConfig({ specDb, helperRoot });
  } catch {
    // Non-fatal — compiled rules will be populated on next compile
  }

  return { reseeded: true, manualRemoved };
}

// WHY: Populates compiled_rules and boot_config on field_studio_map.
// Called from reseed (boot) and can be called standalone after compile.
// compiledAtOverride: when called from compileProcessCompletion, pass the current
// time so compiled_at is set AFTER the map re-sync (which may bump updated_at).
// Without this, compiled_at reads from manifest (written mid-compile) and is always
// earlier than updated_at, making the compileStale indicator permanently orange.
export async function reseedCompiledRulesAndBootConfig({ specDb, helperRoot, storage = null, config = {}, compiledAtOverride = null }) {
  if (!specDb) return { reseeded: false };
  const category = specDb.category;
  if (!category) return { reseeded: false };

  const effectiveConfig = { ...config, categoryAuthorityRoot: helperRoot };

  let categoryConfig;
  try {
    categoryConfig = await loadCategoryConfig(category, { storage, config: effectiveConfig });
  } catch {
    return { reseeded: false };
  }

  // WHY: Load full engine artifacts (known_values, parse_templates, etc.)
  // so compiled_rules has everything FieldRulesEngine needs.
  let loaded = null;
  try {
    loaded = await loadFieldRules(category, { config: effectiveConfig });
  } catch {
    // Non-fatal — engine artifacts populated on next compile
  }

  const fieldRules = categoryConfig.fieldRules || {};
  const compiledRules = {
    fields: fieldRules.fields || fieldRules,
    component_db_sources: fieldRules.component_db_sources || {},
    field_order: categoryConfig.fieldOrder || [],
    field_groups: categoryConfig.fieldGroups || {},
    required_fields: categoryConfig.requiredFields || [],
    critical_fields: categoryConfig.schema?.critical_fields || [],
    known_values: loaded?.knownValues || {},
    parse_templates: loaded?.parseTemplates || {},
    cross_validation_rules: loaded?.crossValidation || [],
    ui_field_catalog: loaded?.uiFieldCatalog || categoryConfig.uiFieldCatalog || {},
    key_migrations: await readKeyMigrationsJson(helperRoot, category),
    ...(await (async () => {
      const manifest = await readCompileMeta(helperRoot, category);
      return {
        compiled_at: compiledAtOverride || manifest?.compiled_at || null,
        // WHY: source_map_hash enables hash-based staleness detection.
        // Timestamp comparison is fragile (re-sync always runs after compile).
        // Hash comparison: if map_hash === source_map_hash, artifacts are current.
        source_map_hash: manifest?.source_map_hash || null,
      };
    })()),
  };

  const bootConfig = {
    source_hosts: categoryConfig.sourceHosts || [],
    source_registry: categoryConfig.sourceRegistry || {},
    validated_registry: categoryConfig.validatedRegistry || {},
    denylist: categoryConfig.denylist || [],
    search_templates: categoryConfig.searchTemplates || [],
    spec_seeds: categoryConfig.specSeeds || [],
  };

  specDb.upsertCompiledRules(JSON.stringify(compiledRules), JSON.stringify(bootConfig));
  return { reseeded: true };
}

async function readKeyMigrationsJson(helperRoot, category) {
  try {
    const raw = await fs.readFile(
      path.join(helperRoot, category, '_generated', 'key_migrations.json'), 'utf8'
    );
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function readCompileMeta(helperRoot, category) {
  const report = await readCompileReportMeta(helperRoot, category);
  if (report?.source_map_hash) return report;
  return readManifestMeta(helperRoot, category);
}

async function readCompileReportMeta(helperRoot, category) {
  try {
    const raw = await fs.readFile(
      path.join(helperRoot, category, '_generated', '_compile_report.json'), 'utf8'
    );
    const parsed = JSON.parse(raw);
    if (parsed?.compiled === false) return null;
    return {
      compiled_at: parsed?.compiled_at || parsed?.generated_at || null,
      source_map_hash: parsed?.field_studio_map_hash || null,
    };
  } catch {
    return null;
  }
}

async function readManifestMeta(helperRoot, category) {
  try {
    const raw = await fs.readFile(
      path.join(helperRoot, category, '_generated', 'manifest.json'), 'utf8'
    );
    const parsed = JSON.parse(raw);
    return {
      compiled_at: parsed?.generated_at || null,
      source_map_hash: parsed?.source_map_hash || null,
    };
  } catch {
    return null;
  }
}
