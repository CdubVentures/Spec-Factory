import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../helpers/loadBundledModule.js';

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
  return textContent(node.props?.children);
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

function createJsxRuntimeStub() {
  return `
    export function jsx(type, props) {
      return { type, props: props || {} };
    }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `;
}

function createReactStub() {
  return `
    export function useMemo(factory) {
      return factory();
    }
    export function useState(initialValue) {
      const value = typeof initialValue === 'function' ? initialValue() : initialValue;
      return [value, () => {}];
    }
    export function useCallback(fn) {
      return fn;
    }
    const React = { useMemo, useState, useCallback };
    export default React;
  `;
}

function createCommonUiStubs() {
  return {
    'react/jsx-runtime': createJsxRuntimeStub(),
    react: createReactStub(),
    '../../components/PrefetchTooltip': `
      export function formatTooltip(parts) {
        return JSON.stringify(parts || {});
      }
      export function UiTooltip(props) {
        return { type: 'tooltip', props: { ...props, children: props.children } };
      }
      export function TooltipBadge(props) {
        return { type: 'badge', props: { ...props, children: props.children } };
      }
    `,
    '../../components/RuntimeIdxBadgeStrip': `
      export function RuntimeIdxBadgeStrip() {
        return null;
      }
    `,
    '../../../../shared/ui/feedback/Tip': `
      export function Tip() {
        return null;
      }
    `,
    '../../components/StatCard': `
      export function StatCard(props) {
        return { type: 'stat', props: { ...props, children: [props.label, String(props.value)] } };
      }
    `,
  };
}

async function loadSearchPlannerModule() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/panels/prefetch/PrefetchSearchPlannerPanel.tsx', {
    prefix: 'runtime-ops-search-planner-contract-',
    stubs: {
      ...createCommonUiStubs(),
      '../../helpers': `
        export function llmCallStatusBadgeClass() {
          return 'sf-chip-neutral';
        }
        export function formatMs(value) {
          return String(value ?? 0);
        }
      `,
      '../../components/VerticalStepper': `
        export function VerticalStepper(props) {
          return { type: 'stepper', props: { children: props.children } };
        }
        export function Step(props) {
          return { type: 'step', props: { ...props, children: props.children } };
        }
      `,
      '../../../../stores/tabStore': `
        export function usePersistedTab(_key, defaultValue) {
          return [defaultValue, () => {}];
        }
        export function usePersistedNullableTab(_key, initialValue) {
          return [initialValue ?? null, () => {}];
        }
        export function usePersistedExpandMap(_key, defaultValue) {
          return [defaultValue || {}, () => {}, () => {}];
        }
        export function usePersistedNumber(_key, defaultValue) {
          return [defaultValue, () => {}];
        }
      `,
      '../../../../stores/collapseStore': `
        export function usePersistedToggle(_key, initialValue) {
          return [initialValue, () => {}, () => {}];
        }
      `,
    },
  });
}

async function loadSerpTriageModule() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/panels/prefetch/PrefetchSerpTriagePanel.tsx', {
    prefix: 'runtime-ops-serp-triage-contract-',
    stubs: {
      ...createCommonUiStubs(),
      '../../helpers': `
        export function llmCallStatusBadgeClass() {
          return 'sf-chip-neutral';
        }
        export function formatMs(value) {
          return String(value ?? 0);
        }
        export function triageDecisionBadgeClass() {
          return 'sf-chip-neutral';
        }
        export function scoreBarSegments() {
          return [];
        }
      `,
      '../../../../stores/collapseStore': `
        export function usePersistedToggle(_key, initialValue) {
          return [initialValue, () => {}, () => {}];
        }
      `,
      '../../../../stores/tabStore': `
        export function usePersistedNullableTab(_key, initialValue) {
          return [initialValue ?? null, () => {}];
        }
        export function usePersistedExpandMap(_key, defaultValue) {
          return [defaultValue || {}, () => {}, () => {}];
        }
      `,
      '../../components/KanbanLane': `
        export function KanbanLane(props) {
          return { type: 'lane', props: { ...props, children: props.children } };
        }
        export function KanbanCard(props) {
          return { type: 'card', props: { ...props, children: props.children } };
        }
      `,
      '../../components/StackedScoreBar': `
        export function StackedScoreBar(props) {
          return { type: 'score-bar', props };
        }
      `,
      '../../../../shared/ui/overlay/DrawerShell': `
        export function DrawerShell(props) {
          return { type: 'drawer-shell', props: { ...props, children: props.children } };
        }
        export function DrawerSection(props) {
          return { type: 'drawer-section', props: { ...props, children: props.children } };
        }
      `,
      '../../components/StageCard': `
        export function StageCard(props) {
          return { type: 'stage-card', props: { ...props, children: [props.label, String(props.value)] } };
        }
      `,
      '../../components/ProgressRing': `
        export function ProgressRing(props) {
          return { type: 'progress-ring', props };
        }
      `,
      '../../selectors/serpTriageHelpers.js': `
        export function computeTriageDecisionCounts() {
          return { keep: 0, maybe: 0, drop: 0 };
        }
        export function computeTriageTopDomains() {
          return [];
        }
        export function computeTriageUniqueDomains() {
          return 0;
        }
        export function buildTriageDecisionSegments() {
          return [];
        }
        export function buildTriageFunnelBullets() {
          return [];
        }
        export function buildTriageDomainDecisionBreakdown() {
          return [];
        }
      `,
    },
  });
}

