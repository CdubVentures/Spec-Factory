import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import {
  CONVERGENCE_KNOB_GROUPS,
  parseConvergenceNumericInput,
  readConvergenceKnobValue,
  useConvergenceSettingsAuthority,
} from '../../../stores/convergenceSettingsAuthority.ts';
import {
  useSourceStrategyAuthority,
  type SourceEntry,
} from '../state/sourceStrategyAuthority.ts';
import { useUiStore } from '../../../stores/uiStore.ts';
import { useSettingsAuthorityStore } from '../../../stores/settingsAuthorityStore.ts';
import { PIPELINE_SECTION_IDS, PipelineSettingsPageShell, type PipelineSectionId } from './PipelineSettingsPageShell.tsx';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import {
  resolvePipelineConvergenceStatusClass,
  resolvePipelineConvergenceStatusText,
  resolveSourceStrategyStatus,
} from '../../../shared/ui/feedback/settingsStatus.ts';
import {
  type SourceFormEntry,
  type SourceFormEntryField,
} from '../sections/PipelineSourceStrategySection.tsx';
import { defaultSourceFormEntry, entryToFormEntry, formEntryToPayload, updateFormEntryByPath } from '../state/sourceEntryDerived.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import { useRuntimeSettingsAuthority, type RuntimeEditorSaveStatus } from '../state/runtimeSettingsAuthority.ts';
import { RuntimeFlowHeaderControls } from './RuntimeFlowHeaderControls.tsx';
import type { NumberBound } from '../../../shared/registryDerivedSettingsMaps.ts';
import { parseBoundedNumber, toRuntimeDraft } from '../state/RuntimeFlowDraftNormalization.ts';
import {
  RUNTIME_SETTING_DEFAULTS,
  SETTINGS_AUTOSAVE_DEBOUNCE_MS,
} from '../../../stores/settingsManifest.ts';
import { deriveRuntimeFlowStatus } from '../state/RuntimeFlowStatus.ts';
import { collectRuntimeFlowDraftPayload } from '../state/RuntimeFlowDraftPayload.ts';
import {
  buildRuntimeLlmTokenProfileLookup,
  createRuntimeModelTokenDefaultsResolver,
  deriveRuntimeLlmTokenContractPresetMax,
} from '../state/RuntimeFlowModelTokenDefaults.ts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { IndexingLlmConfigResponse as RuntimeSettingsLlmConfigResponse } from '../../indexing/types.ts';
import type { RuntimeSettings } from '../state/runtimeSettingsAuthority.ts';
import type { SettingsCategoryId } from '../state/SettingsCategoryRegistry.ts';
import { SETTINGS_CATEGORY_KEYS } from '../state/SettingsCategoryRegistry.ts';
import { CategoryPanel } from './CategoryPanel.tsx';

const SourceStrategySection = lazy(async () => {
  const module = await import('../sections/PipelineSourceStrategySection.tsx');
  return { default: module.PipelineSourceStrategySection };
});

// WHY: Typed form entry replaces all-string draft. String↔typed conversion
// happens at input level (FormCsvInput, parseInt in onChange), not form state.

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

// WHY: Helper to test whether a section ID belongs to a runtime category panel.
function isRuntimeCategorySection(id: PipelineSectionId): id is SettingsCategoryId {
  return (SETTINGS_CATEGORY_KEYS as readonly string[]).includes(id);
}

