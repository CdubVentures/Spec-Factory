/**
 * Source packet builders for indexing schema packets.
 * Builds per-source extraction packets with evidence, artifacts, and quality metadata.
 * Extracted from indexingSchemaPackets.js (P4 decomposition).
 */
import { toInt } from '../shared/valueNormalizers.js';
import {
  sha256, toIso, clamp01, firstKnownValue,
  normalizeHost, rootDomainFromHost, unitForField,
} from './schemaPacketValueHelpers.js';
import {
  phaseFromMethod, sourceSurfaceFromMethod,
  normalizeFetchStatus, blockedReasonForStatus, defaultPhaseLineage,
} from './schemaPacketPhaseResolvers.js';
import {
  IDENTITY_FIELDS, requiredLevelForField, parseTierWeight,
  makeTargetMatch, makeCandidateRows,
} from './schemaPacketFieldHelpers.js';

export function buildSourcePacket({
  source,
  runId,
  category,
  productId,
  categoryConfig,
  nowIso
}) {
  const canonicalUrl = String(source?.finalUrl || source?.url || '').trim();
  if (!canonicalUrl) return null;

  const sourceHost = normalizeHost(source?.host || '');
  const sourceRoot = normalizeHost(source?.rootDomain || rootDomainFromHost(sourceHost));
  const sourceId = String(source?.sourceId || '').trim()
    || `src_${sha256(`${sourceRoot}|${canonicalUrl}`).slice(0, 12)}`;
  const contentHashRaw = sha256([
    canonicalUrl,
    String(source?.title || ''),
    String(source?.status || ''),
    String(source?.ts || '')
  ].join('|'));
  const contentHash = `sha256:${contentHashRaw}`;
  const sourcePacketId = `sha256:${sha256(canonicalUrl)}`;
  const sourceVersionId = `sha256:${sha256(`${canonicalUrl}|${contentHashRaw}`)}`;
  const targetMatch = makeTargetMatch(source);

  const candidateRows = makeCandidateRows(source);
  if (candidateRows.length === 0) {
    return null;
  }

  const phaseSet = new Set(candidateRows.map((row) => phaseFromMethod(row.extraction_method)));
  if (phaseSet.size === 0) phaseSet.add('phase_01_static_html');
  const phaseLineage = defaultPhaseLineage([...phaseSet]);
  const phaseStats = {};
  for (const phaseId of [...phaseSet]) {
    const rowsForPhase = candidateRows.filter((row) => phaseFromMethod(row.extraction_method) === phaseId);
    phaseStats[phaseId] = {
      executed: rowsForPhase.length > 0,
      duration_ms: 0,
      assertion_count: rowsForPhase.length,
      evidence_count: rowsForPhase.length
    };
  }

  const sourceArtifactRefs = source?.artifact_refs && typeof source.artifact_refs === 'object'
    ? source.artifact_refs
    : {};
  const htmlArtifactId = `art_${sha256(`${sourceVersionId}|html`).slice(0, 12)}`;
  const domArtifactId = String(sourceArtifactRefs?.dom_snippet_uri || '').trim()
    ? `art_${sha256(`${sourceVersionId}|dom_snippet`).slice(0, 12)}`
    : '';
  const screenshotArtifactId = String(sourceArtifactRefs?.screenshot_uri || '').trim()
    ? `art_${sha256(`${sourceVersionId}|screenshot`).slice(0, 12)}`
    : '';
  const artifactIndex = {
    [htmlArtifactId]: {
      artifact_id: htmlArtifactId,
      phase_id: [...phaseSet][0] || 'phase_01_static_html',
      artifact_kind: 'html',
      content_hash: contentHash,
      mime_type: 'text/html',
      captured_at: toIso(source?.ts, nowIso),
      local_path: String(sourceArtifactRefs?.html_uri || canonicalUrl).trim() || canonicalUrl
    }
  };
  if (domArtifactId) {
    artifactIndex[domArtifactId] = {
      artifact_id: domArtifactId,
      phase_id: 'phase_01_static_html',
      artifact_kind: 'dom_snapshot',
      content_hash: String(sourceArtifactRefs?.dom_snippet_content_hash || '').trim() || contentHash,
      mime_type: 'text/html',
      captured_at: toIso(source?.ts, nowIso),
      local_path: String(sourceArtifactRefs?.dom_snippet_uri || '').trim()
    };
  }
  if (screenshotArtifactId) {
    artifactIndex[screenshotArtifactId] = {
      artifact_id: screenshotArtifactId,
      phase_id: 'phase_08_image_ocr',
      artifact_kind: 'screenshot',
      content_hash: String(sourceArtifactRefs?.screenshot_content_hash || '').trim() || contentHash,
      mime_type: String(sourceArtifactRefs?.screenshot_mime_type || 'image/jpeg').trim(),
      captured_at: toIso(source?.ts, nowIso),
      local_path: String(sourceArtifactRefs?.screenshot_uri || '').trim()
    };
  }

  const evidenceIndex = {};
  const fieldGroups = new Map();
  const sourceAssertionRows = [];
  const sourceEvidenceRows = [];
  const assertionRefs = [];

  for (const row of candidateRows) {
    const fieldKey = row.field_key;
    if (!fieldGroups.has(fieldKey)) fieldGroups.set(fieldKey, []);

    const evidenceSeed = row.evidence_refs[0]
      || row.evidence_snippet_id
      || `${fieldKey}|${row.idx}|${String(row.value_raw || '')}`;
    const evidenceId = `e_${sha256(`${sourceVersionId}|${evidenceSeed}`).slice(0, 14)}`;
    const snippetId = row.evidence_snippet_id || `snip_${sha256(`${evidenceId}|snippet`).slice(0, 10)}`;
    const snippetText = row.evidence_quote || String(row.value_raw ?? '');
    const snippetHash = row.evidence_snippet_hash || `sha256:${sha256(snippetText)}`;
    let evidenceArtifactId = htmlArtifactId;
    const evidenceFileUri = String(row.evidence_file_uri || '').trim();
    const screenshotUri = String(sourceArtifactRefs?.screenshot_uri || '').trim();
    const screenshotFileUri = String(sourceArtifactRefs?.screenshot_file_uri || '').trim();
    const domSnippetUri = String(sourceArtifactRefs?.dom_snippet_uri || '').trim();
    const evidenceSurface = String(row.evidence_surface || '').trim().toLowerCase();
    if (
      screenshotArtifactId &&
      (
        evidenceFileUri === screenshotUri
        || evidenceFileUri === screenshotFileUri
        || evidenceSurface.includes('screenshot')
      )
    ) {
      evidenceArtifactId = screenshotArtifactId;
    } else if (domArtifactId && (evidenceFileUri === domSnippetUri || evidenceSurface.includes('dom'))) {
      evidenceArtifactId = domArtifactId;
    }
    evidenceIndex[evidenceId] = {
      evidence_id: evidenceId,
      source_id: sourceId,
      source_url: canonicalUrl,
      source_host: sourceHost,
      source_root_domain: sourceRoot,
      phase_id: phaseFromMethod(row.extraction_method),
      source_surface: sourceSurfaceFromMethod(row.extraction_method),
      target_match: targetMatch,
      artifact_id: evidenceArtifactId,
      snippet_id: snippetId,
      snippet_hash: snippetHash,
      quote: snippetText,
      snippet_text: snippetText,
      key_path: row.key_path || undefined,
      method: row.extraction_method,
      tier: toInt(source?.tier, 0),
      retrieved_at: toIso(source?.ts, nowIso),
      surface_meta: {
        file_uri: evidenceFileUri || undefined,
        mime_type: String(row.evidence_mime_type || '').trim() || undefined,
        content_hash: String(row.evidence_content_hash || '').trim() || undefined,
        surface: evidenceSurface || undefined
      }
    };

    const parserScore = clamp01(row.parser_confidence, 0.7);
    const assertionId = String(row?.candidate_id || '').trim()
      || `cand_${sha256(`${sourceVersionId}|${fieldKey}|${row.idx}|${String(row.value_raw || '')}`).slice(0, 18)}`;
    const ambiguityScore = targetMatch.target_match_passed ? 0.08 : 0.82;
    const ambiguityLevel = targetMatch.target_match_passed ? 'low' : 'high';
    const assertion = {
      assertion_id: assertionId,
      candidate_id: assertionId,
      source_id: sourceId,
      field_key: fieldKey,
      context_kind: row.context_kind || 'scalar',
      context_ref: row.context_ref ?? null,
      value_raw: row.value_raw,
      value_normalized: row.value_normalized,
      value_type: row.value_type,
      unit: row.unit ?? null,
      extraction_method: row.extraction_method,
      parser_phase: phaseFromMethod(row.extraction_method),
      parser_confidence: parserScore,
      confidence: clamp01(row.confidence, parserScore),
      target_match: targetMatch,
      ambiguity: {
        level: ambiguityLevel,
        score: ambiguityScore
      },
      parse_score_by_key: {
        field_key: fieldKey,
        score: parserScore,
        score_factors: {
          parser_confidence: parserScore,
          evidence_density: 1,
          unit_match: row.unit ? 1 : 0.7,
          identity_match: targetMatch.target_match_score,
          tier_weight: parseTierWeight(toInt(source?.tier, 0))
        },
        suggested_start_rank: row.idx
      },
      evidence_ref_ids: [evidenceId],
      created_at: toIso(source?.ts, nowIso)
    };
    fieldGroups.get(fieldKey).push(assertion);
    assertionRefs.push({
      field_key: fieldKey,
      source_id: sourceId,
      source_packet_id: sourcePacketId,
      source_version_id: sourceVersionId,
      canonical_url: canonicalUrl,
      source_tier: toInt(source?.tier, 0),
      assertion_id: assertionId,
      evidence_id: evidenceId,
      parser_score: parserScore,
      target_match_score: targetMatch.target_match_score,
      ambiguity_level: ambiguityLevel,
      ambiguity_score: ambiguityScore,
      value_normalized: row.value_normalized,
      value_raw: row.value_raw,
      unit: row.unit ?? null
    });

    sourceAssertionRows.push({
      assertion_id: assertionId,
      source_id: sourceId,
      field_key: fieldKey,
      context_kind: row.context_kind || 'scalar',
      context_ref: row.context_ref ?? null,
      value_raw: row.value_raw,
      value_normalized: row.value_normalized,
      unit: row.unit ?? null,
      candidate_id: assertionId,
      extraction_method: row.extraction_method
    });
    sourceEvidenceRows.push({
      assertion_id: assertionId,
      evidence_url: canonicalUrl,
      snippet_id: snippetId,
      quote: snippetText,
      method: row.extraction_method,
      tier: toInt(source?.tier, 0),
      retrieved_at: toIso(source?.ts, nowIso)
    });
  }

  const fieldKeyMap = {};
  for (const [fieldKey, assertions] of fieldGroups.entries()) {
    const contextId = `ctx_${sha256(`${sourceVersionId}|${fieldKey}|scalar`).slice(0, 12)}`;
    const fieldInstanceId = `fi_${sha256(`${sourceVersionId}|grid_key|${fieldKey}|scalar`).slice(0, 16)}`;
    const ambiguityScore = assertions.length > 1 ? 0.35 : (targetMatch.target_match_passed ? 0.08 : 0.82);
    const ambiguityLevel = ambiguityScore >= 0.75 ? 'high' : ambiguityScore >= 0.35 ? 'medium' : 'low';
    fieldKeyMap[fieldKey] = {
      field_key: fieldKey,
      field_key_id: `sha256:${sha256(`${sourceVersionId}|${fieldKey}`)}`,
      field_meta: {
        field_key: fieldKey,
        contract_type: 'spec_field',
        shape: 'scalar',
        required_level: requiredLevelForField(fieldKey, categoryConfig),
        is_identity: IDENTITY_FIELDS.has(fieldKey),
        unit_expected: unitForField(fieldKey),
        component_type: null,
        enum_source: null
      },
      contexts: [
        {
          field_instance_id: fieldInstanceId,
          context_id: contextId,
          context_kind: 'scalar',
          context_ref: null,
          ambiguity: {
            level: ambiguityLevel,
            score: ambiguityScore
          },
          assertions
        }
      ],
      field_metrics: {
        assertion_count: assertions.length,
        distinct_evidence_count: assertions.length,
        distinct_surface_count: 1,
        distinct_source_count: 1,
        ambiguity_level: ambiguityLevel,
        ambiguity_score: ambiguityScore,
        has_conflict: assertions.length > 1
      }
    };
  }

  const fieldKeys = Object.keys(fieldKeyMap);
  const requiredFields = new Set(Array.isArray(categoryConfig?.requiredFields) ? categoryConfig.requiredFields : []);
  const criticalFields = categoryConfig?.criticalFieldSet instanceof Set
    ? categoryConfig.criticalFieldSet
    : new Set(Array.isArray(categoryConfig?.schema?.critical_fields) ? categoryConfig.schema.critical_fields : []);
  const requiredKnown = [...requiredFields].filter((field) => fieldKeys.includes(field)).length;
  const requiredTotal = requiredFields.size;
  const criticalKnown = [...criticalFields].filter((field) => fieldKeys.includes(field)).length;
  const criticalTotal = criticalFields.size;
  const fetchedAt = toIso(source?.ts, nowIso);
  const visualEvidence = screenshotArtifactId
    ? {
      store_original_images: true,
      llm_derivative_policy: {
        send_original_to_llm: false,
        preferred_variant: 'review_sm',
        max_bytes_per_image: 700000,
        review_lg: { enabled: true, max_side_px: 1600, format: 'jpeg', quality: 72 },
        review_sm: { enabled: true, max_side_px: 960, format: 'jpeg', quality: 58 },
        region_crop: { enabled: true, max_side_px: 720, format: 'jpeg', quality: 65 }
      },
      image_assets: {
        [`img_${sha256(`${sourceVersionId}|${screenshotArtifactId}`).slice(0, 12)}`]: {
          image_asset_id: `img_${sha256(`${sourceVersionId}|${screenshotArtifactId}`).slice(0, 12)}`,
          asset_kind: 'page_screenshot',
          source_surface: 'screenshot_capture',
          candidate_source_type: 'dom_img',
          content_hash: String(sourceArtifactRefs?.screenshot_content_hash || '').trim() || contentHash,
          mime_type: String(sourceArtifactRefs?.screenshot_mime_type || 'image/jpeg').trim(),
          width: Math.max(1, toInt(sourceArtifactRefs?.screenshot_width, 1)),
          height: Math.max(1, toInt(sourceArtifactRefs?.screenshot_height, 1)),
          size_bytes: Math.max(0, toInt(sourceArtifactRefs?.screenshot_size_bytes, 0)),
          storage_uri: String(sourceArtifactRefs?.screenshot_uri || '').trim(),
          captured_at: fetchedAt,
          target_match: targetMatch,
          quality_gate: {
            quality_score: 0.7,
            quality_gate_passed: true
          }
        }
      }
    }
    : null;

  const packet = {
    schema_version: '2026-02-20.source-indexing-extraction-packet.v1',
    record_kind: 'source_indexing_extraction_packet',
    source_packet_id: sourcePacketId,
    source_id: sourceId,
    source_key: canonicalUrl,
    canonical_url: canonicalUrl,
    source_version_id: sourceVersionId,
    content_hash: contentHash,
    run_meta: {
      run_id: runId,
      category,
      item_identifier: productId,
      product_id: productId,
      started_at: fetchedAt,
      finished_at: fetchedAt,
      fetch_status: normalizeFetchStatus(source?.status),
      http_status: toInt(source?.status, 0),
      content_type: 'text/html',
      fetch_ms: 0
    },
    source_metadata: {
      source_url: canonicalUrl,
      source_host: sourceHost,
      source_root_domain: sourceRoot,
      source_tier: toInt(source?.tier, 0),
      source_method: source?.approvedDomain ? 'approved_source' : 'candidate_source',
      doc_kind: 'html',
      host_authority_disabled: true
    },
    parser_execution: {
      supported_source_kinds: [...phaseSet],
      phase_lineage: phaseLineage,
      phase_stats: phaseStats
    },
    identity_target: {
      category,
      brand: String(source?.identityCandidates?.brand || '').trim(),
      model: String(source?.identityCandidates?.model || '').trim(),
      variant: String(source?.identityCandidates?.variant || '').trim(),
      sku: String(source?.identityCandidates?.sku || '').trim()
    },
    artifact_index: artifactIndex,
    evidence_index: evidenceIndex,
    field_key_map: fieldKeyMap,
    quality: {
      wrong_model: !targetMatch.target_match_passed,
      junk: toInt(source?.status, 0) >= 400,
      blocked_reason: blockedReasonForStatus(source?.status)
    },
    coverage_summary: {
      field_count: fieldKeys.length,
      fields: fieldKeys,
      required_coverage: `${requiredKnown}/${requiredTotal}`,
      critical_coverage: `${criticalKnown}/${criticalTotal}`,
      is_jackpot_candidate: fieldKeys.length > 0 && targetMatch.target_match_passed
    },
    indexing_projection: {
      retrieval_ready: Object.keys(evidenceIndex).length > 0,
      chunk_strategy: 'hybrid',
      chunk_count: Object.keys(evidenceIndex).length,
      embedding_ready_evidence_ids: Object.keys(evidenceIndex),
      retrieval_priority_field_keys: fieldKeys.slice(0, 24),
      token_estimate_total: Math.max(1, Object.keys(evidenceIndex).length) * 80
    },
    sql_projection: {
      source_registry_row: {
        source_id: sourceId,
        category,
        item_identifier: productId,
        product_id: productId,
        run_id: runId,
        source_url: canonicalUrl,
        source_host: sourceHost || null,
        source_root_domain: sourceRoot || null,
        source_tier: toInt(source?.tier, 0),
        source_method: source?.approvedDomain ? 'approved_source' : 'candidate_source',
        crawl_status: normalizeFetchStatus(source?.status),
        http_status: toInt(source?.status, 0),
        fetched_at: fetchedAt
      },
      source_artifact_rows: [
        ...Object.values(artifactIndex).map((artifact) => ({
          source_id: sourceId,
          artifact_type: String(artifact?.artifact_kind || 'html'),
          local_path: String(artifact?.local_path || canonicalUrl),
          content_hash: String(artifact?.content_hash || contentHash),
          mime_type: String(artifact?.mime_type || 'text/html'),
          size_bytes: Number.isFinite(Number(artifact?.size_bytes))
            ? Number(artifact.size_bytes)
            : null,
          captured_at: String(artifact?.captured_at || fetchedAt)
        }))
      ],
      source_assertion_rows: sourceAssertionRows,
      source_evidence_rows: sourceEvidenceRows
    },
    ...(visualEvidence ? { visual_evidence: visualEvidence } : {}),
    packet_invariants: {
      one_packet_per_canonical_url: true,
      source_host_non_authority: true,
      extraction_first_packet: true,
      downstream_binding_optional: true
    }
  };

  return {
    packet,
    assertionRefs
  };
}

