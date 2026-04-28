import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

const STUBS = {
  react: 'export function memo(component) { return component; }',
  'react/jsx-runtime': `
    export function jsx(type, props) { return { type, props: props || {} }; }
    export const jsxs = jsx;
    export const Fragment = Symbol.for('fragment');
  `,
  '../../../shared/ui/finder/ConfidenceRing.tsx': `
    export function ConfidenceRing(props) { return { type: 'ConfidenceRing', props }; }
  `,
  '../../../shared/ui/finder/DiscoveryHistoryButton.tsx': `
    export function DiscoveryHistoryButton(props) { return { type: 'DiscoveryHistoryButton', props }; }
  `,
  '../../../shared/ui/finder/FinderRunModelBadge.tsx': `
    export function FinderRunModelBadge(props) { return { type: 'FinderRunModelBadge', props }; }
  `,
  '../../../shared/ui/finder/PromptDrawerChevron.tsx': `
    export function PromptDrawerChevron(props) { return { type: 'PromptDrawerChevron', props }; }
  `,
  '../../../shared/ui/actionButton/index.ts': `
    export const ACTION_BUTTON_WIDTH = { keyRow: 'w-key', keyRowHistory: 'w-history' };
    export function RowActionButton(props) { return { type: 'RowActionButton', props }; }
  `,
  '../../../shared/ui/feedback/Chip.tsx': `
    export function Chip(props) { return { type: 'Chip', props }; }
  `,
  '../../../shared/ui/feedback/Spinner.tsx': `
    export function Spinner(props) { return { type: 'Spinner', props }; }
  `,
  '../../../shared/ui/icons/KeyTypeIcons.tsx': `
    export function KeyTypeIconStrip(props) { return { type: 'KeyTypeIconStrip', props }; }
  `,
  '../../../shared/ui/icons/keyTypeIconHelpers.ts': `
    export function deriveKeyTypeIcons(input) {
      const rule = input.rule || {};
      const kinds = [];
      if (rule.variant_dependent === true) kinds.push('variant');
      if (rule.product_image_dependent === true) kinds.push('pif');
      const enumSource = rule.enum && rule.enum.source;
      if (enumSource === 'component_db.' + input.fieldKey) {
        kinds.push('component_self');
      } else if (rule.component_identity_projection && rule.component_identity_projection.component_type) {
        kinds.push('component_identity_projection');
      } else if (input.belongsToComponent) {
        kinds.push('component_attribute');
      }
      return kinds;
    }
    export function deriveOwningComponent(input) {
      const rule = input.rule || {};
      const enumSource = rule.enum && rule.enum.source;
      if (enumSource === 'component_db.' + input.fieldKey) return input.fieldKey;
      if (rule.component_identity_projection && rule.component_identity_projection.component_type) {
        return rule.component_identity_projection.component_type;
      }
      return input.belongsToComponent || '';
    }
  `,
};

async function loadModule() {
  return loadBundledModule(
    'tools/gui-react/src/features/key-finder/components/KeyRow.tsx',
    { prefix: 'key-row-component-identity-', stubs: STUBS },
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

function collectText(node, out = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
    return out;
  }
  if (typeof node === 'string') {
    out.push(node);
    return out;
  }
  if (node == null || typeof node !== 'object') return out;
  collectText(node.props?.children, out);
  return out;
}

function baseEntry(overrides = {}) {
  return {
    field_key: 'sensor_brand',
    label: 'Sensor Brand',
    difficulty: 'medium',
    availability: 'always',
    required_level: 'mandatory',
    variant_dependent: false,
    product_image_dependent: false,
    uses_variant_inventory: false,
    uses_pif_priority_images: false,
    budget: 1,
    raw_budget: 1,
    in_flight_as_primary: false,
    in_flight_as_passenger_count: 0,
    bundle_pool: 4,
    bundle_total_cost: 2,
    bundle_preview: [{ field_key: 'dpi', cost: 1 }],
    last_run_number: null,
    last_value: null,
    last_confidence: null,
    last_status: null,
    last_model: null,
    last_fallback_used: null,
    last_access_mode: null,
    last_effort_level: null,
    last_thinking: null,
    last_web_search: null,
    candidate_count: 0,
    published: false,
    concrete_evidence: false,
    top_confidence: null,
    top_evidence_count: null,
    run_count: 0,
    dedicated_run: true,
    component_run_kind: 'component_brand',
    component_parent_key: 'sensor',
    component_dependency_satisfied: false,
    run_blocked_reason: 'component_parent_unpublished',
    belongs_to_component: '',
    running: false,
    opMode: null,
    opStatus: null,
    ridingPrimaries: ['sensor'],
    activePassengers: ['dpi'],
    ...overrides,
  };
}

test('component-attribute row carries belongs_to_component into the icon strip with the parent component as owningComponent', async () => {
  const { KeyRow } = await loadModule();
  const tree = renderNode(KeyRow({
    entry: baseEntry({
      field_key: 'sensor_dpi_max',
      label: 'Sensor DPI Max',
      // Plain attribute — not the component itself, not an identity projection.
      dedicated_run: false,
      component_run_kind: '',
      component_parent_key: '',
      component_dependency_satisfied: true,
      run_blocked_reason: '',
      belongs_to_component: 'sensor',
    }),
    productId: 'p1',
    category: 'mouse',
    onRun: () => {},
    onLoop: () => {},
    onOpenPrompt: () => {},
    onUnresolve: () => {},
    onDelete: () => {},
  }));

  const strips = collectByType(tree, 'KeyTypeIconStrip');
  assert.equal(strips.length, 1, 'one KeyTypeIconStrip rendered for the attribute row');
  assert.equal(strips[0].props.owningComponent, 'sensor', 'tinted by the owning component');
  assert.ok(
    Array.isArray(strips[0].props.kinds) && strips[0].props.kinds.includes('component_attribute'),
    'predicate detects the attribute kind',
  );
});

test('dedicated component resolver rows render N/A for bundle/passenger cells and warn-styled disabled actions', async () => {
  const { KeyRow } = await loadModule();
  const tree = renderNode(KeyRow({
    entry: baseEntry(),
    productId: 'p1',
    category: 'mouse',
    onRun: () => {},
    onLoop: () => {},
    onOpenPrompt: () => {},
    onUnresolve: () => {},
    onDelete: () => {},
  }));

  assert.ok(collectText(tree).filter((text) => text === 'N/A').length >= 3, 'bundle/riding/passenger cells use N/A');

  const buttons = collectByType(tree, 'RowActionButton');
  const run = buttons.find((button) => button.props.label === 'Run');
  const loop = buttons.find((button) => button.props.label === 'Loop');
  assert.equal(run.props.disabled, true, 'blocked component brand run is disabled');
  assert.equal(loop.props.disabled, true, 'blocked component brand loop is disabled');
  assert.equal(run.props.intent, 'componentResolver');
  assert.equal(loop.props.intent, 'componentResolverLocked');
});
