import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { runEnumConsistencyReview as runEnumConsistencyReviewDefault } from '../../indexing/index.js';
import { hashJson } from '../../../ingest/compileUtils.js';
import {
  applyEnumConsistencyToSuggestions,
  buildPendingEnumValuesFromSuggestions,
  buildStudioComponentDbFromSpecDb,
  buildStudioKnownValuesFromSpecDb,
  dedupeEnumValues,
  isEnumConsistencyReviewEnabled,
  readEnumConsistencyFormatHint,
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
    loadCategoryConfig,
    startProcess,
    broadcastWs,
    reviewLayoutByCategory,
    cleanVariant,
    runEnumConsistencyReview = runEnumConsistencyReviewDefault,
    appDb,
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
      const catConfig = await loadCategoryConfig(category, { storage, config }).catch(() => ({}));
      const session = await sessionCache.getSessionRules(category);

      // WHY: Read eg_toggles from the studio map (SQL) to determine which keys are actively locked.
      const payloadMapRow = typeof getSpecDb === 'function' ? getSpecDb(category)?.getFieldStudioMap?.() ?? null : null;
      const payloadMap = payloadMapRow ? (() => { try { return JSON.parse(payloadMapRow.map_json); } catch { return null; } })() : null;
      const egToggles = payloadMap?.eg_toggles || { ...EG_DEFAULT_TOGGLES };
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
        if (!patched.eg_toggles) patched.eg_toggles = { ...EG_DEFAULT_TOGGLES };
        const keys = [...(patched.selected_keys || [])];
        for (const k of EG_LOCKED_KEYS) { if (!keys.includes(k)) keys.push(k); }
        patched.selected_keys = keys;
        const specDb = getSpecDb(category);
        if (specDb) {
          try {
            specDb.upsertFieldStudioMap(JSON.stringify(patched), hashJson(patched));
            saveFieldStudioMap(category, patched).catch(() => {});
            sessionCache.invalidateSessionCache(category);
          } catch { /* non-critical migration write */ }
        }
      }

      return jsonRes(res, 200, StudioPayloadSchema.parse({
        category,
        fieldRules: fields,
        fieldOrder: order,
        uiFieldCatalog: catConfig.uiFieldCatalog || null,
        guardrails: catConfig.guardrails || null,
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

    // Studio compile
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'compile' && method === 'POST') {
      const category = parts[1];
      try {
        const status = startProcess('src/app/cli/spec.js', ['compile-rules', '--category', category, '--local']);
        return jsonRes(res, 200, status);
      } catch (err) {
        return jsonRes(res, 409, { error: err.message });
      }
    }

    // Studio: validate rules
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'validate-rules' && method === 'POST') {
      const category = parts[1];
      try {
        const status = startProcess('src/app/cli/spec.js', ['validate-rules', '--category', category, '--local']);
        return jsonRes(res, 200, status);
      } catch (err) {
        return jsonRes(res, 409, { error: err.message });
      }
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

    if (parts[0] === 'studio' && parts[1] && parts[2] === 'enum-consistency' && method === 'POST') {
      const category = parts[1];
      if (String(category || '').trim().toLowerCase() === 'all') {
        return jsonRes(res, 400, { error: 'category_required', message: 'Select a concrete category before running enum consistency.' });
      }
      const runtimeSpecDb = typeof getSpecDbReady === 'function'
        ? await getSpecDbReady(category)
        : null;
      const body = await readJsonBody(req);
      const field = String(body?.field || '').trim();
      if (!field) {
        return jsonRes(res, 400, { error: 'field_required', message: 'field is required' });
      }
      const apply = body?.apply === true;
      const maxPendingInput = Number.parseInt(String(body?.maxPending ?? ''), 10);
      const maxPending = Number.isFinite(maxPendingInput) ? Math.max(1, Math.min(200, maxPendingInput)) : 120;

      const kvPath = path.join(HELPER_ROOT, category, '_generated', 'known_values.json');
      const [knownValuesDoc, session] = await Promise.all([
        safeReadJson(kvPath),
        sessionCache.getSessionRules(category),
      ]);
      const knownValues = dedupeEnumValues(
        Array.isArray(knownValuesDoc?.fields?.[field]) ? knownValuesDoc.fields[field] : []
      );
      // WHY: Phase E3 — SQL is sole source for pending enum values
      const pendingValues = runtimeSpecDb
        ? runtimeSpecDb.getCurationSuggestions('enum_value', 'pending')
            .filter(r => String(r.field_key || '').trim() === field)
            .map(r => String(r.value || '').trim())
            .filter(Boolean)
            .slice(0, maxPending)
        : [];
      const enumPolicy = String(
        session?.mergedFields?.[field]?.enum?.policy
        || session?.mergedFields?.[field]?.enum_policy
        || 'open_prefer_known'
      ).trim() || 'open_prefer_known';
      const fieldRule = session?.mergedFields?.[field] && typeof session.mergedFields[field] === 'object'
        ? session.mergedFields[field]
        : {};
      const formatGuidance = String(body?.formatGuidance || '').trim() || readEnumConsistencyFormatHint(fieldRule);
      const reviewEnabledOverride = typeof body?.reviewEnabled === 'boolean' ? body.reviewEnabled : null;
      const reviewEnabled = reviewEnabledOverride == null
        ? isEnumConsistencyReviewEnabled(fieldRule)
        : reviewEnabledOverride;

      if (!reviewEnabled) {
        return jsonRes(res, 200, {
          category,
          field,
          review_enabled: false,
          enum_policy: enumPolicy,
          known_values: knownValues,
          pending_values: pendingValues,
          format_guidance: formatGuidance || null,
          apply,
          decisions: [],
          applied: { mapped: 0, kept: 0, uncertain: 0, changed: 0 },
          llm_enabled: false,
          skipped_reason: 'review_consumer_disabled',
        });
      }

      if (pendingValues.length === 0) {
        return jsonRes(res, 200, {
          category,
          field,
          review_enabled: true,
          enum_policy: enumPolicy,
          known_values: knownValues,
          pending_values: [],
          format_guidance: formatGuidance || null,
          apply,
          decisions: [],
          applied: { mapped: 0, kept: 0, uncertain: 0, changed: 0 },
          llm_enabled: false,
          skipped_reason: 'no_pending_values',
        });
      }

      const consistency = await runEnumConsistencyReview({
        fieldKey: field,
        enumPolicy,
        canonicalValues: knownValues,
        pendingValues,
        formatGuidance,
        config,
        logger: null,
      });
      const decisions = Array.isArray(consistency?.decisions) ? consistency.decisions : [];
      let applied = { mapped: 0, kept: 0, uncertain: 0, changed: 0 };
      if (apply && decisions.length > 0) {
        applied = await applyEnumConsistencyToSuggestions({
          fs,
          path,
          helperRoot: HELPER_ROOT,
          category,
          field,
          decisions,
          specDb: runtimeSpecDb || null,
        });
        sessionCache.invalidateSessionCache(category);
        reviewLayoutByCategory.delete(category);
      }

      if (apply && applied.changed > 0) {
        emitDataChange({
          broadcastWs,
          event: 'enum-consistency',
          category,
          entities: {
            fieldKeys: [field],
          },
          meta: {
            field,
            mapped: applied.mapped,
            kept: applied.kept,
            uncertain: applied.uncertain,
            source: 'studio',
          },
        });
      }

      return jsonRes(res, 200, {
        category,
        field,
        review_enabled: reviewEnabled,
        enum_policy: enumPolicy,
        known_values: knownValues,
        pending_values: pendingValues,
        format_guidance: formatGuidance || null,
        apply,
        decisions,
        applied,
        llm_enabled: Boolean(consistency?.enabled),
        llm_model: consistency?.model || null,
        llm_provider: consistency?.provider || null,
        skipped_reason: consistency?.skipped_reason || null,
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
      }
      try {
        const incomingSummary = summarizeStudioMapPayload(normalizedFieldStudioMap);
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
          // Guard: reject saves that drop component_sources when existing map has them
          if (existingSummary.component_sources > 0 && incomingSummary.component_sources === 0) {
            return jsonRes(res, 409, {
              error: 'component_sources_dropped',
              message: 'Incoming studio map drops component_sources that exist in the current map. Include component_sources or set allowEmptyOverwrite=true to force.',
              existing: existingSummary,
              incoming: incomingSummary,
            });
          }
        }
        const mapHash = hashJson(normalizedFieldStudioMap);

        // PRIMARY: write to SQL
        const specDb = typeof getSpecDb === 'function' ? getSpecDb(category) : null;
        if (specDb) {
          specDb.upsertFieldStudioMap(JSON.stringify(normalizedFieldStudioMap), mapHash);
        }

        // SECONDARY: export to JSON file (fire-and-forget, for compile/git)
        const fileResult = await saveFieldStudioMap({ category, fieldStudioMap: normalizedFieldStudioMap, config }).catch((err) => {
          console.warn(`[studio-map] JSON export failed (non-critical): ${err.message}`);
          return { file_path: '', map_hash: mapHash, field_studio_map: normalizedFieldStudioMap };
        });

        sessionCache.invalidateSessionCache(category);
        reviewLayoutByCategory.delete(category);

        emitDataChange({
          broadcastWs,
          event: 'field-studio-map-saved',
          category,
          categories: [category],
          domains: ['studio', 'mapping', 'review-layout'],
          meta: {
            map_sections: Array.isArray(normalizedFieldStudioMap?.field_mapping) ? normalizedFieldStudioMap.field_mapping.length : 0,
          },
        });
        return jsonRes(res, 200, {
          file_path: fileResult.file_path || '',
          map_hash: mapHash,
          field_studio_map: normalizedFieldStudioMap,
        });
      } catch (err) {
        return jsonRes(res, 500, { error: 'save_failed', message: err.message });
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

