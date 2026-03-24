import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso } from '../../../utils/common.js';
import { loadCategoryConfig } from '../../../categories/loader.js';
import { loadQueueState } from '../../../queue/queueState.js';
import { ruleRequiredLevel } from '../../../engine/ruleAccessors.js';
import { projectFieldRulesForConsumer } from '../../../field-rules/consumerGate.js';
import { confidenceColor } from './confidenceColor.js';
import { buildFallbackFieldCandidateId } from '../../../utils/candidateIdentifier.js';
import { resolveAuthoritativeProductIdentity } from '../../catalog/identity/productIdentityAuthority.js';
import {
  isKnownSlotValue,
  normalizeSlotValueForShape,
  slotValueComparableToken,
  slotValueToText,
} from '../../../utils/slotValueShape.js';
import {
  isObject,
  toArray,
  normalizeToken,
  normalizeField,
  normalizePathToken,
  toNumber,
  parseDateMs,
} from './reviewNormalization.js';
import {
  toInt,
  hasKnownValue,
  resolveOverrideFilePath,
  readOverrideFile,
  readJsonIfExists,
  parseFieldStudioRowFromCell,
  extractFieldStudioHints,
  reviewKeys,
  normalizeFieldContract,
  REAL_FLAG_CODES,
  inferFlags,
  writeJson,
  candidateEvidenceFromRows,
  candidateScore,
  inferReasonCodes,
  dbSourceLabel,
  dbSourceMethod,
  extractHostFromUrl,
  candidateSourceLabel,
  toSpecDbCandidateRow,
  urgencyScore,
} from './reviewGridHelpers.js';


export function buildFieldLabelsMap(categoryConfig) {
  const fields = (isObject(categoryConfig) && isObject(categoryConfig.fieldRules) && isObject(categoryConfig.fieldRules.fields))
    ? categoryConfig.fieldRules.fields
    : {};
  const fieldOrder = (isObject(categoryConfig) && Array.isArray(categoryConfig.fieldOrder))
    ? categoryConfig.fieldOrder
    : Object.keys(fields);
  const labels = {};
  for (const field of fieldOrder) {
    const rule = isObject(fields[field]) ? fields[field] : {};
    const ui = isObject(rule.ui) ? rule.ui : {};
    labels[field] = String(ui.label || rule.label || field);
  }
  return labels;
}

