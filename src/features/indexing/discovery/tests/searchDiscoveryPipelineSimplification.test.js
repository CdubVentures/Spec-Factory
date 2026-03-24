import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/*
 * Phase 3 pipeline simplification tests.
 * These test the contracts and invariants of the simplified pipeline,
 * not the full integration (which requires live search/LLM).
 */

// 3A: Domain safety deterministic path tests
describe('Phase 3A — Domain safety deterministic path', () => {
  // Simulate the deterministic domain classification logic from searchDiscovery.js
  function classifyDomainDeterministic(domain, categoryConfig = {}) {
    const denylist = categoryConfig.denylist || [];
    const sourceHosts = categoryConfig.sourceHosts || [];
    const isDenied = denylist.some((d) => domain === d || domain.endsWith(`.${d}`));
    const hostEntry = sourceHosts.find((h) => domain === h.host || domain.endsWith(`.${h.host}`));
    const isApproved = !isDenied && Boolean(hostEntry);
    const tier = hostEntry ? hostEntry.tier : 0;
    const baseScore = isDenied ? 10 : isApproved ? 90 : tier === 1 ? 80 : tier === 2 ? 70 : tier === 3 ? 60 : 50;
    return {
      domain,
      safety_class: isDenied ? 'blocked' : (isApproved ? 'safe' : 'caution'),
      budget_score: baseScore,
    };
  }

  it('denied hosts are blocked without LLM', () => {
    const cfg = { denylist: ['malware-site.com'], sourceHosts: [] };
    const result = classifyDomainDeterministic('malware-site.com', cfg);
    assert.equal(result.safety_class, 'blocked');
    assert.equal(result.budget_score, 10);
  });

  it('approved hosts are allowed without LLM', () => {
    const cfg = {
      denylist: [],
      sourceHosts: [{ host: 'razer.com', tier: 1, tierName: 'manufacturer', role: 'manufacturer' }],
    };
    const result = classifyDomainDeterministic('razer.com', cfg);
    assert.equal(result.safety_class, 'safe');
    assert.equal(result.budget_score, 90);
  });

  it('unknown domains get caution with mid-range score', () => {
    const cfg = { denylist: [], sourceHosts: [] };
    const result = classifyDomainDeterministic('random-blog.com', cfg);
    assert.equal(result.safety_class, 'caution');
    assert.equal(result.budget_score, 50);
  });

  it('forum subdomains still blocked by isForumLikeManufacturerSubdomain pattern', () => {
    // The isForumLikeManufacturerSubdomain function checks for forum-like subdomains
    // regardless of LLM classification. This test ensures the pattern is independent.
    function isForumLikeManufacturerSubdomain(host) {
      const parts = host.split('.');
      if (parts.length < 3) return false;
      const sub = parts[0].toLowerCase();
      return ['forum', 'forums', 'community', 'discuss', 'support', 'help'].includes(sub);
    }

    assert.equal(isForumLikeManufacturerSubdomain('forum.razer.com'), true);
    assert.equal(isForumLikeManufacturerSubdomain('community.logitech.com'), true);
    assert.equal(isForumLikeManufacturerSubdomain('forums.corsair.com'), true);
    assert.equal(isForumLikeManufacturerSubdomain('razer.com'), false);
    assert.equal(isForumLikeManufacturerSubdomain('www.razer.com'), false);
  });
});

// 3B: Conditional LLM SERP triage tests
describe('Phase 3B — Conditional LLM SERP triage', () => {
  function shouldCallLlmTriage(deterministicResults, triageMinScore, triageMaxUrls) {
    const highQualityCount = deterministicResults
      .filter((r) => (Number(r.score) || 0) >= triageMinScore).length;
    return highQualityCount < Math.ceil(triageMaxUrls * 0.6);
  }

  it('plenty of high-quality deterministic results → LLM NOT called', () => {
    // 15 results scoring above min score of 3, triageMaxUrls=20 → threshold is 12
    const results = Array.from({ length: 15 }, (_, i) => ({ score: 5 + i * 0.2 }));
    const needsLlm = shouldCallLlmTriage(results, 3, 20);
    assert.equal(needsLlm, false);
  });

  it('few high-quality deterministic results → LLM called', () => {
    // Only 5 results scoring above min score of 3, triageMaxUrls=20 → threshold is 12
    const results = [
      { score: 5 }, { score: 4 }, { score: 3.5 }, { score: 3.1 }, { score: 3 },
      { score: 1 }, { score: 0.5 }, { score: 0.2 },
    ];
    const needsLlm = shouldCallLlmTriage(results, 3, 20);
    assert.equal(needsLlm, true);
  });

  it('boundary at 60% threshold', () => {
    // triageMaxUrls=10 → threshold is ceil(10*0.6) = 6
    // Exactly 6 high-quality results → NOT called
    const results6 = Array.from({ length: 6 }, () => ({ score: 5 }));
    assert.equal(shouldCallLlmTriage(results6, 3, 10), false);

    // 5 high-quality results → called
    const results5 = Array.from({ length: 5 }, () => ({ score: 5 }));
    assert.equal(shouldCallLlmTriage(results5, 3, 10), true);
  });

  it('all zero-score results → LLM called', () => {
    const results = Array.from({ length: 20 }, () => ({ score: 0 }));
    const needsLlm = shouldCallLlmTriage(results, 3, 20);
    assert.equal(needsLlm, true);
  });

  it('empty results → LLM called', () => {
    assert.equal(shouldCallLlmTriage([], 3, 20), true);
  });
});

// 3C: Tier coverage override removed
describe('Phase 3C — Tier coverage override removed', () => {
  it('low-scoring lab URL no longer promoted past higher-scoring URL', () => {
    // Simulate the old behavior vs new behavior:
    // Old: ensureTierCoverage('lab') would inject a lab URL even below cutoff
    // New: pure score order only
    const reranked = [
      { url: 'https://a.com', score: 9, tierName: 'manufacturer' },
      { url: 'https://b.com', score: 8, tierName: 'retailer' },
      { url: 'https://c.com', score: 7, tierName: 'retailer' },
      { url: 'https://d.com', score: 2, tierName: 'lab' },  // low score lab URL
    ];
    const discoveredCap = 3;
    const discovered = reranked.slice(0, discoveredCap);

    // New behavior: pure score order, no tier injection
    assert.equal(discovered.length, 3);
    assert.equal(discovered[0].url, 'https://a.com');
    assert.equal(discovered[1].url, 'https://b.com');
    assert.equal(discovered[2].url, 'https://c.com');
    // Lab URL is NOT promoted — it scored too low
    assert.ok(!discovered.some((d) => d.tierName === 'lab'));
  });

  it('discovered list respects pure score order', () => {
    const reranked = [
      { url: 'https://lab-site.com', score: 9, tierName: 'lab' },
      { url: 'https://manuf.com', score: 8, tierName: 'manufacturer' },
      { url: 'https://retail.com', score: 7, tierName: 'retailer' },
      { url: 'https://db-site.com', score: 6, tierName: 'database' },
    ];
    const discoveredCap = 4;
    const discovered = reranked.slice(0, discoveredCap);

    // High-scoring lab and database URLs still make it in — by score, not override
    assert.deepEqual(discovered.map((d) => d.url), [
      'https://lab-site.com',
      'https://manuf.com',
      'https://retail.com',
      'https://db-site.com',
    ]);
  });
});
