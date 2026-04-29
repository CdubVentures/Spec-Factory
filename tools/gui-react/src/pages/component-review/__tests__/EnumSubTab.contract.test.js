import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderElement(element) {
  if (Array.isArray(element)) return element.map(renderElement);
  if (element == null || typeof element !== 'object') return element;
  if (typeof element.type === 'function') return renderElement(element.type(element.props || {}));
  const nextChildren = Object.prototype.hasOwnProperty.call(element.props || {}, 'children')
    ? renderElement(element.props.children)
    : element.props?.children;
  return {
    ...element,
    props: {
      ...(element.props || {}),
      children: nextChildren,
    },
  };
}

function findAll(element, predicate) {
  const results = [];
  function visit(node) {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (node == null || typeof node !== 'object') return;
    if (predicate(node)) results.push(node);
    visit(node.props?.children);
  }
  visit(element);
  return results;
}

function firstByRegion(tree, region) {
  return findAll(tree, (node) => node.props?.['data-region'] === region)[0] ?? null;
}

function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  return textContent(node.props?.children);
}

function makeQueryClientDouble() {
  return {
    invalidateQueries() {},
    cancelQueries() {},
    getQueryData() {
      return undefined;
    },
    setQueryData() {},
  };
}

function makeEnumPayload() {
  return {
    category: 'mouse',
    fields: [
      {
        field: 'sensor',
        enum_list_id: 12,
        metrics: { total: 3, flags: 1 },
        values: [
          {
            list_value_id: 100,
            enum_list_id: 12,
            value: 'PixArt PAW3395',
            source: 'manual',
            confidence: 1,
            color: 'green',
            needs_review: false,
            candidates: [],
          },
          {
            list_value_id: 101,
            enum_list_id: 12,
            value: 'Hero 2',
            source: 'pipeline',
            confidence: 0.6,
            color: 'yellow',
            needs_review: true,
            candidates: [{ candidate_id: 'candidate-hero-2', value: 'Hero 2', source_id: 'pipeline' }],
            linked_products: [{ product_id: 'mouse-1', field_key: 'sensor' }],
          },
          {
            list_value_id: 102,
            enum_list_id: 12,
            value: 'Focus Pro 35K',
            source: 'known_values',
            confidence: 1,
            color: 'green',
            needs_review: false,
            candidates: [],
          },
        ],
      },
    ],
  };
}

function makeLockedColorEnumPayload() {
  return {
    category: 'mouse',
    fields: [
      {
        field: 'colors',
        enum_list_id: 90,
        locked: true,
        metrics: { total: 1, flags: 0 },
        values: [
          {
            list_value_id: 900,
            enum_list_id: 90,
            value: 'black',
            source: 'reference',
            confidence: 1,
            color: 'green',
            needs_review: false,
            candidates: [],
          },
        ],
      },
    ],
  };
}

async function loadEnumSubTab() {
  globalThis.__enumSubTabStoreState = {
    selectedEnumField: 'sensor',
    enumDrawerOpen: false,
    selectedEnumValue: '',
  };
  globalThis.__enumSubTabApiPosts = [];

  return loadBundledModule('tools/gui-react/src/pages/component-review/EnumSubTab.tsx', {
    prefix: 'enum-sub-tab-contract-',
    stubs: {
      '../../api/client.ts': `
        export const api = {
          async post(path, body) {
            globalThis.__enumSubTabApiPosts.push({ path, body });
            return { ok: true };
          },
        };
      `,
      '../../hooks/useFieldLabels.ts': `
        function humanize(key) {
          return String(key || '').replace(/_/g, ' ').replace(/\\b\\w/g, (c) => c.toUpperCase());
        }
        export function useFieldLabels() {
          return { labels: {}, getLabel: humanize };
        }
      `,
      '../../stores/componentReviewStore.ts': `
        const state = globalThis.__enumSubTabStoreState;
        function actions() {
          return {
            ...state,
            setSelectedEnumField(field) { state.selectedEnumField = field; },
            openEnumDrawer(field, value) {
              state.selectedEnumField = field;
              state.selectedEnumValue = value;
              state.enumDrawerOpen = true;
            },
            closeEnumDrawer() { state.enumDrawerOpen = false; },
          };
        }
        export function useComponentReviewStore(selector) {
          const snapshot = actions();
          return typeof selector === 'function' ? selector(snapshot) : snapshot;
        }
      `,
      '../../features/studio/state/useFieldRulesStore.ts': `
        export function useFieldRulesStore(selector) {
          const state = { egLockedKeys: [] };
          return typeof selector === 'function' ? selector(state) : state;
        }
      `,
    },
  });
}

test('EnumSubTab shows only manual and discovered enum value groups', async () => {
  const { EnumSubTab } = await loadEnumSubTab();
  const tree = renderElement(EnumSubTab({
    data: makeEnumPayload(),
    category: 'mouse',
    queryClient: makeQueryClientDouble(),
  }));

  const manualSection = firstByRegion(tree, 'enum-review-manual-values');
  const discoveredSection = firstByRegion(tree, 'enum-review-discovered-values');
  assert.ok(manualSection, 'manual values section should render');
  assert.ok(discoveredSection, 'discovered values section should render');

  assert.match(textContent(manualSection), /Manual values/i);
  assert.match(textContent(manualSection), /PixArt PAW3395/);
  assert.match(textContent(manualSection), /Focus Pro 35K/);
  assert.doesNotMatch(textContent(manualSection), /Hero 2/);

  assert.match(textContent(discoveredSection), /Discovered values/i);
  assert.match(textContent(discoveredSection), /Hero 2/);
  assert.doesNotMatch(textContent(discoveredSection), /PixArt PAW3395/);

  const allText = textContent(tree);
  assert.doesNotMatch(allText, /Run AI/i);
  assert.doesNotMatch(allText, /Flags?/i);
  assert.doesNotMatch(allText, /Published/i);
  assert.doesNotMatch(allText, /Confidence/i);
  assert.doesNotMatch(allText, /needs review/i);
  assert.doesNotMatch(allText, /Add new value/i);
});

