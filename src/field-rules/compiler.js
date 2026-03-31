import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { compileCategoryFieldStudio, saveFieldStudioMap } from '../ingest/categoryCompile.js';
import { buildMigrationPlan } from './migrations.js';
import {
  ruleType as ruleTypeAccessor,
  ruleShape as ruleShapeAccessor,
  ruleRequiredLevel as ruleRequiredLevelAccessor,
  ruleAvailability as ruleAvailabilityAccessor,
  ruleDifficulty as ruleDifficultyAccessor,
  ruleEffort as ruleEffortAccessor,
  ruleEvidenceRequired as ruleEvidenceRequiredAccessor
} from '../engine/ruleAccessors.js';
import {
  isObject, toArray, normalizeToken, normalizeFieldKey, titleCase,
  nonEmptyString, pickGeneratedAt, toPhase1Group,
  toSafeInt, normalizeCategoryList
} from './compilerPrimitives.js';
import {
  writeJsonStable, hashFileWithMeta, readJsonIfExists,
  fileExists, listJsonFilesRecursive, copyDirectoryRecursive
} from './compilerFileOps.js';
import {
  buildParseTemplates, buildCrossValidationRules, buildFieldGroups,
  auditFieldMetadata
} from './compilerArtifactBuilders.js';
import {
  compareGeneratedArtifacts, verifyGeneratedManifest,
  validateKeyMigrationsMetadata, validateArtifactsWithSchemas,
  mapArtifactsToList
} from './compilerSchemaValidation.js';

const REQUIRED_ARTIFACTS = [
  'field_rules.json',
  'ui_field_catalog.json',
  'known_values.json',
  'parse_templates.json',
  'cross_validation_rules.json',
  'field_groups.json',
  'key_migrations.json',
  'manifest.json'
];



/**
 * Derive core_fields from field priority levels.
 * identity/required/critical → core. expected/optional → deep.
 */
export function deriveCoreFields(fields = {}) {
  const CORE_LEVELS = new Set(['identity', 'required', 'critical']);
  const coreFields = [];
  for (const [fieldKey, rule] of Object.entries(fields)) {
    if (!isObject(rule)) continue;
    const level = ruleRequiredLevelAccessor(rule);
    if (CORE_LEVELS.has(level)) {
      coreFields.push(fieldKey);
    }
  }
  return coreFields;
}

/**
 * Derive evidence_tier_minimum from evidence.tier_preference.
 * ['tier1','tier2'] → 2 (max tier number). Missing/empty → 3 (deep default).
 */
export function deriveEvidenceTierMinimum(rule) {
  if (!isObject(rule)) return 3;
  const evidence = isObject(rule.evidence) ? rule.evidence : {};
  const prefs = Array.isArray(evidence.tier_preference) ? evidence.tier_preference : [];
  if (prefs.length === 0) return 3;
  let maxTier = 0;
  for (const pref of prefs) {
    const num = Number.parseInt(String(pref || '').replace(/\D/g, ''), 10);
    if (Number.isFinite(num) && num > maxTier) maxTier = num;
  }
  return maxTier > 0 ? maxTier : 3;
}

export function normalizeFieldRulesForPhase1(fieldRules = {}) {
  if (!isObject(fieldRules) || !isObject(fieldRules.fields)) {
    return fieldRules;
  }
  const out = {
    ...fieldRules,
    field_count: Object.keys(fieldRules.fields).length,
    fields: {}
  };
  for (const [fieldKeyRaw, ruleRaw] of Object.entries(fieldRules.fields)) {
    const fieldKey = normalizeFieldKey(fieldKeyRaw);
    if (!fieldKey || !isObject(ruleRaw)) {
      continue;
    }
    const rule = { ...ruleRaw };
    const priority = isObject(rule.priority) ? rule.priority : {};
    const contract = isObject(rule.contract) ? rule.contract : {};
    const evidence = isObject(rule.evidence) ? rule.evidence : {};
    const ui = isObject(rule.ui) ? rule.ui : {};
    const parse = isObject(rule.parse) ? rule.parse : {};
    const dataType = ruleTypeAccessor(rule);
    const outputShape = ruleShapeAccessor(rule);
    const requiredLevel = ruleRequiredLevelAccessor(rule);
    const availability = ruleAvailabilityAccessor(rule);
    const difficulty = ruleDifficultyAccessor(rule);
    const normalizedEffort = ruleEffortAccessor(rule);
    const evidenceRequired = ruleEvidenceRequiredAccessor(rule);

    rule.field_key = String(rule.field_key || fieldKey);
    rule.display_name = String(rule.display_name || ui.label || titleCase(fieldKey));
    rule.group = String(rule.group || toPhase1Group(ui.group));
    rule.data_type = dataType;
    rule.output_shape = outputShape;
    rule.required_level = requiredLevel;
    rule.availability = availability;
    rule.difficulty = difficulty;
    rule.effort = normalizedEffort;
    rule.evidence_required = evidenceRequired;
    rule.priority = {
      ...priority,
      required_level: requiredLevel,
      availability,
      difficulty,
      effort: normalizedEffort
    };
    rule.contract = {
      ...contract,
      type: String(contract.type || dataType || 'string'),
      shape: String(contract.shape || outputShape || 'scalar')
    };
    rule.parse = { ...parse };
    rule.evidence = {
      ...evidence,
      required: evidenceRequired
    };
    if (!nonEmptyString(rule.unknown_reason_default)) {
      rule.unknown_reason_default = 'not_found_after_search';
    }
    out.fields[fieldKey] = rule;
  }
  return out;
}

