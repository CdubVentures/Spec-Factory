import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

let mod;

function createStageRegistryStub(groupName, keys) {
  const entries = keys.map((key) => ({
    key,
    label: `${groupName}:${key}`,
    tip: `${groupName}:${key}:tip`,
  }));
  return [
    `export const ${groupName}_STAGE_KEYS = ${JSON.stringify(keys)};`,
    `export const ${groupName}_STAGE_REGISTRY = ${JSON.stringify(entries)};`,
    '',
  ].join('\n');
}

async function getModule() {
  if (mod) return mod;
  mod = await loadBundledModule(
    'tools/gui-react/src/features/runtime-ops/panels/shared/stageGroupRegistry.ts',
    {
      prefix: 'stage-group-registry-',
      stubs: {
        'react': 'export function createElement(type, props) { return { type, props }; }',
        '../prefetch/prefetchStageRegistry.ts': createStageRegistryStub('PREFETCH', [
          'needset',
          'brand_resolver',
          'search_profile',
          'search_planner',
          'query_journey',
          'search_results',
          'serp_selector',
          'domain_classifier',
        ]),
        '../fetch/fetchStageRegistry.ts': createStageRegistryStub('FETCH', [
          'queued',
          'inflight',
        ]),
        '../extraction/extractionStageRegistry.ts': createStageRegistryStub('EXTRACTION', [
          'field_extraction',
        ]),
        '../validation/validationStageRegistry.ts': createStageRegistryStub('VALIDATION', [
          'quality_gate',
        ]),
      },
    },
  );
  return mod;
}

describe('STAGE_GROUP_REGISTRY', () => {
  it('has exactly 4 entries', async () => {
    const { STAGE_GROUP_REGISTRY } = await getModule();
    assert.equal(STAGE_GROUP_REGISTRY.length, 4);
  });

  it('each entry has a unique id from STAGE_GROUP_KEYS', async () => {
    const { STAGE_GROUP_REGISTRY, STAGE_GROUP_KEYS } = await getModule();
    const ids = STAGE_GROUP_REGISTRY.map((g) => g.id);
    assert.equal(new Set(ids).size, ids.length, 'ids must be unique');
    for (const id of ids) {
      assert.ok(STAGE_GROUP_KEYS.includes(id), `unexpected group id: ${id}`);
    }
  });

  it('every entry has non-empty keys array with unique values', async () => {
    const { STAGE_GROUP_REGISTRY } = await getModule();
    for (const group of STAGE_GROUP_REGISTRY) {
      assert.ok(group.keys.length > 0, `${group.id} must have at least one key`);
      assert.equal(
        new Set(group.keys).size, group.keys.length,
        `${group.id} has duplicate keys`,
      );
    }
  });

  it('every entry registry length matches keys length', async () => {
    const { STAGE_GROUP_REGISTRY } = await getModule();
    for (const group of STAGE_GROUP_REGISTRY) {
      assert.equal(
        group.registry.length, group.keys.length,
        `${group.id}: registry (${group.registry.length}) !== keys (${group.keys.length})`,
      );
    }
  });

  it('registry entry keys match keys array in order', async () => {
    const { STAGE_GROUP_REGISTRY } = await getModule();
    for (const group of STAGE_GROUP_REGISTRY) {
      const registryKeys = group.registry.map((e) => e.key);
      assert.deepEqual(registryKeys, [...group.keys], `${group.id}: registry order mismatch`);
    }
  });

  it('prefetch group has exactly 8 keys', async () => {
    const { STAGE_GROUP_REGISTRY } = await getModule();
    const prefetch = STAGE_GROUP_REGISTRY.find((g) => g.id === 'prefetch');
    assert.ok(prefetch, 'prefetch group must exist');
    assert.equal(prefetch.keys.length, 8);
  });

  it('each new group has at least 1 entry', async () => {
    const { STAGE_GROUP_REGISTRY } = await getModule();
    for (const id of ['fetch', 'extraction', 'validation']) {
      const group = STAGE_GROUP_REGISTRY.find((g) => g.id === id);
      assert.ok(group, `${id} group must exist`);
      assert.ok(group.registry.length >= 1, `${id} must have at least 1 registry entry`);
    }
  });

  it('every entry has non-empty label and tip', async () => {
    const { STAGE_GROUP_REGISTRY } = await getModule();
    for (const group of STAGE_GROUP_REGISTRY) {
      assert.ok(group.label.length > 0, `${group.id} must have a label`);
      assert.ok(group.tip.length > 0, `${group.id} must have a tip`);
    }
  });
});