async function loadSearchProfileModule() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/panels/prefetch/PrefetchSearchProfilePanel.tsx', {
    prefix: 'runtime-ops-search-profile-contract-',
    stubs: {
      ...createCommonUiStubs(),
      '../../../../stores/tabStore': `
        export function usePersistedNullableTab(_key, initialValue) {
          return [initialValue ?? null, () => {}];
        }
      `,
      '../../../../shared/ui/overlay/DrawerShell': `
        export function DrawerShell(props) {
          return { type: 'drawer-shell', props: { ...props, children: props.children } };
        }
        export function DrawerSection(props) {
          return { type: 'drawer-section', props: { ...props, children: props.children } };
        }
      `,
      '../../selectors/searchProfileHelpers.js': `
        export function deriveLlmPlannerStatus(data) {
          return Boolean(data?.artifactPlannerActive);
        }
      `,
      '../../selectors/prefetchSearchProfileDisplayHelpers.js': `
        export function shouldShowSearchProfileGateBadges() {
          return false;
        }
        export function normalizeIdentityAliasEntries() {
          return [];
        }
      `,
      '../../selectors/prefetchSearchProfileGateHelpers.js': `
        export function sourceHostFromRow() {
          return '';
        }
        export function getQueryGateFlags() {
          return { queryTerms: false, domainHints: false, contentTypes: false };
        }
        export function querySourceLabel() {
          return 'deterministic';
        }
        export function querySourceChipClass() {
          return 'sf-chip-neutral';
        }
        export function buildGateSummary() {
          return { fieldRulesOn: false, fieldRuleKeyCounts: [] };
        }
        export function normalizeFieldRuleGateCounts() {
          return [];
        }
        export function resolveFieldRuleHintCountForRowGate() {
          return { status: 'off', effective: 0, total: 0 };
        }
      `,
      '../../selectors/searchProfileTierHelpers.js': `
        export function classifyQueryTier() { return 'legacy'; }
        export function tierLabel() { return 'Legacy'; }
        export function tierChipClass() { return 'sf-chip-neutral'; }
        export function groupByTier(rows) {
          return { seed: [], group: [], key: [], host_plan: rows || [], legacy: rows || [] };
        }
        export function buildTierBudgetSummary(rows, cap) {
          const n = (rows||[]).length;
          return { seed: { count: 0, pct: 0 }, group: { count: 0, pct: 0 }, key: { count: 0, pct: 0 }, host_plan: { count: n, pct: 100 }, legacy: { count: n, pct: 100 }, total: n, cap };
        }
        export function enrichmentStrategyLabel() { return ''; }
      `,
      '../../selectors/searchResultsHelpers.js': `
        export function providerDisplayLabel(value) {
          return String(value || '');
        }
      `,
    },
  });
}

function createSearchProfileData(overrides = {}) {
  return {
    query_rows: [],
    query_count: 0,
    variant_guard_terms: [],
    hint_source_counts: {},
    field_rule_gate_counts: {},
    field_rule_hint_counts_by_field: {},
    identity_aliases: [],
    query_guard: null,
    provider: '',
    artifactPlannerActive: false,
    ...overrides,
  };
}

test('prefetch planner and triage panels hide live-setting badges until booleans are defined', async () => {
  const [{ PrefetchSearchPlannerPanel }, { PrefetchSerpTriagePanel }] = await Promise.all([
    loadSearchPlannerModule(),
    loadSerpTriageModule(),
  ]);

  const plannerWithoutLiveSettings = renderElement(PrefetchSearchPlannerPanel({
    calls: [],
    searchPlans: [],
    searchResults: [],
    liveSettings: undefined,
    idxRuntime: [],
  }));
  const triageWithoutLiveSettings = renderElement(PrefetchSerpTriagePanel({
    calls: [],
    serpTriage: [],
    persistScope: 'runtime-ops-live-settings-contract',
    liveSettings: undefined,
    idxRuntime: [],
  }));

  assert.equal(
    textContent(plannerWithoutLiveSettings).includes('LLM Planner:'),
    false,
    'planner empty state should not render an ON/OFF badge before live planner settings hydrate',
  );
  assert.equal(
    textContent(triageWithoutLiveSettings).includes('Runtime Mode:'),
    false,
    'triage empty state should not render a runtime-mode badge before live triage settings hydrate',
  );

  // phase2LlmEnabled retired — planner is always enabled, badge removed
  const plannerWithLiveSettings = renderElement(PrefetchSearchPlannerPanel({
    calls: [],
    searchPlans: [],
    searchResults: [],
    liveSettings: {},
    idxRuntime: [],
  }));
  const triageWithExplicitFalse = renderElement(PrefetchSerpTriagePanel({
    calls: [],
    serpTriage: [],
    persistScope: 'runtime-ops-live-settings-contract',
    liveSettings: { phase3LlmTriageEnabled: false },
    idxRuntime: [],
  }));

  const plannerText = textContent(plannerWithLiveSettings);
  const triageDeterministicText = textContent(triageWithExplicitFalse);

  assert.equal(
    plannerText.includes('LLM Planner:'),
    false,
    'planner empty state should no longer show an LLM Planner badge (knob retired)',
  );
  assert.equal(
    triageDeterministicText.includes('LLM'),
    true,
    'triage should show LLM badge (deterministic/llm toggle retired)',
  );
});