async function ensurePhase1Artifacts({ category, generatedRoot }) {
  const fieldRulesPath = path.join(generatedRoot, 'field_rules.json');
  const uiCatalogPath = path.join(generatedRoot, 'ui_field_catalog.json');
  const knownValuesPath = path.join(generatedRoot, 'known_values.json');
  const parseTemplatesPath = path.join(generatedRoot, 'parse_templates.json');
  const crossValidationPath = path.join(generatedRoot, 'cross_validation_rules.json');
  const fieldGroupsPath = path.join(generatedRoot, 'field_groups.json');
  const keyMigrationsPath = path.join(generatedRoot, 'key_migrations.json');
  const componentRoot = path.join(generatedRoot, 'component_db');

  const [fieldRules, uiFieldCatalog, knownValues] = await Promise.all([
    readJsonIfExists(fieldRulesPath),
    readJsonIfExists(uiCatalogPath),
    readJsonIfExists(knownValuesPath)
  ]);

  if (!isObject(fieldRules) || !isObject(fieldRules.fields)) {
    throw new Error(`missing_or_invalid:${fieldRulesPath}`);
  }
  const normalizedFieldRules = normalizeFieldRulesForPhase1(fieldRules);
  // Preserve insertion-order key layout from compileCategoryFieldStudio
  const canonicalJson = JSON.stringify(normalizedFieldRules, null, 2) + '\n';
  await fs.writeFile(fieldRulesPath, canonicalJson, 'utf8');

  await writeJsonStable(parseTemplatesPath, buildParseTemplates(normalizedFieldRules));
  await writeJsonStable(crossValidationPath, buildCrossValidationRules(normalizedFieldRules));
  await writeJsonStable(
    fieldGroupsPath,
    buildFieldGroups({
      category,
      generatedAt: pickGeneratedAt(normalizedFieldRules),
      uiFieldCatalog: isObject(uiFieldCatalog) ? uiFieldCatalog : {},
      fieldRules: normalizedFieldRules
    })
  );
  const existingMigrations = await readJsonIfExists(keyMigrationsPath);
  const migrationPlan = buildMigrationPlan({
    previousRules: normalizedFieldRules,
    nextRules: normalizedFieldRules,
    keyMigrations: isObject(existingMigrations) ? existingMigrations : {},
    previousVersion: String(existingMigrations?.previous_version || existingMigrations?.version || '1.0.0'),
    nextVersion: String(existingMigrations?.version || '1.0.0')
  });
  await writeJsonStable(keyMigrationsPath, migrationPlan);
  if (!(await fileExists(componentRoot))) {
    await fs.mkdir(componentRoot, { recursive: true });
  }

  const manifestPath = path.join(generatedRoot, 'manifest.json');
  const artifactFiles = (await listJsonFilesRecursive(generatedRoot))
    .filter((filePath) => {
      const base = path.basename(filePath);
      return base !== 'manifest.json' && base !== '_compile_report.json';
    });
  const artifacts = [];
  for (const filePath of artifactFiles) {
    const meta = await hashFileWithMeta(filePath);
    artifacts.push({
      path: path.relative(generatedRoot, filePath).replace(/\\/g, '/'),
      sha256: meta.sha256,
      bytes: meta.bytes
    });
  }
  artifacts.sort((a, b) => a.path.localeCompare(b.path));
  // WHY: source_map_hash lets the session cache compare content instead of
  // timestamps when deciding if compiled artifacts are stale.
  let sourceMapHash = null;
  try {
    const { hashJson } = await import('../ingest/compileUtils.js');
    const mapPath = path.join(path.dirname(generatedRoot), '_control_plane', 'field_studio_map.json');
    const mapContent = await readJsonIfExists(mapPath);
    if (mapContent) sourceMapHash = hashJson(mapContent);
  } catch { /* best-effort */ }
  await writeJsonStable(manifestPath, {
    version: 1,
    category,
    generated_at: new Date().toISOString(),
    algorithm: 'sha256',
    artifact_count: artifacts.length,
    artifacts,
    source_map_hash: sourceMapHash,
  });

  return {
    fieldRules: fieldRulesPath,
    uiFieldCatalog: uiCatalogPath,
    knownValues: knownValuesPath,
    parseTemplates: parseTemplatesPath,
    crossValidation: crossValidationPath,
    fieldGroups: fieldGroupsPath,
    keyMigrations: keyMigrationsPath,
    manifest: manifestPath,
    componentDbDir: componentRoot,
    field_count: Object.keys(normalizedFieldRules.fields || {}).length,
    known_value_buckets: Object.keys(knownValues?.enums || knownValues?.fields || {}).length
  };
}

