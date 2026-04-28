import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderNode(node) {
  if (Array.isArray(node)) return node.map(renderNode);
  if (node == null || typeof node !== 'object') return node;
  if (node.type === Symbol.for('fragment')) return renderNode(node.props?.children);
  if (typeof node.type === 'function') return renderNode(node.type(node.props || {}));
  const children = Object.prototype.hasOwnProperty.call(node.props || {}, 'children')
    ? renderNode(node.props.children)
    : node.props?.children;
  return {
    ...node,
    props: {
      ...(node.props || {}),
      children,
    },
  };
}

function collectNodes(node, predicate, results = []) {
  if (Array.isArray(node)) {
    for (const child of node) collectNodes(child, predicate, results);
    return results;
  }
  if (node == null || typeof node !== 'object') return results;
  if (predicate(node)) results.push(node);
  collectNodes(node.props?.children, predicate, results);
  return results;
}

function badgePaths(tree) {
  return collectNodes(tree, (node) => node.type === 'Badge')
    .map((node) => node.props?.p)
    .filter(Boolean);
}

function createBaseProps(overrides = {}) {
  const updates = [];
  return {
    props: {
      selectedKey: 'design',
      category: 'mouse',
      currentRule: {
        contract: { type: 'string', shape: 'scalar' },
        priority: {
          required_level: 'mandatory',
          availability: 'always',
          difficulty: 'easy',
        },
      },
      updateField(key, path, value) {
        updates.push({ key, path, value });
      },
      BadgeRenderer({ p }) {
        return { type: 'Badge', props: { p } };
      },
      saveIfAutoSaveEnabled() {},
      disabled: false,
      ...overrides,
    },
    updates,
  };
}

const JSX_STUB = `
  export function jsx(type, props) {
    return { type, props: props || {} };
  }
  export const jsxs = jsx;
  export const Fragment = Symbol.for('fragment');
`;

const TIP_STUB = `
  export function Tip(props) {
    return { type: 'Tip', props };
  }
`;

const NESTED_HELPERS_STUB = `
  function readPath(obj, path) {
    return String(path || '').split('.').reduce((acc, key) => acc && acc[key], obj);
  }
  export function strN(obj, path, fallback = '') {
    const value = readPath(obj || {}, path);
    return value == null ? fallback : String(value);
  }
  export function numN(obj, path, fallback = 0) {
    const value = Number(readPath(obj || {}, path));
    return Number.isFinite(value) ? value : fallback;
  }
  export function boolN(obj, path, fallback = false) {
    const value = readPath(obj || {}, path);
    return typeof value === 'boolean' ? value : fallback;
  }
  export function arrN(obj, path) {
    const value = readPath(obj || {}, path);
    return Array.isArray(value) ? value : [];
  }
`;

const STUDIO_CONSTANTS_STUB = `
  export const inputCls = 'input';
  export const labelCls = 'label';
  export const selectCls = 'select';
  export const COMPONENT_TYPES = ['sensor', 'switch'];
  export const DOMAIN_HINT_SUGGESTIONS = ['manufacturer'];
  export const CONTENT_TYPE_SUGGESTIONS = ['spec_sheet'];
  export const STUDIO_TIPS = {
    data_type: 'data type',
    shape: 'shape',
    contract_unit: 'unit',
    contract_range: 'range',
    list_rules_dedupe: 'dedupe',
    list_rules_sort: 'sort',
    list_rules_item_union: 'item union',
    rounding_decimals: 'rounding decimals',
    rounding_mode: 'rounding mode',
    min_evidence_refs: 'min refs',
    tier_preference: 'tier preference',
    aliases: 'aliases',
    domain_hints: 'domain hints',
    content_types: 'content types',
    query_terms: 'query terms',
    tooltip_guidance: 'tooltip',
    ai_reasoning_note: 'ai reasoning',
    variant_inventory_usage: 'variant inventory',
    pif_priority_images: 'pif priority images',
    component_db: 'component db',
    comp_match_fuzzy_threshold: 'fuzzy threshold',
    comp_match_name_weight: 'name weight',
    comp_match_auto_accept_score: 'auto accept',
    comp_match_flag_review_score: 'flag review',
    comp_match_property_weight: 'property weight',
    comp_match_property_keys: 'property keys',
  };
`;

