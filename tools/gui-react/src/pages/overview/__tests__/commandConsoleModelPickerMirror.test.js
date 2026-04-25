import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const STUBS = {
  react: `
    export function useMemo(factory) { return factory(); }
    export function useCallback(fn) { return fn; }
    export function memo(component) { return component; }
  `,
  'react/jsx-runtime': `
    export function jsx(type, props) { return { type, props: props || {} }; }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `,
  '../../shared/ui/overlay/Popover.tsx': `
    export function Popover(props) { return props.children; }
  `,
  '../../shared/ui/overlay/FinderRunPopoverShell.tsx': `
    export function FinderRunPopoverShell(props) { return props.children; }
  `,
  '../../shared/ui/finder/LlmCapabilityPickerCore.tsx': `
    export function LlmCapabilityPickerCore(props) {
      return { type: 'LlmCapabilityPickerCore', props };
    }
  `,
  '../../features/llm-config/state/useLlmPolicyAuthority.ts': `
    export function useLlmPolicyAuthority() {
      return globalThis.__overviewMirrorPolicyAuthority;
    }
  `,
  '../../features/llm-config/state/llmPolicyDefaults.ts': `
    export const DEFAULT_LLM_POLICY = {};
  `,
};

async function loadModule() {
  return loadBundledModule(
    'tools/gui-react/src/pages/overview/CommandConsoleModelPickerPopover.tsx',
    { prefix: 'command-console-model-picker-mirror-', stubs: STUBS },
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

const defaultOpenaiProvider = {
  id: 'default-openai',
  name: 'OpenAI',
  type: 'openai-compatible',
  accessMode: 'api',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  models: [{ id: 'openai-gpt', modelId: 'gpt-5.4', role: 'primary' }],
};

const defaultGeminiProvider = {
  id: 'default-gemini',
  name: 'Gemini',
  type: 'openai-compatible',
  accessMode: 'api',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  apiKey: '',
  models: [{ id: 'gemini-flash', modelId: 'gemini-2.5-flash', role: 'primary' }],
};

const labOpenaiProvider = {
  id: 'lab-openai',
  name: 'LLM Lab OpenAI',
  type: 'openai-compatible',
  accessMode: 'lab',
  baseUrl: 'http://localhost:5001/v1',
  apiKey: 'session',
  models: [{ id: 'lab-gpt', modelId: 'gpt-5.4', role: 'primary' }],
};

test('Overview KF model picker mirrors LLM Config provider availability gate', async () => {
  const { CommandConsoleModelPickerPopover } = await loadModule();
  globalThis.__overviewMirrorPolicyAuthority = {
    policy: {
      apiKeys: {
        gemini: 'AIza-gemini-key',
        deepseek: '',
        anthropic: '',
        openai: '',
      },
      models: {
        plan: 'lab-openai:gpt-5.4',
        reasoning: 'lab-openai:gpt-5.4',
      },
      providerRegistry: [
        defaultOpenaiProvider,
        defaultGeminiProvider,
        labOpenaiProvider,
      ],
      keyFinderTiers: {
        easy: {
          model: 'lab-openai:gpt-5.4',
          useReasoning: false,
          reasoningModel: '',
          thinking: true,
          thinkingEffort: 'xhigh',
          webSearch: true,
        },
        fallback: {
          model: 'lab-openai:gpt-5.4',
          useReasoning: false,
          reasoningModel: '',
          thinking: true,
          thinkingEffort: 'xhigh',
          webSearch: true,
        },
      },
    },
    updatePolicy() {},
  };

  const tree = renderNode(CommandConsoleModelPickerPopover({
    binding: 'kfTier',
    tier: 'easy',
    title: 'Easy Tier',
    trigger: 'trigger',
  }));

  const picker = collectByType(tree, 'LlmCapabilityPickerCore')[0];
  assert.equal(typeof picker.props.apiKeyFilter, 'function');
  assert.equal(picker.props.apiKeyFilter(defaultOpenaiProvider), false);
  assert.equal(picker.props.apiKeyFilter(defaultGeminiProvider), true);
  assert.equal(picker.props.apiKeyFilter(labOpenaiProvider), true);
});
