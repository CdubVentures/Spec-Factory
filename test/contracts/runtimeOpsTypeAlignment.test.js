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
  EXTRACTION_FIELD_KEYS,
  EXTRACTION_CANDIDATE_KEYS,
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
const typesSource = readFileSync(TYPES_PATH, 'utf8');

/**
 * Extract the top-level field names from a TypeScript interface block.
 * Handles: `fieldName: type;`, `fieldName?: type;`, inline objects, arrays.
 * Only captures fields at the first nesting level (2-space indent).
 */
function extractInterfaceKeys(source, interfaceName) {
  // Find the interface block — match `export interface Foo {` or `interface Foo {`
  const pattern = new RegExp(
    `(?:export\\s+)?interface\\s+${interfaceName}\\s*(?:extends\\s+[^{]+)?\\{`,
  );
  const match = source.match(pattern);
  if (!match) return null;

  const startIdx = match.index + match[0].length;
  let depth = 1;
  let blockEnd = startIdx;
  for (let i = startIdx; i < source.length && depth > 0; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
    if (depth === 0) blockEnd = i;
  }

  const block = source.slice(startIdx, blockEnd);
  const keys = [];
  // Match top-level fields: lines starting with `  fieldName` (2 spaces or tab)
  // followed by `?:` or `:`. Skip lines inside nested braces.
  let nestedDepth = 0;
  for (const line of block.split('\n')) {
    for (const ch of line) {
      if (ch === '{' || ch === '[' || ch === '(') nestedDepth++;
      if (ch === '}' || ch === ']' || ch === ')') nestedDepth = Math.max(0, nestedDepth - 1);
    }
    // Only capture at top level (nestedDepth 0 after processing, or 1 if a nested block starts on this line)
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
});
