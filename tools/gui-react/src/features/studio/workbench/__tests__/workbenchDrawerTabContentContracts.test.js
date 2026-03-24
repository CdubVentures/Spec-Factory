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

async function loadWorkbenchDrawerTabContentModule() {
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
        './WorkbenchDrawerTabPanels': `
          export function ContractTab(props) {
            return { type: 'ContractTab', props };
          }
          export function ParseTab(props) {
            return { type: 'ParseTab', props };
          }
          export function EnumTab(props) {
            return { type: 'EnumTab', props };
          }
          export function EvidenceTab(props) {
            return { type: 'EvidenceTab', props };
          }
          export function SearchTab(props) {
            return { type: 'SearchTab', props };
          }
          export function DepsTab(props) {
            return { type: 'DepsTab', props };
          }
          export function PreviewTab(props) {
            return { type: 'PreviewTab', props };
          }
        `,
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
    consistencyPending: false,
    consistencyMessage: '',
    consistencyError: '',
    onRunConsistency: async () => {},
    onUpdate() {},
    onNavigate() {},
    B() {
      return { type: 'BadgeSlot', props: {} };
    },
  };
}

test('WorkbenchDrawerTabContent routes contract tab props without rendering unrelated tabs', async () => {
  const { WorkbenchDrawerTabContent } = await loadWorkbenchDrawerTabContentModule();

  const tree = renderNode(
    WorkbenchDrawerTabContent({
      ...buildBaseProps(),
      activeTab: 'contract',
    }),
  );

  const contractNode = collectNodes(tree, (node) => node.type === 'ContractTab')[0];
  const parseNode = collectNodes(tree, (node) => node.type === 'ParseTab')[0];

  assert.ok(contractNode);
  assert.equal(contractNode.props.fieldKey, 'dpi');
  assert.equal(contractNode.props.rule.priority.required_level, 'required');
  assert.equal(typeof contractNode.props.onUpdate, 'function');
  assert.equal(parseNode, undefined);
});

test('WorkbenchDrawerTabContent routes enum and preview tabs with their feature data', async () => {
  const { WorkbenchDrawerTabContent } = await loadWorkbenchDrawerTabContentModule();

  const enumTree = renderNode(
    WorkbenchDrawerTabContent({
      ...buildBaseProps(),
      activeTab: 'enum',
      consistencyPending: true,
      consistencyMessage: 'applied',
    }),
  );
  const enumNode = collectNodes(enumTree, (node) => node.type === 'EnumTab')[0];

  assert.ok(enumNode);
  assert.equal(enumNode.props.category, 'mouse');
  assert.equal(enumNode.props.consistencyPending, true);
  assert.equal(enumNode.props.consistencyMessage, 'applied');

  const previewTree = renderNode(
    WorkbenchDrawerTabContent({
      ...buildBaseProps(),
      activeTab: 'preview',
    }),
  );
  const previewNode = collectNodes(previewTree, (node) => node.type === 'PreviewTab')[0];

  assert.ok(previewNode);
  assert.equal(previewNode.props.fieldKey, 'dpi');
  assert.deepEqual(previewNode.props.knownValues, { dpi: ['800'] });
  assert.equal(previewNode.props.componentDb.sensor[0].name, 'Hero');
});

test('WorkbenchDrawerTabContent routes deps tab with navigation and component-source inputs', async () => {
  const { WorkbenchDrawerTabContent } = await loadWorkbenchDrawerTabContentModule();
  const onNavigate = () => {};

  const tree = renderNode(
    WorkbenchDrawerTabContent({
      ...buildBaseProps(),
      activeTab: 'deps',
      onNavigate,
    }),
  );

  const depsNode = collectNodes(tree, (node) => node.type === 'DepsTab')[0];
  const searchNode = collectNodes(tree, (node) => node.type === 'SearchTab')[0];

  assert.ok(depsNode);
  assert.equal(depsNode.props.fieldKey, 'dpi');
  assert.equal(depsNode.props.onNavigate, onNavigate);
  assert.equal(depsNode.props.componentSources[0].component_type, 'sensor');
  assert.equal(searchNode, undefined);
});
