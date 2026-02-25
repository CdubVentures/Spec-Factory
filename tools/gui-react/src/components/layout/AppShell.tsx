import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { TabNav } from './TabNav';
import { Sidebar } from './Sidebar';
import { api } from '../../api/client';
import { useUiStore } from '../../stores/uiStore';
import { useRuntimeStore } from '../../stores/runtimeStore';
import { isTestCategory } from '../../utils/testMode';
import { wsManager } from '../../api/ws';
import { useEventsStore } from '../../stores/eventsStore';
import { useIndexLabStore, type IndexLabEvent } from '../../stores/indexlabStore';
import { useSettingsAuthorityBootstrap, isSettingsAuthoritySnapshotReady } from '../../stores/settingsAuthority';
import { useSettingsAuthorityStore } from '../../stores/settingsAuthorityStore';
import type { ProcessStatus } from '../../types/events';
import type { RuntimeEvent } from '../../types/events';
import { resolveDataChangeScopedCategories } from './dataChangeScope';
import { coerceCategories, resolveActiveCategory } from './categoryStoreSync.js';
import { createDataChangeInvalidationScheduler } from './dataChangeInvalidationScheduler.js';
import { recordDataChangeInvalidationFlush } from './dataChangeClientObservability.js';
import { usePersistedToggle } from '../../stores/collapseStore';
import { usePersistedTab } from '../../stores/tabStore';