export async function buildReviewLayout({
  storage,
  config = {},
  category,
  fieldOrderOverride = null,
  fieldsOverride = null
}) {
  const categoryConfig = await loadCategoryConfig(category, { storage, config });
  const compiledFields = categoryConfig.fieldRules?.fields || {};
  const mergedFields = fieldsOverride
    ? Object.fromEntries(Object.keys({ ...compiledFields, ...fieldsOverride }).map((k) => {
        const compiled = isObject(compiledFields[k]) ? compiledFields[k] : {};
        const draft = isObject(fieldsOverride[k]) ? fieldsOverride[k] : {};
        return [k, { ...compiled, ...draft, ui: { ...(isObject(compiled.ui) ? compiled.ui : {}), ...(isObject(draft.ui) ? draft.ui : {}) } }];
      }))
    : compiledFields;
  const projected = projectFieldRulesForConsumer({ fields: mergedFields }, 'review');
  const fields = isObject(projected?.fields) ? projected.fields : mergedFields;
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const mapPath = path.join(helperRoot, category, '_control_plane', 'field_studio_map.json');
  const studioMap = await readJsonIfExists(mapPath);

  const compiledFieldList = categoryConfig.fieldOrder || Object.keys(fields || {});
  const fieldSource = Array.isArray(fieldOrderOverride) && fieldOrderOverride.length > 0
    ? (() => {
        const draftKeys = fieldOrderOverride.filter((k) => !String(k).startsWith('__grp::'));
        const draftSet = new Set(draftKeys.map(normalizeField));
        const extras = compiledFieldList.filter((k) => !draftSet.has(normalizeField(k)));
        return [...draftKeys, ...extras];
      })()
    : compiledFieldList;

  const positionalGroupMap = new Map();
  if (Array.isArray(fieldOrderOverride) && fieldOrderOverride.length > 0) {
    let curGrp = '';
    for (const item of fieldOrderOverride) {
      if (String(item).startsWith('__grp::')) {
        curGrp = String(item).slice(7);
        continue;
      }
      if (curGrp) {
        positionalGroupMap.set(normalizeField(item), curGrp);
      }
    }
  }

  const rows = [];
  for (const field of fieldSource) {
    const rule = isObject(fields[field]) ? fields[field] : {};
    const ui = isObject(rule.ui) ? rule.ui : {};
    const sourceHints = extractFieldStudioHints(rule);
    const sourceRow = toInt(sourceHints.row, parseFieldStudioRowFromCell(sourceHints.key_cell));
    const positionalGroup = positionalGroupMap.get(normalizeField(field));
    rows.push({
      source_row: sourceRow > 0 ? sourceRow : null,
      group: positionalGroup || String(ui.group || '').trim(),
      key: normalizeField(field),
      label: String(ui.label || field),
      field_rule: normalizeFieldContract(rule),
      _order: toInt(ui.order, Number.MAX_SAFE_INTEGER)
    });
  }

  if (Array.isArray(fieldOrderOverride) && fieldOrderOverride.length > 0) {
    const orderIndex = new Map(fieldOrderOverride.map((k, i) => [normalizeField(k), i]));
    rows.sort((a, b) => {
      const ai = orderIndex.has(a.key) ? orderIndex.get(a.key) : Number.MAX_SAFE_INTEGER;
      const bi = orderIndex.has(b.key) ? orderIndex.get(b.key) : Number.MAX_SAFE_INTEGER;
      return ai - bi;
    });
  } else {
    rows.sort((a, b) => {
      const aRow = a.source_row === null ? Number.MAX_SAFE_INTEGER : a.source_row;
      const bRow = b.source_row === null ? Number.MAX_SAFE_INTEGER : b.source_row;
      if (aRow !== bRow) {
        return aRow - bRow;
      }
      if (a._order !== b._order) {
        return a._order - b._order;
      }
      return a.key.localeCompare(b.key);
    });
  }

  let currentGroup = '';
  for (const row of rows) {
    if (String(row.group || '').trim()) {
      currentGroup = String(row.group).trim();
    } else if (currentGroup) {
      row.group = currentGroup;
    }
    delete row._order;
  }

  const sourceRows = rows.map((row) => row.source_row).filter((value) => Number.isFinite(value));
  const minRow = sourceRows.length > 0 ? Math.min(...sourceRows) : 9;
  const maxRow = sourceRows.length > 0 ? Math.max(...sourceRows) : 83;
  const keyList = isObject(studioMap?.key_list) ? studioMap.key_list : {};
  const productTable = isObject(studioMap?.product_table) ? studioMap.product_table : {};
  const keyColumn = String(keyList.column || 'B').trim().toUpperCase() || 'B';
  const keyRowStart = toInt(keyList.row_start, 0);
  const keyRowEnd = toInt(keyList.row_end, 0);
  const sheet = String(keyList.sheet || 'dataEntry').trim() || 'dataEntry';
  const keyRange = keyRowStart > 0 && keyRowEnd >= keyRowStart
    ? `${keyColumn}${keyRowStart}:${keyColumn}${keyRowEnd}`
    : `${keyColumn}${minRow}:${keyColumn}${maxRow}`;
  const brandRow = toInt(productTable.brand_row, 3) || 3;
  const modelRow = toInt(productTable.model_row, 4) || 4;
  const sourcePath = String(studioMap?.field_studio_source_path || '').trim();
  return {
    category,
    field_studio: {
      map_path: mapPath,
      has_map: isObject(studioMap),
      source_name: sourcePath ? path.basename(sourcePath) : '',
      source_path: sourcePath,
      key_column: keyColumn,
      key_range: keyRange,
      sheet,
      brand_key_cell: `${keyColumn}${brandRow}`,
      model_key_cell: `${keyColumn}${modelRow}`
    },
    rows
  };
}

