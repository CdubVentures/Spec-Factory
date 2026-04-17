// WHY: The field rule is the authoritative source of variant_dependent. When a
// compiled field rule declares the flag, its value wins over the module-class
// derivation. Without a specDb, the module-class fallback is still the answer.

import { describe, it } from 'node:test';
import { strictEqual } from 'node:assert';
import { isVariantDependentField } from '../finderModuleRegistry.js';

function stubSpecDb(fields) {
  return {
    getCompiledRules: () => ({ fields }),
  };
}

describe('isVariantDependentField — field rule wins over module derivation', () => {
  it('returns the authored value when specDb.getCompiledRules() declares variant_dependent: true', () => {
    const specDb = stubSpecDb({ weight: { variant_dependent: true } });
    strictEqual(isVariantDependentField('weight', specDb), true);
  });

  it('returns the authored value when specDb declares variant_dependent: false (overrides module derivation)', () => {
    // release_date is owned by RDF (variantFieldProducer), so module derivation
    // would say true. Authored false must override.
    const specDb = stubSpecDb({ release_date: { variant_dependent: false } });
    strictEqual(isVariantDependentField('release_date', specDb), false);
  });

  it('falls back to module derivation when specDb lacks the field', () => {
    const specDb = stubSpecDb({ weight: { variant_dependent: true } });
    // release_date not declared in this stub — fall back to module derivation.
    strictEqual(isVariantDependentField('release_date', specDb), true);
  });

  it('falls back to module derivation when specDb returns no field rule entry', () => {
    const specDb = stubSpecDb({});
    strictEqual(isVariantDependentField('release_date', specDb), true);
    strictEqual(isVariantDependentField('weight', specDb), false);
  });

  it('without specDb, module derivation still works (backward compatible)', () => {
    strictEqual(isVariantDependentField('release_date'), true);
    strictEqual(isVariantDependentField('weight'), false);
    strictEqual(isVariantDependentField('colors'), false);
  });

  it('treats a non-boolean field-rule value as "not authored" and falls back', () => {
    const specDb = stubSpecDb({ release_date: { variant_dependent: 'yes' } });
    // non-boolean → ignored → module derivation wins.
    strictEqual(isVariantDependentField('release_date', specDb), true);
  });
});
