// ── Component Review Legacy Functions ───────────────────────────────
//
// Extracted from componentReviewData.js.
// These are the file-system-based legacy paths used when SpecDb is not available.

import fs from 'node:fs/promises';
import path from 'node:path';
import { confidenceColor } from './confidenceColor.js';
import { evaluateVarianceBatch } from './varianceEvaluator.js';
import {
  buildComponentReviewSyntheticCandidateId,
  buildSyntheticComponentCandidateId,
  buildReferenceComponentCandidateId,
} from '../../../utils/candidateIdentifier.js';
import { isObject, toArray, slugify, splitCandidateParts } from './reviewNormalization.js';
import {
  hasKnownValue,
  buildPipelineAttributionContext,
  buildPipelineReviewCandidate,
  ensureTrackedStateCandidateInvariant,
  hasActionableCandidate,
  isReviewItemCandidateVisible,
} from './candidateInfrastructure.js';
import {
  safeReadJson,
  listJsonFiles,
  isTestModeCategory,
  discoveredFromSource,
  enforceNonDiscoveredRows,
  resolveDeclaredComponentPropertyColumns,
  mergePropertyColumns,
  componentLaneSlug,
} from './componentReviewHelpers.js';

export async function buildComponentReviewLayoutLegacy({ config = {}, category, fieldRules = null }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const dbDir = path.join(helperRoot, category, '_generated', 'component_db');
  const files = await listJsonFiles(dbDir);

  const types = [];
  for (const f of files) {
    const data = await safeReadJson(path.join(dbDir, f));
    if (!data?.component_type || !Array.isArray(data.items)) continue;

    // Collect all property keys across items
    const propKeys = new Set();
    for (const item of data.items) {
      if (isObject(item.properties)) {
        for (const k of Object.keys(item.properties)) {
          if (!k.startsWith('__')) propKeys.add(k);
        }
      }
    }

    types.push({
      type: data.component_type,
      property_columns: mergePropertyColumns(
        [...propKeys].sort(),
        resolveDeclaredComponentPropertyColumns({
          fieldRules,
          componentType: data.component_type,
        })
      ),
      item_count: data.items.length,
    });
  }

  return { category, types };
}

