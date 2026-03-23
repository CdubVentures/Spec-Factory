import { Suspense, lazy, useMemo, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { Tip } from '../../../shared/ui/feedback/Tip';
import { RuntimeFlowCardHeader } from './RuntimeFlowCardHeader';
import { RuntimeFlowCoreStepsSection } from '../sections/RuntimeFlowCoreStepsSection';
import {
  buildRuntimeLlmTokenProfileLookup,
  createRuntimeModelTokenDefaultsResolver,
  deriveRuntimeLlmTokenContractPresetMax,
} from '../state/RuntimeFlowModelTokenDefaults';
import { RuntimeFlowHeaderControls } from './RuntimeFlowHeaderControls';
import { collectRuntimeFlowDraftPayload } from '../state/RuntimeFlowDraftPayload';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore';
import {
  RUNTIME_NUMBER_BOUNDS,
  RESUME_MODE_OPTIONS,
  parseBoundedNumber,
  toRuntimeDraft,
  type NumberBound,
  type RuntimeDraft,
} from '../state/RuntimeFlowDraftNormalization';
import { deriveRuntimeFlowControlLocks, deriveRuntimeStepEnabledMap } from '../state/RuntimeFlowStateDerivations';
import { RuntimeFlowStepDetailHeader } from './RuntimeFlowStepDetailHeader';
import { RuntimeFlowStepSidebar } from './RuntimeFlowStepSidebar';
import { deriveRuntimeFlowStatus } from '../state/RuntimeFlowStatus';
import { RUNTIME_STEP_IDS, RUNTIME_STEPS, RUNTIME_SUB_STEPS, type RuntimeStepId } from '../state/RuntimeFlowStepRegistry';
import { LlmConfigWarningBanner } from './LlmConfigWarningBanner';
import {
  RUNTIME_SETTING_DEFAULTS,
  SETTINGS_AUTOSAVE_DEBOUNCE_MS,
} from '../../../stores/settingsManifest';
import { useRuntimeSettingsAuthority, type RuntimeSettings, type RuntimeEditorSaveStatus } from '../state/runtimeSettingsAuthority';
import { useSettingsAuthorityStore } from '../../../stores/settingsAuthorityStore';
import { useUiStore } from '../../../stores/uiStore';
import { usePersistedTab } from '../../../stores/tabStore';

function renderDisabledHint(message: string) {
  return (
    <div className="rounded sf-callout sf-callout-neutral px-3 py-2 sf-text-label">
      {message}
    </div>
  );
}

function runtimeSubStepDomId(id: string) {
  return `runtime-flow-substep-${id}`;
}

const RuntimeFlowAutomationSection = lazy(async () => {
  const module = await import('../sections/RuntimeFlowAutomationSection');
  return { default: module.RuntimeFlowAutomationSection };
});

const RuntimeFlowFetchNetworkSection = lazy(async () => {
  const module = await import('../sections/RuntimeFlowFetchNetworkSection');
  return { default: module.RuntimeFlowFetchNetworkSection };
});

const RuntimeFlowBrowserRenderingSection = lazy(async () => {
  const module = await import('../sections/RuntimeFlowBrowserRenderingSection');
  return { default: module.RuntimeFlowBrowserRenderingSection };
});

const RuntimeFlowParsingSection = lazy(async () => {
  const module = await import('../sections/RuntimeFlowParsingSection');
  return { default: module.RuntimeFlowParsingSection };
});

const RuntimeFlowObservabilitySection = lazy(async () => {
  const module = await import('../sections/RuntimeFlowObservabilitySection');
  return { default: module.RuntimeFlowObservabilitySection };
});

const RuntimeFlowOcrSection = lazy(async () => {
  const module = await import('../sections/RuntimeFlowOcrSection');
  return { default: module.RuntimeFlowOcrSection };
});

interface RuntimeSettingsFlowCardProps {
  actionPortalTarget?: HTMLElement | null;
  suppressInlineHeaderControls?: boolean;
}

// WHY: Single canonical contract — no local duplicates.
import type { IndexingLlmConfigResponse as RuntimeSettingsLlmConfigResponse } from '../../indexing/types.ts';

export function RuntimeSettingsFlowCard({
  actionPortalTarget = null,
  suppressInlineHeaderControls = false,
}: RuntimeSettingsFlowCardProps = {}) {
  const runtimeAutoSaveEnabled = useUiStore((state) => state.runtimeAutoSaveEnabled);
  const setRuntimeAutoSaveEnabled = useUiStore((state) => state.setRuntimeAutoSaveEnabled);
  const runtimeReadyFlag = useSettingsAuthorityStore((state) => state.snapshot.runtimeReady);

  // SSOT: read directly from the Zustand store — no local copy, no stale bootstrap.
  const storeValues = useRuntimeSettingsValueStore((s) => s.values);
  const storeDirty = useRuntimeSettingsValueStore((s) => s.dirty);
  const storeHydrated = useRuntimeSettingsValueStore((s) => s.hydrated);

  const runtimeManifestDefaults = useMemo(() => toRuntimeDraft(RUNTIME_SETTING_DEFAULTS), []);
  // WHY: Store is normalized at hydration time (Phase 3). Just cast, no re-normalize.
  const runtimeDraft = (storeValues as unknown as RuntimeDraft) ?? runtimeManifestDefaults;

  const [saveStatus, setSaveStatus] = useState<RuntimeEditorSaveStatus>({ kind: 'idle', message: '' });

  // WHY: Authority hook manages fetch, auto-save, save mutation, and unload guard.
  // Reads payload from the store (not a local copy), so auto-save fingerprints match store state.
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
        setSaveStatus({ kind: 'ok', message: 'Runtime settings saved.' });
      } else {
        setSaveStatus({ kind: 'error', message: 'Runtime settings save failed.' });
      }
    },
    onError: (error) => {
      setSaveStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Runtime settings save failed.',
      });
    },
  });

  const runtimeDirty = storeDirty;
  const runtimeSaveState = saveStatus.kind;
  const runtimeSaveMessage = saveStatus.message;

  const [activeStep, setActiveStep] = usePersistedTab<RuntimeStepId>(
    'pipeline-settings:runtime:active-step',
    'run-setup',
    { validValues: RUNTIME_STEP_IDS },
  );

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
  const {
    dynamicCrawleeEnabled,
    scannedPdfOcrEnabled,
    reextractIndexed,
    runtimeTraceEnabled,
  } = runtimeDraft;

  const runtimeSettingsReady = runtimeReadyFlag && !runtimeSettingsLoading;
  const runtimeAutoSaveDelaySeconds = (SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime / 1000).toFixed(1);
  const {
    dynamicFetchControlsLocked,
    ocrControlsLocked,
    plannerControlsLocked,
    reextractWindowLocked,
    traceControlsLocked,
  } = deriveRuntimeFlowControlLocks({
    dynamicCrawleeEnabled,
    scannedPdfOcrEnabled,
    reextractIndexed,
    runtimeTraceEnabled,
  });

  const stepEnabled = useMemo<Record<RuntimeStepId, boolean>>(() => deriveRuntimeStepEnabledMap({
    dynamicCrawleeEnabled,
    scannedPdfOcrEnabled,
  }), [
    dynamicCrawleeEnabled,
    scannedPdfOcrEnabled,
  ]);
  const activeRuntimeStep = useMemo(
    () => RUNTIME_STEPS.find((step) => step.id === activeStep) || RUNTIME_STEPS[0],
    [activeStep],
  );
  const activeRuntimeSubSteps = useMemo(
    () => RUNTIME_SUB_STEPS[activeStep] || [],
    [activeStep],
  );
  const scrollToRuntimeSubStep = useCallback((subStepId: string) => {
    if (typeof document === 'undefined') return;
    const target = document.getElementById(runtimeSubStepDomId(subStepId));
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const {
    runtimeStatusClass,
    runtimeStatusText,
  } = deriveRuntimeFlowStatus({
    runtimeSettingsSaving,
    runtimeSettingsReady,
    runtimeSaveState,
    runtimeSaveMessage,
    runtimeDirty,
    runtimeAutoSaveEnabled,
    runtimeAutoSaveDelaySeconds,
  });

  // WHY: Writes directly to the Zustand store (SSOT). No local copy.
  const updateDraft = useCallback(<K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => {
    useRuntimeSettingsValueStore.getState().updateKey(key as string, value);
  }, []);

  const onNumberChange = useCallback(<K extends keyof RuntimeDraft>(
    key: K,
    eventValue: string,
    bounds: NumberBound,
  ) => {
    const current = runtimeDraft[key];
    const fallback = typeof current === 'number' ? current : 0;
    const next = parseBoundedNumber(eventValue, fallback, bounds) as RuntimeDraft[K];
    useRuntimeSettingsValueStore.getState().updateKey(key as string, next);
  }, [runtimeDraft]);

  const getNumberBounds = useCallback(<K extends keyof RuntimeDraft>(key: K): NumberBound => {
    return RUNTIME_NUMBER_BOUNDS[key as keyof typeof RUNTIME_NUMBER_BOUNDS];
  }, []);

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
    setActiveStep('run-setup');
  }

  const inputCls = 'sf-input w-full py-2 sf-text-label leading-5 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60';
  const panelDisabledCls = runtimeSettingsReady ? '' : 'opacity-70';
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

  return (
    <>
      {actionPortalTarget ? createPortal(runtimeHeaderControls, actionPortalTarget) : null}
      <div className="rounded sf-surface-card p-4 md:p-5 space-y-3.5 shadow-sm">
      <LlmConfigWarningBanner
        llmProvider={runtimeDraft.llmProvider}
        llmBaseUrl={runtimeDraft.llmBaseUrl}
        openaiApiKey={runtimeDraft.openaiApiKey}
        llmModelPlan={runtimeDraft.llmModelPlan}
        llmProviderRegistryJson={runtimeDraft.llmProviderRegistryJson}
      />
      <RuntimeFlowCardHeader
        runtimeStatusClass={runtimeStatusClass}
        runtimeStatusText={runtimeStatusText}
        showInlineHeaderControls={!actionPortalTarget && !suppressInlineHeaderControls}
        runtimeHeaderControls={runtimeHeaderControls}
      />
      <div className={`grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)] ${panelDisabledCls}`}>
        <RuntimeFlowStepSidebar
          runtimeSteps={RUNTIME_STEPS}
          activeStep={activeStep}
          stepEnabled={stepEnabled}
          runtimeSettingsReady={runtimeSettingsReady}
          onSelectStep={(stepId) => setActiveStep(stepId as RuntimeStepId)}
          TipComponent={Tip}
        />

        <section className="rounded sf-surface-elevated p-3 md:p-4 space-y-3 min-h-0 overflow-x-hidden">
          <RuntimeFlowStepDetailHeader
            activeStep={activeStep}
            activeRuntimeStep={activeRuntimeStep}
            activeRuntimeSubSteps={activeRuntimeSubSteps}
            runtimeSettingsReady={runtimeSettingsReady}
            onRuntimeSubStepClick={scrollToRuntimeSubStep}
            TipComponent={Tip}
          />
          <RuntimeFlowCoreStepsSection
            activeStep={activeStep}
            runtimeDraft={runtimeDraft}
            runtimeSettingsReady={runtimeSettingsReady}
            reextractWindowLocked={reextractWindowLocked}
            plannerControlsLocked={plannerControlsLocked}
            inputCls={inputCls}
            runtimeSubStepDomId={runtimeSubStepDomId}
            resumeModeOptions={RESUME_MODE_OPTIONS}
            updateDraft={updateDraft}
            onNumberChange={onNumberChange}
            getNumberBounds={getNumberBounds}
            renderDisabledHint={renderDisabledHint}
          />

          {activeStep === 'automation' ? (
            <Suspense
              fallback={(
                <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                  Loading automation section...
                </div>
              )}
            >
              <RuntimeFlowAutomationSection
                runtimeDraft={runtimeDraft}
                runtimeSettingsReady={runtimeSettingsReady}
                inputCls={inputCls}
                runtimeSubStepDomId={runtimeSubStepDomId}
                updateDraft={updateDraft}
                onNumberChange={onNumberChange}
                getNumberBounds={getNumberBounds}
              />
            </Suspense>
          ) : null}

          {activeStep === 'observability-trace' ? (
            <Suspense
              fallback={(
                <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                  Loading observability section...
                </div>
              )}
            >
              <RuntimeFlowObservabilitySection
                runtimeDraft={runtimeDraft}
                runtimeSettingsReady={runtimeSettingsReady}
                traceControlsLocked={traceControlsLocked}
                inputCls={inputCls}
                runtimeSubStepDomId={runtimeSubStepDomId}
                updateDraft={updateDraft}
                onNumberChange={onNumberChange}
                getNumberBounds={getNumberBounds}
                renderDisabledHint={renderDisabledHint}
              />
            </Suspense>
          ) : null}

          {activeStep === 'fetch-network' ? (
            <Suspense
              fallback={(
                <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                  Loading fetch and network section...
                </div>
              )}
            >
              <RuntimeFlowFetchNetworkSection
                runtimeDraft={runtimeDraft}
                runtimeSettingsReady={runtimeSettingsReady}
                dynamicFetchControlsLocked={dynamicFetchControlsLocked}
                inputCls={inputCls}
                runtimeSubStepDomId={runtimeSubStepDomId}
                updateDraft={updateDraft}
                onNumberChange={onNumberChange}
                getNumberBounds={getNumberBounds}
              />
            </Suspense>
          ) : null}

          {activeStep === 'browser-rendering' ? (
            <Suspense
              fallback={(
                <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                  Loading browser and rendering section...
                </div>
              )}
            >
              <RuntimeFlowBrowserRenderingSection
                runtimeDraft={runtimeDraft}
                runtimeSettingsReady={runtimeSettingsReady}
                dynamicFetchControlsLocked={dynamicFetchControlsLocked}
                inputCls={inputCls}
                runtimeSubStepDomId={runtimeSubStepDomId}
                updateDraft={updateDraft}
                onNumberChange={onNumberChange}
                getNumberBounds={getNumberBounds}
                renderDisabledHint={renderDisabledHint}
              />
            </Suspense>
          ) : null}

          {activeStep === 'parsing' ? (
            <Suspense
              fallback={(
                <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                  Loading parsing section...
                </div>
              )}
            >
              <RuntimeFlowParsingSection
                runtimeDraft={runtimeDraft}
                runtimeSettingsReady={runtimeSettingsReady}
                inputCls={inputCls}
                runtimeSubStepDomId={runtimeSubStepDomId}
                updateDraft={updateDraft}
                onNumberChange={onNumberChange}
                getNumberBounds={getNumberBounds}
              />
            </Suspense>
          ) : null}

          {activeStep === 'ocr' ? (
            <Suspense
              fallback={(
                <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                  Loading ocr section...
                </div>
              )}
            >
              <RuntimeFlowOcrSection
                runtimeDraft={runtimeDraft}
                runtimeSettingsReady={runtimeSettingsReady}
                ocrControlsLocked={ocrControlsLocked}
                inputCls={inputCls}
                runtimeSubStepDomId={runtimeSubStepDomId}
                updateDraft={updateDraft}
                onNumberChange={onNumberChange}
                getNumberBounds={getNumberBounds}
                renderDisabledHint={renderDisabledHint}
              />
            </Suspense>
          ) : null}


        </section>
      </div>
      </div>
    </>
  );
}




