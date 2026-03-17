import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rerankSerpResults } from '../src/research/serpReranker.js';

function makeResult({ url, title = '', snippet = '', host = '', tier, identity_match_level, variant_guard_hit, multi_model_hint }) {
  return {
    url,
    title,
    snippet,
    host: host || new URL(url).hostname.replace(/^www\./, ''),
    tier,
    identity_match_level,
    variant_guard_hit,
    multi_model_hint
  };
}

describe('serpReranker enhancements', () => {
  const baseConfig = {};
  const identity = { brand: 'Razer', model: 'Viper V3 Pro', variant: '' };

  it('deterministic scoring applies identity_match_level boost/penalty', async () => {
    const results = [
      makeResult({
        url: 'https://razer.com/mice/viper-v3-pro',
        title: 'Razer Viper V3 Pro',
        snippet: 'Official specs',
        identity_match_level: 'strong'
      }),
      makeResult({
        url: 'https://random.com/stuff',
        title: 'Random page',
        snippet: 'Nothing relevant',
        identity_match_level: 'none'
      })
    ];
    const ranked = await rerankSerpResults({
      config: baseConfig,
      identity,
      serpResults: results,
      topK: 10
    });
    assert.ok(ranked.length >= 1);
    const razerIdx = ranked.findIndex(r => r.url.includes('razer.com'));
    const randomIdx = ranked.findIndex(r => r.url.includes('random.com'));
    if (razerIdx >= 0 && randomIdx >= 0) {
      assert.ok(ranked[razerIdx].rerank_score > ranked[randomIdx].rerank_score,
        'Strong identity match should rank higher than none');
    }
  });

  it('variant guard hit applies heavy penalty', async () => {
    const results = [
      makeResult({
        url: 'https://rtings.com/razer-viper-v3-pro-review',
        title: 'Razer Viper V3 Pro Review',
        snippet: 'Full review',
        variant_guard_hit: false,
        identity_match_level: 'strong'
      }),
      makeResult({
        url: 'https://rtings.com/razer-viper-mini-review',
        title: 'Razer Viper Mini Review',
        snippet: 'Different mouse review',
        variant_guard_hit: true,
        identity_match_level: 'partial'
      })
    ];
    const ranked = await rerankSerpResults({
      config: baseConfig,
      identity,
      serpResults: results,
      topK: 10
    });
    const correctIdx = ranked.findIndex(r => r.url.includes('v3-pro'));
    const guardIdx = ranked.findIndex(r => r.url.includes('mini'));
    if (correctIdx >= 0 && guardIdx >= 0) {
      assert.ok(ranked[correctIdx].rerank_score > ranked[guardIdx].rerank_score,
        'Non-variant-guard result should rank higher');
    }
  });

  it('score breakdown is returned with each result', async () => {
    const results = [
      makeResult({
        url: 'https://razer.com/mice/viper-v3-pro',
        title: 'Razer Viper V3 Pro',
        snippet: 'Specs',
        identity_match_level: 'strong'
      })
    ];
    const ranked = await rerankSerpResults({
      config: baseConfig,
      identity,
      serpResults: results,
      topK: 10
    });
    assert.ok(ranked.length >= 1);
    const first = ranked[0];
    assert.ok('score_breakdown' in first, 'Result should have score_breakdown');
    assert.ok(typeof first.score_breakdown === 'object');
    assert.ok('identity_bonus' in first.score_breakdown);
    assert.ok('base_score' in first.score_breakdown);
  });

  it('applies config.serpRerankerWeightMap overrides to deterministic scores', async () => {
    const identitySynthetic = { brand: 'Acme', model: 'Orbit X1', variant: '' };
    const forumResult = makeResult({
      url: 'https://forum.example.test/topic/acme-orbit-x1',
      title: 'Acme Orbit X1 owners thread',
      snippet: 'Forum impressions and support chatter',
      identity_match_level: 'strong'
    });

    const baseline = await rerankSerpResults({
      config: {},
      identity: identitySynthetic,
      serpResults: [forumResult],
      topK: 10
    });
    const overridden = await rerankSerpResults({
      config: {
        serpRerankerWeightMap: {
          forumRedditPenalty: -9,
        },
      },
      identity: identitySynthetic,
      serpResults: [forumResult],
      topK: 10
    });

    assert.ok(overridden[0].rerank_score < baseline[0].rerank_score);
    assert.equal(overridden[0].score_breakdown.base_score < baseline[0].score_breakdown.base_score, true);
  });

  it('domain safety gate blocks unsafe domains from ranking', async () => {
    const results = [
      makeResult({
        url: 'https://good-review.com/razer-viper-v3-pro',
        title: 'Razer Viper V3 Pro Review',
        snippet: 'Good review',
        identity_match_level: 'strong'
      }),
      makeResult({
        url: 'https://adult-site.com/razer-viper',
        title: 'Razer Viper',
        snippet: 'Adult site',
        identity_match_level: 'partial'
      })
    ];
    const safetyGateResults = new Map([
      ['adult-site.com', { safe: false, classification: 'adult_content', reason: 'Adult site' }]
    ]);
    const ranked = await rerankSerpResults({
      config: baseConfig,
      identity,
      serpResults: results,
      topK: 10,
      domainSafetyResults: safetyGateResults
    });
    const hasUnsafe = ranked.some(r => r.url.includes('adult-site.com'));
    assert.equal(hasUnsafe, false, 'Unsafe domains should be filtered out');
  });

  it('preserves explicit all-drop LLM verdicts instead of converting them into llm_empty_fallback', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (!String(url || '').includes('/v1/chat/completions')) {
        throw new Error(`unexpected fetch target: ${url}`);
      }
      const payload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                selected_urls: [
                  {
                    url: 'https://insider.razer.com/razer-support-44',
                    keep: false,
                    reason: 'General support forum',
                    score: 0
                  },
                  {
                    url: 'https://insider.razer.com/razer-synapse-4-55',
                    keep: false,
                    reason: 'Irrelevant software forum',
                    score: 0
                  }
                ]
              })
            }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        model: 'test-triage-model'
      };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
        async json() {
          return payload;
        }
      };
    };

    try {
      const ranked = await rerankSerpResults({
        config: {
          llmProvider: 'openai',
          llmApiKey: 'test-key',
          llmBaseUrl: 'http://localhost:4141',
          llmModelFast: 'test-triage-model'
        },
        identity,
        serpResults: [
          makeResult({
            url: 'https://insider.razer.com/razer-support-44',
            title: 'Razer Support - Razer Insider',
            snippet: 'General support forum',
            identity_match_level: 'weak'
          }),
          makeResult({
            url: 'https://insider.razer.com/razer-synapse-4-55',
            title: 'Razer Synapse 4',
            snippet: 'Software forum',
            identity_match_level: 'weak'
          })
        ],
        topK: 10
      });

      assert.equal(ranked.length, 0);
      assert.equal(ranked.explicitAllDrop, true);
      assert.equal(ranked.fallbackReason, 'llm_explicit_all_drop');
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('keeps only explicit LLM keep URLs when the reranker omits other candidates', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (!String(url || '').includes('/v1/chat/completions')) {
        throw new Error(`unexpected fetch target: ${url}`);
      }
      const payload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                selected_urls: [
                  {
                    url: 'https://bestbuy.com/site/searchpage.jsp?id=pcat17071&st=logitech+superlight',
                    keep: true,
                    reason: 'Search result explicitly mentions the target product.',
                    score: -1.86
                  },
                  {
                    url: 'https://bestbuy.com/site/brands/logitech/pcmcat10900050009.c?id=pcmcat10900050009',
                    keep: false,
                    reason: 'General brand page, not specific to the target product.',
                    score: -1.86
                  }
                ]
              })
            }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        model: 'test-triage-model'
      };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
        async json() {
          return payload;
        }
      };
    };

    try {
      const ranked = await rerankSerpResults({
        config: {
          llmProvider: 'openai',
          llmApiKey: 'test-key',
          llmBaseUrl: 'http://localhost:4141',
          llmModelFast: 'test-triage-model'
        },
        identity: { brand: 'Logitech G', model: 'Pro X Superlight 2', variant: '' },
        serpResults: [
          makeResult({
            url: 'https://bestbuy.com/site/brands/logitech/pcmcat10900050009.c?id=pcmcat10900050009',
            title: 'Logitech: Computer Accessories - Best Buy',
            snippet: 'General Logitech brand page',
            identity_match_level: 'none'
          }),
          makeResult({
            url: 'https://bestbuy.com/site/searchpage.jsp?id=pcat17071&st=logitech+superlight',
            title: 'logitech superlight - Best Buy',
            snippet: 'Mentions Logitech PRO X SUPERLIGHT mice',
            identity_match_level: 'partial'
          }),
          makeResult({
            url: 'https://bestbuy.com/product/logitech-pro-lightweight-wireless-optical-ambidextrous-gaming-mouse-with-rgb-lighting-wireless-black/J7H7ZY2KYS',
            title: 'Logitech PRO Lightweight Wireless Optical Ambidextrous Gaming Mouse',
            snippet: 'Different Logitech mouse product page',
            identity_match_level: 'partial'
          })
        ],
        topK: 10
      });

      assert.deepEqual(
        ranked.map((row) => row.url),
        ['https://bestbuy.com/site/searchpage.jsp?id=pcat17071&st=logitech+superlight']
      );
      assert.equal(
        ranked.some((row) => row.rerank_reason === 'llm_default_keep'),
        false
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('falls back deterministically when structured triage output is truncated mid-array', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (!String(url || '').includes('/v1/chat/completions')) {
        throw new Error(`unexpected fetch target: ${url}`);
      }
      const payload = {
        choices: [
          {
            message: {
              content: '{"selected_urls":[{"url":"https://bestbuy.com/site/searchpage.jsp?id=pcat17071&st=logitech+superlight","keep":true,"reason":"Target search result","score":1},{"url":"https://bestbuy.com/site/brands/logitech/pcmcat10900050009.c?id=pcmcat10900050009","keep":false,"reason":"General brand page","score":0},{"url":"https://bestbuy.com/product/logitech-pro-lightweight-wireless-optical-ambidextrous-gaming-mouse-with-rgb-lighting-wireless-black/J7H7ZY2KYS","keep":false'
            }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        model: 'gemini-2.5-flash'
      };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
        async json() {
          return payload;
        }
      };
    };

    try {
      const ranked = await rerankSerpResults({
        config: {
          llmProvider: 'gemini',
          llmApiKey: 'test-key',
          llmBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
          llmModelTriage: 'gemini-2.5-flash'
        },
        identity: { brand: 'Logitech G', model: 'Pro X Superlight 2', variant: '' },
        serpResults: [
          makeResult({
            url: 'https://bestbuy.com/site/brands/logitech/pcmcat10900050009.c?id=pcmcat10900050009',
            title: 'Logitech: Computer Accessories - Best Buy',
            snippet: 'General Logitech brand page',
            identity_match_level: 'none'
          }),
          makeResult({
            url: 'https://bestbuy.com/site/searchpage.jsp?id=pcat17071&st=logitech+superlight',
            title: 'logitech superlight - Best Buy',
            snippet: 'Mentions Logitech PRO X SUPERLIGHT mice',
            identity_match_level: 'partial'
          }),
          makeResult({
            url: 'https://bestbuy.com/product/logitech-pro-lightweight-wireless-optical-ambidextrous-gaming-mouse-with-rgb-lighting-wireless-black/J7H7ZY2KYS',
            title: 'Logitech PRO Lightweight Wireless Optical Ambidextrous Gaming Mouse',
            snippet: 'Different Logitech mouse product page',
            identity_match_level: 'partial'
          })
        ],
        topK: 10
      });

      assert.equal(ranked.length, 3);
      assert.equal(
        ranked.every((row) => row.rerank_reason === 'deterministic_fallback'),
        true
      );
      assert.equal(
        ranked.some((row) => row.rerank_reason === 'llm_default_keep'),
        false
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('preserves explicit all-drop decisions when the model appends a trailing empty JSON object', async () => {
    const originalFetch = global.fetch;
    global.fetch = async (url) => {
      if (!String(url || '').includes('/v1/chat/completions')) {
        throw new Error(`unexpected fetch target: ${url}`);
      }
      const content = [
        JSON.stringify({
          selected_urls: [
            {
              url: 'https://insider.razer.com/razer-support-44',
              keep: false,
              reason: 'General support forum',
              score: 4.64
            },
            {
              url: 'https://insider.razer.com/razer-synapse-4-55',
              keep: false,
              reason: 'Software forum, not mouse specs',
              score: 3.34
            }
          ]
        }),
        JSON.stringify({
          selected_urls: []
        })
      ].join('\n');
      const payload = {
        choices: [
          {
            message: {
              content
            }
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        model: 'test-triage-model'
      };
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify(payload);
        },
        async json() {
          return payload;
        }
      };
    };

    try {
      const ranked = await rerankSerpResults({
        config: {
          llmProvider: 'openai',
          llmApiKey: 'test-key',
          llmBaseUrl: 'http://localhost:4141',
          llmModelFast: 'test-triage-model'
        },
        identity,
        serpResults: [
          makeResult({
            url: 'https://insider.razer.com/razer-support-44',
            title: 'Razer Support - Razer Insider',
            snippet: 'General support forum',
            identity_match_level: 'weak'
          }),
          makeResult({
            url: 'https://insider.razer.com/razer-synapse-4-55',
            title: 'Razer Synapse 4',
            snippet: 'Software forum',
            identity_match_level: 'weak'
          })
        ],
        topK: 10
      });

      assert.equal(ranked.length, 0);
      assert.equal(ranked.explicitAllDrop, true);
      assert.equal(ranked.fallbackReason, 'llm_explicit_all_drop');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
