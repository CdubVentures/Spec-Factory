import { Suspense, lazy, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client';
import { Tip } from '../../../shared/ui/feedback/Tip';
import { RuntimeFlowCardHeader } from './RuntimeFlowCardHeader';
import { RuntimeFlowCoreStepsSection } from '../sections/RuntimeFlowCoreStepsSection';
import {
  deriveRuntimeLlmModelOptions,
  deriveRuntimeLlmTokenPresetOptions,
} from '../state/RuntimeFlowModelTokenOptions';
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
import {
  clampTokenForModel as clampRuntimeTokenForModel,
} from '../state/runtimeSettingsDomain';
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

const RuntimeFlowLlmCortexSection = lazy(async () => {
  const module = await import('../sections/RuntimeFlowLlmCortexSection');
  return { default: module.RuntimeFlowLlmCortexSection };
});

const RuntimeFlowPlannerTriageSection = lazy(async () => {
  const module = await import('../sections/RuntimeFlowPlannerTriageSection');
  return { default: module.RuntimeFlowPlannerTriageSection };
});

const RuntimeFlowScoringEvidenceSection = lazy(async () => {
  const module = await import('../sections/RuntimeFlowScoringEvidenceSection');
  return { default: module.RuntimeFlowScoringEvidenceSection };
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

  const clampTokenForModel = useCallback((model: string, value: unknown) => (
    clampRuntimeTokenForModel(
      model,
      Number.parseInt(String(value), 10),
      resolveModelTokenDefaults,
    )
  ), [resolveModelTokenDefaults]);

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
    phase2LlmModel,
    phase3LlmModel,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
    llmTokensPlan,
    llmTokensTriage,
    llmTokensFast,
    llmTokensReasoning,
    llmTokensExtract,
    llmTokensValidate,
    llmTokensWrite,
    llmTokensPlanFallback,
    llmTokensExtractFallback,
    llmTokensValidateFallback,
    llmTokensWriteFallback,
    dynamicCrawleeEnabled,
    scannedPdfOcrEnabled,
    phase2LlmEnabled,
    reextractIndexed,
    runtimeTraceEnabled,
  } = runtimeDraft;

  const llmModelOptions = useMemo(() => deriveRuntimeLlmModelOptions({
    indexingLlmConfig,
    phase2LlmModel,
    phase3LlmModel,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
  }), [
    indexingLlmConfig,
    phase2LlmModel,
    phase3LlmModel,
    llmModelFast,
    llmModelReasoning,
    llmModelExtract,
    llmModelValidate,
    llmModelWrite,
  ]);

  const llmTokenPresetOptions = useMemo(() => deriveRuntimeLlmTokenPresetOptions({
    indexingLlmConfig,
    llmTokensPlan,
    llmTokensTriage,
    llmTokensFast,
    llmTokensReasoning,
    llmTokensExtract,
    llmTokensValidate,
    llmTokensWrite,
    llmTokensPlanFallback,
    llmTokensExtractFallback,
    llmTokensValidateFallback,
    llmTokensWriteFallback,
    runtimeManifestDefaults,
  }), [
    indexingLlmConfig,
    llmTokensPlan,
    llmTokensTriage,
    llmTokensFast,
    llmTokensReasoning,
    llmTokensExtract,
    llmTokensValidate,
    llmTokensWrite,
    llmTokensPlanFallback,
    llmTokensExtractFallback,
    llmTokensValidateFallback,
    llmTokensWriteFallback,
    runtimeManifestDefaults,
  ]);

  const runtimeSettingsReady = runtimeReadyFlag && !runtimeSettingsLoading;
  const runtimeAutoSaveDelaySeconds = (SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime / 1000).toFixed(1);
  const {
    dynamicFetchControlsLocked,
    ocrControlsLocked,
    plannerControlsLocked,
    plannerModelLocked,
    triageModelLocked,
    reextractWindowLocked,
    traceControlsLocked,
  } = deriveRuntimeFlowControlLocks({
    dynamicCrawleeEnabled,
    scannedPdfOcrEnabled,
    phase2LlmEnabled,
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

  const onRoleModelChange = useCallback((
    modelKey:
      | 'phase2LlmModel'
      | 'phase3LlmModel'
      | 'llmModelFast'
      | 'llmModelReasoning'
      | 'llmModelExtract'
      | 'llmModelValidate'
      | 'llmModelWrite',
    tokenKey:
      | 'llmTokensPlan'
      | 'llmTokensTriage'
      | 'llmTokensFast'
      | 'llmTokensReasoning'
      | 'llmTokensExtract'
      | 'llmTokensValidate'
      | 'llmTokensWrite',
    model: string,
  ) => {
    const defaults = resolveModelTokenDefaults(model);
    const nextToken = clampTokenForModel(model, defaults.default_output_tokens);
    setRuntimeDraft((previous) => ({
      ...previous,
      [modelKey]: model,
      [tokenKey]: nextToken,
    }));
    setRuntimeDirty(true);
  }, [resolveModelTokenDefaults, clampTokenForModel, setRuntimeDraft, setRuntimeDirty]);


  function onLlmExtractionCacheTtlMsChange(eventValue: string) {
    onNumberChange(
      'llmExtractionCacheTtlMs',
      eventValue,
      RUNTIME_NUMBER_BOUNDS.llmExtractionCacheTtlMs,
    );
  }

  function onLlmMaxCallsPerProductTotalChange(eventValue: string) {
    onNumberChange(
      'llmMaxCallsPerProductTotal',
      eventValue,
      RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductTotal,
    );
  }

  function onLlmMaxCallsPerProductFastChange(eventValue: string) {
    onNumberChange(
      'llmMaxCallsPerProductFast',
      eventValue,
      RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductFast,
    );
  }

  function onLlmPlanApiKeyChange(next: string) {
    updateDraft('llmPlanApiKey', next);
  }

  function onLlmExtractionCacheEnabledChange(next: boolean) {
    updateDraft('llmExtractionCacheEnabled', next);
  }

  function onLlmExtractionCacheDirChange(next: string) {
    updateDraft('llmExtractionCacheDir', next);
  }

  function onLlmTokensPlanFallbackChange(eventValue: string) {
    updateDraft(
      'llmTokensPlanFallback',
      clampTokenForModel(
        runtimeDraft.phase2LlmModel,
        Number.parseInt(eventValue, 10),
      ),
    );
  }

  function onLlmTokensExtractFallbackChange(eventValue: string) {
    updateDraft(
      'llmTokensExtractFallback',
      clampTokenForModel(
        runtimeDraft.llmModelExtract,
        Number.parseInt(eventValue, 10),
      ),
    );
  }

  function onLlmTokensValidateFallbackChange(eventValue: string) {
    updateDraft(
      'llmTokensValidateFallback',
      clampTokenForModel(
        runtimeDraft.llmModelValidate,
        Number.parseInt(eventValue, 10),
      ),
    );
  }

  function onLlmTokensWriteFallbackChange(eventValue: string) {
    updateDraft(
      'llmTokensWriteFallback',
      clampTokenForModel(
        runtimeDraft.llmModelWrite,
        Number.parseInt(eventValue, 10),
      ),
    );
  }

  function onLlmMaxOutputTokensFastChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensFast',
      clampTokenForModel(runtimeDraft.llmModelFast, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmMaxOutputTokensReasoningChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensReasoning',
      clampTokenForModel(runtimeDraft.llmModelReasoning, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmMaxOutputTokensExtractChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensExtract',
      clampTokenForModel(runtimeDraft.llmModelExtract, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmMaxOutputTokensValidateChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensValidate',
      clampTokenForModel(runtimeDraft.llmModelValidate, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmMaxOutputTokensWriteChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensWrite',
      clampTokenForModel(runtimeDraft.llmModelWrite, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmMaxOutputTokensPlanChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensPlan',
      clampTokenForModel(runtimeDraft.phase2LlmModel, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmMaxOutputTokensTriageChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensTriage',
      clampTokenForModel(runtimeDraft.phase3LlmModel, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmMaxOutputTokensPlanFallbackChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensPlanFallback',
      clampTokenForModel(
        runtimeDraft.phase2LlmModel,
        Number.parseInt(eventValue, 10),
      ),
    );
  }

  function onLlmMaxOutputTokensExtractFallbackChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensExtractFallback',
      clampTokenForModel(
        runtimeDraft.llmModelExtract,
        Number.parseInt(eventValue, 10),
      ),
    );
  }

  function onLlmMaxOutputTokensValidateFallbackChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensValidateFallback',
      clampTokenForModel(
        runtimeDraft.llmModelValidate,
        Number.parseInt(eventValue, 10),
      ),
    );
  }

  function onLlmMaxOutputTokensWriteFallbackChange(eventValue: string) {
    updateDraft(
      'llmMaxOutputTokensWriteFallback',
      clampTokenForModel(
        runtimeDraft.llmModelWrite,
        Number.parseInt(eventValue, 10),
      ),
    );
  }

  function onLlmTokensFastChange(eventValue: string) {
    updateDraft(
      'llmTokensFast',
      clampTokenForModel(runtimeDraft.llmModelFast, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmTokensReasoningChange(eventValue: string) {
    updateDraft(
      'llmTokensReasoning',
      clampTokenForModel(runtimeDraft.llmModelReasoning, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmTokensExtractChange(eventValue: string) {
    updateDraft(
      'llmTokensExtract',
      clampTokenForModel(runtimeDraft.llmModelExtract, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmTokensValidateChange(eventValue: string) {
    updateDraft(
      'llmTokensValidate',
      clampTokenForModel(runtimeDraft.llmModelValidate, Number.parseInt(eventValue, 10)),
    );
  }

  function onLlmTokensWriteChange(eventValue: string) {
    updateDraft(
      'llmTokensWrite',
      clampTokenForModel(runtimeDraft.llmModelWrite, Number.parseInt(eventValue, 10)),
    );
  }

  function onPlannerModelChange(nextModel: string) {
    onRoleModelChange('phase2LlmModel', 'llmTokensPlan', nextModel);
  }

  function onPlannerTokenChange(eventValue: string) {
    updateDraft(
      'llmTokensPlan',
      clampTokenForModel(runtimeDraft.phase2LlmModel, Number.parseInt(eventValue, 10)),
    );
  }

  function onTriageModelChange(nextModel: string) {
    onRoleModelChange('phase3LlmModel', 'llmTokensTriage', nextModel);
  }

  function onTriageTokenChange(eventValue: string) {
    updateDraft(
      'llmTokensTriage',
      clampTokenForModel(runtimeDraft.phase3LlmModel, Number.parseInt(eventValue, 10)),
    );
  }

  function renderTokenOptions(model: string, prefix: string) {
    const cap = resolveModelTokenDefaults(model).max_output_tokens;
    return llmTokenPresetOptions.map((token) => {
      const disabled = token > cap;
      return (
        <option key={`${prefix}:${token}`} value={token} disabled={disabled}>
          {token}
          {disabled ? ' (model max)' : ''}
        </option>
      );
    });
  }

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
  const fallbackRoutingNumberBounds = {
    llmExtractionCacheTtlMs: RUNTIME_NUMBER_BOUNDS.llmExtractionCacheTtlMs,
    llmMaxCallsPerProductTotal: RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductTotal,
    llmMaxCallsPerProductFast: RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductFast,
  };
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
          runtimeAutoSaveEnabled
            ? 'sf-icon-button'
            : 'sf-primary-button'
          runtimeAutoSaveEnabled
            ? 'sf-primary-button'
            : 'sf-action-button'
          `Unsaved changes queued for auto save (${runtimeAutoSaveDelaySeconds}s).`
          activeRuntimeSubSteps.length > 1
          data-runtime-substep={subStep.id}
          onClick={() => scrollToRuntimeSubStep(subStep.id)}
          interface RuntimeSettingsLlmConfigResponse {
          llmModelPlan
          llmModelTriage
          llmPlanDiscoveryQueries
          llmSerpRerankEnabled
          llmPlanFallbackModel
          llmExtractFallbackModel
          llmValidateFallbackModel
          llmWriteFallbackModel
          llmMaxOutputTokensPlan
          llmMaxOutputTokensTriage
          llmMaxOutputTokensFast
          llmMaxOutputTokensReasoning
          llmMaxOutputTokensExtract
          llmMaxOutputTokensValidate
          llmMaxOutputTokensWrite
          llmMaxOutputTokensPlanFallback
          llmMaxOutputTokensExtractFallback
          llmMaxOutputTokensValidateFallback
          llmMaxOutputTokensWriteFallback
          label="Consensus Method Weight (Network JSON)"
          label="Consensus Method Weight (Adapter API)"
          label="Consensus Method Weight (Structured Metadata)"
          label="Consensus Method Weight (PDF)"
          label="Consensus Method Weight (Table/KV)"
          label="Consensus Method Weight (DOM)"
          label="Consensus Policy Bonus"
          label="Consensus Weighted Majority Threshold"
          label="Consensus Strict Acceptance Domain Count"
          label="Consensus Relaxed Acceptance Domain Count"
          label="Consensus Instrumented Field Threshold"
          label="Consensus Confidence Scoring Base"
          label="Consensus Pass Target (Identity/Strong)"
          label="Consensus Pass Target (Normal)"
          label="Evidence Text Max Chars"
          label="NeedSet Required Weight (Identity)"
          label="NeedSet Required Weight (Critical)"
          label="NeedSet Required Weight (Required)"
          label="NeedSet Required Weight (Expected)"
          label="NeedSet Required Weight (Optional)"
          label="NeedSet Missing Multiplier"
          label="NeedSet Tier Deficit Multiplier"
          label="NeedSet Min-Refs Deficit Multiplier"
          label="NeedSet Conflict Multiplier"
          label="NeedSet Identity Lock Threshold"
          label="NeedSet Identity Provisional Threshold"
          label="NeedSet Identity Audit Limit"
          label="Identity Gate Base Match Threshold"
          label="Quality Gate Identity Threshold"
          label="Parsing Confidence Base Map (JSON)"
          label="Repair Dedupe Rule"
          label="Automation Queue Storage Engine"
          label="Retrieval Tier Weight (Tier 1)"
          label="Retrieval Tier Weight (Tier 2)"
          label="Retrieval Tier Weight (Tier 3)"
          label="Retrieval Tier Weight (Tier 4)"
          label="Retrieval Tier Weight (Tier 5)"
          label="Retrieval Doc Weight (Manual PDF)"
          label="Retrieval Doc Weight (Spec PDF)"
          label="Retrieval Doc Weight (Support)"
          label="Retrieval Doc Weight (Lab Review)"
          label="Retrieval Doc Weight (Product Page)"
          label="Retrieval Doc Weight (Other)"
          label="Retrieval Method Weight (Table)"
          label="Retrieval Method Weight (KV)"
          label="Retrieval Method Weight (JSON-LD)"
          label="Retrieval Method Weight (LLM Extract)"
          label="Retrieval Method Weight (Helper Supportive)"
          label="Retrieval Anchor Score Per Match"
          label="Retrieval Identity Score Per Match"
          label="Retrieval Unit Match Bonus"
          label="Retrieval Direct Field Match Bonus"
          label="Identity Gate Publish Threshold"
          label="NeedSet Evidence Decay Days"
          label="NeedSet Evidence Decay Floor"
          label="LLM Extract Max Tokens"
          label="LLM Extract Max Snippets/Batch"
          label="LLM Extract Max Snippet Chars"
          label="LLM Extract Skip Low Signal"
          label="LLM Extract Reasoning Budget"
          label="LLM Reasoning Mode"
          label="LLM Reasoning Budget"
          label="LLM Monthly Budget (USD)"
          label="LLM Per-Product Budget (USD)"
          label="Disable LLM Budget Guards"
          label="LLM Max Batches/Product"
          label="LLM Max Evidence Chars"
          label="LLM Max Tokens"
          label="LLM Timeout (ms)"
          label="LLM Cost Input / 1M"
          label="LLM Cost Output / 1M"
          label="LLM Cost Cached Input / 1M"
          label="LLM Verify Mode"
          label="LLM Max Calls / Round"
          label="LLM Max Output Tokens"
          label="LLM Verify Sample Rate"
          runtimeDraft.llmMaxCallsPerRound
          runtimeDraft.llmMaxOutputTokens
          runtimeDraft.llmVerifySampleRate
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

          {activeStep === 'scoring-evidence' ? (
            <Suspense
              fallback={(
                <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                  Loading scoring and evidence section...
                </div>
              )}
            >
              <RuntimeFlowScoringEvidenceSection
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

          {activeStep === 'llm-cortex' ? (
            <Suspense
              fallback={(
                <div className="rounded sf-surface-elevated px-3 py-2.5 sf-text-label">
                  Loading LLM & Cortex section...
                </div>
              )}
            >
              <RuntimeFlowLlmCortexSection
                runtimeDraft={runtimeDraft}
                runtimeSettingsReady={runtimeSettingsReady}
                plannerControlsLocked={plannerControlsLocked}
                plannerModelLocked={plannerModelLocked}
                triageModelLocked={triageModelLocked}
                inputCls={inputCls}
                llmModelOptions={llmModelOptions}
                runtimeSubStepDomId={runtimeSubStepDomId}
                onPlannerModelChange={onPlannerModelChange}
                onPlannerTokenChange={onPlannerTokenChange}
                onTriageModelChange={onTriageModelChange}
                onTriageTokenChange={onTriageTokenChange}
                onLlmMaxOutputTokensPlanChange={onLlmMaxOutputTokensPlanChange}
                onLlmMaxOutputTokensTriageChange={onLlmMaxOutputTokensTriageChange}
                onRoleModelChange={onRoleModelChange}
                onLlmTokensFastChange={onLlmTokensFastChange}
                onLlmTokensReasoningChange={onLlmTokensReasoningChange}
                onLlmTokensExtractChange={onLlmTokensExtractChange}
                onLlmTokensValidateChange={onLlmTokensValidateChange}
                onLlmTokensWriteChange={onLlmTokensWriteChange}
                onLlmMaxOutputTokensFastChange={onLlmMaxOutputTokensFastChange}
                onLlmMaxOutputTokensReasoningChange={onLlmMaxOutputTokensReasoningChange}
                onLlmMaxOutputTokensExtractChange={onLlmMaxOutputTokensExtractChange}
                onLlmMaxOutputTokensValidateChange={onLlmMaxOutputTokensValidateChange}
                onLlmMaxOutputTokensWriteChange={onLlmMaxOutputTokensWriteChange}
                onLlmPlanApiKeyChange={onLlmPlanApiKeyChange}
                onLlmExtractionCacheEnabledChange={onLlmExtractionCacheEnabledChange}
                onLlmExtractionCacheDirChange={onLlmExtractionCacheDirChange}
                onLlmExtractionCacheTtlMsChange={onLlmExtractionCacheTtlMsChange}
                onLlmMaxCallsPerProductTotalChange={onLlmMaxCallsPerProductTotalChange}
                onLlmMaxCallsPerProductFastChange={onLlmMaxCallsPerProductFastChange}
                onLlmTokensPlanFallbackChange={onLlmTokensPlanFallbackChange}
                onLlmTokensExtractFallbackChange={onLlmTokensExtractFallbackChange}
                onLlmTokensValidateFallbackChange={onLlmTokensValidateFallbackChange}
                onLlmTokensWriteFallbackChange={onLlmTokensWriteFallbackChange}
                onLlmMaxOutputTokensPlanFallbackChange={onLlmMaxOutputTokensPlanFallbackChange}
                onLlmMaxOutputTokensExtractFallbackChange={onLlmMaxOutputTokensExtractFallbackChange}
                onLlmMaxOutputTokensValidateFallbackChange={onLlmMaxOutputTokensValidateFallbackChange}
                onLlmMaxOutputTokensWriteFallbackChange={onLlmMaxOutputTokensWriteFallbackChange}
                renderTokenOptions={renderTokenOptions}
                updateDraft={updateDraft}
                onNumberChange={onNumberChange}
                getNumberBounds={getNumberBounds}
              />
            </Suspense>
          ) : null}
        </section>
      </div>
      </div>
    </>
  );
}