const NUMERIC_BOUNDS_STUB = `
  export const STUDIO_NUMERIC_KNOB_BOUNDS = {
    evidenceMinRefs: { min: 1, max: 5, fallback: 1 },
    contractRoundingDecimals: { min: 0, max: 4, fallback: 0 },
    componentMatch: { min: 0, max: 1 },
  };
  export const STUDIO_COMPONENT_MATCH_DEFAULTS = {
    fuzzyThreshold: 0.75,
    nameWeight: 0.4,
    autoAcceptScore: 0.95,
    flagReviewScore: 0.65,
    propertyWeight: 0.6,
  };
`;

test('KeyAiAssistBody wires toggle props and reasoning_note updates to characterized paths', async () => {
  const { KeyAiAssistBody } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/bodies/KeyAiAssistBody.tsx',
    {
      prefix: 'key-ai-assist-body-contracts-',
      stubs: {
        'react/jsx-runtime': JSX_STUB,
        '../../../../../shared/ui/feedback/Tip.tsx': TIP_STUB,
        '../AiAssistToggleSubsection.tsx': `
          export function AiAssistToggleSubsection(props) {
            return { type: 'AiAssistToggleSubsection', props };
          }
        `,
        '../../../state/nestedValueHelpers.ts': NESTED_HELPERS_STUB,
        '../../../state/studioNumericKnobBounds.ts': NUMERIC_BOUNDS_STUB,
        '../../studioConstants.ts': STUDIO_CONSTANTS_STUB,
      },
    },
  );

  const { props, updates } = createBaseProps({
    currentRule: {
      priority: { required_level: 'mandatory', difficulty: 'hard' },
      contract: { type: 'number', shape: 'scalar', unit: 'g' },
      evidence: { min_evidence_refs: 2 },
      ai_assist: { reasoning_note: 'Use only official evidence.' },
    },
  });
  const tree = renderNode(KeyAiAssistBody(props));
  const toggles = collectNodes(tree, (node) => node.type === 'AiAssistToggleSubsection');

  assert.deepEqual(toggles.map((node) => ({
    path: node.props.path,
    label: node.props.label,
    ariaLabel: node.props.ariaLabel,
    tooltipKey: node.props.tooltipKey,
  })), [
    {
      path: 'ai_assist.variant_inventory_usage',
      label: 'Variant Inventory Context',
      ariaLabel: 'Use variant inventory context',
      tooltipKey: 'variant_inventory_usage',
    },
    {
      path: 'ai_assist.pif_priority_images',
      label: 'PIF Priority Images',
      ariaLabel: 'Use PIF priority images',
      tooltipKey: 'pif_priority_images',
    },
  ]);

  assert.ok(badgePaths(tree).includes('ai_assist.reasoning_note'));
  const textarea = collectNodes(tree, (node) => node.type === 'textarea')[0];
  const clearButton = collectNodes(tree, (node) => node.type === 'button')[0];
  textarea.props.onChange({ target: { value: 'Manual note' } });
  clearButton.props.onClick();

  assert.deepEqual(updates, [
    { key: 'design', path: 'ai_assist.reasoning_note', value: 'Manual note' },
    { key: 'design', path: 'ai_assist.reasoning_note', value: '' },
  ]);
});

