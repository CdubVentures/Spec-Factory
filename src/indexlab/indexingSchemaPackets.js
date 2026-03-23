import { toInt } from '../shared/valueNormalizers.js';
import {
  sha256, toIso, clamp01, hasKnownValue, firstKnownValue,
  normalizeHost, rootDomainFromHost, unitForField, inferValueType, tryNormalizeValue,
} from './schemaPacketValueHelpers.js';
import {
  IDENTITY_FIELDS, requiredLevelForField, parseTierWeight,
  makeTargetMatch, makeCandidateRows, topFieldKeysByNeedSet,
} from './schemaPacketFieldHelpers.js';
import { buildSourcePacket, buildFallbackSourcePacket } from './schemaPacketSourceBuilder.js';
import {
  PHASE_IDS,
  phaseFromMethod,
  sourceSurfaceFromMethod,
  normalizeFetchStatus,
  blockedReasonForStatus,
  defaultPhaseLineage,
  emptyRunPhaseSummary,
} from './schemaPacketPhaseResolvers.js';

// WHY: IDENTITY_FIELDS, requiredLevelForField, parseTierWeight, makeTargetMatch,
// makeCandidateRows, topFieldKeysByNeedSet extracted to schemaPacketFieldHelpers.js.
// WHY: buildSourcePacket, buildFallbackSourcePacket extracted to schemaPacketSourceBuilder.js.

