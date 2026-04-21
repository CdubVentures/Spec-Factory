import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

let collectPipelineSectionKeys: (sectionId: string) => string[];
let isPipelineSectionResettable: (sectionId: string) => boolean;
let buildPipelineSectionResetPayload: (
  sectionId: string,
  manifestDefaults: Record<string, unknown>,
) => Record<string, unknown>;

before(async () => {
  const mod = await loadBundledModule(
    'tools/gui-react/src/features/pipeline-settings/state/pipelineResetScope.ts',
    { prefix: 'pipeline-reset-scope-' },
  );
  ({
    collectPipelineSectionKeys,
    isPipelineSectionResettable,
    buildPipelineSectionResetPayload,
  } = mod);
});

describe('collectPipelineSectionKeys', () => {
  it('returns keys for a known runtime category (global)', () => {
    const keys = collectPipelineSectionKeys('global');
    assert.ok(Array.isArray(keys), 'keys must be an array');
    assert.ok(keys.length > 0, 'global category must expose at least one key');
  });

  it('returns keys for another runtime category (fetcher)', () => {
    const keys = collectPipelineSectionKeys('fetcher');
    assert.ok(keys.length > 0, 'fetcher category must expose at least one key');
  });

  it('returns empty array for custom section source-strategy', () => {
    assert.deepEqual(collectPipelineSectionKeys('source-strategy'), []);
  });

  it('returns empty array for custom section deterministic-strategy', () => {
    assert.deepEqual(collectPipelineSectionKeys('deterministic-strategy'), []);
  });

  it('returns empty array for module section module-cef', () => {
    assert.deepEqual(collectPipelineSectionKeys('module-cef'), []);
  });

  it('returns empty array for unknown section id', () => {
    assert.deepEqual(collectPipelineSectionKeys('does-not-exist'), []);
  });

  it('returns unique keys (no duplicates) across sub-sections', () => {
    const keys = collectPipelineSectionKeys('global');
    assert.equal(new Set(keys).size, keys.length, 'collected keys must be unique');
  });
});

describe('isPipelineSectionResettable', () => {
  it('is true for runtime category sections', () => {
    assert.equal(isPipelineSectionResettable('global'), true);
    assert.equal(isPipelineSectionResettable('fetcher'), true);
    assert.equal(isPipelineSectionResettable('validation'), true);
  });

  it('is false for custom sections without registry keys', () => {
    assert.equal(isPipelineSectionResettable('source-strategy'), false);
    assert.equal(isPipelineSectionResettable('deterministic-strategy'), false);
    assert.equal(isPipelineSectionResettable('module-cef'), false);
  });

  it('is false for unknown section id', () => {
    assert.equal(isPipelineSectionResettable('totally-unknown'), false);
  });
});

describe('buildPipelineSectionResetPayload', () => {
  it('restricts payload to keys owned by the section', () => {
    const manifestDefaults = {
      foo: 1,
      bar: 2,
      pipelineMaxConcurrency: 5,
    };
    const payload = buildPipelineSectionResetPayload('source-strategy', manifestDefaults);
    assert.deepEqual(payload, {}, 'custom section yields empty payload');
  });

  it('pulls default values from the manifest for each owned key', () => {
    const keys = collectPipelineSectionKeys('global');
    const manifestDefaults: Record<string, unknown> = {};
    for (const key of keys) manifestDefaults[key] = `default:${key}`;
    manifestDefaults.unrelated = 'should-not-leak';

    const payload = buildPipelineSectionResetPayload('global', manifestDefaults);

    assert.equal('unrelated' in payload, false, 'unrelated keys must not leak');
    for (const key of keys) {
      assert.equal(payload[key], `default:${key}`);
    }
  });

  it('skips keys that are missing from the manifest (no undefined leaks)', () => {
    const payload = buildPipelineSectionResetPayload('global', {});
    assert.deepEqual(payload, {}, 'empty manifest yields empty payload');
  });
});
