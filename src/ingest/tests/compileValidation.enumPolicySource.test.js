import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildCompileValidation, buildParseTemplateCatalog } from '../compileValidation.js';

function baseRule(key, enumBlock = {}) {
  return {
    key,
    contract: { type: 'string', shape: 'scalar' },
    priority: {
      required_level: 'non_mandatory',
      availability: 'sometimes',
      difficulty: 'medium',
    },
    enum: enumBlock,
    ui: {
      label: key,
      group: 'specs',
      order: 1,
      tooltip_md: key,
    },
  };
}

function openEnum(source) {
  return {
    policy: 'open',
    source,
    new_value_policy: {
      accept_if_evidence: true,
      mark_needs_curation: true,
    },
  };
}

describe('buildCompileValidation enum policy/source contract', () => {
  it('documents boolean parse templates as yes/no/n/a string tokens', () => {
    const catalog = buildParseTemplateCatalog();

    assert.match(catalog.boolean_yes_no_unk.description, /yes\/no\/n\/a/);
    assert.deepEqual(catalog.boolean_yes_no_unk.tests, [
      { raw: 'Yes', expected: 'yes' },
      { raw: 'no', expected: 'no' },
      { raw: 'n/a', expected: 'n/a' },
      { raw: 'unk', expected: null },
    ]);
  });

  it('rejects open enum policy with a known-list source', () => {
    const { errors } = buildCompileValidation({
      fields: {
        color: baseRule('color', openEnum('data_lists.colors')),
      },
      knownValues: { colors: ['red', 'blue'] },
      enumLists: {},
      componentDb: {},
      map: {},
    });

    assert.ok(
      errors.some((e) => e.includes('field color:') && e.includes('enum_source must be empty when enum_policy=open')),
      `expected open/source error, got: ${errors.join(' | ')}`,
    );
  });

  it('rejects component-linked keys using open enum policy', () => {
    const { errors } = buildCompileValidation({
      fields: {
        sensor: baseRule('sensor', openEnum('component_db.sensor')),
      },
      knownValues: {},
      enumLists: {},
      componentDb: {},
      map: {
        component_sources: [
          { component_type: 'sensor', roles: { properties: [] } },
        ],
      },
    });

    assert.ok(
      errors.some((e) => e.includes('field sensor:') && e.includes('component_db enum_source cannot use enum_policy=open')),
      `expected component/open error, got: ${errors.join(' | ')}`,
    );
  });

  it('allows open enum policy with no enum source', () => {
    const { errors } = buildCompileValidation({
      fields: {
        color: baseRule('color', openEnum('')),
      },
      knownValues: {},
      enumLists: {},
      componentDb: {},
      map: {},
    });

    assert.equal(
      errors.some((e) => e.includes('enum_source must be empty when enum_policy=open')),
      false,
      `open policy without a source should not fail source validation, got: ${errors.join(' | ')}`,
    );
  });

  it('rejects open_prefer_known with no enum source', () => {
    const { errors } = buildCompileValidation({
      fields: {
        color: baseRule('color', {
          policy: 'open_prefer_known',
          source: '',
          new_value_policy: {
            accept_if_evidence: true,
            mark_needs_curation: true,
          },
        }),
      },
      knownValues: {},
      enumLists: {},
      componentDb: {},
      map: {},
    });

    assert.ok(
      errors.some((e) => e.includes('field color:') && e.includes('enum_source is required for open_prefer_known')),
      `expected open_prefer_known/source error, got: ${errors.join(' | ')}`,
    );
  });

  it('rejects known-list enum source when it does not match the field key', () => {
    const { errors } = buildCompileValidation({
      fields: {
        color: baseRule('color', {
          policy: 'open_prefer_known',
          source: 'data_lists.colors',
          new_value_policy: {
            accept_if_evidence: true,
            mark_needs_curation: true,
          },
        }),
      },
      knownValues: { colors: ['red'], color: [] },
      enumLists: {},
      componentDb: {},
      map: {},
    });

    assert.ok(
      errors.some((e) => e.includes('field color:') && e.includes('enum_source must be data_lists.color')),
      `expected key-matched data list error, got: ${errors.join(' | ')}`,
    );
  });

  it('allows open_prefer_known with an empty key-matched enum list', () => {
    const { errors } = buildCompileValidation({
      fields: {
        color: baseRule('color', {
          policy: 'open_prefer_known',
          source: 'data_lists.color',
          new_value_policy: {
            accept_if_evidence: true,
            mark_needs_curation: true,
          },
        }),
      },
      knownValues: {},
      enumLists: {},
      componentDb: {},
      map: {},
    });

    assert.equal(
      errors.some((e) => e.includes('field color:') && e.includes('enum_source')),
      false,
      `key-matched empty enum list should be valid, got: ${errors.join(' | ')}`,
    );
  });
});
