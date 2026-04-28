import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

// React useState stub backed by a per-bundle Map keyed by call order so
// re-rendering after a handler invocation reads back the latest state. This
// lets one test invoke onChange / onClick handlers and assert the next render.
function createReactStub() {
  let stateSlots = [];
  let cursor = 0;
  let lastSetters = [];
  function reset() { cursor = 0; lastSetters = []; }
  return {
    reset,
    snapshot: () => stateSlots.slice(),
    setters: () => lastSetters.slice(),
    source: `
      const slots = globalThis.__keysDropdownStateSlots ||= [];
      let idx = 0;
      globalThis.__keysDropdownResetCursor = () => { idx = 0; globalThis.__keysDropdownLastSetters = []; };
      export function useState(initial) {
        const i = idx++;
        if (slots.length <= i) slots.push(typeof initial === 'function' ? initial() : initial);
        const setter = (next) => {
          const value = typeof next === 'function' ? next(slots[i]) : next;
          slots[i] = value;
        };
        (globalThis.__keysDropdownLastSetters ||= []).push({ index: i, setter });
        return [slots[i], setter];
      }
      export function useCallback(fn) { return fn; }
      export function useMemo(factory) { return factory(); }
    `,
  };
}

const reactStub = createReactStub();

const STUBS = {
  react: reactStub.source,
  'react/jsx-runtime': `
    export function jsx(type, props) { return { type, props: props || {} }; }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `,
  '../../shared/ui/overlay/Popover.tsx': `
    export function Popover(props) { return { type: 'Popover', props }; }
  `,
  '../../shared/ui/feedback/Chip.tsx': `
    export function Chip(props) { return { type: 'Chip', props }; }
  `,
  '../../registries/fieldRuleTaxonomy.ts': `
    export function tagCls(kind, value) { return 'sf-chip-' + kind + '-' + value; }
  `,
  '../../features/key-finder/api/keyFinderQueries.ts': `
    export function useReservedKeysQuery() { return globalThis.__keysDropdownReservedQuery; }
    export function useKeyFinderSummaryQuery() { return globalThis.__keysDropdownSummaryQuery; }
    export function useKeyFinderBundlingConfigQuery() { return globalThis.__keysDropdownBundlingQuery; }
  `,
  '../../features/pipeline-settings/state/moduleSettingsAuthority.ts': `
    export function useModuleSettingsAuthority() { return globalThis.__keysDropdownSettingsAuthority; }
  `,
  '../../features/key-finder/state/keyFinderGroupedRows.ts': `
    export function parseAxisOrder() { return ['difficulty', 'required_level', 'availability']; }
    export function sortKeysByPriority(rows) { return [...rows].sort((a, b) => a.field_key.localeCompare(b.field_key)); }
  `,
};

