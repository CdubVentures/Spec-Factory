import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBundledModule } from '../../../../../../src/shared/tests/helpers/loadBundledModule.js';

function renderElement(element) {
  if (Array.isArray(element)) return element.map(renderElement);
  if (element == null || typeof element !== 'object') return element;
  if (typeof element.type === 'function') return renderElement(element.type(element.props || {}));
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

function visitAll(element, predicate) {
  const results = [];
  function visit(node) {
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (node == null || typeof node !== 'object') return;
    const rendered = typeof node.type === 'function' ? renderElement(node) : node;
    if (predicate(rendered)) results.push(rendered);
    visit(rendered.props?.children);
    visit(renderElement(rendered.props?.element));
    visit(renderElement(rendered.props?.fallback));
  }
  visit(renderElement(element));
  return results;
}

function hasAppShellSkeleton(element) {
  return visitAll(element, (node) => node.props?.['data-testid'] === 'app-shell-loading-skeleton').length > 0;
}

async function loadAppModule() {
  return loadBundledModule('tools/gui-react/src/App.tsx', {
    prefix: 'app-route-fallback-skeleton-',
    stubs: {
      react: `
        export const Suspense = Symbol.for('react.suspense');
        export function lazy(loader) {
          function LazyStub(props) {
            return { type: 'lazy', props: { ...(props || {}), loader } };
          }
          LazyStub.preload = loader;
          return LazyStub;
        }
      `,
      '@tanstack/react-query': `
        export function QueryClientProvider(props) {
          return { type: 'QueryClientProvider', props: { children: props.children } };
        }
      `,
      'react-router-dom': `
        export function HashRouter(props) {
          return { type: 'HashRouter', props: { children: props.children } };
        }
        export function Routes(props) {
          return { type: 'Routes', props: { children: props.children } };
        }
        export function Route(props) {
          return { type: 'Route', props };
        }
        export function Link(props) {
          return { type: 'Link', props };
        }
        export function Outlet(props) {
          return { type: 'Outlet', props };
        }
      `,
      './pages/layout/AppShell.tsx': `
        export function AppShell() {
          return { type: 'AppShell', props: {} };
        }
      `,
      './shared/ui/feedback/ErrorBoundary.tsx': `
        export function ErrorBoundary(props) {
          return props.children;
        }
      `,
      './shared/ui/feedback/GlobalNotifications.tsx': `
        export function GlobalNotifications() {
          return null;
        }
      `,
      './registries/pageRegistry.ts': `
        export const ROUTE_ENTRIES = [{
          path: '/',
          isIndex: true,
          exportName: 'OverviewPage',
          loader: async () => ({ OverviewPage: function OverviewPage() { return null; } }),
        }];
      `,
      './api/ws.ts': `
        export const wsManager = { onReconnect() {} };
      `,
      './api/client.ts': `
        export const api = { get: async () => [] };
      `,
      './api/queryClient.ts': `
        export const queryClient = { invalidateQueries() {} };
      `,
      './features/operations/state/operationsStore.ts': `
        export const useOperationsStore = {
          getState() {
            return { upsert() {} };
          },
        };
      `,
    },
  });
}

describe('App route loading fallback', () => {
  it('uses the app-shell page skeleton for every lazy route Suspense fallback', async () => {
    const { default: App } = await loadAppModule();
    const tree = renderElement(App({}));

    const suspenseNodes = visitAll(tree, (node) =>
      node.props && Object.prototype.hasOwnProperty.call(node.props, 'fallback'),
    );

    assert.equal(suspenseNodes.length, 2);
    assert.equal(suspenseNodes.every((node) => hasAppShellSkeleton(node.props.fallback)), true);
  });
});
