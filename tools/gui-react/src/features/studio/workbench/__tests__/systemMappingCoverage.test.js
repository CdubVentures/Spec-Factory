import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

async function createSystemMappingHarness() {
  const mod = await loadBundledModule('tools/gui-react/src/features/studio/workbench/systemMapping.ts', {
    prefix: 'sysmapping-',
  });
  return {
    fieldSystemMap: mod.FIELD_SYSTEM_MAP,
    consumerTooltips: mod.CONSUMER_TOOLTIPS,
    parseFormattedConsumerTooltip: mod.parseFormattedConsumerTooltip,
    parseFormattedStaticConsumerTooltip: mod.parseFormattedStaticConsumerTooltip,
    formatConsumerTooltip: mod.formatConsumerTooltip,
    formatStaticConsumerTooltip: mod.formatStaticConsumerTooltip,
  };
}

test('systemMapping exports the public contract used by the workbench', async () => {
  const harness = await createSystemMappingHarness();

  assert.ok(harness.fieldSystemMap);
  assert.ok(harness.consumerTooltips);
  assert.equal(typeof harness.parseFormattedConsumerTooltip, 'function');
  assert.equal(typeof harness.parseFormattedStaticConsumerTooltip, 'function');
});

test('every mapped field exposes tooltips for each listed system', async () => {
  const harness = await createSystemMappingHarness();
  const missing = [];

  for (const [field, systems] of Object.entries(harness.fieldSystemMap)) {
    const tips = harness.consumerTooltips[field];
    for (const system of systems) {
      if (!tips || !tips[system]) {
        missing.push(`${field} -> ${system}: no tooltip entry`);
        continue;
      }
      if (!tips[system].on) missing.push(`${field} -> ${system}: missing .on`);
      if (!tips[system].off) missing.push(`${field} -> ${system}: missing .off`);
    }
  }

  assert.deepEqual(missing, []);
});

test('tooltip fields do not drift away from the mapped field set', async () => {
  const harness = await createSystemMappingHarness();
  const orphanFields = Object.keys(harness.consumerTooltips).filter((field) => !harness.fieldSystemMap[field]);

  assert.deepEqual(orphanFields, []);
});

test('tooltip systems do not drift away from each field mapping', async () => {
  const harness = await createSystemMappingHarness();
  const orphanSystems = [];

  for (const [field, tips] of Object.entries(harness.consumerTooltips)) {
    const systems = harness.fieldSystemMap[field] || [];
    for (const system of Object.keys(tips)) {
      if (!systems.includes(system)) {
        orphanSystems.push(`${field} -> ${system}`);
      }
    }
  }

  assert.deepEqual(orphanSystems, []);
});

test('dead knobs stay out of the published field map', async () => {
  const harness = await createSystemMappingHarness();
  const omittedKnobs = [
    'contract.rounding.decimals',
    'contract.rounding.mode',
    'parse.unit',
    'parse.allow_unitless',
    'parse.allow_ranges',
  ];

  for (const knob of omittedKnobs) {
    assert.equal(harness.fieldSystemMap[knob], undefined);
  }
});

test('aspirational IDX-only knobs are removed from the field contract', async () => {
  const harness = await createSystemMappingHarness();

  // WHY: contract.range and contract.list_rules were IDX-only
  // with zero pipeline consumers. Removed 2026-04-05.
  // contract.unknown_token retired entirely (unk sentinel removed).
  assert.equal(harness.fieldSystemMap['contract.range'], undefined);
  assert.equal(harness.fieldSystemMap['contract.list_rules'], undefined);
});

test('IDX tooltips point users to the field studio navigation path', async () => {
  const harness = await createSystemMappingHarness();
  const tooltip = harness.formatConsumerTooltip('search_hints.query_terms', 'indexlab', true);

  assert.match(tooltip, /Key Navigation > Search Hints > Query Terms/);
  assert.match(tooltip, /When enabled:/);
  assert.match(tooltip, /When disabled:/);
});

test('formatted dynamic consumer tooltips remain parseable into structured sections', async () => {
  const harness = await createSystemMappingHarness();
  const failures = [];

  for (const [fieldPath, systems] of Object.entries(harness.fieldSystemMap)) {
    for (const system of systems) {
      for (const enabled of [true, false]) {
        const formatted = harness.formatConsumerTooltip(fieldPath, system, enabled);
        const parsed = harness.parseFormattedConsumerTooltip(formatted);
        if (!parsed || !parsed.title || !parsed.whenEnabled || !parsed.whenDisabled || !parsed.action) {
          failures.push(`${fieldPath} -> ${system} (${enabled ? 'enabled' : 'disabled'})`);
        }
      }
    }
  }

  assert.deepEqual(failures, []);
});

test('formatted static consumer tooltips remain parseable into structured sections', async () => {
  const harness = await createSystemMappingHarness();
  const failures = [];

  for (const [fieldPath, systems] of Object.entries(harness.fieldSystemMap)) {
    for (const system of systems) {
      const formatted = harness.formatStaticConsumerTooltip(fieldPath, system);
      const parsed = harness.parseFormattedStaticConsumerTooltip(formatted);
      if (!parsed || !parsed.title || !parsed.summary) {
        failures.push(`${fieldPath} -> ${system}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});
