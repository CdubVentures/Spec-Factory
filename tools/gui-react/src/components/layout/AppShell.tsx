import { useEffect } from 'react';
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
import { useSettingsAuthorityBootstrap } from '../../stores/settingsAuthority';
import type { ProcessStatus } from '../../types/events';
import type { RuntimeEvent } from '../../types/events';
import { resolveDataChangeScopedCategories } from './dataChangeScope';
import { coerceCategories, resolveActiveCategory } from './categoryStoreSync.js';
import { createDataChangeInvalidationScheduler } from './dataChangeInvalidationScheduler.js';
import { recordDataChangeInvalidationFlush } from './dataChangeClientObservability.js';

export function AppShell() {
  useSettingsAuthorityBootstrap();
  const setCategories = useUiStore((s) => s.setCategories);
  const setCategory = useUiStore((s) => s.setCategory);
  const category = useUiStore((s) => s.category);
  const darkMode = useUiStore((s) => s.darkMode);
  const toggleDarkMode = useUiStore((s) => s.toggleDarkMode);
  const setProcessStatus = useRuntimeStore((s) => s.setProcessStatus);
  const appendProcessOutput = useRuntimeStore((s) => s.appendProcessOutput);
  const appendEvents = useEventsStore((s) => s.appendEvents);
  const appendIndexLabEvents = useIndexLabStore((s) => s.appendEvents);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();

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

  useQuery({
    queryKey: ['processStatus'],
    queryFn: async () => {
      const status = await api.get<ProcessStatus>('/process/status');
      setProcessStatus(status);
      return status;
    },
    refetchInterval: 5000,
  });

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
        setProcessStatus(data as ProcessStatus);
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
  const indicatorTitle = isRunning
    ? `Run active${processStatus?.pid ? ` (PID ${processStatus.pid})` : ''}`
    : isRelocating
      ? `Uploading run data${processStatus?.relocatingRunId ? ` (${processStatus.relocatingRunId})` : ''}`
      : '';

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
          {testMode && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
              FIELD TEST
            </span>
          )}
          <button
            onClick={toggleDarkMode}
            className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-sm"
            title="Toggle dark mode"
          >
            {darkMode ? '\u2600' : '\u263E'}
          </button>
        </div>
      </header>
      <TabNav />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
