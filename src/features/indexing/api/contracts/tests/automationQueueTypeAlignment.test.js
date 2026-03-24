// WHY: Contract test verifying that the TS interfaces in indexing/types.ts
// declare every field from the canonical automation queue contract key arrays.
// If a contract key is missing from the TS interface, the builder can emit data
// the frontend silently ignores.
//
// Direction: contract keys ⊆ TS interface keys (superset check).

import { describe, it } from 'node:test';
import { ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTOMATION_JOB_KEYS,
  AUTOMATION_ACTION_KEYS,
  AUTOMATION_SUMMARY_KEYS,
  AUTOMATION_RESPONSE_KEYS,
} from '../automationQueueContract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../../../../../tools/gui-react/src/features/indexing/types.ts');
const TYPES_GEN_PATH = join(__dirname, '../../../../../../tools/gui-react/src/features/indexing/types.generated.ts');

function loadTypesSource() {
  let source = readFileSync(TYPES_PATH, 'utf8');
  try {
    source += '\n' + readFileSync(TYPES_GEN_PATH, 'utf8');
  } catch {
    // generated file may not exist yet — tests will fail on missing interfaces
  }
  return source;
}

const typesSource = loadTypesSource();

function extractInterfaceKeys(source, interfaceName) {
  const pattern = new RegExp(
    `(?:export\\s+)?interface\\s+${interfaceName}\\s*(?:extends\\s+([^{]+))?\\{`,
  );
  const match = source.match(pattern);
  if (!match) return null;

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
  ok(tsKeys !== null, `interface ${interfaceName} not found in types.ts or types.generated.ts`);
  const tsKeySet = new Set(tsKeys);
  const missing = contractKeys.filter((k) => !tsKeySet.has(k));
  ok(
    missing.length === 0,
    `${interfaceName} is missing contract keys: [${missing.join(', ')}]`,
  );
}

describe('automationQueueTypeAlignment', () => {

  // WHY: Job and action types are now generated interfaces (AutomationJobRowGen,
  // AutomationActionRowGen). The hand-written types.ts re-exports them as type
  // aliases (IndexLabAutomationJobRow = AutomationJobRowGen). We verify the
  // generated interfaces contain all contract keys.

  it('AutomationJobRowGen contains all AUTOMATION_JOB_KEYS', () => {
    assertContractKeysInInterface(AUTOMATION_JOB_KEYS, 'AutomationJobRowGen');
  });

  it('AutomationActionRowGen contains all AUTOMATION_ACTION_KEYS', () => {
    assertContractKeysInInterface(AUTOMATION_ACTION_KEYS, 'AutomationActionRowGen');
  });

  it('AutomationSummaryGen contains all AUTOMATION_SUMMARY_KEYS', () => {
    assertContractKeysInInterface(AUTOMATION_SUMMARY_KEYS, 'AutomationSummaryGen');
  });

  it('IndexLabAutomationQueueResponse contains all AUTOMATION_RESPONSE_KEYS', () => {
    assertContractKeysInInterface(AUTOMATION_RESPONSE_KEYS, 'IndexLabAutomationQueueResponse');
  });
});