function buildItemPacket({
  runId,
  category,
  productId,
  sourcePackets = [],
  sourceAssertionRefs = [],
  categoryConfig = {},
  normalized = {},
  provenance = {},
  needSet = {},
  nowIso
}) {
  const itemPacketId = `sha256:${sha256(`${category}|${productId}`)}`;
  const sourcePacketRefs = sourcePackets.map((packet) => ({
    source_packet_id: packet.source_packet_id,
    source_id: packet.source_id,
    canonical_url: packet.canonical_url,
    source_version_id: packet.source_version_id,
    content_hash: packet.content_hash,
    source_tier: packet?.source_metadata?.source_tier ?? null,
    doc_kind: packet?.source_metadata?.doc_kind ?? null,
    run_id: packet?.run_meta?.run_id || runId
  }));

  const byField = new Map();
  for (const row of sourceAssertionRefs) {
    const fieldKey = String(row?.field_key || '').trim();
    if (!fieldKey) continue;
    if (!byField.has(fieldKey)) byField.set(fieldKey, []);
    byField.get(fieldKey).push(row);
  }

  const fieldSourceIndex = {};
  const fieldKeyMap = {};
  const candidateRows = [];
  const stateRows = [];
  const reviewRows = [];
  let syntheticIdCounter = 1;

  for (const [fieldKey, refs] of byField.entries()) {
    const sortedRefs = [...refs].sort((a, b) => (b.parser_score || 0) - (a.parser_score || 0));
    const itemCandidates = sortedRefs.map((row) => {
      const itemCandidateId = `item_cand_${sha256(`${itemPacketId}|${row.assertion_id}`).slice(0, 16)}`;
      candidateRows.push({
        candidate_id: row.assertion_id || `cand_${syntheticIdCounter++}`,
        category,
        product_id: productId,
        field_key: fieldKey,
        value: row.value_raw,
        normalized_value: row.value_normalized,
        score: clamp01(row.parser_score, 0.7),
        rank: null,
        source_url: row.canonical_url || null,
        source_host: row.source_id ? String(row.source_id).replace(/_/g, '.') : null,
        source_root_domain: row.source_id ? String(row.source_id).replace(/_/g, '.') : null,
        source_tier: row.source_tier ?? null,
        source_method: null,
        snippet_id: row.evidence_id || null,
        snippet_hash: null,
        snippet_text: null,
        quote: null,
        evidence_url: row.canonical_url || null,
        evidence_retrieved_at: nowIso,
        is_component_field: false,
        component_type: null,
        is_list_field: false,
        run_id: runId
      });
      return {
        item_candidate_id: itemCandidateId,
        source_packet_id: row.source_packet_id,
        source_version_id: row.source_version_id,
        source_id: row.source_id,
        assertion_id: row.assertion_id,
        candidate_id: row.assertion_id,
        field_key: fieldKey,
        context_kind: 'scalar',
        value_raw: row.value_raw,
        value_normalized: row.value_normalized,
        unit: row.unit ?? null,
        confidence: clamp01(row.parser_score, 0.7),
        parser_score: clamp01(row.parser_score, 0.7),
        target_match: {
          page_product_cluster_id: 'cluster_main_product',
          target_match_score: clamp01(row.target_match_score, 0.9),
          target_match_passed: clamp01(row.target_match_score, 0.9) >= 0.5
        },
        suggested_start_rank: null,
        ambiguity: {
          level: row.ambiguity_level || 'low',
          score: clamp01(row.ambiguity_score, 0.08)
        },
        evidence_refs: [
          {
            source_packet_id: row.source_packet_id,
            evidence_id: row.evidence_id
          }
        ]
      };
    });

    if (itemCandidates.length === 0) {
      continue;
    }

    const selected = itemCandidates[0];
    const distinctSourceCount = new Set(itemCandidates.map((row) => row.source_id).filter(Boolean)).size;
    const maxAmbiguity = Math.max(...itemCandidates.map((row) => clamp01(row?.ambiguity?.score, 0.08)));
    const ambiguityLevel = maxAmbiguity >= 0.75 ? 'high' : maxAmbiguity >= 0.35 ? 'medium' : 'low';

    fieldKeyMap[fieldKey] = {
      field_key: fieldKey,
      field_key_id: `sha256:${sha256(`${itemPacketId}|${fieldKey}`)}`,
      field_meta: {
        field_key: fieldKey,
        shape: 'scalar',
        required_level: requiredLevelForField(fieldKey, categoryConfig),
        unit_expected: unitForField(fieldKey),
        component_type: null,
        enum_source: null
      },
      contexts: [
        {
          field_instance_id: `fi_${sha256(`${itemPacketId}|grid_key|${fieldKey}`).slice(0, 16)}`,
          context_kind: 'scalar',
          context_ref: null,
          target_kind: 'grid_key',
          selected_candidate_id: selected.item_candidate_id,
          candidates: itemCandidates
        }
      ],
      field_metrics: {
        candidate_count: itemCandidates.length,
        distinct_source_count: distinctSourceCount,
        ambiguity_level: ambiguityLevel,
        ambiguity_score: maxAmbiguity,
        has_conflict: itemCandidates.length > 1
      }
    };

    const bySource = new Map();
    for (const candidate of itemCandidates) {
      const key = `${candidate.source_packet_id}|${candidate.source_id}`;
      if (!bySource.has(key)) {
        bySource.set(key, {
          source_packet_id: candidate.source_packet_id,
          source_version_id: candidate.source_version_id,
          source_id: candidate.source_id,
          canonical_url: sourcePacketRefs.find((row) => row.source_packet_id === candidate.source_packet_id)?.canonical_url || '',
          source_tier: sourcePacketRefs.find((row) => row.source_packet_id === candidate.source_packet_id)?.source_tier ?? null,
          assertion_ids: [],
          evidence_ids: [],
          best_parser_score: null,
          best_target_match_score: 0,
          ambiguity_level: 'low',
          ambiguity_score: 0.08
        });
      }
      const entry = bySource.get(key);
      entry.assertion_ids.push(candidate.assertion_id);
      for (const ref of candidate.evidence_refs || []) {
        entry.evidence_ids.push(ref.evidence_id);
      }
      const parser = clamp01(candidate.parser_score, 0.7);
      entry.best_parser_score = entry.best_parser_score === null ? parser : Math.max(entry.best_parser_score, parser);
      entry.best_target_match_score = Math.max(entry.best_target_match_score, clamp01(candidate?.target_match?.target_match_score, 0));
      const ambScore = clamp01(candidate?.ambiguity?.score, 0.08);
      if (ambScore > entry.ambiguity_score) {
        entry.ambiguity_score = ambScore;
        entry.ambiguity_level = ambScore >= 0.75 ? 'high' : ambScore >= 0.35 ? 'medium' : 'low';
      }
    }

    fieldSourceIndex[fieldKey] = {
      field_key: fieldKey,
      sources: [...bySource.values()].map((row) => ({
        ...row,
        assertion_ids: [...new Set(row.assertion_ids)],
        evidence_ids: [...new Set(row.evidence_ids)]
      })),
      source_count: bySource.size,
      best_parser_score: Math.max(...itemCandidates.map((row) => clamp01(row.parser_score, 0.7)))
    };

    const normalizedValue = normalized?.fields?.[fieldKey];
    const selectedValue = hasKnownValue(normalizedValue) ? normalizedValue : selected.value_normalized;
    const confidence = clamp01(provenance?.[fieldKey]?.confidence, clamp01(selected?.parser_score, 0.7));
    const candidateId = selected.candidate_id || selected.assertion_id;
    stateRows.push({
      id: null,
      category,
      product_id: productId,
      field_key: fieldKey,
      value: selectedValue,
      confidence,
      source: 'pipeline',
      accepted_candidate_id: candidateId,
      overridden: false,
      needs_ai_review: true,
      ai_review_complete: false
    });
    reviewRows.push({
      id: null,
      category,
      target_kind: 'grid_key',
      item_identifier: productId,
      field_key: fieldKey,
      enum_value_norm: null,
      component_identifier: null,
      property_key: null,
      item_field_state_id: null,
      component_value_id: null,
      list_value_id: null,
      enum_list_id: null,
      selected_value: selectedValue,
      selected_candidate_id: candidateId,
      confidence_score: confidence,
      ai_confirm_primary_status: null,
      ai_confirm_primary_confidence: null,
      ai_confirm_shared_status: null,
      ai_confirm_shared_confidence: null,
      user_accept_primary_status: null,
      user_accept_shared_status: null,
      user_override_ai_primary: false,
      user_override_ai_shared: false
    });
  }

  if (candidateRows.length === 0) {
    const fallbackField = 'model';
    const fallbackValue = String(normalized?.identity?.model || normalized?.fields?.model || productId).trim();
    const fallbackSource = sourcePacketRefs[0];
    const fallbackCandidateId = `cand_${sha256(`${itemPacketId}|fallback|${fallbackField}`).slice(0, 16)}`;
    candidateRows.push({
      candidate_id: fallbackCandidateId,
      category,
      product_id: productId,
      field_key: fallbackField,
      value: fallbackValue,
      normalized_value: fallbackValue,
      score: 1,
      rank: 1,
      source_url: fallbackSource?.canonical_url || null,
      source_host: null,
      source_root_domain: null,
      source_tier: fallbackSource?.source_tier ?? null,
      source_method: 'fallback',
      snippet_id: null,
      snippet_hash: null,
      snippet_text: null,
      quote: null,
      evidence_url: fallbackSource?.canonical_url || null,
      evidence_retrieved_at: nowIso,
      is_component_field: false,
      component_type: null,
      is_list_field: false,
      run_id: runId
    });
    stateRows.push({
      id: null,
      category,
      product_id: productId,
      field_key: fallbackField,
      value: fallbackValue,
      confidence: 1,
      source: 'pipeline',
      accepted_candidate_id: fallbackCandidateId,
      overridden: false,
      needs_ai_review: true,
      ai_review_complete: false
    });
    reviewRows.push({
      id: null,
      category,
      target_kind: 'grid_key',
      item_identifier: productId,
      field_key: fallbackField,
      enum_value_norm: null,
      component_identifier: null,
      property_key: null,
      item_field_state_id: null,
      component_value_id: null,
      list_value_id: null,
      enum_list_id: null,
      selected_value: fallbackValue,
      selected_candidate_id: fallbackCandidateId,
      confidence_score: 1,
      ai_confirm_primary_status: null,
      ai_confirm_primary_confidence: null,
      ai_confirm_shared_status: null,
      ai_confirm_shared_confidence: null,
      user_accept_primary_status: null,
      user_accept_shared_status: null,
      user_override_ai_primary: false,
      user_override_ai_shared: false
    });
  }

  const knownFieldCount = Object.values(normalized?.fields || {}).filter((value) => hasKnownValue(value)).length;
  const totalFieldCount = Array.isArray(categoryConfig?.fieldOrder) && categoryConfig.fieldOrder.length > 0
    ? categoryConfig.fieldOrder.length
    : Object.keys(normalized?.fields || {}).length;
  const required = new Set(Array.isArray(categoryConfig?.requiredFields) ? categoryConfig.requiredFields : []);
  const critical = categoryConfig?.criticalFieldSet instanceof Set
    ? categoryConfig.criticalFieldSet
    : new Set(Array.isArray(categoryConfig?.schema?.critical_fields) ? categoryConfig.schema.critical_fields : []);
  const requiredKnown = [...required].filter((field) => hasKnownValue(normalized?.fields?.[field])).length;
  const criticalKnown = [...critical].filter((field) => hasKnownValue(normalized?.fields?.[field])).length;
  const priorityFieldKeys = topFieldKeysByNeedSet(needSet, Object.keys(fieldKeyMap));

  return {
    schema_version: '2026-02-20.item-indexing-extraction-packet.v1',
    record_kind: 'item_indexing_extraction_packet',
    item_packet_id: itemPacketId,
    category,
    item_identifier: productId,
    product_id: productId,
    generated_at: nowIso,
    run_scope: {
      current_run_id: runId,
      included_run_ids: [runId]
    },
    item_identity: {
      brand: String(normalized?.identity?.brand || '').trim() || null,
      model: String(normalized?.identity?.model || '').trim() || null,
      variant: String(normalized?.identity?.variant || '').trim() || null,
      sku: String(normalized?.identity?.sku || '').trim() || null
    },
    source_packet_refs: sourcePacketRefs,
    field_source_index: fieldSourceIndex,
    field_key_map: fieldKeyMap,
    coverage_summary: {
      field_count: totalFieldCount,
      known_field_count: knownFieldCount,
      required_coverage: `${requiredKnown}/${required.size}`,
      critical_coverage: `${criticalKnown}/${critical.size}`
    },
    indexing_projection: {
      retrieval_ready: candidateRows.length > 0,
      candidate_chunk_count: candidateRows.length,
      priority_field_keys: priorityFieldKeys,
      token_estimate_total: candidateRows.length * 60
    },
    sql_projection: {
      item_field_state_rows: stateRows,
      candidate_rows: candidateRows,
      key_review_state_rows: reviewRows
    }
  };
}

