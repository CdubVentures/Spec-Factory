import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { executeCommand } from '../../../core/operations/commandExecutor.js';
import { hashJson } from '../../../ingest/compileUtils.js';
import { normalizeFieldStudioMap } from '../../../ingest/compileMapNormalization.js';
import {
  importFieldStudioPatchDocuments,
  parseFieldStudioPatchPayloadFiles,
  previewFieldStudioPatchDocuments,
} from '../../category-audit/fieldStudioPatch.js';
import {
  applyKeyOrderPatchDocument,
  parseKeyOrderPatchPayloadFiles,
  previewKeyOrderPatchDocument,
} from '../../category-audit/keyOrderPatch.js';
import {
  buildPendingEnumValuesFromSuggestions,
  buildStudioComponentDbFromSpecDb,
  buildStudioKnownValuesFromSpecDb,
  summarizeStudioMapPayload,
} from './studioRouteHelpers.js';
import {
  StudioPayloadSchema,
  FieldStudioMapResponseSchema,
  TooltipBankResponseSchema,
  ArtifactEntrySchema,
  KnownValuesResponseSchema,
  ComponentDbResponseSchema,
} from '../contracts/studioSchemas.js';
import {
  EG_LOCKED_KEYS,
  EG_EDITABLE_PATHS,
  EG_DEFAULT_TOGGLES,
  getEgPresetForKey,
  preserveEgEditablePaths,
  sanitizeEgLockedOverrides,
  resolveEgLockedKeys,
} from '../contracts/egPresets.js';
import { sanitizeComponentLockedOverrides } from '../contracts/componentLock.js';