export async function buildComponentReviewPayloadsLegacy({ config = {}, category, componentType, specDb = null, fieldRules = null }) {
  const helperRoot = path.resolve(config.categoryAuthorityRoot || 'category_authority');
  const dbDir = path.join(helperRoot, category, '_generated', 'component_db');
  const overrideDir = path.join(helperRoot, category, '_overrides', 'components');
  const files = await listJsonFiles(dbDir);

  let dbData = null;
  for (const f of files) {
    const data = await safeReadJson(path.join(dbDir, f));
    if (data?.component_type === componentType) { dbData = data; break; }
  }

  if (!dbData || !Array.isArray(dbData.items)) {
    return { category, componentType, items: [], metrics: { total: 0, avg_confidence: 0, flags: 0 } };
  }

  const dbGeneratedAt = dbData.generated_at || '';

  // Load overrides for this component type
  const overrides = {};
  const overrideFiles = await listJsonFiles(overrideDir);
  for (const of of overrideFiles) {
    if (of.startsWith(`${componentType}_`)) {
      const ovr = await safeReadJson(path.join(overrideDir, of));
      if (ovr?.name) overrides[ovr.name] = ovr;
    }
  }

  // Load identity observations for pipeline candidates on name/maker
  const identityPath = path.join(helperRoot, category, '_suggestions', 'component_identity.json');
  const identityDoc = await safeReadJson(identityPath);
  const identityObs = Array.isArray(identityDoc?.observations) ? identityDoc.observations : [];

  // Index identity observations by component_type + canonical_name
  const identityByComponent = new Map();
  for (const obs of identityObs) {
    if (obs.component_type !== componentType) continue;
    const name = (obs.canonical_name || '').trim();
    if (!name) continue;
    if (!identityByComponent.has(name)) identityByComponent.set(name, []);
    identityByComponent.get(name).push(obs);
  }

  // Load component_review.json for pipeline candidates (product_attributes)
  const reviewPath = path.join(helperRoot, category, '_suggestions', 'component_review.json');
  const reviewDoc = await safeReadJson(reviewPath);
  const reviewItems = Array.isArray(reviewDoc?.items) ? reviewDoc.items : [];

  // Index review items by component name (case-insensitive) for this component type
  // Includes both fuzzy_flagged (matched_component) and new_component (raw_query matches DB name)
  const dbNameLower = new Map(); // lowercase → actual DB name
  for (const dbItem of dbData.items) {
    dbNameLower.set((dbItem.name || '').toLowerCase(), dbItem.name);
  }
  const reviewByComponent = new Map(); // lowercase component name → review items[]
  for (const ri of reviewItems) {
    if (!isReviewItemCandidateVisible(ri)) continue;
    if (ri.component_type !== componentType) continue;
    // Match via matched_component (fuzzy_flagged) or raw_query (new_component matching DB name)
    let dbName = null;
    if (ri.matched_component) {
      const matched = String(ri.matched_component || '').trim();
      dbName = dbNameLower.get(matched.toLowerCase()) || matched;
    } else {
      const rawQuery = String(ri.raw_query || '').trim();
      dbName = dbNameLower.get(rawQuery.toLowerCase()) || rawQuery || null;
    }
    if (!dbName) continue;
    const componentKey = String(dbName).trim().toLowerCase();
    if (!componentKey) continue;
    if (!reviewByComponent.has(componentKey)) reviewByComponent.set(componentKey, []);
    reviewByComponent.get(componentKey).push(ri);
  }

  // Collect all property keys
  const allPropKeys = new Set();
  for (const item of dbData.items) {
    if (isObject(item.properties)) {
      for (const k of Object.keys(item.properties)) {
        if (!k.startsWith('__')) allPropKeys.add(k);
      }
    }
  }
  const propertyColumns = mergePropertyColumns(
    [...allPropKeys].sort(),
    resolveDeclaredComponentPropertyColumns({ fieldRules, componentType })
  );

  const items = [];

  for (const item of dbData.items) {
    const props = isObject(item.properties) ? item.properties : {};
    const variancePolicies = isObject(item.__variance_policies) ? item.__variance_policies : {};
    const constraints = isObject(item.__constraints) ? item.__constraints : {};
    const override = overrides[item.name] || null;

    // Identity overrides
    const nameOverride = override?.identity?.name;
    const makerOverride = override?.identity?.maker;
    const linksOverride = override?.identity?.links;
    const overrideTimestamps = isObject(override?.timestamps) ? override.timestamps : {};

    // Build tracked state for name
    const nameVal = nameOverride ?? item.name ?? '';
    const nameHasRaw = Boolean(item.name);
    const nameHasOverride = nameOverride !== undefined;
    // Generate reference candidate for name when value comes from component DB
    const nameRefCandidate = nameHasRaw ? [{
      candidate_id: buildReferenceComponentCandidateId({
        componentType,
        componentName: item.name,
        componentMaker: item.maker || '',
        propertyKey: '__name',
        value: item.name,
      }),
      value: item.name,
      score: 1.0,
      source_id: 'reference',
      source: 'Reference',
      tier: null,
      method: 'reference_data',
      evidence: {
        url: '',
        retrieved_at: dbGeneratedAt,
        snippet_id: '',
        snippet_hash: '',
        quote: `From reference database`,
        quote_span: null,
        snippet_text: `From reference database`,
        source_id: 'reference',
      },
    }] : [];

    const name_tracked = {
      selected: {
        value: nameVal,
        confidence: nameHasOverride ? 1.0 : nameHasRaw ? 1.0 : 0,
        status: nameHasOverride ? 'override' : nameHasRaw ? 'reference' : 'unknown',
        color: confidenceColor(nameHasOverride ? 1.0 : nameHasRaw ? 1.0 : 0, []),
      },
      needs_review: !nameHasRaw && !nameHasOverride,
      reason_codes: nameHasOverride ? ['manual_override'] : [],
      source: nameHasOverride ? 'user' : (nameHasRaw ? 'reference' : 'unknown'),
      source_timestamp: nameHasOverride ? (overrideTimestamps['__name'] || override?.updated_at || null) : null,
      variance_policy: null,
      constraints: [],
      overridden: nameHasOverride,
      candidate_count: nameRefCandidate.length,
      candidates: nameRefCandidate,
      accepted_candidate_id: null,
    };

    // Enrich name candidates with pipeline identity observations
    const nameObservations = identityByComponent.get(item.name) || [];
    if (nameObservations.length > 0) {
      const pipelineNameCandidate = {
        candidate_id: buildSyntheticComponentCandidateId({
          componentType,
          componentName: item.name,
          componentMaker: item.maker || '',
          propertyKey: '__name_identity',
          value: item.name,
        }),
        value: item.name,
        score: 1.0,
        source_id: 'pipeline',
        source: 'Pipeline (identity match)',
        tier: null,
        method: 'identity_observation',
        evidence: {
          url: '',
          retrieved_at: nameObservations[0].observed_at || '',
          snippet_id: '',
          snippet_hash: '',
          quote: `Matched ${nameObservations.length} time${nameObservations.length !== 1 ? 's' : ''} across products`,
          quote_span: null,
          snippet_text: `Resolved via ${nameObservations[0].match_type || 'exact'} match`,
          source_id: 'pipeline',
        },
      };
      // Avoid duplicating if reference candidate already present with same value
      if (!name_tracked.candidates.some((c) => c.value === pipelineNameCandidate.value && c.source_id === 'pipeline')) {
        name_tracked.candidates.push(pipelineNameCandidate);
        name_tracked.candidate_count = name_tracked.candidates.length;
      }
    }

    // Enrich name/maker candidates from component_review items (pipeline product extractions)
    // Keep one candidate per review item/source (no value-collapsing).
    const itemReviewItems = reviewByComponent.get(String(item.name || '').toLowerCase()) || [];
    const itemReviewAttribution = buildPipelineAttributionContext(itemReviewItems);
    if (itemReviewItems.length > 0) {
      const existingNameCandidateIds = new Set(name_tracked.candidates.map((candidate) => String(candidate?.candidate_id || '').trim()));
      for (const ri of itemReviewItems) {
        const val = (ri.raw_query || '').trim();
        if (!val) continue;
        const candidateId = buildComponentReviewSyntheticCandidateId({
          productId: ri.product_id || '',
          fieldKey: '__name',
          reviewId: ri.review_id || '',
          value: val,
        });
        if (existingNameCandidateIds.has(candidateId)) continue;
        existingNameCandidateIds.add(candidateId);
        const productLabel = String(ri.product_id || '').trim() || 'unknown_product';
        name_tracked.candidates.push(buildPipelineReviewCandidate({
          candidateId,
          value: val,
          reviewItem: ri,
          method: ri.match_type || 'component_review',
          quote: `Extracted from ${productLabel}${ri.review_id ? ` (${ri.review_id})` : ''}`,
          snippetText: `Component ${ri.match_type === 'fuzzy_flagged' ? 'fuzzy matched' : 'not found in DB'}`,
          attributionContext: itemReviewAttribution,
        }));
      }
      name_tracked.candidate_count = name_tracked.candidates.length;
    }

    // Build tracked state for maker
    const makerVal = makerOverride ?? item.maker ?? '';
    const makerHasRaw = Boolean(item.maker);
    const makerHasOverride = makerOverride !== undefined;
    // Generate reference candidate for maker when value comes from component DB
    const makerRefCandidate = makerHasRaw ? [{
      candidate_id: buildReferenceComponentCandidateId({
        componentType,
        componentName: item.name,
        componentMaker: item.maker || '',
        propertyKey: '__maker',
        value: item.maker,
      }),
      value: item.maker,
      score: 1.0,
      source_id: 'reference',
      source: 'Reference',
      tier: null,
      method: 'reference_data',
      evidence: {
        url: '',
        retrieved_at: dbGeneratedAt,
        snippet_id: '',
        snippet_hash: '',
        quote: `From reference database`,
        quote_span: null,
        snippet_text: `From reference database`,
        source_id: 'reference',
      },
    }] : [];

    const maker_tracked = {
      selected: {
        value: makerVal,
        confidence: makerHasOverride ? 1.0 : makerHasRaw ? 1.0 : 0,
        status: makerHasOverride ? 'override' : makerHasRaw ? 'reference' : 'unknown',
        color: confidenceColor(makerHasOverride ? 1.0 : makerHasRaw ? 1.0 : 0, []),
      },
      needs_review: !makerHasRaw && !makerHasOverride,
      reason_codes: makerHasOverride ? ['manual_override'] : [],
      source: makerHasOverride ? 'user' : (makerHasRaw ? 'reference' : 'unknown'),
      source_timestamp: makerHasOverride ? (overrideTimestamps['__maker'] || override?.updated_at || null) : null,
      variance_policy: null,
      constraints: [],
      overridden: makerHasOverride,
      candidate_count: makerRefCandidate.length,
      candidates: makerRefCandidate,
      accepted_candidate_id: null,
    };

    // Enrich maker candidates from pipeline product_attributes (e.g. sensor_brand, switch_brand)
    if (itemReviewItems.length > 0) {
      const brandKey = `${componentType}_brand`;
      const existingMakerCandidateIds = new Set(maker_tracked.candidates.map((candidate) => String(candidate?.candidate_id || '').trim()));
      for (const ri of itemReviewItems) {
        const attrs = isObject(ri.product_attributes) ? ri.product_attributes : {};
        const makerFromPipeline = attrs[brandKey] || attrs.ai_suggested_maker || ri.ai_suggested_maker;
        if (!makerFromPipeline) continue;
        for (const val of splitCandidateParts(makerFromPipeline)) {
          const candidateId = buildComponentReviewSyntheticCandidateId({
            productId: ri.product_id || '',
            fieldKey: '__maker',
            reviewId: ri.review_id || '',
            value: val,
          });
          if (existingMakerCandidateIds.has(candidateId)) continue;
          existingMakerCandidateIds.add(candidateId);
          const productLabel = String(ri.product_id || '').trim() || 'unknown_product';
          maker_tracked.candidates.push(buildPipelineReviewCandidate({
            candidateId,
            value: val,
            reviewItem: ri,
            method: 'product_extraction',
            quote: `Extracted ${brandKey}="${val}" from ${productLabel}${ri.review_id ? ` (${ri.review_id})` : ''}`,
            snippetText: 'Pipeline extraction from product runs',
            attributionContext: itemReviewAttribution,
          }));
        }
      }
      maker_tracked.candidate_count = maker_tracked.candidates.length;
    }

    // Build tracked state for links
    const effectiveLinks = linksOverride ?? toArray(item.links);
    const linksTimestamp = linksOverride ? (overrideTimestamps['__links'] || override?.updated_at || null) : null;
    const links_tracked = effectiveLinks.map((url) => ({
      selected: {
        value: url,
        confidence: linksOverride ? 1.0 : 1.0,
        status: linksOverride ? 'override' : 'reference',
        color: confidenceColor(linksOverride ? 1.0 : 1.0, []),
      },
      needs_review: false,
      reason_codes: linksOverride ? ['manual_override'] : [],
      source: linksOverride ? 'user' : 'reference',
      source_timestamp: linksTimestamp,
      overridden: Boolean(linksOverride),
    }));

    const properties = {};
    let itemPropCount = 0;
    let itemFlags = 0;

    for (const key of propertyColumns) {
      const rawValue = props[key];
      const hasRawValue = rawValue !== undefined && rawValue !== null && rawValue !== '' && rawValue !== '-';
      const overrideValue = override?.properties?.[key];
      const hasOverride = overrideValue !== undefined;
      const value = hasOverride ? overrideValue : rawValue;
      const variance = variancePolicies[key] || null;
      const fieldConstraints = toArray(constraints[key]);

      // Confidence + source based on provenance
      // Source reflects ORIGINAL provenance (never 'override') — the overridden flag handles user actions
      let confidence, source;
      if (hasOverride) {
        confidence = 1.0;
        source = 'user';
      } else if (hasRawValue) {
        confidence = 1.0;
        source = 'reference';
      } else {
        confidence = 0;
        source = 'unknown';
      }

      const needsReview = !hasRawValue && !hasOverride;
      if (needsReview) itemFlags++;

      // Build reason codes (matches reviewGridData.js pattern)
      const reasonCodes = [];
      if (needsReview) reasonCodes.push('missing_value');
      if (hasOverride) reasonCodes.push('manual_override');
      for (const c of fieldConstraints) reasonCodes.push(`constraint:${c}`);

      // Generate reference candidate when value comes from component DB
      const refCandidate = hasRawValue ? [{
        candidate_id: buildReferenceComponentCandidateId({
          componentType,
          componentName: item.name,
          componentMaker: item.maker || '',
          propertyKey: key,
          value: rawValue,
        }),
        value: rawValue,
        score: 1.0,
        source_id: 'reference',
        source: 'Reference',
        tier: null,
        method: 'reference_data',
        evidence: {
          url: '',
          retrieved_at: dbGeneratedAt,
          snippet_id: '',
          snippet_hash: '',
          quote: `From reference database`,
          quote_span: null,
          snippet_text: `From reference database`,
          source_id: 'reference',
        },
      }] : [];

      properties[key] = {
        selected: {
          value: value ?? null,
          confidence,
          status: source,
          color: confidenceColor(confidence, reasonCodes),
        },
        needs_review: needsReview,
        reason_codes: reasonCodes,
        source,
        source_timestamp: hasOverride ? (overrideTimestamps[key] || override?.updated_at || null) : null,
        variance_policy: variance,
        constraints: fieldConstraints,
        overridden: hasOverride,
        candidate_count: refCandidate.length,
        candidates: refCandidate,
        accepted_candidate_id: null,
      };

      itemPropCount++;
    }

    // Enrich property candidates from pipeline product_attributes (per review item/source).
    if (itemReviewItems.length > 0) {
      for (const key of propertyColumns) {
        const prop = properties[key];
        if (!prop) continue;
        const existingPropCandidateIds = new Set(prop.candidates.map((candidate) => String(candidate?.candidate_id || '').trim()));
        for (const ri of itemReviewItems) {
          const attrs = isObject(ri.product_attributes) ? ri.product_attributes : {};
          const pipelineVal = attrs[key];
          if (pipelineVal === undefined || pipelineVal === null || pipelineVal === '') continue;
          for (const valStr of splitCandidateParts(pipelineVal)) {
            const candidateId = buildComponentReviewSyntheticCandidateId({
              productId: ri.product_id || '',
              fieldKey: key,
              reviewId: ri.review_id || '',
              value: valStr,
            });
            if (existingPropCandidateIds.has(candidateId)) continue;
            existingPropCandidateIds.add(candidateId);
            const productLabel = String(ri.product_id || '').trim() || 'unknown_product';
            prop.candidates.push(buildPipelineReviewCandidate({
              candidateId,
              value: valStr,
              reviewItem: ri,
              method: 'product_extraction',
              quote: `Extracted ${key}="${valStr}" from ${productLabel}${ri.review_id ? ` (${ri.review_id})` : ''}`,
              snippetText: 'Pipeline extraction from product runs',
              attributionContext: itemReviewAttribution,
            }));
          }
        }
        prop.candidate_count = prop.candidates.length;
      }
    }

    // ── SpecDb enrichment: product-level candidates from SQLite ──────
    let linkedProducts = [];
    if (specDb) {
      try {
        const linkRows = specDb.getProductsForComponent(componentType, item.name, item.maker || '');
        const productIds = linkRows.map(r => r.product_id);
        linkedProducts = linkRows.map(r => ({
          product_id: r.product_id,
          field_key: r.field_key,
          match_type: r.match_type || 'exact',
          match_score: r.match_score ?? null,
        }));

        if (productIds.length > 0) {
          // Determine field_key for name from link rows (e.g. 'sensor')
          const linkFieldKey = linkRows[0]?.field_key || componentType;
          const brandFieldKey = `${componentType}_brand`;

          // --- Name candidates from SpecDb ---
          const nameCandRows = specDb.getCandidatesForComponentProperty(componentType, item.name, item.maker || '', linkFieldKey);
          if (nameCandRows.length > 0) {
            const nameByVal = new Map();
            for (const c of nameCandRows) {
              const v = (c.value || '').trim();
              if (!v) continue;
              if (!nameByVal.has(v)) nameByVal.set(v, { rows: [], count: 0 });
              const entry = nameByVal.get(v);
              entry.rows.push(c);
              entry.count++;
            }
            const existingNameVals = new Set(name_tracked.candidates.map(c => c.value));
            for (const [val, meta] of nameByVal) {
              if (existingNameVals.has(val)) continue;
              const best = meta.rows[0];
              const count = meta.count;
              name_tracked.candidates.push({
                candidate_id: `specdb_${componentType}_${componentLaneSlug(item.name, item.maker || '')}_name_${slugify(val)}`,
                value: val,
                score: best.score ?? 0,
                source_id: 'specdb',
                source: `${best.source_host || 'SpecDb'} (${count} product${count !== 1 ? 's' : ''})`,
                tier: best.source_tier ?? null,
                method: best.source_method || 'specdb_lookup',
                evidence: {
                  url: best.evidence_url || best.source_url || '',
                  snippet_id: best.snippet_id || '',
                  snippet_hash: best.snippet_hash || '',
                  quote: best.quote || '',
                  snippet_text: best.snippet_text || '',
                  source_id: 'specdb',
                },
              });
            }
            name_tracked.candidate_count = name_tracked.candidates.length;
          }

          // --- Maker candidates from SpecDb ---
          const makerCandRows = specDb.getCandidatesForComponentProperty(componentType, item.name, item.maker || '', brandFieldKey);
          if (makerCandRows.length > 0) {
            const makerByVal = new Map();
            for (const c of makerCandRows) {
              const v = (c.value || '').trim();
              if (!v) continue;
              if (!makerByVal.has(v)) makerByVal.set(v, { rows: [], count: 0 });
              const entry = makerByVal.get(v);
              entry.rows.push(c);
              entry.count++;
            }
            const existingMakerVals = new Set(maker_tracked.candidates.map(c => c.value));
            for (const [val, meta] of makerByVal) {
              if (existingMakerVals.has(val)) continue;
              const best = meta.rows[0];
              const count = meta.count;
              maker_tracked.candidates.push({
                candidate_id: `specdb_${componentType}_${componentLaneSlug(item.name, item.maker || '')}_maker_${slugify(val)}`,
                value: val,
                score: best.score ?? 0,
                source_id: 'specdb',
                source: `${best.source_host || 'SpecDb'} (${count} product${count !== 1 ? 's' : ''})`,
                tier: best.source_tier ?? null,
                method: best.source_method || 'specdb_lookup',
                evidence: {
                  url: best.evidence_url || best.source_url || '',
                  snippet_id: best.snippet_id || '',
                  snippet_hash: best.snippet_hash || '',
                  quote: best.quote || '',
                  snippet_text: best.snippet_text || '',
                  source_id: 'specdb',
                },
              });
            }
            maker_tracked.candidate_count = maker_tracked.candidates.length;
          }

          // --- Property candidates from SpecDb (key = field_key, 1:1 mapping) ---
          for (const key of propertyColumns) {
            const prop = properties[key];
            if (!prop) continue;
            const propCandRows = specDb.getCandidatesForComponentProperty(componentType, item.name, item.maker || '', key);
            if (propCandRows.length > 0) {
              const propByVal = new Map();
              for (const c of propCandRows) {
                const v = (c.value || '').trim();
                if (!v) continue;
                if (!propByVal.has(v)) propByVal.set(v, { rows: [], count: 0 });
                const entry = propByVal.get(v);
                entry.rows.push(c);
                entry.count++;
              }
              const existingPropVals = new Set(prop.candidates.map(c => String(c.value)));
              for (const [val, meta] of propByVal) {
                if (existingPropVals.has(val)) continue;
                const best = meta.rows[0];
                const count = meta.count;
                prop.candidates.push({
                  candidate_id: `specdb_${componentType}_${componentLaneSlug(item.name, item.maker || '')}_${key}_${slugify(val)}`,
                  value: val,
                  score: best.score ?? 0,
                  source_id: 'specdb',
                  source: `${best.source_host || 'SpecDb'} (${count} product${count !== 1 ? 's' : ''})`,
                  tier: best.source_tier ?? null,
                  method: best.source_method || 'specdb_lookup',
                  evidence: {
                    url: best.evidence_url || best.source_url || '',
                    snippet_id: best.snippet_id || '',
                    snippet_hash: best.snippet_hash || '',
                    quote: best.quote || '',
                    snippet_text: best.snippet_text || '',
                    source_id: 'specdb',
                  },
                });
              }
              prop.candidate_count = prop.candidates.length;
            }
          }

          // --- Variance evaluation ---
          for (const key of propertyColumns) {
            const prop = properties[key];
            if (!prop) continue;
            const policy = prop.variance_policy;
            if (!policy || policy === 'override_allowed') continue;
            const dbValue = prop.selected?.value;
            if (dbValue == null) continue;
            const fieldStates = specDb.getItemFieldStateForProducts(productIds, [key]);
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
        }
      } catch (_specDbErr) {
        // SpecDb enrichment is best-effort — don't break the drawer
      }
    }
    if (linkedProducts.length === 0 && itemReviewAttribution.productIds.length > 0) {
      linkedProducts = itemReviewAttribution.productIds.map((productId) => ({
        product_id: productId,
        field_key: componentType,
        match_type: 'pipeline_review',
        match_score: null,
      }));
    }

    ensureTrackedStateCandidateInvariant(name_tracked, {
      fallbackCandidateId: `component_${slugify(componentType)}_${componentLaneSlug(item.name, item.maker || '')}_name`,
      fallbackQuote: `Selected ${componentType} name retained for authoritative review`,
    });
    ensureTrackedStateCandidateInvariant(maker_tracked, {
      fallbackCandidateId: `component_${slugify(componentType)}_${componentLaneSlug(item.name, item.maker || '')}_maker`,
      fallbackQuote: `Selected ${componentType} maker retained for authoritative review`,
    });
    for (const key of propertyColumns) {
      const prop = properties[key];
      if (!prop) continue;
      ensureTrackedStateCandidateInvariant(prop, {
        fallbackCandidateId: `component_${slugify(componentType)}_${componentLaneSlug(item.name, item.maker || '')}_${slugify(key)}`,
        fallbackQuote: `Selected ${key} retained for authoritative review`,
      });
    }

    const confidenceValues = propertyColumns
      .map((key) => Number.parseFloat(String(properties[key]?.selected?.confidence ?? '')))
      .filter((value) => Number.isFinite(value));
    const avgConf = confidenceValues.length > 0
      ? confidenceValues.reduce((sum, value) => sum + value, 0) / confidenceValues.length
      : 0;
    const aliasOverride = override?.identity?.aliases;
    const effectiveAliases = aliasOverride ?? toArray(item.aliases);
    const aliasesOverridden = Boolean(aliasOverride);
    const resolvedName = nameVal || item.name || '';
    const resolvedMaker = makerVal || item.maker || '';
    const legacyIdentity = specDb
      ? specDb.getComponentIdentity(componentType, resolvedName, resolvedMaker)
      : null;
    const identitySource = String(legacyIdentity?.source || 'component_db').trim();

    items.push({
      component_identity_id: legacyIdentity?.id ?? null,
      name: resolvedName,
      maker: resolvedMaker,
      aliases: effectiveAliases,
      aliases_overridden: aliasesOverridden,
      links: effectiveLinks,
      name_tracked,
      maker_tracked,
      links_tracked,
      properties,
      linked_products: linkedProducts,
      review_status: override?.review_status || 'pending',
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
    if (isTestModeCategory(category) && item.discovered && linkedCount === 0) {
      return false;
    }
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