test('KeyContractBody characterizes contract badge paths and update paths', async () => {
  const { KeyContractBody } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/bodies/KeyContractBody.tsx',
    {
      prefix: 'key-contract-body-contracts-',
      stubs: {
        'react/jsx-runtime': JSX_STUB,
        '../../Section.tsx': `
          export function SubSection(props) {
            return { type: 'SubSection', props };
          }
        `,
        '../../../../../shared/ui/feedback/Tip.tsx': TIP_STUB,
        '../../../../../pages/unit-registry/unitRegistryQueries.ts': `
          export function useUnitRegistryQuery() {
            return { data: { units: [{ canonical: 'ms' }, { canonical: 'g' }] } };
          }
        `,
        '../../../state/nestedValueHelpers.ts': NESTED_HELPERS_STUB,
        '../../../state/numericInputHelpers.ts': `
          export function parseIntegerInput(value) {
            const parsed = Number.parseInt(value, 10);
            return Number.isFinite(parsed) ? parsed : null;
          }
          export function parseBoundedIntInput(value, min, max, fallback) {
            const parsed = Number.parseInt(value, 10);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.max(min, Math.min(max, parsed));
          }
        `,
        '../../../state/studioNumericKnobBounds.ts': NUMERIC_BOUNDS_STUB,
        '../../../state/studioBehaviorContracts.ts': `
          export function isStudioContractFieldDeferredLocked() { return false; }
        `,
        '../../../state/fieldCascadeRegistry.ts': `
          export function isFieldAvailable() { return true; }
        `,
        '../../../state/typeShapeRegistry.ts': `
          export const VALID_TYPES = ['string', 'number', 'integer', 'boolean'];
          export const VALID_SHAPES = ['scalar', 'list'];
        `,
        '../../studioConstants.ts': STUDIO_CONSTANTS_STUB,
      },
    },
  );

  const { props, updates } = createBaseProps({
    currentRule: {
      variant_dependent: false,
      product_image_dependent: true,
      contract: {
        type: 'number',
        shape: 'list',
        unit: 'ms',
        range: { min: 0, max: 10 },
        list_rules: { dedupe: false, sort: 'asc', item_union: 'set_union' },
        rounding: { decimals: 2, mode: 'nearest' },
      },
    },
  });
  const tree = renderNode(KeyContractBody(props));

  assert.deepEqual(badgePaths(tree), [
    'variant_dependent',
    'product_image_dependent',
    'contract.type',
    'contract.shape',
    'contract.unit',
    'contract.range.min',
    'contract.range.max',
    'contract.list_rules.dedupe',
    'contract.list_rules.sort',
    'contract.list_rules.item_union',
    'contract.rounding.decimals',
    'contract.rounding.mode',
  ]);

  const switches = collectNodes(tree, (node) => node.type === 'button' && node.props?.role === 'switch');
  switches[0].props.onClick();
  switches[1].props.onClick();

  collectNodes(tree, (node) => node.type === 'select' && node.props?.value === 'number')[0]
    .props.onChange({ target: { value: 'integer' } });
  collectNodes(tree, (node) => node.type === 'select' && node.props?.value === 'list')[0]
    .props.onChange({ target: { value: 'scalar' } });
  collectNodes(tree, (node) => node.type === 'select' && node.props?.value === 'ms')[0]
    .props.onChange({ target: { value: '' } });
  collectNodes(tree, (node) => node.type === 'input' && node.props?.placeholder === 'Min')[0]
    .props.onChange({ target: { value: '1.5' } });
  collectNodes(tree, (node) => node.type === 'input' && node.props?.placeholder === 'Max')[0]
    .props.onChange({ target: { value: '12' } });
  collectNodes(tree, (node) => node.type === 'select' && node.props?.value === 'no')[0]
    .props.onChange({ target: { value: 'yes' } });
  collectNodes(tree, (node) => node.type === 'select' && node.props?.value === 'asc')[0]
    .props.onChange({ target: { value: 'desc' } });
  collectNodes(tree, (node) => node.type === 'select' && node.props?.value === 'set_union')[0]
    .props.onChange({ target: { value: '' } });
  collectNodes(tree, (node) => node.type === 'input' && node.props?.max === 4)[0]
    .props.onChange({ target: { value: '3' } });
  collectNodes(tree, (node) => node.type === 'select' && node.props?.value === 'nearest')[0]
    .props.onChange({ target: { value: 'floor' } });

  assert.deepEqual(updates, [
    { key: 'design', path: 'variant_dependent', value: true },
    { key: 'design', path: 'product_image_dependent', value: false },
    { key: 'design', path: 'contract.type', value: 'integer' },
    { key: 'design', path: 'contract.shape', value: 'scalar' },
    { key: 'design', path: 'contract.unit', value: null },
    { key: 'design', path: 'contract.range.min', value: 1.5 },
    { key: 'design', path: 'contract.range.max', value: 12 },
    { key: 'design', path: 'contract.list_rules.dedupe', value: true },
    { key: 'design', path: 'contract.list_rules.sort', value: 'desc' },
    { key: 'design', path: 'contract.list_rules.item_union', value: undefined },
    { key: 'design', path: 'contract.rounding.decimals', value: 3 },
    { key: 'design', path: 'contract.rounding.mode', value: 'floor' },
  ]);
});