export async function readLatestArtifacts(storage, category, productId) {
  const latestBase = storage.resolveOutputKey(category, productId, 'latest');
  const normalized = await storage.readJsonOrNull(`${latestBase}/normalized.json`);
  const provenance = await storage.readJsonOrNull(`${latestBase}/provenance.json`);
  const summary = await storage.readJsonOrNull(`${latestBase}/summary.json`);
  let candidates = await storage.readJsonOrNull(`${latestBase}/candidates.json`);
  if (!candidates && summary?.runId) {
    const runBase = storage.resolveOutputKey(category, productId, 'runs', summary.runId);
    candidates = await storage.readJsonOrNull(`${runBase}/provenance/fields.candidates.json`);
  }
  return {
    latestBase,
    normalized: normalized || { identity: {}, fields: {} },
    provenance: provenance || {},
    summary: summary || {},
    candidates: candidates || {}
  };
}


export function buildFieldState({
  field,
  candidates,
  normalized,
  provenance,
  summary,
  includeCandidates = true,
  category = '',
  productId = '',
  fieldShape = 'scalar',
  acceptedCandidateId = null,
  overridden = false,
}) {
  const fieldKey = normalizeField(field);
  const normalizedShape = String(fieldShape || 'scalar').trim().toLowerCase() || 'scalar';
  const normalizedFields = isObject(normalized.fields) ? normalized.fields : {};
  const rawSelectedValue = Object.prototype.hasOwnProperty.call(normalizedFields, fieldKey)
    ? normalizedFields[fieldKey]
    : 'unk';
  const selectedShapeValue = normalizeSlotValueForShape(rawSelectedValue, normalizedShape).value;
  const selectedValue = normalizedShape === 'list'
    ? (slotValueToText(selectedShapeValue, normalizedShape) ?? 'unk')
    : selectedShapeValue;
  const provenanceRow = isObject(provenance[fieldKey]) ? provenance[fieldKey] : {};
  const selectedConfidenceHint = Math.max(0, Math.min(1, toNumber(provenanceRow.confidence, 0)));
  const candidateRows = toArray(candidates[fieldKey]);
  let normalizedCandidates = candidateRows
    .map((candidate, index) => {
      const normalizedCandidateValue = normalizeSlotValueForShape(candidate.value, normalizedShape).value;
      if (!isKnownSlotValue(normalizedCandidateValue, normalizedShape)) {
        return null;
      }
      const evidence = candidateEvidenceFromRows(candidate, provenanceRow);
      const source = candidateSourceLabel(candidate, evidence);
      return {
        candidate_id: String(candidate.candidate_id || buildFallbackFieldCandidateId({
          productId,
          fieldKey,
          value: normalizedCandidateValue,
          index: index + 1,
          variant: 'candidate',
        })),
        value: normalizedShape === 'list'
          ? (slotValueToText(normalizedCandidateValue, normalizedShape) ?? 'unk')
          : normalizedCandidateValue,
        score: candidateScore(candidate, provenanceRow),
        source_id: String(candidate.source_id || evidence.source_id || candidate.host || '').trim(),
        source,
        tier: toInt(candidate.tier, 0) || null,
        method: String(candidate.method || '').trim() || null,
        evidence,
        llm_extract_model: candidate.llm_extract_model || null,
        llm_extract_provider: candidate.llm_extract_provider || null,
        llm_validate_model: candidate.llm_validate_model || null,
        llm_validate_provider: candidate.llm_validate_provider || null
      };
    })
    .filter(Boolean);

  if (!overridden && normalizedCandidates.length === 0 && hasKnownValue(selectedValue)) {
    // No candidate rows exist yet; preserve selected value as a synthetic candidate for slot provenance.
    const provenanceHost = String(provenanceRow.host || '').trim();
    const provenanceSourceToken = normalizeToken(provenanceRow.source || provenanceRow.source_id || '');
    const fallbackSourceToken = provenanceSourceToken || (provenanceHost ? '' : 'reference');
    const fallbackSource = fallbackSourceToken
      ? (dbSourceLabel(fallbackSourceToken) || fallbackSourceToken)
      : '';
    const baseEvidence = candidateEvidenceFromRows({}, provenanceRow);
    normalizedCandidates.push({
      candidate_id: buildFallbackFieldCandidateId({
        productId,
        fieldKey,
        value: selectedValue,
        index: 0,
        variant: 'selected',
      }),
      value: selectedValue,
      score: Math.max(0, Math.min(1, selectedConfidenceHint || 0.5)),
      source_id: fallbackSourceToken || '',
      source: fallbackSource,
      tier: null,
      method: dbSourceMethod(fallbackSourceToken) || 'selected_value',
      evidence: {
        ...baseEvidence,
        quote: category ? `Imported from ${category} Field Studio contract` : baseEvidence.quote,
        snippet_text: category ? `Imported from ${category} Field Studio contract` : baseEvidence.snippet_text,
        retrieved_at: summary.generated_at || baseEvidence.retrieved_at,
        source_id: fallbackSourceToken || baseEvidence.source_id || '',
      },
      is_synthetic_selected: true,
    });
  }

  if (normalizedCandidates.length > 1) {
    normalizedCandidates.sort((left, right) => toNumber(right.score, 0) - toNumber(left.score, 0));
  }

  const acceptedCandidate = !overridden && String(acceptedCandidateId || '').trim()
    ? normalizedCandidates.find((candidate) => normalizeToken(candidate.candidate_id) === normalizeToken(acceptedCandidateId))
    : null;
  const topCandidate = normalizedCandidates[0] || null;
  const selectedToken = slotValueComparableToken(selectedValue, normalizedShape);
  const topToken = topCandidate ? slotValueComparableToken(topCandidate.value, normalizedShape) : '';

  let selectedCandidate = null;
  let resolvedSelectedValue = selectedValue;
  let resolvedSelectedConfidence = selectedConfidenceHint;
  if (!overridden) {
    if (acceptedCandidate) {
      selectedCandidate = acceptedCandidate;
      resolvedSelectedValue = acceptedCandidate.value;
      resolvedSelectedConfidence = Math.max(selectedConfidenceHint, toNumber(acceptedCandidate.score, selectedConfidenceHint));
    } else if (topCandidate) {
      selectedCandidate = topCandidate;
      if (!selectedToken || selectedToken !== topToken) {
        resolvedSelectedValue = topCandidate.value;
      }
      resolvedSelectedConfidence = Math.max(selectedConfidenceHint, toNumber(topCandidate.score, selectedConfidenceHint));
    } else if (!hasKnownValue(resolvedSelectedValue)) {
      resolvedSelectedValue = 'unk';
      resolvedSelectedConfidence = 0;
    }
  }

  const fieldContradictions = toArray(summary.constraint_analysis?.contradictions).filter((row) =>
    toArray(row?.fields).map((token) => normalizeField(token)).includes(fieldKey)
  );
  const hasConflict = fieldContradictions.length > 0;
  const hasCompoundConflict = fieldContradictions.some((row) => row?.code === 'compound_range_conflict');
  const reasonCodes = inferReasonCodes({
    field: fieldKey,
    selectedValue: resolvedSelectedValue,
    selectedConfidence: resolvedSelectedConfidence,
    summary,
    hasConflict,
    hasCompoundConflict
  });

  const color = hasKnownValue(resolvedSelectedValue)
    ? confidenceColor(resolvedSelectedConfidence, reasonCodes)
    : 'gray';

  const sourceCandidate = selectedCandidate || topCandidate;
  const topEvidence = sourceCandidate
    ? (isObject(sourceCandidate.evidence)
      ? sourceCandidate.evidence
      : candidateEvidenceFromRows(sourceCandidate, provenanceRow))
    : null;
  const topSource = sourceCandidate
    ? (String(sourceCandidate.source || '').trim() || candidateSourceLabel(sourceCandidate, topEvidence || {}))
    : '';
  const topMethod = sourceCandidate
    ? (String(sourceCandidate.method || '').trim() || null)
    : null;
  const topTier = sourceCandidate ? (toInt(sourceCandidate.tier, 0) || null) : null;
  const topEvidenceUrl = topEvidence?.url || '';
  const topEvidenceQuote = topEvidence?.quote || '';

  return {
    selected: {
      value: resolvedSelectedValue,
      confidence: resolvedSelectedConfidence,
      status: reasonCodes.length > 0 ? 'needs_review' : 'ok',
      color
    },
    needs_review: reasonCodes.length > 0,
    reason_codes: reasonCodes,
    candidate_count: normalizedCandidates.length,
    candidates: includeCandidates ? normalizedCandidates : [],
    accepted_candidate_id: overridden ? null : (acceptedCandidate?.candidate_id || null),
    selected_candidate_id: overridden ? null : (selectedCandidate?.candidate_id || null),
    source: topSource,
    method: topMethod,
    tier: topTier,
    evidence_url: topEvidenceUrl,
    evidence_quote: topEvidenceQuote
  };
}