export function AppShell() {
  useSettingsAuthorityBootstrap();
  const settingsSnapshot = useSettingsAuthorityStore((s) => s.snapshot);
  const settingsReady = isSettingsAuthoritySnapshotReady(settingsSnapshot);
  const [allowDegradedRender, setAllowDegradedRender] = useState(false);
  const setCategories = useUiStore((s) => s.setCategories);
  const setCategory = useUiStore((s) => s.setCategory);
  const category = useUiStore((s) => s.category);
  const darkMode = useUiStore((s) => s.darkMode);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  const setProcessStatus = useRuntimeStore((s) => s.setProcessStatus);
  const appendProcessOutput = useRuntimeStore((s) => s.appendProcessOutput);
  const appendEvents = useEventsStore((s) => s.appendEvents);
  const appendIndexLabEvents = useIndexLabStore((s) => s.appendEvents);
  const activeRunId = useIndexLabStore((s) => s.pickerRunId);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (settingsReady) {
      setAllowDegradedRender(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setAllowDegradedRender(true);
    }, 5000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [settingsReady, settingsSnapshot.category]);

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<string[]>('/categories?includeTest=true'),
  });

  useEffect(() => {
    if (!categoriesQuery.data) return;
    const normalized = coerceCategories(categoriesQuery.data);
    setCategories(normalized);
    const nextCategory = resolveActiveCategory({
      currentCategory: category,
      categories: normalized,
    });
    if (nextCategory !== category) {
      setCategory(nextCategory);
    }
  }, [categoriesQuery.data, setCategories, setCategory, category]);

  useEffect(() => {
    if (!categoriesQuery.isError) return;
    const fallback = coerceCategories([]);
    setCategories(fallback);
    const nextCategory = resolveActiveCategory({
      currentCategory: category,
      categories: fallback,
    });
    if (nextCategory !== category) {
      setCategory(nextCategory);
    }
  }, [categoriesQuery.isError, setCategories, setCategory, category]);

  const testMode = isTestCategory(category);

  const { data: polledProcessStatus } = useQuery({
    queryKey: ['processStatus'],
    queryFn: () => api.get<ProcessStatus>('/process/status'),
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (!polledProcessStatus) return;
    setProcessStatus(polledProcessStatus);
  }, [polledProcessStatus, setProcessStatus]);

  const previousActiveRunIdRef = useRef('');
  useEffect(() => {
    const nextRunId = String(activeRunId || '').trim();
    if (nextRunId === previousActiveRunIdRef.current) return;
    previousActiveRunIdRef.current = nextRunId;
    queryClient.invalidateQueries({ queryKey: ['indexlab', 'run'] });
    queryClient.invalidateQueries({ queryKey: ['runtime-ops'] });
    queryClient.invalidateQueries({ queryKey: ['indexing', 'domain-checklist'] });
  }, [activeRunId, queryClient]);

  useEffect(() => {
    const dataChangeScheduler = createDataChangeInvalidationScheduler({
      queryClient,
      delayMs: 75,
      onFlush: ({ queryKeys, categories }) => {
        recordDataChangeInvalidationFlush({
          queryKeys,
          categories,
        });
      },
    });
    wsManager.connect();
    wsManager.subscribe(['events', 'process', 'process-status', 'data-change', 'test-import-progress', 'indexlab-event'], category);

    const unsub = wsManager.onMessage((channel, data) => {
      if (channel === 'events' && Array.isArray(data)) {
        appendEvents(data as RuntimeEvent[]);
      }
      if (channel === 'process' && Array.isArray(data)) {
        appendProcessOutput(data as string[]);
      }
      if (channel === 'process-status' && data && typeof data === 'object') {
        const status = data as ProcessStatus;
        setProcessStatus(status);
        queryClient.setQueryData(['processStatus'], status);
      }
      if (channel === 'indexlab-event' && Array.isArray(data)) {
        appendIndexLabEvents(data as IndexLabEvent[]);
      }
      if (channel === 'data-change' && data && typeof data === 'object') {
        const msg = data as { type?: string; event?: string; category?: string; categories?: string[] };
        const eventName = String(
          msg.event
          || (msg.type && msg.type !== 'data-change' ? msg.type : ''),
        ).trim();
        if (!eventName) return;
        const scopedCategories = resolveDataChangeScopedCategories(msg, category);
        dataChangeScheduler.schedule({
          message: msg,
          categories: scopedCategories,
          fallbackCategory: category,
        });
      }
    });

    return () => {
      dataChangeScheduler.flush();
      dataChangeScheduler.dispose();
      unsub();
    };
  }, [category, appendEvents, appendIndexLabEvents, appendProcessOutput, queryClient]);

  useEffect(() => {
    if (!testMode) return;
    if (location.pathname === '/indexing' || location.pathname === '/runtime-ops') {
      navigate('/test-mode', { replace: true });
    }
  }, [testMode, location.pathname, navigate]);

  const processStatus = useRuntimeStore((s) => s.processStatus);
  const isRunning = Boolean(processStatus?.running);
  const isRelocating = Boolean(processStatus?.relocating);
  const showIndicator = isRunning || isRelocating;
  const [headerTaskDrawerOpen, toggleHeaderTaskDrawer] = usePersistedToggle('appShell:header:taskDrawer:open', false);
  const fieldTestTabActive = location.pathname.startsWith('/test-mode');
  const [lastMainPath, setLastMainPath] = usePersistedTab<string>('appShell:fieldTest:returnPath', '/');
  const [lastMainCategory, setLastMainCategory] = usePersistedTab<string>('appShell:fieldTest:returnCategory', 'mouse');
  const blockUntilSettingsReady = !settingsReady && !allowDegradedRender;
  const indicatorTitle = isRunning
    ? `Run active${processStatus?.pid ? ` (PID ${processStatus.pid})` : ''}`
    : isRelocating
      ? `Uploading run data${processStatus?.relocatingRunId ? ` (${processStatus.relocatingRunId})` : ''}`
      : '';

  useEffect(() => {
    if (location.pathname.startsWith('/test-mode')) return;
    if (location.pathname) setLastMainPath(location.pathname);
    if (!isTestCategory(category)) setLastMainCategory(category);
  }, [location.pathname, category, setLastMainPath, setLastMainCategory]);

  const handleFieldTestToggle = () => {
    if (fieldTestTabActive) {
      const restorePath = lastMainPath && !lastMainPath.startsWith('/test-mode') ? lastMainPath : '/';
      const restoreCategory = lastMainCategory && !isTestCategory(lastMainCategory) ? lastMainCategory : 'mouse';
      if (category !== restoreCategory) {
        setCategory(restoreCategory);
      }
      navigate(restorePath);
      return;
    }
    if (location.pathname) setLastMainPath(location.pathname);
    if (!isTestCategory(category)) setLastMainCategory(category);
    navigate('/test-mode');
  };

  return (
    <div className="flex flex-col h-screen">
      <header className="flex items-center justify-between px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">Spec Factory</h1>
          {showIndicator && (
            <span title={indicatorTitle} className="relative flex items-center justify-center w-5 h-5">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2"
                  className={isRunning ? 'text-blue-200 dark:text-blue-900' : 'text-amber-200 dark:text-amber-900'} />
                <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  className={isRunning ? 'text-blue-500 dark:text-blue-400' : 'text-amber-500 dark:text-amber-400'} />
              </svg>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleDarkMode}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
            title="Toggle dark mode"
          >
            {darkMode ? '\u2600' : '\u263E'}
          </button>
          <div className="relative h-8 w-8">
            <div
              className={`absolute right-0 top-0 z-20 h-8 overflow-hidden rounded-none border border-gray-300 bg-white/95 shadow-sm backdrop-blur transition-[width] duration-300 ease-out dark:border-gray-600 dark:bg-gray-800/95 ${
                headerTaskDrawerOpen ? 'w-36' : 'w-8'
              }`}
            >
              <div className="flex h-full items-stretch">
                <button
                  onClick={() => toggleHeaderTaskDrawer()}
                  className="inline-flex h-full w-8 flex-shrink-0 items-center justify-center text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                  title={headerTaskDrawerOpen ? 'Close main tab header drawer' : 'Open main tab header drawer'}
                  aria-label={headerTaskDrawerOpen ? 'Close main tab header drawer' : 'Open main tab header drawer'}
                >
                  <svg
                    className={`h-4 w-4 transition-transform duration-200 ${headerTaskDrawerOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M7 4l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <div
                  className={`flex min-w-0 flex-1 items-center justify-center px-2 py-1 transition-opacity duration-200 ${
                    headerTaskDrawerOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
                  }`}
                >
                  <button
                    onClick={handleFieldTestToggle}
                    className={`inline-flex h-full min-w-[96px] items-center justify-center rounded-sm border px-3 text-xs font-semibold leading-none whitespace-nowrap transition-all duration-100 ${
                      fieldTestTabActive
                        ? 'border-cyan-500 bg-cyan-600 text-white shadow-inner translate-y-px ring-1 ring-cyan-900/20 dark:border-cyan-400 dark:bg-cyan-500'
                        : 'border-gray-300 bg-gray-50 text-gray-800 shadow-sm hover:bg-gray-100 hover:shadow active:translate-y-px active:scale-[0.99] active:shadow-inner dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700'
                    }`}
                    title="Open Field Test tab"
                  >
                    Field Test
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <TabNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-4">
          {blockUntilSettingsReady ? (
            <div className="h-full min-h-[180px] flex items-center justify-center rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <p className="text-sm text-gray-600 dark:text-gray-300">Hydrating settings...</p>
            </div>
          ) : (
            <>
              {!settingsReady && (
                <div className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
                  Settings are still hydrating. Some controls may remain read-only until reload completes.
                </div>
              )}
              {settingsSnapshot.uiSettingsPersistState === 'saving' && (
                <div className="mb-3 rounded border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-700 dark:bg-blue-900/20 dark:text-blue-200">
                  Saving autosave preference changes...
                </div>
              )}
              {settingsSnapshot.uiSettingsPersistState === 'error' && (
                <div className="mb-3 rounded border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-700 dark:bg-rose-900/20 dark:text-rose-200">
                  Failed to persist autosave preference changes. UI reverted to last persisted values.
                  {settingsSnapshot.uiSettingsPersistMessage
                    ? ` (${settingsSnapshot.uiSettingsPersistMessage})`
                    : ''}
                </div>
              )}
              <Outlet />
            </>
          )}
        </main>
      </div>
    </div>
  );
}
