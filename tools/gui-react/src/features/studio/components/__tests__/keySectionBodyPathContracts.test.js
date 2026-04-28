import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FIELD_RULE_AI_ASSIST_TOGGLE_CONTROLS,
  FIELD_RULE_COMPONENT_TYPE_CONTROL,
  FIELD_RULE_CONTRACT_CONTROLS,
  FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS,
  FIELD_RULE_CONSTRAINT_CONTROL,
  FIELD_RULE_EVIDENCE_CONTROLS,
  FIELD_RULE_ENUM_CONTROLS,
  FIELD_RULE_PRIORITY_CONTROLS,
  FIELD_RULE_SEARCH_HINT_CONTROLS,
} from '../../../../../../../src/field-rules/fieldRuleSchema.js';
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

function contractControl(controlId) {
  const control = FIELD_RULE_CONTRACT_CONTROLS.find((entry) => entry.controlId === controlId);
  assert.ok(control, `missing contract control ${controlId}`);
  return control;
}

function enumControl(controlId) {
  const control = FIELD_RULE_ENUM_CONTROLS.find((entry) => entry.controlId === controlId);
  assert.ok(control, `missing enum control ${controlId}`);
  return control;
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
  };
`;

const NUMERIC_BOUNDS_STUB = `
  export const STUDIO_NUMERIC_KNOB_BOUNDS = {
    evidenceMinRefs: { min: 1, max: 5, fallback: 1 },
    contractRoundingDecimals: { min: 0, max: 4, fallback: 0 },
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
  })), FIELD_RULE_AI_ASSIST_TOGGLE_CONTROLS);

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

