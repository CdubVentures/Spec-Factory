// ── SpecDb Component Review Builder ──────────────────────────────────
//
// Extracted from componentReviewData.js — builds the SpecDb-primary
// component review payloads for a single component type.

import path from 'node:path';
import { confidenceColor } from './confidenceColor.js';
import { fanOutCandidates } from './candidateFanOut.js';
import { evaluateVarianceBatch } from './varianceEvaluator.js';
import { loadComponentDbsFromSpecDb } from '../../../db/helpers/componentDbLoader.js';
import {
  buildComponentReviewSyntheticCandidateId,
  buildReferenceComponentCandidateId,
} from '../../../utils/candidateIdentifier.js';
import { buildComponentIdentifier } from '../../../utils/componentIdentifier.js';
import {
  toArray,
  normalizeToken,
  slugify,
} from './reviewNormalization.js';
import {
  hasKnownValue,
  ensureTrackedStateCandidateInvariant,
  hasActionableCandidate,
  isSharedLanePending,
} from './candidateInfrastructure.js';
import {
  safeReadJson,
  listJsonFiles,
  discoveredFromSource,
  enforceNonDiscoveredRows,
  resolveDeclaredComponentPropertyColumns,
  hasDeclaredComponentSource,
  resolveComponentReviewPropertyColumns,
  componentLaneSlug,
} from './componentReviewHelpers.js';
import { resolvePropertyFieldMeta } from './componentReviewHelpers.js';

// ── SpecDb-primary component payloads ────────────────────────────────

function buildPublishedProductCandidates({ specDb, productIds = [], fieldKey = '' } = {}) {
  if (!specDb || typeof specDb.getFieldCandidatesByProductAndField !== 'function') {
    return [];
  }
  const rows = [];
  for (const productId of productIds) {
    const linkedProductId = String(productId || '').trim();
    if (!linkedProductId) continue;
    const fieldRows = specDb.getFieldCandidatesByProductAndField(linkedProductId, fieldKey) || [];
    for (const row of fieldRows) {
      if (String(row?.status || '').trim() !== 'resolved') continue;
      rows.push(row);
    }
  }
  return fanOutCandidates(rows).filter((candidate) => candidate.status === 'resolved');
}

