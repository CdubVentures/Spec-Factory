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

function flattenText(node) {
  if (Array.isArray(node)) {
    return node.map(flattenText).join(' ');
  }
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  return flattenText(node.props?.children);
}

function findAll(node, predicate, results = []) {
  if (Array.isArray(node)) {
    node.forEach((entry) => findAll(entry, predicate, results));
    return results;
  }
  if (node == null || typeof node !== 'object') return results;
  if (predicate(node)) {
    results.push(node);
  }
  findAll(node.props?.children, predicate, results);
  return results;
}

function findFirst(node, predicate) {
  return findAll(node, predicate)[0] ?? null;
}

async function loadRunPickerModule() {
  return loadBundledModule('tools/gui-react/src/features/runtime-ops/components/RuntimeOpsRunPicker.tsx', {
    prefix: 'runtime-ops-run-picker-',
    stubs: {
      react: `
        export function useMemo(factory) {
          return factory();
        }
      `,
      'react/jsx-runtime': `
        export function jsx(type, props) {
          return { type, props: props || {} };
        }
        export const jsxs = jsx;
        export const Fragment = Symbol.for('fragment');
      `,
      '../../../components/common/Spinner': `
        export function Spinner() {
          return { type: 'span', props: { children: 'spinner' } };
        }
      `,
    },
  });
}

test('runtime ops run picker renders readable labels with storage-origin badges', async () => {
  const { RuntimeOpsRunPicker } = await loadRunPickerModule();
  const tree = renderElement(RuntimeOpsRunPicker({
    runs: [
      {
        run_id: '20260318-abcdef1',
        category: 'mouse',
        product_id: 'mouse-razer-viper-v3-pro-white',
        status: 'completed',
        picker_label: 'Mouse \u2022 Razer Viper V3 Pro White - bcdef',
        storage_origin: 's3',
        storage_state: 'stored',
      },
      {
        run_id: '20260317-bcdefg2',
        category: 'mouse',
        product_id: 'mouse-logitech-g-pro-x-superlight-2',
        status: 'completed',
        picker_label: 'Mouse \u2022 Logitech G Pro X Superlight 2 - cdefg',
        storage_origin: 'local',
        storage_state: 'live',
      },
    ],
    value: '20260318-abcdef1',
    onChange: () => {},
    isLoading: false,
    isRefreshing: false,
  }));

  const text = flattenText(tree);
  assert.match(text, /Razer Viper V3 Pro White/);
  assert.match(text, /\bMouse\b/);
  assert.match(text, /\bbcdef\b/);
  assert.match(text, /\bS3\b/);
  assert.match(text, /\bLocal\b/);
  assert.match(text, /\bStored\b/);
  assert.match(text, /\bLive\b/);
});

test('runtime ops run picker caps itself at 400px and keeps the selected summary to one inline label plus badges', async () => {
  const { RuntimeOpsRunPicker } = await loadRunPickerModule();
  const tree = renderElement(RuntimeOpsRunPicker({
    runs: [
      {
        run_id: '20260318-abcdef1',
        category: 'mouse',
        product_id: 'mouse-razer-viper-v3-pro-white',
        status: 'completed',
        picker_label: 'Mouse \u2022 Razer Viper V3 Pro White - bcdef',
        storage_origin: 's3',
        storage_state: 'stored',
      },
      {
        run_id: '20260317-bcdefg2',
        category: 'mouse',
        product_id: 'mouse-logitech-g-pro-x-superlight-2',
        status: 'completed',
        picker_label: 'Mouse \u2022 Logitech G Pro X Superlight 2 - cdefg',
        storage_origin: 'local',
        storage_state: 'live',
      },
    ],
    value: '20260318-abcdef1',
    onChange: () => {},
    isLoading: false,
    isRefreshing: false,
  }));

  const details = findFirst(tree, (node) => node.type === 'details');
  assert.ok(details, 'expected a details root');
  assert.match(String(details.props?.className || ''), /w-\[400px\]/);

  const summary = findFirst(tree, (node) => node.type === 'summary');
  const summaryText = flattenText(summary);
  assert.match(summaryText, /Mouse\s+Razer Viper V3 Pro White\s+bcdef/);
  assert.match(summaryText, /\bStored\b/);
  assert.match(summaryText, /\bS3\b/);
  assert.doesNotMatch(summaryText, /\bcompleted\b/i);

  const summaryRow = findFirst(
    summary,
    (node) => node.type === 'div' && String(node.props?.className || '').includes('items-center'),
  );
  assert.ok(summaryRow, 'expected selected summary content to stay on one centered row');
});

