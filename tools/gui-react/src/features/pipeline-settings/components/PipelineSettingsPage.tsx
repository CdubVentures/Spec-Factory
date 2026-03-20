import { Suspense, lazy, useState } from 'react';
import {
  CONVERGENCE_KNOB_GROUPS,
  parseConvergenceNumericInput,
  readConvergenceKnobValue,
  useConvergenceSettingsAuthority,
} from '../../../stores/convergenceSettingsAuthority';
import {
  useSourceStrategyAuthority,
  type SourceEntry,
} from '../state/sourceStrategyAuthority';
import { useUiStore } from '../../../stores/uiStore';
import { useSettingsAuthorityStore } from '../../../stores/settingsAuthorityStore';
import { PIPELINE_SECTION_IDS, PipelineSettingsPageShell, type PipelineSectionId } from './PipelineSettingsPageShell';
import { usePersistedTab } from '../../../stores/tabStore';
import { Tip } from '../../../shared/ui/feedback/Tip';
import {
  resolvePipelineConvergenceStatusClass,
  resolvePipelineConvergenceStatusText,
  resolveSourceStrategyStatus,
} from '../../../shared/ui/feedback/settingsStatus';
import {
  type SourceStrategyDraft,
  type SourceStrategyDraftField,
} from '../sections/PipelineSourceStrategySection';
import { makeSourceStrategyDraft } from '../state/sourceEntryDerived';

const RuntimeSettingsFlowCard = lazy(async () => {
  const module = await import('./RuntimeSettingsFlowCard');
  return { default: module.RuntimeSettingsFlowCard };
});
const SourceStrategySection = lazy(async () => {
  const module = await import('../sections/PipelineSourceStrategySection');
  return { default: module.PipelineSourceStrategySection };
});

