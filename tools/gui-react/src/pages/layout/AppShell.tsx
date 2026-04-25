import { useEffect, useRef } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { TabNav } from './TabNav.tsx';
import { Sidebar } from './Sidebar.tsx';
import { Spinner } from '../../shared/ui/feedback/Spinner.tsx';
import { useUiStore } from '../../stores/uiStore.ts';
import { usePersistedToggle } from '../../stores/collapseStore.ts';
import {
  SF_THEME_RADIUS_PROFILES,
  SF_LIGHT_THEME_PROFILES,
  SF_MID_THEME_PROFILES,
  SF_DARK_THEME_PROFILES,
  SF_THEME_COLOR_META,
  type SfThemeColorProfileId,
  type SfThemeRadiusProfileId,
} from '../../stores/uiThemeProfiles.ts';
import {
  SF_TIMEZONE_OPTIONS,
  SF_DATE_FORMAT_OPTIONS,
  type SfTimezoneId,
  type SfDateFormatId,
} from '../../stores/uiStore.ts';

import { useSettingsHydration } from './hooks/useSettingsHydration.ts';
import { useCategorySync } from './hooks/useCategorySync.ts';
import { useWsEventBridge } from './hooks/useWsEventBridge.ts';
import { useOperationsHydration } from '../../features/operations/index.ts';
import { DiscoveryHistoryDrawer } from '../../shared/ui/finder/index.ts';

function ThemeSwatchCard({
  themeId,
  isSelected,
  onClick,
}: {
  themeId: SfThemeColorProfileId;
  isSelected: boolean;
  onClick: () => void;
}) {
  const meta = SF_THEME_COLOR_META[themeId];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`sf-theme-swatch-card ${isSelected ? 'sf-theme-swatch-card-selected' : ''}`}
      title={meta.label}
    >
      <div className="sf-theme-swatch-preview">
        {meta.swatchColors.map((color, i) => (
          <div key={i} className="sf-theme-swatch-band" style={{ background: color }} />
        ))}
      </div>
      <span className="sf-theme-swatch-label">{meta.label}</span>
    </button>
  );
}

const THEME_RADIUS_LABELS: Record<SfThemeRadiusProfileId, string> = {
  tight: 'Tight',
  standard: 'Standard',
  relaxed: 'Relaxed',
  'pill-heavy': 'Pill Heavy',
};

const TIMEZONE_LABELS: Record<SfTimezoneId, string> = {
  'America/Los_Angeles': 'Pacific (PST/PDT)',
  'America/Denver': 'Mountain (MST/MDT)',
  'America/Chicago': 'Central (CST/CDT)',
  'America/New_York': 'Eastern (EST/EDT)',
  UTC: 'UTC',
};

const DATE_FORMAT_LABELS: Record<SfDateFormatId, string> = {
  'MM-DD-YY': 'MM-DD-YY (04-17-26)',
  'MM-DD-YYYY': 'MM-DD-YYYY (04-17-2026)',
  'YYYY-MM-DD': 'YYYY-MM-DD (2026-04-17)',
  'DD-MM-YY': 'DD-MM-YY (17-04-26)',
};

