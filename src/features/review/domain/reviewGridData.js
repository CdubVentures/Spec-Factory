import fs from 'node:fs/promises';
import path from 'node:path';
import { nowIso } from '../../../shared/primitives.js';
import { loadCategoryConfig } from '../../../categories/loader.js';
import { ruleRequiredLevel } from '../../../engine/ruleAccessors.js';
import { projectFieldRulesForConsumer } from '../../../field-rules/consumerGate.js';
import { isVariantDependentField } from '../../../core/finder/finderModuleRegistry.js';
import { confidenceColor } from './confidenceColor.js';
import { buildFallbackFieldCandidateId } from '../../../utils/candidateIdentifier.js';
import { resolveAuthoritativeProductIdentity } from '../../catalog/index.js';
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
  parseFieldStudioRowFromCell,
  extractFieldStudioHints,
  reviewKeys,
  normalizeFieldContract,
  writeJson,
  candidateEvidenceFromRows,
  candidateScore,
  dbSourceLabel,
  dbSourceMethod,
  extractHostFromUrl,
  candidateSourceLabel,
} from './reviewGridHelpers.js';


/**
 * Decide whether a product has any meaningful pipeline/variant state.
 *
 * WHY: After delete-all-runs for CEF, candidates are stripped but variants +
 * published survive. The review row must remain visible, so "has run" must
 * consider published field states too — not just candidate count.
 *
 * @param {{ candidateCount: number, knownFieldStateCount: number }} opts
 * @returns {boolean}
 */
