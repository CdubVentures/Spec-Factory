import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from '../../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderNode(node) {
  if (Array.isArray(node)) {
    return node.map(renderNode);
  }
  if (node == null || typeof node !== 'object') {
    return node;
  }
  if (typeof node.type === 'function') {
    return renderNode(node.type(node.props || {}));
  }
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
    for (const child of node) {
      collectNodes(child, predicate, results);
    }
    return results;
  }
  if (node == null || typeof node !== 'object') {
    return results;
  }
  if (predicate(node)) {
    results.push(node);
  }
  collectNodes(node.props?.children, predicate, results);
  return results;
}

function makeBodyStub(name) {
  return `export function ${name}(props) { return { type: '${name}', props }; }`;
}

async function loadWorkbenchDrawerTabContentModule() {
  const bodyNames = [
    'KeyContractBody',
    'KeyPriorityBody',
    'KeyAiAssistBody',
    'KeyEnumBody',
    'KeyConstraintsBody',
    'KeyEvidenceBody',
    'KeyTooltipBody',
    'KeySearchHintsBody',
  ];
  return loadBundledModule(
    'tools/gui-react/src/features/studio/workbench/WorkbenchDrawerTabContent.tsx',
    {
      prefix: 'workbench-drawer-tab-content-',
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
        '../state/studioFieldRulesController.ts': `
          export function useStudioFieldRulesState() {
            return { editedRules: {} };
          }
        `,
        './WorkbenchDrawerTabPanels.tsx': bodyNames.map(makeBodyStub).join('\n'),
      },
    },
  );
}

function buildBaseProps() {
  return {
    category: 'mouse',
    fieldKey: 'dpi',
    rule: { priority: { required_level: 'required' } },
    knownValues: { dpi: ['800'] },
    enumLists: [{ field: 'dpi', values: ['800'] }],
    componentDb: { sensor: [{ name: 'Hero', maker: 'Logitech', aliases: [] }] },
    componentSources: [{ component_type: 'sensor', roles: { properties: [] } }],
    fieldOrder: ['dpi', 'weight'],
    onUpdate() {},
    onNavigate() {},
    B() {
      return { type: 'BadgeSlot', props: {} };
    },
  };
}

const TAB_TO_BODY = [
  ['contract', 'KeyContractBody'],
  ['priority', 'KeyPriorityBody'],
  ['aiAssist', 'KeyAiAssistBody'],
  ['enum', 'KeyEnumBody'],
  ['constraints', 'KeyConstraintsBody'],
  ['evidence', 'KeyEvidenceBody'],
  ['tooltip', 'KeyTooltipBody'],
  ['search', 'KeySearchHintsBody'],
];

for (const [tabId, bodyName] of TAB_TO_BODY) {
  test(`WorkbenchDrawerTabContent routes ${tabId} tab to ${bodyName}`, async () => {
    const { WorkbenchDrawerTabContent } = await loadWorkbenchDrawerTabContentModule();

    const tree = renderNode(
      WorkbenchDrawerTabContent({
        ...buildBaseProps(),
        activeTab: tabId,
      }),
    );

    const matched = collectNodes(tree, (node) => node.type === bodyName);
    assert.equal(matched.length, 1, `${tabId} should render exactly one ${bodyName}`);
    assert.equal(matched[0].props.selectedKey, 'dpi');
    assert.equal(typeof matched[0].props.updateField, 'function');

    // Ensure no other body slipped through
    for (const [, otherBody] of TAB_TO_BODY) {
      if (otherBody === bodyName) continue;
      const others = collectNodes(tree, (node) => node.type === otherBody);
      assert.equal(others.length, 0, `${tabId} should NOT render ${otherBody}`);
    }
  });
}

test('WorkbenchDrawerTabContent threads enum-specific data into the Enum tab', async () => {
  const { WorkbenchDrawerTabContent } = await loadWorkbenchDrawerTabContentModule();

  const tree = renderNode(
    WorkbenchDrawerTabContent({
      ...buildBaseProps(),
      activeTab: 'enum',
    }),
  );

  const enumNode = collectNodes(tree, (node) => node.type === 'KeyEnumBody')[0];
  assert.ok(enumNode);
  assert.deepEqual(enumNode.props.knownValues, { dpi: ['800'] });
  assert.equal(enumNode.props.enumLists[0].field, 'dpi');
});

test('WorkbenchDrawerTabContent threads constraints data into the Constraints tab', async () => {
  const { WorkbenchDrawerTabContent } = await loadWorkbenchDrawerTabContentModule();

  const tree = renderNode(
    WorkbenchDrawerTabContent({
      ...buildBaseProps(),
      activeTab: 'constraints',
    }),
  );

  const node = collectNodes(tree, (n) => n.type === 'KeyConstraintsBody')[0];
  assert.ok(node);
  assert.deepEqual(node.props.fieldOrder, ['dpi', 'weight']);
});
