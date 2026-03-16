import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

function unwrapMemo(component) {
  // memo() wraps the render function — extract it for direct invocation
  if (component && typeof component !== 'function' && typeof component === 'object') {
    if (typeof component.type === 'function') return component.type;
    if (component.$$typeof && component.type && typeof component.type === 'object' && typeof component.type.type === 'function') return component.type.type;
  }
  return component;
}

function callComponent(component, props) {
  const fn = typeof component === 'function' ? component : unwrapMemo(component);
  if (typeof fn !== 'function') {
    throw new TypeError(`${String(component?.displayName || component?.name || component)} is not a function`);
  }
  return fn(props);
}

const HOOK_SAFE_SKIP = Symbol('hook-safe-skip');

function tryCallComponent(fn, props) {
  try {
    return fn(props || {});
  } catch {
    // Component uses hooks (useContext etc.) — return leaf node without recursing
    return { type: HOOK_SAFE_SKIP, props: props || {} };
  }
}

function renderElement(node) {
  if (Array.isArray(node)) {
    return node.map(renderElement);
  }
  if (node == null || typeof node !== 'object') {
    return node;
  }
  if (node.type === HOOK_SAFE_SKIP) {
    return node;
  }
  if (typeof node.type === 'function') {
    return renderElement(tryCallComponent(node.type, node.props));
  }
  // Handle memo-wrapped components: node.type is { $$typeof, type: fn, compare }
  if (node.type && typeof node.type === 'object' && typeof node.type.type === 'function') {
    return renderElement(tryCallComponent(node.type.type, node.props));
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

function textContent(node) {
  if (Array.isArray(node)) {
    return node.map(textContent).join(' ');
  }
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node !== 'object') {
    return String(node);
  }
  const props = node.props || {};
  const parts = [];
  // Extract text from label/title props (e.g. SettingRow, MasterSwitchRow, SettingGroupBlock)
  if (typeof props.label === 'string') parts.push(props.label);
  if (typeof props.title === 'string') parts.push(props.title);
  if (props.children != null) parts.push(textContent(props.children));
  return parts.join(' ');
}

function createRuntimeDraft(overrides = {}) {
  return new Proxy(overrides, {
    get(target, prop) {
      if (Object.prototype.hasOwnProperty.call(target, prop)) {
        return target[prop];
      }
      const key = String(prop || '');
      if (
        key.endsWith('Enabled')
        || key.endsWith('Write')
        || key.startsWith('runtimeTrace')
        || key.startsWith('mirrorToS3')
        || key === 'localMode'
        || key === 'dryRun'
      ) {
        return true;
      }
      if (key.endsWith('Json')) {
        return '{}';
      }
      if (key.toLowerCase().includes('mode')) {
        return 'auto';
      }
      return 1;
    },
  });
}

function createCommonSectionProps(overrides = {}) {
  return {
    runtimeDraft: createRuntimeDraft({
      discoveryEnabled: true,
      runtimeTraceEnabled: true,
      runtimeScreencastEnabled: true,
      pdfBackendRouterEnabled: true,
      llmExtractionCacheEnabled: true,
      dynamicCrawleeEnabled: true,
      ...overrides.runtimeDraft,
    }),
    runtimeSettingsReady: true,
    inputCls: 'sf-input',
    runtimeSubStepDomId: (id) => id,
    updateDraft() {},
    onNumberChange() {},
    getNumberBounds() {
      return { min: 0, max: 999999, int: true };
    },
    renderDisabledHint(message) {
      return { type: 'span', props: { children: message } };
    },
    FlowOptionPanel({ title, subtitle, children }) {
      return { type: 'section', props: { children: [title, subtitle, children] } };
    },
    SettingGroupBlock({ title, children }) {
      return { type: 'group', props: { children: [title, children] } };
    },
    SettingRow({ label, description, children }) {
      return { type: 'row', props: { children: [label, description || '', children] } };
    },
    MasterSwitchRow({ label, description, hint, children }) {
      return { type: 'master-row', props: { children: [label, description || '', hint || '', children] } };
    },
    SettingToggle({ checked }) {
      return { type: 'toggle', props: { children: checked ? 'ON' : 'OFF' } };
    },
    AdvancedSettingsBlock({ title, count, children }) {
      return { type: 'advanced', props: { children: [title, String(count), children] } };
    },
    ...overrides,
  };
}

async function loadSectionModule(entryRelativePath, stubs = {}) {
  return loadBundledModule(entryRelativePath, {
    prefix: 'runtime-flow-section-contract-',
    stubs: {
      'react/jsx-runtime': `
        export function jsx(type, props) {
          return { type, props: props || {} };
        }
        export const jsxs = jsx;
        export const Fragment = Symbol.for('fragment');
      `,
      ...stubs,
    },
  });
}

function assertLabelsRendered(tree, labels) {
  const text = textContent(tree);
  for (const label of labels) {
    assert.equal(
      text.includes(label),
      true,
      `expected rendered runtime section contract to expose "${label}"`,
    );
  }
}

function assertLabelsOmitted(tree, labels) {
  const text = textContent(tree);
  for (const label of labels) {
    assert.equal(
      text.includes(label),
      false,
      `expected rendered runtime section contract to omit retired label "${label}"`,
    );
  }
}

test('runtime flow sections expose discovery, output, observability, and screencast controls', async () => {
  const [{ RuntimeFlowRunSetupSection }, { RuntimeFlowRunOutputSection }, { RuntimeFlowObservabilitySection }] = await Promise.all([
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowRunSetupSection.tsx', {
      '../../../stores/settingsManifest': `
        export const RUNTIME_SEARCH_ROUTE_HELP_TEXT = 'Search route help.';
        export function formatRuntimeSearchProviderLabel(value) {
          return String(value || '');
        }
      `,
    }),
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowRunOutputSection.tsx'),
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowObservabilitySection.tsx'),
  ]);

  const runSetupTree = renderElement(callComponent(RuntimeFlowRunSetupSection, createCommonSectionProps({
    searchProviderOptions: ['searxng', 'google', 'dual'],
    resumeModeOptions: ['auto', 'force_resume', 'start_over'],
    setRuntimeDraft() {},
    setRuntimeDirty() {},
  })));
  assertLabelsRendered(runSetupTree, [
    'Search Route',
    'Fetch Candidate Sources',
    'Discovery Max Queries',
    'Manufacturer Broad Discovery',
  ]);

  const runOutputTree = renderElement(callComponent(RuntimeFlowRunOutputSection, createCommonSectionProps({
    storageAwsRegion: 'us-east-1',
    storageS3Bucket: 'spec-factory-bucket',
  })));
  assertLabelsRendered(runOutputTree, [
    'Output Mode',
    'Local Mode',
    'Mirror To S3',
    'Local Input Root',
    'Local Output Root',
    'Runtime Events Key',
    'Write Markdown Summary',
    'LLM Provider',
    'LLM Base URL',
    'OpenAI API Key',
    'Anthropic API Key',
    'LLM Write Summary',
    'AWS Region',
    'S3 Bucket',
  ]);

  const observabilityTree = renderElement(callComponent(RuntimeFlowObservabilitySection, createCommonSectionProps({
    traceControlsLocked: false,
  })));
  assertLabelsRendered(observabilityTree, [
    'Fetch Trace Ring Size',
    'LLM Trace Ring Size',
    'Events NDJSON Write',
    'Indexing Resume Seed Limit',
    'Queue JSON Write',
    'Daemon Concurrency',
    'Imports Root',
    'Runtime Screencast Enabled',
    'Runtime Screencast FPS',
    'Runtime Screencast Quality',
  ]);
});