test('EnumSubTab drawer only edits the selected value and warns about propagation', async () => {
  globalThis.__enumSubTabStoreState = {
    selectedEnumField: 'sensor',
    enumDrawerOpen: true,
    selectedEnumValue: 'Hero 2',
  };
  const { EnumSubTab } = await loadEnumSubTab();
  globalThis.__enumSubTabStoreState.selectedEnumField = 'sensor';
  globalThis.__enumSubTabStoreState.enumDrawerOpen = true;
  globalThis.__enumSubTabStoreState.selectedEnumValue = 'Hero 2';

  const tree = renderElement(EnumSubTab({
    data: makeEnumPayload(),
    category: 'mouse',
    queryClient: makeQueryClientDouble(),
  }));

  const drawer = firstByRegion(tree, 'enum-review-value-drawer');
  assert.ok(drawer, 'value drawer should render');
  const drawerText = textContent(drawer);
  assert.match(drawerText, /^\s*Value\s+/);
  assert.match(drawerText, /propagate to all affected/i);
  assert.doesNotMatch(drawerText, /Run AI/i);
  assert.doesNotMatch(drawerText, /Flags?/i);
  assert.doesNotMatch(drawerText, /Linked products/i);

  const form = findAll(drawer, (node) => node.type === 'form')[0];
  assert.ok(form, 'drawer should expose a value edit form');
  await form.props.onSubmit({
    preventDefault() {},
    currentTarget: {
      elements: {
        enumValue: { value: 'Hero 3' },
      },
    },
  });

  assert.deepEqual(globalThis.__enumSubTabApiPosts, [
    {
      path: '/review-components/mouse/enum-rename',
      body: {
        field: 'sensor',
        oldValue: 'Hero 2',
        newValue: 'Hero 3',
        listValueId: 101,
        enumListId: 12,
      },
    },
  ]);
});

test('EnumSubTab drawer deletes the selected enum value after confirmation', async () => {
  const originalConfirm = globalThis.confirm;
  globalThis.__enumSubTabConfirms = [];
  const { EnumSubTab } = await loadEnumSubTab();
  globalThis.__enumSubTabStoreState.selectedEnumField = 'sensor';
  globalThis.__enumSubTabStoreState.enumDrawerOpen = true;
  globalThis.__enumSubTabStoreState.selectedEnumValue = 'Hero 2';
  globalThis.confirm = (message) => {
    globalThis.__enumSubTabConfirms.push(String(message || ''));
    return true;
  };

  try {
    const tree = renderElement(EnumSubTab({
      data: makeEnumPayload(),
      category: 'mouse',
      queryClient: makeQueryClientDouble(),
    }));

    const drawer = firstByRegion(tree, 'enum-review-value-drawer');
    assert.ok(drawer, 'value drawer should render');
    const deleteButton = findAll(drawer, (node) => node.type === 'button' && /Delete value/i.test(textContent(node)))[0];
    assert.ok(deleteButton, 'drawer should expose a delete value button');

    await deleteButton.props.onClick();

    assert.match(globalThis.__enumSubTabConfirms[0], /unpublish affected items/i);
    assert.deepEqual(globalThis.__enumSubTabApiPosts, [
      {
        path: '/review-components/mouse/enum-delete',
        body: {
          field: 'sensor',
          value: 'Hero 2',
          listValueId: 101,
          enumListId: 12,
        },
      },
    ]);
  } finally {
    if (originalConfirm === undefined) {
      delete globalThis.confirm;
    } else {
      globalThis.confirm = originalConfirm;
    }
    delete globalThis.__enumSubTabConfirms;
  }
});

test('EnumSubTab keeps payload-locked color registry fields read-only without studio store hydration', async () => {
  globalThis.__enumSubTabStoreState = {
    selectedEnumField: 'colors',
    enumDrawerOpen: false,
    selectedEnumValue: '',
  };
  const { EnumSubTab } = await loadEnumSubTab();
  globalThis.__enumSubTabStoreState.selectedEnumField = 'colors';
  globalThis.__enumSubTabStoreState.enumDrawerOpen = false;
  globalThis.__enumSubTabStoreState.selectedEnumValue = '';

  const tree = renderElement(EnumSubTab({
    data: makeLockedColorEnumPayload(),
    category: 'mouse',
    queryClient: makeQueryClientDouble(),
  }));

  assert.match(textContent(tree), /Read-only/);

  const rows = findAll(tree, (node) => node.props?.['data-region'] === 'enum-review-value-row');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].props.disabled, true);

  rows[0].props.onClick();

  assert.equal(globalThis.__enumSubTabStoreState.enumDrawerOpen, false);
  assert.deepEqual(globalThis.__enumSubTabApiPosts, []);
});
