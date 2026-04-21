// WHY: Contract test for the three tier-budget runtime knobs (tier1SeedCap,
// tier2GroupCap, tier3KeyCap). They replace the single searchProfileQueryCap
// consumed by seeds. Without per-tier budgets, seeds starve tier 2 + tier 3
// queries — producing zero group_search / key_search rows in production runs.

import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';

const expected = {
  tier1SeedCap: { default: 10, uiTipIncludes: 'seed' },
  tier2GroupCap: { default: 10, uiTipIncludes: 'group' },
  tier3KeyCap: { default: 20, uiTipIncludes: 'key' },
};

describe('Tier budget runtime knobs', () => {
  for (const [key, spec] of Object.entries(expected)) {
    const entry = RUNTIME_SETTINGS_REGISTRY.find((e) => e.key === key);

    it(`${key} is registered`, () => {
      ok(entry, `${key} must be present in RUNTIME_SETTINGS_REGISTRY`);
    });

    it(`${key} is an int defaulting to ${spec.default}`, () => {
      strictEqual(entry.type, 'int', `${key}.type must be int`);
      strictEqual(entry.default, spec.default, `${key}.default must be ${spec.default}`);
      strictEqual(entry.min, 0, `${key}.min must be 0 (allow disabling a tier via 0-cap)`);
    });

    it(`${key} renders under Pipeline Settings → Planner → Search Profile → Tier Budgets`, () => {
      strictEqual(entry.uiCategory, 'planner', `${key}.uiCategory must be 'planner'`);
      strictEqual(entry.uiSection, 'search-profile', `${key}.uiSection must be 'search-profile'`);
      strictEqual(entry.uiGroup, 'Tier Budgets', `${key}.uiGroup must be 'Tier Budgets'`);
    });

    it(`${key} has a tooltip mentioning '${spec.uiTipIncludes}'`, () => {
      ok(
        typeof entry.uiTip === 'string' && entry.uiTip.toLowerCase().includes(spec.uiTipIncludes.toLowerCase()),
        `${key}.uiTip must mention '${spec.uiTipIncludes}'. Got: ${entry.uiTip}`,
      );
    });

    it(`${key} maps to configKey=${key} for O(1) config propagation`, () => {
      strictEqual(entry.configKey, key, `${key}.configKey must equal the registry key`);
    });
  }

  it('all three knobs share the same uiSection and uiGroup (they render together)', () => {
    const keys = ['tier1SeedCap', 'tier2GroupCap', 'tier3KeyCap'];
    const entries = keys.map((k) => RUNTIME_SETTINGS_REGISTRY.find((e) => e.key === k));
    for (let i = 1; i < entries.length; i++) {
      strictEqual(entries[i].uiSection, entries[0].uiSection, 'all knobs must share uiSection');
      strictEqual(entries[i].uiGroup, entries[0].uiGroup, 'all knobs must share uiGroup');
    }
  });
});
