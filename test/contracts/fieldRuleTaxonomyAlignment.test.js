// WHY: Contract test verifying that fieldRuleTaxonomy.ts exports all expected
// enum registries with correct member counts. Prevents hardcoded enum drift.
// Reads the TS source as text since node --test can't import .ts directly.

import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TAXONOMY_PATH = join(__dirname, '../../tools/gui-react/src/registries/fieldRuleTaxonomy.ts');
const source = readFileSync(TAXONOMY_PATH, 'utf8');

function extractArrayValues(varName) {
  const pattern = new RegExp(`(?:export\\s+)?const\\s+${varName}\\s*=\\s*([\\w_]+)\\.map`);
  const mapMatch = source.match(pattern);
  if (mapMatch) {
    const registryName = mapMatch[1];
    return extractRegistryValues(registryName);
  }
  return null;
}

function extractRegistryValues(registryName) {
  const pattern = new RegExp(
    `const\\s+${registryName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`,
  );
  const match = source.match(pattern);
  if (!match) return null;
  const values = [];
  for (const line of match[1].split('\n')) {
    const valMatch = line.match(/value:\s*'([^']+)'/);
    if (valMatch) values.push(valMatch[1]);
  }
  return values;
}

function extractRankMap(registryName) {
  const pattern = new RegExp(
    `const\\s+${registryName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as\\s+const`,
  );
  const match = source.match(pattern);
  if (!match) return null;
  const map = {};
  for (const line of match[1].split('\n')) {
    const valMatch = line.match(/value:\s*'([^']+)'\s*,\s*rank:\s*(\d+)/);
    if (valMatch) map[valMatch[1]] = Number(valMatch[2]);
  }
  return map;
}

describe('fieldRuleTaxonomy SSOT', () => {
  describe('REQUIRED_LEVEL', () => {
    const values = extractRegistryValues('REQUIRED_LEVEL_REGISTRY');
    it('registry has 7 values', () => {
      ok(values, 'REQUIRED_LEVEL_REGISTRY not found');
      strictEqual(values.length, 7);
    });
    it('includes identity and commerce', () => {
      ok(values.includes('identity'));
      ok(values.includes('commerce'));
    });
    it('rank: identity=7, commerce=1', () => {
      const ranks = extractRankMap('REQUIRED_LEVEL_REGISTRY');
      strictEqual(ranks['identity'], 7);
      strictEqual(ranks['commerce'], 1);
    });
  });

  describe('DIFFICULTY', () => {
    const values = extractRegistryValues('DIFFICULTY_REGISTRY');
    it('registry has 4 values', () => {
      ok(values, 'DIFFICULTY_REGISTRY not found');
      strictEqual(values.length, 4);
    });
    it('rank: instrumented=4, easy=1', () => {
      const ranks = extractRankMap('DIFFICULTY_REGISTRY');
      strictEqual(ranks['instrumented'], 4);
      strictEqual(ranks['easy'], 1);
    });
  });

  describe('AVAILABILITY', () => {
    const values = extractRegistryValues('AVAILABILITY_REGISTRY');
    it('registry has 5 values', () => {
      ok(values, 'AVAILABILITY_REGISTRY not found');
      strictEqual(values.length, 5);
    });
    it('rank: always=5, editorial_only=1', () => {
      const ranks = extractRankMap('AVAILABILITY_REGISTRY');
      strictEqual(ranks['always'], 5);
      strictEqual(ranks['editorial_only'], 1);
    });
  });

  describe('AI_MODE', () => {
    const values = extractRegistryValues('AI_MODE_REGISTRY');
    it('registry has 4 values: off, advisory, planner, judge', () => {
      ok(values, 'AI_MODE_REGISTRY not found');
      strictEqual(values.length, 4);
      ok(values.includes('off'));
      ok(values.includes('advisory'));
      ok(values.includes('planner'));
      ok(values.includes('judge'));
    });
  });

  describe('AI_MODEL_STRATEGY', () => {
    const values = extractRegistryValues('AI_MODEL_STRATEGY_REGISTRY');
    it('registry has 3 values: auto, force_fast, force_deep', () => {
      ok(values, 'AI_MODEL_STRATEGY_REGISTRY not found');
      strictEqual(values.length, 3);
      ok(values.includes('auto'));
      ok(values.includes('force_fast'));
      ok(values.includes('force_deep'));
    });
  });

  describe('ENUM_POLICY', () => {
    const values = extractRegistryValues('ENUM_POLICY_REGISTRY');
    it('registry has 3 values: open, closed, open_prefer_known', () => {
      ok(values, 'ENUM_POLICY_REGISTRY not found');
      strictEqual(values.length, 3);
      ok(values.includes('open'));
      ok(values.includes('closed'));
      ok(values.includes('open_prefer_known'));
    });
  });

  describe('exports exist', () => {
    const expectedExports = [
      'REQUIRED_LEVEL_OPTIONS', 'REQUIRED_LEVEL_RANK',
      'DIFFICULTY_OPTIONS', 'DIFFICULTY_RANK',
      'AVAILABILITY_OPTIONS', 'AVAILABILITY_RANK',
      'AI_MODE_OPTIONS', 'AI_MODEL_STRATEGY_OPTIONS',
      'ENUM_POLICY_OPTIONS', 'tagCls',
    ];
    for (const name of expectedExports) {
      it(`exports ${name}`, () => {
        ok(source.includes(`export const ${name}`) || source.includes(`export function ${name}`),
          `${name} not exported from fieldRuleTaxonomy.ts`);
      });
    }
  });
});
