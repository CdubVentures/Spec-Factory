import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStorage } from '../src/s3/storage.js';
import { discoverCandidateSources } from '../src/features/indexing/discovery/searchDiscovery.js';

test('discoverCandidateSources filters unrelated manufacturer domains for locked brand', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-discovery-brand-'));
  const localInputRoot = path.join(tempRoot, 'fixtures');
  const localOutputRoot = path.join(tempRoot, 'out');
  const config = {
    localMode: true,
    localInputRoot,
    localOutputRoot,
    s3InputPrefix: 'specs/inputs',
    s3OutputPrefix: 'specs/outputs',
    discoveryEnabled: true,
    discoveryMaxQueries: 3,
    discoveryResultsPerQuery: 4,
    discoveryMaxDiscovered: 20,
    searchEngines: ''
  };
  const storage = createStorage(config);
  const categoryConfig = {
    category: 'mouse',
    sourceHosts: [
      { host: 'razer.com', tier: 1, tierName: 'manufacturer' },
      { host: 'logitechg.com', tier: 1, tierName: 'manufacturer' },
      { host: 'rtings.com', tier: 2, tierName: 'lab' }
    ],
    denylist: [],
    searchTemplates: ['{brand} {model} specs']
  };
  const job = {
    productId: 'mouse-logitech-g-pro-x-superlight-2',
    category: 'mouse',
    identityLock: {
      brand: 'Logitech',
      model: 'G Pro X Superlight 2',
      variant: ''
    }
  };

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'test-run',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Brand-mismatched manufacturer URLs survive as soft-labeled candidates
    // instead of being hard-dropped. They carry non-exact identity labels
    // (off_target, variant, family, uncertain) depending on URL/title content.
    const urls = [...new Set([...(result.approvedUrls || []), ...(result.candidateUrls || [])])];
    assert.equal(urls.some((url) => url.includes('logitechg.com')), true);

    // razer.com URLs survive but carry non-exact soft labels
    const razerCandidates = (result.candidates || []).filter(
      (c) => String(c.url || '').includes('razer.com')
    );
    for (const c of razerCandidates) {
      assert.notEqual(c.identity_prelim, 'exact',
        `expected razer.com candidate to NOT have identity_prelim 'exact', got '${c.identity_prelim}'`);
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
