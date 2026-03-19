import test from 'node:test';
import assert from 'node:assert/strict';
import { FIELD_SYSTEM_MAP as BACKEND_FIELD_SYSTEM_MAP } from '../src/field-rules/consumerGate.js';
import { loadBundledModule } from './helpers/loadBundledModule.js';

function loadSystemMapping() {
  return loadBundledModule('tools/gui-react/src/features/studio/workbench/systemMapping.ts', {
    prefix: 'sysmapping-',
  });
}

let FIELD_SYSTEM_MAP;
let CONSUMER_TOOLTIPS;
let parseFormattedConsumerTooltip;
let parseFormattedStaticConsumerTooltip;

test('systemMapping coverage — load module', async () => {
  const mod = await loadSystemMapping();
  FIELD_SYSTEM_MAP = mod.FIELD_SYSTEM_MAP;
  CONSUMER_TOOLTIPS = mod.CONSUMER_TOOLTIPS;
  parseFormattedConsumerTooltip = mod.parseFormattedConsumerTooltip;
  parseFormattedStaticConsumerTooltip = mod.parseFormattedStaticConsumerTooltip;
  assert.ok(FIELD_SYSTEM_MAP, 'FIELD_SYSTEM_MAP exported');
  assert.ok(CONSUMER_TOOLTIPS, 'CONSUMER_TOOLTIPS exported');
  assert.equal(typeof parseFormattedConsumerTooltip, 'function', 'parseFormattedConsumerTooltip exported');
  assert.equal(typeof parseFormattedStaticConsumerTooltip, 'function', 'parseFormattedStaticConsumerTooltip exported');
});

test('every FIELD_SYSTEM_MAP key has CONSUMER_TOOLTIPS for all listed systems', async () => {
  if (!FIELD_SYSTEM_MAP) {
    const mod = await loadSystemMapping();
    FIELD_SYSTEM_MAP = mod.FIELD_SYSTEM_MAP;
    CONSUMER_TOOLTIPS = mod.CONSUMER_TOOLTIPS;
  }

  const missing = [];
  for (const [field, systems] of Object.entries(FIELD_SYSTEM_MAP)) {
    const tips = CONSUMER_TOOLTIPS[field];
    for (const sys of systems) {
      if (!tips || !tips[sys]) {
        missing.push(`${field} → ${sys}: no tooltip entry`);
      } else {
        if (!tips[sys].on) missing.push(`${field} → ${sys}: missing .on`);
        if (!tips[sys].off) missing.push(`${field} → ${sys}: missing .off`);
      }
    }
  }

  assert.deepEqual(missing, [], `Missing tooltip entries:\n${missing.join('\n')}`);
});

test('no orphan tooltip entries — every CONSUMER_TOOLTIPS field exists in FIELD_SYSTEM_MAP', async () => {
  if (!FIELD_SYSTEM_MAP) {
    const mod = await loadSystemMapping();
    FIELD_SYSTEM_MAP = mod.FIELD_SYSTEM_MAP;
    CONSUMER_TOOLTIPS = mod.CONSUMER_TOOLTIPS;
  }

  const orphans = [];
  for (const field of Object.keys(CONSUMER_TOOLTIPS)) {
    if (!FIELD_SYSTEM_MAP[field]) {
      orphans.push(field);
    }
  }

  assert.deepEqual(orphans, [], `Orphan tooltip fields not in FIELD_SYSTEM_MAP:\n${orphans.join('\n')}`);
});

test('no orphan tooltip systems — each tooltip system is listed in the field map', async () => {
  if (!FIELD_SYSTEM_MAP) {
    const mod = await loadSystemMapping();
    FIELD_SYSTEM_MAP = mod.FIELD_SYSTEM_MAP;
    CONSUMER_TOOLTIPS = mod.CONSUMER_TOOLTIPS;
  }

  const orphans = [];
  for (const [field, tips] of Object.entries(CONSUMER_TOOLTIPS)) {
    const systems = FIELD_SYSTEM_MAP[field] || [];
    for (const sys of Object.keys(tips)) {
      if (!systems.includes(sys)) {
        orphans.push(`${field} → ${sys}: tooltip exists but system not in FIELD_SYSTEM_MAP`);
      }
    }
  }

  assert.deepEqual(orphans, [], `Orphan tooltip systems:\n${orphans.join('\n')}`);
});

test('enum.additional_values exists in FIELD_SYSTEM_MAP', async () => {
  if (!FIELD_SYSTEM_MAP) {
    const mod = await loadSystemMapping();
    FIELD_SYSTEM_MAP = mod.FIELD_SYSTEM_MAP;
  }

  assert.ok(
    FIELD_SYSTEM_MAP['enum.additional_values'],
    'enum.additional_values must be present in FIELD_SYSTEM_MAP'
  );
  assert.ok(
    FIELD_SYSTEM_MAP['enum.additional_values'].length >= 1,
    'enum.additional_values must map to at least one system'
  );
});

test('frontend and backend FIELD_SYSTEM_MAP stay in parity', async () => {
  if (!FIELD_SYSTEM_MAP) {
    const mod = await loadSystemMapping();
    FIELD_SYSTEM_MAP = mod.FIELD_SYSTEM_MAP;
  }

  const frontendEntries = Object.entries(FIELD_SYSTEM_MAP)
    .map(([fieldPath, systems]) => [fieldPath, [...systems].sort()]);
  const backendEntries = Object.entries(BACKEND_FIELD_SYSTEM_MAP)
    .map(([fieldPath, systems]) => [fieldPath, [...systems].sort()]);

  frontendEntries.sort((a, b) => a[0].localeCompare(b[0]));
  backendEntries.sort((a, b) => a[0].localeCompare(b[0]));

  assert.deepEqual(backendEntries, frontendEntries);
});

