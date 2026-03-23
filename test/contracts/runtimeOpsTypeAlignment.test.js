// WHY: Contract test verifying that the TS interfaces in runtime-ops/types.ts
// declare every field from the canonical contract key arrays. If a contract key
// is missing from the TS interface, the builder can emit data the frontend silently
// ignores — this is the exact drift that produced the effective_host_plan bug.
//
// Direction: contract keys ⊆ TS interface keys (superset check).
// The TS interface may have extra UI-only optional fields — that's fine.

import { describe, it } from 'node:test';
import { ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SUMMARY_KEYS,
  DOCUMENT_ROW_KEYS,
  DOCUMENT_DETAIL_KEYS,
  METRICS_RAIL_KEYS,
  POOL_METRIC_KEYS,
  FALLBACK_EVENT_KEYS,
  HOST_FALLBACK_PROFILE_KEYS,
  QUEUE_JOB_KEYS,
  LANE_SUMMARY_KEYS,
  BLOCKED_HOST_KEYS,
  PIPELINE_STAGE_KEYS,
  PIPELINE_TRANSITION_KEYS,
  WORKER_ROW_BASE_KEYS,
  WORKER_FETCH_EXTRA_KEYS,
  WORKER_SEARCH_EXTRA_KEYS,
  WORKER_LLM_EXTRA_KEYS,
  EXTRACTION_FIELD_KEYS,
  EXTRACTION_CANDIDATE_KEYS,
  LLM_CALL_ROW_KEYS,
  LLM_DASHBOARD_SUMMARY_KEYS,
  LLM_DASHBOARD_KEYS,
} from '../../src/features/indexing/api/contracts/runtimeOpsContract.js';

import {
  PREFETCH_RESPONSE_KEYS,
  NEEDSET_DATA_KEYS,
  BRAND_RESOLUTION_KEYS,
  SEARCH_PLAN_PASS_KEYS,
  QUERY_JOURNEY_KEYS,
  SEARCH_RESULT_KEYS,
  DOMAIN_HEALTH_ROW_KEYS,
  PREFETCH_LLM_CALL_KEYS,
} from '../../src/features/indexing/api/contracts/runtimeOpsPrefetchContract.js';

import {
  SEARCH_PROFILE_SHAPE,
} from '../../src/features/indexing/api/contracts/prefetchContract.js';

// ── Helper: extract top-level field names from a TS interface ──

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../tools/gui-react/src/features/runtime-ops/types.ts');
const TYPES_GEN_PATH = join(__dirname, '../../tools/gui-react/src/features/runtime-ops/types.generated.ts');
// WHY: Interface definitions may live in types.ts (hand-written) or types.generated.ts
// (codegen output). Concatenate both sources so the parser finds all interfaces.
const typesSource = readFileSync(TYPES_PATH, 'utf8') + '\n' + readFileSync(TYPES_GEN_PATH, 'utf8');

/**
 * Extract the top-level field names from a TypeScript interface block.
 * Handles: `fieldName: type;`, `fieldName?: type;`, inline objects, arrays.
 * Only captures fields at the first nesting level (2-space indent).
 * Resolves `extends ParentInterface` by recursively collecting parent fields.
 */
function extractInterfaceKeys(source, interfaceName) {
  const pattern = new RegExp(
    `(?:export\\s+)?interface\\s+${interfaceName}\\s*(?:extends\\s+([^{]+))?\\{`,
  );
  const match = source.match(pattern);
  if (!match) return null;

  // WHY: Resolve extends — collect fields from parent interfaces first.
  const keys = [];
  if (match[1]) {
    const parents = match[1].split(',').map((p) => p.trim()).filter(Boolean);
    for (const parent of parents) {
      const parentKeys = extractInterfaceKeys(source, parent);
      if (parentKeys) keys.push(...parentKeys);
    }
  }

  const startIdx = match.index + match[0].length;
  let depth = 1;
  let blockEnd = startIdx;
  for (let i = startIdx; i < source.length && depth > 0; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    if (depth === 0) blockEnd = i;
  }

  const block = source.slice(startIdx, blockEnd);
  let nestedDepth = 0;
  for (const line of block.split('\n')) {
    for (const ch of line) {
      if (ch === '{' || ch === '[' || ch === '(') nestedDepth++;
      if (ch === '}' || ch === ']' || ch === ')') nestedDepth = Math.max(0, nestedDepth - 1);
    }
    if (nestedDepth <= 1) {
      const fieldMatch = line.match(/^\s{2}(\w+)\??:/);
      if (fieldMatch) keys.push(fieldMatch[1]);
    }
  }
  return keys;
}