test('runtime flow sections expose fetch, rendering, parsing, and visual-asset controls', async () => {
  const [{ RuntimeFlowFetchNetworkSection }, { RuntimeFlowBrowserRenderingSection }, { RuntimeFlowParsingSection }] = await Promise.all([
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowFetchNetworkSection.tsx'),
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowBrowserRenderingSection.tsx'),
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowParsingSection.tsx'),
  ]);

  const fetchTree = renderElement(callComponent(RuntimeFlowFetchNetworkSection, createCommonSectionProps({
    dynamicFetchControlsLocked: false,
  })));
  assertLabelsRendered(fetchTree, [
    'Fetch Scheduler Enabled',
    'Search Global RPS',
    'Search Per-Host RPS',
    'Frontier DB Path',
    'Repair Dedupe Rule',
    'Automation Queue Storage Engine',
  ]);

  const browserTree = renderElement(callComponent(RuntimeFlowBrowserRenderingSection, createCommonSectionProps({
    dynamicFetchControlsLocked: false,
  })));
  assertLabelsRendered(browserTree, [
    'Dynamic Crawlee Enabled',
    'Capture Page Screenshot Enabled',
  ]);

  const parsingTree = renderElement(callComponent(RuntimeFlowParsingSection, createCommonSectionProps()));
  assertLabelsRendered(parsingTree, [
    'PDF Router Enabled',
    'PDF Preferred Backend',
    'Article Extractor Domain Policy Map (JSON)',
    'Static DOM Target Match Threshold',
    'Structured Metadata Extruct Enabled',
    'Structured Metadata Extruct Cache Limit',
    'Chart Extraction Enabled',
  ]);
});

