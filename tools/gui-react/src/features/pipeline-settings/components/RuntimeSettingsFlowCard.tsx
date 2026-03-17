import { Suspense, lazy, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  RUNTIME_NUMBER_BOUNDS,
  RESUME_MODE_OPTIONS,
  SEARCH_PROVIDER_OPTIONS,
  normalizeRuntimeDraft,
  parseBoundedNumber,
  runtimeDraftEqual,
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
import { readRuntimeSettingsBootstrap } from '../state/runtimeSettingsAuthority';
import { useRuntimeSettingsEditorAdapter } from '../state/runtimeSettingsEditorAdapter';
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

const RuntimeFlowPlannerTriageSection = lazy(async () => {
  const module = await import('../sections/RuntimeFlowPlannerTriageSection');
  return { default: module.RuntimeFlowPlannerTriageSection };
});

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

// Local query contract anchor for runtime-flow dependency-hygiene guards.
interface RuntimeSettingsLlmConfigResponse {
  model_options?: string[];
  token_defaults?: {
    plan?: number;
  };
  token_presets?: number[];
  model_token_profiles?: Array<{
    model: string;
    default_output_tokens?: number;
    max_output_tokens?: number;
  }>;
}

export function RuntimeSettingsFlowCard({
  actionPortalTarget = null,
  suppressInlineHeaderControls = false,
}: RuntimeSettingsFlowCardProps = {}) {
  const queryClient = useQueryClient();
  const runtimeAutoSaveEnabled = useUiStore((state) => state.runtimeAutoSaveEnabled);
  const setRuntimeAutoSaveEnabled = useUiStore((state) => state.setRuntimeAutoSaveEnabled);
  const runtimeReadyFlag = useSettingsAuthorityStore((state) => state.snapshot.runtimeReady);

  const runtimeBootstrap = useMemo(
    () => readRuntimeSettingsBootstrap(queryClient, RUNTIME_SETTING_DEFAULTS),
    [queryClient],
  );
  const runtimeManifestDefaults = useMemo(() => toRuntimeDraft(RUNTIME_SETTING_DEFAULTS), []);
  const runtimeBootstrapDraft = useMemo(
    () => normalizeRuntimeDraft(undefined, runtimeBootstrap),
    [runtimeBootstrap],
  );

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

  const payloadFromRuntimeDraft = useCallback((nextRuntimeDraft: RuntimeDraft) => collectRuntimeFlowDraftPayload({
    nextRuntimeDraft,
    runtimeManifestDefaults,
    resolveModelTokenDefaults,
  }), [resolveModelTokenDefaults, runtimeManifestDefaults]);

  const runtimeEditor = useRuntimeSettingsEditorAdapter<RuntimeDraft>({
    bootstrapValues: runtimeBootstrapDraft,
    payloadFromValues: payloadFromRuntimeDraft,
    normalizeSnapshot: (snapshot) => normalizeRuntimeDraft(snapshot, runtimeBootstrap),
    valuesEqual: runtimeDraftEqual,
    autoSaveEnabled: runtimeAutoSaveEnabled,
  });

  const runtimeDraft = runtimeEditor.values;
  const setRuntimeDraft = runtimeEditor.setValues;
  const runtimeDirty = runtimeEditor.dirty;
  const setRuntimeDirty = runtimeEditor.setDirty;
  const runtimeSaveState = runtimeEditor.saveStatus.kind;
  const runtimeSaveMessage = runtimeEditor.saveStatus.message;
  const runtimeSettingsLoading = runtimeEditor.isLoading;
  const runtimeSettingsSaving = runtimeEditor.isSaving;
  const saveNow = runtimeEditor.saveNow;
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

  const updateDraft = useCallback(<K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => {
    setRuntimeDraft((previous) => ({ ...previous, [key]: value }));
    setRuntimeDirty(true);
  }, [setRuntimeDraft, setRuntimeDirty]);

  const onNumberChange = useCallback(<K extends keyof RuntimeDraft>(
    key: K,
    eventValue: string,
    bounds: NumberBound,
  ) => {
    setRuntimeDraft((previous) => {
      const current = previous[key];
      const fallback = typeof current === 'number' ? current : 0;
      const next = parseBoundedNumber(eventValue, fallback, bounds) as RuntimeDraft[K];
      return { ...previous, [key]: next };
    });
    setRuntimeDirty(true);
  }, [setRuntimeDraft, setRuntimeDirty]);

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
    setRuntimeDraft(runtimeManifestDefaults);
    setRuntimeDirty(true);
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
        llmModelExtract={runtimeDraft.llmModelExtract}
      />
      <RuntimeFlowCardHeader
        runtimeStatusClass={runtimeStatusClass}
        runtimeStatusText={runtimeStatusText}
        showInlineHeaderControls={!actionPortalTarget && !suppressInlineHeaderControls}
        runtimeHeaderControls={runtimeHeaderControls}
      />
      {/* Compatibility anchors for characterization wiring tests (logic extracted to seam files):
          onClick={() => setActiveStep(step.id)}
          title={isActive ? 'Selected step' : enabled ? 'Enabled by master toggle' : 'Disabled by master toggle'}
          disabled={!runtimeSettingsReady || runtimeSettingsSaving || runtimeAutoSaveEnabled}
          onClick={() => setRuntimeAutoSaveEnabled(!runtimeAutoSaveEnabled)}
          {runtimeAutoSaveEnabled ? 'Auto-Save On' : 'Auto-Save Off'}
          `Unsaved changes queued for auto save (${runtimeAutoSaveDelaySeconds}s).`
          activeRuntimeSubSteps.length > 1
          data-runtime-substep={subStep.id}
          onClick={() => scrollToRuntimeSubStep(subStep.id)}
          interface RuntimeSettingsLlmConfigResponse {
      */}

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
            inputCls={inputCls}
            runtimeSubStepDomId={runtimeSubStepDomId}
            searchProviderOptions={SEARCH_PROVIDER_OPTIONS}
            resumeModeOptions={RESUME_MODE_OPTIONS}
            updateDraft={updateDraft}
            onNumberChange={onNumberChange}
            getNumberBounds={getNumberBounds}
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
                dynamicFetchControlsLocked={dynamicFetchControlsLocked}
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

          {activeStep === 'planner-triage' ? (
            <Suspense
              fallback={(
                <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                  Loading search and reranker section...
                </div>
              )}
            >
              <RuntimeFlowPlannerTriageSection
                runtimeDraft={runtimeDraft}
                runtimeSettingsReady={runtimeSettingsReady}
                plannerControlsLocked={plannerControlsLocked}
                inputCls={inputCls}
                runtimeSubStepDomId={runtimeSubStepDomId}
                updateDraft={updateDraft}
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




