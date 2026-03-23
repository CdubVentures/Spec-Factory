// WHY: O(1) Feature Scaling — auto-generates TypeScript interfaces for Runtime Ops
// DTOs from backend shape descriptors. Adding a new field to a response = add one
// {key, coerce} entry to the shape descriptor + run codegen. Zero manual TS edits.
//
// Usage: node tools/gui-react/scripts/generateRuntimeOpsTypes.js
// Output: writes tools/gui-react/src/features/runtime-ops/types.generated.ts

import {
  SUMMARY_SHAPE, BLOCKER_SHAPE,
  DOCUMENT_ROW_SHAPE, DOCUMENT_DETAIL_SHAPE,
  POOL_METRIC_SHAPE, QUALITY_METRIC_SHAPE, FAILURE_METRIC_SHAPE,
  FALLBACK_EVENT_SHAPE, HOST_FALLBACK_PROFILE_SHAPE,
  QUEUE_JOB_SHAPE, LANE_SUMMARY_SHAPE, BLOCKED_HOST_SHAPE,
  PIPELINE_STAGE_SHAPE, PIPELINE_TRANSITION_SHAPE,
  WORKER_ROW_BASE_SHAPE, WORKER_FETCH_EXTRA_SHAPE,
  WORKER_SEARCH_EXTRA_SHAPE, WORKER_LLM_EXTRA_SHAPE,
  EXTRACTION_FIELD_SHAPE, EXTRACTION_CANDIDATE_SHAPE,
  LLM_CALL_ROW_SHAPE, LLM_DASHBOARD_SUMMARY_SHAPE,
} from '../../../src/features/indexing/api/contracts/runtimeOpsContract.js';

import {
  NEEDSET_DATA_SHAPE, BRAND_RESOLUTION_SHAPE,
  SEARCH_PLAN_PASS_SHAPE, QUERY_JOURNEY_SHAPE,
  SEARCH_RESULT_SHAPE, DOMAIN_HEALTH_ROW_SHAPE,
  PREFETCH_LLM_CALL_SHAPE,
} from '../../../src/features/indexing/api/contracts/runtimeOpsPrefetchContract.js';

import {
  SEARCH_RESULT_ENTRY_SHAPE, SEARCH_RESULT_DETAIL_SHAPE,
  SERP_SCORE_COMPONENTS_SHAPE, SERP_TRIAGE_CANDIDATE_SHAPE,
  SERP_TRIAGE_ENVELOPE_SHAPE, SERP_TRIAGE_FUNNEL_SHAPE,
  SEARCH_PROFILE_SHAPE, SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE,
} from '../../../src/features/indexing/api/contracts/prefetchContract.js';

// ── Shape → Interface mapping registry ──

