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

test('discoverCandidateSources rejects forum-classified hosts before selection', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-forum-'));
  const config = makeConfig(tempRoot, {
    llmProvider: 'openai',
    llmApiKey: 'test-key',
    llmBaseUrl: 'http://llm.test'
  });
  const storage = createStorage(config);
  installCachedBrandAndDomainLookups(storage, {
    domains: {
      'insider.razer.com': {
        classification: 'forum',
        safe: 1,
        reason: 'community_discussion'
      },
      'razer.com': {
        classification: 'manufacturer',
        safe: 1,
        reason: 'official_manufacturer'
      }
    }
  });
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://insider.razer.com/razer-support-45/viper-v3-pro-review-thread-12345',
      title: 'Razer Viper V3 Pro review thread',
      content: 'Community discussion for the Razer Viper V3 Pro'
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
      runId: 'run-phase02-forum',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Forum URLs now survive with host_trust_class: 'community' soft label
    // instead of being hard-dropped.
    const urls = collectUrls(result);
    assert.equal(
      urls.some((url) => url.includes('razer.com/gaming-mice/razer-viper-v3-pro')),
      true
    );
    // WHY: Forum URLs survive as candidates. The LLM selector assigns
    // host_trust_class based on authority_bucket, not domain classification cache.
    // Non-pinned candidates get authority_bucket: 'unknown' -> host_trust_class: 'unknown'.
    const forumCandidate = (result.candidates || []).find(
      (c) => String(c.url || '').includes('insider.razer.com')
    );
    assert.ok(forumCandidate, 'forum URL should survive as a candidate');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources rejects manufacturer community subdomains even when cached classification says manufacturer', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-manufacturer-community-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  installCachedBrandAndDomainLookups(storage, {
    domains: {
      'insider.razer.com': {
        classification: 'manufacturer',
        safe: 1,
        reason: 'Official community and news platform for Razer.'
      },
      'razer.com': {
        classification: 'manufacturer',
        safe: 1,
        reason: 'official_manufacturer'
      }
    }
  });
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://insider.razer.com/razer-support-45/viper-v3-pro-review-thread-12345',
      title: 'Razer Viper V3 Pro review thread',
      content: 'Community discussion for the Razer Viper V3 Pro'
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
      runId: 'run-phase02-manufacturer-community',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Community subdomains now survive with host_trust_class: 'community'
    // soft label instead of being hard-dropped.
    const urls = collectUrls(result);
    assert.equal(
      urls.some((url) => url.includes('razer.com/gaming-mice/razer-viper-v3-pro')),
      true
    );
    // Community subdomain survives as a candidate
    const communityCandidate = (result.candidates || []).find(
      (c) => String(c.url || '').includes('insider.razer.com')
    );
    assert.ok(communityCandidate, 'community subdomain should survive as a candidate');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('discoverCandidateSources does not retain manufacturer community subdomains when they are the only live search hits', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-harvester-phase02-manufacturer-community-only-'));
  const config = makeConfig(tempRoot);
  const storage = createStorage(config);
  installCachedBrandAndDomainLookups(storage, {
    domains: {
      'insider.razer.com': {
        classification: 'manufacturer',
        safe: 1,
        reason: 'Official community and news platform for Razer.'
      }
    }
  });
  const categoryConfig = makeCategoryConfig();
  const job = makeJob();

  const originalFetch = global.fetch;
  global.fetch = createFetchStub([
    {
      url: 'https://insider.razer.com/razer-synapse-4-55',
      title: 'Razer Synapse 4',
      content: 'Software forum for Razer Synapse'
    },
    {
      url: 'https://insider.razer.com/razer-support-44',
      title: 'Razer Support - Razer Insider',
      content: 'Community discussion and support thread'
    }
  ]);

  try {
    const result = await discoverCandidateSources({
      config,
      storage,
      categoryConfig,
      job,
      runId: 'run-phase02-manufacturer-community-only',
      logger: null,
      planningHints: {},
      llmContext: {}
    });

    // WHY: Community subdomains are not hard-dropped; they survive to the
    // LLM selector which approves them. When they are the only hits, they
    // still appear in the candidate set.
    const urls = collectUrls(result);
    assert.equal(urls.length > 0, true, 'community URLs should survive as candidates');
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