test('runtime ops run picker shows loading copy instead of empty-state text while runs are still loading', async () => {
  const { RuntimeOpsRunPicker } = await loadRunPickerModule();
  const tree = renderElement(RuntimeOpsRunPicker({
    runs: [],
    value: '',
    onChange: () => {},
    isLoading: true,
    isRefreshing: false,
  }));

  const text = flattenText(tree);
  assert.match(text, /Loading runs/i);
  assert.doesNotMatch(text, /No runs yet/i);
});

test('runtime ops run picker keeps the selected row visible without showing inline loading or status text when a row is already present', async () => {
  const { RuntimeOpsRunPicker } = await loadRunPickerModule();
  const tree = renderElement(RuntimeOpsRunPicker({
    runs: [
      {
        run_id: '20260318061504-16a0b3',
        category: 'mouse',
        product_id: 'mouse-razer-viper-v3-pro-white',
        status: 'running',
        picker_label: 'Mouse \u2022 Razer Viper V3 Pro White - 6a0b3',
        storage_origin: 's3',
        storage_state: 'live',
      },
    ],
    value: '20260318061504-16a0b3',
    onChange: () => {},
    isLoading: true,
    isRefreshing: false,
  }));

  const text = flattenText(tree);
  assert.match(text, /Razer Viper V3 Pro White/);
  assert.match(text, /\bLive\b/);
  assert.doesNotMatch(text, /Loading runs/i);
  assert.doesNotMatch(text, /spinner/i);
  assert.doesNotMatch(text, /\brunning\b/i);
});

test('runtime ops run picker does not duplicate the category when identity is missing', async () => {
  const { RuntimeOpsRunPicker } = await loadRunPickerModule();
  const tree = renderElement(RuntimeOpsRunPicker({
    runs: [
      {
        run_id: '20260318-bff1e',
        category: 'mouse',
        product_id: '',
        status: 'completed',
        picker_label: 'Mouse - bff1e',
        storage_origin: 's3',
        storage_state: 'stored',
      },
    ],
    value: '20260318-bff1e',
    onChange: () => {},
    isLoading: false,
    isRefreshing: false,
  }));

  const summary = findFirst(tree, (node) => node.type === 'summary');
  const summaryText = flattenText(summary);
  assert.match(summaryText, /\bMouse\b/);
  assert.match(summaryText, /\bbff1e\b/);
  assert.doesNotMatch(summaryText, /\bMouse\s+Mouse\b/);
});

test('runtime ops run picker gives local origin its own badge class separate from stored state', async () => {
  const { RuntimeOpsRunPicker } = await loadRunPickerModule();
  const tree = renderElement(RuntimeOpsRunPicker({
    runs: [
      {
        run_id: '20260317-bcdefg2',
        category: 'mouse',
        product_id: 'mouse-logitech-g-pro-x-superlight-2',
        status: 'completed',
        picker_label: 'Mouse • Logitech G Pro X Superlight 2 - cdefg',
        storage_origin: 'local',
        storage_state: 'stored',
      },
    ],
    value: '20260317-bcdefg2',
    onChange: () => {},
    isLoading: false,
    isRefreshing: false,
  }));

  const localBadge = findFirst(
    tree,
    (node) => node.type === 'span' && flattenText(node) === 'Local',
  );
  const storedBadge = findFirst(
    tree,
    (node) => node.type === 'span' && flattenText(node) === 'Stored',
  );

  assert.ok(localBadge, 'expected a Local origin badge');
  assert.ok(storedBadge, 'expected a Stored state badge');
  assert.match(String(localBadge.props?.className || ''), /sf-chip-teal-strong/);
  assert.match(String(storedBadge.props?.className || ''), /sf-chip-neutral/);
});