test('KeyEvidenceBody characterizes evidence paths', async () => {
  const { KeyEvidenceBody } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/bodies/KeyEvidenceBody.tsx',
    {
      prefix: 'key-evidence-body-contracts-',
      stubs: {
        'react/jsx-runtime': JSX_STUB,
        '../../../../../shared/ui/feedback/Tip.tsx': TIP_STUB,
        '../../../../../shared/ui/forms/TierPicker.tsx': `
          export function TierPicker(props) {
            return { type: 'TierPicker', props };
          }
        `,
        '../../../../../shared/ui/forms/NumberStepper.tsx': `
          export function NumberStepper(props) {
            return { type: 'NumberStepper', props };
          }
        `,
        '../../../state/nestedValueHelpers.ts': NESTED_HELPERS_STUB,
        '../../../state/numericInputHelpers.ts': `
          export function parseBoundedIntInput(value) {
            return Number.parseInt(value, 10);
          }
        `,
        '../../../state/studioNumericKnobBounds.ts': NUMERIC_BOUNDS_STUB,
        '../../studioConstants.ts': STUDIO_CONSTANTS_STUB,
      },
    },
  );

  const { props, updates } = createBaseProps({
    currentRule: {
      evidence: {
        min_evidence_refs: 2,
        tier_preference: ['tier2', 'tier1'],
      },
    },
  });
  const tree = renderNode(KeyEvidenceBody(props));

  assert.deepEqual(badgePaths(tree), ['evidence.min_evidence_refs', 'evidence.tier_preference']);
  collectNodes(tree, (node) => node.type === 'NumberStepper')[0].props.onChange('3');
  collectNodes(tree, (node) => node.type === 'TierPicker')[0].props.onChange(['tier3']);

  assert.deepEqual(updates, [
    { key: 'design', path: 'evidence.min_evidence_refs', value: 3 },
    { key: 'design', path: 'evidence.tier_preference', value: ['tier3'] },
  ]);
});

test('KeySearchHintsBody characterizes alias and search hint paths', async () => {
  const { KeySearchHintsBody } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/bodies/KeySearchHintsBody.tsx',
    {
      prefix: 'key-search-hints-body-contracts-',
      stubs: {
        'react/jsx-runtime': JSX_STUB,
        '../../../../../shared/ui/feedback/Tip.tsx': TIP_STUB,
        '../../../../../shared/ui/forms/TagPicker.tsx': `
          export function TagPicker(props) {
            return { type: 'TagPicker', props };
          }
        `,
        '../../../state/nestedValueHelpers.ts': NESTED_HELPERS_STUB,
        '../../studioConstants.ts': STUDIO_CONSTANTS_STUB,
      },
    },
  );

  const { props, updates } = createBaseProps({
    currentRule: {
      aliases: ['alias'],
      search_hints: {
        domain_hints: ['manufacturer'],
        content_types: ['spec_sheet'],
        query_terms: ['design'],
      },
    },
  });
  const tree = renderNode(KeySearchHintsBody(props));
  const tagPickers = collectNodes(tree, (node) => node.type === 'TagPicker');

  assert.deepEqual(badgePaths(tree), [
    'aliases',
    'search_hints.domain_hints',
    'search_hints.content_types',
    'search_hints.query_terms',
  ]);

  tagPickers[0].props.onChange(['alias2']);
  tagPickers[1].props.onChange(['support']);
  tagPickers[2].props.onChange(['manual']);
  tagPickers[3].props.onChange(['shape']);

  assert.deepEqual(updates, [
    { key: 'design', path: 'aliases', value: ['alias2'] },
    { key: 'design', path: 'search_hints.domain_hints', value: ['support'] },
    { key: 'design', path: 'search_hints.content_types', value: ['manual'] },
    { key: 'design', path: 'search_hints.query_terms', value: ['shape'] },
  ]);
});