async function compileIntoRoot({
  category,
  fieldStudioSourcePath = '',
  fieldStudioMap = null,
  config = {},
  mapPath = null,
  categoryAuthorityRoot
}) {
  const resolvedFieldStudioSourcePath = String(fieldStudioSourcePath || '').trim();
  const resolvedFieldStudioMap = fieldStudioMap ?? null;

  if (resolvedFieldStudioMap) {
    await saveFieldStudioMap({
      category,
      fieldStudioMap: resolvedFieldStudioMap,
      config: {
        ...config,
        categoryAuthorityRoot
      },
      mapPath
    });
  }

  const compileResult = await compileCategoryFieldStudio({
    category,
    fieldStudioSourcePath: resolvedFieldStudioSourcePath,
    fieldStudioMap: resolvedFieldStudioMap,
    config: {
      ...config,
      categoryAuthorityRoot,
      preferFieldStudioCompile: config.preferFieldStudioCompile !== false
    },
    mapPath
  });

  if (!compileResult?.compiled) {
    return {
      compileResult,
      ensured: null
    };
  }
  const generatedRoot = path.join(path.resolve(categoryAuthorityRoot || 'category_authority'), category, '_generated');
  const ensured = await ensurePhase1Artifacts({
    category,
    generatedRoot
  });
  return {
    compileResult,
    ensured
  };
}