function assertContractKeysInInterface(contractKeys, interfaceName) {
  const tsKeys = extractInterfaceKeys(typesSource, interfaceName);
  ok(tsKeys !== null, `interface ${interfaceName} not found in types.ts`);
  const tsKeySet = new Set(tsKeys);
  const missing = contractKeys.filter((k) => !tsKeySet.has(k));
  ok(
    missing.length === 0,
    `${interfaceName} is missing contract keys: [${missing.join(', ')}]`,
  );
}

// ── Alignment tests ──

describe('runtimeOpsTypeAlignment', () => {

  it('RuntimeOpsSummaryResponse contains all SUMMARY_KEYS', () => {
    assertContractKeysInInterface(SUMMARY_KEYS, 'RuntimeOpsSummaryResponse');
  });

  it('RuntimeOpsDocumentRow contains all DOCUMENT_ROW_KEYS', () => {
    assertContractKeysInInterface(DOCUMENT_ROW_KEYS, 'RuntimeOpsDocumentRow');
  });

  it('RuntimeOpsDocumentDetailResponse contains all DOCUMENT_DETAIL_KEYS', () => {
    assertContractKeysInInterface(DOCUMENT_DETAIL_KEYS, 'RuntimeOpsDocumentDetailResponse');
  });

  it('RuntimeOpsMetricsRailData contains all METRICS_RAIL_KEYS', () => {
    assertContractKeysInInterface(METRICS_RAIL_KEYS, 'RuntimeOpsMetricsRailData');
  });

  it('ExtractionFieldRow contains all EXTRACTION_FIELD_KEYS', () => {
    assertContractKeysInInterface(EXTRACTION_FIELD_KEYS, 'ExtractionFieldRow');
  });

  it('ExtractionCandidate contains all EXTRACTION_CANDIDATE_KEYS', () => {
    assertContractKeysInInterface(EXTRACTION_CANDIDATE_KEYS, 'ExtractionCandidate');
  });

  it('PrefetchSearchProfileData contains all SEARCH_PROFILE_SHAPE keys', () => {
    const contractKeys = SEARCH_PROFILE_SHAPE.map((s) => s.key);
    assertContractKeysInInterface(contractKeys, 'PrefetchSearchProfileData');
  });

  it('PrefetchNeedSetData contains all NEEDSET_DATA_KEYS', () => {
    assertContractKeysInInterface(NEEDSET_DATA_KEYS, 'PrefetchNeedSetData');
  });

  it('PreFetchPhasesResponse contains all PREFETCH_RESPONSE_KEYS', () => {
    assertContractKeysInInterface(PREFETCH_RESPONSE_KEYS, 'PreFetchPhasesResponse');
  });

  it('LlmCallRow contains all LLM_CALL_ROW_KEYS', () => {
    assertContractKeysInInterface(LLM_CALL_ROW_KEYS, 'LlmCallRow');
  });

  it('LlmCallsDashboardSummary contains all LLM_DASHBOARD_SUMMARY_KEYS', () => {
    assertContractKeysInInterface(LLM_DASHBOARD_SUMMARY_KEYS, 'LlmCallsDashboardSummary');
  });

  it('LlmCallsDashboardResponse contains all LLM_DASHBOARD_KEYS', () => {
    assertContractKeysInInterface(LLM_DASHBOARD_KEYS, 'LlmCallsDashboardResponse');
  });

  // ── Characterization: close the contract→interface test gap ──

  it('PoolMetric contains all POOL_METRIC_KEYS', () => {
    assertContractKeysInInterface(POOL_METRIC_KEYS, 'PoolMetric');
  });

  it('FallbackEventRow contains all FALLBACK_EVENT_KEYS', () => {
    assertContractKeysInInterface(FALLBACK_EVENT_KEYS, 'FallbackEventRow');
  });

  it('HostFallbackProfile contains all HOST_FALLBACK_PROFILE_KEYS', () => {
    assertContractKeysInInterface(HOST_FALLBACK_PROFILE_KEYS, 'HostFallbackProfile');
  });

  it('QueueJobRow contains all QUEUE_JOB_KEYS', () => {
    assertContractKeysInInterface(QUEUE_JOB_KEYS, 'QueueJobRow');
  });

  it('LaneSummary contains all LANE_SUMMARY_KEYS', () => {
    assertContractKeysInInterface(LANE_SUMMARY_KEYS, 'LaneSummary');
  });

  it('BlockedHostEntry contains all BLOCKED_HOST_KEYS', () => {
    assertContractKeysInInterface(BLOCKED_HOST_KEYS, 'BlockedHostEntry');
  });

  it('PipelineStage contains all PIPELINE_STAGE_KEYS', () => {
    assertContractKeysInInterface(PIPELINE_STAGE_KEYS, 'PipelineStage');
  });

  it('PipelineTransition contains all PIPELINE_TRANSITION_KEYS', () => {
    assertContractKeysInInterface(PIPELINE_TRANSITION_KEYS, 'PipelineTransition');
  });

  it('RuntimeOpsWorkerRow contains all WORKER_ROW_BASE_KEYS', () => {
    assertContractKeysInInterface(WORKER_ROW_BASE_KEYS, 'RuntimeOpsWorkerRow');
  });

  it('RuntimeOpsWorkerRow contains all WORKER_FETCH_EXTRA_KEYS', () => {
    assertContractKeysInInterface(WORKER_FETCH_EXTRA_KEYS, 'RuntimeOpsWorkerRow');
  });

  it('RuntimeOpsWorkerRow contains all WORKER_SEARCH_EXTRA_KEYS', () => {
    assertContractKeysInInterface(WORKER_SEARCH_EXTRA_KEYS, 'RuntimeOpsWorkerRow');
  });

  it('RuntimeOpsWorkerRow contains all WORKER_LLM_EXTRA_KEYS', () => {
    assertContractKeysInInterface(WORKER_LLM_EXTRA_KEYS, 'RuntimeOpsWorkerRow');
  });

  it('BrandResolutionData contains all BRAND_RESOLUTION_KEYS', () => {
    assertContractKeysInInterface(BRAND_RESOLUTION_KEYS, 'BrandResolutionData');
  });

  it('SearchPlanPass contains all SEARCH_PLAN_PASS_KEYS', () => {
    assertContractKeysInInterface(SEARCH_PLAN_PASS_KEYS, 'SearchPlanPass');
  });

  it('PrefetchSearchResult contains all SEARCH_RESULT_KEYS', () => {
    assertContractKeysInInterface(SEARCH_RESULT_KEYS, 'PrefetchSearchResult');
  });

  it('DomainHealthRow contains all DOMAIN_HEALTH_ROW_KEYS', () => {
    assertContractKeysInInterface(DOMAIN_HEALTH_ROW_KEYS, 'DomainHealthRow');
  });

  it('PrefetchLlmCall contains all PREFETCH_LLM_CALL_KEYS', () => {
    assertContractKeysInInterface(PREFETCH_LLM_CALL_KEYS, 'PrefetchLlmCall');
  });
});
