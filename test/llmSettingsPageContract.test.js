import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

function createRow(overrides = {}) {
  return {
    route_key: 'route-alpha',
    scope: 'field',
    required_level: 'expected',
    difficulty: 'easy',
    availability: 'always',
    effort: 3,
    effort_band: '1-3',
    single_source_data: true,
    all_source_data: false,
    enable_websearch: false,
    model_ladder_today: 'gpt-5-low',
    all_sources_confidence_repatch: false,
    max_tokens: 2048,
    studio_key_navigation_sent_in_extract_review: true,
    studio_contract_rules_sent_in_extract_review: true,
    studio_extraction_guidance_sent_in_extract_review: true,
    studio_tooltip_or_description_sent_when_present: true,
    studio_enum_options_sent_when_present: false,
    studio_component_variance_constraints_sent_in_component_review: false,
    studio_parse_template_sent_direct_in_extract_review: true,
    studio_ai_mode_difficulty_effort_sent_direct_in_extract_review: true,
    studio_required_level_sent_in_extract_review: true,
    studio_component_entity_set_sent_when_component_field: false,
    studio_evidence_policy_sent_direct_in_extract_review: true,
    studio_variance_policy_sent_in_component_review: false,
    studio_constraints_sent_in_component_review: false,
    studio_send_booleans_prompted_to_model: false,
    scalar_linked_send: 'scalar value',
    component_values_send: 'component values',
    list_values_send: 'list values',
    llm_output_min_evidence_refs_required: 1,
    insufficient_evidence_action: 'threshold_unmet',
    ...overrides,
  };
}

function createHarness(overrides = {}) {
  return {
    bootstrapRows: [],
    llmSettingsReady: true,
    uiState: {
      category: 'mouse',
      llmSettingsAutoSaveEnabled: false,
      setLlmSettingsAutoSaveEnabled(value) {
        globalThis.__llmSettingsPageHarness.uiState.llmSettingsAutoSaveEnabled = Boolean(value);
        globalThis.__llmSettingsPageHarness.needsRerender = true;
      },
    },
    authorityResult: {
      data: undefined,
      isLoading: false,
      isSaving: false,
      isResetting: false,
      reload: async () => {},
      save: async () => {},
      resetDefaults: async () => {},
    },
    state: [],
    refs: [],
    cursor: 0,
    effects: [],
    effectDeps: [],
    effectCursor: 0,
    needsRerender: false,
    ...overrides,
  };
}

function stableEqual(a, b) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return Object.is(a, b);
  }
}

function renderElement(node) {
  if (Array.isArray(node)) {
    return node.map(renderElement);
  }
  if (node == null || typeof node !== 'object') {
    return node;
  }
  if (typeof node.type === 'function') {
    return renderElement(node.type(node.props || {}));
  }
  const nextChildren = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderElement(node.props.children)
    : node.props?.children;
  return {
    ...node,
    props: {
      ...(node.props || {}),
      children: nextChildren,
    },
  };
}

function renderPage(Page, harness) {
  globalThis.__llmSettingsPageHarness = harness;
  let tree = null;
  for (let pass = 0; pass < 8; pass += 1) {
    harness.cursor = 0;
    harness.effects = [];
    harness.effectCursor = 0;
    harness.needsRerender = false;
    tree = renderElement(Page());
    const effects = [...harness.effects];
    harness.effects = [];
    for (const effect of effects) {
      effect();
    }
    if (!harness.needsRerender) {
      return tree;
    }
  }
  throw new Error('llm_settings_page_render_loop');
}

function collectNodes(node, predicate, acc = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, acc);
    return acc;
  }
  if (node == null || typeof node !== 'object') {
    return acc;
  }
  if (predicate(node)) {
    acc.push(node);
  }
  collectNodes(node.props?.children, predicate, acc);
  return acc;
}

function textContent(node) {
  if (Array.isArray(node)) {
    return node.map(textContent).join('');
  }
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node !== 'object') {
    return String(node);
  }
  return textContent(node.props?.children);
}

function findNode(node, predicate) {
  return collectNodes(node, predicate, [])[0] || null;
}