export async function compileRules({
  category,
  fieldStudioSourcePath = '',
  fieldStudioMap = null,
  dryRun = false,
  config = {},
  mapPath = null
}) {
  const resolvedFieldStudioSourcePath = String(fieldStudioSourcePath || '').trim();
  const resolvedFieldStudioMap = fieldStudioMap ?? null;
  const normalizedCategory = normalizeFieldKey(category);
  if (!normalizedCategory) {
    throw new Error('category_required');
  }

  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const generatedRoot = path.join(helperRoot, normalizedCategory, '_generated');

  if (dryRun) {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'phase1-dry-run-'));
    const tempHelperRoot = path.join(tempRoot, 'category_authority');
    try {
      let dryRunFieldStudioSourcePath = resolvedFieldStudioSourcePath;
      let dryRunFieldStudioMap = resolvedFieldStudioMap;
      if (!dryRunFieldStudioMap) {
        const controlPlaneRoot = path.join(helperRoot, normalizedCategory, '_control_plane');
        const candidateMapPaths = String(mapPath || '').trim()
          ? [path.resolve(String(mapPath))]
          : [path.join(controlPlaneRoot, 'field_studio_map.json')];
        let existingMap = null;
        for (const candidateMapPath of candidateMapPaths) {
          existingMap = await readJsonIfExists(candidateMapPath);
          if (isObject(existingMap)) break;
        }
        if (isObject(existingMap)) {
          dryRunFieldStudioMap = existingMap;
          const mapSourcePath = String(existingMap.field_studio_source_path || '').trim();
          if (!String(dryRunFieldStudioSourcePath || '').trim() && nonEmptyString(mapSourcePath)) {
            dryRunFieldStudioSourcePath = mapSourcePath;
          }
        }
      }
      // Mirror current category context so dry-run diff matches real compile behavior.
      await copyDirectoryRecursive(
        path.join(helperRoot, normalizedCategory),
        path.join(tempHelperRoot, normalizedCategory)
      );
      const staged = await compileIntoRoot({
        category: normalizedCategory,
        fieldStudioSourcePath: dryRunFieldStudioSourcePath,
        fieldStudioMap: dryRunFieldStudioMap,
        config,
        mapPath: null,
        categoryAuthorityRoot: tempHelperRoot
      });
      if (!staged.compileResult?.compiled) {
        return {
          category: normalizedCategory,
          compiled: false,
          dry_run: true,
          would_change: true,
          errors: staged.compileResult?.errors || ['compile_failed'],
          warnings: staged.compileResult?.warnings || []
        };
      }
      const candidateGenerated = path.join(tempHelperRoot, normalizedCategory, '_generated');
      const existingPresent = await fileExists(generatedRoot);
      if (!existingPresent) {
        return {
          category: normalizedCategory,
          compiled: true,
          dry_run: true,
          would_change: true,
          changes: [{ path: '_generated', type: 'added' }],
          phase1_artifacts: mapArtifactsToList(candidateGenerated),
          field_count: staged.ensured?.field_count || 0,
          warnings: staged.compileResult?.warnings || []
        };
      }

      const diff = await compareGeneratedArtifacts({
        existingRoot: generatedRoot,
        candidateRoot: candidateGenerated
      });
      return {
        category: normalizedCategory,
        compiled: true,
        dry_run: true,
        would_change: diff.would_change,
        changes: diff.changes,
        phase1_artifacts: mapArtifactsToList(generatedRoot),
        field_count: staged.ensured?.field_count || 0,
        warnings: staged.compileResult?.warnings || []
      };
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }

  const result = await compileIntoRoot({
    category: normalizedCategory,
    fieldStudioSourcePath: resolvedFieldStudioSourcePath,
    fieldStudioMap: resolvedFieldStudioMap,
    config,
    mapPath,
    categoryAuthorityRoot: helperRoot
  });

  if (!result.compileResult?.compiled) {
    return {
      category: normalizedCategory,
      compiled: false,
      errors: result.compileResult?.errors || ['compile_failed'],
      warnings: result.compileResult?.warnings || []
    };
  }

  return {
    category: normalizedCategory,
    compiled: true,
    dry_run: false,
    generated_root: generatedRoot,
    phase1_artifacts: mapArtifactsToList(generatedRoot),
    field_count: result.ensured?.field_count || result.compileResult?.field_count || 0,
    warnings: result.compileResult?.warnings || [],
    errors: []
  };
}

