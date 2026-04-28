/**
 * generateFinderHooks unit tests.
 *
 * Locks the shape of the 5 standard hooks the codegen emits. Any drift in
 * URL patterns, cache keys, or mutation bodies will surface here before the
 * frontend panels break.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildFinderHooksSource } from '../generateFinderHooks.js';
import { FINDER_MODULES, deriveFinderPaths } from '../../../../src/core/finder/finderModuleRegistry.js';

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

describe('generateFinderHooks buildFinderHooksSource', () => {
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
    const removeKeyOccurrences = (src.match(/removeQueryKeys: \[\['release-date-finder', category, productId\]\]/g) || []).length;
    assert.equal(removeKeyOccurrences, 2, 'both delete hooks remove the same exact finder query key');
  });

  it('GET query hits /{routePrefix}/{cat}/{pid}', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    assert.match(src, /api\.get<ReleaseDateFinderResult>\(\s*`\/release-date-finder\/\${encodeURIComponent\(category\)}\/\${encodeURIComponent\(productId\)}`/);
  });

  it('Run mutation POSTs to {routePrefix}/{cat}/{pid}; Loop POSTs to /loop suffix', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    assert.match(src, /api\.post<AcceptedResponse>\(\s*`\/release-date-finder\/\${encodeURIComponent\(category\)}\/\${encodeURIComponent\(productId\)}\/loop`/);
    assert.match(src, /api\.post<AcceptedResponse>\(\s*`\/release-date-finder\/\${encodeURIComponent\(category\)}\/\${encodeURIComponent\(productId\)}`/);
  });

  it('mutation body type accepts { variant_key?, variant_id? }', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    const matches = src.match(/useMutation<AcceptedResponse, Error, \{ variant_key\?: string; variant_id\?: string \}>/g) || [];
    assert.equal(matches.length, 2, 'both Run and Loop mutations use the same body type shape');
  });

  it('DELETE single run hits /runs/{n}; DELETE all hits base path', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    assert.match(src, /api\.del<ReleaseDateFinderDeleteResponse>\(\s*`\/release-date-finder\/\${encodeURIComponent\(category\)}\/\${encodeURIComponent\(productId\)}\/runs\/\${runNumber}`/);
    assert.match(src, /mutationFn: \(\) => api\.del<ReleaseDateFinderDeleteResponse>\(\s*`\/release-date-finder\/\${encodeURIComponent\(category\)}\/\${encodeURIComponent\(productId\)}`/);
  });

  it('delete mutations remove exact cache and emit data-change events', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    const removeKeyCount = (src.match(/removeQueryKeys: \[\['release-date-finder', category, productId\]\]/g) || []).length;
    assert.equal(removeKeyCount, 2, 'both delete mutations remove the exact finder query before invalidating');
    assert.match(src, /event: 'release-date-finder-run-deleted'/);
    assert.match(src, /event: 'release-date-finder-deleted'/);
    assert.doesNotMatch(src, /queryClient\.removeQueries\(/);
    assert.doesNotMatch(src, /onSuccess: resetQuery/);
  });

  it('delete mutations use the data-change mutation helper', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    assert.match(src, /import \{ useDataChangeMutation \} from '\.\.\/\.\.\/data-change\/index\.js'/);
    assert.doesNotMatch(src, /useQueryClient/);
    assert.doesNotMatch(src, /useCallback/);
    const helperCount = (src.match(/useDataChangeMutation<ReleaseDateFinderDeleteResponse/g) || []).length;
    assert.equal(helperCount, 2);
  });

  it('delete response type includes canonical changed entity payload fields', () => {
    const src = buildFinderHooksSource(FAKE_RDF_MODULE);
    assert.match(src, /readonly product_id\?: string;/);
    assert.match(src, /readonly category\?: string;/);
    assert.match(src, /readonly deleted_run\?: number;/);
    assert.match(src, /readonly deleted_runs\?: readonly number\[\];/);
    assert.match(src, /readonly entity\?: ReleaseDateFinderResult \| null;/);
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

  it('generated finder hook files are byte-identical to generator output', async () => {
    const modules = FINDER_MODULES.filter((module) => module.getResponseSchemaExport);
    assert.ok(modules.length > 0, 'at least one finder must opt into hook generation');

    for (const module of modules) {
      const expected = buildFinderHooksSource(module);
      const { panelFeaturePath } = deriveFinderPaths(module.id);
      const filePath = path.resolve(
        'tools/gui-react/src/features',
        panelFeaturePath,
        'api',
        `${module.id}Queries.generated.ts`,
      );
      const actual = await fs.readFile(filePath, 'utf8');
      assert.equal(
        actual,
        expected,
        `${module.id} generated hooks drifted; run node tools/gui-react/scripts/generateFinderHooks.js ${module.id}`,
      );
    }
  });
});