export async function buildProductReviewPayload({
  storage,
  config = {},
  category,
  productId,
  layout = null,
  includeCandidates = true,
  specDb = null,
  catalogProduct = null,
}) {
  const resolvedLayout = layout || await buildReviewLayout({ storage, config, category });
  const latest = await readLatestArtifacts(storage, category, productId);
  const rows = {};
  let reviewableFlags = 0;
  let missingCount = 0;

  let useSpecDb = false;
  let dbHasAnyState = false;
  let dbProduct = null;
  let dbFieldRowsByField = new Map();
  let dbCandidatesByField = {};

  if (specDb) {
    try {
      const dbFieldRows = toArray(specDb.getItemFieldState(productId));
      dbHasAnyState = dbFieldRows.length > 0;
      dbFieldRowsByField = new Map(dbFieldRows.map((row) => [normalizeField(row.field_key), row]));
      dbCandidatesByField = specDb.getCandidatesForProduct(productId) || {};
      dbProduct = specDb.getProduct(productId) || null;

      useSpecDb = dbHasAnyState || Boolean(dbProduct);

      if (useSpecDb) {
        // ID-first invariant: every grid field must have a persisted slot row.
        // This guarantees itemFieldStateId exists for all drawer mutations.
        const layoutFields = toArray(resolvedLayout?.rows)
          .map((row) => normalizeField(row?.key))
          .filter(Boolean);
        const missingFields = layoutFields.filter((field) => !dbFieldRowsByField.has(field));
        if (missingFields.length > 0) {
          for (const fieldKey of missingFields) {
            specDb.upsertItemFieldState({
              productId,
              fieldKey,
              value: 'unk',
              confidence: 0,
              source: 'pipeline',
              acceptedCandidateId: null,
              overridden: false,
              needsAiReview: false,
              aiReviewComplete: false,
            });
          }
          const refreshedRows = toArray(specDb.getItemFieldState(productId));
          dbHasAnyState = refreshedRows.length > 0;
          dbFieldRowsByField = new Map(refreshedRows.map((row) => [normalizeField(row.field_key), row]));
        }
      }
    } catch {
      useSpecDb = false;
      dbHasAnyState = false;
      dbFieldRowsByField = new Map();
      dbCandidatesByField = {};
    }
  }

  // Read override file only in JSON-primary mode.
  const overridePath = resolveOverrideFilePath({ config, category, productId });
  const overrideDoc = useSpecDb ? null : await readOverrideFile(overridePath);
  const overrides = isObject(overrideDoc?.overrides) ? overrideDoc.overrides : {};

  for (const row of resolvedLayout.rows || []) {
    const field = normalizeField(row.key);
    const fieldShape = String(row?.field_rule?.shape || 'scalar').trim().toLowerCase() || 'scalar';
    const dbFieldRow = useSpecDb ? dbFieldRowsByField.get(field) : null;

    if (dbFieldRow) {
      const dbCandidateRows = toArray(dbCandidatesByField[field]).map(toSpecDbCandidateRow);
      const isOverridden = Boolean(dbFieldRow.overridden);
      const selectedShapeValue = normalizeSlotValueForShape(
        dbFieldRow.value != null && String(dbFieldRow.value).trim() !== '' ? dbFieldRow.value : 'unk',
        fieldShape
      ).value;
      const selectedValue = slotValueToText(selectedShapeValue, fieldShape) ?? 'unk';
      const state = buildFieldState({
        field,
        candidates: { [field]: dbCandidateRows },
        normalized: { fields: { [field]: selectedValue } },
        provenance: {
          [field]: {
            value: selectedValue,
            confidence: Math.max(0, Math.min(1, toNumber(dbFieldRow.confidence, 0))),
            host: '',
            source: dbFieldRow.source || '',
            evidence: [],
          }
        },
        summary: latest.summary,
        includeCandidates,
        category,
        productId,
        fieldShape,
        acceptedCandidateId: dbFieldRow.accepted_candidate_id || null,
        overridden: isOverridden,
      });

      const needsReview = Boolean(dbFieldRow.needs_ai_review);
      const reasonCodes = needsReview
        ? (state.reason_codes.length > 0 ? state.reason_codes : ['needs_ai_review'])
        : [];
      const selectedConfidence = isOverridden
        ? 1
        : Math.max(
          Math.max(0, Math.min(1, toNumber(dbFieldRow.confidence, 0))),
          Math.max(0, Math.min(1, toNumber(state.selected?.confidence, 0)))
        );
      const color = hasKnownValue(state.selected?.value)
        ? confidenceColor(selectedConfidence, reasonCodes)
        : 'gray';

      state.selected = {
        value: isOverridden ? selectedValue : state.selected.value,
        confidence: selectedConfidence,
        status: needsReview ? 'needs_review' : 'ok',
        color,
      };
      state.needs_review = needsReview;
      state.reason_codes = reasonCodes;
      state.candidate_count = Number.isFinite(Number(state.candidate_count))
        ? Number(state.candidate_count)
        : dbCandidateRows.length;
      state.overridden = isOverridden;
      state.slot_id = dbFieldRow.id ?? null;
      state.accepted_candidate_id = state.overridden
        ? null
        : (state.accepted_candidate_id || String(dbFieldRow.accepted_candidate_id || '').trim() || null);
      state.source_timestamp = String(dbFieldRow.updated_at || '').trim() || null;

      if (state.overridden) {
        state.source = 'user';
        state.method = 'manual_override';
        state.tier = null;
      } else if (dbFieldRow.source) {
        state.source = state.source || dbSourceLabel(dbFieldRow.source);
        state.method = state.method || dbSourceMethod(dbFieldRow.source);
        state.tier = null;
      }

      rows[field] = state;
    } else if (useSpecDb) {
      rows[field] = buildFieldState({
        field,
        candidates: {},
        normalized: { fields: {} },
        provenance: {},
        summary: {},
        includeCandidates,
        category,
        productId,
        fieldShape,
      });
    } else {
      rows[field] = buildFieldState({
        field,
        candidates: latest.candidates,
        normalized: latest.normalized,
        provenance: latest.provenance,
        summary: latest.summary,
        includeCandidates,
        category,
        productId,
        fieldShape,
      });
    }

    // Apply override on top of pipeline data (JSON-primary mode only).
    const ovr = overrides[field];
    if (isObject(ovr) && ovr.override_value != null) {
      const overrideShapeValue = normalizeSlotValueForShape(ovr.override_value, fieldShape).value;
      const overrideValue = slotValueToText(overrideShapeValue, fieldShape) ?? 'unk';
      rows[field].selected = {
        value: overrideValue,
        confidence: 1.0,
        status: 'ok',
        color: 'green'
      };
      rows[field].needs_review = false;
      rows[field].reason_codes = [];
      // Only show OVR badge for manual entries — candidate acceptance is confirmation, not override
      rows[field].overridden = ovr.override_source === 'manual_entry';
      rows[field].accepted_candidate_id = rows[field].overridden
        ? null
        : String(ovr.candidate_id || '').trim() || null;
      // Surface the timestamp from override provenance
      rows[field].source_timestamp = ovr.overridden_at || ovr.set_at || null;

      // Populate source from override provenance so tooltip/drawer show correct source
      if (ovr.override_source === 'manual_entry') {
        rows[field].source = 'user';
        rows[field].method = 'manual_override';
        rows[field].tier = null;
      } else if (isObject(ovr.source)) {
        rows[field].source = String(ovr.source.host || '').trim();
        rows[field].method = String(ovr.source.method || '').trim();
        rows[field].tier = toInt(ovr.source.tier, 0) || null;
      }
      if (isObject(ovr.override_provenance)) {
        rows[field].evidence_url = String(ovr.override_provenance.url || '').trim();
        rows[field].evidence_quote = String(ovr.override_provenance.quote || '').trim();
      }
    }

    const fieldFlags = inferFlags({
      reasonCodes: rows[field].reason_codes || [],
      fieldRule: row.field_rule || {},
      candidates: rows[field].candidates || [],
      acceptedCandidateId: rows[field].accepted_candidate_id || null,
      overridden: Boolean(rows[field].overridden),
    });
    for (const flag of fieldFlags) {
      if (!(rows[field].reason_codes || []).includes(flag)) {
        rows[field].reason_codes = [...(rows[field].reason_codes || []), flag];
        if (!rows[field].needs_review) {
          rows[field].needs_review = true;
          rows[field].selected = {
            ...rows[field].selected,
            status: 'needs_review',
          };
        }
      }
    }

    if (fieldFlags.length > 0) {
      reviewableFlags += 1;
    }
    if (!hasKnownValue(rows[field].selected.value) && rows[field].needs_review) {
      missingCount += 1;
    }
  }

  const fallbackConfidence = toNumber(latest.summary.confidence, 0);
  const fallbackCoverage = toNumber(latest.summary.coverage_overall_percent, 0) / 100;
  const computedCoverage = resolvedLayout.rows.length > 0
    ? (resolvedLayout.rows.length - missingCount) / resolvedLayout.rows.length
    : 0;
  const knownFieldStates = Object.values(rows).filter((state) => hasKnownValue(state?.selected?.value));
  const computedConfidence = knownFieldStates.length > 0
    ? knownFieldStates.reduce((sum, state) => sum + toNumber(state?.selected?.confidence, 0), 0) / knownFieldStates.length
    : 0;
  const confidence = useSpecDb && computedConfidence > 0 ? computedConfidence : fallbackConfidence;
  const coverage = useSpecDb ? computedCoverage : fallbackCoverage;

  const normalizedIdentity = isObject(latest.normalized.identity) ? latest.normalized.identity : {};
  const catalogIdentity = isObject(catalogProduct) ? catalogProduct : {};
  const authoritativeIdentity = resolveAuthoritativeProductIdentity({
    productId,
    category,
    catalogProduct: catalogIdentity,
    dbProduct,
    normalizedIdentity,
  });
  const updatedAt = (() => {
    if (useSpecDb) {
      let maxTs = 0;
      for (const state of Object.values(rows)) {
        const ts = parseDateMs(state?.source_timestamp || '');
        if (ts > maxTs) maxTs = ts;
      }
      if (maxTs > 0) return new Date(maxTs).toISOString();
    }
    return String(latest.summary.generated_at || nowIso());
  })();

  return {
    product_id: productId,
    category,
    identity: authoritativeIdentity,
    fields: rows,
    metrics: {
      confidence,
      coverage,
      flags: reviewableFlags,
      missing: missingCount,
      has_run: useSpecDb
        ? dbHasAnyState
        : !!(latest.summary.generated_at && (confidence > 0 || coverage > 0)),
      updated_at: updatedAt
    }
  };
}

