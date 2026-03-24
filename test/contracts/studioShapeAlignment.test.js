// WHY: Contract test verifying TS interfaces in types/studio.ts
// declare every field from the canonical studio API shape descriptors.
// Skip FieldRule, StudioConfig, ComponentSource, EnumEntry — all have [k: string]: unknown.

import { describe, it } from 'node:test';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  STUDIO_PAYLOAD_KEYS,
  FIELD_STUDIO_MAP_RESPONSE_KEYS,
  TOOLTIP_BANK_RESPONSE_KEYS,
  ARTIFACT_ENTRY_KEYS,
  KNOWN_VALUES_RESPONSE_KEYS,
  COMPONENT_DB_ITEM_KEYS,
} from '../../src/features/studio/contracts/studioShapes.js';
import { assertContractKeysInInterface } from './helpers/tsInterfaceParser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TYPES_PATH = join(__dirname, '../../tools/gui-react/src/types/studio.ts');
const typesSource = readFileSync(TYPES_PATH, 'utf8');

describe('studioShapeAlignment', () => {
  it('StudioPayload contains all STUDIO_PAYLOAD_KEYS', () => {
    assertContractKeysInInterface(typesSource, STUDIO_PAYLOAD_KEYS, 'StudioPayload');
  });

  it('FieldStudioMapResponse contains all FIELD_STUDIO_MAP_RESPONSE_KEYS', () => {
    assertContractKeysInInterface(typesSource, FIELD_STUDIO_MAP_RESPONSE_KEYS, 'FieldStudioMapResponse');
  });

  it('TooltipBankResponse contains all TOOLTIP_BANK_RESPONSE_KEYS', () => {
    assertContractKeysInInterface(typesSource, TOOLTIP_BANK_RESPONSE_KEYS, 'TooltipBankResponse');
  });

  it('ArtifactEntry contains all ARTIFACT_ENTRY_KEYS', () => {
    assertContractKeysInInterface(typesSource, ARTIFACT_ENTRY_KEYS, 'ArtifactEntry');
  });

  it('KnownValuesResponse contains all KNOWN_VALUES_RESPONSE_KEYS', () => {
    assertContractKeysInInterface(typesSource, KNOWN_VALUES_RESPONSE_KEYS, 'KnownValuesResponse');
  });

  it('ComponentDbItem contains all COMPONENT_DB_ITEM_KEYS', () => {
    assertContractKeysInInterface(typesSource, COMPONENT_DB_ITEM_KEYS, 'ComponentDbItem');
  });
});
