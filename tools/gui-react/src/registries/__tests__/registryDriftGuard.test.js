// WHY: Lock down that every per-field option dropdown reads from the registry SSOT.
// Hardcoded option lists drifted from the axis simplification (2026-04-21) once before
// (`required_level`/`availability` had 7+5 stale legacy values in WorkbenchDrawerContractTab.tsx).
// This guard fails the build if any monitored surface re-introduces literal option values.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..', '..');

function readSource(relativePath) {
  return readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

const RETIRED_PRIORITY_LITERALS = [
  "'identity'",
  "'critical'",
  "'expected'",
  "'editorial'",
  "'commerce'",
  "'editorial_only'",
];

const RETIRED_SHAPE_LITERALS = [
  "'structured'",
  "'key_value'",
];

const SURFACE_FILES = [
  'tools/gui-react/src/features/studio/workbench/WorkbenchDrawerContractTab.tsx',
  'tools/gui-react/src/features/studio/components/key-sections/KeyContractSection.tsx',
];

describe('registryDriftGuard — every monitored surface reads option lists from the SSOT registries', () => {
  it('WorkbenchDrawerContractTab.tsx imports priority + type/shape registries', () => {
    const source = readSource('tools/gui-react/src/features/studio/workbench/WorkbenchDrawerContractTab.tsx');
    assert.match(source, /REQUIRED_LEVEL_OPTIONS/, 'must import REQUIRED_LEVEL_OPTIONS');
    assert.match(source, /AVAILABILITY_OPTIONS/, 'must import AVAILABILITY_OPTIONS');
    assert.match(source, /DIFFICULTY_OPTIONS/, 'must import DIFFICULTY_OPTIONS');
    assert.match(source, /VALID_TYPES/, 'must import VALID_TYPES');
    assert.match(source, /VALID_SHAPES/, 'must import VALID_SHAPES');
    assert.match(source, /from\s+['"][^'"]*registries\/fieldRuleTaxonomy/, 'must import from fieldRuleTaxonomy');
    assert.match(source, /from\s+['"][^'"]*typeShapeRegistry/, 'must import from typeShapeRegistry');
  });

  it('KeyContractSection.tsx imports type/shape registry', () => {
    const source = readSource('tools/gui-react/src/features/studio/components/key-sections/KeyContractSection.tsx');
    assert.match(source, /VALID_TYPES/, 'must import VALID_TYPES');
    assert.match(source, /VALID_SHAPES/, 'must import VALID_SHAPES');
    assert.match(source, /from\s+['"][^'"]*typeShapeRegistry/, 'must import from typeShapeRegistry');
  });

  for (const surface of SURFACE_FILES) {
    it(`${surface} contains no retired priority literals`, () => {
      const source = readSource(surface);
      for (const literal of RETIRED_PRIORITY_LITERALS) {
        assert.equal(
          source.includes(literal),
          false,
          `${surface} must not contain retired priority literal ${literal}. Use REQUIRED_LEVEL_OPTIONS / AVAILABILITY_OPTIONS from the registry instead.`,
        );
      }
    });

    it(`${surface} contains no retired contract.shape literals`, () => {
      const source = readSource(surface);
      for (const literal of RETIRED_SHAPE_LITERALS) {
        assert.equal(
          source.includes(literal),
          false,
          `${surface} must not contain retired shape literal ${literal}. Use VALID_SHAPES from typeShapeRegistry instead.`,
        );
      }
    });
  }
});
