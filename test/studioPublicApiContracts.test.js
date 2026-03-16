import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

async function loadStudioPublicApi() {
  return loadBundledModule('tools/gui-react/src/features/studio/index.ts', {
    prefix: 'studio-public-api-',
    stubs: {
      './components/BrandManager': `
        export const BrandManager = Symbol.for('BrandManager');
      `,
      './components/StudioPage': `
        export const StudioPage = Symbol.for('StudioPage');
      `,
      './state/invalidateFieldRulesQueries': `
        export function invalidateFieldRulesQueries() {
          return 'invalidated';
        }
      `,
    },
  });
}

test('studio public API re-exports the supported catalog-facing entrypoints', async () => {
  const publicApi = await loadStudioPublicApi();

  assert.equal(publicApi.BrandManager, Symbol.for('BrandManager'));
  assert.equal(publicApi.StudioPage, Symbol.for('StudioPage'));
  assert.equal(publicApi.invalidateFieldRulesQueries(), 'invalidated');
});