export async function writeProductReviewArtifacts({
  storage,
  config = {},
  category,
  productId
}) {
  const layout = await buildReviewLayout({ storage, config, category });
  const payload = await buildProductReviewPayload({
    storage,
    config,
    category,
    productId,
    layout
  });
  const keys = reviewKeys(storage, category, productId);

  const items = [];
  const byField = {};
  const queueItems = [];
  for (const row of layout.rows || []) {
    const field = normalizeField(row.key);
    const state = payload.fields[field] || {
      selected: { value: 'unk', confidence: 0, status: 'needs_review', color: 'gray' },
      needs_review: true,
      reason_codes: ['missing_value'],
      candidates: []
    };
    byField[field] = [];
    for (let index = 0; index < state.candidates.length; index += 1) {
      const candidate = state.candidates[index];
      const item = {
        candidate_id: candidate.candidate_id,
        candidate_index: index,
        field,
        value: candidate.value,
        score: candidate.score,
        source_id: candidate.source_id || '',
        source: candidate.source || '',
        tier: candidate.tier,
        method: candidate.method || '',
        evidence: candidate.evidence || {},
        needs_review: state.needs_review
      };
      items.push(item);
      byField[field].push(item);
    }
    if (state.needs_review) {
      queueItems.push({
        field,
        reason_codes: state.reason_codes || [],
        selected_value: state.selected.value,
        confidence: state.selected.confidence,
        color: state.selected.color
      });
    }
  }

  const candidatesArtifact = {
    version: 1,
    generated_at: nowIso(),
    category,
    product_id: productId,
    candidate_count: items.length,
    field_count: Object.keys(byField).length,
    items,
    by_field: byField
  };
  const reviewQueueArtifact = {
    version: 1,
    generated_at: nowIso(),
    category,
    product_id: productId,
    count: queueItems.length,
    items: queueItems
  };

  await Promise.all([
    writeJson(storage, keys.candidatesKey, candidatesArtifact),
    writeJson(storage, keys.legacyCandidatesKey, candidatesArtifact),
    writeJson(storage, keys.reviewQueueKey, reviewQueueArtifact),
    writeJson(storage, keys.legacyReviewQueueKey, reviewQueueArtifact),
    writeJson(storage, keys.productKey, payload),
    writeJson(storage, keys.legacyProductKey, payload)
  ]);

  return {
    product_id: productId,
    category,
    candidate_count: items.length,
    review_field_count: queueItems.length,
    keys
  };
}