async function loadModule() {
  return loadBundledModule(
    'tools/gui-react/src/pages/overview/CommandConsoleKeysDropdown.tsx',
    { prefix: 'command-console-keys-dropdown-', stubs: STUBS },
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

function findText(node, needle) {
  if (Array.isArray(node)) return node.some((c) => findText(c, needle));
  if (typeof node === 'string') return node.includes(needle);
  if (node == null || typeof node !== 'object') return false;
  return findText(node.props?.children, needle);
}

const sampleProducts = [
  { productId: 'p1', brand: 'B', model: 'p1', base_model: 'p1' },
  { productId: 'p2', brand: 'B', model: 'p2', base_model: 'p2' },
];

function setupDefaultGlobals() {
  globalThis.__keysDropdownStateSlots = [];
  globalThis.__keysDropdownReservedQuery = {
    data: { reserved: ['cef_color', 'pif_view'] },
    isLoading: false,
  };
  globalThis.__keysDropdownSummaryQuery = {
    data: [
      { field_key: 'release_year', difficulty: 'easy', availability: 'always', required_level: 'mandatory', variant_dependent: false, published: false, last_status: null },
      { field_key: 'weight_g', difficulty: 'medium', availability: 'sometimes', required_level: 'mandatory', variant_dependent: false, published: false, last_status: null },
      { field_key: 'sensor_brand', difficulty: 'medium', availability: 'always', required_level: 'mandatory', variant_dependent: false, published: false, last_status: null, dedicated_run: true, component_run_kind: 'component_brand', component_parent_key: 'sensor', component_dependency_satisfied: false, run_blocked_reason: 'component_parent_unpublished' },
      { field_key: 'cef_color', difficulty: 'easy', availability: 'always', required_level: 'mandatory', variant_dependent: false, published: false, last_status: null },
      { field_key: 'serial_number', difficulty: 'hard', availability: 'rare', required_level: 'non_mandatory', variant_dependent: true, published: false, last_status: null },
      { field_key: 'review_score', difficulty: 'easy', availability: 'always', required_level: 'mandatory', variant_dependent: false, published: true, last_status: 'resolved' },
    ],
    isLoading: false,
  };
  globalThis.__keysDropdownBundlingQuery = {
    data: { sortAxisOrder: 'difficulty,required_level,availability' },
    isLoading: false,
  };
  globalThis.__keysDropdownSettingsAuthority = {
    settings: { alwaysSoloRun: 'true' },
    isLoading: false,
    isSaving: false,
    saveSetting: () => {},
    saveSettings: () => {},
  };
}

function renderDropdown(Component, propsOverride = {}) {
  globalThis.__keysDropdownResetCursor?.();
  const props = {
    category: 'mouse',
    selectedProducts: sampleProducts,
    disabled: false,
    onRunPicked: () => {},
    ...propsOverride,
  };
  return renderNode(Component(props));
}

test('Keys dropdown filters reserved + variant_dependent keys', async () => {
  setupDefaultGlobals();
  const { CommandConsoleKeysDropdown } = await loadModule();
  const tree = renderDropdown(CommandConsoleKeysDropdown);

  // Reserved key 'cef_color' must not appear; variant_dependent 'serial_number' must not appear.
  assert.equal(findText(tree, 'cef_color'), false, 'reserved key must be filtered');
  assert.equal(findText(tree, 'serial_number'), false, 'variant_dependent key must be filtered');
  // Eligible keys must appear.
  assert.ok(findText(tree, 'release_year'), 'eligible key release_year must appear');
  assert.ok(findText(tree, 'weight_g'), 'eligible key weight_g must appear');
  assert.ok(findText(tree, 'sensor_brand'), 'blocked component resolver key still appears');
  assert.ok(findText(tree, 'review_score'), 'resolved-but-eligible key must still appear');
});

test('Keys dropdown shows loading placeholder while reserved query is pending', async () => {
  setupDefaultGlobals();
  globalThis.__keysDropdownReservedQuery = { data: undefined, isLoading: true };
  const { CommandConsoleKeysDropdown } = await loadModule();
  const tree = renderDropdown(CommandConsoleKeysDropdown);
  assert.ok(findText(tree, 'Loading keys'), 'must show loading placeholder');
  assert.equal(findText(tree, 'release_year'), false, 'must not render keys while loading');
});

test('Always solo Run toggle reads from settings authority and writes back', async () => {
  setupDefaultGlobals();
  let saved = null;
  globalThis.__keysDropdownSettingsAuthority = {
    settings: { alwaysSoloRun: 'false' }, // start OFF
    isLoading: false,
    isSaving: false,
    saveSetting: (key, value) => { saved = { key, value }; },
    saveSettings: () => {},
  };
  const { CommandConsoleKeysDropdown } = await loadModule();
  const tree = renderDropdown(CommandConsoleKeysDropdown);

  // Find the toggle input — it's an <input type="checkbox"> with aria-label "Always solo Run".
  const inputs = collectByType(tree, 'input');
  const toggle = inputs.find((n) => n.props?.['aria-label'] === 'Always solo Run');
  assert.ok(toggle, 'toggle input must render');
  assert.equal(toggle.props.checked, false, 'OFF setting must yield unchecked');

  // Click flips the value via saveSetting('alwaysSoloRun', 'true').
  toggle.props.onChange();
  assert.deepEqual(saved, { key: 'alwaysSoloRun', value: 'true' });
});

test('Run picked button is disabled when nothing picked', async () => {
  setupDefaultGlobals();
  const { CommandConsoleKeysDropdown } = await loadModule();
  const tree = renderDropdown(CommandConsoleKeysDropdown);
  const buttons = collectByType(tree, 'button');
  const runBtn = buttons.find((b) => findText(b, 'Run picked'));
  assert.ok(runBtn, 'Run picked button must render');
  assert.equal(runBtn.props.disabled, true, 'must be disabled with empty pick set');
});

test('Body shows "Select products first" when nothing is selected', async () => {
  setupDefaultGlobals();
  const { CommandConsoleKeysDropdown } = await loadModule();
  const tree = renderDropdown(CommandConsoleKeysDropdown, { selectedProducts: [] });
  // Body short-circuits with a "select products first" message — the per-product
  // summary/bundling queries are gated on a non-empty productId so without a
  // selection there's nothing to render (would otherwise hang on "Loading keys…").
  assert.ok(findText(tree, 'Select products first'), 'must show select-products message');
  // No Run button rendered in this state — that gate is owned at trigger level.
  const buttons = collectByType(tree, 'button');
  const runBtn = buttons.find((b) => findText(b, 'Run picked'));
  assert.equal(runBtn, undefined, 'Run picked button must not render with no selection');
});

test('Run picked invokes onRunPicked callback with the picked set', async () => {
  setupDefaultGlobals();
  let received = null;
  const onRunPicked = (set) => { received = Array.from(set).sort(); };

  const { CommandConsoleKeysDropdown } = await loadModule();
  // First render captures the row checkboxes' onChange handlers.
  let tree = renderDropdown(CommandConsoleKeysDropdown, { onRunPicked });
  const inputs = collectByType(tree, 'input');
  const releaseYearCheckbox = inputs.find((n) => n.props?.['aria-label'] === 'Pick release_year');
  const weightCheckbox = inputs.find((n) => n.props?.['aria-label'] === 'Pick weight_g');
  assert.ok(releaseYearCheckbox && weightCheckbox, 'row checkboxes must render');

  // Toggle two keys on. Each setter mutates the shared state slot directly.
  releaseYearCheckbox.props.onChange();
  weightCheckbox.props.onChange();

  // Re-render with mutated state and click Run picked.
  tree = renderDropdown(CommandConsoleKeysDropdown, { onRunPicked });
  const buttons = collectByType(tree, 'button');
  const runBtn = buttons.find((b) => findText(b, 'Run picked'));
  assert.equal(runBtn.props.disabled, false, 'Run picked must enable after pick');
  runBtn.props.onClick();
  assert.deepEqual(received, ['release_year', 'weight_g']);
});

test('component brand/link rows are visible but cannot be picked until the parent component publishes', async () => {
  setupDefaultGlobals();
  let received = null;
  const onRunPicked = (set) => { received = Array.from(set).sort(); };

  const { CommandConsoleKeysDropdown } = await loadModule();
  let tree = renderDropdown(CommandConsoleKeysDropdown, { onRunPicked });
  const inputs = collectByType(tree, 'input');
  const sensorBrandCheckbox = inputs.find((n) => n.props?.['aria-label'] === 'Pick sensor_brand');
  assert.ok(sensorBrandCheckbox, 'blocked component brand row must render');
  assert.equal(sensorBrandCheckbox.props.disabled, true, 'blocked component brand cannot be selected');

  sensorBrandCheckbox.props.onChange();
  tree = renderDropdown(CommandConsoleKeysDropdown, { onRunPicked });
  const buttons = collectByType(tree, 'button');
  const runBtn = buttons.find((b) => findText(b, 'Run picked'));
  assert.equal(runBtn.props.disabled, true, 'disabled component selection must not enable Run picked');
  runBtn.props.onClick();
  assert.equal(received, null, 'blocked component key must not dispatch');
});
