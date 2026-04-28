import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS } from '../../../../../../../src/field-rules/fieldRuleSchema.js';
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

async function loadContractBody() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/components/key-sections/bodies/KeyContractBody.tsx',
    {
      prefix: 'workbench-contract-body-product-image-dependent-',
      stubs: {
        'react/jsx-runtime': `
          export function jsx(type, props) {
            return { type, props: props || {} };
          }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
        '../../Section.tsx': `
          export function SubSection(props) {
            return { type: 'SubSection', props };
          }
        `,
        '../../../../../shared/ui/feedback/Tip.tsx': `
          export function Tip(props) {
            return { type: 'Tip', props };
          }
        `,
        '../../../../../pages/unit-registry/unitRegistryQueries.ts': `
          export function useUnitRegistryQuery() {
            return { data: { units: [] } };
          }
        `,
        '../../../state/nestedValueHelpers.ts': `
          function readPath(obj, path) {
            return String(path || '').split('.').reduce((acc, key) => acc && acc[key], obj);
          }
          export function boolN(obj, path, fallback = false) {
            const value = readPath(obj || {}, path);
            return typeof value === 'boolean' ? value : fallback;
          }
          export function strN(obj, path, fallback = '') {
            const value = readPath(obj || {}, path);
            return value == null ? fallback : String(value);
          }
          export function numN(obj, path, fallback = 0) {
            const value = Number(readPath(obj || {}, path));
            return Number.isFinite(value) ? value : fallback;
          }
        `,
        '../../../state/numericInputHelpers.ts': `
          export function parseBoundedIntInput(value) { return Number.parseInt(value, 10) || 0; }
          export function parseIntegerInput(value) { return Number.parseInt(value, 10); }
        `,
        '../../../state/studioNumericKnobBounds.ts': `
          export const STUDIO_NUMERIC_KNOB_BOUNDS = {
            contractRoundingDecimals: { min: 0, max: 4, fallback: 0 },
          };
        `,
        '../../../state/studioBehaviorContracts.ts': `
          export function isStudioContractFieldDeferredLocked() { return false; }
        `,
        '../../../state/fieldCascadeRegistry.ts': `
          export function isFieldAvailable() { return true; }
        `,
        '../../studioConstants.ts': `
          export const inputCls = 'input';
          export const labelCls = 'label';
          export const selectCls = 'select';
          export const STUDIO_TIPS = {
            data_type: 'data type',
            shape: 'shape',
            contract_unit: 'unit',
            contract_range: 'range',
            list_rules_dedupe: 'dedupe',
            list_rules_sort: 'sort',
            list_rules_item_union: 'item union',
            rounding_decimals: 'rounding',
            rounding_mode: 'rounding mode',
          };
        `,
      },
    },
  );
}

test('KeyContractBody renders and wires Product Image Dependent from registry metadata', async () => {
  const { KeyContractBody } = await loadContractBody();
  const productImageControl = FIELD_RULE_CONTRACT_DEPENDENCY_CONTROLS.find(
    (control) => control.controlId === 'product_image_dependent',
  );
  assert.ok(productImageControl);

  const updates = [];
  const tree = renderNode(KeyContractBody({
    selectedKey: 'connection',
    currentRule: {
      variant_dependent: false,
      product_image_dependent: true,
      contract: { type: 'string', shape: 'scalar' },
    },
    updateField(key, path, value) {
      updates.push({ key, path, value });
    },
    BadgeRenderer({ p }) {
      return { type: 'Badge', props: { p } };
    },
    disabled: false,
  }));

  const switches = collectNodes(tree, (node) => node.props?.role === 'switch');
  const productImageSwitch = switches.find(
    (node) => node.props?.['aria-label'] === productImageControl.trueAriaLabel,
  );
  assert.ok(productImageSwitch, 'product image dependency switch should render');
  assert.equal(productImageSwitch.props['aria-checked'], true);
  assert.equal(
    collectNodes(tree, (node) => node.type === 'Badge' && node.props?.p === productImageControl.path).length,
    1,
  );

  productImageSwitch.props.onClick();
  assert.deepEqual(updates, [{ key: 'connection', path: productImageControl.path, value: false }]);
});
