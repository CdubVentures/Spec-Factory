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
import type { NumberBound } from '../../../shared/registryDerivedSettingsMaps.ts';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import { TypedConfirmModal } from '../../../shared/ui/feedback/TypedConfirmModal.tsx';
import { parseBoundedNumber, toRuntimeDraft } from '../state/RuntimeFlowDraftNormalization.ts';
import {
  RUNTIME_SETTING_DEFAULTS,
} from '../../../stores/settingsManifest.ts';
import { collectRuntimeFlowDraftPayload } from '../state/RuntimeFlowDraftPayload.ts';
import {
  buildRuntimeLlmTokenProfileLookup,
  createRuntimeModelTokenDefaultsResolver,
  deriveRuntimeLlmTokenContractPresetMax,
} from '../state/RuntimeFlowModelTokenDefaults.ts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import type { IndexingLlmConfigResponse as RuntimeSettingsLlmConfigResponse } from '../../indexing/types.ts';
import type { RuntimeSettings } from '../state/runtimeSettingsAuthority.ts';
import type { SettingsCategoryId } from '../state/SettingsCategoryRegistry.ts';
import { SETTINGS_CATEGORY_KEYS, findCategory } from '../state/SettingsCategoryRegistry.ts';
import { CategoryPanel } from './CategoryPanel.tsx';
import {
  buildPipelineSectionResetPayload,
  isPipelineSectionResettable,
} from '../state/pipelineResetScope.ts';
import {
  buildAllModuleSettingsResetPayloads,
  buildModuleSettingsResetPayload,
  findModuleIdForSection,
} from '../state/moduleSettingsResetScope.ts';
import { putModuleSettings, useModuleSettingsAuthority } from '../state/moduleSettingsAuthority.ts';
import { MODULE_SETTINGS_SECTIONS } from '../state/moduleSettingsSections.generated.ts';

const RESET_PANEL_PHRASE = 'RESET';
const RESET_ALL_PHRASE = 'RESET ALL';

const SourceStrategySection = lazy(async () => {
  const module = await import('../sections/PipelineSourceStrategySection.tsx');
  return { default: module.PipelineSourceStrategySection };
});

const DeterministicStrategySection = lazy(async () => {
  const module = await import('../sections/PipelineDeterministicStrategySection.tsx');
  return { default: module.PipelineDeterministicStrategySection };
});

