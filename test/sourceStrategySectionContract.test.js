import test from 'node:test';
import assert from 'node:assert/strict';

import { loadBundledModule } from './helpers/loadBundledModule.js';

function createSourceDraft() {
  return {
    host: '',
    display_name: '',
    tier: 'tier2_lab',
    authority: 'unknown',
    base_url: '',
    content_types: '',
    doc_kinds: '',
    crawl_config: {
      method: 'http',
      rate_limit_ms: '2000',
      timeout_ms: '12000',
      robots_txt_compliant: 'true',
    },
    field_coverage: {
      high: '',
      medium: '',
      low: '',
    },
    discovery: {
      method: 'search_first',
      source_type: '',
      search_pattern: '',
      priority: '50',
      enabled: 'true',
      notes: '',
    },
  };
}

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

function textContent(node) {
  if (Array.isArray(node)) {
    return node.map(textContent).join('');
  }
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node !== 'object') {
    return String(node);
  }
  return textContent(node.props?.children);
}

async function loadSectionModule() {
  return loadBundledModule('tools/gui-react/src/features/pipeline-settings/sections/PipelineSourceStrategySection.tsx', {
    prefix: 'source-strategy-section-contract-',
    stubs: {
      react: `
        export function useState(initialValue) {
          const value = typeof initialValue === 'function' ? initialValue() : initialValue;
          return [value, () => {}];
        }
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
      '../components/PipelineSettingsPageShell': `
        export function SectionNavIcon() {
          return { type: 'span', props: { children: 'icon' } };
        }
      `,
    },
  });
}

function renderSection(PipelineSourceStrategySection, overrides = {}) {
  return renderElement(PipelineSourceStrategySection({
    category: 'mouse',
    isAll: false,
    sourceStrategyHydrated: true,
    sourceStrategyEntries: [],
    sourceStrategyLoading: false,
    sourceStrategyErrorMessage: '',
    sourceStrategySaving: false,
    sourceDraftMode: null,
    sourceDraft: createSourceDraft(),
    sourceInputCls: 'sf-input',
    onToggleEntry() {},
    onEditEntry() {},
    onDeleteEntry() {},
    onUpdateSourceDraft() {},
    onSaveEntryDraft() {},
    onCancelSourceDraft() {},
    ...overrides,
  }));
}

test('PipelineSourceStrategySection renders explicit category guidance in all-categories scope', async () => {
  const { PipelineSourceStrategySection } = await loadSectionModule();
  const tree = renderSection(PipelineSourceStrategySection, {
    category: 'all',
    isAll: true,
    sourceStrategyHydrated: false,
  });

  const text = textContent(tree);
  assert.equal(text.includes('Source strategy is configured per category.'), true);
  assert.equal(text.includes('Select a specific category to manage source strategy entries.'), true);
  assert.equal(
    text.includes('Switch the sidebar category from All Categories to a specific category'),
    true,
  );
});

test('PipelineSourceStrategySection renders load failures directly to the operator', async () => {
  const { PipelineSourceStrategySection } = await loadSectionModule();
  const tree = renderSection(PipelineSourceStrategySection, {
    sourceStrategyErrorMessage: 'backend unavailable',
  });

  const text = textContent(tree);
  assert.equal(text.includes('Unable to load source strategy.'), true);
  assert.equal(text.includes('backend unavailable'), true);
});

test('PipelineSourceStrategySection tolerates malformed source rows when deriving host labels', async () => {
  const { PipelineSourceStrategySection } = await loadSectionModule();
  const tree = renderSection(PipelineSourceStrategySection, {
    sourceStrategyEntries: [
      {
        sourceId: 'rtings_com',
        display_name: '',
        tier: '',
        authority: '',
        base_url: 'not a real url',
        content_types: [],
        doc_kinds: [],
        crawl_config: {},
        field_coverage: {},
        discovery: {},
      },
    ],
  });

  const text = textContent(tree);
  assert.equal(text.includes('rtings.com'), true);
  assert.equal(text.includes('rtings_com'), true);
  assert.equal(text.includes('Unknown'), true);
  assert.equal(text.includes('manual'), true);
  assert.equal(text.includes('50'), true);
  assert.equal(text.includes('OFF'), true);
});