async function loadPageModule() {
  return loadBundledModule('tools/gui-react/src/pages/llm-settings/LlmSettingsPage.tsx', {
    prefix: 'llm-settings-page-contract-',
    stubs: {
      react: `
        function stableEqual(a, b) {
          try {
            return JSON.stringify(a) === JSON.stringify(b);
          } catch {
            return Object.is(a, b);
          }
        }
        export function useState(initialValue) {
          const harness = globalThis.__llmSettingsPageHarness;
          const idx = harness.cursor++;
          if (!(idx in harness.state)) {
            harness.state[idx] = typeof initialValue === 'function' ? initialValue() : initialValue;
          }
          return [
            harness.state[idx],
            (nextValue) => {
              const resolved = typeof nextValue === 'function' ? nextValue(harness.state[idx]) : nextValue;
              if (!stableEqual(harness.state[idx], resolved)) {
                harness.state[idx] = resolved;
                harness.needsRerender = true;
              }
            },
          ];
        }
        export function useEffect(effect) {
          const harness = globalThis.__llmSettingsPageHarness;
          const idx = harness.effectCursor++;
          const deps = arguments.length > 1 ? arguments[1] : undefined;
          const prevDeps = harness.effectDeps[idx];
          const changed = !Array.isArray(deps)
            || !Array.isArray(prevDeps)
            || deps.length !== prevDeps.length
            || deps.some((value, depIdx) => !stableEqual(value, prevDeps[depIdx]));
          if (changed) {
            harness.effectDeps[idx] = deps;
            harness.effects.push(effect);
          }
        }
        export function useMemo(factory) {
          return factory();
        }
        export function useRef(initialValue) {
          const harness = globalThis.__llmSettingsPageHarness;
          const idx = harness.cursor++;
          if (!(idx in harness.refs)) {
            harness.refs[idx] = { current: initialValue };
          }
          return harness.refs[idx];
        }
      `,
      'react/jsx-runtime': `
        export function jsx(type, props) {
          return { type, props: props || {} };
        }
        export const jsxs = jsx;
        export const Fragment = Symbol.for('fragment');
      `,
      '../../stores/tabStore': `
        import { useState } from 'react';
        export function usePersistedTab(_key, initialValue) {
          return useState(initialValue);
        }
      `,
      '../../stores/uiStore': `
        export function useUiStore(selector) {
          return selector(globalThis.__llmSettingsPageHarness.uiState);
        }
      `,
      '../../stores/llmSettingsAuthority': `
        export function useLlmSettingsBootstrapRows() {
          return globalThis.__llmSettingsPageHarness.bootstrapRows;
        }
        export function useLlmSettingsAuthority() {
          return globalThis.__llmSettingsPageHarness.authorityResult;
        }
      `,
      '../../stores/settingsAuthorityStore': `
        export function useSettingsAuthorityStore(selector) {
          return selector({
            snapshot: {
              llmSettingsReady: globalThis.__llmSettingsPageHarness.llmSettingsReady,
            },
          });
        }
      `,
      '../../components/common/Spinner': `
        export function Spinner(props) {
          return { type: 'Spinner', props: props || {} };
        }
      `,
      '../../shared/ui/feedback/settingsStatus': `
        export function resolveLlmSettingsStatusText({ llmHydrated, dirty }) {
          if (!llmHydrated) return 'waiting';
          return dirty ? 'dirty' : 'saved';
        }
      `,
      '../../stores/settingsManifest': `
        export const LLM_SETTING_LIMITS = {
          effort: { min: 1, max: 10 },
          maxTokens: { min: 256, max: 65536, step: 256 },
          minEvidenceRefs: { min: 1, max: 5 },
        };
        export const LLM_ROUTE_PRESET_LIMITS = {
          fast: {
            maxTokensMin: 2048,
            maxTokensMax: 6144,
            modelLadderToday: 'gpt-5-low -> gpt-5-medium',
            singleSourceData: true,
            allSourceData: false,
            enableWebsearch: false,
            allSourcesConfidenceRepatch: true,
            minEvidenceRefsRequired: 1,
          },
          balanced: {
            maxTokensMin: 4096,
            maxTokensMax: 8192,
            modelLadderToday: 'gpt-5-medium -> gpt-5.1-medium',
            singleSourceData: true,
            allSourceData: false,
            enableWebsearch: false,
            allSourcesConfidenceRepatch: true,
          },
          deep: {
            maxTokensMin: 12288,
            maxTokensMax: 65536,
            modelLadderToday: 'gpt-5.2-high -> gpt-5.1-high',
            singleSourceData: true,
            allSourceData: true,
            enableWebsearch: true,
            allSourcesConfidenceRepatch: true,
            minEvidenceRefsRequired: 2,
          },
        };
      `,
    },
  });
}

