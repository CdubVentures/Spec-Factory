import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const SUMMARY_ROWS = [
  {
    field_key: 'release_year',
    group: 'product',
    label: 'Release year',
    difficulty: 'easy',
    required_level: 'mandatory',
    published: false,
    last_status: null,
    concrete_evidence: false,
  },
  {
    field_key: 'sensor_model',
    group: 'sensor',
    label: 'Sensor model',
    difficulty: 'hard',
    required_level: 'mandatory',
    published: false,
    last_status: null,
    concrete_evidence: false,
  },
];

const STUBS = {
  react: `
    export function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; }
    export function useCallback(fn) { return fn; }
    export function useMemo(factory) { return factory(); }
  `,
  'react/jsx-runtime': `
    export function jsx(type, props) { return { type, props: props || {} }; }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `,
  '@tanstack/react-query': `
    export function useQuery() { return { data: globalThis.__keyTierPopoverSummaryRows, isLoading: false }; }
  `,
  '../../api/client.ts': 'export const api = { get: async () => [] };',
  '../../shared/ui/finder/index.ts': `
    export function DiscoveryHistoryButton(props) { return { type: 'DiscoveryHistoryButton', props }; }
    export function FinderRunModelBadge(props) { return { type: 'FinderRunModelBadge', props }; }
    export function PromptPreviewModal(props) { return { type: 'PromptPreviewModal', props }; }
    export function useResolvedFinderModel() {
      return {
        model: { thinking: false, webSearch: false },
        accessMode: 'api',
        modelDisplay: 'phase-model',
        effortLevel: '',
      };
    }
  `,
  '../../shared/ui/overlay/Popover.tsx': `
    export function Popover(props) {
      return { type: 'Popover', props: { ...props, children: props.children } };
    }
  `,
  '../../shared/ui/overlay/FinderRunPopoverShell.tsx': `
    export function FinderRunPopoverShell(props) {
      return { type: 'FinderRunPopoverShell', props: { ...props, children: [props.modelSlot, props.children] } };
    }
  `,
  '../../features/operations/hooks/useFireAndForget.ts': `
    export function useFireAndForget() { return () => {}; }
  `,
  '../../features/operations/hooks/useFinderOperations.ts': `
    export function useRunningFieldKeys() { return new Set(); }
  `,
  '../../features/indexing/api/promptPreviewQueries.ts': `
    export function usePromptPreviewQuery() { return {}; }
  `,
  '../../features/key-finder/hooks/useKeyDifficultyModelMap.ts': `
    export function useKeyDifficultyModelMap() {
      return {
        easy: { model: 'easy-model', accessMode: 'api', thinking: false, webSearch: false, effortLevel: '' },
        medium: { model: 'medium-model', accessMode: 'lab', thinking: true, webSearch: false, effortLevel: 'high' },
        hard: { model: 'hard-model', accessMode: 'lab', thinking: true, webSearch: true, effortLevel: 'xhigh' },
        very_hard: { model: 'very-hard-model', accessMode: 'api', thinking: false, webSearch: true, effortLevel: '' },
      };
    }
  `,
  '../../shared/ui/feedback/Chip.tsx': `
    export function Chip(props) { return { type: 'Chip', props }; }
  `,
  '../../registries/fieldRuleTaxonomy.ts': `
    export function tagCls(kind, value) { return 'sf-chip-' + kind + '-' + value; }
  `,
};

async function loadModule() {
  return loadBundledModule(
    'tools/gui-react/src/pages/overview/KeyTierPopover.tsx',
    { prefix: 'key-tier-popover-model-slot-', stubs: STUBS },
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

function renderPopover(Component, tier, rows = SUMMARY_ROWS) {
  globalThis.__keyTierPopoverSummaryRows = rows;
  return renderNode(Component({
    productId: 'p1',
    category: 'mouse',
    tier,
    resolved: 0,
    total: 2,
    trigger: 'trigger',
  }));
}

test('KeyTierPopover model slot uses the selected difficulty tier model', async () => {
  const { KeyTierPopover } = await loadModule();
  const tree = renderPopover(KeyTierPopover, 'easy');
  const badges = collectByType(tree, 'FinderRunModelBadge');

  assert.equal(badges.length, 1);
  assert.equal(badges[0].props.model, 'easy-model');
  assert.notEqual(badges[0].props.model, 'phase-model');
});

test('KeyTierPopover mandatory model slot shows every difficulty model with row difficulty labels', async () => {
  const { KeyTierPopover } = await loadModule();
  const tree = renderPopover(KeyTierPopover, 'mandatory');
  const badges = collectByType(tree, 'FinderRunModelBadge');
  const chips = collectByType(tree, 'Chip');

  assert.deepEqual(
    badges.map((badge) => badge.props.model),
    ['easy-model', 'medium-model', 'hard-model', 'very-hard-model'],
  );
  assert.deepEqual(
    badges.map((badge) => badge.props.labelPrefix),
    ['KF-EASY', 'KF-MED', 'KF-HARD', 'KF-VHARD'],
  );
  assert.deepEqual(
    chips.map((chip) => chip.props.label),
    ['easy', 'hard'],
  );
});

test('KeyTierPopover disables blocked component resolver Run and Loop buttons', async () => {
  const { KeyTierPopover } = await loadModule();
  const tree = renderPopover(KeyTierPopover, 'mandatory', [
    {
      field_key: 'sensor_brand',
      group: 'sensor',
      label: 'Sensor Brand',
      difficulty: 'medium',
      required_level: 'mandatory',
      published: false,
      last_status: null,
      concrete_evidence: false,
      dedicated_run: true,
      component_run_kind: 'component_brand',
      component_parent_key: 'sensor',
      component_dependency_satisfied: false,
      run_blocked_reason: 'component_parent_unpublished',
    },
  ]);
  const buttons = collectByType(tree, 'button');
  const run = buttons.find((button) => button.props.children === 'Run');
  const loop = buttons.find((button) => button.props.children === 'Loop');

  assert.equal(run.props.disabled, true);
  assert.equal(loop.props.disabled, true);
  assert.ok(String(run.props.className).includes('sf-warning-button-solid'));
  assert.ok(String(loop.props.className).includes('sf-warning-button-solid'));
});