export async function buildReviewQueue({
  storage,
  config = {},
  category,
  status = 'needs_review',
  limit = 200,
  specDb = null,
  catalogProducts = null,
}) {
  const loaded = await loadQueueState({ storage, category, specDb });
  const products = Object.values(loaded.state.products || {});
  const rows = [];

  for (const product of products) {
    const productId = String(product.productId || '').trim();
    if (!productId) {
      continue;
    }
    const latest = await readLatestArtifacts(storage, category, productId);
    const keys = reviewKeys(storage, category, productId);
    let reviewQueue = await storage.readJsonOrNull(keys.reviewQueueKey);
    if (!reviewQueue) {
      reviewQueue = await storage.readJsonOrNull(keys.legacyReviewQueueKey);
    }
    const flags = toInt(reviewQueue?.count, 0);
    const confidence = toNumber(latest.summary.confidence, 0);
    const coverage = toNumber(latest.summary.coverage_overall_percent, 0) / 100;
    const identity = isObject(latest.normalized.identity) ? latest.normalized.identity : {};
    const catalogIdentity = isObject(catalogProducts?.[productId]) ? catalogProducts[productId] : {};
    const authoritativeIdentity = resolveAuthoritativeProductIdentity({
      productId,
      category,
      catalogProduct: catalogIdentity,
      normalizedIdentity: identity,
    });
    const item = {
      product_id: productId,
      category,
      id: authoritativeIdentity.id,
      identifier: authoritativeIdentity.identifier,
      brand: authoritativeIdentity.brand,
      model: authoritativeIdentity.model,
      variant: authoritativeIdentity.variant,
      coverage,
      confidence,
      flags,
      status: String(product.status || '').trim() || 'unknown',
      updated_at: String(product.updated_at || latest.summary.generated_at || nowIso())
    };
    const needsReview = flags > 0 || ['needs_manual', 'exhausted', 'failed'].includes(normalizeToken(item.status));
    if (normalizeToken(status) === 'needs_review' && !needsReview) {
      continue;
    }
    if (normalizeToken(status) && normalizeToken(status) !== 'needs_review') {
      if (normalizeToken(item.status) !== normalizeToken(status)) {
        continue;
      }
    }
    rows.push(item);
  }

  rows.sort((a, b) => {
    const urgency = urgencyScore(b) - urgencyScore(a);
    if (urgency !== 0) {
      return urgency;
    }
    const updated = parseDateMs(b.updated_at) - parseDateMs(a.updated_at);
    if (updated !== 0) {
      return updated;
    }
    return a.product_id.localeCompare(b.product_id);
  });

  return rows.slice(0, Math.max(1, toInt(limit, 200)));
}

export async function writeCategoryReviewArtifacts({
  storage,
  config = {},
  category,
  status = 'needs_review',
  limit = 200,
  specDb = null,
}) {
  const items = await buildReviewQueue({
    storage,
    config,
    category,
    status,
    limit,
    specDb,
  });
  const key = `_review/${normalizePathToken(category)}/queue.json`;
  const payload = {
    version: 1,
    generated_at: nowIso(),
    category,
    status: normalizeToken(status) || 'needs_review',
    count: items.length,
    items
  };
  await writeJson(storage, key, payload);
  return {
    key,
    count: items.length,
    items
  };
}
