// WHY: Contract test for the two new Discovery History runtime knobs
// (discoveryUrlHistoryEnabled, discoveryQueryHistoryEnabled). These gate whether
// prior-run URLs / queries get injected into the LLM planner prompt. Both default
// off, matching the per-finder pattern in finderModuleRegistry.js.

import { describe, it } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { RUNTIME_SETTINGS_REGISTRY } from '../settingsRegistry.js';

const expected = {
  discoveryUrlHistoryEnabled: {
    uiLabel: 'URL history',
    uiTipIncludes: 'URLs',
  },
  discoveryQueryHistoryEnabled: {
    uiLabel: 'Query history',
    uiTipIncludes: 'queries',
  },
};

describe('Discovery History runtime knobs', () => {
  for (const [key, spec] of Object.entries(expected)) {
    const entry = RUNTIME_SETTINGS_REGISTRY.find((e) => e.key === key);

    it(`${key} is registered`, () => {
      ok(entry, `${key} must be present in RUNTIME_SETTINGS_REGISTRY`);
    });

    it(`${key} is a bool defaulting to false`, () => {
      strictEqual(entry.type, 'bool', `${key}.type must be bool`);
      strictEqual(entry.default, false, `${key}.default must be false`);
    });

    it(`${key} renders under Pipeline Settings → Planner → Search Profile → Discovery History`, () => {
      strictEqual(entry.uiCategory, 'planner', `${key}.uiCategory must be 'planner'`);
      strictEqual(entry.uiSection, 'search-profile', `${key}.uiSection must be 'search-profile'`);
      strictEqual(entry.uiGroup, 'Discovery History', `${key}.uiGroup must be 'Discovery History'`);
    });

    it(`${key} has a user-facing label '${spec.uiLabel}'`, () => {
      strictEqual(entry.uiLabel, spec.uiLabel, `${key}.uiLabel must be '${spec.uiLabel}'`);
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

  it('both knobs share the same uiSection and uiGroup (they render together)', () => {
    const url = RUNTIME_SETTINGS_REGISTRY.find((e) => e.key === 'discoveryUrlHistoryEnabled');
    const query = RUNTIME_SETTINGS_REGISTRY.find((e) => e.key === 'discoveryQueryHistoryEnabled');
    strictEqual(url.uiSection, query.uiSection, 'both knobs must share uiSection');
    strictEqual(url.uiGroup, query.uiGroup, 'both knobs must share uiGroup');
    strictEqual(url.group, query.group, 'both knobs must share manifest group');
  });
});