export async function validateRules({
  category,
  config = {}
}) {
  const normalizedCategory = normalizeFieldKey(category);
  if (!normalizedCategory) {
    throw new Error('category_required');
  }

  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const generatedRoot = path.join(helperRoot, normalizedCategory, '_generated');
  const errors = [];
  const warnings = [];

  for (const name of REQUIRED_ARTIFACTS) {
    const filePath = path.join(generatedRoot, name);
    if (!(await fileExists(filePath))) {
      errors.push(`missing required artifact: ${name}`);
    }
  }

  const componentRoot = path.join(generatedRoot, 'component_db');
  if (!(await fileExists(componentRoot))) {
    errors.push('missing required artifact: component_db/');
  }
  const componentFiles = (await listJsonFilesRecursive(componentRoot))
    .filter((file) => file.toLowerCase().endsWith('.json'));
  if (componentFiles.length === 0) {
    warnings.push('component_db has no JSON files');
  }

  const [fieldRules, knownValues, parseTemplates, crossValidation, fieldGroups, uiFieldCatalog, keyMigrations, manifest] = await Promise.all([
    readJsonIfExists(path.join(generatedRoot, 'field_rules.json')),
    readJsonIfExists(path.join(generatedRoot, 'known_values.json')),
    readJsonIfExists(path.join(generatedRoot, 'parse_templates.json')),
    readJsonIfExists(path.join(generatedRoot, 'cross_validation_rules.json')),
    readJsonIfExists(path.join(generatedRoot, 'field_groups.json')),
    readJsonIfExists(path.join(generatedRoot, 'ui_field_catalog.json')),
    readJsonIfExists(path.join(generatedRoot, 'key_migrations.json')),
    readJsonIfExists(path.join(generatedRoot, 'manifest.json'))
  ]);

  if (!isObject(fieldRules) || !isObject(fieldRules.fields)) {
    errors.push('field_rules.json is missing fields object');
  }
  if (!isObject(knownValues)) {
    errors.push('known_values.json is not a JSON object');
  }
  if (!isObject(parseTemplates) || !isObject(parseTemplates.templates)) {
    errors.push('parse_templates.json is missing templates object');
  }
  if (!isObject(crossValidation) || !Array.isArray(crossValidation.rules)) {
    errors.push('cross_validation_rules.json is missing rules array');
  }
  if (!isObject(fieldGroups) || !Array.isArray(fieldGroups.groups)) {
    errors.push('field_groups.json is missing groups array');
  }
  if (!isObject(manifest) || !Array.isArray(manifest.artifacts)) {
    errors.push('manifest.json is missing artifacts array');
  }
  const migrationMeta = validateKeyMigrationsMetadata(keyMigrations);
  for (const row of migrationMeta.errors) {
    errors.push(`key_migrations validation failed: ${row}`);
  }
  for (const row of migrationMeta.warnings) {
    warnings.push(`key_migrations warning: ${row}`);
  }

  const fieldCount = isObject(fieldRules?.fields) ? Object.keys(fieldRules.fields).length : 0;
  if (fieldCount === 0) {
    errors.push('field_rules.json has zero fields');
  }
  const metadataAudit = auditFieldMetadata(fieldRules);
  for (const row of metadataAudit.errors) {
    errors.push(`metadata validation failed: ${row}`);
  }
  for (const row of metadataAudit.warnings) {
    warnings.push(`metadata warning: ${row}`);
  }

  const enumCount = Object.keys(knownValues?.enums || knownValues?.fields || {}).length;
  const parseTemplateCount = Object.keys(parseTemplates?.templates || {}).length;
  const crossValidationCount = toArray(crossValidation?.rules).length;
  const fieldGroupCount = toArray(fieldGroups?.groups).length;

  const schema = await validateArtifactsWithSchemas({
    generatedRoot,
    helperRoot,
    artifacts: {
      fieldRules,
      uiFieldCatalog,
      knownValues,
      parseTemplates,
      crossValidation,
      fieldGroups,
      keyMigrations
    },
    componentFiles
  });
  for (const warning of schema.warnings || []) {
    warnings.push(`schema warning: ${warning}`);
  }
  for (const row of schema.artifacts || []) {
    if (row.valid) {
      continue;
    }
    const details = toArray(row.errors).slice(0, 5).join('; ');
    errors.push(`schema validation failed: ${row.artifact} (${row.schema})${details ? ` -> ${details}` : ''}`);
  }
  for (const missingFile of schema.missing_schema_files || []) {
    errors.push(`missing shared schema file: ${missingFile}`);
  }

  if (isObject(manifest) && Array.isArray(manifest.artifacts)) {
    const manifestCheck = await verifyGeneratedManifest({
      generatedRoot,
      manifest
    });
    if (!manifestCheck.valid) {
      for (const row of manifestCheck.errors) {
        errors.push(`manifest validation failed: ${row}`);
      }
    }
  }

  return {
    category: normalizedCategory,
    valid: errors.length === 0,
    errors,
    warnings,
    generated_root: generatedRoot,
    stats: {
      field_count: fieldCount,
      enum_count: enumCount,
      parse_template_count: parseTemplateCount,
      cross_validation_rule_count: crossValidationCount,
      field_group_count: fieldGroupCount,
      component_db_files: componentFiles.length,
      manifest_artifact_count: Array.isArray(manifest?.artifacts) ? manifest.artifacts.length : 0,
      key_migration_count: Array.isArray(keyMigrations?.migrations) ? keyMigrations.migrations.length : 0,
      schema_artifacts_validated: toArray(schema.artifacts).length,
      fields_with_complete_metadata: metadataAudit.complete_count,
      fields_with_incomplete_metadata: metadataAudit.incomplete_count
    },
    schema
  };
}

export { initCategory, scaffoldCategory } from './compilerCategoryInit.js';

