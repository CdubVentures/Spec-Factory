import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderElement(element) {
  if (Array.isArray(element)) return element.map(renderElement);
  if (element == null || typeof element !== 'object') return element;
  if (typeof element.type === 'function') {
    return renderElement(element.type(element.props || {}));
  }
  const children = Object.prototype.hasOwnProperty.call(element.props || {}, 'children')
    ? renderElement(element.props.children)
    : element.props?.children;
  return {
    ...element,
    props: {
      ...(element.props || {}),
      children,
    },
  };
}

function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  return textContent(node.props?.children);
}

function passthroughComponent(name) {
  return `
    export function ${name}(props) {
      return { type: '${name}', props: props || {} };
    }
  `;
}

test('BillingModelCostDialog formats pricing as-of date with the user date formatter', async () => {
  const module = await loadBundledModule(
    'tools/gui-react/src/features/billing/components/BillingModelCostDialog.tsx',
    {
      prefix: 'billing-model-cost-dialog-formatting-',
      stubs: {
        react: `
          export function useMemo(factory) { return factory(); }
          export function useState(initial) { return [typeof initial === 'function' ? initial() : initial, () => {}]; }
        `,
        'react/jsx-runtime': `
          export function jsx(type, props) { return { type, props: props || {} }; }
          export const jsxs = jsx;
          export const Fragment = Symbol.for('fragment');
        `,
        '@radix-ui/react-dialog': `
          export function Root(props) { return props.open ? props.children : null; }
          export function Portal(props) { return props.children; }
          export function Overlay(props) { return { type: 'Overlay', props: props || {} }; }
          export function Content(props) { return { type: 'Content', props: props || {} }; }
          export function Close(props) { return { type: 'Close', props: props || {} }; }
          export function Title(props) { return { type: 'Title', props: props || {} }; }
          export function Description(props) { return { type: 'Description', props: props || {} }; }
        `,
        '../../../shared/ui/icons/LlmProviderIcon.tsx': passthroughComponent('LlmProviderIcon'),
        '../../../shared/ui/feedback/SkeletonBlock.tsx': passthroughComponent('SkeletonBlock'),
        '../../../shared/ui/filterBar/icons.tsx': passthroughComponent('CloseIcon'),
        '../../../utils/dateTime.ts': `
          export function useFormatDateYMD() {
            return (value) => value === '2026-04-17' ? '04-17-26' : String(value || '');
          }
        `,
      },
    },
  );

  const tree = renderElement(module.BillingModelCostDialog({
    open: true,
    onOpenChange: () => {},
    isLoading: false,
    data: {
      month: '2026-04',
      pricing_meta: { as_of: '2026-04-17', sources: {} },
      totals: {
        providers: 0,
        models: 0,
        used_models: 0,
        current_cost_usd: 0,
        highest_output_per_1m: 0,
      },
      providers: [],
    },
  }));

  assert.match(textContent(tree), /Pricing as of 04-17-26/);
});
