import { describe, it } from 'node:test';
import { deepStrictEqual } from 'node:assert';
import { buildDiscoveryHistoryScrubRequest } from '../discoveryHistoryScrubPayload.ts';

describe('buildDiscoveryHistoryScrubRequest', () => {
  it('maps an unscoped drawer action to product-level scrub', () => {
    deepStrictEqual(
      buildDiscoveryHistoryScrubRequest({ scopeLevel: 'product', kind: 'url' }),
      { scope: 'product', kind: 'url' },
    );
  });

  it('maps variant history actions to variant scope', () => {
    deepStrictEqual(
      buildDiscoveryHistoryScrubRequest({ scopeLevel: 'variant', kind: 'query', variantId: 'v_black' }),
      { scope: 'variant', kind: 'query', variantId: 'v_black' },
    );
  });

  it('keeps PIF variant+mode actions distinct from variant-wide actions', () => {
    deepStrictEqual(
      buildDiscoveryHistoryScrubRequest({
        scopeLevel: 'variant+mode',
        kind: 'all',
        variantId: 'v_black',
        mode: 'hero',
      }),
      { scope: 'variant_mode', kind: 'all', variantId: 'v_black', mode: 'hero' },
    );
  });

  it('round-trips fine-grained PIF pool keys through the variant_mode scope', () => {
    deepStrictEqual(
      buildDiscoveryHistoryScrubRequest({
        scopeLevel: 'variant+mode',
        kind: 'url',
        variantId: 'v_black',
        mode: 'view:top',
      }),
      { scope: 'variant_mode', kind: 'url', variantId: 'v_black', mode: 'view:top' },
    );
  });

  it('allows PIF variant-wide actions when mode is not supplied', () => {
    deepStrictEqual(
      buildDiscoveryHistoryScrubRequest({
        scopeLevel: 'variant+mode',
        kind: 'url',
        variantId: 'v_black',
      }),
      { scope: 'variant', kind: 'url', variantId: 'v_black' },
    );
  });

  it('maps key history actions to field_key scope', () => {
    deepStrictEqual(
      buildDiscoveryHistoryScrubRequest({
        scopeLevel: 'field_key',
        kind: 'all',
        fieldKey: 'polling_rate',
      }),
      { scope: 'field_key', kind: 'all', fieldKey: 'polling_rate' },
    );
  });
});