test('llm settings page blocks empty render until shared hydration is ready', async () => {
  const { LlmSettingsPage } = await loadPageModule();
  const harness = createHarness({
    llmSettingsReady: false,
    bootstrapRows: [],
    authorityResult: {
      data: undefined,
      isLoading: true,
      isSaving: false,
      isResetting: false,
      reload: async () => {},
      save: async () => {},
      resetDefaults: async () => {},
    },
  });

  const tree = renderPage(LlmSettingsPage, harness);

  assert.equal(tree?.type, 'Spinner');
  delete globalThis.__llmSettingsPageHarness;
});

test('llm settings page bootstraps rows from authority cache and maps effort tiers to chip classes', async () => {
  const { LlmSettingsPage } = await loadPageModule();
  const harness = createHarness({
    bootstrapRows: [
      createRow({ route_key: 'route-low', effort: 2 }),
      createRow({ route_key: 'route-mid', effort: 5 }),
      createRow({ route_key: 'route-high', effort: 8 }),
      createRow({ route_key: 'route-top', effort: 10 }),
    ],
  });

  const tree = renderPage(LlmSettingsPage, harness);
  const chips = collectNodes(
    tree,
    (node) => node.type === 'span' && String(node.props?.className || '').includes('sf-chip-'),
  );

  const chipByText = new Map(chips.map((node) => [textContent(node).trim(), String(node.props.className || '')]));

  assert.equal(textContent(tree).includes('LLM Settings Studio'), true);
  assert.equal(textContent(tree).includes('route-low'), true);
  assert.equal(textContent(tree).includes('route-top'), true);
  assert.equal(chipByText.get('effort 2')?.includes('sf-chip-success'), true);
  assert.equal(chipByText.get('effort 5')?.includes('sf-chip-info'), true);
  assert.equal(chipByText.get('effort 8')?.includes('sf-chip-warning'), true);
  assert.equal(chipByText.get('effort 10')?.includes('sf-chip-danger'), true);

  delete globalThis.__llmSettingsPageHarness;
});

test('llm settings sliders clamp invalid values through shared bounds', async () => {
  const { LlmSettingsPage } = await loadPageModule();
  const harness = createHarness({
    bootstrapRows: [createRow({ route_key: 'route-clamp', effort: 5, max_tokens: 2048, llm_output_min_evidence_refs_required: 3 })],
  });

  let tree = renderPage(LlmSettingsPage, harness);
  let rangeInputs = collectNodes(tree, (node) => node.type === 'input' && node.props?.type === 'range');
  assert.equal(rangeInputs.length >= 3, true);

  rangeInputs[0].props.onChange({ target: { value: 'not-a-number' } });
  tree = renderPage(LlmSettingsPage, harness);
  assert.equal(textContent(tree).includes('Effort: 1'), true);

  rangeInputs = collectNodes(tree, (node) => node.type === 'input' && node.props?.type === 'range');
  rangeInputs[1].props.onChange({ target: { value: '999999' } });
  tree = renderPage(LlmSettingsPage, harness);
  assert.equal(textContent(tree).includes('Max Tokens: 65536'), true);

  rangeInputs = collectNodes(tree, (node) => node.type === 'input' && node.props?.type === 'range');
  rangeInputs[2].props.onChange({ target: { value: '0' } });
  tree = renderPage(LlmSettingsPage, harness);
  assert.equal(textContent(tree).includes('Min Evidence Refs: 1'), true);

  delete globalThis.__llmSettingsPageHarness;
});

test('llm settings route presets apply bounded min-evidence defaults through shared limits', async () => {
  const { LlmSettingsPage } = await loadPageModule();
  const harness = createHarness({
    bootstrapRows: [createRow({
      route_key: 'route-preset',
      effort: 7,
      max_tokens: 512,
      llm_output_min_evidence_refs_required: undefined,
    })],
  });

  let tree = renderPage(LlmSettingsPage, harness);
  const deepButton = findNode(tree, (node) => node.type === 'button' && textContent(node).trim() === 'Deep');
  assert.ok(deepButton, 'deep preset button should render for selected route');
  deepButton.props.onClick();

  tree = renderPage(LlmSettingsPage, harness);
  assert.equal(textContent(tree).includes('Min Evidence Refs: 2'), true);
  assert.equal(textContent(tree).includes('Max Tokens: 12288'), true);

  const fastButton = findNode(tree, (node) => node.type === 'button' && textContent(node).trim() === 'Fast');
  assert.ok(fastButton, 'fast preset button should render for selected route');
  fastButton.props.onClick();

  tree = renderPage(LlmSettingsPage, harness);
  assert.equal(textContent(tree).includes('Min Evidence Refs: 1'), true);
  assert.equal(textContent(tree).includes('Max Tokens: 6144'), true);

  delete globalThis.__llmSettingsPageHarness;
});
