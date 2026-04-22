/**
 * scalarFinderPromptContract — slot-bag validation at registration.
 *
 * Locks the O(1) scaling guarantee: a new variant-scoped scalar finder cannot
 * register via buildScalarFinderPromptTemplates without declaring the two
 * required slot bags. Registration throws at module-load; tests prove it.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildScalarFinderPromptTemplates } from '../scalarFinderPromptContract.js';
import {
  VARIANT_SOURCE_GUIDANCE_SLOT_KEYS,
  VARIANT_DISAMBIGUATION_SLOT_KEYS,
} from '../../llm/prompts/globalPromptRegistry.js';

const MIN_TEMPLATE = 'x';

function fullSourceBag() {
  return {
    OPENER_TAIL: '',
    TIER1_CONTENT: '    tier1',
    TIER3_HEADER: 'R',
    TIER3_CONTENT: '    tier3',
    TIER2_CONTENT: '    tier2',
    TIER4_HEADER: 'C',
    TIER4_CONTENT: '    tier4',
  };
}

function fullDisambigBag() {
  return {
    RULE1_LOCATE: 'rule1',
    RULE2_DISTINCT_SIGNAL: 'rule2',
    RULE3_SHARED_SIGNAL: 'rule3',
    RULE4_AMBIGUOUS_UNK: 'rule4',
    BASE_WARNING_CLOSER: 'closer',
  };
}

describe('buildScalarFinderPromptTemplates — slot-bag validation', () => {
  it('throws when sourceVariantGuidanceSlots is missing entirely', () => {
    assert.throws(
      () => buildScalarFinderPromptTemplates({
        moduleId: 'testFinder',
        defaultTemplate: MIN_TEMPLATE,
      }),
      /sourceVariantGuidanceSlots must be an object/,
    );
  });

  it('throws when sourceVariantGuidanceSlots is an array (wrong type)', () => {
    assert.throws(
      () => buildScalarFinderPromptTemplates({
        moduleId: 'testFinder',
        defaultTemplate: MIN_TEMPLATE,
        sourceVariantGuidanceSlots: ['not', 'an', 'object'],
      }),
      /sourceVariantGuidanceSlots must be an object/,
    );
  });

  it('throws listing specifically which source-guidance slot keys are missing', () => {
    const bag = fullSourceBag();
    delete bag.TIER1_CONTENT;
    delete bag.TIER3_HEADER;
    assert.throws(
      () => buildScalarFinderPromptTemplates({
        moduleId: 'testFinder',
        defaultTemplate: MIN_TEMPLATE,
        sourceVariantGuidanceSlots: bag,
      }),
      (err) => err.message.includes('TIER1_CONTENT') && err.message.includes('TIER3_HEADER'),
    );
  });

  it('throws when variantDisambiguationSlots is missing entirely (strictly required)', () => {
    assert.throws(
      () => buildScalarFinderPromptTemplates({
        moduleId: 'testFinder',
        defaultTemplate: MIN_TEMPLATE,
        sourceVariantGuidanceSlots: fullSourceBag(),
      }),
      /variantDisambiguationSlots must be an object/,
    );
  });

  it('throws listing specifically which variant-disambiguation slot keys are missing', () => {
    const bag = fullDisambigBag();
    delete bag.RULE3_SHARED_SIGNAL;
    assert.throws(
      () => buildScalarFinderPromptTemplates({
        moduleId: 'testFinder',
        defaultTemplate: MIN_TEMPLATE,
        sourceVariantGuidanceSlots: fullSourceBag(),
        variantDisambiguationSlots: bag,
      }),
      (err) => err.message.includes('variantDisambiguationSlots')
           && err.message.includes('RULE3_SHARED_SIGNAL'),
    );
  });

  it('accepts both complete slot bags — the minimum contract for a variant scalar finder', () => {
    const tmpls = buildScalarFinderPromptTemplates({
      moduleId: 'testFinder',
      defaultTemplate: MIN_TEMPLATE,
      sourceVariantGuidanceSlots: fullSourceBag(),
      variantDisambiguationSlots: fullDisambigBag(),
    });
    assert.equal(tmpls.length, 1);
    assert.equal(tmpls[0].moduleId, 'testFinder');
  });
});

describe('slot-key constants are exported and non-empty', () => {
  it('VARIANT_SOURCE_GUIDANCE_SLOT_KEYS has the 7 source-guidance slots', () => {
    assert.deepEqual([...VARIANT_SOURCE_GUIDANCE_SLOT_KEYS], [
      'OPENER_TAIL', 'TIER1_CONTENT', 'TIER3_HEADER', 'TIER3_CONTENT',
      'TIER2_CONTENT', 'TIER4_HEADER', 'TIER4_CONTENT',
    ]);
  });

  it('VARIANT_DISAMBIGUATION_SLOT_KEYS has the 5 disambiguation slots', () => {
    assert.deepEqual([...VARIANT_DISAMBIGUATION_SLOT_KEYS], [
      'RULE1_LOCATE', 'RULE2_DISTINCT_SIGNAL', 'RULE3_SHARED_SIGNAL',
      'RULE4_AMBIGUOUS_UNK', 'BASE_WARNING_CLOSER',
    ]);
  });
});