export function buildFallbackSourcePacket({
  runId,
  category,
  productId,
  nowIso,
  normalized,
  categoryConfig
}) {
  const fallbackBrand = firstKnownValue([
    normalized?.identity?.brand,
    normalized?.fields?.brand
  ]);
  const fallbackModel = firstKnownValue([
    normalized?.identity?.model,
    normalized?.fields?.model
  ], productId);
  const fallbackVariant = firstKnownValue([
    normalized?.identity?.variant,
    normalized?.fields?.variant
  ]);
  const fallbackSku = firstKnownValue([
    normalized?.identity?.sku,
    normalized?.fields?.sku
  ]);
  const fallbackUrl = `https://fallback.local/${encodeURIComponent(productId)}`;
  const source = {
    url: fallbackUrl,
    finalUrl: fallbackUrl,
    host: 'fallback.local',
    rootDomain: 'fallback.local',
    tier: 3,
    approvedDomain: false,
    status: 0,
    ts: nowIso,
    identity: { match: true, score: 1 },
    identityCandidates: {
      brand: fallbackBrand,
      model: fallbackModel,
      variant: fallbackVariant,
      sku: fallbackSku
    },
    fieldCandidates: [
      {
        field: 'model',
        value: fallbackModel,
        method: 'dom',
        confidence: 1
      }
    ]
  };
  return buildSourcePacket({
    source,
    runId,
    category,
    productId,
    categoryConfig,
    nowIso
  });
}
