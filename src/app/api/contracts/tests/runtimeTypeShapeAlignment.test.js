// WHY: Contract test verifying TS interfaces in types/runtime.ts
// declare every field from the canonical runtime type shape descriptors.
// Skip RuntimeOverrides — has [key: string]: unknown index signature.

import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TRACE_ENTRY_KEYS,
  FRONTIER_ENTRY_KEYS,
  LLM_TRACE_ENTRY_KEYS,
} from '../runtimeTypeShapes.js';
import { assertContractKeysInInterface } from '../../../../../test/contracts/helpers/tsInterfaceParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../../../../tools/gui-react/src/types/runtime.ts');
const typesSource = readFileSync(TYPES_PATH, 'utf8');

describe('runtimeTypeShapeAlignment', () => {
  it('TraceEntry contains all TRACE_ENTRY_KEYS', () => {
    assertContractKeysInInterface(typesSource, TRACE_ENTRY_KEYS, 'TraceEntry');
  });

  it('FrontierEntry contains all FRONTIER_ENTRY_KEYS', () => {
    assertContractKeysInInterface(typesSource, FRONTIER_ENTRY_KEYS, 'FrontierEntry');
  });

  it('LlmTraceEntry contains all LLM_TRACE_ENTRY_KEYS', () => {
    assertContractKeysInInterface(typesSource, LLM_TRACE_ENTRY_KEYS, 'LlmTraceEntry');
  });
});
