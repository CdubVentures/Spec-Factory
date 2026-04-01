import { Suspense, lazy, useCallback, useMemo, useState } from 'react';
import {
  useSourceStrategyAuthority,
  type SourceEntry,
} from '../state/sourceStrategyAuthority.ts';
import { useUiStore } from '../../../stores/uiStore.ts';
import { useSettingsAuthorityStore } from '../../../stores/settingsAuthorityStore.ts';
import { PIPELINE_SECTION_IDS, PipelineSettingsPageShell, type PipelineSectionId } from './PipelineSettingsPageShell.tsx';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import {
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

const DeterministicStrategySection = lazy(async () => {
  const module = await import('../sections/PipelineDeterministicStrategySection.tsx');
  return { default: module.PipelineDeterministicStrategySection };
});

// WHY: Helper to test whether a section ID belongs to a runtime category panel.
function isRuntimeCategorySection(id: PipelineSectionId): id is SettingsCategoryId {
  return (SETTINGS_CATEGORY_KEYS as readonly string[]).includes(id);
}

export function PipelineSettingsPage() {
  const category = useUiStore((s) => s.category);
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

  const [activeSection, setActiveSection] = usePersistedTab<PipelineSectionId>(
    'pipeline-settings:active-section',
    'global',
    { validValues: PIPELINE_SECTION_IDS },
  );

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
    enabled: true,
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

  const sourceStrategyHydrated = sourceStrategyIsError || (sourceStrategySettingsReady && !sourceStrategyLoading);

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
            {activeSection === 'source-strategy' ? (
              <div className="flex items-center gap-2">
                {sourceStrategyStatus ? (
                  <span className={sourceStrategyStatus.className}>
                    {sourceStrategyStatus.text}
                  </span>
                ) : null}
                <button
                    type="button"
                    onClick={beginCreateSourceDraft}
                    disabled={sourceStrategySaving}
                    className="rounded sf-primary-button px-2.5 py-1 sf-text-label font-semibold transition-colors disabled:opacity-50"
                  >
                    Add Source
                  </button>
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

        {/* Source Strategy */}
        {activeSection === 'source-strategy' && (
          <Suspense fallback={<p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Loading source strategy section...</p>}>
            <SourceStrategySection
              category={category}
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

        {/* Deterministic Strategy */}
        {activeSection === 'deterministic-strategy' && (
          <Suspense fallback={<p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Loading deterministic strategy...</p>}>
            <DeterministicStrategySection />
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
      category={category}
    />
  );
}
