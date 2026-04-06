// ── Component Review Route Handlers ─────────────────────────────────
//
// Extracted from reviewRoutes.js.
// Handles: component layout, components, enums, enum-consistency,
// component-impact, component-review, component-review-action, batch.

import { normalizeFieldKey } from '../domain/reviewNormalization.js';
import { isConsumerEnabled } from '../../../field-rules/consumerGate.js';
import {
  normalizeEnumToken,
  hasMeaningfulEnumValue,
  dedupeEnumValues,
  readEnumConsistencyFormatHint,
} from '../services/enumMutationService.js';
import { emitDataChange } from '../../../core/events/dataChangeContract.js';

function resolveSessionFieldRule(session = null, fieldKey = '') {
  const mergedFields = session?.mergedFields;
  if (!mergedFields || typeof mergedFields !== 'object' || Array.isArray(mergedFields)) {
    return {};
  }
  const wanted = normalizeFieldKey(fieldKey);
  if (!wanted) return {};
  for (const [rawFieldKey, rule] of Object.entries(mergedFields)) {
    if (normalizeFieldKey(rawFieldKey) !== wanted) continue;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule)) return {};
    return rule;
  }
  return {};
}

function buildReviewFieldRulesPayload(session = null, compiledFieldRules = null) {
  const mergedFields = session?.mergedFields;
  const compiled = (compiledFieldRules && typeof compiledFieldRules === 'object' && !Array.isArray(compiledFieldRules))
    ? compiledFieldRules
    : null;
  if (!mergedFields || typeof mergedFields !== 'object' || Array.isArray(mergedFields)) {
    return compiled;
  }
  const compiledRules = (compiled && typeof compiled.rules === 'object' && !Array.isArray(compiled.rules))
    ? compiled.rules
    : {};
  return {
    ...(compiled || {}),
    rules: {
      ...compiledRules,
      fields: mergedFields,
    },
  };
}

function isEnumConsistencyReviewEnabled(rule = {}) {
  return isConsumerEnabled(rule, 'enum.match.strategy', 'review')
    && isConsumerEnabled(rule, 'enum.match.format_hint', 'review')
    && isConsumerEnabled(rule, 'enum.additional_values', 'review');
}

