import test from 'node:test';
import assert from 'node:assert/strict';
import {
  groupKey,
  buildUiGroupIndex,
  buildEnumIndex,
  buildRuleEnumSpec
} from '../engineEnumIndex.js';

// ── groupKey ──────────────────────────────────────────────────────────────────

test('groupKey returns normalized group from rule.group', () => {
  assert.equal(groupKey({ group: 'Physical' }), 'physical');
});

test('groupKey falls back to rule.ui.group', () => {
  assert.equal(groupKey({ ui: { group: 'Connectivity' } }), 'connectivity');
});

test('groupKey defaults to general', () => {
  assert.equal(groupKey({}), 'general');
  assert.equal(groupKey(), 'general');
});

// ── buildUiGroupIndex ─────────────────────────────────────────────────────────

test('buildUiGroupIndex maps field keys to groups', () => {
  const index = buildUiGroupIndex({
    fields: [
      { key: 'weight', group: 'physical' },
      { key: 'sensor', group: 'sensor' }
    ]
  });
  assert.equal(index.get('weight'), 'physical');
  assert.equal(index.get('sensor'), 'sensor');
  assert.equal(index.size, 2);
});

test('buildUiGroupIndex skips rows missing key or group', () => {
  const index = buildUiGroupIndex({
    fields: [
      { key: 'weight' },
      { group: 'physical' },
      { key: '', group: 'physical' },
      null,
      42
    ]
  });
  assert.equal(index.size, 0);
});

test('buildUiGroupIndex handles empty/missing input', () => {
  assert.equal(buildUiGroupIndex().size, 0);
  assert.equal(buildUiGroupIndex({}).size, 0);
  assert.equal(buildUiGroupIndex({ fields: null }).size, 0);
});

// ── buildEnumIndex ────────────────────────────────────────────────────────────

test('buildEnumIndex creates per-field Maps with canonical values and aliases', () => {
  const index = buildEnumIndex({
    enums: {
      connection: {
        policy: 'closed',
        values: [
          { canonical: 'wired', aliases: ['usb wired'] },
          { canonical: 'wireless', aliases: ['2.4ghz'] },
          'bluetooth'
        ]
      }
    }
  });
  assert.equal(index.size, 1);
  const conn = index.get('connection');
  assert.equal(conn.policy, 'closed');
  assert.equal(conn.index.get('wired'), 'wired');
  assert.equal(conn.index.get('usb wired'), 'wired');
  assert.equal(conn.index.get('2.4ghz'), 'wireless');
  assert.equal(conn.index.get('bluetooth'), 'bluetooth');
});

test('buildEnumIndex defaults policy to open', () => {
  const index = buildEnumIndex({
    enums: {
      coating: {
        values: ['matte', 'glossy']
      }
    }
  });
  assert.equal(index.get('coating').policy, 'open');
});

test('buildEnumIndex handles empty/missing input', () => {
  assert.equal(buildEnumIndex().size, 0);
  assert.equal(buildEnumIndex({}).size, 0);
});

// ── buildRuleEnumSpec ─────────────────────────────────────────────────────────

test('buildRuleEnumSpec builds from rule.enum array with aliases', () => {
  const spec = buildRuleEnumSpec({
    enum: [
      { canonical: 'Yes', aliases: ['true', 'y'] },
      'No'
    ],
    enum_policy: 'closed'
  });
  assert.equal(spec.policy, 'closed');
  assert.equal(spec.index.get('yes'), 'Yes');
  assert.equal(spec.index.get('true'), 'Yes');
  assert.equal(spec.index.get('y'), 'Yes');
  assert.equal(spec.index.get('no'), 'No');
});

test('buildRuleEnumSpec merges from contract.enum and validate.enum', () => {
  const spec = buildRuleEnumSpec({
    contract: {
      enum: ['Alpha']
    },
    validate: {
      enum: ['Beta']
    }
  });
  assert.equal(spec.index.has('alpha'), true);
  assert.equal(spec.index.has('beta'), true);
});

test('buildRuleEnumSpec processes aliases map', () => {
  const spec = buildRuleEnumSpec({
    aliases: {
      'bt': 'Bluetooth',
      '2.4g': 'Wireless'
    }
  });
  assert.equal(spec.index.get('bt'), 'Bluetooth');
  assert.equal(spec.index.get('2.4g'), 'Wireless');
});

test('buildRuleEnumSpec defaults policy to open', () => {
  const spec = buildRuleEnumSpec({});
  assert.equal(spec.policy, 'open');
  assert.equal(spec.index.size, 0);
});
