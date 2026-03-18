import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { extractCandidatesLLM } from '../src/features/indexing/extraction/extractCandidatesLLM.js';

function mockChatCompletionPayload(contentJson) {
  return {
    choices: [
      {
        message: {
          content: JSON.stringify(contentJson)
        }
      }
    ]
  };
}

function parseFetchBody(init = {}) {
  const body = JSON.parse(String(init?.body || '{}'));
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  const userMessage = messages.find((row) => row?.role === 'user');
  const userContent = userMessage?.content;
  const payload = (() => {
    if (typeof userContent === 'string') {
      try {
        return JSON.parse(userContent);
      } catch {
        return {};
      }
    }
    if (Array.isArray(userContent)) {
      const textPart = userContent.find((row) => row?.type === 'text');
      if (textPart && typeof textPart?.text === 'string') {
        try {
          return JSON.parse(textPart.text);
        } catch {
          return {};
        }
      }
    }
    return {};
  })();
  return {
    body,
    payload
  };
}

test('extractCandidatesLLM keeps only candidates with valid evidenceRefs', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(
        mockChatCompletionPayload({
          identityCandidates: { brand: 'Razer' },
          fieldCandidates: [
            {
              field: 'connection',
              value: 'wireless',
              evidenceRefs: ['ref-1'],
              keyPath: 'llm.connection'
            },
            {
              field: 'sensor',
              value: 'Focus Pro 35K',
              evidenceRefs: ['missing-ref'],
              keyPath: 'llm.sensor'
            }
          ],
          conflicts: [],
          notes: ['ok']
        })
      );
    }
  });

  try {
    const result = await extractCandidatesLLM({
      job: {
        productId: 'mouse-a',
        category: 'mouse',
        identityLock: { brand: 'Razer', model: 'Viper V3 Pro' },
        anchors: {}
      },
      categoryConfig: {
        fieldOrder: ['connection', 'sensor']
      },
      evidencePack: {
        references: [
          { id: 'ref-1', url: 'https://example.com', host: 'example.com', evidenceKey: 'network:1' }
        ],
        snippets: [
          { id: 'ref-1', type: 'network', normalized_text: 'Connection: wireless mode' }
        ]
      },
      config: {
        llmApiKey: 'sk-test',
        llmBaseUrl: 'https://api.openai.com',
        llmProvider: 'openai',
        llmModelExtract: 'test-model',
        llmTimeoutMs: 5_000
      }
    });

    assert.equal(result.fieldCandidates.length, 1);
    assert.equal(result.fieldCandidates[0].field, 'connection');
    assert.equal(result.fieldCandidates[0].method, 'llm_extract');
    assert.deepEqual(result.fieldCandidates[0].evidenceRefs, ['ref-1']);
    assert.equal(result.identityCandidates.brand, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('extractCandidatesLLM returns known-answer candidates with evidence refs', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(
        mockChatCompletionPayload({
          identityCandidates: {},
          fieldCandidates: [
            {
              field: 'weight',
              value: '60 g',
              evidenceRefs: ['s01'],
              keyPath: 'llm.weight'
            },
            {
              field: 'polling_rate',
              value: '8000',
              evidenceRefs: ['t01'],
              keyPath: 'llm.polling'
            }
          ],
          conflicts: [],
          notes: ['fixture-ok']
        })
      );
    }
  });

  try {
    const result = await extractCandidatesLLM({
      job: {
        productId: 'mouse-logitech-g-pro-x-superlight-2',
        category: 'mouse',
        identityLock: { brand: 'Logitech', model: 'G Pro X Superlight 2' },
        anchors: {}
      },
      categoryConfig: {
        category: 'mouse',
        fieldOrder: ['weight', 'polling_rate', 'dpi'],
        requiredFields: ['weight', 'polling_rate']
      },
      evidencePack: {
        meta: {
          host: 'logitechg.com',
          total_chars: 1200
        },
        references: [
          { id: 's01', url: 'https://logitechg.com/specs' },
          { id: 't01', url: 'https://logitechg.com/specs' }
        ],
        snippets: [
          { id: 's01', text: 'Weight: 60 g' },
          { id: 't01', text: 'Polling rate: up to 8000 Hz' }
        ]
      },
      config: {
        llmApiKey: 'sk-test',
        llmBaseUrl: 'https://api.deepseek.com',
        llmProvider: 'deepseek',
        llmModelExtract: 'deepseek-reasoner',
        llmReasoningMode: true,
        llmReasoningBudget: 1024,
        llmTimeoutMs: 5_000
      }
    });

    assert.equal(result.fieldCandidates.length >= 2, true);
    const byField = Object.fromEntries(result.fieldCandidates.map((row) => [row.field, row]));
    assert.equal(byField.weight.value, '60 g');
    assert.equal(byField.polling_rate.value, '8000');
    assert.equal(byField.weight.evidenceRefs.length > 0, true);
    assert.equal(byField.polling_rate.evidenceRefs.length > 0, true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('extractCandidatesLLM uses route matrix model ladder + token cap override', async () => {
  const originalFetch = global.fetch;
  const observed = {
    model: '',
    maxTokens: 0
  };
  global.fetch = async (_url, init) => {
    const { body } = parseFetchBody(init);
    observed.model = String(body?.model || '');
    observed.maxTokens = Number(body?.max_tokens || body?.max_completion_tokens || 0);
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(
          mockChatCompletionPayload({
            identityCandidates: {},
            fieldCandidates: [
              {
                field: 'sensor',
                value: 'Focus Pro 35K',
                evidenceRefs: ['ref-1'],
                keyPath: 'llm.sensor'
              }
            ],
            conflicts: [],
            notes: []
          })
        );
      }
    };
  };

  try {
    const result = await extractCandidatesLLM({
      job: {
        productId: 'mouse-route-model-ladder',
        category: 'mouse',
        identityLock: {},
        anchors: {}
      },
      categoryConfig: {
        category: 'mouse',
        fieldOrder: ['sensor']
      },
      evidencePack: {
        references: [{ id: 'ref-1', url: 'https://example.com/specs' }],
        snippets: [{ id: 'ref-1', normalized_text: 'Sensor: Focus Pro 35K' }]
      },
      llmContext: {
        route_matrix_policy: {
          model_ladder_today: 'route-ladder-model-a -> route-ladder-model-b',
          max_tokens: 4321,
          min_evidence_refs_effective: 1
        }
      },
      config: {
        llmApiKey: 'sk-test',
        llmBaseUrl: 'https://api.openai.com',
        llmProvider: 'openai',
        llmModelExtract: 'fallback-model',
        llmModelPlan: 'plan-model',
        llmMaxOutputTokensPlan: 8192,
        llmMaxOutputTokens: 8192,
        llmMaxOutputTokensExtract: 8192,
        llmTimeoutMs: 5_000
      }
    });

    assert.equal(result.fieldCandidates.length, 1);
    assert.equal(observed.model, 'route-ladder-model-a');
    assert.equal(observed.maxTokens, 4321);
  } finally {
    global.fetch = originalFetch;
  }
});