test('KeyPriorityBody wires priority controls to registry-derived paths and options', async () => {
  const { KeyPriorityBody } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/bodies/KeyPriorityBody.tsx',
    {
      prefix: 'key-priority-body-contracts-',
      stubs: {
        'react/jsx-runtime': JSX_STUB,
        '../../../../../shared/ui/feedback/Tip.tsx': TIP_STUB,
        '../../../state/nestedValueHelpers.ts': NESTED_HELPERS_STUB,
        '../../studioConstants.ts': STUDIO_CONSTANTS_STUB,
      },
    },
  );

  const { props, updates } = createBaseProps({
    currentRule: {
      priority: {
        required_level: 'mandatory',
        availability: 'sometimes',
        difficulty: 'hard',
      },
    },
  });
  const tree = renderNode(KeyPriorityBody(props));
  const selects = collectNodes(tree, (node) => node.type === 'select');

  assert.deepEqual(badgePaths(tree), FIELD_RULE_PRIORITY_CONTROLS.map((control) => control.path));
  assert.deepEqual(
    selects.map((select) => collectNodes(select, (node) => node.type === 'option').map((option) => option.props.value)),
    FIELD_RULE_PRIORITY_CONTROLS.map((control) => control.options),
  );

  selects[0].props.onChange({ target: { value: 'non_mandatory' } });
  selects[1].props.onChange({ target: { value: 'rare' } });
  selects[2].props.onChange({ target: { value: 'very_hard' } });

  assert.deepEqual(updates, [
    { key: 'design', path: 'priority.required_level', value: 'non_mandatory' },
    { key: 'design', path: 'priority.availability', value: 'rare' },
    { key: 'design', path: 'priority.difficulty', value: 'very_hard' },
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
    ...FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS.map((control) => control.path),
    contractControl('contract_type').path,
    contractControl('contract_shape').path,
    contractControl('contract_unit').path,
    contractControl('contract_range_min').path,
    contractControl('contract_range_max').path,
    contractControl('contract_list_dedupe').path,
    contractControl('contract_list_sort').path,
    contractControl('contract_list_item_union').path,
    contractControl('contract_rounding_decimals').path,
    contractControl('contract_rounding_mode').path,
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
    { key: 'design', path: FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS[0].path, value: true },
    { key: 'design', path: FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS[1].path, value: false },
    { key: 'design', path: contractControl('contract_type').path, value: 'integer' },
    { key: 'design', path: contractControl('contract_shape').path, value: 'scalar' },
    { key: 'design', path: contractControl('contract_unit').path, value: null },
    { key: 'design', path: contractControl('contract_range_min').path, value: 1.5 },
    { key: 'design', path: contractControl('contract_range_max').path, value: 12 },
    { key: 'design', path: contractControl('contract_list_dedupe').path, value: true },
    { key: 'design', path: contractControl('contract_list_sort').path, value: 'desc' },
    { key: 'design', path: contractControl('contract_list_item_union').path, value: undefined },
    { key: 'design', path: contractControl('contract_rounding_decimals').path, value: 3 },
    { key: 'design', path: contractControl('contract_rounding_mode').path, value: 'floor' },
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

  assert.deepEqual(badgePaths(tree), FIELD_RULE_EVIDENCE_CONTROLS.map((control) => control.path));
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

  assert.deepEqual(badgePaths(tree), FIELD_RULE_SEARCH_HINT_CONTROLS.map((control) => control.path));
  assert.deepEqual(
    tagPickers.map((tagPicker) => ({
      suggestions: tagPicker.props.suggestions,
      placeholder: tagPicker.props.placeholder,
    })),
    [
      { suggestions: undefined, placeholder: 'source phrases and alternate field names' },
      { suggestions: ['manufacturer'], placeholder: 'manufacturer, rtings.com...' },
      { suggestions: ['spec_sheet'], placeholder: 'spec_sheet, datasheet...' },
      { suggestions: undefined, placeholder: 'alternative search terms' },
    ],
  );

  tagPickers[0].props.onChange(['alias2']);
  tagPickers[1].props.onChange(['support']);
  tagPickers[2].props.onChange(['manual']);
  tagPickers[3].props.onChange(['shape']);

  assert.deepEqual(updates, [
    { key: 'design', path: FIELD_RULE_SEARCH_HINT_CONTROLS[0].path, value: ['alias2'] },
    { key: 'design', path: FIELD_RULE_SEARCH_HINT_CONTROLS[1].path, value: ['support'] },
    { key: 'design', path: FIELD_RULE_SEARCH_HINT_CONTROLS[2].path, value: ['manual'] },
    { key: 'design', path: FIELD_RULE_SEARCH_HINT_CONTROLS[3].path, value: ['shape'] },
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
  node.props.onUpdate(enumControl('enum_policy').path, 'closed');
  assert.deepEqual(renderNode(node.props.renderLabelSuffix(enumControl('enum_policy').path)), {
    type: 'Badge',
    props: { p: enumControl('enum_policy').path, children: undefined },
  });
  assert.deepEqual(updates, [
    { key: 'design', path: enumControl('enum_policy').path, value: 'closed' },
  ]);
});

test('EnumConfigurator wires enum controls to registry-derived paths and options', async () => {
  const { EnumConfigurator } = await loadBundledModule(
    'tools/gui-react/src/features/studio/components/EnumConfigurator.tsx',
    {
      prefix: 'enum-configurator-contracts-',
      stubs: {
        'react/jsx-runtime': JSX_STUB,
        '../../../shared/ui/feedback/Tip.tsx': TIP_STUB,
        './Section.tsx': `
          export function SubSection(props) {
            return { type: 'SubSection', props };
          }
        `,
        '../state/nestedValueHelpers.ts': NESTED_HELPERS_STUB,
        '../../publisher/index.ts': `
          export function FormatPatternInput(props) {
            return { type: 'FormatPatternInput', props };
          }
        `,
        './studioConstants.ts': `
          export const labelCls = 'label';
          export const selectCls = 'select';
          export const STUDIO_TIPS = {
            enum_policy: 'enum policy',
            enum_source: 'enum source',
          };
        `,
      },
    },
  );

  const updates = [];
  const tree = renderNode(EnumConfigurator({
    fieldKey: 'design',
    rule: {
      contract: { type: 'string' },
      enum: {
        policy: 'open',
        source: 'data_lists.colors',
        match: { format_hint: 'XXXX' },
      },
    },
    knownValues: { design: ['black'] },
    enumLists: [{ field: 'colors', values: ['black'] }],
    contractType: 'string',
    onUpdate(path, value) {
      updates.push({ path, value });
    },
    renderLabelSuffix(fieldPath) {
      return { type: 'Badge', props: { p: fieldPath } };
    },
    isEgLocked: false,
  }));

  const selects = collectNodes(tree, (node) => node.type === 'select');
  assert.deepEqual(
    collectNodes(selects[0], (node) => node.type === 'option').map((node) => node.props.value),
    enumControl('enum_policy').options,
  );
  selects[0].props.onChange({ target: { value: 'closed' } });
  selects[1].props.onChange({ target: { value: 'colors' } });

  const formatInput = collectNodes(tree, (node) => node.type === 'FormatPatternInput')[0];
  assert.equal(formatInput.props.fieldPath, enumControl('enum_format_hint').path);
  formatInput.props.onChange('YYYY');

  assert.deepEqual(updates, [
    { path: enumControl('enum_policy').path, value: 'closed' },
    { path: enumControl('enum_source').path, value: 'data_lists.colors' },
    { path: enumControl('enum_format_hint').path, value: 'YYYY' },
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
    { key: 'design', path: FIELD_RULE_CONSTRAINT_CONTROL.path, value: ['requires design != none'] },
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
    FIELD_RULE_COMPONENT_TYPE_CONTROL.path,
  ]);

  const componentSelect = collectNodes(tree, (node) => node.type === 'select' && node.props?.value === 'sensor')[0];
  componentSelect.props.onChange({ target: { value: '' } });
  componentSelect.props.onChange({ target: { value: 'switch' } });

  assert.deepEqual(updates, [
    { key: 'design', path: FIELD_RULE_COMPONENT_TYPE_CONTROL.path.split('.')[0], value: null },
    { key: 'design', path: FIELD_RULE_COMPONENT_TYPE_CONTROL.path, value: '' },
    {
      key: 'design',
      path: FIELD_RULE_COMPONENT_TYPE_CONTROL.path.split('.')[0],
      value: {
        type: 'switch',
        source: 'component_db.switch',
        allow_new_components: true,
        require_identity_evidence: true,
      },
    },
  ]);
});