export async function buildComponentReviewPayloadsSpecDb({ config = {}, category, componentType, specDb, fieldRules = null }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');

  let allComponents = specDb.getAllComponentsForType(componentType);

  const declaredColumns = resolveDeclaredComponentPropertyColumns({ fieldRules, componentType });
  const propertyColumns = resolveComponentReviewPropertyColumns({
    observedColumns: specDb.getPropertyColumnsForType(componentType),
    declaredColumns,
    declaredComponentSource: hasDeclaredComponentSource({ fieldRules, componentType }),
  });

  // WHY: Reference baseline sourced from SQL (component_identity/values/aliases)
  // via loadComponentDbsFromSpecDb — no longer from a stale blob copy. After this
  // change the baseline converges with the live identity, so user edits are
  // reflected without requiring a recompile.
  const refDbByIdentity = new Map();
  const refDbByName = new Map();
  try {
    const allComponentDbs = loadComponentDbsFromSpecDb(specDb);
    const matchedDb = Object.values(allComponentDbs).find(db => db?.component_type === componentType);
    if (matchedDb) {
      const items = Object.values(matchedDb.entries || {});
      for (const item of items) {
        const name = String(item?.name || item?.canonical_name || '').trim();
        if (!name) continue;
        const maker = String(item?.maker || '').trim();
        const identityKey = `${name.toLowerCase()}::${maker.toLowerCase()}`;
        refDbByIdentity.set(identityKey, item);
        if (!refDbByName.has(name.toLowerCase())) {
          refDbByName.set(name.toLowerCase(), item);
        }
      }
    }
  } catch {
    // Best-effort reference baseline only.
  }

  // Include unresolved component names seen in item field values.
  const existingNames = new Set(
    allComponents
      .map((c) => String(c?.identity?.canonical_name || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const unresolvedNames = new Set();

  try {
    const distinctValues = specDb.getDistinctItemFieldValues(componentType);
    for (const row of distinctValues) {
      const value = String(row?.value || '').trim();
      if (!value) continue;
      if (!existingNames.has(value.toLowerCase())) unresolvedNames.add(value);
    }
  } catch {
    // Best-effort only
  }

  let unresolvedInserted = false;
  for (const unresolvedName of unresolvedNames) {
    const lower = unresolvedName.toLowerCase();
    if (existingNames.has(lower)) continue;
    specDb.upsertComponentIdentity({
      componentType,
      canonicalName: unresolvedName,
      maker: '',
      links: [],
      source: 'pipeline',
    });
    unresolvedInserted = true;
    existingNames.add(lower);
  }
  if (unresolvedInserted) {
    allComponents = specDb.getAllComponentsForType(componentType);
  }
  if (!allComponents.length) {
    return { category, componentType, items: [], metrics: { total: 0, avg_confidence: 0, flags: 0 } };
  }

  const propertyTemplateByKey = new Map();
  for (const comp of allComponents) {
    for (const row of toArray(comp?.properties)) {
      const key = String(row?.property_key || '').trim();
      if (!key || propertyTemplateByKey.has(key)) continue;
      let constraints = [];
      if (typeof row?.constraints === 'string' && row.constraints.trim()) {
        try {
          const parsed = JSON.parse(row.constraints);
          constraints = Array.isArray(parsed) ? parsed : [];
        } catch {
          constraints = [];
        }
      }
      propertyTemplateByKey.set(key, {
        variance_policy: row?.variance_policy ?? null,
        constraints,
      });
    }
  }
  const makerVariantsByName = new Map();
  for (const comp of allComponents) {
    const nameKey = String(comp?.identity?.canonical_name || '').trim().toLowerCase();
    if (!nameKey) continue;
    if (!makerVariantsByName.has(nameKey)) makerVariantsByName.set(nameKey, new Set());
    makerVariantsByName.get(nameKey).add(normalizeToken(comp?.identity?.maker || ''));
  }

  const items = [];

  for (const comp of allComponents) {
    let { identity, aliases: aliasRows, properties: propRows } = comp;
    const itemName = identity.canonical_name;
    const itemMaker = identity.maker || '';
    if (identity?.id) {
      const propByKey = new Map(
        toArray(propRows).map((row) => [String(row?.property_key || '').trim(), row]),
      );
      let insertedSlots = false;
      for (const propertyKey of propertyColumns) {
        const key = String(propertyKey || '').trim();
        if (!key || propByKey.has(key)) continue;
        const template = propertyTemplateByKey.get(key) || null;
        const fieldMeta = resolvePropertyFieldMeta(key, fieldRules);
        specDb.upsertComponentValue({
          componentType,
          componentName: itemName,
          componentMaker: itemMaker,
          propertyKey: key,
          value: null,
          confidence: 0,
          variancePolicy: template?.variance_policy ?? null,
          source: 'pipeline',
          acceptedCandidateId: null,
          needsReview: true,
          overridden: false,
          constraints: fieldMeta?.constraints?.length > 0 ? fieldMeta.constraints : (template?.constraints || []),
        });
        insertedSlots = true;
      }
      if (insertedSlots) {
        propRows = specDb.getComponentValuesWithMaker(componentType, itemName, itemMaker) || [];
      }
    }
    const itemAliases = aliasRows
      .filter(a => a.alias !== itemName) // exclude canonical_name alias
      .map(a => a.alias);
    const aliasesOverridden = Boolean(identity.aliases_overridden);
    const reviewStatus = identity.review_status || 'pending';

    // Build property map from DB rows
    const propMap = {};
    for (const row of propRows) {
      propMap[row.property_key] = row;
    }
    const refDbIdentityKey = `${String(itemName || '').toLowerCase()}::${String(itemMaker || '').toLowerCase()}`;
    const refDbItem = refDbByIdentity.get(refDbIdentityKey)
      || refDbByName.get(String(itemName || '').toLowerCase())
      || null;
    const componentIdentifier = buildComponentIdentifier(componentType, itemName, itemMaker);
    const nameKeyState = null;
    const makerKeyState = null;
    const componentKeyStateByProperty = new Map();
    let linkedProducts = [];
    let linkedProductIds = [];
    try {
      const linkRows = specDb.getProductsForComponent(componentType, itemName, itemMaker);
      linkedProductIds = linkRows.map(r => r.product_id);
      linkedProducts = linkRows.map(r => ({
        product_id: r.product_id,
        field_key: r.field_key,
        match_type: r.match_type || 'exact',
        match_score: r.match_score ?? null,
      }));
    } catch {
      linkedProducts = [];
      linkedProductIds = [];
    }

    // Build ref_* candidate helper for component DB reference data
    const buildRefCandidate = (id, rawValue, dbGeneratedAt) => rawValue != null && rawValue !== '' ? [{
      candidate_id: id,
      value: rawValue,
      score: 1.0,
      source_id: 'reference',
      source: 'Reference',
      tier: null,
      method: 'reference_data',
      evidence: {
        url: '',
        retrieved_at: dbGeneratedAt || '',
        snippet_id: '',
        snippet_hash: '',
        quote: `From reference database`,
        quote_span: null,
        snippet_text: `From reference database`,
        source_id: 'reference',
      },
    }] : [];

    // Name tracked state — derive from DB source
    const nameSource = identity.source || 'component_db';
    const nameIsOverridden = nameSource === 'user';
    const nameIsPipeline = nameSource === 'pipeline';
    const nameBaseConfidence = nameIsPipeline ? 0.6 : 1.0;
    const nameNeedsReview = isSharedLanePending(nameKeyState, nameIsPipeline);
    const refNameValue = String(refDbItem?.name || '').trim();
    const nameRefCandidates = refNameValue
      ? buildRefCandidate(
        buildReferenceComponentCandidateId({
          componentType,
          componentName: itemName,
          componentMaker: itemMaker,
          propertyKey: '__name',
          value: refNameValue,
        }),
        refNameValue,
        identity.created_at
      )
      : [];
    const name_tracked = {
      selected: {
        value: nameKeyState?.selected_value ?? itemName,
        confidence: nameBaseConfidence,
        status: nameIsOverridden ? 'override' : (nameIsPipeline ? 'pipeline' : 'reference'),
        color: confidenceColor(nameBaseConfidence, nameNeedsReview ? ['new_component'] : []),
      },
      needs_review: nameNeedsReview,
      reason_codes: nameIsOverridden ? ['manual_override'] : (nameNeedsReview ? ['new_component'] : []),
      source: nameIsOverridden ? 'user' : (nameIsPipeline ? 'pipeline' : 'reference'),
      source_timestamp: nameIsOverridden ? (String(identity.updated_at || '').trim() || null) : null,
      variance_policy: null,
      constraints: [],
      overridden: nameIsOverridden,
      candidate_count: nameRefCandidates.length,
      candidates: nameRefCandidates,
      accepted_candidate_id: String(nameKeyState?.selected_candidate_id || '').trim() || null,
    };

    // Maker tracked state
    const makerIsOverridden = nameSource === 'user'; // identity source covers both name+maker
    const makerNeedsReview = isSharedLanePending(makerKeyState, !itemMaker && !makerIsOverridden);
    const refMakerValue = String(refDbItem?.maker || '').trim();
    const makerRefCandidates = refMakerValue ? buildRefCandidate(
      buildReferenceComponentCandidateId({
        componentType,
        componentName: itemName,
        componentMaker: itemMaker,
        propertyKey: '__maker',
        value: refMakerValue,
      }),
      refMakerValue,
      identity.created_at
    ) : [];
    const maker_tracked = {
      selected: {
        value: makerKeyState?.selected_value ?? itemMaker,
        confidence: itemMaker ? 1.0 : 0,
        status: makerIsOverridden ? 'override' : (itemMaker ? 'reference' : 'unknown'),
        color: confidenceColor(itemMaker ? 1.0 : 0, []),
      },
      needs_review: makerNeedsReview,
      reason_codes: makerIsOverridden ? ['manual_override'] : (makerNeedsReview ? ['new_component'] : []),
      source: makerIsOverridden ? 'user' : (itemMaker ? 'reference' : 'unknown'),
      source_timestamp: makerIsOverridden ? (String(identity.updated_at || '').trim() || null) : null,
      variance_policy: null,
      constraints: [],
      overridden: makerIsOverridden,
      candidate_count: makerRefCandidates.length,
      candidates: makerRefCandidates,
      accepted_candidate_id: String(makerKeyState?.selected_candidate_id || '').trim() || null,
    };

    // Links tracked state
    const effectiveLinks = toArray(identity.links ? JSON.parse(identity.links) : []);
    const linksOverridden = nameIsOverridden;
    const linksTimestamp = linksOverridden ? (String(identity.updated_at || '').trim() || null) : null;
    const links_tracked = effectiveLinks.map((url) => ({
      selected: { value: url, confidence: 1.0, status: linksOverridden ? 'override' : 'reference', color: confidenceColor(1.0, []) },
      needs_review: false,
      reason_codes: linksOverridden ? ['manual_override'] : [],
      source: linksOverridden ? 'user' : 'reference',
      source_timestamp: linksTimestamp,
      overridden: linksOverridden,
    }));
    const linkCandidates = buildPublishedProductCandidates({
      specDb,
      productIds: linkedProductIds,
      fieldKey: `${componentType}_link`,
    });
    const links_state = {
      selected: {
        value: null,
        confidence: 0,
        status: 'unknown',
        color: 'gray',
      },
      needs_review: false,
      reason_codes: [],
      source: 'unknown',
      source_timestamp: null,
      variance_policy: null,
      constraints: [],
      overridden: false,
      candidate_count: linkCandidates.length,
      candidates: linkCandidates,
      accepted_candidate_id: null,
      enum_values: null,
      enum_policy: null,
    };

    // Build properties
    const properties = {};
    let itemPropCount = 0;
    let itemFlags = 0;

    for (const key of propertyColumns) {
      const dbRow = propMap[key];
      const variance = dbRow?.variance_policy || null;
      const meta = resolvePropertyFieldMeta(key, fieldRules);
      const componentOnly = meta?.component_only === true;
      const fieldConstraints = meta?.constraints?.length > 0
        ? meta.constraints
        : (dbRow?.constraints ? JSON.parse(dbRow.constraints) : []);
      const candidates = componentOnly
        ? []
        : buildPublishedProductCandidates({
          specDb,
          productIds: linkedProductIds,
          fieldKey: key,
        });

      const propertyState = {
        slot_id: dbRow?.id ?? null,
        selected: {
          value: null,
          confidence: 0,
          status: 'unknown',
          color: 'gray',
        },
        needs_review: false,
        reason_codes: [],
        source: 'unknown',
        source_timestamp: null,
        variance_policy: variance,
        constraints: fieldConstraints,
        overridden: false,
        candidate_count: candidates.length,
        candidates,
        accepted_candidate_id: null,
        enum_values: meta?.enum_values ?? null,
        enum_policy: meta?.enum_policy ?? null,
      };
      if (componentOnly) propertyState.component_only = true;
      properties[key] = propertyState;

      itemPropCount++;
    }

    // SpecDb enrichment: product-level candidates from SQLite
    const laneSlug = componentLaneSlug(itemName, itemMaker);
    try {
      if (linkedProductIds.length > 0) {
        // Variance evaluation
        for (const key of propertyColumns) {
          const prop = properties[key];
          if (!prop) continue;
          const policy = prop.variance_policy;
          if (!policy || policy === 'override_allowed') continue;
          const dbValue = prop.selected?.value;
          if (dbValue == null) continue;
          // Phase 1b: item_field_state is retired — use empty array default
          const fieldStates = [];
          if (!fieldStates.length) continue;
          const entries = fieldStates.map(s => ({ product_id: s.product_id, value: s.value }));
          const batch = evaluateVarianceBatch(policy, dbValue, entries);
          if (batch.summary.violations > 0) {
            if (!prop.reason_codes.includes('variance_violation')) {
              prop.reason_codes.push('variance_violation');
            }
            prop.needs_review = true;
            prop.variance_violations = {
              count: batch.summary.violations,
              total_products: batch.summary.total,
              products: batch.results
                .filter(r => !r.compliant)
                .slice(0, 5)
                .map(r => ({ product_id: r.product_id, value: r.value, reason: r.reason, details: r.details })),
            };
            itemFlags++;
          }
        }

        // WHY: Linked products are specDb evidence that this component name is confirmed
        // across multiple products. Surface them as specdb candidates for name review.
        const existingNameCandidateIds = new Set(name_tracked.candidates.map((c) => String(c?.candidate_id || '').trim()));
        for (const linkRow of linkedProducts) {
          const candidateId = buildComponentReviewSyntheticCandidateId({
            productId: linkRow.product_id,
            fieldKey: '__name',
            reviewId: `specdb-link-${linkRow.product_id}`,
            value: itemName,
          });
          if (existingNameCandidateIds.has(candidateId)) continue;
          existingNameCandidateIds.add(candidateId);
          name_tracked.candidates.push({
            candidate_id: candidateId,
            value: itemName,
            score: linkRow.match_score ?? 0.9,
            source_id: 'specdb',
            source: `SpecDb (${linkRow.product_id})`,
            tier: null,
            method: linkRow.match_type || 'exact',
            evidence: {
              url: '',
              retrieved_at: '',
              snippet_id: '',
              snippet_hash: '',
              quote: `Linked from product ${linkRow.product_id}`,
              quote_span: null,
              snippet_text: `Component ${componentType} linked via item_component_links`,
              source_id: 'specdb',
            },
          });
        }
        name_tracked.candidate_count = name_tracked.candidates.length;
      }
    } catch (_specDbErr) {
      // SpecDb enrichment is best-effort
    }

    ensureTrackedStateCandidateInvariant(name_tracked, {
      fallbackCandidateId: `component_${slugify(componentType)}_${laneSlug}_name`,
      fallbackQuote: `Selected ${componentType} name retained for authoritative review`,
    });
    ensureTrackedStateCandidateInvariant(maker_tracked, {
      fallbackCandidateId: `component_${slugify(componentType)}_${laneSlug}_maker`,
      fallbackQuote: `Selected ${componentType} maker retained for authoritative review`,
    });

    const confidenceValues = propertyColumns
      .map((key) => Number.parseFloat(String(properties[key]?.selected?.confidence ?? '')))
      .filter((value) => Number.isFinite(value));
    const avgConf = confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0;
    const identitySource = String(identity?.source || '').trim();

    items.push({
      component_identity_id: identity.id ?? null,
      name: itemName,
      maker: itemMaker,
      aliases: itemAliases,
      aliases_overridden: aliasesOverridden,
      links: effectiveLinks,
      name_tracked,
      maker_tracked,
      links_tracked,
      links_state,
      properties,
      linked_products: linkedProducts,
      review_status: reviewStatus,
      discovery_source: identitySource,
      discovered: discoveredFromSource(identitySource),
      metrics: {
        confidence: Math.round(avgConf * 100) / 100,
        flags: itemFlags,
        property_count: itemPropCount,
      },
    });
  }

  const normalizedItems = enforceNonDiscoveredRows(items, category);
  const visibleItems = normalizedItems.filter((item) => {
    const linkedCount = Array.isArray(item.linked_products) ? item.linked_products.length : 0;
    const hasNamePending = Boolean(item.name_tracked?.needs_review) && hasActionableCandidate(item.name_tracked?.candidates);
    const hasMakerPending = Boolean(item.maker_tracked?.needs_review) && hasActionableCandidate(item.maker_tracked?.candidates);
    const hasPropertyPending = propertyColumns.some((key) => {
      const prop = item?.properties?.[key];
      return Boolean(prop?.needs_review) && hasActionableCandidate(prop?.candidates);
    });
    const hasCandidateEvidence = hasActionableCandidate(item?.name_tracked?.candidates)
      || hasActionableCandidate(item?.maker_tracked?.candidates)
      || propertyColumns.some((key) => hasActionableCandidate(item?.properties?.[key]?.candidates));
    const identitySources = [item?.name_tracked?.source, item?.maker_tracked?.source]
      .map((source) => String(source || '').trim().toLowerCase())
      .filter(Boolean);
    const hasStableIdentitySource = identitySources.some((source) => source !== 'pipeline' && source !== 'unknown');
    const hasStablePropertySource = propertyColumns.some((key) => {
      const source = String(item?.properties?.[key]?.source || '').trim().toLowerCase();
      const selectedValue = item?.properties?.[key]?.selected?.value;
      return source && source !== 'pipeline' && source !== 'unknown' && hasKnownValue(selectedValue);
    });
    return linkedCount > 0
      || hasNamePending
      || hasMakerPending
      || hasPropertyPending
      || hasCandidateEvidence
      || hasStableIdentitySource
      || hasStablePropertySource;
  });
  const finalItems = enforceNonDiscoveredRows(visibleItems, category);
  const visibleFlags = finalItems.reduce((sum, item) => sum + (item.metrics?.flags || 0), 0);
  const visibleAvgConfidence = finalItems.length > 0
    ? Math.round((finalItems.reduce((sum, item) => sum + (item.metrics?.confidence || 0), 0) / finalItems.length) * 100) / 100
    : 0;

  return {
    category,
    componentType,
    property_columns: propertyColumns,
    items: finalItems,
    metrics: {
      total: finalItems.length,
      avg_confidence: visibleAvgConfidence,
      flags: visibleFlags,
    },
  };
}