test('KeyTooltipBody characterizes tooltip path', async () => {
  const { KeyTooltipBody } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/bodies/KeyTooltipBody.tsx',
    {
      prefix: 'key-tooltip-body-contracts-',
      stubs: {
        'react/jsx-runtime': JSX_STUB,
        '../../../../../shared/ui/feedback/Tip.tsx': TIP_STUB,
        '../../../state/nestedValueHelpers.ts': NESTED_HELPERS_STUB,
        '../../studioConstants.ts': STUDIO_CONSTANTS_STUB,
      },
    },
  );

  const { props, updates } = createBaseProps({
    currentRule: { ui: { tooltip_md: 'Existing tooltip' } },
  });
  const tree = renderNode(KeyTooltipBody(props));

  assert.deepEqual(badgePaths(tree), ['ui.tooltip_md']);
  collectNodes(tree, (node) => node.type === 'textarea')[0]
    .props.onChange({ target: { value: 'New tooltip' } });

  assert.deepEqual(updates, [
    { key: 'design', path: 'ui.tooltip_md', value: 'New tooltip' },
  ]);
});

test('KeyEnumBody adapts EnumConfigurator path updates and badge suffixes', async () => {
  const { KeyEnumBody } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/bodies/KeyEnumBody.tsx',
    {
      prefix: 'key-enum-body-contracts-',
      stubs: {
        'react/jsx-runtime': JSX_STUB,
        '../../EnumConfigurator.tsx': `
          export function EnumConfigurator(props) {
            return { type: 'EnumConfigurator', props };
          }
        `,
        '../../../state/nestedValueHelpers.ts': NESTED_HELPERS_STUB,
      },
    },
  );

  const { props, updates } = createBaseProps({
    currentRule: { contract: { type: 'string' } },
    knownValues: { connection: ['wired'] },
    enumLists: [{ field: 'connection' }],
  });
  const tree = renderNode(KeyEnumBody(props));
  const node = collectNodes(tree, (entry) => entry.type === 'EnumConfigurator')[0];

  assert.equal(node.props.fieldKey, 'design');
  assert.equal(node.props.contractType, 'string');
  node.props.onUpdate('enum.policy', 'closed');
  assert.deepEqual(renderNode(node.props.renderLabelSuffix('enum.policy')), {
    type: 'Badge',
    props: { p: 'enum.policy', children: undefined },
  });
  assert.deepEqual(updates, [
    { key: 'design', path: 'enum.policy', value: 'closed' },
  ]);
});

test('KeyConstraintsBody adapts constraint updates to the constraints path', async () => {
  const { KeyConstraintsBody } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/bodies/KeyConstraintsBody.tsx',
    {
      prefix: 'key-constraints-body-contracts-',
      stubs: {
        'react/jsx-runtime': JSX_STUB,
        '../../KeyConstraintEditor.tsx': `
          export function KeyConstraintEditor(props) {
            return { type: 'KeyConstraintEditor', props };
          }
        `,
        '../../../state/nestedValueHelpers.ts': NESTED_HELPERS_STUB,
      },
    },
  );

  const { props, updates } = createBaseProps({
    currentRule: { constraints: ['requires connection != none'] },
    fieldOrder: ['connection'],
    editedRules: { connection: {} },
  });
  const tree = renderNode(KeyConstraintsBody(props));
  const node = collectNodes(tree, (entry) => entry.type === 'KeyConstraintEditor')[0];

  assert.equal(node.props.currentKey, 'design');
  assert.deepEqual(node.props.constraints, ['requires connection != none']);
  node.props.onChange(['requires design != none']);

  assert.deepEqual(updates, [
    { key: 'design', path: 'constraints', value: ['requires design != none'] },
  ]);
});