export function deriveHasRun({ candidateCount, knownFieldStateCount }) {
  return (candidateCount || 0) > 0 || (knownFieldStateCount || 0) > 0;
}

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
  fieldsOverride = null,
  studioMap: studioMapOverride = null,
  specDb = null,
}) {
  let compiledFields, compiledFieldOrder;
  const compiledRulesBlob = specDb?.getCompiledRules?.() ?? null;
  if (compiledRulesBlob) {
    compiledFields = compiledRulesBlob.fields || {};
    compiledFieldOrder = compiledRulesBlob.field_order || Object.keys(compiledFields);
  } else {
    const categoryConfig = await loadCategoryConfig(category, { storage, config });
    compiledFields = categoryConfig.fieldRules?.fields || {};
    compiledFieldOrder = categoryConfig.fieldOrder || Object.keys(compiledFields);
  }
  const mergedFields = fieldsOverride
    ? Object.fromEntries(Object.keys({ ...compiledFields, ...fieldsOverride }).map((k) => {
        const compiled = isObject(compiledFields[k]) ? compiledFields[k] : {};
        const draft = isObject(fieldsOverride[k]) ? fieldsOverride[k] : {};
        return [k, { ...compiled, ...draft, ui: { ...(isObject(compiled.ui) ? compiled.ui : {}), ...(isObject(draft.ui) ? draft.ui : {}) } }];
      }))
    : compiledFields;
  const projected = projectFieldRulesForConsumer({ fields: mergedFields }, 'review');
  const fields = isObject(projected?.fields) ? projected.fields : mergedFields;
  // WHY: SQL is the SSOT for studioMap. Callers pass it from specDb; null means no map.
  const studioMap = studioMapOverride || null;
  const mapPath = '';

  const compiledFieldList = compiledFieldOrder || Object.keys(fields || {});
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
    const fieldRuleBase = normalizeFieldContract(rule);
    rows.push({
      source_row: sourceRow > 0 ? sourceRow : null,
      group: positionalGroup || String(ui.group || '').trim(),
      key: normalizeField(field),
      label: String(ui.label || field),
      field_rule: {
        ...fieldRuleBase,
        // WHY: derived flag; authored field-rule value wins, falls back to module class.
        variant_dependent: isVariantDependentField(normalizeField(field), specDb),
      },
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
  contractUnit = null,
}) {
  const fieldKey = normalizeField(field);
  const normalizedShape = String(fieldShape || 'scalar').trim().toLowerCase() || 'scalar';
  const normalizedFields = isObject(normalized.fields) ? normalized.fields : {};
  const rawSelectedValue = Object.prototype.hasOwnProperty.call(normalizedFields, fieldKey)
    ? normalizedFields[fieldKey]
    : null;
  const selectedShapeValue = normalizeSlotValueForShape(rawSelectedValue, normalizedShape).value;
  const selectedValue = normalizedShape === 'list'
    ? (slotValueToText(selectedShapeValue, normalizedShape) ?? null)
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
          ? (slotValueToText(normalizedCandidateValue, normalizedShape) ?? null)
          : normalizedCandidateValue,
        unit: contractUnit || null,
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
      unit: contractUnit || null,
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
      resolvedSelectedValue = null;
      resolvedSelectedConfidence = 0;
    }
  }

  const color = hasKnownValue(resolvedSelectedValue)
    ? confidenceColor(resolvedSelectedConfidence)
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
      unit: contractUnit || null,
      confidence: resolvedSelectedConfidence,
      status: 'ok',
      color
    },
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
  const rows = {};
  let missingCount = 0;

  // Two tables only: products + field_candidates.
  const dbProduct = specDb?.getProduct(productId) || null;
  const allCandidates = toArray(specDb?.getAllFieldCandidatesByProduct?.(productId));

  // Variant registry lookup for enriching candidates + building variant_values.
  // Keyed by variant_id (the ID publisher + field_candidates rows reference).
  const variantById = new Map();
  if (specDb?.variants?.listActive) {
    for (const v of specDb.variants.listActive(productId)) {
      if (v?.variant_id) variantById.set(v.variant_id, v);
    }
  }

  // Group candidates by field_key, track resolved (published) per field.
  // For variant-dependent fields, collect ALL resolved rows keyed by variant_id.
  const candidatesByField = new Map();
  const resolvedByField = new Map();
  const variantValuesByField = new Map(); // fk → Map<vid, resolvedRow>
  for (const row of allCandidates) {
    const fk = normalizeField(row.field_key);
    if (!candidatesByField.has(fk)) candidatesByField.set(fk, []);
    candidatesByField.get(fk).push(row);
    if (String(row.status || '').trim() === 'resolved') {
      const existing = resolvedByField.get(fk);
      if (!existing || toNumber(row.confidence, 0) > toNumber(existing.confidence, 0)) {
        resolvedByField.set(fk, row);
      }
      if (row.variant_id && isVariantDependentField(fk, specDb)) {
        if (!variantValuesByField.has(fk)) variantValuesByField.set(fk, new Map());
        const byVid = variantValuesByField.get(fk);
        const current = byVid.get(row.variant_id);
        if (!current || toNumber(row.confidence, 0) > toNumber(current.confidence, 0)) {
          byVid.set(row.variant_id, row);
        }
      }
    }
  }

  // WHY: Variant-derived fields (colors, editions) are authoritative from the
  // variants SQL table (SSOT), not from candidates or product.json. Derive inline
  // so the review grid always shows the correct published state from SQL.
  //
  // These are variant-GENERATORS (NOT variant-dependent attributes) — the field
  // values ARE the variant identities. Publish to product.json.fields.<key> as a
  // JSON list, not to variant_fields[vid][key].
  //
  // WHY emit variant_values here: the drawer renders per-variant rows (one per
  // color combo, one per edition slug) so each row can display its own color
  // swatch + resolved value + per-variant source list (CEF identity-check
  // evidence). Drawer matches these entries against the single colors/editions
  // candidate using value-includes on the published JSON array.
  const generatorVariantValuesByField = new Map(); // fk → Record<vid, VariantValueEntry>
  if (specDb?.variants) {
    const activeVariants = specDb.variants.listActive(productId);
    const variantColors = [];
    const variantEditions = [];
    const colorsVariantValues = {};
    const editionsVariantValues = {};
    for (const v of activeVariants) {
      const colorAtoms = Array.isArray(v.color_atoms) ? v.color_atoms : null;
      const combo = colorAtoms ? colorAtoms.join('+') : '';
      const entryTimestamp = String(v.updated_at || '').trim() || null;
      if (v.variant_type === 'color') {
        // WHY: Combos stay intact as a single entry (e.g. "black+white"), not
        // split into individual atoms. Atom splitting is reserved for palette
        // validation / repair. Storage + display layers see the combo.
        if (combo && !variantColors.includes(combo)) variantColors.push(combo);
        if (combo) {
          colorsVariantValues[v.variant_id] = {
            value: combo,
            confidence: 1.0,
            source: 'cef',
            source_timestamp: entryTimestamp,
            variant_label: v.variant_label ?? null,
            variant_type: 'color',
            color_atoms: colorAtoms,
            edition_slug: null,
            variant_key: v.variant_key ?? null,
          };
        }
      } else if (v.variant_type === 'edition') {
        if (v.edition_slug && !variantEditions.includes(v.edition_slug)) {
          variantEditions.push(v.edition_slug);
        }
        if (v.edition_slug) {
          editionsVariantValues[v.variant_id] = {
            value: v.edition_slug,
            confidence: 1.0,
            source: 'cef',
            source_timestamp: entryTimestamp,
            variant_label: v.variant_label ?? null,
            variant_type: 'edition',
            color_atoms: colorAtoms,
            edition_slug: v.edition_slug,
            variant_key: v.variant_key ?? null,
          };
        }
        // WHY: An edition IS a color variant — its combo cascades into the
        // colors list so the review grid shows the full published color set.
        // Edition entries in colorsVariantValues keep variant_type='edition'
        // so the drawer can badge them distinctly and resolve variant_key
        // against CEF identity-check mappings (new_key: "edition:<slug>").
        if (combo && !variantColors.includes(combo)) variantColors.push(combo);
        if (combo) {
          colorsVariantValues[v.variant_id] = {
            value: combo,
            confidence: 1.0,
            source: 'cef',
            source_timestamp: entryTimestamp,
            variant_label: v.variant_label ?? null,
            variant_type: 'edition',
            color_atoms: colorAtoms,
            edition_slug: v.edition_slug ?? null,
            variant_key: v.variant_key ?? null,
          };
        }
      }
    }
    if (variantColors.length > 0) {
      resolvedByField.set(normalizeField('colors'), {
        value: JSON.stringify(variantColors),
        confidence: 1.0,
        status: 'resolved',
        metadata_json: { source: 'variant_registry' },
        updated_at: '',
      });
      if (Object.keys(colorsVariantValues).length > 0) {
        generatorVariantValuesByField.set(normalizeField('colors'), colorsVariantValues);
      }
    }
    if (variantEditions.length > 0) {
      resolvedByField.set(normalizeField('editions'), {
        value: JSON.stringify(variantEditions),
        confidence: 1.0,
        status: 'resolved',
        metadata_json: { source: 'variant_registry' },
        updated_at: '',
      });
      if (Object.keys(editionsVariantValues).length > 0) {
        generatorVariantValuesByField.set(normalizeField('editions'), editionsVariantValues);
      }
    }
  }

  for (const layoutRow of resolvedLayout.rows || []) {
    const field = normalizeField(layoutRow.key);
    const fieldCandidateRows = candidatesByField.get(field) || [];
    const resolvedRow = resolvedByField.get(field) || null;
    const isOverridden = resolvedRow?.metadata_json?.source === 'manual_override';

    const resolvedValue = resolvedRow?.value != null && String(resolvedRow.value).trim() !== ''
      ? resolvedRow.value : null;
    const resolvedConfidence = resolvedRow
      ? Math.max(0, Math.min(1, toNumber(resolvedRow.confidence, 0)))
      : 0;
    const hasValue = hasKnownValue(resolvedValue);

    const fieldIsVariantDependent = isVariantDependentField(field, specDb);
    const variantValuesForField = fieldIsVariantDependent ? variantValuesByField.get(field) : null;
    const hasVariantValues = !!(variantValuesForField && variantValuesForField.size > 0);

    if (!hasValue) missingCount += 1;

    // WHY: Skip emission when the field carries no information — no resolved value,
    // no candidates, no override, no per-variant data. Frontend grid renders from
    // layout.rows and falls back when fields[key] is missing (all accessors are
    // null-safe). Keeps products-index size linear in real data rather than
    // layout × products. missingCount still increments so metrics stay correct.
    if (!hasValue && fieldCandidateRows.length === 0 && !isOverridden && !hasVariantValues) {
      continue;
    }

    // Map field_candidates rows → candidate shape.
    // For variant-dependent fields, project variant_id + enrich with variant metadata
    // (label/type/color_atoms/edition_slug) so the drawer can render per-variant cards.
    let candidates = fieldCandidateRows.map((c) => {
      const meta = isObject(c.metadata_json) ? c.metadata_json : {};
      // WHY: Source-centric rows have source_type column; legacy rows fall back to metadata.
      const sourceToken = String(c.source_type || meta.source || '').trim().toLowerCase();
      const base = {
        candidate_id: `fc_${c.id}`,
        value: c.value,
        score: Math.max(0, Math.min(1, toNumber(c.confidence, 0))),
        source_id: c.source_id || sourceToken || '',
        source: dbSourceLabel(sourceToken) || sourceToken || '',
        tier: null,
        method: String(meta.method || sourceToken || '').trim() || null,
        status: c.status || 'candidate',
        evidence: {
          url: String(meta.evidence?.url || '').trim(),
          quote: String(meta.evidence?.quote || meta.reason || '').trim(),
          source_id: sourceToken || '',
        },
      };
      if (fieldIsVariantDependent && c.variant_id) {
        const variant = variantById.get(c.variant_id) || null;
        base.variant_id = c.variant_id;
        base.variant_label = variant?.variant_label ?? null;
        base.variant_type = variant?.variant_type ?? null;
        base.color_atoms = Array.isArray(variant?.color_atoms) ? variant.color_atoms : null;
        base.edition_slug = variant?.edition_slug ?? null;
      }
      return base;
    });

    // Determine source/method from resolved candidate.
    let source = '';
    let method = null;
    if (isOverridden) {
      source = 'user';
      method = 'manual_override';
    } else if (resolvedRow) {
      const st = String(resolvedRow.source_type || resolvedRow.metadata_json?.source || '').trim();
      source = dbSourceLabel(st) || st;
      method = String(resolvedRow.metadata_json?.method || '').trim() || null;
    }

    const color = hasValue
      ? confidenceColor(isOverridden ? 1 : resolvedConfidence, [])
      : 'gray';

    const row = {
      selected: {
        value: resolvedValue,
        confidence: isOverridden ? 1 : resolvedConfidence,
        status: 'ok',
        color,
      },
      candidate_count: fieldCandidateRows.length || candidates.length,
      candidates: includeCandidates ? candidates : [],
      accepted_candidate_id: null,
      selected_candidate_id: null,
      source,
      method,
      tier: null,
      evidence_url: '',
      evidence_quote: '',
      overridden: isOverridden,
      source_timestamp: String(resolvedRow?.updated_at || '').trim() || null,
    };

    // WHY: Variant-dependent fields (owned by a variantFieldProducer module) expose
    // per-variant published state keyed by variant_id. Drawer renders a variant×value
    // table from this map. Each entry is enriched with variant metadata
    // (label/type/color_atoms/edition_slug/variant_key) so the drawer renders
    // without an extra API call.
    if (hasVariantValues) {
      const variantValues = {};
      for (const [vid, r] of variantValuesForField.entries()) {
        const vmeta = isObject(r.metadata_json) ? r.metadata_json : {};
        const vsourceToken = String(r.source_type || vmeta.source || '').trim().toLowerCase();
        const vinfo = variantById.get(vid) || null;
        variantValues[vid] = {
          value: r.value,
          confidence: Math.max(0, Math.min(1, toNumber(r.confidence, 0))),
          source: dbSourceLabel(vsourceToken) || vsourceToken || '',
          source_timestamp: String(r.updated_at || '').trim() || null,
          variant_label: vinfo?.variant_label ?? null,
          variant_type: vinfo?.variant_type ?? null,
          color_atoms: Array.isArray(vinfo?.color_atoms) ? vinfo.color_atoms : null,
          edition_slug: vinfo?.edition_slug ?? null,
          variant_key: vinfo?.variant_key ?? null,
        };
      }
      row.variant_values = variantValues;
    }

    // WHY: Variant-generator fields (colors, editions) expose per-variant rows
    // too — built from the active-variant list rather than from candidate rows.
    // The single CEF candidate (value = full array) is matched against each
    // row's value via array-includes in the drawer, and per-variant sources
    // come from metadata.evidence_by_variant[variant_key].
    const generatorVariantValues = generatorVariantValuesByField.get(field);
    if (generatorVariantValues && Object.keys(generatorVariantValues).length > 0) {
      row.variant_values = generatorVariantValues;
    }

    rows[field] = row;
  }

  // Metrics from field state.
  const totalFields = resolvedLayout.rows?.length || 0;
  const knownFieldStates = Object.values(rows).filter((s) => hasKnownValue(s?.selected?.value));
  const computedConfidence = knownFieldStates.length > 0
    ? knownFieldStates.reduce((sum, s) => sum + toNumber(s?.selected?.confidence, 0), 0) / knownFieldStates.length
    : 0;
  const computedCoverage = totalFields > 0
    ? (totalFields - missingCount) / totalFields
    : 0;

  const catalogIdentity = isObject(catalogProduct) ? catalogProduct : {};
  const authoritativeIdentity = resolveAuthoritativeProductIdentity({
    productId,
    category,
    catalogProduct: catalogIdentity,
    dbProduct,
    normalizedIdentity: {},
  });

  let updatedAt = nowIso();
  for (const state of Object.values(rows)) {
    const ts = parseDateMs(state?.source_timestamp || '');
    if (ts > parseDateMs(updatedAt)) updatedAt = new Date(ts).toISOString();
  }

  return {
    product_id: productId,
    category,
    identity: authoritativeIdentity,
    fields: rows,
    metrics: {
      confidence: computedConfidence,
      coverage: computedCoverage,
      missing: missingCount,
      // WHY: "has run" means the product has any meaningful state. Candidates are
      // one signal; variant-backed published fields (colors, editions) are another.
      // After delete-all-runs for CEF, candidates are stripped but variants +
      // published survive, and the row must remain visible in the review grid.
      has_run: deriveHasRun({ candidateCount: allCandidates.length, knownFieldStateCount: knownFieldStates.length }),
      updated_at: updatedAt,
    },
  };
}

export async function writeProductReviewArtifacts({
  storage,
  config = {},
  category,
  productId,
  specDb = null,
}) {
  const layout = await buildReviewLayout({ storage, config, category });
  const payload = await buildProductReviewPayload({
    storage,
    config,
    category,
    productId,
    layout,
    specDb,
  });
  const keys = reviewKeys(storage, category, productId);

  const items = [];
  const byField = {};
  for (const row of layout.rows || []) {
    const field = normalizeField(row.key);
    const state = payload.fields[field] || {
      selected: { value: null, confidence: 0, status: 'ok', color: 'gray' },
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
      };
      items.push(item);
      byField[field].push(item);
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
  await Promise.all([
    writeJson(storage, keys.candidatesKey, candidatesArtifact),
    writeJson(storage, keys.legacyCandidatesKey, candidatesArtifact),
    writeJson(storage, keys.productKey, payload),
    writeJson(storage, keys.legacyProductKey, payload)
  ]);

  return {
    product_id: productId,
    category,
    candidate_count: items.length,
    keys
  };
}