export async function listFields({
  category,
  config = {},
  group = '',
  requiredLevel = ''
}) {
  const normalizedCategory = normalizeFieldKey(category);
  if (!normalizedCategory) {
    throw new Error('category_required');
  }

  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const generatedRoot = path.join(helperRoot, normalizedCategory, '_generated');
  const [fieldRules, uiFieldCatalog] = await Promise.all([
    readJsonIfExists(path.join(generatedRoot, 'field_rules.json')),
    readJsonIfExists(path.join(generatedRoot, 'ui_field_catalog.json'))
  ]);
  if (!isObject(fieldRules) || !isObject(fieldRules.fields)) {
    throw new Error(`missing_or_invalid:${path.join(generatedRoot, 'field_rules.json')}`);
  }

  const uiRows = new Map();
  for (const row of toArray(uiFieldCatalog?.fields)) {
    if (!isObject(row)) {
      continue;
    }
    const key = normalizeFieldKey(row.key || row.canonical_key || '');
    if (!key) {
      continue;
    }
    uiRows.set(key, row);
  }

  const groupFilter = normalizeFieldKey(group);
  const requiredFilter = normalizeToken(requiredLevel);
  const rows = [];
  for (const [fieldKeyRaw, rule] of Object.entries(fieldRules.fields)) {
    const fieldKey = normalizeFieldKey(fieldKeyRaw);
    if (!fieldKey || !isObject(rule)) {
      continue;
    }
    const ui = uiRows.get(fieldKey) || {};
    const groupValue = String(ui.group || rule.ui?.group || rule.group || 'general');
    const requiredValue = String(rule.priority?.required_level || rule.required_level || '').trim().toLowerCase();
    if (groupFilter && normalizeFieldKey(groupValue) !== groupFilter) {
      continue;
    }
    if (requiredFilter && requiredValue !== requiredFilter) {
      continue;
    }
    rows.push({
      key: fieldKey,
      display_name: String(ui.label || rule.ui?.label || titleCase(fieldKey)),
      group: groupValue,
      required_level: requiredValue || 'optional',
      data_type: String(rule.contract?.type || rule.type || 'string'),
      output_shape: String(rule.contract?.shape || rule.shape || 'scalar'),
      unit: String(rule.contract?.unit || rule.unit || '')
    });
  }
  rows.sort((a, b) => a.key.localeCompare(b.key));
  return {
    category: normalizedCategory,
    count: rows.length,
    fields: rows
  };
}

export async function fieldReport({
  category,
  config = {},
  format = 'md'
}) {
  const listing = await listFields({ category, config });
  const byGroup = new Map();
  for (const row of listing.fields) {
    const key = normalizeFieldKey(row.group) || 'general';
    if (!byGroup.has(key)) {
      byGroup.set(key, {
        group: row.group || 'general',
        count: 0,
        required: 0,
        critical: 0
      });
    }
    const bucket = byGroup.get(key);
    bucket.count += 1;
    if (row.required_level === 'required') {
      bucket.required += 1;
    }
    if (row.required_level === 'critical') {
      bucket.critical += 1;
    }
  }

  const groupRows = [...byGroup.values()].sort((a, b) => a.group.localeCompare(b.group));
  if (normalizeToken(format) !== 'md') {
    return {
      category: listing.category,
      format: 'json',
      field_count: listing.count,
      groups: groupRows,
      fields: listing.fields
    };
  }

  const lines = [];
  lines.push(`# Field Report: ${listing.category}`);
  lines.push('');
  lines.push(`- Total fields: ${listing.count}`);
  lines.push('');
  lines.push('## Group Summary');
  lines.push('');
  lines.push('| Group | Fields | Required | Critical |');
  lines.push('| --- | ---: | ---: | ---: |');
  for (const row of groupRows) {
    lines.push(`| ${row.group} | ${row.count} | ${row.required} | ${row.critical} |`);
  }
  lines.push('');
  lines.push('## Fields');
  lines.push('');
  lines.push('| Key | Display Name | Group | Required Level | Type | Shape | Unit |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of listing.fields) {
    lines.push(`| ${row.key} | ${row.display_name} | ${row.group} | ${row.required_level} | ${row.data_type} | ${row.output_shape} | ${row.unit || ''} |`);
  }

  return {
    category: listing.category,
    format: 'md',
    report: `${lines.join('\n')}\n`
  };
}

export async function discoverCompileCategories({
  config = {}
} = {}) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  let entries = [];
  try {
    entries = await fs.readdir(helperRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {
        helper_root: helperRoot,
        categories: []
      };
    }
    throw error;
  }

  const categories = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const category = normalizeFieldKey(entry.name);
    if (!category) {
      continue;
    }
    const categoryRoot = path.join(helperRoot, category);
    const hasFieldStudioMap = await fileExists(path.join(categoryRoot, '_control_plane', 'field_studio_map.json'));
    const hasGeneratedRules = await fileExists(path.join(categoryRoot, '_generated', 'field_rules.json'));
    const sourceRoot = path.join(categoryRoot, '_source');
    const hasSourceSeed = await fileExists(path.join(sourceRoot, 'field_catalog.seed.json'));
    if (hasFieldStudioMap || hasGeneratedRules || hasSourceSeed) {
      categories.push(category);
    }
  }

  categories.sort((a, b) => a.localeCompare(b));
  return {
    helper_root: helperRoot,
    categories
  };
}