test('KeyComponentsBody characterizes component and match setting paths', async () => {
  const { KeyComponentsBody } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/bodies/KeyComponentsBody.tsx',
    {
      prefix: 'key-components-body-contracts-',
      stubs: {
        'react/jsx-runtime': JSX_STUB,
        '../../../../../shared/ui/feedback/Tip.tsx': TIP_STUB,
        '../../../state/nestedValueHelpers.ts': NESTED_HELPERS_STUB,
        '../../../state/deriveInputControl.ts': `
          export function deriveInputControl() {
            return 'combo';
          }
        `,
        '../../../state/numericInputHelpers.ts': `
          export function parseBoundedFloatInput(value, min, max, fallback) {
            const parsed = Number.parseFloat(value);
            if (!Number.isFinite(parsed)) return fallback;
            return Math.max(min, Math.min(max, parsed));
          }
        `,
        '../../../state/studioNumericKnobBounds.ts': NUMERIC_BOUNDS_STUB,
        '../../studioConstants.ts': STUDIO_CONSTANTS_STUB,
      },
    },
  );

  const { props, updates } = createBaseProps({
    currentRule: {
      component: {
        type: 'sensor',
        match: {
          fuzzy_threshold: 0.8,
          name_weight: 0.2,
          auto_accept_score: 0.9,
          flag_review_score: 0.4,
          property_weight: 0.7,
        },
      },
      contract: { type: 'string', shape: 'scalar' },
      enum: { source: 'component_db.sensor', policy: 'closed' },
    },
    componentSources: [
      {
        component_type: 'sensor',
        roles: {
          properties: [
            { field_key: 'dpi', variance_policy: 'range' },
            { field_key: 'sensor_type', variance_policy: 'authoritative' },
          ],
        },
      },
    ],
    knownValues: { sensor_type: ['optical'] },
    editedRules: {
      dpi: { contract: { type: 'number' } },
      sensor_type: {
        contract: { type: 'string' },
        enum: { source: 'data_lists.sensor_type' },
      },
    },
  });
  const tree = renderNode(KeyComponentsBody(props));

  assert.deepEqual(badgePaths(tree), [
    'component.type',
    'component.match.fuzzy_threshold',
    'component.match.name_weight',
    'component.match.auto_accept_score',
    'component.match.flag_review_score',
    'component.match.property_weight',
    'component.match.property_keys',
  ]);

  const componentSelect = collectNodes(tree, (node) => node.type === 'select' && node.props?.value === 'sensor')[0];
  componentSelect.props.onChange({ target: { value: '' } });
  componentSelect.props.onChange({ target: { value: 'switch' } });
  for (const input of collectNodes(tree, (node) => node.type === 'input' && node.props?.type === 'number')) {
    input.props.onChange({ target: { value: '0.5' } });
  }

  assert.deepEqual(updates, [
    { key: 'design', path: 'component', value: null },
    { key: 'design', path: 'component.type', value: '' },
    {
      key: 'design',
      path: 'component',
      value: {
        type: 'switch',
        source: 'component_db.switch',
        allow_new_components: true,
        require_identity_evidence: true,
      },
    },
    { key: 'design', path: 'component.match.fuzzy_threshold', value: 0.5 },
    { key: 'design', path: 'component.match.name_weight', value: 0.5 },
    { key: 'design', path: 'component.match.auto_accept_score', value: 0.5 },
    { key: 'design', path: 'component.match.flag_review_score', value: 0.5 },
    { key: 'design', path: 'component.match.property_weight', value: 0.5 },
  ]);
});