function dv(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function toNum(value: string, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function csvToArray(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function arrayToCsv(arr: string[] | undefined): string {
  return (arr || []).join(', ');
}

function resolveSourceHost(value: string, fallback: string): string {
  const baseUrl = String(value || '').trim();
  if (!baseUrl) return fallback;
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return fallback;
  }
}

// WHY: Draft factory derived from backend contract SSOT (sourceEntryDerived.ts).

function sourceStrategyDraftFromEntry(entry: SourceEntry): SourceStrategyDraft {
  const sourceIdFallback = String(entry.sourceId || '').replace(/_/g, '.');
  return {
    host: dv(resolveSourceHost(entry.base_url, sourceIdFallback)),
    display_name: dv(entry.display_name),
    tier: dv(entry.tier, 'tier2_lab'),
    authority: dv(entry.authority, 'unknown'),
    base_url: dv(entry.base_url),
    content_types: arrayToCsv(entry.content_types),
    doc_kinds: arrayToCsv(entry.doc_kinds),
    crawl_config: {
      method: dv(entry.crawl_config?.method, 'http'),
      rate_limit_ms: String(entry.crawl_config?.rate_limit_ms ?? 2000),
      timeout_ms: String(entry.crawl_config?.timeout_ms ?? 12000),
      robots_txt_compliant: String(entry.crawl_config?.robots_txt_compliant ?? true),
    },
    field_coverage: {
      high: arrayToCsv(entry.field_coverage?.high),
      medium: arrayToCsv(entry.field_coverage?.medium),
      low: arrayToCsv(entry.field_coverage?.low),
    },
    discovery: {
      method: dv(entry.discovery?.method, 'search_first'),
      source_type: dv(entry.discovery?.source_type),
      search_pattern: dv(entry.discovery?.search_pattern),
      priority: String(entry.discovery?.priority ?? 50),
      enabled: String(entry.discovery?.enabled ?? true),
      notes: dv(entry.discovery?.notes),
    },
  };
}

function sourceStrategyPayloadFromDraft(draft: SourceStrategyDraft): Partial<SourceEntry> & { host: string } {
  const host = String(draft.host || '').trim();
  return {
    host,
    display_name: String(draft.display_name || '').trim() || host,
    tier: draft.tier || 'tier2_lab',
    authority: draft.authority || 'unknown',
    base_url: draft.base_url || `https://${host}`,
    content_types: csvToArray(draft.content_types),
    doc_kinds: csvToArray(draft.doc_kinds),
    crawl_config: {
      method: draft.crawl_config.method || 'http',
      rate_limit_ms: toNum(draft.crawl_config.rate_limit_ms, 2000, 0, 60000),
      timeout_ms: toNum(draft.crawl_config.timeout_ms, 12000, 0, 120000),
      robots_txt_compliant: draft.crawl_config.robots_txt_compliant !== 'false',
    },
    field_coverage: {
      high: csvToArray(draft.field_coverage.high),
      medium: csvToArray(draft.field_coverage.medium),
      low: csvToArray(draft.field_coverage.low),
    },
    discovery: {
      method: (draft.discovery.method || 'search_first') as 'search_first' | 'manual',
      source_type: draft.discovery.source_type || '',
      search_pattern: draft.discovery.search_pattern || '',
      priority: toNum(draft.discovery.priority, 50, 0, 1000),
      enabled: draft.discovery.enabled !== 'false',
      notes: draft.discovery.notes || '',
    },
  };
}

function updateSourceStrategyDraftField(
  previous: SourceStrategyDraft,
  key: SourceStrategyDraftField,
  value: string,
): SourceStrategyDraft {
  switch (key) {
    case 'host':
    case 'display_name':
    case 'tier':
    case 'authority':
    case 'base_url':
    case 'content_types':
    case 'doc_kinds':
      return { ...previous, [key]: value };
    case 'crawl_config.method':
      return { ...previous, crawl_config: { ...previous.crawl_config, method: value } };
    case 'crawl_config.rate_limit_ms':
      return { ...previous, crawl_config: { ...previous.crawl_config, rate_limit_ms: value } };
    case 'crawl_config.timeout_ms':
      return { ...previous, crawl_config: { ...previous.crawl_config, timeout_ms: value } };
    case 'crawl_config.robots_txt_compliant':
      return { ...previous, crawl_config: { ...previous.crawl_config, robots_txt_compliant: value } };
    case 'field_coverage.high':
      return { ...previous, field_coverage: { ...previous.field_coverage, high: value } };
    case 'field_coverage.medium':
      return { ...previous, field_coverage: { ...previous.field_coverage, medium: value } };
    case 'field_coverage.low':
      return { ...previous, field_coverage: { ...previous.field_coverage, low: value } };
    case 'discovery.method':
      return { ...previous, discovery: { ...previous.discovery, method: value } };
    case 'discovery.source_type':
      return { ...previous, discovery: { ...previous.discovery, source_type: value } };
    case 'discovery.search_pattern':
      return { ...previous, discovery: { ...previous.discovery, search_pattern: value } };
    case 'discovery.priority':
      return { ...previous, discovery: { ...previous.discovery, priority: value } };
    case 'discovery.enabled':
      return { ...previous, discovery: { ...previous.discovery, enabled: value } };
    case 'discovery.notes':
      return { ...previous, discovery: { ...previous.discovery, notes: value } };
  }
}

function ConvergenceGroupIcon({ label, active }: { label: string; active: boolean }) {
  const toneClass = active
    ? 'sf-callout sf-callout-info'
    : 'sf-callout sf-callout-neutral';

  return (
    <span
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${toneClass}`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4.5 w-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {label === 'Consensus - LLM Weights' ? (
          <>
            <circle cx="6" cy="8" r="2" />
            <circle cx="18" cy="8" r="2" />
            <circle cx="12" cy="16" r="2" />
            <path d="M8 8h8" />
            <path d="M7.7 9.4 10.6 14" />
            <path d="M16.3 9.4 13.4 14" />
          </>
        ) : null}
        {label === 'Consensus - Tier Weights' ? (
          <>
            <path d="M6 18V8" />
            <path d="M12 18V6" />
            <path d="M18 18V10" />
            <path d="M4 18h16" />
          </>
        ) : null}
        {label === 'SERP Selector' ? (
          <>
            <path d="M4 6h16l-6 7v5l-4-2v-3z" />
            <path d="M9 10h6" />
          </>
        ) : null}
        {label === 'Retrieval' ? (
          <>
            <circle cx="10.5" cy="10.5" r="5.5" />
            <path d="m15 15 4 4" />
            <path d="M8.5 10.5h4" />
          </>
        ) : null}
        {label === 'Consensus - Thresholds' ? (
          <>
            <path d="M4 18h16" />
            <path d="M8 18v-4" />
            <path d="M12 18v-8" />
            <path d="M16 18v-6" />
            <path d="M4 10h16" strokeDasharray="2 2" />
          </>
        ) : null}
      </svg>
    </span>
  );
}

function KnobInput({
  knob,
  value,
  onChange,
}: {
  knob: (typeof CONVERGENCE_KNOB_GROUPS)[number]['knobs'][number];
  value: number | boolean | undefined;
  onChange: (v: number | boolean) => void;
}) {
  const knobSettings = value === undefined ? undefined : { [knob.key]: value };

  if (knob.type === 'bool') {
    const boolValue = readConvergenceKnobValue(knobSettings, knob);
    return (
      <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] xl:items-center">
        <label className="inline-flex min-w-0 flex-wrap items-center gap-1 sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>
          {knob.label}
          <Tip text={knob.tip || ''} />
          <input
            type="checkbox"
            checked={Boolean(boolValue)}
            onChange={(event) => onChange(event.target.checked)}
            className="h-4 w-4 opacity-0"
          />
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={Boolean(boolValue)}
          aria-label={knob.label}
          onClick={() => onChange(!Boolean(boolValue))}
          className={`inline-flex w-full items-center justify-between sf-switch px-2.5 py-1.5 sf-text-label font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500/25 ${
            boolValue
              ? 'sf-switch-on'
              : 'sf-switch-off'
          }`}
        >
          <span>{boolValue ? 'Enabled' : 'Disabled'}</span>
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full sf-switch-track transition ${
              boolValue
                ? 'sf-switch-track-on'
                : ''
            }`}
            aria-hidden="true"
          >
            <span
              className={`inline-block h-3.5 w-3.5 rounded-full sf-switch-thumb transition-transform ${
                boolValue ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </span>
        </button>
      </div>
    );
  }

  const resolvedValue = readConvergenceKnobValue(knobSettings, knob);
  const numValue = typeof resolvedValue === 'number' ? resolvedValue : knob.min;
  const step = 'step' in knob ? knob.step : 1;

  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="inline-flex min-w-0 flex-wrap items-center gap-1 sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>
          {knob.label}
          <Tip text={knob.tip || ''} />
        </span>
        <span className="shrink-0 rounded sf-callout sf-callout-neutral px-1.5 py-0.5 sf-text-label font-mono">
          {knob.type === 'float' ? numValue.toFixed(2) : numValue}
        </span>
      </div>
      <input
        type="range"
        className="w-full accent-blue-600"
        min={knob.min}
        max={knob.max}
        step={step}
        value={numValue}
        onChange={(e) => {
          onChange(parseConvergenceNumericInput(knob, e.target.value, numValue));
        }}
      />
      <div className="mt-0.5 flex justify-between sf-text-label" style={{ color: 'var(--sf-muted)' }}>
        <span>{knob.min}</span>
        <span>{knob.max}</span>
      </div>
    </div>
  );
}

export function PipelineSettingsPage() {
  const category = useUiStore((s) => s.category);
  const isAll = category === 'all';
  const convergenceSettingsReady = useSettingsAuthorityStore((s) => s.snapshot.convergenceReady);
  const sourceStrategySettingsReady = useSettingsAuthorityStore(
    (s) => s.snapshot.sourceStrategyReady,
  );

  const [sourceStrategySaveState, setSourceStrategySaveState] = useState<{
    kind: 'idle' | 'ok' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });
  const [sourceDraftMode, setSourceDraftMode] = useState<'create' | 'edit' | null>(null);
  const [sourceDraftSourceId, setSourceDraftSourceId] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState<SourceStrategyDraft>(() => makeSourceStrategyDraft());

  const [saveStatus, setSaveStatus] = useState<{
    kind: 'idle' | 'ok' | 'partial' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });
  const [runtimeHeaderActionMount, setRuntimeHeaderActionMount] = useState<HTMLDivElement | null>(null);

  const [activeSection, setActiveSection] = usePersistedTab<PipelineSectionId>(
    'pipeline-settings:active-section',
    'runtime-flow',
    { validValues: PIPELINE_SECTION_IDS },
  );

  const convergenceGroupLabels = CONVERGENCE_KNOB_GROUPS.map((g) => g.label);
  const [activeKnobGroupLabel, setActiveKnobGroupLabel] = usePersistedTab<string>(
    'pipeline-settings:convergence:knob-group',
    convergenceGroupLabels.find((label) => label === 'SERP Selector') ?? convergenceGroupLabels[0] ?? '',
  );
  const activeGroup =
    CONVERGENCE_KNOB_GROUPS.find((g) => g.label === activeKnobGroupLabel) ??
    CONVERGENCE_KNOB_GROUPS[0];

  const { settings, dirty, isLoading, isSaving, updateSetting, reload, save } =
    useConvergenceSettingsAuthority({
      onPersisted: (result) => {
        const rejectedKeys = Object.keys(result.rejected);
        if (rejectedKeys.length === 0 && result.ok) {
          setSaveStatus({ kind: 'ok', message: 'Scoring settings saved.' });
          return;
        }
        if (rejectedKeys.length > 0) {
          setSaveStatus({
            kind: 'partial',
            message: `Partially saved. Rejected ${rejectedKeys.length} key(s): ${rejectedKeys.join(', ')}`,
          });
          return;
        }
        setSaveStatus({ kind: 'error', message: 'Scoring settings save failed.' });
      },
      onError: (error) => {
        setSaveStatus({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Scoring settings save failed.',
        });
      },
    });

  const {
    entries: sourceStrategyEntries,
    isLoading: sourceStrategyLoading,
    isError: sourceStrategyIsError,
    errorMessage: sourceStrategyErrorMessage,
    isSaving: sourceStrategySaving,
    createEntry,
    updateEntry,
    toggleEnabled,
    deleteEntry,
  } = useSourceStrategyAuthority({
    category,
    enabled: !isAll,
    onError: (error) => {
      setSourceStrategySaveState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Source strategy update failed.',
      });
    },
    onToggled: () => {
      setSourceStrategySaveState({ kind: 'ok', message: 'Source strategy updated.' });
    },
    onCreated: () => {
      setSourceStrategySaveState({ kind: 'ok', message: 'Source strategy created.' });
    },
    onUpdated: () => {
      setSourceStrategySaveState({ kind: 'ok', message: 'Source strategy updated.' });
    },
    onDeleted: () => {
      setSourceStrategySaveState({ kind: 'ok', message: 'Source strategy removed.' });
    },
  });

  const convergenceHydrated = convergenceSettingsReady && !isLoading;
  const sourceStrategyHydrated = isAll || sourceStrategyIsError || (sourceStrategySettingsReady && !sourceStrategyLoading);

  const convergenceStatusText = resolvePipelineConvergenceStatusText({
    isSaving,
    saveState: saveStatus.kind,
    saveMessage: saveStatus.message,
    dirty,
  });

  const convergenceStatusClass = resolvePipelineConvergenceStatusClass({
    isSaving,
    saveState: saveStatus.kind,
    dirty,
  });
  const sourceStrategyStatus = resolveSourceStrategyStatus({
    isSaving: sourceStrategySaving,
    saveState: sourceStrategySaveState,
  });

  function beginCreateSourceDraft() {
    setSourceDraftMode('create');
    setSourceDraftSourceId(null);
    setSourceDraft(makeSourceStrategyDraft());
  }

  function beginEditSourceDraft(entry: SourceEntry) {
    setSourceDraftMode('edit');
    setSourceDraftSourceId(entry.sourceId);
    setSourceDraft(sourceStrategyDraftFromEntry(entry));
  }

  function cancelSourceDraft() {
    setSourceDraftMode(null);
    setSourceDraftSourceId(null);
  }

  function updateSourceDraft(key: SourceStrategyDraftField, value: string) {
    setSourceDraft((previous) => updateSourceStrategyDraftField(previous, key, value));
  }

  function saveEntryDraft() {
    const host = String(sourceDraft.host || '').trim();
    if (!host) {
      setSourceStrategySaveState({ kind: 'error', message: 'Host is required.' });
      return;
    }
    const payload = sourceStrategyPayloadFromDraft(sourceDraft);
    if (sourceDraftMode === 'create') {
      createEntry(payload);
      cancelSourceDraft();
      return;
    }
    if (sourceDraftMode === 'edit' && sourceDraftSourceId !== null) {
      updateEntry(sourceDraftSourceId, payload);
      cancelSourceDraft();
    }
  }

  const sourceInputCls = 'w-full rounded sf-input px-2.5 py-2 sf-text-label';

  const headerActions = (
    <>
            {activeSection === 'runtime-flow' ? (
              <div
                ref={setRuntimeHeaderActionMount}
                className="flex flex-wrap items-center gap-2"
              />
            ) : null}
            {activeSection === 'convergence' ? (
              <div className="flex items-center gap-2">
                {convergenceStatusText ? (
                  <p className={`sf-text-label font-semibold ${convergenceStatusClass}`}>
                    {convergenceStatusText}
                  </p>
                ) : null}
                <button
                  onClick={() => {
                    void reload();
                  }}
                  disabled={!convergenceHydrated || isSaving}
                  className="rounded sf-icon-button px-3 py-1.5 sf-text-label transition-colors disabled:opacity-50"
                >
                  Reload
                </button>
                <button
                  onClick={save}
                  disabled={!convergenceHydrated || !dirty || isSaving}
                  className="rounded sf-primary-button px-3 py-1.5 sf-text-label transition-colors disabled:opacity-50"
                >
                  {isSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            ) : null}
            {activeSection === 'source-strategy' ? (
              <div className="flex items-center gap-2">
                {sourceStrategyStatus ? (
                  <span className={sourceStrategyStatus.className}>
                    {sourceStrategyStatus.text}
                  </span>
                ) : null}
                {!isAll ? (
                  <button
                    type="button"
                    onClick={beginCreateSourceDraft}
                    disabled={sourceStrategySaving}
                    className="rounded sf-primary-button px-2.5 py-1 sf-text-label font-semibold transition-colors disabled:opacity-50"
                  >
                    Add Source
                  </button>
                ) : null}
              </div>
            ) : null}
    </>
  );

  const activePanel = (
    <>
        {/* â”€â”€ Runtime Flow â”€â”€ */}
        {activeSection === 'runtime-flow' && (
          <Suspense fallback={<p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Loading runtime flow...</p>}>
            <RuntimeSettingsFlowCard
              actionPortalTarget={runtimeHeaderActionMount}
              suppressInlineHeaderControls
            />
          </Suspense>
        )}

        {/* â”€â”€ Convergence â”€â”€ */}
        {activeSection === 'convergence' && (
          <div
            className={`grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)] ${
              !convergenceHydrated ? 'opacity-60 pointer-events-none select-none' : ''
            }`}
          >
            {/* Knob group sub-sidebar */}
            <aside className="rounded sf-surface-elevated p-2.5 sm:p-3 flex min-h-0 flex-col">
              <div className="mb-2 px-2 sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
                Scoring & Retrieval
              </div>
              <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
                {CONVERGENCE_KNOB_GROUPS.map((group) => {
                  const isGroupActive = activeKnobGroupLabel === group.label;
                  return (
                    <button
                      key={group.label}
                      onClick={() => setActiveKnobGroupLabel(group.label)}
                      className={`group w-full min-h-[74px] sf-nav-item px-2.5 py-2.5 text-left ${isGroupActive ? 'sf-nav-item-active' : ''}`}
                    >
                      <div className="flex items-start gap-2">
                        <ConvergenceGroupIcon label={group.label} active={isGroupActive} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="sf-text-label font-semibold leading-5">
                              {group.label}
                            </div>
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: isGroupActive
                                  ? 'rgb(var(--sf-color-accent-rgb))'
                                  : 'rgb(var(--sf-color-border-subtle-rgb) / 0.7)',
                              }}
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Knob detail panel */}
            <section className="space-y-3 rounded sf-surface-elevated p-3 md:p-4 min-h-0 overflow-x-hidden">
              {!convergenceHydrated ? (
                <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
                  Loading settings...
                </p>
              ) : activeGroup ? (
                <>
                  <header className="rounded sf-surface-elevated px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2">
                        <ConvergenceGroupIcon label={activeGroup.label} active />
                        <div>
                          <h3 className="text-base font-semibold" style={{ color: 'var(--sf-text)' }}>
                            {activeGroup.label}
                          </h3>
                          <p className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                            Tune convergence controls for this section.
                          </p>
                        </div>
                      </div>
                    </div>
                  </header>
                  <div className="space-y-4">
                    {activeGroup.knobs.map((knob) => (
                      <KnobInput
                        key={knob.key}
                        knob={knob}
                        value={settings[knob.key] as number | boolean | undefined}
                        onChange={(v) => updateSetting(knob.key, v)}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </section>
          </div>

        )}
        {/* Source Strategy */}
        {activeSection === 'source-strategy' && (
          <Suspense fallback={<p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Loading source strategy section...</p>}>
            <SourceStrategySection
              category={category}
              isAll={isAll}
              sourceStrategyHydrated={sourceStrategyHydrated}
              sourceStrategyEntries={sourceStrategyEntries}
              sourceStrategyLoading={sourceStrategyLoading}
              sourceStrategyErrorMessage={sourceStrategyErrorMessage}
              sourceStrategySaving={sourceStrategySaving}
              sourceDraftMode={sourceDraftMode}
              sourceDraft={sourceDraft}
              sourceInputCls={sourceInputCls}
              onToggleEntry={(entry) => {
                toggleEnabled(entry);
              }}
              onEditEntry={(entry) => {
                beginEditSourceDraft(entry);
              }}
              onDeleteEntry={(sourceId) => {
                deleteEntry(sourceId);
              }}
              onUpdateSourceDraft={(key, value) => {
                updateSourceDraft(key, value);
              }}
              onSaveEntryDraft={saveEntryDraft}
              onCancelSourceDraft={cancelSourceDraft}
            />
          </Suspense>
        )}
    </>
  );

  return (
    <PipelineSettingsPageShell
      activeSection={activeSection}
      onSelectSection={setActiveSection}
      headerActions={headerActions}
      activePanel={activePanel}
    />
  );
}
