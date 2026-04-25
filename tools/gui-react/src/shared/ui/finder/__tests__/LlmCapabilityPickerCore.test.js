import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const STUBS = {
  'react/jsx-runtime': `
    export function jsx(type, props) { return { type, props: props || {} }; }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `,
  '../../../features/pipeline-settings/index.ts': `
    export function SettingRow(props) { return { type: 'SettingRow', props }; }
    export function SettingToggle(props) { return { type: 'SettingToggle', props }; }
  `,
  '../../../features/llm-config/components/ModelSelectDropdown.tsx': `
    export function ModelSelectDropdown(props) { return { type: 'ModelSelectDropdown', props }; }
    export function GlobalDefaultIcon(props) { return { type: 'GlobalDefaultIcon', props: props || {} }; }
  `,
  '../../../features/llm-config/state/llmModelDropdownOptions.ts': `
    export function buildModelDropdownOptions() { return []; }
  `,
  '../../../features/llm-config/state/llmProviderRegistryBridge.ts': `
    export function parseModelKey(key) {
      const i = (key || '').indexOf(':');
      return i > 0 ? { providerId: key.slice(0, i), modelId: key.slice(i + 1) } : { providerId: '', modelId: key || '' };
    }
    export function resolveProviderForModel(registry, modelKey) {
      if (!registry || !modelKey) return null;
      const i = String(modelKey).indexOf(':');
      const providerId = i > 0 ? modelKey.slice(0, i) : null;
      const bareId = i > 0 ? modelKey.slice(i + 1) : modelKey;
      for (const p of registry) {
        if (providerId && p.id !== providerId) continue;
        if ((p.models || []).some((m) => m.modelId === bareId)) return p;
      }
      return null;
    }
  `,
  '../../../features/llm-config/state/llmEffortFromModelName.ts': `
    const SUFFIXES = ['-xhigh', '-high', '-medium', '-low'];
    export function extractEffortFromModelName(modelId) {
      if (!modelId) return null;
      for (const s of SUFFIXES) {
        if (modelId.endsWith(s)) return s.slice(1);
      }
      return null;
    }
  `,
};

async function loadPicker() {
  return loadBundledModule(
    'tools/gui-react/src/shared/ui/finder/LlmCapabilityPickerCore.tsx',
    { prefix: 'llm-capability-picker-core-', stubs: STUBS },
  );
}

function renderNode(node) {
  if (Array.isArray(node)) return node.map(renderNode);
  if (node == null || typeof node !== 'object') return node;
  if (node.type === Symbol.for('fragment')) return renderNode(node.props?.children);
  if (typeof node.type === 'function') return renderNode(node.type(node.props || {}));
  const children = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderNode(node.props.children)
    : node.props?.children;
  return { ...node, props: { ...(node.props || {}), children } };
}

function collectByType(node, typeName, results = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectByType(child, typeName, results);
    return results;
  }
  if (node == null || typeof node !== 'object') return results;
  if (node.type === typeName) results.push(node);
  collectByType(node.props?.children, typeName, results);
  return results;
}

function rowLabels(tree) {
  return collectByType(tree, 'SettingRow').map((row) => row.props?.label);
}

const PROVIDER_FULL = {
  id: 'lab',
  name: 'Lab',
  models: [
    { modelId: 'gpt-5.4', role: 'primary', thinking: true, webSearch: true, thinkingEffortOptions: ['low', 'medium', 'high', 'xhigh'] },
    { modelId: 'gpt-5.4-xhigh', role: 'primary', thinking: true, webSearch: true, thinkingEffortOptions: ['xhigh'] },
    { modelId: 'gpt-5.4-thinker', role: 'primary', thinking: true, webSearch: false, thinkingEffortOptions: ['low', 'medium', 'high'] },
    { modelId: 'gpt-5.4-searcher', role: 'primary', thinking: false, webSearch: true, thinkingEffortOptions: [] },
    { modelId: 'gemini-2.5-flash', role: 'primary', thinking: false, webSearch: false, thinkingEffortOptions: [] },
    { modelId: 'deepseek-v4-pro', role: 'reasoning', thinking: true, webSearch: false, thinkingEffortOptions: ['low', 'medium', 'high'] },
  ],
};