const SHAPE_REGISTRY = [
  // runtimeOpsContract.js
  { shape: SUMMARY_SHAPE, name: 'SUMMARY_SHAPE', iface: 'RuntimeOpsSummary' },
  { shape: BLOCKER_SHAPE, name: 'BLOCKER_SHAPE', iface: 'RuntimeOpsBlocker' },
  { shape: DOCUMENT_ROW_SHAPE, name: 'DOCUMENT_ROW_SHAPE', iface: 'RuntimeOpsDocumentRow' },
  { shape: DOCUMENT_DETAIL_SHAPE, name: 'DOCUMENT_DETAIL_SHAPE', iface: 'RuntimeOpsDocumentDetail' },
  { shape: POOL_METRIC_SHAPE, name: 'POOL_METRIC_SHAPE', iface: 'PoolMetric' },
  { shape: QUALITY_METRIC_SHAPE, name: 'QUALITY_METRIC_SHAPE', iface: 'QualityMetric' },
  { shape: FAILURE_METRIC_SHAPE, name: 'FAILURE_METRIC_SHAPE', iface: 'FailureMetric' },
  { shape: FALLBACK_EVENT_SHAPE, name: 'FALLBACK_EVENT_SHAPE', iface: 'FallbackEventRow' },
  { shape: HOST_FALLBACK_PROFILE_SHAPE, name: 'HOST_FALLBACK_PROFILE_SHAPE', iface: 'HostFallbackProfile' },
  { shape: QUEUE_JOB_SHAPE, name: 'QUEUE_JOB_SHAPE', iface: 'QueueJobRowGen' },
  { shape: LANE_SUMMARY_SHAPE, name: 'LANE_SUMMARY_SHAPE', iface: 'LaneSummary' },
  { shape: BLOCKED_HOST_SHAPE, name: 'BLOCKED_HOST_SHAPE', iface: 'BlockedHostEntry' },
  { shape: PIPELINE_STAGE_SHAPE, name: 'PIPELINE_STAGE_SHAPE', iface: 'PipelineStage' },
  { shape: PIPELINE_TRANSITION_SHAPE, name: 'PIPELINE_TRANSITION_SHAPE', iface: 'PipelineTransition' },
  { shape: EXTRACTION_FIELD_SHAPE, name: 'EXTRACTION_FIELD_SHAPE', iface: 'ExtractionFieldRow' },
  { shape: EXTRACTION_CANDIDATE_SHAPE, name: 'EXTRACTION_CANDIDATE_SHAPE', iface: 'ExtractionCandidate' },
  { shape: LLM_CALL_ROW_SHAPE, name: 'LLM_CALL_ROW_SHAPE', iface: 'LlmCallRow' },
  { shape: LLM_DASHBOARD_SUMMARY_SHAPE, name: 'LLM_DASHBOARD_SUMMARY_SHAPE', iface: 'LlmCallsDashboardSummaryGen' },
  // prefetchContract.js (already shape descriptors)
  // WHY: Renamed to avoid collision with hand-written SearchResultEntry (worker-level,
  // different fields). The generated shape is the SERP overview; consumer type is SerpResultRow.
  { shape: SEARCH_RESULT_ENTRY_SHAPE, name: 'SEARCH_RESULT_ENTRY_SHAPE', iface: 'SerpSearchResultEntry' },
  { shape: SEARCH_RESULT_DETAIL_SHAPE, name: 'SEARCH_RESULT_DETAIL_SHAPE', iface: 'SerpSearchResultDetail' },
  { shape: SERP_SCORE_COMPONENTS_SHAPE, name: 'SERP_SCORE_COMPONENTS_SHAPE', iface: 'TriageScoreComponents' },
  { shape: SERP_TRIAGE_CANDIDATE_SHAPE, name: 'SERP_TRIAGE_CANDIDATE_SHAPE', iface: 'TriageCandidateGen' },
  { shape: SERP_TRIAGE_ENVELOPE_SHAPE, name: 'SERP_TRIAGE_ENVELOPE_SHAPE', iface: 'SerpTriageEnvelope' },
  { shape: SERP_TRIAGE_FUNNEL_SHAPE, name: 'SERP_TRIAGE_FUNNEL_SHAPE', iface: 'SerpTriageFunnel' },
  { shape: SEARCH_PROFILE_SHAPE, name: 'SEARCH_PROFILE_SHAPE', iface: 'PrefetchSearchProfileBase' },
  { shape: SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE, name: 'SEARCH_PLAN_ENHANCEMENT_ROW_SHAPE', iface: 'SearchPlanEnhancementRow' },
  // runtimeOpsPrefetchContract.js
  { shape: NEEDSET_DATA_SHAPE, name: 'NEEDSET_DATA_SHAPE', iface: 'PrefetchNeedSetBase' },
  { shape: BRAND_RESOLUTION_SHAPE, name: 'BRAND_RESOLUTION_SHAPE', iface: 'BrandResolutionData' },
  { shape: SEARCH_PLAN_PASS_SHAPE, name: 'SEARCH_PLAN_PASS_SHAPE', iface: 'SearchPlanPassBase' },
  { shape: QUERY_JOURNEY_SHAPE, name: 'QUERY_JOURNEY_SHAPE', iface: 'QueryJourneyData' },
  { shape: SEARCH_RESULT_SHAPE, name: 'SEARCH_RESULT_SHAPE', iface: 'PrefetchSearchResult' },
  { shape: DOMAIN_HEALTH_ROW_SHAPE, name: 'DOMAIN_HEALTH_ROW_SHAPE', iface: 'DomainHealthRow' },
  { shape: PREFETCH_LLM_CALL_SHAPE, name: 'PREFETCH_LLM_CALL_SHAPE', iface: 'PrefetchLlmCallGen' },
];

