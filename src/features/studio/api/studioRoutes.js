import { emitDataChange } from '../../../core/events/dataChangeContract.js';
import { runEnumConsistencyReview as runEnumConsistencyReviewDefault } from '../../indexing/index.js';
import { loadUserSettings, persistUserSettingsSections, readStudioMapFromUserSettings } from '../../settings-authority/index.js';
import {
  applyEnumConsistencyToSuggestions,
  buildPendingEnumValuesFromSuggestions,
  buildStudioComponentDbFromSpecDb,
  buildStudioKnownValuesFromSpecDb,
  choosePreferredStudioMap,
  dedupeEnumValues,
  isEnumConsistencyReviewEnabled,
  readEnumConsistencyFormatHint,
  summarizeStudioMapPayload,
} from './studioRouteHelpers.js';

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
    loadFieldStudioMap,
    saveFieldStudioMap,
    validateFieldStudioMap,
    invalidateFieldRulesCache,
    buildFieldLabelsMap,
    getSpecDbReady,
    storage,
    loadCategoryConfig,
    startProcess,
    broadcastWs,
    reviewLayoutByCategory,
    loadProductCatalog,
    cleanVariant,
    runEnumConsistencyReview = runEnumConsistencyReviewDefault,
  } = ctx;
  const hasStudioMapHandlers = (
    typeof loadFieldStudioMap === 'function'
    && typeof saveFieldStudioMap === 'function'
    && typeof validateFieldStudioMap === 'function'
  );

  const settingsRoot =
    config?.categoryAuthorityRoot
    || HELPER_ROOT
    || 'category_authority';

  async function getStudioMapFromUserSettings(category) {
    if (typeof ctx.loadStudioMapFromUserSettings === 'function') {
      return ctx.loadStudioMapFromUserSettings(category);
    }
    const userSettings = await loadUserSettings({
      categoryAuthorityRoot: settingsRoot,
    });
    return readStudioMapFromUserSettings(userSettings, category);
  }

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
      return jsonRes(res, 200, {
        category,
        fieldRules: session.mergedFields,
        fieldOrder: session.mergedFieldOrder,
        uiFieldCatalog: catConfig.uiFieldCatalog || null,
        guardrails: catConfig.guardrails || null,
        compiledAt: session.compiledAt,
        mapSavedAt: session.mapSavedAt,
        compileStale: session.compileStale,
      });
    }

    // Studio products (reads from product catalog)
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'products' && method === 'GET') {
      const category = parts[1];
      const catalog = await loadProductCatalog(config, category);
      const products = [];
      const brandSet = new Set();
      for (const [pid, entry] of Object.entries(catalog.products || {})) {
        const brand = String(entry.brand || '').trim();
        const model = String(entry.model || '').trim();
        const variant = cleanVariant(entry.variant);
        if (!brand || !model) continue;
        brandSet.add(brand);
        products.push({
          brand,
          model,
          variant,
          productId: pid,
        });
      }
      return jsonRes(res, 200, { products, brands: [...brandSet].sort() });
    }

    // Studio compile
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'compile' && method === 'POST') {
      const category = parts[1];
      try {
        const status = startProcess('src/cli/spec.js', ['compile-rules', '--category', category, '--local']);
        return jsonRes(res, 200, status);
      } catch (err) {
        return jsonRes(res, 409, { error: err.message });
      }
    }

    // Studio: validate rules
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'validate-rules' && method === 'POST') {
      const category = parts[1];
      try {
        const status = startProcess('src/cli/spec.js', ['validate-rules', '--category', category, '--local']);
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
        return jsonRes(res, 200, specDbPayload);
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
      const body = await readJsonBody(req);
      const field = String(body?.field || '').trim();
      if (!field) {
        return jsonRes(res, 400, { error: 'field_required', message: 'field is required' });
      }
      const apply = body?.apply === true;
      const maxPendingInput = Number.parseInt(String(body?.maxPending ?? ''), 10);
      const maxPending = Number.isFinite(maxPendingInput) ? Math.max(1, Math.min(200, maxPendingInput)) : 120;

      const kvPath = path.join(HELPER_ROOT, category, '_generated', 'known_values.json');
      const suggestPath = path.join(HELPER_ROOT, category, '_suggestions', 'enums.json');
      const [knownValuesDoc, suggestionsDoc, session] = await Promise.all([
        safeReadJson(kvPath),
        safeReadJson(suggestPath),
        sessionCache.getSessionRules(category),
      ]);
      const knownValues = dedupeEnumValues(
        Array.isArray(knownValuesDoc?.fields?.[field]) ? knownValuesDoc.fields[field] : []
      );
      const pendingValues = buildPendingEnumValuesFromSuggestions(suggestionsDoc, field).slice(0, maxPending);
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
        return jsonRes(res, 200, specDbResult);
      }
      return jsonRes(res, 503, {
        error: 'specdb_not_ready',
        message: `SpecDb not ready for ${category}`,
      });
    }

    // Studio map GET
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'field-studio-map' && method === 'GET') {
      if (!hasStudioMapHandlers) {
        return jsonRes(res, 500, { error: 'studio_map_handlers_missing' });
      }
      const category = parts[1];
      let settingsMap = null;
      try {
        settingsMap = await getStudioMapFromUserSettings(category);
      } catch {
        settingsMap = null;
      }

      let controlPlaneMap = null;
      try {
        controlPlaneMap = await loadFieldStudioMap({ category, config });
      } catch (err) {
        const preferred = choosePreferredStudioMap(settingsMap, null, { validateMap: validateFieldStudioMap });
        if (preferred) return jsonRes(res, 200, preferred);
        return jsonRes(res, 200, { file_path: '', map: {}, error: err.message });
      }

      const preferred = choosePreferredStudioMap(settingsMap, controlPlaneMap, { validateMap: validateFieldStudioMap });
      return jsonRes(res, 200, preferred || { file_path: '', map: {} });
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
      try {
        const incomingSummary = summarizeStudioMapPayload(normalizedFieldStudioMap);
        if (params.get('allowEmptyOverwrite') !== 'true') {
          const existingMap = await loadFieldStudioMap({ category, config }).catch(() => null);
          const existingSummary = summarizeStudioMapPayload(existingMap?.map);
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
        const result = await saveFieldStudioMap({ category, fieldStudioMap: normalizedFieldStudioMap, config });
        await persistUserSettingsSections({
          categoryAuthorityRoot: settingsRoot,
          studioPatch: {
            [category]: {
              file_path: typeof result.file_path === 'string' ? result.file_path : '',
              map: result.field_studio_map && typeof result.field_studio_map === 'object'
                ? result.field_studio_map
                : normalizedFieldStudioMap,
              map_hash: result.map_hash,
              version_snapshot: result.version_snapshot,
              updated_at: new Date().toISOString(),
            },
          },
        });
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
        return jsonRes(res, 200, result);
      } catch (err) {
        return jsonRes(res, 500, { error: 'save_failed', message: err.message });
      }
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
      const mapData = (
        await safeReadJson(path.join(catRoot, '_control_plane', 'field_studio_map.json'))
      );
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
      return jsonRes(res, 200, { entries: tooltipEntries, files: tooltipFiles, configuredPath: tooltipPath });
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
      return jsonRes(res, 200, artifacts);
    }

    return false;
  };
}