const REGISTRY = [PROVIDER_FULL];
const MODEL_OPTIONS = ['gpt-5.4', 'gpt-5.4-xhigh', 'gpt-5.4-thinker', 'gpt-5.4-searcher', 'gemini-2.5-flash', 'deepseek-v4-pro'];

const EMPTY_BUNDLE = {
  model: '',
  useReasoning: false,
  reasoningModel: '',
  thinking: false,
  thinkingEffort: '',
  webSearch: false,
};

const baseProps = {
  registry: REGISTRY,
  llmModelOptions: MODEL_OPTIONS,
  globalDefaultPlanModel: 'gemini-2.5-flash',
  globalDefaultReasoningModel: 'deepseek-v4-pro',
  inputCls: 'sf-input',
};

test('LlmCapabilityPickerCore renders all six rows when model has thinking + webSearch', async () => {
  const { LlmCapabilityPickerCore } = await loadPicker();
  const tree = renderNode(LlmCapabilityPickerCore({
    ...baseProps,
    value: { ...EMPTY_BUNDLE, model: 'gpt-5.4', thinking: true },
    onChange: () => {},
  }));
  const labels = rowLabels(tree);
  assert.deepEqual(labels, ['Model', 'Use Reasoning', 'Thinking', 'Thinking Effort', 'Web Search']);
});

test('LlmCapabilityPickerCore hides Thinking row when model declares thinking=false', async () => {
  const { LlmCapabilityPickerCore } = await loadPicker();
  const tree = renderNode(LlmCapabilityPickerCore({
    ...baseProps,
    value: { ...EMPTY_BUNDLE, model: 'gpt-5.4-searcher' },
    onChange: () => {},
  }));
  const labels = rowLabels(tree);
  assert.equal(labels.includes('Thinking'), false);
  assert.equal(labels.includes('Thinking Effort'), false);
  assert.equal(labels.includes('Web Search'), true);
});

test('LlmCapabilityPickerCore hides Web Search row when model declares webSearch=false', async () => {
  const { LlmCapabilityPickerCore } = await loadPicker();
  const tree = renderNode(LlmCapabilityPickerCore({
    ...baseProps,
    value: { ...EMPTY_BUNDLE, model: 'gpt-5.4-thinker', thinking: true },
    onChange: () => {},
  }));
  const labels = rowLabels(tree);
  assert.equal(labels.includes('Web Search'), false);
  assert.equal(labels.includes('Thinking'), true);
});

test('LlmCapabilityPickerCore hides capability rows entirely for non-capable model', async () => {
  const { LlmCapabilityPickerCore } = await loadPicker();
  const tree = renderNode(LlmCapabilityPickerCore({
    ...baseProps,
    value: { ...EMPTY_BUNDLE, model: 'gemini-2.5-flash' },
    onChange: () => {},
  }));
  const labels = rowLabels(tree);
  assert.deepEqual(labels, ['Model', 'Use Reasoning']);
});

test('LlmCapabilityPickerCore reveals Reasoning Model row when useReasoning=true', async () => {
  const { LlmCapabilityPickerCore } = await loadPicker();
  const tree = renderNode(LlmCapabilityPickerCore({
    ...baseProps,
    value: { ...EMPTY_BUNDLE, model: 'gemini-2.5-flash', useReasoning: true, reasoningModel: 'deepseek-v4-pro', thinking: true },
    onChange: () => {},
  }));
  const labels = rowLabels(tree);
  assert.equal(labels.includes('Reasoning Model'), true);
  // Capabilities now resolve from reasoningModel (deepseek-v4-pro: thinking=true, webSearch=false)
  assert.equal(labels.includes('Thinking'), true);
  assert.equal(labels.includes('Web Search'), false);
});

