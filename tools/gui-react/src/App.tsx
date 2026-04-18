import { lazy, Suspense, type ComponentType } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './pages/layout/AppShell.tsx';
import { ErrorBoundary } from './shared/ui/feedback/ErrorBoundary.tsx';
import { Spinner } from './shared/ui/feedback/Spinner.tsx';
import { ROUTE_ENTRIES } from './registries/pageRegistry.ts';

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
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
    </QueryClientProvider>
  );
}
