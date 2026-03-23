import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import {
  poolBadgeClass,
  poolDotClass,
  poolMeterFillClass,
  poolSelectedTabClass,
  poolOutlineTabClass,
  stageBadgeClass,
  stageMeterFillClass,
  stageLabel,
} from '../helpers';

/**
 * Characterization tests — lock down current pool/stage mapping behavior
 * before refactoring to a registry-driven approach.
 */

interface PoolStageExpected {
  badge: string;
  dot: string;
  meterFill: string;
  selectedTab: string;
  outlineTab: string;
  stageLabel: string;
}

const EXPECTED: Record<string, PoolStageExpected> = {
  search: {
    badge: 'sf-chip-accent',
    dot: 'sf-dot-accent',
    meterFill: 'sf-meter-fill',
    selectedTab: 'sf-prefetch-tab-idle-accent',
    outlineTab: 'sf-prefetch-tab-outline-accent',
    stageLabel: 'Searching',
  },
  fetch: {
    badge: 'sf-chip-success',
    dot: 'sf-dot-success',
    meterFill: 'sf-meter-fill-success',
    selectedTab: 'sf-prefetch-tab-idle-success',
    outlineTab: 'sf-prefetch-tab-outline-success',
    stageLabel: 'Fetching',
  },
  parse: {
    badge: 'sf-chip-info',
    dot: 'sf-dot-info',
    meterFill: 'sf-meter-fill-info',
    selectedTab: 'sf-prefetch-tab-idle-info',
    outlineTab: 'sf-prefetch-tab-outline-info',
    stageLabel: 'Parsing',
  },
  llm: {
    badge: 'sf-chip-warning',
    dot: 'sf-dot-warning',
    meterFill: 'sf-meter-fill-warning',
    selectedTab: 'sf-prefetch-tab-idle-warning',
    outlineTab: 'sf-prefetch-tab-outline-warning',
    stageLabel: 'Extracting',
  },
  index: {
    badge: 'sf-chip-success',
    dot: 'sf-dot-success',
    meterFill: 'sf-meter-fill-success',
    selectedTab: 'sf-prefetch-tab-idle-success',
    outlineTab: 'sf-prefetch-tab-outline-success',
    stageLabel: 'Indexing',
  },
  unknown_key: {
    badge: 'sf-chip-neutral',
    dot: 'sf-dot-neutral',
    meterFill: 'sf-meter-fill-neutral',
    selectedTab: 'sf-prefetch-tab-idle-neutral',
    outlineTab: 'sf-prefetch-tab-outline-neutral',
    stageLabel: 'unknown_key',
  },
};

for (const [key, expected] of Object.entries(EXPECTED)) {
  describe(`pool/stage key "${key}"`, () => {
    it(`poolBadgeClass → ${expected.badge}`, () => {
      strictEqual(poolBadgeClass(key), expected.badge);
    });
    it(`poolDotClass → ${expected.dot}`, () => {
      strictEqual(poolDotClass(key), expected.dot);
    });
    it(`poolMeterFillClass → ${expected.meterFill}`, () => {
      strictEqual(poolMeterFillClass(key), expected.meterFill);
    });
    it(`poolSelectedTabClass → ${expected.selectedTab}`, () => {
      strictEqual(poolSelectedTabClass(key), expected.selectedTab);
    });
    it(`poolOutlineTabClass → ${expected.outlineTab}`, () => {
      strictEqual(poolOutlineTabClass(key), expected.outlineTab);
    });
    it(`stageBadgeClass → ${expected.badge}`, () => {
      strictEqual(stageBadgeClass(key), expected.badge);
    });
    it(`stageMeterFillClass → ${expected.meterFill}`, () => {
      strictEqual(stageMeterFillClass(key), expected.meterFill);
    });
    it(`stageLabel → ${expected.stageLabel}`, () => {
      strictEqual(stageLabel(key), expected.stageLabel);
    });
  });
}

describe('pool/stage equivalence invariants', () => {
  const KEYS = ['search', 'fetch', 'parse', 'llm', 'index', 'bogus'];

  for (const key of KEYS) {
    it(`stageBadgeClass("${key}") === poolBadgeClass("${key}")`, () => {
      strictEqual(stageBadgeClass(key), poolBadgeClass(key));
    });
    it(`stageMeterFillClass("${key}") === poolMeterFillClass("${key}")`, () => {
      strictEqual(stageMeterFillClass(key), poolMeterFillClass(key));
    });
  }
});
