import { describe, it } from 'node:test';
import { ok, strictEqual } from 'node:assert';
import {
  POOL_STAGE_KEYS,
  POOL_STAGE_REGISTRY,
  resolvePoolStage,
} from '../poolStageRegistry.ts';
import type { PoolStageVisuals } from '../poolStageRegistry.ts';

const REQUIRED_PROPS: (keyof PoolStageVisuals)[] = [
  'badge', 'dot', 'meterFill', 'selectedTab', 'outlineTab',
  'stageLabel', 'activeCount', 'laneClass', 'labelClass', 'tintClass', 'shortLabel',
];

describe('POOL_STAGE_REGISTRY', () => {
  it('POOL_STAGE_KEYS contains exactly the 5 canonical pool keys', () => {
    const expected = ['search', 'fetch', 'parse', 'llm', 'index'];
    strictEqual(POOL_STAGE_KEYS.length, expected.length);
    for (const key of expected) {
      ok(POOL_STAGE_KEYS.includes(key as never), `missing key: ${key}`);
    }
  });

  it('registry has an entry for every key in POOL_STAGE_KEYS', () => {
    for (const key of POOL_STAGE_KEYS) {
      ok(POOL_STAGE_REGISTRY[key], `missing registry entry for "${key}"`);
    }
  });

  for (const key of ['search', 'fetch', 'parse', 'llm', 'index'] as const) {
    describe(`entry "${key}"`, () => {
      for (const prop of REQUIRED_PROPS) {
        it(`has string property "${prop}"`, () => {
          strictEqual(typeof POOL_STAGE_REGISTRY[key][prop], 'string',
            `${key}.${prop} must be a string`);
        });
      }
    });
  }
});

describe('resolvePoolStage', () => {
  it('returns registry entry for known keys', () => {
    strictEqual(resolvePoolStage('search').badge, POOL_STAGE_REGISTRY.search.badge);
    strictEqual(resolvePoolStage('llm').stageLabel, POOL_STAGE_REGISTRY.llm.stageLabel);
  });

  it('returns neutral fallback for unknown keys', () => {
    const fallback = resolvePoolStage('nonexistent');
    strictEqual(fallback.badge, 'sf-chip-neutral');
    strictEqual(fallback.dot, 'sf-dot-neutral');
    strictEqual(fallback.meterFill, 'sf-meter-fill-neutral');
    strictEqual(fallback.selectedTab, 'sf-prefetch-tab-idle-neutral');
    strictEqual(fallback.outlineTab, 'sf-prefetch-tab-outline-neutral');
    strictEqual(fallback.stageLabel, '');
    strictEqual(fallback.activeCount, 'sf-text-subtle');
  });

  for (const prop of REQUIRED_PROPS) {
    it(`fallback has string property "${prop}"`, () => {
      strictEqual(typeof resolvePoolStage('bogus')[prop], 'string');
    });
  }
});
