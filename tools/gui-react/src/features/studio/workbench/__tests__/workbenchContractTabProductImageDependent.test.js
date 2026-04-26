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

async function loadContractTab() {
  return loadBundledModule(
    'tools/gui-react/src/features/studio/workbench/WorkbenchDrawerContractTab.tsx',
    {
      prefix: 'workbench-contract-tab-product-image-dependent-',
      stubs: {
        'react/jsx-runtime': `
          export function jsx(type, props) {
            return { type, props: props || {} };
          }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
        '../../../shared/ui/forms/ComboSelect.tsx': `
          export function ComboSelect(props) {
            return { type: 'ComboSelect', props };
          }
        `,
        '../../../shared/ui/feedback/Tip.tsx': `
          export function Tip(props) {
            return { type: 'Tip', props };
          }
        `,
        '../../../shared/ui/forms/NumberStepper.tsx': `
          export function NumberStepper(props) {
            return { type: 'NumberStepper', props };
          }
        `,
        '../state/numericInputHelpers.ts': `
          export function parseBoundedIntInput(value) { return Number.parseInt(value, 10) || 0; }
          export function parseIntegerInput(value) { return Number.parseInt(value, 10); }
        `,
        '../state/studioNumericKnobBounds.ts': `
          export const STUDIO_NUMERIC_KNOB_BOUNDS = {
            contractRoundingDecimals: { min: 0, max: 4, fallback: 0 },
            evidenceMinRefs: { fallback: 1 },
          };
        `,
        '../state/studioBehaviorContracts.ts': `
          export function isStudioContractFieldDeferredLocked() { return false; }
        `,
        '../state/fieldCascadeRegistry.ts': `
          export function isFieldAvailable() { return true; }
        `,
        './workbenchHelpers.ts': `
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
        '../components/studioConstants.ts': `
          export const inputCls = 'input';
          export const labelCls = 'label';
          export const selectCls = 'select';
          export const STUDIO_TIPS = {
            data_type: 'data type',
            shape: 'shape',
            contract_unit: 'unit',
            contract_range: 'range',
            list_rules: 'list rules',
            list_rules_dedupe: 'dedupe',
            list_rules_sort: 'sort',
            list_rules_item_union: 'item union',
            rounding_decimals: 'rounding',
            rounding_mode: 'rounding mode',
            required_level: 'required',
            availability: 'availability',
            difficulty: 'difficulty',
            ai_reasoning_note: 'reasoning note',
            variant_inventory_usage: 'variant inventory',
            pif_priority_images: 'pif priority images',
            tooltip_guidance: 'tooltip',
          };
        `,
        '../../../pages/unit-registry/unitRegistryQueries.ts': `
          export function useUnitRegistryQuery() {
            return { data: { units: [] } };
          }
        `,
        '../../../registries/fieldRuleTaxonomy.ts': `
          export const REQUIRED_LEVEL_OPTIONS = ['mandatory', 'non_mandatory'];
          export const AVAILABILITY_OPTIONS = ['always', 'sometimes', 'rare'];
          export const DIFFICULTY_OPTIONS = ['easy', 'medium', 'hard', 'very_hard'];
        `,
        '../state/typeShapeRegistry.ts': `
          export const VALID_TYPES = ['string', 'number'];
          export const VALID_SHAPES = ['scalar', 'list'];
        `,
        '../components/key-sections/AiAssistToggleSubsection.tsx': `
          export function AiAssistToggleSubsection(props) {
            return { type: 'AiAssistToggleSubsection', props };
          }
        `,
      },
    },
  );
}

test('ContractTab renders and wires Product Image Dependent below contract toggles', async () => {
  const { ContractTab } = await loadContractTab();
  const updates = [];
  const tree = renderNode(ContractTab({
    fieldKey: 'connection',
    rule: {
      variant_dependent: false,
      product_image_dependent: true,
      contract: { type: 'string', shape: 'scalar' },
      priority: { required_level: 'mandatory', availability: 'always', difficulty: 'easy' },
    },
    onUpdate(path, value) {
      updates.push({ path, value });
    },
    B({ p }) {
      return { type: 'Badge', props: { p } };
    },
  }));

  const switches = collectNodes(tree, (node) => node.props?.role === 'switch');
  const productImageSwitch = switches.find((node) => node.props?.['aria-label'] === 'Product image dependent (on)');
  assert.ok(productImageSwitch, 'product image dependency switch should render');
  assert.equal(productImageSwitch.props['aria-checked'], true);
  assert.equal(
    collectNodes(tree, (node) => node.type === 'Badge' && node.props?.p === 'product_image_dependent').length,
    1,
  );

  productImageSwitch.props.onClick();
  assert.deepEqual(updates, [{ path: 'product_image_dependent', value: false }]);
});
