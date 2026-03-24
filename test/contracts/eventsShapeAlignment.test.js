// WHY: Contract test verifying that TS interfaces in types/events.ts
// declare every field from the canonical process/event shape descriptors.
// Skip RuntimeEvent — has [key: string]: unknown index signature.

import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PROCESS_STATUS_KEYS } from '../../src/app/api/contracts/processStatusShape.js';
import { assertContractKeysInInterface } from './helpers/tsInterfaceParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../tools/gui-react/src/types/events.ts');
const typesSource = readFileSync(TYPES_PATH, 'utf8');

describe('eventsShapeAlignment', () => {
  it('ProcessStatus contains all PROCESS_STATUS_KEYS', () => {
    assertContractKeysInInterface(typesSource, PROCESS_STATUS_KEYS, 'ProcessStatus');
  });
});