export function AppShell() {
  // ── Composition hooks ─────────────────────────────────────────────
  const { settingsReady, allowDegradedRender, settingsSnapshot } = useSettingsHydration();
  const { category, processStatus } = useCategorySync();
  const queryClient = useQueryClient();
  useWsEventBridge({ category, queryClient });
  useOperationsHydration();

  // ── Theme ─────────────────────────────────────────────────────────
  const themeColorProfile = useUiStore((s) => s.themeColorProfile);
  const themeRadiusProfile = useUiStore((s) => s.themeRadiusProfile);
  const setThemeColorProfile = useUiStore((s) => s.setThemeColorProfile);
  const setThemeRadiusProfile = useUiStore((s) => s.setThemeRadiusProfile);
  const userTimezone = useUiStore((s) => s.userTimezone);
  const dateFormat = useUiStore((s) => s.dateFormat);
  const setUserTimezone = useUiStore((s) => s.setUserTimezone);
  const setDateFormat = useUiStore((s) => s.setDateFormat);

  // ── Local UI state ────────────────────────────────────────────────
  const isRunning = Boolean(processStatus?.running);
  const [headerTaskDrawerOpen, toggleHeaderTaskDrawer] = usePersistedToggle('appShell:header:taskDrawer:open', false);
  const [settingsPanelOpen, toggleSettingsPanel, setSettingsPanelOpen] = usePersistedToggle('appShell:settingsPanel:open', false);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const blockUntilSettingsReady = !settingsReady && !allowDegradedRender;
  const indicatorTitle = isRunning
    ? `Run active${processStatus?.pid ? ` (PID ${processStatus.pid})` : ''}`
    : '';

  // ── Settings panel click-outside ──────────────────────────────────
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

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="sf-surface-shell sf-shell flex flex-col h-screen">
      <header className="sf-shell-header z-30 flex items-center justify-between px-4 py-2 border-b border-sf-border-default">
        <div className="flex items-center gap-2">
          <h1 className="sf-shell-title text-lg font-bold">Spec Factory</h1>
          {isRunning && (
            <span title={indicatorTitle} className="relative flex items-center justify-center w-5 h-5">
              <svg className="w-5 h-5 animate-spin" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2"
                  className="text-sf-accent" />
                <path d="M10 2a8 8 0 0 1 8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                  className="text-sf-accent-strong" />
              </svg>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div ref={settingsPanelRef} className="relative">
            <button
              onClick={toggleSettingsPanel}
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
              <section id="app-shell-settings-panel" className="sf-shell-settings-panel absolute right-0 top-10 z-30 w-[340px] rounded p-3 space-y-3">
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
                    <div className="space-y-2">
                      <div>
                        <p className="sf-text-caption sf-status-text-muted mb-1">Light</p>
                        <div className="sf-shell-settings-grid grid grid-cols-5 gap-1.5">
                          {SF_LIGHT_THEME_PROFILES.map((themeId) => (
                            <ThemeSwatchCard
                              key={themeId}
                              themeId={themeId}
                              isSelected={themeColorProfile === themeId}
                              onClick={() => setThemeColorProfile(themeId)}
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="sf-text-caption sf-status-text-muted mb-1">Mid</p>
                        <div className="sf-shell-settings-grid grid grid-cols-5 gap-1.5">
                          {SF_MID_THEME_PROFILES.map((themeId) => (
                            <ThemeSwatchCard
                              key={themeId}
                              themeId={themeId}
                              isSelected={themeColorProfile === themeId}
                              onClick={() => setThemeColorProfile(themeId)}
                            />
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="sf-text-caption sf-status-text-muted mb-1">Dark</p>
                        <div className="sf-shell-settings-grid grid grid-cols-5 gap-1.5">
                          {SF_DARK_THEME_PROFILES.map((themeId) => (
                            <ThemeSwatchCard
                              key={themeId}
                              themeId={themeId}
                              isSelected={themeColorProfile === themeId}
                              onClick={() => setThemeColorProfile(themeId)}
                            />
                          ))}
                        </div>
                      </div>
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
                  <section className="space-y-1.5">
                    <p className="sf-text-label font-semibold">Timezone</p>
                    <select
                      value={userTimezone}
                      onChange={(e) => setUserTimezone(e.target.value as SfTimezoneId)}
                      className="w-full rounded px-2 py-1.5 sf-text-label sf-icon-button"
                    >
                      {SF_TIMEZONE_OPTIONS.map((tz) => (
                        <option key={tz} value={tz}>{TIMEZONE_LABELS[tz]}</option>
                      ))}
                    </select>
                  </section>
                  <section className="space-y-1.5">
                    <p className="sf-text-label font-semibold">Date Format</p>
                    <select
                      value={dateFormat}
                      onChange={(e) => setDateFormat(e.target.value as SfDateFormatId)}
                      className="w-full rounded px-2 py-1.5 sf-text-label sf-icon-button"
                    >
                      {SF_DATE_FORMAT_OPTIONS.map((fmt) => (
                        <option key={fmt} value={fmt}>{DATE_FORMAT_LABELS[fmt]}</option>
                      ))}
                    </select>
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
                  <Link
                    to="/test-mode"
                    className="inline-flex h-full min-w-[96px] items-center justify-center rounded-sm border px-3 text-xs font-semibold leading-none whitespace-nowrap transition-all duration-100 sf-shell-field-test-button-idle"
                    title="Field Contract Audit"
                  >
                    Field Audit
                  </Link>
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
            <Spinner className="h-8 w-8 mx-auto mt-12" />
          ) : (
            <>
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
      {/* WHY: Mounted once at the shell so the global Discovery History store
          (zustand-driven openDrawer) renders the slide-in regardless of route.
          Overview popovers (PIF/SKU/RDF/Keys) call openDrawer; without a
          shell-level subscriber the drawer never renders outside Indexing. */}
      <DiscoveryHistoryDrawer />
    </div>
  );
}