export async function compileRulesAll({
  categories = [],
  config = {},
  dryRun = false,
  fieldStudioSourcePathByCategory = {},
  fieldStudioMapByCategory = {},
  mapPathByCategory = {}
} = {}) {
  const discovered = await discoverCompileCategories({ config });
  const selectedCategories = normalizeCategoryList(
    categories.length > 0 ? categories : discovered.categories
  );
  if (selectedCategories.length === 0) {
    return {
      compiled: true,
      dry_run: dryRun,
      categories: [],
      count: 0,
      error_count: 0,
      warning_count: 0
    };
  }

  const results = [];
  for (const category of selectedCategories) {
    const startedAt = Date.now();
    const result = await compileRules({
      category,
      fieldStudioSourcePath: String(fieldStudioSourcePathByCategory?.[category] || '').trim(),
      fieldStudioMap: fieldStudioMapByCategory?.[category] ?? null,
      dryRun,
      config,
      mapPath: String(mapPathByCategory?.[category] || '').trim() || null
    });
    results.push({
      ...result,
      duration_ms: Math.max(0, Date.now() - startedAt)
    });
  }

  const compileFailures = results.filter((row) => row.compiled !== true);
  const warningCount = results.reduce((sum, row) => sum + toArray(row.warnings).length, 0);
  const changedCategories = results
    .filter((row) => row.dry_run === true && row.would_change === true)
    .map((row) => row.category);

  return {
    compiled: compileFailures.length === 0,
    dry_run: dryRun,
    helper_root: discovered.helper_root,
    categories: selectedCategories,
    count: selectedCategories.length,
    error_count: compileFailures.length,
    warning_count: warningCount,
    changed_categories: changedCategories,
    results
  };
}

function classifyRulesDiffFromReport(compileReport = {}) {
  const fieldDiff = isObject(compileReport?.diff?.fields) ? compileReport.diff.fields : {};
  const removedCount = toSafeInt(fieldDiff.removed_count, 0);
  const changedCount = toSafeInt(fieldDiff.changed_count, 0);
  const addedCount = toSafeInt(fieldDiff.added_count, 0);
  const severity = removedCount > 0
    ? 'breaking'
    : (changedCount > 0 ? 'potentially_breaking' : 'safe');
  const breaking = removedCount > 0;
  return {
    severity,
    breaking,
    summary: {
      added_fields: addedCount,
      changed_fields: changedCount,
      removed_fields: removedCount
    }
  };
}

export async function readCompileReport({
  category,
  config = {}
}) {
  const normalizedCategory = normalizeFieldKey(category);
  if (!normalizedCategory) {
    throw new Error('category_required');
  }
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const reportPath = path.join(helperRoot, normalizedCategory, '_generated', '_compile_report.json');
  const report = await readJsonIfExists(reportPath);
  return {
    category: normalizedCategory,
    report_path: reportPath,
    exists: Boolean(report),
    report: isObject(report) ? report : {}
  };
}

export async function rulesDiff({
  category,
  config = {}
}) {
  const normalizedCategory = normalizeFieldKey(category);
  if (!normalizedCategory) {
    throw new Error('category_required');
  }
  const [dryRun, currentReport] = await Promise.all([
    compileRules({
      category: normalizedCategory,
      dryRun: true,
      config
    }),
    readCompileReport({
      category: normalizedCategory,
      config
    })
  ]);
  const classification = classifyRulesDiffFromReport(currentReport.report || {});
  return {
    category: normalizedCategory,
    would_change: dryRun.would_change === true,
    changes: toArray(dryRun.changes),
    dry_run: dryRun,
    current_compile_report: currentReport,
    classification
  };
}