const ModuleSettingsPanel = lazy(async () => {
  const module = await import('./ModuleSettingsPanel.tsx');
  return { default: module.ModuleSettingsPanel };
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
  const storeValues = useRuntimeSettingsValueStore((s) => s.values);

  const runtimeManifestDefaults = useMemo(() => toRuntimeDraft(RUNTIME_SETTING_DEFAULTS), []);
  const runtimeDraft = (storeValues ?? runtimeManifestDefaults) as Record<string, unknown>;

  const [runtimeSaveStatus, setRuntimeSaveStatus] = useState<RuntimeEditorSaveStatus>({ kind: 'idle', message: '' });
  const {
    isLoading: runtimeSettingsLoading,
    isSaving: runtimeSettingsSaving,
    saveNow,
  } = useRuntimeSettingsAuthority({
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

  const [resetScope, setResetScope] = useState<'panel' | 'all' | null>(null);

  const queryClient = useQueryClient();

  const applyResetAll = useCallback(async () => {
    // WHY: "Reset all" covers every setting surface on the page — flat runtime
    // settings AND all per-finder module panels for the current category.
    // Source-strategy hosts and spec-seed templates are user data, not
    // defaults, so they are intentionally preserved (see modal copy).
    const resetPayload = collectRuntimeFlowDraftPayload({
      nextRuntimeDraft: runtimeManifestDefaults,
      runtimeManifestDefaults,
      resolveModelTokenDefaults,
    });
    useRuntimeSettingsValueStore.getState().updateKeys(resetPayload as Partial<RuntimeSettings>);
    saveNow();

    if (!category) return;
    const batches = buildAllModuleSettingsResetPayloads();
    const results = await Promise.allSettled(
      batches.map(({ moduleId, settings }) =>
        putModuleSettings({ category, moduleId, settings, queryClient }),
      ),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed > 0) {
      setRuntimeSaveStatus({
        kind: 'error',
        message: `Runtime settings reset; ${failed}/${batches.length} module panels failed — re-click Reset all to retry.`,
      });
    }
  }, [runtimeManifestDefaults, resolveModelTokenDefaults, saveNow, category, queryClient]);

  /* ── CategoryPanel change handlers — persist immediately on every change ── */
  const onBoolChange = useCallback((key: string, next: boolean) => {
    useRuntimeSettingsValueStore.getState().updateKey(key, next);
    saveNow();
  }, [saveNow]);

  const onNumberChange = useCallback((key: string, eventValue: string, bounds: NumberBound) => {
    const current = (storeValues as Record<string, unknown> | null)?.[key];
    const fallback = typeof current === 'number' ? current : 0;
    const next = parseBoundedNumber(eventValue, fallback, bounds);
    useRuntimeSettingsValueStore.getState().updateKey(key, next);
    saveNow();
  }, [storeValues, saveNow]);

  const onStringChange = useCallback((key: string, value: string) => {
    useRuntimeSettingsValueStore.getState().updateKey(key, value);
    saveNow();
  }, [saveNow]);

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

  const activeModuleId = useMemo(() => findModuleIdForSection(activeSection), [activeSection]);

  const moduleSettingsAuthority = useModuleSettingsAuthority({
    category: category ?? '',
    moduleId: activeModuleId ?? '',
  });

  const activeSectionResettable = useMemo(() => {
    if (isPipelineSectionResettable(activeSection)) return true;
    return Boolean(activeModuleId) && Boolean(category);
  }, [activeSection, activeModuleId, category]);

  const activeSectionLabel = useMemo(() => {
    if (isRuntimeCategorySection(activeSection)) {
      return findCategory(activeSection)?.label ?? activeSection;
    }
    const moduleSection = MODULE_SETTINGS_SECTIONS.find((s) => s.id === activeSection);
    if (moduleSection) return moduleSection.label;
    return activeSection;
  }, [activeSection]);

  const applyResetActivePanel = useCallback(() => {
    if (activeModuleId) {
      const payload = buildModuleSettingsResetPayload(activeModuleId);
      if (Object.keys(payload).length === 0) return;
      moduleSettingsAuthority.saveSettings(payload);
      return;
    }
    if (!isPipelineSectionResettable(activeSection)) return;
    const payload = buildPipelineSectionResetPayload(activeSection, runtimeManifestDefaults);
    if (Object.keys(payload).length === 0) return;
    useRuntimeSettingsValueStore.getState().updateKeys(payload as Partial<RuntimeSettings>);
    saveNow();
  }, [activeSection, activeModuleId, moduleSettingsAuthority, runtimeManifestDefaults, saveNow]);

  const onResetConfirm = useCallback(() => {
    if (resetScope === 'panel') applyResetActivePanel();
    else if (resetScope === 'all') applyResetAll();
    setResetScope(null);
  }, [resetScope, applyResetActivePanel, applyResetAll]);

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

  const headerActions = (
    <>
      {isRuntimeCategorySection(activeSection) && (runtimeSettingsSaving || runtimeSaveStatus.kind === 'error') ? (
        <div className="flex items-center gap-2">
          {runtimeSettingsSaving ? (
            <p className="sf-text-label font-semibold sf-status-text-info">Saving...</p>
          ) : (
            <p className="sf-text-label font-semibold sf-status-text-danger">{runtimeSaveStatus.message}</p>
          )}
        </div>
      ) : null}
      {activeSectionResettable ? (
        <button
          onClick={() => setResetScope('panel')}
          disabled={!runtimeSettingsReady || runtimeSettingsSaving || moduleSettingsAuthority.isSaving}
          className="sf-danger-button px-3 py-1.5 sf-text-label disabled:opacity-50"
          title={`Reset the ${activeSectionLabel} panel to defaults.`}
        >
          Reset panel
        </button>
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

  const sidebarFooter = (
    <div className="flex justify-start">
      <button
        type="button"
        onClick={() => setResetScope('all')}
        disabled={!runtimeSettingsReady || runtimeSettingsSaving}
        className="sf-icon-button rounded border px-2.5 py-1 sf-text-caption disabled:opacity-40"
        style={{ color: 'var(--sf-muted)', borderColor: 'var(--sf-surface-border)' }}
        title="Reset every runtime setting and every finder module panel (for the current category) to defaults. Custom source-strategy rules and spec-seed templates are preserved."
      >
        Reset all
      </button>
    </div>
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
          <Suspense fallback={<Spinner className="h-8 w-8 mx-auto mt-12" />}>
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
          <Suspense fallback={<Spinner className="h-8 w-8 mx-auto mt-12" />}>
            <DeterministicStrategySection />
          </Suspense>
        )}

        {/* Module Settings (auto-derived from generated sections) */}
        {MODULE_SETTINGS_SECTIONS.map(({ id, moduleId }) =>
          activeSection === id ? (
            <Suspense key={id} fallback={<Spinner className="h-8 w-8 mx-auto mt-12" />}>
              <ModuleSettingsPanel moduleId={moduleId} />
            </Suspense>
          ) : null
        )}
    </>
  );

  return (
    <>
      <PipelineSettingsPageShell
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        headerActions={headerActions}
        activePanel={activePanel}
        category={category}
        sidebarFooter={sidebarFooter}
      />
      <TypedConfirmModal
        open={resetScope !== null}
        title={resetScope === 'all' ? 'Reset all Pipeline settings?' : `Reset the ${activeSectionLabel} panel?`}
        body={
          resetScope === 'all'
            ? 'This resets every runtime setting and every finder module panel (for the current category) to defaults. Custom source-strategy rules and spec-seed templates are preserved.'
            : `This returns the ${activeSectionLabel} panel to its default values. Other panels are untouched.`
        }
        confirmPhrase={resetScope === 'all' ? RESET_ALL_PHRASE : RESET_PANEL_PHRASE}
        confirmLabel={resetScope === 'all' ? 'Reset all' : 'Reset panel'}
        onConfirm={onResetConfirm}
        onCancel={() => setResetScope(null)}
      />
    </>
  );
}
