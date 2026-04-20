/**
 * generateFinderHooks — unit tests.
 *
 * Locks the shape of the 5 standard hooks the codegen emits. Any drift in
 * URL patterns, cache keys, or mutation bodies will surface here BEFORE the
 * frontend panels break.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinderHooksSource } from '../generateFinderHooks.js';

const FAKE_RDF_MODULE = {
  id: 'releaseDateFinder',
  routePrefix: 'release-date-finder',
  getResponseSchemaExport: 'releaseDateFinderGetResponseSchema',
};

const FAKE_SKU_MODULE = {
  id: 'skuFinder',
  routePrefix: 'sku-finder',
  getResponseSchemaExport: 'skuFinderGetResponseSchema',
};

describe('generateFinderHooks — buildFinderHooksSource', () => {
  it('throws when finder does not declare getResponseSchemaExport', () => {
    const m = { id: 'fakeFinder', routePrefix: 'fake-finder' };
    assert.throws(() => buildFinderHooksSource(m), /does not declare getResponseSchemaExport/);
  });

  it('emits all 5 standard hook functions', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    assert.match(src, /export function useReleaseDateFinderQuery\b/);
    assert.match(src, /export function useReleaseDateFinderRunMutation\b/);
    assert.match(src, /export function useReleaseDateFinderLoopMutation\b/);
    assert.match(src, /export function useDeleteReleaseDateFinderRunMutation\b/);
    assert.match(src, /export function useDeleteReleaseDateFinderAllMutation\b/);
  });

  it('uses cache key [routePrefix, category, productId] exactly', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    assert.match(src, /queryKey: \['release-date-finder', category, productId\]/);
    // Both the main query AND delete reset keys
    const occurrences = (src.match(/queryKey: \['release-date-finder', category, productId\]/g) || []).length;
    assert.ok(occurrences >= 3, `expected cache key ≥3x (query + 2 delete resets); got ${occurrences}`);
  });

  it('GET query hits /{routePrefix}/{cat}/{pid}', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    assert.match(src, /api\.get<ReleaseDateFinderResult>\(\s*`\/release-date-finder\/\${encodeURIComponent\(category\)}\/\${encodeURIComponent\(productId\)}`/);
  });

  it('Run mutation POSTs to {routePrefix}/{cat}/{pid}; Loop POSTs to /loop suffix', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    // Loop variant
    assert.match(src, /api\.post<AcceptedResponse>\(\s*`\/release-date-finder\/\${encodeURIComponent\(category\)}\/\${encodeURIComponent\(productId\)}\/loop`/);
    // Run variant (no /loop suffix — match the path without /loop)
    assert.match(src, /api\.post<AcceptedResponse>\(\s*`\/release-date-finder\/\${encodeURIComponent\(category\)}\/\${encodeURIComponent\(productId\)}`/);
  });

  it('mutation body type accepts { variant_key?, variant_id? }', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    const matches = src.match(/useMutation<AcceptedResponse, Error, \{ variant_key\?: string; variant_id\?: string \}>/g) || [];
    assert.equal(matches.length, 2, 'both Run + Loop mutations use the same body type shape');
  });

  it('DELETE single run hits /runs/{n}; DELETE all hits base path', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    assert.match(src, /api\.del<ReleaseDateFinderDeleteResponse>\(\s*`\/release-date-finder\/\${encodeURIComponent\(category\)}\/\${encodeURIComponent\(productId\)}\/runs\/\${runNumber}`/);
    // DELETE all (no /runs suffix)
    assert.match(src, /mutationFn: \(\) => api\.del<ReleaseDateFinderDeleteResponse>\(\s*`\/release-date-finder\/\${encodeURIComponent\(category\)}\/\${encodeURIComponent\(productId\)}`/);
  });

  it('delete mutations removeQueries on success (cache reset)', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    const resetCount = (src.match(/queryClient\.removeQueries\(/g) || []).length;
    assert.equal(resetCount, 2, 'both delete mutations call removeQueries');
    const onSuccessCount = (src.match(/onSuccess: resetQuery/g) || []).length;
    assert.equal(onSuccessCount, 2);
  });

  it('imports ResultType from ../types.generated.ts (not ../types.ts)', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    assert.match(src, /import type \{ ReleaseDateFinderResult \} from '\.\.\/types\.generated\.ts'/);
    assert.doesNotMatch(src, /from '\.\.\/types\.ts'/);
  });

  it('generalizes for a hypothetical skuFinder', () => {
    const src = buildFinderHooksSource(FAKE_SKU_MODULE);
    assert.match(src, /useSkuFinderQuery/);
    assert.match(src, /useSkuFinderRunMutation/);
    assert.match(src, /useSkuFinderLoopMutation/);
    assert.match(src, /useDeleteSkuFinderRunMutation/);
    assert.match(src, /useDeleteSkuFinderAllMutation/);
    assert.match(src, /queryKey: \['sku-finder', category, productId\]/);
    assert.match(src, /import type \{ SkuFinderResult \}/);
  });
});
