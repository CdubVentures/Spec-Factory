import { emitDataChange } from '../events/dataChangeContract.js';
import { runEnumConsistencyReview } from '../../llm/validateEnumConsistency.js';

function normalizeEnumToken(value) {
  return String(value ?? '').trim().toLowerCase();
}

function hasMeaningfulEnumValue(value) {
  const token = normalizeEnumToken(value);
  return token !== '' && token !== 'unk' && token !== 'unknown' && token !== 'n/a' && token !== 'null';
}

function dedupeEnumValues(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (!hasMeaningfulEnumValue(text)) continue;
    const token = normalizeEnumToken(text);
    if (seen.has(token)) continue;
    seen.add(token);
    output.push(text);
  }
  return output;
}

function enumConsistencyGuidanceForField(fieldKey = '') {
  const token = normalizeEnumToken(fieldKey);
  if (token.includes('lighting')) {
    return [
      'Preserve canonical token pattern exactly: "<number> zone (rgb)" or "<number> zone (led)".',
      'Examples: "1 zone rgb" -> "1 zone (rgb)", "7 zone led" -> "7 zone (led)".',
      'Do not change semantics, only formatting.',
    ].join(' ');
  }
  return 'Preserve canonical punctuation/casing/token shape from known values.';
}

function buildPendingEnumValuesFromSuggestions(suggestionsDoc = {}, fieldKey = '') {
  const field = String(fieldKey || '').trim();
  if (!field) return [];
  const pending = [];
  if (suggestionsDoc && typeof suggestionsDoc === 'object') {
    if (Array.isArray(suggestionsDoc?.suggestions)) {
      for (const row of suggestionsDoc.suggestions) {
        if (String(row?.field_key || '').trim() !== field) continue;
        const status = String(row?.status || 'pending').trim().toLowerCase();
        if (status && status !== 'pending') continue;
        pending.push(String(row?.value || '').trim());
      }
    }
    if (suggestionsDoc.fields && typeof suggestionsDoc.fields === 'object') {
      const rows = Array.isArray(suggestionsDoc.fields[field]) ? suggestionsDoc.fields[field] : [];
      for (const row of rows) {
        pending.push(String(row || '').trim());
      }
    }
  }
  return dedupeEnumValues(pending);
}