// ── TS type resolution ──

function tsType(descriptor) {
  // WHY: literals override coerce — produces union types from backend metadata
  if (descriptor.literals) {
    const union = descriptor.literals.map(v => `'${v}'`).join(' | ');
    return descriptor.nullable ? `(${union}) | null` : union;
  }
  const base = (() => {
    switch (descriptor.coerce) {
      case 'string': return 'string';
      case 'int':
      case 'float': return 'number';
      case 'bool': return 'boolean';
      case 'array': {
        if (descriptor.itemRef) return `${descriptor.itemRef}[]`;
        if (descriptor.itemType) return `${descriptor.itemType}[]`;
        return 'unknown[]';
      }
      case 'object_or_null': return 'Record<string, unknown> | null';
      case 'object_or_empty': return 'Record<string, unknown>';
      case 'passthrough': return 'unknown';
      default: return 'unknown';
    }
  })();
  if (descriptor.nullable && base !== 'unknown' && !base.includes('null')) {
    return `${base} | null`;
  }
  return base;
}

// ── Code generation ──

export function generateRuntimeOpsTypes() {
  const lines = [];

  lines.push('// AUTO-GENERATED from backend shape descriptors — do not edit manually.');
  lines.push('// Run: node tools/gui-react/scripts/generateRuntimeOpsTypes.js');
  lines.push('//');
  lines.push('// Shape descriptors live in:');
  lines.push('//   src/features/indexing/api/contracts/runtimeOpsContract.js');
  lines.push('//   src/features/indexing/api/contracts/runtimeOpsPrefetchContract.js');
  lines.push('//   src/features/indexing/api/contracts/prefetchContract.js');
  lines.push('');

  // Emit each interface
  for (const entry of SHAPE_REGISTRY) {
    lines.push(`export interface ${entry.iface} {`);
    for (const d of entry.shape) {
      const opt = d.optional ? '?' : '';
      lines.push(`  ${d.key}${opt}: ${tsType(d)};`);
    }
    lines.push('}');
    lines.push('');
  }

  // ── Composite: RuntimeOpsWorkerRow (base + 3 optional extras) ──
  lines.push('// WHY: Worker row is base fields (required) + pool-specific extras (all optional).');
  lines.push('// The pool determines which extra fields are populated.');
  lines.push('export interface RuntimeOpsWorkerRowGen {');
  for (const d of WORKER_ROW_BASE_SHAPE) {
    const opt = d.optional ? '?' : '';
    lines.push(`  ${d.key}${opt}: ${tsType(d)};`);
  }
  for (const extra of [WORKER_FETCH_EXTRA_SHAPE, WORKER_SEARCH_EXTRA_SHAPE, WORKER_LLM_EXTRA_SHAPE]) {
    for (const d of extra) {
      lines.push(`  ${d.key}?: ${tsType(d)};`);
    }
  }
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

// ── CLI ──
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const outPath = path.resolve(
    import.meta.dirname,
    '../src/features/runtime-ops/types.generated.ts',
  );
  const content = generateRuntimeOpsTypes();
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath} (${content.split('\n').length} lines)`);
}
