import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const STUBS = {
  react: `
    export function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; }
    export function useCallback(fn) { return fn; }
    export function useMemo(factory) { return factory(); }
    export const memo = (component) => component;
  `,
  'react/jsx-runtime': `
    export function jsx(type, props) { return { type, props: props || {} }; }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `,
  '@tanstack/react-query': `
    export function useQuery(opts) {
      const key = Array.isArray(opts?.queryKey) ? opts.queryKey : [];
      if (key.includes('dependencies')) {
        return { data: globalThis.__pifVariantDependencyStatus, isLoading: false };
      }
      return { data: globalThis.__pifVariantResult, isLoading: false };
    }
  `,
  '../../api/client.ts': 'export const api = { get: async () => ({}) };',
  '../../shared/ui/finder/ColorSwatch.tsx': `
    export function ColorSwatch(props) { return { type: 'ColorSwatch', props }; }
  `,
  '../../shared/ui/finder/index.ts': `
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
      return { type: 'Popover', props: { ...props, children: [props.trigger, props.children] } };
    }
  `,
  '../../shared/ui/overlay/FinderRunPopoverShell.tsx': `
    export function FinderRunPopoverShell(props) {
      return { type: 'FinderRunPopoverShell', props: { ...props, children: [props.modelSlot, props.actions] } };
    }
  `,
  '../../features/operations/hooks/useFireAndForget.ts': `
    export function useFireAndForget(scope) {
      return (url, body, meta) => {
        globalThis.__pifVariantFireCalls.push({ scope, url, body, meta });
      };
    }
  `,
  '../../features/operations/hooks/useFinderOperations.ts': `
    export function useRunningVariantKeys() { return new Set(); }
    export function useRunningFieldKeys() { return globalThis.__pifVariantRunningFieldKeys ?? new Set(); }
  `,
  '../../features/indexing/api/promptPreviewQueries.ts': `
    export function usePromptPreviewQuery() { return {}; }
  `,
  '../../stores/finderDiscoveryHistoryStore.ts': `
    export function useFinderDiscoveryHistoryStore(selector) {
      return selector({ openDrawer: () => {} });
    }
  `,
  '../../shared/ui/finder/discoveryHistoryHelpers.ts': `
    export function groupHistory() { return { byVariantMode: new Map() }; }
  `,
  '../../features/product-image-finder/selectors/pifSelectors.ts': `
    export function buildGalleryImages() { return []; }
    export function resolveSlots() { return []; }
    export function sortByPriorityAndSize(value) { return value; }
  `,
  '../../features/product-image-finder/helpers/pifImageUrls.ts': `
    export function imageServeUrl() { return '/image'; }
  `,
  '../../features/product-image-finder/components/CarouselPreviewPopup.tsx': `
    export function CarouselPreviewPopup(props) { return { type: 'CarouselPreviewPopup', props }; }
  `,
  '../../features/product-image-finder/state/pifPromptPreviewState.ts': `
    export function createPifLoopViewPreviewState(variantKey) { return { variantKey, mode: 'view', label: 'Loop View iteration' }; }
    export function createPifPromptPreviewBody(value) { return value; }
  `,
  './PifVariantRings.tsx': `
    export function PifVariantRings(props) { return { type: 'PifVariantRings', props }; }
  `,
  './IndexLabLink.tsx': `
    export function IndexLabLink(props) { return { type: 'IndexLabLink', props: { ...props, children: props.children } }; }
  `,
};

async function loadModule() {
  return loadBundledModule(
    'tools/gui-react/src/pages/overview/PifVariantPopover.tsx',
    { prefix: 'pif-variant-popover-dependencies-', stubs: STUBS },
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

function collectButtons(node, results = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectButtons(child, results);
    return results;
  }
  if (node == null || typeof node !== 'object') return results;
  if (node.type === 'button') results.push(node);
  collectButtons(node.props?.children, results);
  return results;
}

function buttonText(button) {
  const children = button.props?.children;
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.filter((v) => typeof v === 'string').join('');
  return '';
}

function findButton(buttons, label) {
  const button = buttons.find((candidate) => buttonText(candidate) === label);
  assert.ok(button, `expected button ${label}`);
  return button;
}

function renderPopover(Component) {
  return renderNode(Component({
    productId: 'p1',
    category: 'mouse',
    variant: {
      variant_id: 'v1',
      variant_key: 'edition:blue',
      variant_label: 'Blue',
      color_atoms: ['blue'],
      priority_filled: 0,
      priority_total: 4,
      loop_filled: 0,
      loop_total: 3,
      hero_filled: 0,
      hero_target: 1,
      image_count: 1,
    },
    pifDependencyReady: false,
    pifDependencyMissingKeys: ['connection'],
    hexMap: new Map([['blue', '#0000ff']]),
    brand: 'G-Wolves',
    baseModel: 'Hati HT-S',
  }));
}

test('PIF Overview variant dropdown locks image actions and runs missing deps solo', async () => {
  globalThis.__pifVariantFireCalls = [];
  globalThis.__pifVariantRunningFieldKeys = new Set();
  globalThis.__pifVariantDependencyStatus = {
    ready: false,
    required_keys: ['connection'],
    resolved_keys: [],
    missing_keys: ['connection'],
    items: [],
    facts: [],
  };
  globalThis.__pifVariantResult = {
    dependencyStatus: globalThis.__pifVariantDependencyStatus,
    images: [{ variant_key: 'edition:blue', view: 'top' }],
    runs: [],
    carousel_slots: {},
    carouselSettings: { viewBudget: ['top'], heroEnabled: true },
  };

  const { PifVariantPopover } = await loadModule();
  const tree = renderPopover(PifVariantPopover);
  const buttons = collectButtons(tree);

  assert.equal(findButton(buttons, 'Run Dep').props.disabled, false);
  assert.equal(findButton(buttons, 'Priority').props.disabled, true);
  assert.equal(findButton(buttons, 'Top').props.disabled, true);
  assert.equal(findButton(buttons, 'Hero').props.disabled, true);
  assert.equal(findButton(buttons, 'Loop').props.disabled, true);
  assert.equal(findButton(buttons, 'Evaluate').props.disabled, true);
  assert.ok(buttons.filter((button) => buttonText(button) === 'Prompt').every((button) => button.props.disabled === false));

  findButton(buttons, 'Run Dep').props.onClick();

  assert.deepEqual(globalThis.__pifVariantFireCalls, [
    {
      scope: { type: 'kf', category: 'mouse', productId: 'p1' },
      url: '/key-finder/mouse/p1',
      body: {
        field_key: 'connection',
        mode: 'run',
        force_solo: true,
        reason: 'pif_dependency',
      },
      meta: { fieldKey: 'connection' },
    },
  ]);
});