function buildRunMetaPacket({
  runId,
  category,
  startedAt,
  finishedAt,
  durationMs,
  sourcePackets = [],
  itemPacket,
  summary = {},
  phase08Extraction = {}
}) {
  const phaseSummary = emptyRunPhaseSummary();
  let assertionTotal = 0;
  let evidenceTotal = 0;
  let targetRejectedEvidence = 0;
  let sourceFetched = 0;
  let sourceFailed = 0;

  for (const packet of sourcePackets) {
    const fetchStatus = String(packet?.run_meta?.fetch_status || '').trim();
    if (fetchStatus === 'fetched') sourceFetched += 1;
    else sourceFailed += 1;

    const evidenceRows = Object.values(packet?.evidence_index || {});
    const assertions = [];
    for (const bundle of Object.values(packet?.field_key_map || {})) {
      const contexts = Array.isArray(bundle?.contexts) ? bundle.contexts : [];
      for (const context of contexts) {
        const rows = Array.isArray(context?.assertions) ? context.assertions : [];
        assertions.push(...rows);
      }
    }
    assertionTotal += assertions.length;
    evidenceTotal += evidenceRows.length;
    targetRejectedEvidence += evidenceRows.filter((row) => row?.target_match?.target_match_passed === false).length;

    const stats = packet?.parser_execution?.phase_stats && typeof packet.parser_execution.phase_stats === 'object'
      ? packet.parser_execution.phase_stats
      : {};
    for (const phaseId of PHASE_IDS) {
      const row = stats[phaseId];
      if (!row) continue;
      phaseSummary[phaseId].executed_sources += row.executed ? 1 : 0;
      phaseSummary[phaseId].assertion_count += toInt(row.assertion_count, 0);
      phaseSummary[phaseId].evidence_count += toInt(row.evidence_count, 0);
      phaseSummary[phaseId].error_count += toInt(row.error_count, 0);
      phaseSummary[phaseId].duration_ms += toInt(row.duration_ms, 0);
    }
  }

  const sourceTotal = sourcePackets.length;
  const coverageRatio = clamp01(summary?.completeness_required ?? summary?.coverage_overall, 0);
  const errorRatio = sourceTotal > 0 ? sourceFailed / sourceTotal : 0;
  const targetMatchPassRatio = evidenceTotal > 0 ? (evidenceTotal - targetRejectedEvidence) / evidenceTotal : 1;

  return {
    schema_version: '2026-02-20.run-meta-packet.v1',
    record_kind: 'run_meta_packet',
    run_packet_id: `sha256:${sha256(`${runId}|${category}`)}`,
    run_id: runId,
    category,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: Math.max(0, toInt(durationMs, 0)),
    trigger: 'manual',
    execution_summary: {
      item_total: 1,
      item_succeeded: summary?.validated ? 1 : 0,
      item_partial: summary?.validated ? 0 : 1,
      item_failed: 0,
      source_total: sourceTotal,
      source_fetched: sourceFetched,
      source_failed: sourceFailed,
      assertion_total: assertionTotal,
      evidence_total: evidenceTotal,
      identity_rejected_evidence_total: targetRejectedEvidence
    },
    phase_summary: phaseSummary,
    output_refs: {
      source_packet_refs: sourcePackets.map((packet) => ({
        source_packet_id: packet.source_packet_id,
        source_version_id: packet.source_version_id,
        source_id: packet.source_id
      })),
      item_packet_refs: [
        {
          item_packet_id: itemPacket.item_packet_id,
          item_identifier: itemPacket.item_identifier
        }
      ],
      manifest_paths: [],
      visual_manifest_paths: []
    },
    quality_gates: {
      coverage_gate_passed: coverageRatio >= 0.5,
      evidence_gate_passed: evidenceTotal > 0,
      error_rate_gate_passed: errorRatio <= 0.5,
      target_match_gate_passed: targetMatchPassRatio >= 0.5,
      target_match_pass_ratio: Number(targetMatchPassRatio.toFixed(6)),
      coverage_ratio: Number(coverageRatio.toFixed(6)),
      error_ratio: Number(errorRatio.toFixed(6))
    },
    pipeline_config: {
      phase08_batch_count: toInt(phase08Extraction?.summary?.batch_count, 0)
    }
  };
}

