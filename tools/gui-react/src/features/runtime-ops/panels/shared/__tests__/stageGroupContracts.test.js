import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

let mod;

async function getModule() {
  if (mod) return mod;
  mod = await loadBundledModule(
    'tools/gui-react/src/features/runtime-ops/panels/shared/stageGroupContracts.ts',
    { prefix: 'stage-group-contracts-', stubs: {} },
  );
  return mod;
}

describe('STAGE_GROUP_KEYS', () => {
  it('contains exactly prefetch, fetch, extraction', async () => {
    const { STAGE_GROUP_KEYS } = await getModule();
    assert.deepEqual([...STAGE_GROUP_KEYS], ['prefetch', 'fetch', 'extraction']);
  });
});

describe('buildStageEntry', () => {
  it('returns object with all required fields', async () => {
    const { buildStageEntry } = await getModule();
    const selectProps = (ctx) => ({ value: ctx.data });
    const Component = (props) => ({ type: 'div', props });

    const entry = buildStageEntry(
      'test_key', 'Test Label', 'Test tooltip',
      'sf-dot-info', 'sf-tab-idle-info', 'sf-tab-outline-info',
      Component, selectProps,
    );

    assert.equal(entry.key, 'test_key');
    assert.equal(entry.label, 'Test Label');
    assert.equal(entry.tip, 'Test tooltip');
    assert.equal(entry.markerClass, 'sf-dot-info');
    assert.equal(entry.idleClass, 'sf-tab-idle-info');
    assert.equal(entry.outlineClass, 'sf-tab-outline-info');
    assert.equal(typeof entry.render, 'function');
    assert.equal(typeof entry.selectProps, 'function');
  });

  it('render returns a React element with props from selectProps', async () => {
    const { buildStageEntry } = await getModule();
    const selectProps = (ctx) => ({ value: ctx.data, scope: ctx.persistScope });
    const Component = (props) => null;

    const entry = buildStageEntry(
      'key', 'Label', 'tip',
      'a', 'b', 'c',
      Component, selectProps,
    );

    const ctx = { data: 'test-data', persistScope: 'mouse' };
    const element = entry.render(ctx);

    // createElement returns { type, props, ... } — verify the props match selectProps output
    assert.equal(element.type, Component);
    assert.equal(element.props.value, 'test-data');
    assert.equal(element.props.scope, 'mouse');
  });

  it('selectProps is the same function passed in', async () => {
    const { buildStageEntry } = await getModule();
    const selectProps = (ctx) => ({ x: 1 });
    const Component = () => null;

    const entry = buildStageEntry('k', 'L', 't', 'a', 'b', 'c', Component, selectProps);
    assert.equal(entry.selectProps, selectProps);
  });
});