export function PipelineSettingsPage() {
  const category = useUiStore((s) => s.category);
  const isAll = category === 'all';
  const convergenceSettingsReady = useSettingsAuthorityStore((s) => s.snapshot.convergenceReady);
  const sourceStrategySettingsReady = useSettingsAuthorityStore(
    (s) => s.snapshot.sourceStrategyReady,
  );
  const runtimeReadyFlag = useSettingsAuthorityStore((s) => s.snapshot.runtimeReady);

  /* ── Runtime settings store ── */
  const runtimeAutoSaveEnabled = useUiStore((s) => s.runtimeAutoSaveEnabled);
  const setRuntimeAutoSaveEnabled = useUiStore((s) => s.setRuntimeAutoSaveEnabled);
  const storeValues = useRuntimeSettingsValueStore((s) => s.values);
  const storeDirty = useRuntimeSettingsValueStore((s) => s.dirty);
  const storeHydrated = useRuntimeSettingsValueStore((s) => s.hydrated);

  const runtimeManifestDefaults = useMemo(() => toRuntimeDraft(RUNTIME_SETTING_DEFAULTS), []);
  const runtimeDraft = (storeValues ?? runtimeManifestDefaults) as Record<string, unknown>;

  const [runtimeSaveStatus, setRuntimeSaveStatus] = useState<RuntimeEditorSaveStatus>({ kind: 'idle', message: '' });
  const storePayload = (storeValues ?? {}) as RuntimeSettings;
  const {
    isLoading: runtimeSettingsLoading,
    isSaving: runtimeSettingsSaving,
    saveNow,
  } = useRuntimeSettingsAuthority({
    payload: storePayload,
    dirty: storeDirty,
    autoSaveEnabled: runtimeAutoSaveEnabled,
    initialHydrationApplied: storeHydrated,
    onPersisted: (result) => {
      if (result.ok) {
        setRuntimeSaveStatus({ kind: 'ok', message: 'Runtime settings saved.' });
      } else {
        setRuntimeSaveStatus({ kind: 'error', message: 'Runtime settings save failed.' });
      }
    },
    onError: (error) => {
      setRuntimeSaveStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Runtime settings save failed.',
      });
    },
  });

  const runtimeSettingsReady = runtimeReadyFlag && !runtimeSettingsLoading;
  const runtimeAutoSaveDelaySeconds = (SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime / 1000).toFixed(1);

  const { runtimeStatusClass, runtimeStatusText } = deriveRuntimeFlowStatus({
    runtimeSettingsSaving,
    runtimeSettingsReady,
    runtimeSaveState: runtimeSaveStatus.kind,
    runtimeSaveMessage: runtimeSaveStatus.message,
    runtimeDirty: storeDirty,
    runtimeAutoSaveEnabled,
    runtimeAutoSaveDelaySeconds,
  });

  // WHY: LLM config query + token resolver needed for reset-to-defaults.
  const { data: indexingLlmConfig } = useQuery({
    queryKey: ['indexing', 'llm-config'],
    queryFn: () => api.get<RuntimeSettingsLlmConfigResponse>('/indexing/llm-config'),
  });

  const llmTokenProfileLookup = useMemo(() => buildRuntimeLlmTokenProfileLookup({
    indexingLlmConfig,
  }), [indexingLlmConfig]);

  const llmTokenContractPresetMax = useMemo(() => deriveRuntimeLlmTokenContractPresetMax({
    indexingLlmConfig,
    runtimeManifestDefaults,
  }), [indexingLlmConfig, runtimeManifestDefaults]);

  const resolveModelTokenDefaults = useMemo(() => createRuntimeModelTokenDefaultsResolver({
    indexingLlmConfig,
    llmTokenProfileLookup,
    llmTokenContractPresetMax,
    runtimeManifestDefaults,
  }), [indexingLlmConfig, llmTokenContractPresetMax, llmTokenProfileLookup, runtimeManifestDefaults]);

  function resetToDefaults() {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Reset all runtime settings to defaults? This overwrites current unsaved runtime edits.',
      );
      if (!confirmed) return;
    }
    const resetPayload = collectRuntimeFlowDraftPayload({
      nextRuntimeDraft: runtimeManifestDefaults,
      runtimeManifestDefaults,
      resolveModelTokenDefaults,
    });
    useRuntimeSettingsValueStore.getState().updateKeys(resetPayload as Partial<RuntimeSettings>);
  }

  /* ── CategoryPanel change handlers ── */
  const onBoolChange = useCallback((key: string, next: boolean) => {
    useRuntimeSettingsValueStore.getState().updateKey(key, next);
  }, []);

  const onNumberChange = useCallback((key: string, eventValue: string, bounds: NumberBound) => {
    const current = (storeValues as Record<string, unknown> | null)?.[key];
    const fallback = typeof current === 'number' ? current : 0;
    const next = parseBoundedNumber(eventValue, fallback, bounds);
    useRuntimeSettingsValueStore.getState().updateKey(key, next);
  }, [storeValues]);

  const onStringChange = useCallback((key: string, value: string) => {
    useRuntimeSettingsValueStore.getState().updateKey(key, value);
  }, []);

  /* ── Source strategy state ── */
  const [sourceStrategySaveState, setSourceStrategySaveState] = useState<{
    kind: 'idle' | 'ok' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });
  const [sourceDraftMode, setSourceDraftMode] = useState<'create' | 'edit' | null>(null);
  const [sourceDraftSourceId, setSourceDraftSourceId] = useState<string | null>(null);
  const [sourceDraft, setSourceDraft] = useState<SourceFormEntry>(() => defaultSourceFormEntry());

  /* ── Convergence state ── */
  const [convergenceSaveStatus, setConvergenceSaveStatus] = useState<{
    kind: 'idle' | 'ok' | 'partial' | 'error';
    message: string;
  }>({ kind: 'idle', message: '' });

  const [activeSection, setActiveSection] = usePersistedTab<PipelineSectionId>(
    'pipeline-settings:active-section',
    'flow',
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
          setConvergenceSaveStatus({ kind: 'ok', message: 'Scoring settings saved.' });
          return;
        }
        if (rejectedKeys.length > 0) {
          setConvergenceSaveStatus({
            kind: 'partial',
            message: `Partially saved. Rejected ${rejectedKeys.length} key(s): ${rejectedKeys.join(', ')}`,
          });
          return;
        }
        setConvergenceSaveStatus({ kind: 'error', message: 'Scoring settings save failed.' });
      },
      onError: (error) => {
        setConvergenceSaveStatus({
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
    saveState: convergenceSaveStatus.kind,
    saveMessage: convergenceSaveStatus.message,
    dirty,
  });

  const convergenceStatusClass = resolvePipelineConvergenceStatusClass({
    isSaving,
    saveState: convergenceSaveStatus.kind,
    dirty,
  });
  const sourceStrategyStatus = resolveSourceStrategyStatus({
    isSaving: sourceStrategySaving,
    saveState: sourceStrategySaveState,
  });

  function beginCreateSourceDraft() {
    setSourceDraftMode('create');
    setSourceDraftSourceId(null);
    setSourceDraft(defaultSourceFormEntry());
  }

  function beginEditSourceDraft(entry: SourceEntry) {
    setSourceDraftMode('edit');
    setSourceDraftSourceId(entry.sourceId);
    setSourceDraft(entryToFormEntry(entry));
  }

  function cancelSourceDraft() {
    setSourceDraftMode(null);
    setSourceDraftSourceId(null);
  }

  function updateSourceDraft(key: SourceFormEntryField, value: string | number | boolean | string[]) {
    setSourceDraft((previous) => updateFormEntryByPath(previous, key, value));
  }

  function saveEntryDraft() {
    const host = String(sourceDraft.host || '').trim();
    if (!host) {
      setSourceStrategySaveState({ kind: 'error', message: 'Host is required.' });
      return;
    }
    const payload = formEntryToPayload(sourceDraft);
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

  /* ── Runtime header controls (shared across all 5 runtime category sections) ── */
  const runtimeHeaderControls = (
    <RuntimeFlowHeaderControls
      runtimeSettingsReady={runtimeSettingsReady}
      runtimeSettingsSaving={runtimeSettingsSaving}
      runtimeAutoSaveEnabled={runtimeAutoSaveEnabled}
      runtimeAutoSaveDelaySeconds={runtimeAutoSaveDelaySeconds}
      onSaveNow={saveNow}
      onToggleRuntimeAutoSaveEnabled={() => setRuntimeAutoSaveEnabled(!runtimeAutoSaveEnabled)}
      onResetToDefaults={resetToDefaults}
    />
  );

  const headerActions = (
    <>
            {isRuntimeCategorySection(activeSection) ? (
              <div className="flex flex-wrap items-center gap-2">
                {runtimeStatusText ? (
                  <p className={`sf-text-label font-semibold ${runtimeStatusClass}`}>
                    {runtimeStatusText}
                  </p>
                ) : null}
                {runtimeHeaderControls}
              </div>
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
        {/* Runtime category panels (flow, planner, fetcher, extraction, validation) */}
        {isRuntimeCategorySection(activeSection) && (
          <CategoryPanel
            categoryId={activeSection}
            runtimeDraft={runtimeDraft}
            onBoolChange={onBoolChange}
            onNumberChange={onNumberChange}
            onStringChange={onStringChange}
            disabled={!runtimeSettingsReady}
          />
        )}

        {/* Convergence */}
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