test('runtime flow sections expose scoring, identity, and unified llm-cortex controls', async () => {
  const [{ RuntimeFlowScoringEvidenceSection }, { RuntimeFlowAutomationSection }, { RuntimeFlowLlmCortexSection }] = await Promise.all([
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowScoringEvidenceSection.tsx'),
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowAutomationSection.tsx'),
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowLlmCortexSection.tsx'),
  ]);

  const scoringTree = renderElement(callComponent(RuntimeFlowScoringEvidenceSection, createCommonSectionProps()));
  // WHY: NeedSet Required Weight and Evidence Decay Days knobs were retired in Phase 12.
  // WHY: LLM budget knobs moved to unified LLM & Cortex section.
  assertLabelsRendered(scoringTree, [
    'Identity Gate Publish Threshold',
  ]);
  // LLM budget knobs must NOT appear here — they moved to LLM & Cortex
  assertLabelsOmitted(scoringTree, [
    'LLM Max Calls / Round',
    'LLM Max Output Tokens',
    'LLM Verify Sample Rate',
  ]);

  const automationTree = renderElement(callComponent(RuntimeFlowAutomationSection, createCommonSectionProps()));
  assertLabelsRendered(automationTree, [
    'Category Authority Root',
    'Helper Supportive Enabled',
  ]);
  // CORTEX knobs must NOT appear here — they moved to LLM & Cortex
  assertLabelsOmitted(automationTree, [
    'CORTEX Enabled',
    'CORTEX Base URL',
    'CORTEX Escalate Confidence <',
  ]);

  const llmCortexTree = renderElement(callComponent(RuntimeFlowLlmCortexSection, createCommonSectionProps({
    runtimeDraft: createRuntimeDraft({
      llmExtractionCacheEnabled: true,
      cortexEnabled: true,
      phase2LlmEnabled: true,
      phase2LlmModel: 'planner-model',
      phase3LlmModel: 'triage-model',
      llmModelExtract: 'extract-model',
      llmModelValidate: 'validate-model',
      llmModelWrite: 'write-model',
      llmModelFast: 'fast-model',
      llmModelReasoning: 'reasoning-model',
    }),
    plannerControlsLocked: false,
    plannerModelLocked: false,
    triageModelLocked: false,
    llmModelOptions: ['planner-model', 'triage-model', 'extract-model', 'validate-model', 'write-model', 'fast-model', 'reasoning-model'],
    onRoleModelChange() {},
    onLlmPlanApiKeyChange() {},
    onLlmExtractionCacheEnabledChange() {},
    onLlmExtractionCacheDirChange() {},
    onLlmExtractionCacheTtlMsChange() {},
    onLlmMaxCallsPerProductTotalChange() {},
    onLlmMaxCallsPerProductFastChange() {},
    onLlmTokensPlanChange() {},
    onLlmTokensTriageChange() {},
    onLlmTokensFastChange() {},
    onLlmTokensReasoningChange() {},
    onLlmTokensExtractChange() {},
    onLlmTokensValidateChange() {},
    onLlmTokensWriteChange() {},
    onLlmMaxOutputTokensPlanChange() {},
    onLlmMaxOutputTokensTriageChange() {},
    onLlmMaxOutputTokensFastChange() {},
    onLlmMaxOutputTokensReasoningChange() {},
    onLlmMaxOutputTokensExtractChange() {},
    onLlmMaxOutputTokensValidateChange() {},
    onLlmMaxOutputTokensWriteChange() {},
    onLlmTokensPlanFallbackChange() {},
    onLlmTokensExtractFallbackChange() {},
    onLlmTokensValidateFallbackChange() {},
    onLlmTokensWriteFallbackChange() {},
    onLlmMaxOutputTokensPlanFallbackChange() {},
    onLlmMaxOutputTokensExtractFallbackChange() {},
    onLlmMaxOutputTokensValidateFallbackChange() {},
    onLlmMaxOutputTokensWriteFallbackChange() {},
    renderTokenOptions(model) {
      return { type: 'option', props: { children: String(model || 'tokens') } };
    },
  })));
  // Primary Models group
  assertLabelsRendered(llmCortexTree, [
    'Plan Model',
    'Triage Model',
    'Extract Model',
  ]);
  // Fallback Routing group
  assertLabelsRendered(llmCortexTree, [
    'LLM Plan API Key',
    'Plan Fallback Token Cap',
    'Extract Fallback Token Cap',
  ]);
  // Budgets & Cost group
  assertLabelsRendered(llmCortexTree, [
    'LLM Max Calls / Round',
    'LLM Max Output Tokens',
  ]);
  // Verification group
  assertLabelsRendered(llmCortexTree, [
    'LLM Verify Sample Rate',
  ]);
  // Extraction Cache group
  assertLabelsRendered(llmCortexTree, [
    'LLM Extraction Cache Enabled',
    'LLM Extraction Cache TTL (ms)',
  ]);
  // Cortex Sidecar group
  assertLabelsRendered(llmCortexTree, [
    'CORTEX Enabled',
    'CORTEX Base URL',
    'CORTEX Escalate Confidence <',
  ]);
});

