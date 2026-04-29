import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderElement(element) {
  if (Array.isArray(element)) {
    return element.map(renderElement);
  }
  if (element == null || typeof element !== 'object') {
    return element;
  }
  if (typeof element.type === 'function') {
    return renderElement(element.type(element.props || {}));
  }
  const nextChildren = element.props && Object.prototype.hasOwnProperty.call(element.props, 'children')
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

function textContent(node) {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (typeof node !== 'object') return '';
  return textContent(node.props?.children);
}

function candidate(value, quote) {
  return {
    candidate_id: `fc-${value}`,
    value,
    score: 0.95,
    source_id: 'key-finder',
    source: 'key_finder',
    tier: null,
    method: 'finder',
    status: 'resolved',
    evidence: {
      url: 'https://example.test/spec',
      retrieved_at: '2026-04-28T00:00:00.000Z',
      snippet_id: 'snippet-1',
      snippet_hash: 'hash-1',
      quote,
      quote_span: null,
      snippet_text: '',
      source_id: 'key_finder',
    },
  };
}

function propertyState(candidates) {
  return {
    selected: { value: null, confidence: 0, status: 'unknown', color: 'gray' },
    needs_review: false,
    reason_codes: [],
    source: 'unknown',
    source_timestamp: null,
    variance_policy: null,
    constraints: [],
    overridden: false,
    candidate_count: candidates.length,
    candidates,
    accepted_candidate_id: null,
    enum_values: null,
    enum_policy: null,
  };
}

function buildItem() {
  const linkCandidates = [candidate('https://datasheet.example/paw3950.pdf', 'Official PAW3950 datasheet link')];
  const dpiCandidates = [candidate('35000', 'Sensor supports up to 35000 DPI')];
  return {
    component_identity_id: 1,
    name: 'PAW3950',
    maker: 'PixArt',
    aliases: [],
    aliases_overridden: false,
    links: [],
    name_tracked: propertyState([]),
    maker_tracked: propertyState([]),
    links_tracked: [],
    links_state: propertyState(linkCandidates),
    properties: {
      dpi_max: propertyState(dpiCandidates),
    },
    linked_products: [{
      product_id: 'mouse-a',
      field_key: 'sensor',
      match_type: 'exact',
      match_score: 1,
      field_counts: {
        sensor: { published_count: 1, candidate_count: 2, evidence_count: 3 },
        sensor_brand: { published_count: 1, candidate_count: 1, evidence_count: 2 },
      },
    }],
    review_status: 'pending',
    metrics: { confidence: 0, flags: 0, property_count: 1 },
  };
}

async function loadDrawerModule() {
  return loadBundledModule('tools/gui-react/src/pages/component-review/ComponentReviewDrawer.tsx', {
    prefix: 'component-review-drawer-published-values-',
    stubs: {
      react: [
        'export function useMemo(factory) { return factory(); }',
        'export function useState(initial) { return [typeof initial === "function" ? initial() : initial, () => {}]; }',
        'export default { useMemo, useState };',
      ].join('\n'),
      'react/jsx-runtime': [
        'export const Fragment = Symbol.for("fragment");',
        'export function jsx(type, props) { return { type, props: props || {} }; }',
        'export const jsxs = jsx;',
      ].join('\n'),
      '@tanstack/react-query': [
        'export function useMutation() { return { isPending: false, mutate() {} }; }',
        'export class QueryClient {}',
      ].join('\n'),
      '../../api/client.ts': 'export const api = { post() { return Promise.resolve({}); } };',
      '../../hooks/useFieldLabels.ts': 'export function useFieldLabels() { return { getLabel: (key) => key }; }',
      './componentReviewCache.ts': [
        'export function buildComponentReviewGridLinkedProducts() { return []; }',
        'export function cancelLinkedReviewProductFields() { return Promise.resolve(); }',
        'export function restoreLinkedReviewProductFields() {}',
        'export function updateLinkedReviewProductFields() { return undefined; }',
      ].join('\n'),
      './componentImpactInvalidation.ts': 'export function invalidateComponentImpactForCategory() {}',
    },
  });
}

describe('ComponentReviewDrawer published value lanes', () => {
  it('labels the links drawer evidence list as published product values', async () => {
    const { ComponentReviewDrawer } = await loadDrawerModule();
    const tree = renderElement(ComponentReviewDrawer({
      item: buildItem(),
      componentType: 'sensor',
      category: 'mouse',
      onClose: () => {},
      queryClient: {},
      focusedProperty: '__links',
    }));
    const text = textContent(tree);

    assert.match(text, /Published Product Values \(1\)/);
    assert.doesNotMatch(text, /Candidates \(1\)/);
    assert.match(text, /Official PAW3950 datasheet link/);
  });

  it('labels linked attribute drawer evidence as published product values', async () => {
    const { ComponentReviewDrawer } = await loadDrawerModule();
    const tree = renderElement(ComponentReviewDrawer({
      item: buildItem(),
      componentType: 'sensor',
      category: 'mouse',
      onClose: () => {},
      queryClient: {},
      focusedProperty: 'dpi_max',
    }));
    const text = textContent(tree);

    assert.match(text, /Published Product Values \(1\)/);
    assert.doesNotMatch(text, /Candidates \(1\)/);
    assert.match(text, /Sensor supports up to 35000 DPI/);
  });

  it('labels component-only attribute drawer as component review candidates instead of published product values', async () => {
    const { ComponentReviewDrawer } = await loadDrawerModule();
    const item = buildItem();
    item.properties.sensor_family = {
      ...propertyState([]),
      component_only: true,
    };
    const tree = renderElement(ComponentReviewDrawer({
      item,
      componentType: 'sensor',
      category: 'mouse',
      onClose: () => {},
      queryClient: {},
      focusedProperty: 'sensor_family',
    }));
    const text = textContent(tree);

    assert.match(text, /Component Review Candidates \(0\)/);
    assert.doesNotMatch(text, /Published Product Values/);
    assert.match(text, /No component review candidates found for this component attribute yet/);
  });

  it('shows attached products and PCE support counts in identity drawers', async () => {
    const { ComponentReviewDrawer } = await loadDrawerModule();
    const tree = renderElement(ComponentReviewDrawer({
      item: buildItem(),
      componentType: 'sensor',
      category: 'mouse',
      onClose: () => {},
      queryClient: {},
      focusedProperty: '__name',
    }));
    const text = textContent(tree);

    assert.match(text, /Attached Items \(1\)/);
    assert.match(text, /P1 C2 E3/);
    assert.match(text, /mouse-a/);
  });
});
