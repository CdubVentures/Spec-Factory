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
import {
  SF_THEME_COLOR_PROFILES,
  SF_THEME_RADIUS_PROFILES,
  type SfThemeColorProfileId,
  type SfThemeRadiusProfileId,
} from '../../stores/uiThemeProfiles';

const THEME_COLOR_LABELS: Record<SfThemeColorProfileId, string> = {
  light: 'Light',
  dark: 'Dark',
};

const THEME_RADIUS_LABELS: Record<SfThemeRadiusProfileId, string> = {
  tight: 'Tight',
  standard: 'Standard',
  relaxed: 'Relaxed',
  'pill-heavy': 'Pill Heavy',
};

export function AppShell() {
  useSettingsAuthorityBootstrap();
  const settingsSnapshot = useSettingsAuthorityStore((s) => s.snapshot);
  const settingsReady = isSettingsAuthoritySnapshotReady(settingsSnapshot);
  const [allowDegradedRender, setAllowDegradedRender] = useState(false);
  const setCategories = useUiStore((s) => s.setCategories);
  const setCategory = useUiStore((s) => s.setCategory);
  const category = useUiStore((s) => s.category);
  const themeColorProfile = useUiStore((s) => s.themeColorProfile);
  const themeRadiusProfile = useUiStore((s) => s.themeRadiusProfile);
  const setThemeColorProfile = useUiStore((s) => s.setThemeColorProfile);
  const setThemeRadiusProfile = useUiStore((s) => s.setThemeRadiusProfile);
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
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!settingsPanelOpen) return;
    const onWindowMouseDown = (event: MouseEvent) => {
      const panelRoot = settingsPanelRef.current;
      if (!panelRoot) return;
      if (event.target instanceof Node && panelRoot.contains(event.target)) return;
      setSettingsPanelOpen(false);
    };
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setSettingsPanelOpen(false);
    };
    window.addEventListener('mousedown', onWindowMouseDown);
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('mousedown', onWindowMouseDown);
      window.removeEventListener('keydown', onWindowKeyDown);
    };
  }, [settingsPanelOpen]);

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
    <div className="sf-surface-shell sf-shell flex flex-col h-screen">
      <header className="sf-shell-header z-30 flex items-center justify-between px-4 py-2 border-b border-white/10">
        <div className="flex items-center gap-2">
          <h1 className="sf-shell-title text-lg font-bold">Spec Factory</h1>
          {showIndicator && (
            <span title={indicatorTitle} className="relative flex items-center justify-center w-5 h-5">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2"
                  className={isRunning ? 'text-sky-300' : 'text-amber-200'} />
                <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  className={isRunning ? 'text-sky-400' : 'text-amber-400'} />
              </svg>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div ref={settingsPanelRef} className="relative">
            <button
              onClick={() => setSettingsPanelOpen((open) => !open)}
              className="sf-shell-header-control inline-flex h-8 w-8 items-center justify-center"
              title={settingsPanelOpen ? 'Close app settings' : 'Open app settings'}
              aria-label={settingsPanelOpen ? 'Close app settings' : 'Open app settings'}
              aria-expanded={settingsPanelOpen}
              aria-controls="app-shell-settings-panel"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                <circle cx="10" cy="10" r="3" />
                <path d="M10 1.8v2.2M10 16v2.2M1.8 10H4M16 10h2.2M3.7 3.7l1.6 1.6M14.7 14.7l1.6 1.6M16.3 3.7l-1.6 1.6M5.3 14.7l-1.6 1.6" />
              </svg>
            </button>
            {settingsPanelOpen ? (
              <section id="app-shell-settings-panel" className="sf-shell-settings-panel absolute right-0 top-10 z-30 w-[320px] rounded p-3 space-y-3">
                <header className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="sf-shell-settings-title text-sm font-semibold">Settings</h2>
                    <p className="sf-text-caption sf-status-text-muted mt-0.5">Appearance</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSettingsPanelOpen(false)}
                    className="rounded sf-icon-button px-2 py-1 sf-text-label"
                    title="Close app settings"
                  >
                    Close
                  </button>
                </header>
                <div className="space-y-3">
                  <section className="space-y-1.5">
                    <p className="sf-text-label font-semibold">Theme</p>
                    <div className="sf-shell-settings-grid grid grid-cols-2 gap-1.5">
                      {SF_THEME_COLOR_PROFILES.map((themeId) => (
                        <button
                          key={themeId}
                          type="button"
                          onClick={() => setThemeColorProfile(themeId)}
                          className={`rounded px-2 py-1.5 sf-text-label font-semibold transition-colors ${
                            themeColorProfile === themeId
                              ? 'sf-primary-button'
                              : 'sf-icon-button'
                          }`}
                        >
                          {THEME_COLOR_LABELS[themeId]}
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="space-y-1.5">
                    <p className="sf-text-label font-semibold">Corner Radius</p>
                    <div className="sf-shell-settings-grid grid grid-cols-2 gap-1.5">
                      {SF_THEME_RADIUS_PROFILES.map((radiusId) => (
                        <button
                          key={radiusId}
                          type="button"
                          onClick={() => setThemeRadiusProfile(radiusId)}
                          className={`rounded px-2 py-1.5 sf-text-label font-semibold transition-colors ${
                            themeRadiusProfile === radiusId
                              ? 'sf-primary-button'
                              : 'sf-icon-button'
                          }`}
                        >
                          {THEME_RADIUS_LABELS[radiusId]}
                        </button>
                      ))}
                    </div>
                  </section>
                </div>
              </section>
            ) : null}
          </div>
          <div className="relative h-8 w-8">
            <div
              className={`absolute right-0 top-0 z-20 h-8 overflow-hidden rounded-none sf-shell-header-drawer transition-[width] duration-300 ease-out ${
                headerTaskDrawerOpen ? 'w-36' : 'w-8'
              }`}
            >
              <div className="flex h-full items-stretch">
                <button
                  onClick={() => toggleHeaderTaskDrawer()}
                  className="sf-shell-header-drawer-toggle inline-flex h-8 w-8 flex-shrink-0 items-center justify-center"
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
                        ? 'sf-shell-field-test-button-active'
                        : 'sf-shell-field-test-button-idle'
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
        <main className="sf-shell-main flex-1 overflow-auto p-4">
          {blockUntilSettingsReady ? (
            <div className="sf-shell-elevated h-full min-h-[180px] flex items-center justify-center">
              <p className="text-sm text-sf-text-muted">Hydrating settings...</p>
            </div>
          ) : (
            <>
              {!settingsReady && (
                <div className="mb-3 sf-status sf-status-warning sf-shell-warning">
                  Settings are still hydrating. Some controls may remain read-only until reload completes.
                </div>
              )}
              {settingsSnapshot.uiSettingsPersistState === 'saving' && (
                <div className="mb-3 sf-status sf-status-info sf-shell-saving">
                  Saving autosave preference changes...
                </div>
              )}
              {settingsSnapshot.uiSettingsPersistState === 'error' && (
                <div className="mb-3 sf-status sf-status-danger sf-shell-error">
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