export function buildIndexingSchemaPackets({
  runId = '',
  category = '',
  productId = '',
  startMs = 0,
  summary = {},
  categoryConfig = {},
  sourceResults = [],
  normalized = {},
  provenance = {},
  needSet = {},
  phase08Extraction = {}
} = {}) {
  const nowIso = toIso(summary?.generated_at || new Date().toISOString());
  const startedAt = Number.isFinite(Number(startMs)) && Number(startMs) > 0
    ? new Date(Number(startMs)).toISOString()
    : nowIso;
  const durationMs = Math.max(0, toInt(summary?.duration_ms, 0));
  const finishedAt = durationMs > 0
    ? new Date(Date.parse(startedAt) + durationMs).toISOString()
    : nowIso;

  const sourcePackets = [];
  const sourceAssertionRefs = [];
  for (const source of Array.isArray(sourceResults) ? sourceResults : []) {
    const built = buildSourcePacket({
      source,
      runId,
      category,
      productId,
      categoryConfig,
      nowIso
    });
    if (!built?.packet) continue;
    sourcePackets.push(built.packet);
    sourceAssertionRefs.push(...(built.assertionRefs || []));
  }

  if (sourcePackets.length === 0) {
    const fallback = buildFallbackSourcePacket({
      runId,
      category,
      productId,
      nowIso,
      normalized,
      categoryConfig
    });
    if (fallback?.packet) {
      sourcePackets.push(fallback.packet);
      sourceAssertionRefs.push(...(fallback.assertionRefs || []));
    }
  }

  const itemPacket = buildItemPacket({
    runId,
    category,
    productId,
    sourcePackets,
    sourceAssertionRefs,
    categoryConfig,
    normalized,
    provenance,
    needSet,
    nowIso
  });

  const runMetaPacket = buildRunMetaPacket({
    runId,
    category,
    startedAt,
    finishedAt,
    durationMs,
    sourcePackets,
    itemPacket,
    summary,
    phase08Extraction
  });

  const sourceCollection = {
    schema_version: '2026-02-20.source-indexing-extraction-packet.collection.v1',
    record_kind: 'source_indexing_extraction_packet_collection',
    run_id: runId,
    category,
    item_identifier: productId,
    generated_at: nowIso,
    source_packet_count: sourcePackets.length,
    packets: sourcePackets
  };

  return {
    sourceCollection,
    itemPacket,
    runMetaPacket
  };
}

export { PHASE_IDS, phaseFromMethod, sourceSurfaceFromMethod };
