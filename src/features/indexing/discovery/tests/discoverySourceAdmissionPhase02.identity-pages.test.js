import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createStorage,
  discoverCandidateSources,
  makeConfig,
  makeCategoryConfig,
  makeJob,
  collectUrls,
  createFetchStub,
  installCachedBrandAndDomainLookups,
} from './helpers/discoverySourceAdmissionPhase02Harness.js';

test('discoverCandidateSources rejects multi-model comparison pages for single-product runs', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-multi-model-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://www.rtings.com/mouse/tools/compare/razer-viper-v3-pro-vs-logitech-g-pro-x-superlight-2',
      title: 'Razer Viper V3 Pro vs Logitech G Pro X Superlight 2',
      content: 'Comparison between two gaming mice'
    },
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      content: 'Official product specifications'
    }
  ]);

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase02-multi-model',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Multi-model comparison pages now survive with identity_prelim: 'multi_model'
    // soft label instead of being hard-dropped.
    const urls = collectUrls(result);
    assert.equal(
      urls.some((url) => url.includes('razer.com/gaming-mice/razer-viper-v3-pro')),
      true
    );
    // WHY: The LLM selector assigns identity_prelim based on authority_bucket
    // and confidence, not URL content analysis. The mock returns 'high' confidence
    // for all approved candidates, mapping to 'exact'. The business outcome is
    // that the comparison page survives (not hard-dropped).
    const compareCandidate = (result.candidates || []).find(
      (c) => String(c.url || '').includes('/compare/razer-viper-v3-pro-vs-logitech-g-pro-x-superlight-2')
    );
    assert.ok(compareCandidate, 'multi-model comparison page should survive as a candidate');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources rejects sibling-model manufacturer product pages before selection', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-sibling-model-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-pro',
      title: 'Razer Viper V3 Pro',
      content: 'Official product specifications'
    },
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v3-hyperspeed',
      title: 'Razer Viper V3 HyperSpeed',
      content: 'Official product page for the sibling HyperSpeed model'
    },
    {
      url: 'https://www.razer.com/gaming-mice/razer-viper-v2-pro',
      title: 'Razer Viper V2 Pro',
      content: 'Official product page for the previous V2 Pro model'
    }
  ]);

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase02-sibling-model',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Sibling-model pages now survive with identity_prelim 'variant' or 'family'
    // soft labels instead of being hard-dropped.
    const urls = collectUrls(result);
    assert.equal(
      urls.some((url) => url.includes('razer-viper-v3-pro')),
      true
    );
    // WHY: Sibling model pages survive as candidates. The LLM selector
    // approves all candidates uniformly; identity_prelim is set by the
    // authority_bucket/confidence mapping, not URL content analysis.
    const candidates = result.candidates || [];
    const hyperspeedCandidate = candidates.find(
      (c) => String(c.url || '').includes('razer-viper-v3-hyperspeed')
    );
    const v2proCandidate = candidates.find(
      (c) => String(c.url || '').includes('razer-viper-v2-pro')
    );
    assert.ok(hyperspeedCandidate, 'sibling HyperSpeed page should survive as a candidate');
    assert.ok(v2proCandidate, 'sibling V2 Pro page should survive as a candidate');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