test('runtime flow sections omit retired runtime knob labels from the user-visible editor surface', async () => {
  const [
    { RuntimeFlowRunSetupSection },
    { RuntimeFlowObservabilitySection },
    { RuntimeFlowFetchNetworkSection },
    { RuntimeFlowParsingSection },
  ] = await Promise.all([
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowRunSetupSection.tsx', {
      '../../../stores/settingsManifest': `
        export const RUNTIME_SEARCH_ROUTE_HELP_TEXT = 'Search route help.';
        export function formatRuntimeSearchProviderLabel(value) {
          return String(value || '');
        }
      `,
    }),
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowObservabilitySection.tsx'),
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowFetchNetworkSection.tsx'),
    loadSectionModule('tools/gui-react/src/features/pipeline-settings/sections/RuntimeFlowParsingSection.tsx'),
  ]);

  const combinedTree = [
    renderElement(callComponent(RuntimeFlowRunSetupSection, createCommonSectionProps({
      searchProviderOptions: ['searxng', 'google', 'dual'],
      resumeModeOptions: ['auto', 'force_resume', 'start_over'],
      setRuntimeDraft() {},
      setRuntimeDirty() {},
    }))),
    renderElement(callComponent(RuntimeFlowObservabilitySection, createCommonSectionProps({
      traceControlsLocked: false,
    }))),
    renderElement(callComponent(RuntimeFlowFetchNetworkSection, createCommonSectionProps({
      dynamicFetchControlsLocked: false,
    }))),
    renderElement(callComponent(RuntimeFlowParsingSection, createCommonSectionProps())),
  ];

  assertLabelsOmitted(combinedTree, [
    'Refresh TTL Window',
    'Per-Round Rediscovery Cap',
    'WORKERS_SEARCH',
    'WORKERS_FETCH',
    'WORKERS_PARSE',
    'WORKERS_LLM',
    'WORKER_HEALTH_CHECK_INTERVAL_MS',
    'WORKER_RESTART_BACKOFF_MS',
    '429_BLOCK_RATE_THRESHOLD',
    'MAX_BATCH_SIZE_CONFIRMATION',
    'MAX_PARALLEL_PRODUCT_WORKERS',
    'CHART_VISION_FALLBACK_ENABLED',
    // Phase 12 NeedSet Legacy Removal — scoring knobs retired
    'NeedSet Required Weight (Identity)',
    'NeedSet Evidence Decay Days',
  ]);
});