async function applyEnumConsistencyToSuggestions({
  fs,
  path,
  helperRoot,
  category,
  field,
  decisions = [],
}) {
  const suggestionsPath = path.join(helperRoot, category, '_suggestions', 'enums.json');
  const currentDoc = await (async () => {
    try {
      return JSON.parse(await fs.readFile(suggestionsPath, 'utf8'));
    } catch {
      return {};
    }
  })();
  const doc = currentDoc && typeof currentDoc === 'object' ? { ...currentDoc } : {};
  const decisionByToken = new Map(
    (Array.isArray(decisions) ? decisions : [])
      .map((row) => {
        const value = String(row?.value || '').trim();
        return [normalizeEnumToken(value), row];
      })
      .filter(([token]) => Boolean(token))
  );

  let mapped = 0;
  let kept = 0;
  let uncertain = 0;
  let changed = 0;

  if (Array.isArray(doc.suggestions)) {
    doc.suggestions = doc.suggestions.map((row) => {
      if (String(row?.field_key || '').trim() !== field) return row;
      const token = normalizeEnumToken(row?.value);
      const decision = decisionByToken.get(token);
      if (!decision) return row;
      const action = String(decision?.decision || '').trim().toLowerCase();
      if (action === 'map_to_existing') {
        mapped += 1;
        changed += 1;
        return {
          ...row,
          status: 'accepted',
          canonical: String(decision?.target_value || '').trim() || row?.canonical || null,
          updated_at: new Date().toISOString(),
          reviewer: 'llm_enum_consistency',
        };
      }
      if (action === 'keep_new') {
        kept += 1;
        changed += 1;
        return {
          ...row,
          status: 'accepted',
          updated_at: new Date().toISOString(),
          reviewer: 'llm_enum_consistency',
        };
      }
      uncertain += 1;
      return row;
    });
  }

  if (doc.fields && typeof doc.fields === 'object') {
    const existing = Array.isArray(doc.fields[field]) ? doc.fields[field].map(String) : [];
    const filtered = existing.filter((value) => {
      const decision = decisionByToken.get(normalizeEnumToken(value));
      if (!decision) return true;
      const action = String(decision?.decision || '').trim().toLowerCase();
      if (action === 'map_to_existing') {
        mapped += 1;
        changed += 1;
        return false;
      }
      if (action === 'keep_new') {
        kept += 1;
        changed += 1;
        return false;
      }
      uncertain += 1;
      return true;
    });
    doc.fields = { ...doc.fields, [field]: filtered };
  }

  doc.updated_at = new Date().toISOString();
  await fs.mkdir(path.dirname(suggestionsPath), { recursive: true });
  await fs.writeFile(suggestionsPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  return { mapped, kept, uncertain, changed };
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
    loadWorkbookMap,
    saveWorkbookMap,
    validateWorkbookMap,
    invalidateFieldRulesCache,
    buildFieldLabelsMap,
    storage,
    loadCategoryConfig,
    startProcess,
    broadcastWs,
    reviewLayoutByCategory,
    loadProductCatalog,
    cleanVariant,
  } = ctx;

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
        draftSavedAt: session.draftSavedAt,
        compileStale: session.compileStale,
      });
    }

    // Workbook products (reads from product catalog)
    if (parts[0] === 'workbook' && parts[1] && parts[2] === 'products' && method === 'GET') {
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
        const status = startProcess('src/cli/spec.js', ['category-compile', '--category', category, '--local']);
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
      const kvPath = path.join(HELPER_ROOT, category, '_generated', 'known_values.json');
      const data = await safeReadJson(kvPath);
      return jsonRes(res, 200, data || {});
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
      const formatGuidance = String(body?.formatGuidance || '').trim() || enumConsistencyGuidanceForField(field);

      if (pendingValues.length === 0) {
        return jsonRes(res, 200, {
          category,
          field,
          enum_policy: enumPolicy,
          known_values: knownValues,
          pending_values: [],
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
        enum_policy: enumPolicy,
        known_values: knownValues,
        pending_values: pendingValues,
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
      const dbDir = path.join(HELPER_ROOT, category, '_generated', 'component_db');
      const files = await listFiles(dbDir, '.json');
      const result = {};
      for (const f of files) {
        const data = await safeReadJson(path.join(dbDir, f));
        if (data?.component_type && Array.isArray(data.items)) {
          result[data.component_type] = data.items.map(item => ({
            name: item.name || '',
            maker: item.maker || '',
            aliases: item.aliases || [],
          }));
        }
      }
      return jsonRes(res, 200, result);
    }

    // Studio workbook-map GET (using full loadWorkbookMap with normalization)
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'workbook-map' && method === 'GET') {
      const category = parts[1];
      try {
        const result = await loadWorkbookMap({ category, config });
        return jsonRes(res, 200, result || { file_path: '', map: {} });
      } catch (err) {
        return jsonRes(res, 200, { file_path: '', map: {}, error: err.message });
      }
    }

    // Studio workbook-map PUT (save)
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'workbook-map' && method === 'PUT') {
      const category = parts[1];
      const body = await readJsonBody(req);
      const validation = validateWorkbookMap(body, { category });
      if (!validation?.valid) {
        return jsonRes(res, 400, {
          error: 'invalid_workbook_map',
          valid: false,
          errors: Array.isArray(validation?.errors) ? validation.errors : [],
          warnings: Array.isArray(validation?.warnings) ? validation.warnings : [],
        });
      }
      const normalizedWorkbookMap = validation?.normalized && typeof validation.normalized === 'object'
        ? validation.normalized
        : body;
      try {
        const result = await saveWorkbookMap({ category, workbookMap: normalizedWorkbookMap, config });
        emitDataChange({
          broadcastWs,
          event: 'workbook-map-saved',
          category,
          categories: [category],
          domains: ['studio', 'mapping', 'review-layout'],
          meta: {
            map_sections: Array.isArray(normalizedWorkbookMap?.field_mapping) ? normalizedWorkbookMap.field_mapping.length : 0,
          },
        });
        return jsonRes(res, 200, result);
      } catch (err) {
        return jsonRes(res, 500, { error: 'save_failed', message: err.message });
      }
    }

    // Studio workbook-map validate
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'validate-map' && method === 'POST') {
      const category = parts[1];
      const body = await readJsonBody(req);
      const result = validateWorkbookMap(body, { category });
      return jsonRes(res, 200, result);
    }

    // Studio tooltip bank
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'tooltip-bank' && method === 'GET') {
      const category = parts[1];
      const catRoot = path.join(HELPER_ROOT, category);
      const mapData = await safeReadJson(path.join(catRoot, '_control_plane', 'workbook_map.json'));
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

    // Studio save drafts
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'save-drafts' && method === 'POST') {
      const category = parts[1];
      const body = await readJsonBody(req);
      const catRoot = path.join(HELPER_ROOT, category);
      const controlPlane = path.join(catRoot, '_control_plane');
      await fs.mkdir(controlPlane, { recursive: true });
      if (body.fieldRulesDraft) {
        const draftFile = path.join(controlPlane, 'field_rules_draft.json');
        const existing = (await safeReadJson(draftFile)) || {};
        const merged = { ...existing, ...body.fieldRulesDraft, draft_saved_at: new Date().toISOString() };
        await fs.writeFile(draftFile, JSON.stringify(merged, null, 2));
      }
      if (body.uiFieldCatalogDraft) {
        await fs.writeFile(path.join(controlPlane, 'ui_field_catalog_draft.json'), JSON.stringify(body.uiFieldCatalogDraft, null, 2));
      }
      if (body.renames && typeof body.renames === 'object' && Object.keys(body.renames).length > 0) {
        const renamesPath = path.join(controlPlane, 'pending_renames.json');
        const existing = (await safeReadJson(renamesPath)) || { renames: {} };
        if (!existing.renames || typeof existing.renames !== 'object') existing.renames = {};
        Object.assign(existing.renames, body.renames);
        existing.timestamp = new Date().toISOString();
        await fs.writeFile(renamesPath, JSON.stringify(existing, null, 2));
      }
      sessionCache.invalidateSessionCache(category);
      reviewLayoutByCategory.delete(category);
      emitDataChange({
        broadcastWs,
        event: 'studio-drafts-saved',
        category,
      });
      return jsonRes(res, 200, { ok: true });
    }

    // Studio cache invalidation
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'invalidate-cache' && method === 'POST') {
      const category = parts[1];
      sessionCache.invalidateSessionCache(category);
      invalidateFieldRulesCache(category);
      reviewLayoutByCategory.delete(category);
      return jsonRes(res, 200, { ok: true });
    }

    // Studio field rules draft GET
    if (parts[0] === 'studio' && parts[1] && parts[2] === 'drafts' && method === 'GET') {
      const category = parts[1];
      const controlPlane = path.join(HELPER_ROOT, category, '_control_plane');
      const [fieldRulesDraft, uiFieldCatalogDraft] = await Promise.all([
        safeReadJson(path.join(controlPlane, 'field_rules_draft.json')),
        safeReadJson(path.join(controlPlane, 'ui_field_catalog_draft.json')),
      ]);
      return jsonRes(res, 200, { fieldRulesDraft, uiFieldCatalogDraft });
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