export async function watchCompileRules({
  category,
  config = {},
  fieldStudioSourcePath = '',
  fieldStudioMap = null,
  mapPath = null,
  debounceMs = 500,
  watchSeconds = 0,
  maxEvents = 0,
  onEvent = null
}) {
  const normalizedCategory = normalizeFieldKey(category);
  if (!normalizedCategory) {
    throw new Error('category_required');
  }
  const chokidar = (await import('chokidar')).default;
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const categoryRoot = path.join(helperRoot, normalizedCategory);
  const sourceRoot = path.join(categoryRoot, '_source');
  const controlRoot = path.join(categoryRoot, '_control_plane');
  const watchTargets = [];
  if (await fileExists(sourceRoot)) {
    watchTargets.push(sourceRoot);
  }
  if (await fileExists(controlRoot)) {
    watchTargets.push(controlRoot);
  }
  if (watchTargets.length === 0) {
    watchTargets.push(categoryRoot);
  }

  const effectiveDebounce = Math.max(50, toSafeInt(debounceMs, 500));
  const effectiveMaxEvents = Math.max(0, toSafeInt(maxEvents, 0));
  const effectiveWatchSeconds = Math.max(0, toSafeInt(watchSeconds, 0));

  const events = [];
  let compileCount = 0;
  let closed = false;
  let compileInFlight = false;
  let suppressUntil = 0;
  let pendingReason = '';
  let pendingTimer = null;
  let doneResolve = null;
  let doneReject = null;

  const donePromise = new Promise((resolve, reject) => {
    doneResolve = resolve;
    doneReject = reject;
  });

  const cleanupHandlers = [];
  async function emitEvent(row) {
    events.push(row);
    if (typeof onEvent === 'function') {
      await onEvent(row);
    }
  }

  async function shutdown(reason = 'stopped') {
    if (closed) {
      return;
    }
    closed = true;
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      pendingTimer = null;
    }
    for (const [signal, handler] of cleanupHandlers) {
      process.off(signal, handler);
    }
    await watcher.close();
    doneResolve({
      category: normalizedCategory,
      watch_targets: watchTargets,
      reason,
      compile_count: compileCount,
      events
    });
  }

  async function runCompile(trigger = 'change') {
    if (closed || compileInFlight) {
      return;
    }
    compileInFlight = true;
    const startedAt = Date.now();
    try {
      const result = await compileRules({
        category: normalizedCategory,
        fieldStudioSourcePath: String(fieldStudioSourcePath || '').trim(),
        fieldStudioMap: fieldStudioMap ?? null,
        config,
        mapPath
      });
      compileCount += 1;
      suppressUntil = Date.now() + Math.max(300, effectiveDebounce);
      await emitEvent({
        trigger,
        category: normalizedCategory,
        compile_index: compileCount,
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Math.max(0, Date.now() - startedAt),
        compiled: result.compiled === true,
        warnings: toArray(result.warnings),
        errors: toArray(result.errors)
      });
      if (effectiveMaxEvents > 0 && compileCount >= effectiveMaxEvents) {
        await shutdown('max_events_reached');
      }
    } catch (error) {
      await emitEvent({
        trigger,
        category: normalizedCategory,
        compile_index: compileCount + 1,
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date().toISOString(),
        duration_ms: Math.max(0, Date.now() - startedAt),
        compiled: false,
        errors: [String(error?.message || error)]
      });
      await shutdown('compile_failed');
      doneReject(error);
      return;
    } finally {
      compileInFlight = false;
    }
  }

  function scheduleCompile(reason = '') {
    pendingReason = String(reason || 'change');
    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      runCompile(pendingReason).catch((error) => {
        doneReject(error);
      });
    }, effectiveDebounce);
  }

  const watcher = chokidar.watch(watchTargets, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 50
    },
    ignored: [
      /[\\/]_generated[\\/]/,
      /[\\/]_control_plane[\\/]_versions[\\/]/
    ]
  });

  watcher.on('all', (eventName, changedPath) => {
    if (closed) {
      return;
    }
    const now = Date.now();
    if (now < suppressUntil) {
      return;
    }
    scheduleCompile(`${eventName}:${changedPath}`);
  });
  watcher.on('error', (error) => {
    if (closed) {
      return;
    }
    doneReject(error);
    shutdown('watcher_error').catch(() => {});
  });

  const sigIntHandler = () => {
    shutdown('signal_sigint').catch(() => {});
  };
  const sigTermHandler = () => {
    shutdown('signal_sigterm').catch(() => {});
  };
  process.on('SIGINT', sigIntHandler);
  process.on('SIGTERM', sigTermHandler);
  cleanupHandlers.push(['SIGINT', sigIntHandler], ['SIGTERM', sigTermHandler]);

  await runCompile('initial');
  if (!closed && effectiveWatchSeconds > 0) {
    setTimeout(() => {
      shutdown('watch_timeout').catch(() => {});
    }, effectiveWatchSeconds * 1000);
  }

  return donePromise;
}