test('LlmCapabilityPickerCore renders locked effort select when model has baked suffix', async () => {
  const { LlmCapabilityPickerCore } = await loadPicker();
  const tree = renderNode(LlmCapabilityPickerCore({
    ...baseProps,
    value: { ...EMPTY_BUNDLE, model: 'gpt-5.4-xhigh', thinking: true, thinkingEffort: 'xhigh' },
    onChange: () => {},
  }));
  const lockedRow = collectByType(tree, 'SettingRow').find((r) => r.props?.label === 'Thinking Effort');
  assert.ok(lockedRow, 'Thinking Effort row should render');
  // The locked select is wrapped in a flex div; find the disabled <select>
  const selects = collectByType(lockedRow.props.children, 'select');
  assert.equal(selects.length, 1);
  assert.equal(selects[0].props?.disabled, true);
  assert.equal(selects[0].props?.value, 'xhigh');
});

test('LlmCapabilityPickerCore onChange propagates full next bundle on edit', async () => {
  const { LlmCapabilityPickerCore } = await loadPicker();
  const captured = [];
  const tree = renderNode(LlmCapabilityPickerCore({
    ...baseProps,
    value: { ...EMPTY_BUNDLE, model: 'gpt-5.4', thinking: false },
    onChange: (next) => captured.push(next),
  }));
  const thinkingToggle = collectByType(tree, 'SettingToggle').find((t) => {
    // Find the toggle inside the Thinking row by walking up — simpler: find by checked=false among toggles
    return t.props?.checked === false;
  });
  // Sanity: we expect at least useReasoning + thinking toggles, both unchecked
  const toggles = collectByType(tree, 'SettingToggle');
  assert.ok(toggles.length >= 2);
  // Invoke the onChange of the second toggle (Thinking)
  toggles[1].props.onChange(true);
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0], { ...EMPTY_BUNDLE, model: 'gpt-5.4', thinking: true });
  // Verify the first toggle (Use Reasoning) also propagates correctly
  toggles[0].props.onChange(true);
  assert.equal(captured.length, 2);
  assert.equal(captured[1].useReasoning, true);
});

test('LlmCapabilityPickerCore disables model dropdown when useReasoning=true', async () => {
  const { LlmCapabilityPickerCore } = await loadPicker();
  const tree = renderNode(LlmCapabilityPickerCore({
    ...baseProps,
    value: { ...EMPTY_BUNDLE, model: 'gpt-5.4', useReasoning: true, reasoningModel: 'deepseek-v4-pro' },
    onChange: () => {},
  }));
  const dropdowns = collectByType(tree, 'ModelSelectDropdown');
  // First dropdown is the model row (disabled), second is the reasoning model row
  assert.equal(dropdowns[0].props?.disabled, true);
  assert.equal(dropdowns[1].props?.disabled, undefined);
});

test('LlmCapabilityPickerCore allowWebSearch=false hides Web Search row even on capable model', async () => {
  const { LlmCapabilityPickerCore } = await loadPicker();
  const tree = renderNode(LlmCapabilityPickerCore({
    ...baseProps,
    value: { ...EMPTY_BUNDLE, model: 'gpt-5.4', thinking: true },
    onChange: () => {},
    allowWebSearch: false,
  }));
  const labels = rowLabels(tree);
  assert.equal(labels.includes('Web Search'), false);
  assert.equal(labels.includes('Thinking'), true);
});

test('LlmCapabilityPickerCore allowModelNone=false hides the inherit (none) option', async () => {
  const { LlmCapabilityPickerCore } = await loadPicker();
  const tree = renderNode(LlmCapabilityPickerCore({
    ...baseProps,
    value: { ...EMPTY_BUNDLE, model: 'gpt-5.4' },
    onChange: () => {},
    allowModelNone: false,
  }));
  const dropdowns = collectByType(tree, 'ModelSelectDropdown');
  assert.equal(dropdowns[0].props?.allowNone, false);
});