export async function handleComponentReviewRoute({ parts, params, method, req, res, context }) {
  const {
    jsonRes,
    readJsonBody,
    config,
    storage,
    getSpecDb,
    getSpecDbReady,
    sessionCache,
    buildComponentReviewLayout,
    buildComponentReviewPayloads,
    buildEnumReviewPayloads,
    findProductsReferencingComponent,
    safeReadJson,
    invalidateFieldRulesCache,
    path,
    fs,
    HELPER_ROOT,
    OUTPUT_ROOT,
    applySharedLaneState,
    cascadeEnumChange,
    specDbCache,
    broadcastWs,
    runEnumConsistencyReview,
  } = context;

  // Layout - list component types with property columns
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'layout' && method === 'GET') {
    const category = parts[1];
    const runtimeSpecDb = await getSpecDbReady(category);
    if (!runtimeSpecDb || !runtimeSpecDb.isSeeded()) {
      return jsonRes(res, 503, { error: 'specdb_not_ready', message: `SpecDb not ready for ${category}` });
    }
    const sessionCompLayout = await sessionCache.getSessionRules(category);
    const compiledRules = runtimeSpecDb.getCompiledRules() || {};
    const layout = await buildComponentReviewLayout({
      config,
      category,
      specDb: runtimeSpecDb,
      fieldRules: buildReviewFieldRulesPayload(sessionCompLayout, compiledRules),
    });
    return jsonRes(res, 200, layout);
  }

  // Component items for a specific type
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'components' && method === 'GET') {
    const category = parts[1];
    const componentType = params.get('type') || '';
    if (!componentType) return jsonRes(res, 400, { error: 'type parameter required' });
    const specDb = await getSpecDbReady(category);
    if (!specDb || !specDb.isSeeded()) {
      return jsonRes(res, 503, { error: 'specdb_not_ready', message: `SpecDb not ready for ${category}` });
    }
    const sessionComp = await sessionCache.getSessionRules(category);
    const compiledRules = specDb.getCompiledRules() || {};
    const payload = await buildComponentReviewPayloads({
      config,
      category,
      componentType,
      specDb,
      fieldRules: buildReviewFieldRulesPayload(sessionComp, compiledRules),
      fieldOrderOverride: sessionComp.cleanFieldOrder
    });
    return jsonRes(res, 200, payload);
  }

  // Enum review data
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'enums' && method === 'GET') {
    const category = parts[1];
    const specDb = await getSpecDbReady(category);
    if (!specDb || !specDb.isSeeded()) {
      return jsonRes(res, 503, { error: 'specdb_not_ready', message: `SpecDb not ready for ${category}` });
    }
    const sessionEnum = await sessionCache.getSessionRules(category);
    const compiledRulesEnum = specDb.getCompiledRules() || {};
    const payload = await buildEnumReviewPayloads({
      config,
      category,
      specDb,
      fieldRules: buildReviewFieldRulesPayload(sessionEnum, compiledRulesEnum),
      fieldOrderOverride: sessionEnum.cleanFieldOrder
    });
    return jsonRes(res, 200, payload);
  }

  // Enum consistency review (LLM-powered)
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'enum-consistency' && method === 'POST') {
    const category = parts[1];
    const specDb = await getSpecDbReady(category);
    if (!specDb || !specDb.isSeeded()) {
      return jsonRes(res, 503, { error: 'specdb_not_ready', message: `SpecDb not ready for ${category}` });
    }
    const body = await readJsonBody(req);
    const field = String(body?.field || '').trim();
    if (!field) {
      return jsonRes(res, 400, { error: 'field_required', message: 'field is required' });
    }
    const apply = body?.apply === true;
    const maxPendingInput = Number.parseInt(String(body?.maxPending ?? ''), 10);
    const maxPending = Number.isFinite(maxPendingInput) ? Math.max(1, Math.min(200, maxPendingInput)) : 120;

    const enumListRow = specDb.getEnumList(field);
    const listRows = specDb.getListValues(field) || [];
    if (!enumListRow && listRows.length === 0) {
      return jsonRes(res, 404, { error: 'enum_field_not_found', message: `No enum values found for field '${field}'` });
    }

    const knownValues = dedupeEnumValues(
      listRows
        .filter((row) => !Boolean(row?.needs_review))
        .map((row) => row?.value),
    );
    const pendingRows = listRows
      .filter((row) => Boolean(row?.needs_review) && hasMeaningfulEnumValue(row?.value))
      .slice(0, maxPending);
    const pendingValues = dedupeEnumValues(pendingRows.map((row) => row?.value));
    const policy = String(
      enumListRow?.enum_policy
      || pendingRows.find((row) => String(row?.enum_policy || '').trim())?.enum_policy
      || listRows.find((row) => String(row?.enum_policy || '').trim())?.enum_policy
      || 'open',
    ).trim() || 'open';
    const session = await sessionCache.getSessionRules(category);
    const fieldRule = resolveSessionFieldRule(session, field);
    const formatGuidance = String(body?.formatGuidance || '').trim() || readEnumConsistencyFormatHint(fieldRule);
    const reviewEnabled = isEnumConsistencyReviewEnabled(fieldRule);

    if (!reviewEnabled) {
      return jsonRes(res, 403, {
        error: 'review_consumer_disabled',
        message: `Review consumer disabled for enum consistency on field '${field}'.`,
        field,
        field_path: 'enum.match.strategy',
      });
    }

    if (pendingValues.length === 0) {
      return jsonRes(res, 200, {
        category,
        field,
        enum_policy: policy,
        known_values: knownValues,
        pending_values: [],
        format_guidance: formatGuidance || null,
        apply,
        decisions: [],
        applied: {
          mapped: 0,
          kept: 0,
          uncertain: 0,
          changed: 0,
        },
        llm_enabled: false,
        skipped_reason: 'no_pending_values',
      });
    }

    const consistency = await runEnumConsistencyReview({
      fieldKey: field,
      enumPolicy: policy,
      canonicalValues: knownValues,
      pendingValues,
      formatGuidance,
      config,
      logger: null,
    });
    const decisions = Array.isArray(consistency?.decisions) ? consistency.decisions : [];
    const applied = {
      mapped: 0,
      kept: 0,
      uncertain: 0,
      changed: 0,
    };

    if (apply && decisions.length > 0) {
      const nowIso = new Date().toISOString();
      for (const decision of decisions) {
        const rawValue = String(decision?.value || '').trim();
        const action = String(decision?.decision || '').trim().toLowerCase();
        if (!hasMeaningfulEnumValue(rawValue)) {
          continue;
        }
        if (action === 'uncertain') {
          applied.uncertain += 1;
          continue;
        }
        const sourceRow = specDb.getListValueByFieldAndValue(field, rawValue);
        if (!sourceRow?.id) {
          applied.uncertain += 1;
          continue;
        }

        if (action === 'map_to_existing') {
          const targetValue = String(decision?.target_value || '').trim();
          const sameToken = normalizeEnumToken(targetValue) === normalizeEnumToken(rawValue);
          const sameValue = targetValue === rawValue;
          if (!hasMeaningfulEnumValue(targetValue) || (sameToken && sameValue)) {
            applied.uncertain += 1;
            continue;
          }
          const preAffectedProductIds = specDb.renameListValueById(sourceRow.id, targetValue, nowIso) || [];
          if (typeof cascadeEnumChange === 'function') {
            await cascadeEnumChange({
              storage,
              outputRoot: OUTPUT_ROOT,
              category,
              field,
              action: 'rename',
              value: rawValue,
              newValue: targetValue,
              preAffectedProductIds,
              specDb,
            });
          }
          applied.mapped += 1;
          applied.changed += 1;
          continue;
        }

        if (action === 'keep_new') {
          const normalizedValue = normalizeEnumToken(rawValue);
          specDb.upsertListValue({
            fieldKey: field,
            value: rawValue,
            normalizedValue,
            source: String(sourceRow?.source || '').trim() || 'pipeline',
            enumPolicy: sourceRow?.enum_policy ?? policy ?? null,
            acceptedCandidateId: sourceRow?.accepted_candidate_id ?? null,
            needsReview: false,
            overridden: Boolean(sourceRow?.overridden),
            sourceTimestamp: nowIso,
          });
          const updatedRow = specDb.getListValueByFieldAndValue(field, rawValue) || sourceRow;
          if (typeof applySharedLaneState === 'function') {
            applySharedLaneState({
              specDb,
              category,
              targetKind: 'enum_key',
              fieldKey: field,
              enumValueNorm: normalizedValue,
              listValueId: updatedRow?.id ?? sourceRow?.id ?? null,
              enumListId: updatedRow?.list_id ?? enumListRow?.id ?? null,
              selectedCandidateId: String(updatedRow?.accepted_candidate_id || '').trim() || null,
              selectedValue: updatedRow?.value ?? rawValue,
              confidenceScore: 1.0,
              laneAction: 'confirm',
              nowIso,
              confirmStatusOverride: 'confirmed',
              updateSelection: false,
            });
          }
          applied.kept += 1;
          applied.changed += 1;
          continue;
        }

        applied.uncertain += 1;
      }
      specDbCache.delete(category);
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
        },
      });
    }

    return jsonRes(res, 200, {
      category,
      field,
      enum_policy: policy,
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

  // Component impact analysis
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'component-impact' && method === 'GET') {
    const category = parts[1];
    const type = params.get('type') || '';
    const name = params.get('name') || '';
    if (!type || !name) return jsonRes(res, 400, { error: 'type and name parameters required' });
    const runtimeSpecDb = getSpecDb(category);
    const affected = await findProductsReferencingComponent({
      outputRoot: OUTPUT_ROOT,
      category,
      componentType: type,
      componentName: name,
      specDb: runtimeSpecDb,
    });
    return jsonRes(res, 200, { affected_products: affected, total: affected.length });
  }

  // Get component review items (flagged for AI/human review)
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'component-review' && method === 'GET') {
    const category = parts[1];
    const specDb = getSpecDb(category);
    if (!specDb) {
      return jsonRes(res, 200, { version: 1, category, items: [], updated_at: null });
    }
    // Collect all component types from the review queue
    const allItems = [];
    try {
      const typeRows = specDb.db.prepare(
        'SELECT DISTINCT component_type FROM component_review_queue WHERE category = ?'
      ).all(category);
      for (const typeRow of typeRows) {
        const ct = String(typeRow?.component_type || '').trim();
        if (!ct) continue;
        const rows = specDb.getComponentReviewItems(ct) || [];
        allItems.push(...rows);
      }
    } catch {
      // best-effort
    }
    return jsonRes(res, 200, { version: 1, category, items: allItems, updated_at: null });
  }

  // Component review action (approve_new, merge_alias, dismiss)
  if (parts[0] === 'review-components' && parts[1] && parts[2] === 'component-review-action' && method === 'POST') {
    const category = parts[1];
    const body = await readJsonBody(req);
    const { review_id, action, merge_target } = body;
    if (!review_id || !action) return jsonRes(res, 400, { error: 'review_id and action required' });

    const specDb = getSpecDb(category);
    if (!specDb) return jsonRes(res, 404, { error: 'No review data found' });

    // Find the review item by review_id from SQL
    let item = null;
    try {
      item = specDb.db.prepare(
        'SELECT * FROM component_review_queue WHERE category = ? AND review_id = ? LIMIT 1'
      ).get(category, review_id);
      if (item?.alternatives) try { item.alternatives = JSON.parse(item.alternatives); } catch { /* */ }
      if (item?.product_attributes) try { item.product_attributes = JSON.parse(item.product_attributes); } catch { /* */ }
    } catch {
      // best-effort
    }
    if (!item) return jsonRes(res, 404, { error: 'Review item not found' });

    let newStatus;
    if (action === 'approve_new') {
      newStatus = 'approved_new';
    } else if (action === 'merge_alias' && merge_target) {
      newStatus = 'accepted_alias';
      // Update matched_component in SQL
      specDb.updateComponentReviewQueueMatchedComponent(category, review_id, merge_target);
      // Write alias to overrides
      const slug = String(merge_target).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      const overrideDir = path.join(HELPER_ROOT, category, '_overrides', 'components');
      await fs.mkdir(overrideDir, { recursive: true });
      const overridePath = path.join(overrideDir, `${item.component_type}_${slug}.json`);
      const existing = await safeReadJson(overridePath) || { componentType: item.component_type, name: merge_target, properties: {} };
      if (!existing.identity) existing.identity = {};
      const aliases = Array.isArray(existing.identity.aliases) ? existing.identity.aliases : [];
      const alias = String(item.raw_query).trim();
      if (alias && !aliases.some((a) => a.toLowerCase() === alias.toLowerCase())) {
        aliases.push(alias);
        existing.identity.aliases = aliases;
      }
      existing.updated_at = new Date().toISOString();
      await fs.writeFile(overridePath, JSON.stringify(existing, null, 2));
      invalidateFieldRulesCache(category);
      sessionCache.invalidateSessionCache(category);
      // Write alias to SpecDb
      if (alias) {
        try {
          const idRow = specDb.getComponentIdentity(item.component_type, merge_target, '');
          if (idRow) {
            specDb.insertAlias(idRow.id, alias, 'user');
          }
          specDbCache.delete(category);
        } catch (_specDbErr) {
          return jsonRes(res, 500, {
            error: 'component_review_alias_specdb_write_failed',
            message: _specDbErr?.message || 'SpecDb write failed',
          });
        }
      }
    } else if (action === 'dismiss') {
      newStatus = 'dismissed';
    } else {
      return jsonRes(res, 400, { error: `Unknown action: ${action}` });
    }

    // Update status in SQL
    try {
      specDb.db.prepare(
        `UPDATE component_review_queue SET status = ?, updated_at = datetime('now') WHERE category = ? AND review_id = ?`
      ).run(newStatus, category, review_id);
    } catch {
      // best-effort
    }
    emitDataChange({
      broadcastWs,
      event: 'component-review',
      category,
      meta: {
        action,
        review_id,
      },
    });

    return jsonRes(res, 200, { ok: true, review_id, action, status: newStatus });
  }

  return false;
}