test('extractCandidatesLLM sends promoted visual assets as multimodal images when route policy allows prime-source visuals', async () => {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'extract-llm-visuals-'));
  const imagePath = path.join(tmpDir, 'hero.png');
  await fs.writeFile(imagePath, Buffer.from('fake-image-bytes'));

  const originalFetch = global.fetch;
  const infoCalls = [];
  let observedUserContent = null;
  global.fetch = async (_url, init) => {
    const body = JSON.parse(String(init?.body || '{}'));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    observedUserContent = messages.find((row) => row?.role === 'user')?.content ?? null;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(
          mockChatCompletionPayload({
            identityCandidates: {},
            fieldCandidates: [
              {
                field: 'sensor',
                value: 'Focus Pro 35K',
                evidenceRefs: ['ref-1'],
                keyPath: 'llm.sensor'
              }
            ],
            conflicts: [],
            notes: []
          })
        );
      }
    };
  };

  try {
    const result = await extractCandidatesLLM({
      job: {
        productId: 'mouse-route-multimodal-visuals',
        category: 'mouse',
        identityLock: {},
        anchors: {}
      },
      categoryConfig: {
        category: 'mouse',
        fieldOrder: ['sensor']
      },
      evidencePack: {
        meta: {
          host: 'example.com',
          total_chars: 1200,
          source_id: 'example_source'
        },
        references: [
          { id: 'ref-1', url: 'https://example.com/specs', source_id: 'vendor:example' }
        ],
        snippets: [
          { id: 'ref-1', source_id: 'vendor:example', normalized_text: 'Sensor: Focus Pro 35K' }
        ],
        visual_assets: [
          {
            id: 'img-1',
            kind: 'screenshot_capture',
            source_id: 'example_source',
            source_url: 'https://example.com/specs',
            file_uri: imagePath,
            mime_type: 'image/png',
            content_hash: 'sha256:image-1'
          }
        ]
      },
      llmContext: {
        route_matrix_policy: {
          prime_sources_visual_send: true,
          min_evidence_refs_effective: 1
        }
      },
      config: {
        llmApiKey: 'sk-test',
        llmBaseUrl: 'https://api.openai.com',
        llmProvider: 'openai',
        llmModelExtract: 'test-model',
        llmModelPlan: 'test-model',
        llmTimeoutMs: 5_000
      },
      logger: {
        info: (...args) => infoCalls.push(args),
        warn() {},
        error() {}
      }
    });

    const multimodalProfile = infoCalls.find((row) => row[0] === 'llm_extract_multimodal_profile')?.[1] || null;

    assert.equal(result.fieldCandidates.length, 1);
    assert.equal(Array.isArray(observedUserContent), true);
    assert.equal(observedUserContent.some((row) => row?.type === 'text'), true);
    assert.equal(observedUserContent.some((row) => row?.type === 'image_url'), true);
    const imagePart = observedUserContent.find((row) => row?.type === 'image_url');
    assert.equal(String(imagePart?.image_url?.url || '').startsWith('data:image/png;base64,'), true);
    assert.equal(multimodalProfile?.scoped_visual_asset_count, 1);
    assert.equal(multimodalProfile?.multimodal_image_count, 1);
    assert.deepEqual(multimodalProfile?.multimodal_image_uris, [imagePath]);
  } finally {
    global.fetch = originalFetch;
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

test('extractCandidatesLLM applies route evidence source policy (single source + no websearch)', async () => {
  const originalFetch = global.fetch;
  let observedReferences = [];
  global.fetch = async (_url, init) => {
    const { payload } = parseFetchBody(init);
    observedReferences = Array.isArray(payload?.references) ? payload.references : [];
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(
          mockChatCompletionPayload({
            identityCandidates: {},
            fieldCandidates: [
              {
                field: 'sensor',
                value: 'Focus Pro 35K',
                evidenceRefs: ['ref-vendor'],
                keyPath: 'llm.sensor'
              }
            ],
            conflicts: [],
            notes: []
          })
        );
      }
    };
  };

  try {
    const result = await extractCandidatesLLM({
      job: {
        productId: 'mouse-route-source-policy',
        category: 'mouse',
        identityLock: {},
        anchors: {}
      },
      categoryConfig: {
        category: 'mouse',
        fieldOrder: ['sensor']
      },
      evidencePack: {
        references: [
          { id: 'ref-search', url: 'https://www.google.com/search?q=viper+sensor', source_id: 'search:google' },
          { id: 'ref-vendor', url: 'https://www.razer.com/viper-specs', source_id: 'vendor:razer' }
        ],
        snippets: [
          { id: 'ref-search', source_id: 'search:google', normalized_text: 'Sensor Focus Pro details from search snippets' },
          { id: 'ref-vendor', source_id: 'vendor:razer', normalized_text: 'Sensor: Focus Pro 35K from product page' }
        ]
      },
      llmContext: {
        route_matrix_policy: {
          single_source_data: true,
          all_source_data: false,
          enable_websearch: false,
          min_evidence_refs_effective: 1
        }
      },
      config: {
        llmApiKey: 'sk-test',
        llmBaseUrl: 'https://api.openai.com',
        llmProvider: 'openai',
        llmModelExtract: 'test-model',
        llmModelPlan: 'test-model',
        llmTimeoutMs: 5_000
      }
    });

    assert.equal(result.fieldCandidates.length, 1);
    assert.equal(observedReferences.length, 1);
    assert.equal(String(observedReferences[0]?.id || ''), 'ref-vendor');
    assert.equal(String(observedReferences[0]?.url || '').includes('razer.com'), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test('extractCandidatesLLM applies studio prompt flags from route policy', async () => {
  const originalFetch = global.fetch;
  let observedPayload = {};
  global.fetch = async (_url, init) => {
    const { payload } = parseFetchBody(init);
    observedPayload = payload;
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify(
          mockChatCompletionPayload({
            identityCandidates: {},
            fieldCandidates: [
              {
                field: 'sensor',
                value: 'Focus Pro 35K',
                evidenceRefs: ['ref-1'],
                keyPath: 'llm.sensor'
              }
            ],
            conflicts: [],
            notes: []
          })
        );
      }
    };
  };

  try {
    const result = await extractCandidatesLLM({
      job: {
        productId: 'mouse-route-studio-flags',
        category: 'mouse',
        identityLock: {},
        anchors: {}
      },
      categoryConfig: {
        category: 'mouse',
        fieldOrder: ['sensor'],
        fieldRules: {
          fields: {
            sensor: {
              description: 'Sensor model',
              tooltip_md: 'Tooltip text',
              type: 'string',
              component_db_ref: 'sensor',
              enum: ['Focus Pro 35K'],
              evidence: { min_evidence_refs: 1 }
            }
          }
        }
      },
      componentDBs: {
        sensor: {
          entries: {
            fp35k: { canonical_name: 'Focus Pro 35K' }
          }
        }
      },
      evidencePack: {
        references: [{ id: 'ref-1', url: 'https://example.com/specs' }],
        snippets: [{ id: 'ref-1', normalized_text: 'Sensor: Focus Pro 35K' }]
      },
      llmContext: {
        route_matrix_policy: {
          min_evidence_refs_effective: 1,
          studio_contract_rules_sent_in_extract_review: false,
          studio_extraction_guidance_sent_in_extract_review: false,
          studio_tooltip_or_description_sent_when_present: false,
          studio_enum_options_sent_when_present: false,
          studio_component_entity_set_sent_when_component_field: false,
          studio_evidence_policy_sent_direct_in_extract_review: false,
          studio_parse_template_sent_direct_in_extract_review: false,
          studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: false,
          studio_required_level_sent_in_extract_review: false,
          studio_key_navigation_sent_in_extract_review: false
        }
      },
      config: {
        llmApiKey: 'sk-test',
        llmBaseUrl: 'https://api.openai.com',
        llmProvider: 'openai',
        llmModelExtract: 'test-model',
        llmModelPlan: 'test-model',
        llmTimeoutMs: 5_000
      }
    });

    assert.equal(result.fieldCandidates.length, 1);
    assert.deepEqual(observedPayload.contracts || {}, {});
    assert.deepEqual(observedPayload.enumOptions || {}, {});
    assert.deepEqual(observedPayload.componentRefs || {}, {});
    const contextField = observedPayload?.extraction_context?.fields?.sensor || {};
    assert.equal(Object.hasOwn(contextField, 'contract'), false);
    assert.equal(Object.hasOwn(contextField, 'evidence_policy'), false);
    assert.equal(Object.hasOwn(contextField, 'parse_template_intent'), false);
    assert.equal(Object.hasOwn(contextField, 'ui'), false);
    assert.equal(Object.hasOwn(contextField, 'required_level'), false);
    assert.equal(Object.hasOwn(contextField, 'difficulty'), false);
    assert.equal(Object.hasOwn(contextField, 'effort'), false);
    assert.equal(Object.hasOwn(contextField, 'component_ref'), false);
    assert.equal(Object.hasOwn(contextField, 'enum_options'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('extractCandidatesLLM supports insufficient_evidence_action=escalate', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify(
        mockChatCompletionPayload({
          identityCandidates: {},
          fieldCandidates: [
            {
              field: 'sensor',
              value: 'Focus Pro 35K',
              evidenceRefs: ['ref-1'],
              keyPath: 'llm.sensor'
            }
          ],
          conflicts: [],
          notes: []
        })
      );
    }
  });

  try {
    const result = await extractCandidatesLLM({
      job: {
        productId: 'mouse-route-insufficient-evidence',
        category: 'mouse',
        identityLock: {},
        anchors: {}
      },
      categoryConfig: {
        category: 'mouse',
        fieldOrder: ['sensor']
      },
      evidencePack: {
        references: [{ id: 'ref-1', url: 'https://example.com/specs' }],
        snippets: [{ id: 'ref-1', normalized_text: 'Sensor: Focus Pro 35K' }]
      },
      llmContext: {
        route_matrix_policy: {
          min_evidence_refs_effective: 3,
          insufficient_evidence_action: 'escalate'
        }
      },
      config: {
        llmApiKey: 'sk-test',
        llmBaseUrl: 'https://api.openai.com',
        llmProvider: 'openai',
        llmModelExtract: 'test-model',
        llmModelPlan: 'test-model',
        llmTimeoutMs: 5_000
      }
    });

    assert.equal(result.fieldCandidates.length, 1);
    assert.equal(result.fieldCandidates[0].method, 'llm_extract_escalated_low_evidence');
    assert.equal(result.fieldCandidates[0].low_evidence_escalated, true);
  } finally {
    global.fetch = originalFetch;
  }
});