function readCurrentFieldStudioMap({ category, getSpecDb }) {
  const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
  const row = specDb?.getFieldStudioMap?.() ?? null;
  if (!row) return {};
  try {
    const parsed = JSON.parse(row.map_json);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readCurrentFieldKeyOrder({ category, getSpecDb, config, HELPER_ROOT, fs, path }) {
  const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
  const row = specDb?.getFieldKeyOrder?.(category) ?? null;
  if (row?.order_json) {
    try {
      const parsed = JSON.parse(row.order_json);
      if (Array.isArray(parsed)) return parsed;
    } catch { /* fall through to JSON mirror */ }
  }

  if (typeof fs?.readFile !== 'function') return [];
  const jsonPath = path.join(
    config?.categoryAuthorityRoot || HELPER_ROOT || 'category_authority',
    category,
    '_control_plane',
    'field_key_order.json',
  );
  try {
    const parsed = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
    return Array.isArray(parsed?.order) ? parsed.order : [];
  } catch {
    return [];
  }
}

function readCompiledFieldKeys({ category, getSpecDb }) {
  const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
  const compiled = specDb?.getCompiledRules?.() ?? null;
  const fields = compiled?.fields || compiled?.rules?.fields || {};
  return Object.keys(fields);
}

async function writeFieldKeyOrderMirror({ category, order, config, HELPER_ROOT, fs, path }) {
  const authorityRoot = config?.categoryAuthorityRoot || HELPER_ROOT || 'category_authority';
  const fkoPath = path.join(authorityRoot, category, '_control_plane', 'field_key_order.json');
  await fs.mkdir(path.dirname(fkoPath), { recursive: true });
  await fs.writeFile(fkoPath, `${JSON.stringify({ order }, null, 2)}\n`, 'utf8');
  return fkoPath;
}

function sanitizeFieldStudioMapForSave({ fieldStudioMap, appDb }) {
  const normalizedFieldStudioMap = { ...fieldStudioMap };
  if (!normalizedFieldStudioMap.field_overrides) return normalizedFieldStudioMap;
  const saveColors = appDb ? appDb.listColors().map((c) => c.name) : [];
  const saveCtx = saveColors.length > 0 ? { colorNames: saveColors } : undefined;
  normalizedFieldStudioMap.field_overrides = sanitizeEgLockedOverrides(
    normalizedFieldStudioMap.field_overrides,
    normalizedFieldStudioMap.eg_toggles,
    saveCtx,
  );
  return normalizedFieldStudioMap;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function groupDisplayNamesByKey(groups = []) {
  return new Map((Array.isArray(groups) ? groups : []).map((group) => [
    group.group_key,
    group.display_name,
  ]));
}

function defaultAddedKeyRule(addKey, groupDisplayName) {
  const uiGroup = String(groupDisplayName || addKey.group_key || 'ungrouped').trim() || 'ungrouped';
  return {
    label: addKey.display_name,
    group: uiGroup,
    ui: {
      label: addKey.display_name,
      group: uiGroup,
      ...(addKey.ui && typeof addKey.ui === 'object' ? addKey.ui : {}),
    },
    priority: {
      required_level: 'non_mandatory',
      availability: 'conditional',
      difficulty: 'medium',
      ...(addKey.priority && typeof addKey.priority === 'object' ? addKey.priority : {}),
    },
    contract: {
      type: 'string',
      shape: 'scalar',
      unit: '',
      ...(addKey.contract && typeof addKey.contract === 'object' ? addKey.contract : {}),
    },
    aliases: Array.isArray(addKey.aliases) ? addKey.aliases : [],
    search_hints: {
      query_terms: [],
      domain_hints: [],
      content_types: [],
      ...(addKey.search_hints && typeof addKey.search_hints === 'object' ? addKey.search_hints : {}),
    },
    constraints: [],
    ai_assist: {
      reasoning_note: addKey.rationale,
    },
    evidence: {
      min_evidence_refs: 1,
      tier_preference: [],
    },
    notes: addKey.notes || '',
  };
}

function addKeyOrderPatchFieldsToStudioMap({ fieldStudioMap, patchDoc }) {
  const next = cloneJson(fieldStudioMap || {});
  const groupNames = groupDisplayNamesByKey(patchDoc.groups);
  const selectedKeys = new Set(Array.isArray(next.selected_keys) ? next.selected_keys : []);
  next.field_overrides = next.field_overrides && typeof next.field_overrides === 'object'
    ? cloneJson(next.field_overrides)
    : {};
  next.field_groups = Array.isArray(next.field_groups) ? [...next.field_groups] : [];

  for (const addKey of patchDoc.add_keys || []) {
    const groupDisplayName = groupNames.get(addKey.group_key) || addKey.group_key || 'ungrouped';
    selectedKeys.add(addKey.field_key);
    if (!next.field_groups.includes(groupDisplayName)) {
      next.field_groups.push(groupDisplayName);
    }
    next.field_overrides[addKey.field_key] = {
      ...(next.field_overrides[addKey.field_key] || {}),
      ...defaultAddedKeyRule(addKey, groupDisplayName),
    };
  }

  next.selected_keys = [...selectedKeys];
  return next;
}

async function writeAuditorResponsePatchFiles({ category, outputRoot, docs, fs, path }) {
  const responsesDir = path.resolve(outputRoot, category, 'auditors-responses');
  const categoryRoot = path.resolve(outputRoot, category);
  if (responsesDir !== categoryRoot && !responsesDir.startsWith(`${categoryRoot}${path.sep}`)) {
    throw new Error(`unsafe auditor responses path for ${category}`);
  }
  await fs.mkdir(responsesDir, { recursive: true });
  for (const doc of docs) {
    const fileName = path.basename(String(doc.source_file || ''));
    const filePath = path.resolve(responsesDir, fileName);
    if (!fileName || !filePath.startsWith(`${responsesDir}${path.sep}`)) {
      throw new Error(`unsafe auditor response filename "${doc.source_file || ''}"`);
    }
    const { source_file, source_path, ...storedDoc } = doc;
    await fs.writeFile(filePath, `${JSON.stringify(storedDoc, null, 2)}\n`, 'utf8');
  }
  return responsesDir;
}

function patchImportResponse(preview, extras = {}) {
  const { fieldStudioMap, validation, ...rest } = preview;
  return {
    ...rest,
    ...extras,
  };
}

async function refreshCategoryAuditReportsAfterImport({
  generateCategoryAuditReportPack,
  category,
  config,
  outputRoot,
}) {
  if (typeof generateCategoryAuditReportPack !== 'function') return null;
  return generateCategoryAuditReportPack({
    category,
    consumer: 'key_finder',
    config,
    outputRoot,
  });
}

export function registerStudioRoutes(ctx) {
  const {
    jsonRes,
    readJsonBody,
    config,
    HELPER_ROOT,
    safeReadJson,
    safeStat,
    listFiles,
    fs,
    path,
    sessionCache,
    saveFieldStudioMap,
    validateFieldStudioMap,
    invalidateFieldRulesCache,
    buildFieldLabelsMap,
    getSpecDb,
    getSpecDbReady,
    storage,
    startProcess,
    broadcastWs,
    reviewLayoutByCategory,
    cleanVariant,
    appDb,
    syncSpecDbForCategory,
    generateCategoryAuditReportPack,
  } = ctx;
  const hasStudioMapHandlers = (
    typeof saveFieldStudioMap === 'function'
    && typeof validateFieldStudioMap === 'function'
  );

  return async function handleStudioRoutes(parts, params, method, req, res) {
    if (parts[0] === 'field-labels' && parts[1] && !parts[2] && method === 'GET') {
      const category = parts[1];
      const session = await sessionCache.getSessionRules(category);
      return jsonRes(res, 200, { category, labels: session.labels });
    }

    // Studio payload
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'payload' && method === 'GET') {
      const category = parts[1];
      const payloadSpecDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
      const payloadCompiledRules = payloadSpecDb?.getCompiledRules?.() ?? null;
      const session = await sessionCache.getSessionRules(category);

      // WHY: Read eg_toggles from the studio map (SQL) to determine which keys are actively locked.
      // Merge under EG_DEFAULT_TOGGLES so keys missing from legacy-persisted toggles
      // (categories saved before a new EG preset was added) default to true. Persisted
      // `false` still wins — explicit opt-outs survive the merge.
      const payloadMapRow = typeof getSpecDb === 'function' ? getSpecDb(category)?.getFieldStudioMap?.() ?? null : null;
      const payloadMap = payloadMapRow ? (() => { try { return JSON.parse(payloadMapRow.map_json); } catch { return null; } })() : null;
      const rawToggles = payloadMap?.eg_toggles;
      const egToggles = { ...EG_DEFAULT_TOGGLES, ...(rawToggles && typeof rawToggles === 'object' ? rawToggles : {}) };
      const activeLockedKeys = resolveEgLockedKeys(egToggles);

      // WHY: Dynamic color list from color_registry DB — the SSOT for valid atoms.
      const registeredColors = appDb ? appDb.listColors().map((c) => c.name) : [];
      const egCtx = registeredColors.length > 0 ? { colorNames: registeredColors } : undefined;

      // WHY: Backfill EG fields for categories created before this feature.
      // O(1): generic loop over EG_LOCKED_KEYS — new registry entries auto-backfill.
      const fields = { ...session.mergedFields };
      let needsMigrate = false;
      for (const k of EG_LOCKED_KEYS) {
        if (!fields[k] && egToggles[k] !== false) {
          fields[k] = getEgPresetForKey(k, egCtx);
          needsMigrate = true;
        }
      }

      // WHY: Re-apply preset for locked fields to ensure reasoning_note reflects current registry.
      for (const k of activeLockedKeys) {
        if (fields[k]) {
          fields[k] = preserveEgEditablePaths(fields[k], getEgPresetForKey(k, egCtx));
        }
      }

      const order = [...session.mergedFieldOrder];
      for (const k of EG_LOCKED_KEYS) {
        if (!order.includes(k)) order.push(k);
      }

      // WHY: Write-on-read migration — persist so next load doesn't need backfill.
      // Fire-and-forget; does not block the response.
      if (needsMigrate && payloadMap && hasStudioMapHandlers) {
        const patched = { ...payloadMap };
        const overrides = { ...(patched.field_overrides || {}) };
        for (const k of EG_LOCKED_KEYS) {
          if (!overrides[k]) overrides[k] = getEgPresetForKey(k, egCtx);
        }
        patched.field_overrides = overrides;
        // Merge with defaults so new EG keys are persisted as true while explicit
        // opt-outs (persisted false) survive the migration.
        patched.eg_toggles = { ...EG_DEFAULT_TOGGLES, ...(patched.eg_toggles && typeof patched.eg_toggles === 'object' ? patched.eg_toggles : {}) };
        const keys = [...(patched.selected_keys || [])];
        for (const k of EG_LOCKED_KEYS) { if (!keys.includes(k)) keys.push(k); }
        patched.selected_keys = keys;
        const specDb = getSpecDb(category);
        if (specDb) {
          try {
            // WHY: normalize before hashing so DB hash matches what compile
            // re-sync will compute — prevents perpetual compileStale orange.
            const normalizedPatched = normalizeFieldStudioMap(patched);
            specDb.upsertFieldStudioMap(JSON.stringify(normalizedPatched), hashJson(normalizedPatched));
            saveFieldStudioMap({ category, fieldStudioMap: normalizedPatched, config }).catch(() => {});
            sessionCache.invalidateSessionCache(category);
          } catch { /* non-critical migration write */ }
        }
      }

      return jsonRes(res, 200, StudioPayloadSchema.parse({
        category,
        fieldRules: fields,
        fieldOrder: order,
        uiFieldCatalog: payloadCompiledRules?.ui_field_catalog || null,
        guardrails: null,
        compiledAt: session.compiledAt,
        mapSavedAt: session.mapSavedAt,
        compileStale: session.compileStale,
        egLockedKeys: activeLockedKeys,
        egEditablePaths: [...EG_EDITABLE_PATHS],
        egToggles,
        registeredColors,
      }));
    }

    // Studio products (reads from SQL)
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'products' && method === 'GET') {
      const category = parts[1];
      const specDb = getSpecDb(category);
      const dbRows = specDb?.getAllProducts?.() || [];
      const products = [];
      const brandSet = new Set();
      for (const row of dbRows) {
        const brand = String(row.brand || '').trim();
        const model = String(row.model || '').trim();
        const variant = cleanVariant(row.variant);
        if (!brand || !model) continue;
        brandSet.add(brand);
        products.push({
          brand,
          model,
          variant,
          productId: row.product_id,
        });
      }
      return jsonRes(res, 200, { products, brands: [...brandSet].sort() });
    }

    // Studio compile (in-process via command executor)
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'compile' && method === 'POST') {
      const category = parts[1];
      const { operationId, error } = await executeCommand({
        type: 'compile',
        category,
        config,
        deps: { sessionCache, invalidateFieldRulesCache, reviewLayoutByCategory, syncSpecDbForCategory, getSpecDb, broadcastWs },
      });
      if (error === 'category_busy') return jsonRes(res, 409, { error: 'category_busy' });
      return jsonRes(res, 200, { operationId, type: 'compile', category, running: true });
    }

    // Studio: validate rules (in-process via command executor)
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'validate-rules' && method === 'POST') {
      const category = parts[1];
      const { operationId, error } = await executeCommand({
        type: 'validate',
        category,
        config,
        deps: {},
      });
      if (error === 'category_busy') return jsonRes(res, 409, { error: 'category_busy' });
      return jsonRes(res, 200, { operationId, type: 'validate', category, running: true });
    }

    if (parts[0] === 'studio' && parts[1] && parts[2] === 'guardrails' && method === 'GET') {
      const category = parts[1];
      const OUTPUT_ROOT = ctx.OUTPUT_ROOT;
      const guardrailPath = path.join(OUTPUT_ROOT, '_studio', category, 'guardrails.json');
      const data = await safeReadJson(guardrailPath);
      return jsonRes(res, 200, data || {});
    }

    // Studio known-values
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'known-values' && method === 'GET') {
      const category = parts[1];
      const runtimeSpecDb = typeof getSpecDbReady === 'function'
        ? await getSpecDbReady(category)
        : null;
      const specDbReady = Boolean(runtimeSpecDb)
        && (typeof runtimeSpecDb.isSeeded !== 'function' || runtimeSpecDb.isSeeded());
      if (!specDbReady) {
        return jsonRes(res, 503, {
          error: 'specdb_not_ready',
          message: `SpecDb not ready for ${category}`,
        });
      }
      const specDbPayload = buildStudioKnownValuesFromSpecDb(runtimeSpecDb, category);
      if (specDbPayload) {
        return jsonRes(res, 200, KnownValuesResponseSchema.parse(specDbPayload));
      }
      return jsonRes(res, 503, {
        error: 'specdb_not_ready',
        message: `SpecDb not ready for ${category}`,
      });
    }

    // Studio component-db (entity names by type)
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'component-db' && method === 'GET') {
      const category = parts[1];
      const runtimeSpecDb = typeof getSpecDbReady === 'function'
        ? await getSpecDbReady(category)
        : null;
      const specDbResult = buildStudioComponentDbFromSpecDb(runtimeSpecDb);
      if (specDbResult) {
        return jsonRes(res, 200, ComponentDbResponseSchema.parse(specDbResult));
      }
      return jsonRes(res, 503, {
        error: 'specdb_not_ready',
        message: `SpecDb not ready for ${category}`,
      });
    }

    // Studio map GET — reads from SQL (SSOT). Reseed handles JSON→SQL on boot.
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'field-studio-map' && method === 'GET') {
      if (!hasStudioMapHandlers) {
        return jsonRes(res, 500, { error: 'studio_map_handlers_missing' });
      }
      const category = parts[1];
      const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
      const sqlRow = specDb?.getFieldStudioMap?.() ?? null;
      if (sqlRow) {
        try {
          const map = JSON.parse(sqlRow.map_json);
          return jsonRes(res, 200, FieldStudioMapResponseSchema.parse({ file_path: `specDb:${category}`, map }));
        } catch { /* parse failed — return empty */ }
      }
      return jsonRes(res, 200, FieldStudioMapResponseSchema.parse({ file_path: '', map: {} }));
    }

    // Studio map PUT (save)
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'field-studio-map' && method === 'PUT') {
      if (!hasStudioMapHandlers) {
        return jsonRes(res, 500, { error: 'studio_map_handlers_missing' });
      }
      const category = parts[1];
      const body = await readJsonBody(req);
      const validation = validateFieldStudioMap(body, { category });
      if (!validation?.valid) {
        return jsonRes(res, 400, {
          error: 'invalid_field_studio_map',
          valid: false,
          errors: Array.isArray(validation?.errors) ? validation.errors : [],
          warnings: Array.isArray(validation?.warnings) ? validation.warnings : [],
        });
      }
      const normalizedFieldStudioMap = validation?.normalized && typeof validation.normalized === 'object'
        ? validation.normalized
        : body;
      // WHY: Server-side lock enforcement — reset non-editable paths on locked fields to preset.
      // Dynamic color names from registry ensure reasoning_note stays current.
      if (normalizedFieldStudioMap.field_overrides) {
        const saveColors = appDb ? appDb.listColors().map((c) => c.name) : [];
        const saveCtx = saveColors.length > 0 ? { colorNames: saveColors } : undefined;
        normalizedFieldStudioMap.field_overrides = sanitizeEgLockedOverrides(
          normalizedFieldStudioMap.field_overrides,
          normalizedFieldStudioMap.eg_toggles,
          saveCtx,
        );
        // WHY: Phase 4 — strip contract-identity paths (contract.*, enum.source,
        // enum.values, enum.allow_*) from any override that self-locks via
        // enum.source = component_db.<self>. Mirrors the GUI store guard so
        // scripted PUTs cannot bypass it.
        normalizedFieldStudioMap.field_overrides = sanitizeComponentLockedOverrides(
          normalizedFieldStudioMap.field_overrides,
        );
      }
      try {
        let incomingSummary = summarizeStudioMapPayload(normalizedFieldStudioMap);
        if (params.get('allowEmptyOverwrite') !== 'true') {
          // WHY: Read existing map from SQL (SSOT). Reseed handles JSON→SQL on boot.
          const specDbForGuard = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
          const guardRow = specDbForGuard?.getFieldStudioMap?.() ?? null;
          const existingMap = guardRow ? (() => { try { return JSON.parse(guardRow.map_json); } catch { return null; } })() : null;
          const existingSummary = summarizeStudioMapPayload(existingMap);
          if (!incomingSummary.has_mapping_payload && existingSummary.has_mapping_payload) {
            return jsonRes(res, 409, {
              error: 'empty_map_overwrite_rejected',
              message: 'Incoming studio map has no component sources or data lists. Add mapping payload or set allowEmptyOverwrite=true to force.',
              existing: existingSummary,
              incoming: incomingSummary,
            });
          }
          if (existingSummary.component_sources > 0 && incomingSummary.component_sources === 0) {
            normalizedFieldStudioMap.component_sources = existingMap.component_sources;
            incomingSummary = summarizeStudioMapPayload(normalizedFieldStudioMap);
          }
        }
        const mapHash = hashJson(normalizedFieldStudioMap);

        // PRIMARY: write to SQL
        const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
        if (specDb) {
          specDb.upsertFieldStudioMap(JSON.stringify(normalizedFieldStudioMap), mapHash);
        }

        // SECONDARY: export to JSON file (true fire-and-forget, for compile/git)
        saveFieldStudioMap({ category, fieldStudioMap: normalizedFieldStudioMap, config }).catch((err) => {
          console.warn(`[studio-map] JSON export failed (non-critical): ${err.message}`);
        });

        sessionCache.invalidateSessionCache(category);
        reviewLayoutByCategory.delete(category);

        emitDataChange({
          broadcastWs,
          event: 'field-studio-map-saved',
          category,
          categories: [category],
          domains: ['studio', 'mapping', 'review-layout', 'labels'],
          meta: {
            map_sections: Array.isArray(normalizedFieldStudioMap?.field_mapping) ? normalizedFieldStudioMap.field_mapping.length : 0,
          },
        });
        return jsonRes(res, 200, {
          file_path: `specDb:${category}`,
          map_hash: mapHash,
          map: normalizedFieldStudioMap,
          field_studio_map: normalizedFieldStudioMap,
        });
      } catch (err) {
        return jsonRes(res, 500, { error: 'save_failed', message: err.message });
      }
    }

    // Studio Field Studio patch preview/apply.
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'field-studio-patches' && ['preview', 'apply'].includes(parts[3]) && method === 'POST') {
      if (!hasStudioMapHandlers) {
        return jsonRes(res, 500, { error: 'studio_map_handlers_missing' });
      }
      const category = parts[1];
      const action = parts[3];
      let body = {};
      try {
        body = (await readJsonBody(req)) || {};
      } catch {
        return jsonRes(res, 400, { error: 'invalid_json_body' });
      }

      try {
        const docs = parseFieldStudioPatchPayloadFiles({ category, files: body.files });
        const currentMap = readCurrentFieldStudioMap({ category, getSpecDb });
        if (action === 'preview') {
          const preview = previewFieldStudioPatchDocuments({
            category,
            fieldStudioMap: currentMap,
            patchDocs: docs,
            validateFieldStudioMap,
          });
          if (!preview.valid) {
            return jsonRes(res, 400, {
              error: 'invalid_field_studio_patch_import',
              ...patchImportResponse(preview),
            });
          }
          return jsonRes(res, 200, patchImportResponse(preview));
        }

        const result = importFieldStudioPatchDocuments({
          category,
          fieldStudioMap: currentMap,
          patchDocs: docs,
          validateFieldStudioMap,
        });
        const saveReadyFieldStudioMap = sanitizeFieldStudioMapForSave({
          fieldStudioMap: result.fieldStudioMap,
          appDb,
        });
        const outputRoot = path.resolve(config?.localInputRoot || '.workspace', 'reports');
        const storageDir = await writeAuditorResponsePatchFiles({
          category,
          outputRoot,
          docs,
          fs,
          path,
        });
        const mapHash = hashJson(saveReadyFieldStudioMap);
        const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
        if (specDb) {
          specDb.upsertFieldStudioMap(JSON.stringify(saveReadyFieldStudioMap), mapHash);
        }
        await saveFieldStudioMap({ category, fieldStudioMap: saveReadyFieldStudioMap, config });
        sessionCache.invalidateSessionCache(category);
        reviewLayoutByCategory.delete(category);
        const refreshedReports = await refreshCategoryAuditReportsAfterImport({
          generateCategoryAuditReportPack,
          category,
          config,
          outputRoot,
        });
        emitDataChange({
          broadcastWs,
          event: 'field-studio-map-saved',
          category,
          categories: [category],
          domains: ['studio', 'mapping', 'review-layout', 'labels'],
          meta: {
            imported_patch_files: result.applied.length,
            imported_changes: result.changes.length,
          },
        });
        return jsonRes(res, 200, {
          category,
          valid: true,
          applied: result.applied,
          files: result.applied,
          changes: result.changes,
          errors: [],
          warnings: Array.isArray(result.validation?.warnings) ? result.validation.warnings : [],
          map_hash: mapHash,
          storageDir,
          refreshedReports,
        });
      } catch (err) {
        return jsonRes(res, 400, {
          error: 'invalid_field_studio_patch_import',
          message: err.message,
        });
      }
    }

    // Studio key-order patch preview/apply.
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'key-order-patches' && ['preview', 'apply'].includes(parts[3]) && method === 'POST') {
      const category = parts[1];
      const action = parts[3];
      let body = {};
      try {
        body = (await readJsonBody(req)) || {};
      } catch {
        return jsonRes(res, 400, { error: 'invalid_json_body' });
      }

      const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
      if (!specDb) {
        return jsonRes(res, 503, { error: 'specdb_not_ready', message: `SpecDb not ready for ${category}` });
      }

      try {
        const currentOrder = await readCurrentFieldKeyOrder({
          category,
          getSpecDb,
          config,
          HELPER_ROOT,
          fs,
          path,
        });
        const existingFieldKeys = readCompiledFieldKeys({ category, getSpecDb });
        const docs = parseKeyOrderPatchPayloadFiles({
          category,
          files: body.files,
          currentOrder,
          existingFieldKeys,
        });
        const patchDoc = docs[0];

        if (action === 'preview') {
          const preview = previewKeyOrderPatchDocument({
            category,
            currentOrder,
            existingFieldKeys,
            patchDoc,
          });
          return jsonRes(res, 200, preview);
        }

        const result = applyKeyOrderPatchDocument(patchDoc, {
          category,
          currentOrder,
          existingFieldKeys,
        });
        specDb.setFieldKeyOrder(category, JSON.stringify(result.order));
        await writeFieldKeyOrderMirror({
          category,
          order: result.order,
          config,
          HELPER_ROOT,
          fs,
          path,
        });
        let mapHash = null;
        if (result.document.add_keys.length > 0) {
          if (!hasStudioMapHandlers) {
            throw new Error('studio map handlers are required to add keys');
          }
          const patchedMap = addKeyOrderPatchFieldsToStudioMap({
            fieldStudioMap: readCurrentFieldStudioMap({ category, getSpecDb }),
            patchDoc: result.document,
          });
          const validation = validateFieldStudioMap(patchedMap, { category });
          if (validation?.valid === false) {
            const details = Array.isArray(validation.errors) ? validation.errors.join('; ') : 'unknown validation error';
            throw new Error(`added key field_studio_map failed validation: ${details}`);
          }
          const normalizedMap = validation?.normalized && typeof validation.normalized === 'object'
            ? validation.normalized
            : patchedMap;
          const saveReadyFieldStudioMap = sanitizeFieldStudioMapForSave({
            fieldStudioMap: normalizedMap,
            appDb,
          });
          mapHash = hashJson(saveReadyFieldStudioMap);
          specDb.upsertFieldStudioMap(JSON.stringify(saveReadyFieldStudioMap), mapHash);
          await saveFieldStudioMap({ category, fieldStudioMap: saveReadyFieldStudioMap, config });
        }
        const outputRoot = path.resolve(config?.localInputRoot || '.workspace', 'reports');
        const storageDir = await writeAuditorResponsePatchFiles({
          category,
          outputRoot,
          docs,
          fs,
          path,
        });
        sessionCache.invalidateSessionCache(category);
        reviewLayoutByCategory.delete(category);
        const refreshedReports = await refreshCategoryAuditReportsAfterImport({
          generateCategoryAuditReportPack,
          category,
          config,
          outputRoot,
        });
        emitDataChange({
          broadcastWs,
          event: 'field-key-order-saved',
          category,
          categories: [category],
          domains: ['studio', 'mapping', 'review-layout'],
          meta: {
            order_length: result.order.length,
            imported_patch_files: docs.length,
            imported_changes: result.changes.length,
          },
        });
        return jsonRes(res, 200, {
          category,
          valid: true,
          applied: result.files,
          files: result.files,
          changes: result.changes,
          order: result.order,
          errors: [],
          warnings: result.document.rename_keys.length > 0
            ? ['rename_keys are review proposals only; importer does not rename field rule files']
            : [],
          map_hash: mapHash,
          storageDir,
          refreshedReports,
        });
      } catch (err) {
        return jsonRes(res, 400, {
          error: 'invalid_key_order_patch_import',
          message: err.message,
        });
      }
    }

    // Studio field key order (lightweight instant order persistence, no version bump)
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'field-key-order' && method === 'PUT') {
      const category = parts[1];
      const body = await readJsonBody(req);
      const order = Array.isArray(body?.order) ? body.order : null;
      if (!order) {
        return jsonRes(res, 400, { error: 'order_required', message: 'order must be a string array' });
      }
      const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
      if (!specDb) {
        return jsonRes(res, 503, { error: 'specdb_not_ready', message: `SpecDb not ready for ${category}` });
      }
      specDb.setFieldKeyOrder(category, JSON.stringify(order));
      // WHY: Mirror SQL to durable JSON so field_key_order survives spec.sqlite rebuild.
      const fkoPath = path.join(
        config.categoryAuthorityRoot || 'category_authority',
        category, '_control_plane', 'field_key_order.json'
      );
      fs.writeFile(fkoPath, JSON.stringify({ order }, null, 2)).catch((err) => {
        console.warn('[mirror-write] field_key_order.json write-back failed:', err?.message || err);
      });
      sessionCache.invalidateSessionCache(category);
      // WHY: Live propagation — any consumer of group/key ordering (Overview
      // Keys popover, KeyFinder dashboard) must refetch when order changes.
      emitDataChange({
        broadcastWs,
        event: 'field-key-order-saved',
        category,
        categories: [category],
        domains: ['studio', 'mapping', 'review-layout'],
        meta: { order_length: order.length },
      });
      return jsonRes(res, 200, { ok: true, category });
    }

    // Studio map validate
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'validate-field-studio-map' && method === 'POST') {
      if (!hasStudioMapHandlers) {
        return jsonRes(res, 500, { error: 'studio_map_handlers_missing' });
      }
      const category = parts[1];
      const body = await readJsonBody(req);
      const result = validateFieldStudioMap(body, { category });
      return jsonRes(res, 200, result);
    }

    // Studio tooltip bank
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'tooltip-bank' && method === 'GET') {
      const category = parts[1];
      const catRoot = path.join(HELPER_ROOT, category);
      // WHY: SQL is the SSOT for field_studio_map. Reseed handles JSON→SQL on boot.
      const tooltipSpecDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
      const tooltipRow = tooltipSpecDb?.getFieldStudioMap?.() ?? null;
      const mapData = tooltipRow
        ? (() => { try { return JSON.parse(tooltipRow.map_json); } catch { return null; } })()
        : null;
      const tooltipPath = mapData?.tooltip_source?.path || '';
      const tooltipFiles = [];
      const tooltipEntries = {};
      try {
        const entries = await fs.readdir(catRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile() && /^hbs_tooltips/i.test(entry.name)) {
            tooltipFiles.push(entry.name);
            const raw = await fs.readFile(path.join(catRoot, entry.name), 'utf8').catch(() => '');
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (typeof parsed === 'object') {
                  for (const [k, v] of Object.entries(parsed)) {
                    tooltipEntries[k] = v;
                  }
                }
              } catch { /* not JSON, skip */ }
            }
          }
        }
      } catch { /* no files */ }
      return jsonRes(res, 200, TooltipBankResponseSchema.parse({ entries: tooltipEntries, files: tooltipFiles, configuredPath: tooltipPath }));
    }

    // Studio cache invalidation
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'invalidate-cache' && method === 'POST') {
      const category = parts[1];
      sessionCache.invalidateSessionCache(category);
      invalidateFieldRulesCache(category);
      reviewLayoutByCategory.delete(category);
      return jsonRes(res, 200, { ok: true });
    }

    // Studio generated artifacts list
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'artifacts' && method === 'GET') {
      const category = parts[1];
      const generatedRoot = path.join(HELPER_ROOT, category, '_generated');
      const files = await listFiles(generatedRoot, '.json');
      const artifacts = [];
      for (const f of files) {
        const st = await safeStat(path.join(generatedRoot, f));
        artifacts.push({ name: f, size: st?.size || 0, updated: st?.mtime?.toISOString() || '' });
      }
      return jsonRes(res, 200, artifacts.map(a => ArtifactEntrySchema.parse(a)));
    }

    return false;
  };
}