test('authorable compile-time knobs stay out of consumer maps when no downstream system reads them', async () => {
  if (!FIELD_SYSTEM_MAP) {
    const mod = await loadSystemMapping();
    FIELD_SYSTEM_MAP = mod.FIELD_SYSTEM_MAP;
  }

  assert.equal(FIELD_SYSTEM_MAP['contract.rounding.decimals'], undefined, 'frontend FIELD_SYSTEM_MAP should omit contract.rounding.decimals when no downstream system consumes it');
  assert.equal(BACKEND_FIELD_SYSTEM_MAP['contract.rounding.decimals'], undefined, 'backend FIELD_SYSTEM_MAP should omit contract.rounding.decimals when no downstream system consumes it');
  assert.equal(FIELD_SYSTEM_MAP['contract.rounding.mode'], undefined, 'frontend FIELD_SYSTEM_MAP should omit contract.rounding.mode when no downstream system consumes it');
  assert.equal(BACKEND_FIELD_SYSTEM_MAP['contract.rounding.mode'], undefined, 'backend FIELD_SYSTEM_MAP should omit contract.rounding.mode when no downstream system consumes it');
  assert.equal(FIELD_SYSTEM_MAP['priority.publish_gate'], undefined, 'frontend FIELD_SYSTEM_MAP should omit priority.publish_gate when no downstream system consumes it');
  assert.equal(BACKEND_FIELD_SYSTEM_MAP['priority.publish_gate'], undefined, 'backend FIELD_SYSTEM_MAP should omit priority.publish_gate when no downstream system consumes it');
  assert.equal(FIELD_SYSTEM_MAP['parse.unit'], undefined, 'frontend FIELD_SYSTEM_MAP should omit parse.unit when no downstream system consumes it');
  assert.equal(BACKEND_FIELD_SYSTEM_MAP['parse.unit'], undefined, 'backend FIELD_SYSTEM_MAP should omit parse.unit when no downstream system consumes it');
});

test('IDX-only dead knobs are removed while verified live runtime knobs stay mapped', async () => {
  if (!FIELD_SYSTEM_MAP) {
    const mod = await loadSystemMapping();
    FIELD_SYSTEM_MAP = mod.FIELD_SYSTEM_MAP;
  }

  const removedKnobs = [
    'parse.unit_accepts',
    'parse.allow_unitless',
    'parse.allow_ranges',
    'parse.strict_unit_required',
    'ai_assist.max_calls',
  ];

  for (const knob of removedKnobs) {
    assert.equal(FIELD_SYSTEM_MAP[knob], undefined, `frontend FIELD_SYSTEM_MAP should remove dead IDX knob ${knob}`);
    assert.equal(BACKEND_FIELD_SYSTEM_MAP[knob], undefined, `backend FIELD_SYSTEM_MAP should remove dead IDX knob ${knob}`);
  }

  assert.deepEqual(FIELD_SYSTEM_MAP['contract.range'], ['indexlab'], 'frontend FIELD_SYSTEM_MAP should expose contract.range to IDX');
  assert.deepEqual(BACKEND_FIELD_SYSTEM_MAP['contract.range'], ['indexlab'], 'backend FIELD_SYSTEM_MAP should expose contract.range to IDX');
  assert.deepEqual(FIELD_SYSTEM_MAP['contract.list_rules'], ['indexlab'], 'frontend FIELD_SYSTEM_MAP should expose contract.list_rules to IDX');
  assert.deepEqual(BACKEND_FIELD_SYSTEM_MAP['contract.list_rules'], ['indexlab'], 'backend FIELD_SYSTEM_MAP should expose contract.list_rules to IDX');
});

test('IDX tooltips point users back to the exact Field Studio key navigation path', async () => {
  const mod = await loadSystemMapping();
  const tooltip = mod.formatConsumerTooltip('search_hints.query_terms', 'indexlab', true);

  assert.match(tooltip, /Key Navigation > Search Hints > Query Terms/);
  assert.match(tooltip, /When enabled:/);
  assert.match(tooltip, /When disabled:/);
});

test('all formatted dynamic consumer tooltips parse into structured sections', async () => {
  const mod = await loadSystemMapping();
  const parseFn = mod.parseFormattedConsumerTooltip;
  const formatFn = mod.formatConsumerTooltip;
  const map = mod.FIELD_SYSTEM_MAP;

  const failures = [];
  for (const [fieldPath, systems] of Object.entries(map)) {
    for (const system of systems) {
      for (const enabled of [true, false]) {
        const formatted = formatFn(fieldPath, system, enabled);
        const parsed = parseFn(formatted);
        if (!parsed || !parsed.title || !parsed.whenEnabled || !parsed.whenDisabled || !parsed.action) {
          failures.push(`${fieldPath} -> ${system} (${enabled ? 'enabled' : 'disabled'})`);
        }
      }
    }
  }

  assert.deepEqual(failures, []);
});

test('all formatted static consumer tooltips parse into structured sections', async () => {
  const mod = await loadSystemMapping();
  const parseFn = mod.parseFormattedStaticConsumerTooltip;
  const formatFn = mod.formatStaticConsumerTooltip;
  const map = mod.FIELD_SYSTEM_MAP;

  const failures = [];
  for (const [fieldPath, systems] of Object.entries(map)) {
    for (const system of systems) {
      const formatted = formatFn(fieldPath, system);
      const parsed = parseFn(formatted);
      if (!parsed || !parsed.title || !parsed.summary) {
        failures.push(`${fieldPath} -> ${system}`);
      }
    }
  }

  assert.deepEqual(failures, []);
});
