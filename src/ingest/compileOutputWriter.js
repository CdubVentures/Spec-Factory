// WHY: Extracted from categoryCompile.js — all file-system write operations
// for the compilation output (control plane, generated artifacts, component DB,
// compile report).

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  isObject,
  normalizeText,
  normalizeToken,
  sortDeep,
} from './compileUtils.js';
import {
  writeJsonStable,
  writeCanonicalFieldRulesPair,
} from './compileFileIo.js';
import { applyKeyLevelConstraintsToEntities } from './compileComponentHelpers.js';

export async function writeCompileOutput({
  controlPlaneRoot,
  controlPlaneFieldStudioMapPath,
  resolvedControlMapPath,
  generatedRoot,
  categoryRoot,
  map,
  fieldRulesCanonical,
  uiFieldCatalog,
  knownValuesArtifact,
  compileReport,
  validation,
  componentDb,
  fieldsRuntime,
  keyMigrations,
  category,
  compileTimestamp,
  resolvedFieldStudioSourcePath,
  fieldStudioSourceHash,
  mapHash,
  keyRows,
}) {
  // ── Write control plane ──
  await fs.mkdir(controlPlaneRoot, { recursive: true });
  await writeJsonStable(resolvedControlMapPath, map);
  if (resolvedControlMapPath !== controlPlaneFieldStudioMapPath) {
    await writeJsonStable(controlPlaneFieldStudioMapPath, map);
  }
  compileReport.artifacts.control_plane_version = { path: null, version_id: null };

  // ── Validation gate — early return if validation errors ──
  if (validation.errors.length > 0) {
    return {
      controlPlaneSnapshot: null,
      earlyReturn: {
        category,
        compiled: false,
        field_studio_source_path: resolvedFieldStudioSourcePath,
        field_studio_source_hash: fieldStudioSourceHash,
        map_path: resolvedControlMapPath,
        map_hash: mapHash,
        selected_key_count: keyRows.length,
        errors: compileReport.errors,
        warnings: compileReport.warnings,
        compile_report: compileReport,
        control_plane_version: null,
      },
    };
  }

  // ── Write generated artifacts ──
  await fs.mkdir(generatedRoot, { recursive: true });
  const canonicalPair = await writeCanonicalFieldRulesPair({
    generatedRoot,
    runtimePayload: fieldRulesCanonical
  });
  compileReport.artifacts.field_rules.hash = canonicalPair.field_rules_hash;
  await writeJsonStable(path.join(generatedRoot, 'ui_field_catalog.json'), uiFieldCatalog);
  await writeJsonStable(path.join(generatedRoot, 'known_values.json'), knownValuesArtifact);
  await fs.rm(path.join(generatedRoot, 'schema.json'), { force: true });
  await fs.rm(path.join(generatedRoot, 'required_fields.json'), { force: true });
  if (Object.keys(keyMigrations).length > 0) {
    const keyMigrationsEnvelope = {
      bump: 'patch',
      key_map: sortDeep(keyMigrations),
      migrations: Object.entries(keyMigrations).map(([from, to]) => ({
        from,
        reason: 'auto-generated from key map',
        to,
        type: 'rename'
      })),
      previous_version: '1.0.0',
      summary: { added_count: 0, changed_count: 0, removed_count: 0 },
      version: '1.0.0'
    };
    await writeJsonStable(path.join(generatedRoot, 'key_migrations.json'), keyMigrationsEnvelope);
  } else {
    await fs.rm(path.join(generatedRoot, 'key_migrations.json'), { force: true });
  }

  // ── Write component database ──
  const componentRoot = path.join(generatedRoot, 'component_db');
  await fs.rm(componentRoot, { recursive: true, force: true });
  await fs.mkdir(componentRoot, { recursive: true });
  const componentTypeOutputName = {
    sensor: 'sensors',
    switch: 'switches',
    encoder: 'encoders',
    mcu: 'mcus',
    material: 'materials'
  };
  applyKeyLevelConstraintsToEntities(componentDb, fieldsRuntime);

  // Merge component overrides from _overrides/components/ into compiled output
  const componentOverrideDir = path.join(categoryRoot, '_overrides', 'components');
  const componentOverrides = {};
  try {
    const overrideEntries = await fs.readdir(componentOverrideDir, { withFileTypes: true });
    for (const entry of overrideEntries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const ovr = JSON.parse(await fs.readFile(path.join(componentOverrideDir, entry.name), 'utf8'));
        if (ovr?.componentType && ovr?.name && isObject(ovr?.properties)) {
          const typeKey = normalizeToken(ovr.componentType);
          if (!componentOverrides[typeKey]) componentOverrides[typeKey] = {};
          componentOverrides[typeKey][normalizeToken(ovr.name)] = ovr.properties;
        }
      } catch { /* skip corrupt override files */ }
    }
  } catch (err) {
    if (err?.code !== 'ENOENT') throw err;
  }
  for (const [componentType, rows] of Object.entries(componentDb)) {
    const typeOverrides = componentOverrides[normalizeToken(componentType)] || {};
    for (const entity of rows) {
      const entityKey = normalizeToken(entity.name || '');
      const ovr = typeOverrides[entityKey];
      if (ovr && isObject(entity.properties)) {
        for (const [prop, val] of Object.entries(ovr)) {
          if (val !== undefined && val !== null && val !== '') {
            entity.properties[prop] = val;
            if (!entity.__overridden) entity.__overridden = {};
            entity.__overridden[prop] = true;
          }
        }
      }
    }
    const payload = {
      version: 1,
      category,
      component_type: componentType,
      generated_at: compileTimestamp,
      items: rows
    };
    const outputName = normalizeText(componentTypeOutputName[normalizeToken(componentType)] || componentType) || componentType;
    await writeJsonStable(path.join(componentRoot, `${outputName}.json`), payload);
  }

  // ── Finalize ──
  await fs.mkdir(path.join(categoryRoot, '_overrides'), { recursive: true });

  await writeJsonStable(path.join(generatedRoot, '_compile_report.json'), compileReport);

  return { controlPlaneSnapshot: null, earlyReturn: null };
}
