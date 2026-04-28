import { lazy, Suspense, type ComponentType } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './pages/layout/AppShell.tsx';
import { ErrorBoundary } from './shared/ui/feedback/ErrorBoundary.tsx';
import { GlobalNotifications } from './shared/ui/feedback/GlobalNotifications.tsx';
import { Spinner } from './shared/ui/feedback/Spinner.tsx';
import { ROUTE_ENTRIES } from './registries/pageRegistry.ts';
import { wsManager } from './api/ws.ts';
import { api } from './api/client.ts';
import { queryClient } from './api/queryClient.ts';
import { useOperationsStore, type OperationUpsert } from './features/operations/state/operationsStore.ts';

function lazyNamedPage(loader: () => Promise<Record<string, unknown>>, exportName: string) {
  return lazy(async () => {
    const module = await loader();
    const component = module[exportName];
    if (typeof component !== 'function') {
      throw new Error(`Lazy page export "${exportName}" was not found.`);
    }
    return { default: component as ComponentType };
  });
}

const TestModePage = lazyNamedPage(() => import('./pages/test-mode/TestModePage.tsx'), 'TestModePage');

// WHY: Computed once at module scope so lazy components are created once, not per render.
const LAZY_ROUTES = ROUTE_ENTRIES.map((entry) => ({
  ...entry,
  Component: lazyNamedPage(entry.loader, entry.exportName),
}));

// WHY: Soft reconnect wiring. On WS reconnect (after server restart, idle
// watchdog fire, or transient network drop) invalidate every active React
// Query + rehydrate the operations store. Preserves zustand UI state (filters,
// open modals, scroll) that a full page reload would destroy.
wsManager.onReconnect(() => {
  queryClient.invalidateQueries();
  api.get<OperationUpsert[]>('/operations')
    .then((ops) => {
      const upsert = useOperationsStore.getState().upsert;
      for (const op of ops) upsert(op);
    })
    .catch(() => { /* best effort — WS broadcasts will repopulate as ops progress */ });
});

function wrap(Component: ComponentType) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner className="h-8 w-8 mx-auto mt-12" />}>
        <Component />
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            {LAZY_ROUTES.map((entry) =>
              entry.isIndex
                ? <Route key={entry.path} index element={wrap(entry.Component)} />
                : <Route key={entry.path} path={entry.path.slice(1)} element={wrap(entry.Component)} />,
            )}
            <Route path="test-mode" element={wrap(TestModePage)} />
          </Route>
        </Routes>
      </HashRouter>
      <GlobalNotifications />
    </QueryClientProvider>
  );
}
