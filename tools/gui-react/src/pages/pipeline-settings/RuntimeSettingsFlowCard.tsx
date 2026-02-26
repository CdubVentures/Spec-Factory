import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IndexingLlmConfigResponse } from '../indexing/types';
import { api } from '../../api/client';
import { Tip } from '../../components/common/Tip';
import {
  LLM_SETTING_LIMITS,
  RUNTIME_SETTING_DEFAULTS,
  SETTINGS_AUTOSAVE_DEBOUNCE_MS,
  type RuntimeSettingDefaults,
} from '../../stores/settingsManifest';
import {
  readRuntimeSettingsBootstrap,
  useRuntimeSettingsAuthority,
  type RuntimeSettings,
} from '../../stores/runtimeSettingsAuthority';
import { useSettingsAuthorityStore } from '../../stores/settingsAuthorityStore';
import { useUiStore } from '../../stores/uiStore';
import { usePersistedTab } from '../../stores/tabStore';

const PROFILE_OPTIONS = ['fast', 'standard', 'thorough'] as const;
const SEARCH_PROVIDER_OPTIONS = ['none', 'duckduckgo', 'searxng', 'bing', 'google', 'dual'] as const;
const OCR_BACKEND_OPTIONS = ['auto', 'tesseract', 'none'] as const;
const RESUME_MODE_OPTIONS = ['auto', 'force_resume', 'start_over'] as const;

const RUNTIME_STEP_IDS = [
  'run-setup',
  'fetch-render',
  'ocr',
  'planner-triage',
  'role-routing',
  'fallback-routing',
] as const;

type RuntimeStepId = (typeof RUNTIME_STEP_IDS)[number];
type RuntimeSaveState = 'idle' | 'ok' | 'partial' | 'error';
type RuntimeDraft = Omit<RuntimeSettingDefaults, 'runtimeAutoSaveEnabled'>;

interface RuntimeStep {
  id: RuntimeStepId;
  phase: string;
  label: string;
  tip: string;
}

interface NumberBound {
  min: number;
  max: number;
  int?: boolean;
}

const RUNTIME_STEPS: RuntimeStep[] = [
  { id: 'run-setup', phase: '01', label: 'Run Setup', tip: 'Pipeline bootstrap profile, discovery, and resume policy.' },
  { id: 'fetch-render', phase: '02', label: 'Fetch and Render', tip: 'Fetch throughput and dynamic-render retry policy.' },
  { id: 'ocr', phase: '03', label: 'OCR', tip: 'Scanned PDF OCR activation and evidence promotion rules.' },
  { id: 'planner-triage', phase: '04', label: 'Planner and Triage', tip: 'Planner and triage LLM lanes used before extraction.' },
  { id: 'role-routing', phase: '05', label: 'Role Routing', tip: 'Primary model/token routing for fast, reasoning, extract, validate, write.' },
  { id: 'fallback-routing', phase: '06', label: 'Fallback Routing', tip: 'Fallback route models/tokens used when primary lanes fail.' },
];

const RUNTIME_NUMBER_BOUNDS: Record<
  | 'fetchConcurrency'
  | 'perHostMinDelayMs'
  | 'crawleeRequestHandlerTimeoutSecs'
  | 'dynamicFetchRetryBudget'
  | 'dynamicFetchRetryBackoffMs'
  | 'scannedPdfOcrMaxPages'
  | 'scannedPdfOcrMaxPairs'
  | 'scannedPdfOcrMinCharsPerPage'
  | 'scannedPdfOcrMinLinesPerPage'
  | 'scannedPdfOcrMinConfidence'
  | 'resumeWindowHours'
  | 'reextractAfterHours',
  NumberBound
> = {
  fetchConcurrency: { min: 1, max: 128, int: true },
  perHostMinDelayMs: { min: 0, max: 120_000, int: true },
  crawleeRequestHandlerTimeoutSecs: { min: 0, max: 300, int: true },
  dynamicFetchRetryBudget: { min: 0, max: 30, int: true },
  dynamicFetchRetryBackoffMs: { min: 0, max: 120_000, int: true },
  scannedPdfOcrMaxPages: { min: 1, max: 500, int: true },
  scannedPdfOcrMaxPairs: { min: 1, max: 500, int: true },
  scannedPdfOcrMinCharsPerPage: { min: 0, max: 50_000, int: true },
  scannedPdfOcrMinLinesPerPage: { min: 0, max: 10_000, int: true },
  scannedPdfOcrMinConfidence: { min: 0, max: 1 },
  resumeWindowHours: { min: 0, max: 8_760, int: true },
  reextractAfterHours: { min: 0, max: 8_760, int: true },
};

function toRuntimeDraft(defaults: RuntimeSettingDefaults): RuntimeDraft {
  const { runtimeAutoSaveEnabled: _runtimeAutoSaveEnabled, ...draft } = defaults;
  return draft;
}

function runtimeDraftEqual(a: RuntimeDraft, b: RuntimeDraft) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeToken(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function parseRuntimeLlmTokenCap(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(
    LLM_SETTING_LIMITS.maxTokens.min,
    Math.min(LLM_SETTING_LIMITS.maxTokens.max, parsed),
  );
}

function parseBoundedNumber(value: unknown, fallback: number, bounds: NumberBound): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(bounds.max, Math.max(bounds.min, parsed));
  return bounds.int ? Math.round(clamped) : clamped;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return fallback;
}

function parseString(value: unknown, fallback: string, allowEmpty = false): string {
  if (typeof value !== 'string') return fallback;
  if (allowEmpty) return value;
  const token = value.trim();
  return token || fallback;
}

function parseEnum<T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
): T[number] {
  const token = String(value || '').trim();
  if (!token) return fallback;
  return options.includes(token as T[number]) ? (token as T[number]) : fallback;
}

function normalizeRuntimeDraft(
  source: RuntimeSettings | undefined,
  fallback: RuntimeSettingDefaults,
): RuntimeDraft {
  const raw = source || {};
  return {
    profile: parseEnum(raw.profile, PROFILE_OPTIONS, fallback.profile),
    searchProvider: parseEnum(raw.searchProvider, SEARCH_PROVIDER_OPTIONS, fallback.searchProvider),
    phase2LlmModel: parseString(raw.phase2LlmModel, fallback.phase2LlmModel),
    phase3LlmModel: parseString(raw.phase3LlmModel, fallback.phase3LlmModel),
    llmModelFast: parseString(raw.llmModelFast, fallback.llmModelFast),
    llmModelReasoning: parseString(raw.llmModelReasoning, fallback.llmModelReasoning),
    llmModelExtract: parseString(raw.llmModelExtract, fallback.llmModelExtract),
    llmModelValidate: parseString(raw.llmModelValidate, fallback.llmModelValidate),
    llmModelWrite: parseString(raw.llmModelWrite, fallback.llmModelWrite),
    llmFallbackPlanModel: parseString(raw.llmFallbackPlanModel, fallback.llmFallbackPlanModel, true),
    llmFallbackExtractModel: parseString(raw.llmFallbackExtractModel, fallback.llmFallbackExtractModel, true),
    llmFallbackValidateModel: parseString(raw.llmFallbackValidateModel, fallback.llmFallbackValidateModel, true),
    llmFallbackWriteModel: parseString(raw.llmFallbackWriteModel, fallback.llmFallbackWriteModel, true),
    resumeMode: parseEnum(raw.resumeMode, RESUME_MODE_OPTIONS, fallback.resumeMode),
    scannedPdfOcrBackend: parseEnum(raw.scannedPdfOcrBackend, OCR_BACKEND_OPTIONS, fallback.scannedPdfOcrBackend),
    fetchConcurrency: parseBoundedNumber(
      raw.fetchConcurrency,
      fallback.fetchConcurrency,
      RUNTIME_NUMBER_BOUNDS.fetchConcurrency,
    ),
    perHostMinDelayMs: parseBoundedNumber(
      raw.perHostMinDelayMs,
      fallback.perHostMinDelayMs,
      RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs,
    ),
    llmTokensPlan: parseRuntimeLlmTokenCap(raw.llmTokensPlan) || fallback.llmTokensPlan,
    llmTokensTriage: parseRuntimeLlmTokenCap(raw.llmTokensTriage) || fallback.llmTokensTriage,
    llmTokensFast: parseRuntimeLlmTokenCap(raw.llmTokensFast) || fallback.llmTokensFast,
    llmTokensReasoning: parseRuntimeLlmTokenCap(raw.llmTokensReasoning) || fallback.llmTokensReasoning,
    llmTokensExtract: parseRuntimeLlmTokenCap(raw.llmTokensExtract) || fallback.llmTokensExtract,
    llmTokensValidate: parseRuntimeLlmTokenCap(raw.llmTokensValidate) || fallback.llmTokensValidate,
    llmTokensWrite: parseRuntimeLlmTokenCap(raw.llmTokensWrite) || fallback.llmTokensWrite,
    llmTokensPlanFallback: parseRuntimeLlmTokenCap(raw.llmTokensPlanFallback) || fallback.llmTokensPlanFallback,
    llmTokensExtractFallback: parseRuntimeLlmTokenCap(raw.llmTokensExtractFallback) || fallback.llmTokensExtractFallback,
    llmTokensValidateFallback: parseRuntimeLlmTokenCap(raw.llmTokensValidateFallback) || fallback.llmTokensValidateFallback,
    llmTokensWriteFallback: parseRuntimeLlmTokenCap(raw.llmTokensWriteFallback) || fallback.llmTokensWriteFallback,
    resumeWindowHours: parseBoundedNumber(
      raw.resumeWindowHours,
      fallback.resumeWindowHours,
      RUNTIME_NUMBER_BOUNDS.resumeWindowHours,
    ),
    reextractAfterHours: parseBoundedNumber(
      raw.reextractAfterHours,
      fallback.reextractAfterHours,
      RUNTIME_NUMBER_BOUNDS.reextractAfterHours,
    ),
    scannedPdfOcrMaxPages: parseBoundedNumber(
      raw.scannedPdfOcrMaxPages,
      fallback.scannedPdfOcrMaxPages,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages,
    ),
    scannedPdfOcrMaxPairs: parseBoundedNumber(
      raw.scannedPdfOcrMaxPairs,
      fallback.scannedPdfOcrMaxPairs,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs,
    ),
    scannedPdfOcrMinCharsPerPage: parseBoundedNumber(
      raw.scannedPdfOcrMinCharsPerPage,
      fallback.scannedPdfOcrMinCharsPerPage,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage,
    ),
    scannedPdfOcrMinLinesPerPage: parseBoundedNumber(
      raw.scannedPdfOcrMinLinesPerPage,
      fallback.scannedPdfOcrMinLinesPerPage,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage,
    ),
    scannedPdfOcrMinConfidence: parseBoundedNumber(
      raw.scannedPdfOcrMinConfidence,
      fallback.scannedPdfOcrMinConfidence,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence,
    ),
    crawleeRequestHandlerTimeoutSecs: parseBoundedNumber(
      raw.crawleeRequestHandlerTimeoutSecs,
      fallback.crawleeRequestHandlerTimeoutSecs,
      RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs,
    ),
    dynamicFetchRetryBudget: parseBoundedNumber(
      raw.dynamicFetchRetryBudget,
      fallback.dynamicFetchRetryBudget,
      RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget,
    ),
    dynamicFetchRetryBackoffMs: parseBoundedNumber(
      raw.dynamicFetchRetryBackoffMs,
      fallback.dynamicFetchRetryBackoffMs,
      RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs,
    ),
    dynamicFetchPolicyMapJson: parseString(raw.dynamicFetchPolicyMapJson, fallback.dynamicFetchPolicyMapJson, true),
    scannedPdfOcrEnabled: parseBoolean(raw.scannedPdfOcrEnabled, fallback.scannedPdfOcrEnabled),
    scannedPdfOcrPromoteCandidates: parseBoolean(raw.scannedPdfOcrPromoteCandidates, fallback.scannedPdfOcrPromoteCandidates),
    phase2LlmEnabled: parseBoolean(raw.phase2LlmEnabled, fallback.phase2LlmEnabled),
    phase3LlmTriageEnabled: parseBoolean(raw.phase3LlmTriageEnabled, fallback.phase3LlmTriageEnabled),
    llmFallbackEnabled: parseBoolean(raw.llmFallbackEnabled, fallback.llmFallbackEnabled),
    reextractIndexed: parseBoolean(raw.reextractIndexed, fallback.reextractIndexed),
    discoveryEnabled: parseBoolean(raw.discoveryEnabled, fallback.discoveryEnabled),
    dynamicCrawleeEnabled: parseBoolean(raw.dynamicCrawleeEnabled, fallback.dynamicCrawleeEnabled),
    crawleeHeadless: parseBoolean(raw.crawleeHeadless, fallback.crawleeHeadless),
  };
}

function settingLabel(label: string, tip: string) {
  return (
    <span className="inline-flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-100">
      {label}
      <Tip text={tip} />
    </span>
  );
}

function SettingRow({
  label,
  tip,
  children,
  disabled = false,
  description,
}: {
  label: string;
  tip: string;
  children: ReactNode;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <div className={`grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(210px,290px)] md:items-center ${disabled ? 'opacity-55' : ''}`}>
      <div>
        {settingLabel(label, tip)}
        {description ? (
          <div className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">{description}</div>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function renderDisabledHint(message: string) {
  return (
    <div className="rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 px-3 py-2 text-[11px] text-gray-600 dark:text-gray-300">
      {message}
    </div>
  );
}

export function RuntimeSettingsFlowCard() {
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
  const [runtimeDraft, setRuntimeDraft] = useState<RuntimeDraft>(() => runtimeBootstrapDraft);
  const [runtimeDirty, setRuntimeDirty] = useState(false);
  const [runtimeSaveState, setRuntimeSaveState] = useState<RuntimeSaveState>('idle');
  const [runtimeSaveMessage, setRuntimeSaveMessage] = useState('');

  const { data: indexingLlmConfig } = useQuery({
    queryKey: ['indexing', 'llm-config'],
    queryFn: () => api.get<IndexingLlmConfigResponse>('/indexing/llm-config'),
  });

  const llmModelOptions = useMemo(() => {
    const options = Array.isArray(indexingLlmConfig?.model_options)
      ? indexingLlmConfig.model_options.map((row) => String(row || '').trim()).filter(Boolean)
      : [];
    const seeded = [
      ...options,
      runtimeDraft.phase2LlmModel,
      runtimeDraft.phase3LlmModel,
      runtimeDraft.llmModelFast,
      runtimeDraft.llmModelReasoning,
      runtimeDraft.llmModelExtract,
      runtimeDraft.llmModelValidate,
      runtimeDraft.llmModelWrite,
      runtimeDraft.llmFallbackPlanModel,
      runtimeDraft.llmFallbackExtractModel,
      runtimeDraft.llmFallbackValidateModel,
      runtimeDraft.llmFallbackWriteModel,
    ];
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const row of seeded) {
      const token = String(row || '').trim();
      if (!token) continue;
      const normalized = normalizeToken(token);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      deduped.push(token);
    }
    return deduped;
  }, [indexingLlmConfig, runtimeDraft]);

  const llmTokenPresetOptions = useMemo(() => {
    const seeded = [
      ...(Array.isArray(indexingLlmConfig?.token_presets) ? indexingLlmConfig.token_presets : []),
      runtimeDraft.llmTokensPlan,
      runtimeDraft.llmTokensTriage,
      runtimeDraft.llmTokensFast,
      runtimeDraft.llmTokensReasoning,
      runtimeDraft.llmTokensExtract,
      runtimeDraft.llmTokensValidate,
      runtimeDraft.llmTokensWrite,
      runtimeDraft.llmTokensPlanFallback,
      runtimeDraft.llmTokensExtractFallback,
      runtimeDraft.llmTokensValidateFallback,
      runtimeDraft.llmTokensWriteFallback,
      runtimeManifestDefaults.llmTokensPlan,
      runtimeManifestDefaults.llmTokensTriage,
      runtimeManifestDefaults.llmTokensFast,
      runtimeManifestDefaults.llmTokensReasoning,
      runtimeManifestDefaults.llmTokensExtract,
      runtimeManifestDefaults.llmTokensValidate,
      runtimeManifestDefaults.llmTokensWrite,
      runtimeManifestDefaults.llmTokensPlanFallback,
      runtimeManifestDefaults.llmTokensExtractFallback,
      runtimeManifestDefaults.llmTokensValidateFallback,
      runtimeManifestDefaults.llmTokensWriteFallback,
    ];
    const cleaned = seeded
      .map((row) => parseRuntimeLlmTokenCap(row))
      .filter((row): row is number => row !== null)
      .sort((a, b) => a - b);
    return [...new Set(cleaned)];
  }, [indexingLlmConfig, runtimeDraft, runtimeManifestDefaults]);

  const llmTokenProfileLookup = useMemo(() => {
    const lookup = new Map<string, { default_output_tokens: number; max_output_tokens: number }>();
    for (const row of indexingLlmConfig?.model_token_profiles || []) {
      const token = normalizeToken(row.model);
      if (!token) continue;
      lookup.set(token, {
        default_output_tokens: parseRuntimeLlmTokenCap(row.default_output_tokens) || 0,
        max_output_tokens: parseRuntimeLlmTokenCap(row.max_output_tokens) || 0,
      });
    }
    return lookup;
  }, [indexingLlmConfig]);

  const resolveModelTokenDefaults = (model: string) => {
    const profile = llmTokenProfileLookup.get(normalizeToken(model));
    const defaultFromConfig = parseRuntimeLlmTokenCap(indexingLlmConfig?.token_defaults?.plan);
    const fallbackDefault = llmTokenPresetOptions[0] || runtimeManifestDefaults.llmTokensPlan;
    const globalDefault = defaultFromConfig || parseRuntimeLlmTokenCap(fallbackDefault) || LLM_SETTING_LIMITS.maxTokens.min;
    const fallbackMax = llmTokenPresetOptions[llmTokenPresetOptions.length - 1] || globalDefault;
    const default_output_tokens = parseRuntimeLlmTokenCap(profile?.default_output_tokens) || globalDefault;
    const max_output_tokens = Math.max(
      default_output_tokens,
      parseRuntimeLlmTokenCap(profile?.max_output_tokens) || parseRuntimeLlmTokenCap(fallbackMax) || default_output_tokens,
    );
    return { default_output_tokens, max_output_tokens };
  };

  const clampTokenForModel = (model: string, value: unknown) => {
    const defaults = resolveModelTokenDefaults(model);
    const parsed = parseRuntimeLlmTokenCap(value);
    const safe = parsed ?? defaults.default_output_tokens;
    return Math.min(defaults.max_output_tokens, Math.max(LLM_SETTING_LIMITS.maxTokens.min, safe));
  };

  const runtimePayload = useMemo<RuntimeSettings>(() => ({
    profile: runtimeDraft.profile,
    searchProvider: runtimeDraft.searchProvider,
    phase2LlmModel: runtimeDraft.phase2LlmModel,
    phase3LlmModel: runtimeDraft.phase3LlmModel,
    llmModelFast: runtimeDraft.llmModelFast,
    llmModelReasoning: runtimeDraft.llmModelReasoning,
    llmModelExtract: runtimeDraft.llmModelExtract,
    llmModelValidate: runtimeDraft.llmModelValidate,
    llmModelWrite: runtimeDraft.llmModelWrite,
    llmFallbackPlanModel: runtimeDraft.llmFallbackPlanModel,
    llmFallbackExtractModel: runtimeDraft.llmFallbackExtractModel,
    llmFallbackValidateModel: runtimeDraft.llmFallbackValidateModel,
    llmFallbackWriteModel: runtimeDraft.llmFallbackWriteModel,
    resumeMode: runtimeDraft.resumeMode,
    scannedPdfOcrBackend: runtimeDraft.scannedPdfOcrBackend,
    fetchConcurrency: parseBoundedNumber(
      runtimeDraft.fetchConcurrency,
      runtimeManifestDefaults.fetchConcurrency,
      RUNTIME_NUMBER_BOUNDS.fetchConcurrency,
    ),
    perHostMinDelayMs: parseBoundedNumber(
      runtimeDraft.perHostMinDelayMs,
      runtimeManifestDefaults.perHostMinDelayMs,
      RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs,
    ),
    llmTokensPlan: clampTokenForModel(runtimeDraft.phase2LlmModel, runtimeDraft.llmTokensPlan),
    llmTokensTriage: clampTokenForModel(runtimeDraft.phase3LlmModel, runtimeDraft.llmTokensTriage),
    llmTokensFast: clampTokenForModel(runtimeDraft.llmModelFast, runtimeDraft.llmTokensFast),
    llmTokensReasoning: clampTokenForModel(runtimeDraft.llmModelReasoning, runtimeDraft.llmTokensReasoning),
    llmTokensExtract: clampTokenForModel(runtimeDraft.llmModelExtract, runtimeDraft.llmTokensExtract),
    llmTokensValidate: clampTokenForModel(runtimeDraft.llmModelValidate, runtimeDraft.llmTokensValidate),
    llmTokensWrite: clampTokenForModel(runtimeDraft.llmModelWrite, runtimeDraft.llmTokensWrite),
    llmTokensPlanFallback: clampTokenForModel(runtimeDraft.llmFallbackPlanModel || runtimeDraft.phase2LlmModel, runtimeDraft.llmTokensPlanFallback),
    llmTokensExtractFallback: clampTokenForModel(runtimeDraft.llmFallbackExtractModel || runtimeDraft.llmModelExtract, runtimeDraft.llmTokensExtractFallback),
    llmTokensValidateFallback: clampTokenForModel(runtimeDraft.llmFallbackValidateModel || runtimeDraft.llmModelValidate, runtimeDraft.llmTokensValidateFallback),
    llmTokensWriteFallback: clampTokenForModel(runtimeDraft.llmFallbackWriteModel || runtimeDraft.llmModelWrite, runtimeDraft.llmTokensWriteFallback),
    resumeWindowHours: parseBoundedNumber(
      runtimeDraft.resumeWindowHours,
      runtimeManifestDefaults.resumeWindowHours,
      RUNTIME_NUMBER_BOUNDS.resumeWindowHours,
    ),
    reextractAfterHours: parseBoundedNumber(
      runtimeDraft.reextractAfterHours,
      runtimeManifestDefaults.reextractAfterHours,
      RUNTIME_NUMBER_BOUNDS.reextractAfterHours,
    ),
    scannedPdfOcrMaxPages: parseBoundedNumber(
      runtimeDraft.scannedPdfOcrMaxPages,
      runtimeManifestDefaults.scannedPdfOcrMaxPages,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages,
    ),
    scannedPdfOcrMaxPairs: parseBoundedNumber(
      runtimeDraft.scannedPdfOcrMaxPairs,
      runtimeManifestDefaults.scannedPdfOcrMaxPairs,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs,
    ),
    scannedPdfOcrMinCharsPerPage: parseBoundedNumber(
      runtimeDraft.scannedPdfOcrMinCharsPerPage,
      runtimeManifestDefaults.scannedPdfOcrMinCharsPerPage,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage,
    ),
    scannedPdfOcrMinLinesPerPage: parseBoundedNumber(
      runtimeDraft.scannedPdfOcrMinLinesPerPage,
      runtimeManifestDefaults.scannedPdfOcrMinLinesPerPage,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage,
    ),
    scannedPdfOcrMinConfidence: parseBoundedNumber(
      runtimeDraft.scannedPdfOcrMinConfidence,
      runtimeManifestDefaults.scannedPdfOcrMinConfidence,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence,
    ),
    crawleeRequestHandlerTimeoutSecs: parseBoundedNumber(
      runtimeDraft.crawleeRequestHandlerTimeoutSecs,
      runtimeManifestDefaults.crawleeRequestHandlerTimeoutSecs,
      RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs,
    ),
    dynamicFetchRetryBudget: parseBoundedNumber(
      runtimeDraft.dynamicFetchRetryBudget,
      runtimeManifestDefaults.dynamicFetchRetryBudget,
      RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget,
    ),
    dynamicFetchRetryBackoffMs: parseBoundedNumber(
      runtimeDraft.dynamicFetchRetryBackoffMs,
      runtimeManifestDefaults.dynamicFetchRetryBackoffMs,
      RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs,
    ),
    dynamicFetchPolicyMapJson: String(runtimeDraft.dynamicFetchPolicyMapJson || '').trim(),
    scannedPdfOcrEnabled: runtimeDraft.scannedPdfOcrEnabled,
    scannedPdfOcrPromoteCandidates: runtimeDraft.scannedPdfOcrPromoteCandidates,
    phase2LlmEnabled: runtimeDraft.phase2LlmEnabled,
    phase3LlmTriageEnabled: runtimeDraft.phase3LlmTriageEnabled,
    llmFallbackEnabled: runtimeDraft.llmFallbackEnabled,
    reextractIndexed: runtimeDraft.reextractIndexed,
    discoveryEnabled: runtimeDraft.discoveryEnabled,
    dynamicCrawleeEnabled: runtimeDraft.dynamicCrawleeEnabled,
    crawleeHeadless: runtimeDraft.crawleeHeadless,
  }), [runtimeDraft, runtimeManifestDefaults]);

  const {
    settings: runtimeSettingsData,
    isLoading: runtimeSettingsLoading,
    isSaving: runtimeSettingsSaving,
    reload,
    saveNow,
  } = useRuntimeSettingsAuthority({
    payload: runtimePayload,
    dirty: runtimeDirty,
    autoSaveEnabled: runtimeAutoSaveEnabled,
    onPersisted: (result) => {
      if (result.ok) {
        setRuntimeDirty(false);
        setRuntimeSaveState('ok');
        setRuntimeSaveMessage('Runtime settings saved.');
        return;
      }
      const rejected = Object.keys(result.rejected);
      if (rejected.length > 0) {
        setRuntimeSaveState('partial');
        setRuntimeSaveMessage(`Runtime settings partially saved. Rejected ${rejected.length} key(s).`);
        return;
      }
      setRuntimeSaveState('error');
      setRuntimeSaveMessage('Runtime settings save failed.');
    },
    onError: (error) => {
      setRuntimeSaveState('error');
      setRuntimeSaveMessage(error instanceof Error ? error.message : 'Runtime settings save failed.');
    },
  });

  useEffect(() => {
    if (runtimeDirty) return;
    setRuntimeDraft((previous) => (
      runtimeDraftEqual(previous, runtimeBootstrapDraft) ? previous : runtimeBootstrapDraft
    ));
  }, [runtimeBootstrapDraft, runtimeDirty]);

  useEffect(() => {
    if (!runtimeSettingsData || runtimeDirty) return;
    const next = normalizeRuntimeDraft(runtimeSettingsData, runtimeBootstrap);
    setRuntimeDraft((previous) => (
      runtimeDraftEqual(previous, next) ? previous : next
    ));
  }, [runtimeSettingsData, runtimeBootstrap, runtimeDirty]);

  const runtimeSettingsReady = runtimeReadyFlag && !runtimeSettingsLoading;
  const runtimeAutoSaveDelaySeconds = (SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime / 1000).toFixed(1);
  const dynamicFetchControlsLocked = !runtimeDraft.dynamicCrawleeEnabled;
  const ocrControlsLocked = !runtimeDraft.scannedPdfOcrEnabled;
  const plannerControlsLocked = !runtimeDraft.discoveryEnabled;
  const plannerModelLocked = plannerControlsLocked || !runtimeDraft.phase2LlmEnabled;
  const triageModelLocked = plannerControlsLocked || !runtimeDraft.phase3LlmTriageEnabled;
  const fallbackControlsLocked = !runtimeDraft.llmFallbackEnabled;
  const reextractWindowLocked = !runtimeDraft.reextractIndexed;

  const stepEnabled = useMemo<Record<RuntimeStepId, boolean>>(() => ({
    'run-setup': true,
    'fetch-render': runtimeDraft.dynamicCrawleeEnabled,
    ocr: runtimeDraft.scannedPdfOcrEnabled,
    'planner-triage': runtimeDraft.discoveryEnabled && (runtimeDraft.phase2LlmEnabled || runtimeDraft.phase3LlmTriageEnabled),
    'role-routing': true,
    'fallback-routing': runtimeDraft.llmFallbackEnabled,
  }), [runtimeDraft]);

  const runtimeStatusClass = runtimeSettingsSaving
    ? 'text-blue-600 dark:text-blue-400'
    : !runtimeSettingsReady
      ? 'text-amber-600 dark:text-amber-300'
      : runtimeSaveState === 'error'
        ? 'text-rose-600 dark:text-rose-300'
        : runtimeSaveState === 'partial'
          ? 'text-amber-600 dark:text-amber-400'
          : runtimeDirty
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-gray-500 dark:text-gray-400';

  const runtimeStatusText = runtimeSettingsSaving
    ? 'Saving runtime settings...'
    : !runtimeSettingsReady
      ? 'Loading persisted runtime settings...'
      : runtimeSaveState === 'error'
        ? (runtimeSaveMessage || 'Runtime settings save failed.')
        : runtimeSaveState === 'partial'
          ? runtimeSaveMessage
          : runtimeDirty
            ? (runtimeAutoSaveEnabled
              ? `Unsaved changes queued for auto save (${runtimeAutoSaveDelaySeconds}s).`
              : 'Unsaved changes.')
            : runtimeSaveState === 'ok'
              ? (runtimeSaveMessage || 'All changes saved.')
              : 'All changes saved.';

  function updateDraft<K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) {
    setRuntimeDraft((previous) => ({ ...previous, [key]: value }));
    setRuntimeDirty(true);
  }

  function onNumberChange<K extends keyof RuntimeDraft>(
    key: K,
    eventValue: string,
    bounds: NumberBound,
  ) {
    const current = runtimeDraft[key];
    const fallback = typeof current === 'number' ? current : 0;
    const next = parseBoundedNumber(eventValue, fallback, bounds) as RuntimeDraft[K];
    updateDraft(key, next);
  }

  function onRoleModelChange(
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
  ) {
    const defaults = resolveModelTokenDefaults(model);
    const nextToken = clampTokenForModel(model, defaults.default_output_tokens);
    setRuntimeDraft((previous) => ({
      ...previous,
      [modelKey]: model,
      [tokenKey]: nextToken,
    }));
    setRuntimeDirty(true);
  }

  function onFallbackModelChange(
    modelKey:
      | 'llmFallbackPlanModel'
      | 'llmFallbackExtractModel'
      | 'llmFallbackValidateModel'
      | 'llmFallbackWriteModel',
    tokenKey:
      | 'llmTokensPlanFallback'
      | 'llmTokensExtractFallback'
      | 'llmTokensValidateFallback'
      | 'llmTokensWriteFallback',
    model: string,
    fallbackModelWhenEmpty: string,
  ) {
    const effectiveModel = model || fallbackModelWhenEmpty;
    const defaults = resolveModelTokenDefaults(effectiveModel);
    const nextToken = clampTokenForModel(effectiveModel, defaults.default_output_tokens);
    setRuntimeDraft((previous) => ({
      ...previous,
      [modelKey]: model,
      [tokenKey]: nextToken,
    }));
    setRuntimeDirty(true);
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

  const inputCls = 'w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1.5 text-xs';
  const panelDisabledCls = runtimeSettingsReady ? '' : 'opacity-70';

  return (
    <div className="rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 inline-flex items-center">
            Runtime Flow Settings
            <Tip text="Phase 3 runtime settings migration. These controls are ordered to match pipeline execution from start to finish." />
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Configure runtime behavior in pipeline order. Green dots in the sidebar indicate that a step is enabled by its master toggle.
          </p>
          <p className={`mt-2 text-[11px] font-semibold ${runtimeStatusClass}`}>
            {runtimeStatusText}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => { void reload(); }}
            disabled={!runtimeSettingsReady || runtimeSettingsSaving}
            className="rounded border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
          >
            Reload
          </button>
          {!runtimeAutoSaveEnabled ? (
            <button
              onClick={saveNow}
              disabled={!runtimeSettingsReady || !runtimeDirty || runtimeSettingsSaving}
              className="rounded bg-accent px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {runtimeSettingsSaving ? 'Saving...' : 'Save'}
            </button>
          ) : null}
          <button
            onClick={() => setRuntimeAutoSaveEnabled(!runtimeAutoSaveEnabled)}
            disabled={!runtimeSettingsReady}
            className={`rounded border px-3 py-1.5 text-xs ${
              runtimeAutoSaveEnabled
                ? 'border-blue-800 bg-blue-700 text-white ring-1 ring-inset ring-blue-900/40'
                : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200'
            }`}
            title={`When enabled, runtime settings are auto-saved ${runtimeAutoSaveDelaySeconds} seconds after each edit.`}
          >
            Auto-save
          </button>
          <button
            onClick={resetToDefaults}
            disabled={!runtimeSettingsReady || runtimeSettingsSaving}
            className="rounded border border-rose-300 dark:border-rose-700 px-3 py-1.5 text-xs text-rose-700 dark:text-rose-200 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-50"
            title="Reset all runtime settings to default values."
          >
            Reset All Defaults
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-3 xl:grid-cols-[220px_minmax(0,1fr)] ${panelDisabledCls}`}>
        <aside className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2 space-y-1">
          {RUNTIME_STEPS.map((step) => {
            const isActive = activeStep === step.id;
            const enabled = stepEnabled[step.id];
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                disabled={!runtimeSettingsReady}
                className={`w-full rounded border px-2 py-2 text-left transition ${
                  isActive
                    ? 'border-accent bg-accent/10 text-gray-900 dark:text-gray-100'
                    : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600 text-gray-700 dark:text-gray-300'
                } disabled:opacity-60`}
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-mono text-gray-500 dark:text-gray-400">PHASE {step.phase}</span>
                  <span
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      enabled ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-gray-600'
                    }`}
                    title={enabled ? 'Enabled' : 'Disabled by master toggle'}
                  />
                </div>
                <div className="mt-1 inline-flex items-center gap-1 text-xs font-semibold">
                  {step.label}
                  <Tip text={step.tip} />
                </div>
              </button>
            );
          })}
        </aside>

        <section className="rounded border border-gray-200 dark:border-gray-700 p-3 space-y-3">
          {activeStep === 'run-setup' ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Runtime bootstrap options for profile, provider discovery, and resume behavior.
              </div>
              <SettingRow label="Run Profile" tip="Controls runtime depth and cost envelope for this category run.">
                <select
                  value={runtimeDraft.profile}
                  onChange={(event) => updateDraft('profile', event.target.value as RuntimeDraft['profile'])}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  <option value="fast">fast</option>
                  <option value="standard">standard</option>
                  <option value="thorough">thorough</option>
                </select>
              </SettingRow>
              <SettingRow label="Discovery Enabled" tip="Master toggle for provider discovery and planner/triage controls.">
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={runtimeDraft.discoveryEnabled}
                    onChange={(event) => {
                      const enabled = event.target.checked;
                      setRuntimeDraft((previous) => ({
                        ...previous,
                        discoveryEnabled: enabled,
                        searchProvider: enabled
                          ? (previous.searchProvider === 'none' ? 'duckduckgo' : previous.searchProvider)
                          : 'none',
                      }));
                      setRuntimeDirty(true);
                    }}
                    disabled={!runtimeSettingsReady}
                  />
                  enabled
                </label>
              </SettingRow>
              <SettingRow
                label="Search Provider"
                tip="Search provider used during discovery. Disabled when discovery is off."
                disabled={!runtimeDraft.discoveryEnabled}
              >
                <select
                  value={runtimeDraft.searchProvider}
                  onChange={(event) => updateDraft('searchProvider', event.target.value as RuntimeDraft['searchProvider'])}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                >
                  {SEARCH_PROVIDER_OPTIONS.map((option) => (
                    <option key={`provider:${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Resume Mode" tip="Controls whether prior run state is reused or ignored.">
                <select
                  value={runtimeDraft.resumeMode}
                  onChange={(event) => updateDraft('resumeMode', event.target.value as RuntimeDraft['resumeMode'])}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {RESUME_MODE_OPTIONS.map((mode) => (
                    <option key={`resume:${mode}`} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow
                label="Resume Window (hours)"
                tip="Maximum age of resumable state. Older state is ignored when resume mode allows resume."
              >
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.resumeWindowHours.min}
                  max={RUNTIME_NUMBER_BOUNDS.resumeWindowHours.max}
                  step={1}
                  value={runtimeDraft.resumeWindowHours}
                  onChange={(event) => onNumberChange('resumeWindowHours', event.target.value, RUNTIME_NUMBER_BOUNDS.resumeWindowHours)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Re-extract Indexed" tip="Master toggle for stale indexed-source re-extraction.">
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={runtimeDraft.reextractIndexed}
                    onChange={(event) => updateDraft('reextractIndexed', event.target.checked)}
                    disabled={!runtimeSettingsReady}
                  />
                  enabled
                </label>
              </SettingRow>
              <SettingRow
                label="Re-extract Age (hours)"
                tip="Age threshold for re-extracting successful indexed sources."
                disabled={reextractWindowLocked}
              >
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.reextractAfterHours.min}
                  max={RUNTIME_NUMBER_BOUNDS.reextractAfterHours.max}
                  step={1}
                  value={runtimeDraft.reextractAfterHours}
                  onChange={(event) => onNumberChange('reextractAfterHours', event.target.value, RUNTIME_NUMBER_BOUNDS.reextractAfterHours)}
                  disabled={!runtimeSettingsReady || reextractWindowLocked}
                  className={inputCls}
                />
              </SettingRow>
            </div>
          ) : null}

          {activeStep === 'fetch-render' ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Fetch throughput and dynamic rendering configuration for run execution.
              </div>
              <SettingRow label="Fetch Concurrency" tip="Maximum number of in-flight fetches.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.fetchConcurrency.min}
                  max={RUNTIME_NUMBER_BOUNDS.fetchConcurrency.max}
                  step={1}
                  value={runtimeDraft.fetchConcurrency}
                  onChange={(event) => onNumberChange('fetchConcurrency', event.target.value, RUNTIME_NUMBER_BOUNDS.fetchConcurrency)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Per Host Min Delay (ms)" tip="Minimum delay inserted between requests to the same host.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs.max}
                  step={100}
                  value={runtimeDraft.perHostMinDelayMs}
                  onChange={(event) => onNumberChange('perHostMinDelayMs', event.target.value, RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Dynamic Crawlee Enabled" tip="Master toggle for browser-based dynamic fetch fallback.">
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={runtimeDraft.dynamicCrawleeEnabled}
                    onChange={(event) => updateDraft('dynamicCrawleeEnabled', event.target.checked)}
                    disabled={!runtimeSettingsReady}
                  />
                  enabled
                </label>
              </SettingRow>
              <SettingRow label="Crawlee Headless" tip="Run browser fallback in headless mode." disabled={dynamicFetchControlsLocked}>
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={runtimeDraft.crawleeHeadless}
                    onChange={(event) => updateDraft('crawleeHeadless', event.target.checked)}
                    disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
                  />
                  enabled
                </label>
              </SettingRow>
              <SettingRow
                label="Crawlee Request Timeout (sec)"
                tip="Per-request timeout for dynamic request handlers."
                disabled={dynamicFetchControlsLocked}
              >
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs.min}
                  max={RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs.max}
                  step={1}
                  value={runtimeDraft.crawleeRequestHandlerTimeoutSecs}
                  onChange={(event) => onNumberChange('crawleeRequestHandlerTimeoutSecs', event.target.value, RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs)}
                  disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Dynamic Retry Budget" tip="Maximum retry attempts for dynamic fetch policy." disabled={dynamicFetchControlsLocked}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget.min}
                  max={RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget.max}
                  step={1}
                  value={runtimeDraft.dynamicFetchRetryBudget}
                  onChange={(event) => onNumberChange('dynamicFetchRetryBudget', event.target.value, RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget)}
                  disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Dynamic Retry Backoff (ms)" tip="Backoff delay between dynamic retry attempts." disabled={dynamicFetchControlsLocked}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs.max}
                  step={100}
                  value={runtimeDraft.dynamicFetchRetryBackoffMs}
                  onChange={(event) => onNumberChange('dynamicFetchRetryBackoffMs', event.target.value, RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs)}
                  disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow
                label="Dynamic Fetch Policy Map (JSON)"
                tip="Optional JSON policy map for host-specific dynamic fetch behavior."
                disabled={dynamicFetchControlsLocked}
              >
                <textarea
                  value={runtimeDraft.dynamicFetchPolicyMapJson}
                  onChange={(event) => updateDraft('dynamicFetchPolicyMapJson', event.target.value)}
                  disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
                  className={`${inputCls} min-h-[88px] font-mono text-[11px]`}
                  spellCheck={false}
                />
              </SettingRow>
              {dynamicFetchControlsLocked ? renderDisabledHint('Dynamic fetch controls are disabled because Dynamic Crawlee is OFF.') : null}
            </div>
          ) : null}

          {activeStep === 'ocr' ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Scanned PDF OCR fallback controls with candidate-promotion policy.
              </div>
              <SettingRow label="OCR Enabled" tip="Master toggle for OCR fallback on scanned or image-only PDFs.">
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={runtimeDraft.scannedPdfOcrEnabled}
                    onChange={(event) => updateDraft('scannedPdfOcrEnabled', event.target.checked)}
                    disabled={!runtimeSettingsReady}
                  />
                  enabled
                </label>
              </SettingRow>
              <SettingRow label="Promote OCR Candidates" tip="Allows OCR-extracted candidates to be promoted into extraction context." disabled={ocrControlsLocked}>
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={runtimeDraft.scannedPdfOcrPromoteCandidates}
                    onChange={(event) => updateDraft('scannedPdfOcrPromoteCandidates', event.target.checked)}
                    disabled={!runtimeSettingsReady || ocrControlsLocked}
                  />
                  enabled
                </label>
              </SettingRow>
              <SettingRow label="OCR Backend" tip="OCR engine selection for scanned documents." disabled={ocrControlsLocked}>
                <select
                  value={runtimeDraft.scannedPdfOcrBackend}
                  onChange={(event) => updateDraft('scannedPdfOcrBackend', event.target.value as RuntimeDraft['scannedPdfOcrBackend'])}
                  disabled={!runtimeSettingsReady || ocrControlsLocked}
                  className={inputCls}
                >
                  {OCR_BACKEND_OPTIONS.map((backend) => (
                    <option key={`ocr:${backend}`} value={backend}>
                      {backend}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="OCR Max Pages" tip="Maximum number of pages sampled by OCR fallback." disabled={ocrControlsLocked}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages.min}
                  max={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages.max}
                  step={1}
                  value={runtimeDraft.scannedPdfOcrMaxPages}
                  onChange={(event) => onNumberChange('scannedPdfOcrMaxPages', event.target.value, RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages)}
                  disabled={!runtimeSettingsReady || ocrControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="OCR Max Pairs" tip="Maximum source pairs promoted from OCR extraction." disabled={ocrControlsLocked}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs.min}
                  max={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs.max}
                  step={1}
                  value={runtimeDraft.scannedPdfOcrMaxPairs}
                  onChange={(event) => onNumberChange('scannedPdfOcrMaxPairs', event.target.value, RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs)}
                  disabled={!runtimeSettingsReady || ocrControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="OCR Min Chars / Page" tip="Minimum characters required per OCR page." disabled={ocrControlsLocked}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage.min}
                  max={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage.max}
                  step={10}
                  value={runtimeDraft.scannedPdfOcrMinCharsPerPage}
                  onChange={(event) => onNumberChange('scannedPdfOcrMinCharsPerPage', event.target.value, RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage)}
                  disabled={!runtimeSettingsReady || ocrControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="OCR Min Lines / Page" tip="Minimum OCR line count required per page." disabled={ocrControlsLocked}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage.min}
                  max={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage.max}
                  step={1}
                  value={runtimeDraft.scannedPdfOcrMinLinesPerPage}
                  onChange={(event) => onNumberChange('scannedPdfOcrMinLinesPerPage', event.target.value, RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage)}
                  disabled={!runtimeSettingsReady || ocrControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="OCR Min Confidence" tip="Minimum OCR confidence required before candidate promotion." disabled={ocrControlsLocked}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence.min}
                  max={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence.max}
                  step={0.01}
                  value={runtimeDraft.scannedPdfOcrMinConfidence}
                  onChange={(event) => onNumberChange('scannedPdfOcrMinConfidence', event.target.value, RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence)}
                  disabled={!runtimeSettingsReady || ocrControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              {ocrControlsLocked ? renderDisabledHint('OCR controls are disabled because OCR Enabled is OFF.') : null}
            </div>
          ) : null}

          {activeStep === 'planner-triage' ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Planner and triage LLM controls used in the discovery stage before extraction.
              </div>
              <SettingRow label="Planner Enabled" tip="Master toggle for phase-2 planner lane." disabled={plannerControlsLocked}>
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={runtimeDraft.phase2LlmEnabled}
                    onChange={(event) => updateDraft('phase2LlmEnabled', event.target.checked)}
                    disabled={!runtimeSettingsReady || plannerControlsLocked}
                  />
                  enabled
                </label>
              </SettingRow>
              <SettingRow label="Planner Model" tip="Model used for phase-2 planning prompts." disabled={plannerModelLocked}>
                <select
                  value={runtimeDraft.phase2LlmModel}
                  onChange={(event) => onRoleModelChange('phase2LlmModel', 'llmTokensPlan', event.target.value)}
                  disabled={!runtimeSettingsReady || plannerModelLocked}
                  className={inputCls}
                >
                  {llmModelOptions.map((model) => (
                    <option key={`p2:model:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Planner Token Cap" tip="Max output tokens for planner responses." disabled={plannerModelLocked}>
                <select
                  value={runtimeDraft.llmTokensPlan}
                  onChange={(event) => updateDraft('llmTokensPlan', clampTokenForModel(runtimeDraft.phase2LlmModel, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady || plannerModelLocked}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.phase2LlmModel, 'planner')}
                </select>
              </SettingRow>
              <SettingRow label="Triage Enabled" tip="Master toggle for phase-3 SERP triage lane." disabled={plannerControlsLocked}>
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={runtimeDraft.phase3LlmTriageEnabled}
                    onChange={(event) => updateDraft('phase3LlmTriageEnabled', event.target.checked)}
                    disabled={!runtimeSettingsReady || plannerControlsLocked}
                  />
                  enabled
                </label>
              </SettingRow>
              <SettingRow label="Triage Model" tip="Model used to score SERP candidates." disabled={triageModelLocked}>
                <select
                  value={runtimeDraft.phase3LlmModel}
                  onChange={(event) => onRoleModelChange('phase3LlmModel', 'llmTokensTriage', event.target.value)}
                  disabled={!runtimeSettingsReady || triageModelLocked}
                  className={inputCls}
                >
                  {llmModelOptions.map((model) => (
                    <option key={`p3:model:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Triage Token Cap" tip="Max output tokens for triage responses." disabled={triageModelLocked}>
                <select
                  value={runtimeDraft.llmTokensTriage}
                  onChange={(event) => updateDraft('llmTokensTriage', clampTokenForModel(runtimeDraft.phase3LlmModel, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady || triageModelLocked}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.phase3LlmModel, 'triage')}
                </select>
              </SettingRow>
              {plannerControlsLocked ? renderDisabledHint('Planner and triage controls are disabled because Discovery Enabled is OFF.') : null}
            </div>
          ) : null}

          {activeStep === 'role-routing' ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Primary LLM routing for runtime role lanes.
              </div>
              <SettingRow label="Fast Model" tip="Primary model for fast-pass lane.">
                <select
                  value={runtimeDraft.llmModelFast}
                  onChange={(event) => onRoleModelChange('llmModelFast', 'llmTokensFast', event.target.value)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {llmModelOptions.map((model) => (
                    <option key={`fast:model:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Fast Token Cap" tip="Max output tokens for fast-pass calls.">
                <select
                  value={runtimeDraft.llmTokensFast}
                  onChange={(event) => updateDraft('llmTokensFast', clampTokenForModel(runtimeDraft.llmModelFast, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.llmModelFast, 'fast')}
                </select>
              </SettingRow>
              <SettingRow label="Reasoning Model" tip="Primary model for reasoning lane.">
                <select
                  value={runtimeDraft.llmModelReasoning}
                  onChange={(event) => onRoleModelChange('llmModelReasoning', 'llmTokensReasoning', event.target.value)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {llmModelOptions.map((model) => (
                    <option key={`reasoning:model:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Reasoning Token Cap" tip="Max output tokens for reasoning calls.">
                <select
                  value={runtimeDraft.llmTokensReasoning}
                  onChange={(event) => updateDraft('llmTokensReasoning', clampTokenForModel(runtimeDraft.llmModelReasoning, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.llmModelReasoning, 'reasoning')}
                </select>
              </SettingRow>
              <SettingRow label="Extract Model" tip="Primary model for extraction lane.">
                <select
                  value={runtimeDraft.llmModelExtract}
                  onChange={(event) => onRoleModelChange('llmModelExtract', 'llmTokensExtract', event.target.value)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {llmModelOptions.map((model) => (
                    <option key={`extract:model:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Extract Token Cap" tip="Max output tokens for extraction calls.">
                <select
                  value={runtimeDraft.llmTokensExtract}
                  onChange={(event) => updateDraft('llmTokensExtract', clampTokenForModel(runtimeDraft.llmModelExtract, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.llmModelExtract, 'extract')}
                </select>
              </SettingRow>
              <SettingRow label="Validate Model" tip="Primary model for validation lane.">
                <select
                  value={runtimeDraft.llmModelValidate}
                  onChange={(event) => onRoleModelChange('llmModelValidate', 'llmTokensValidate', event.target.value)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {llmModelOptions.map((model) => (
                    <option key={`validate:model:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Validate Token Cap" tip="Max output tokens for validation calls.">
                <select
                  value={runtimeDraft.llmTokensValidate}
                  onChange={(event) => updateDraft('llmTokensValidate', clampTokenForModel(runtimeDraft.llmModelValidate, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.llmModelValidate, 'validate')}
                </select>
              </SettingRow>
              <SettingRow label="Write Model" tip="Primary model for write lane.">
                <select
                  value={runtimeDraft.llmModelWrite}
                  onChange={(event) => onRoleModelChange('llmModelWrite', 'llmTokensWrite', event.target.value)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {llmModelOptions.map((model) => (
                    <option key={`write:model:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Write Token Cap" tip="Max output tokens for write calls.">
                <select
                  value={runtimeDraft.llmTokensWrite}
                  onChange={(event) => updateDraft('llmTokensWrite', clampTokenForModel(runtimeDraft.llmModelWrite, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.llmModelWrite, 'write')}
                </select>
              </SettingRow>
            </div>
          ) : null}

          {activeStep === 'fallback-routing' ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Fallback role lanes invoked when primary routes fail or are unavailable.
              </div>
              <SettingRow label="Fallback Enabled" tip="Master toggle for all fallback role routes.">
                <label className="inline-flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={runtimeDraft.llmFallbackEnabled}
                    onChange={(event) => updateDraft('llmFallbackEnabled', event.target.checked)}
                    disabled={!runtimeSettingsReady}
                  />
                  enabled
                </label>
              </SettingRow>
              <SettingRow label="Plan Fallback Model" tip="Fallback model for planner lane." disabled={fallbackControlsLocked}>
                <select
                  value={runtimeDraft.llmFallbackPlanModel}
                  onChange={(event) => onFallbackModelChange('llmFallbackPlanModel', 'llmTokensPlanFallback', event.target.value, runtimeDraft.phase2LlmModel)}
                  disabled={!runtimeSettingsReady || fallbackControlsLocked}
                  className={inputCls}
                >
                  <option value="">none</option>
                  {llmModelOptions.map((model) => (
                    <option key={`fallback:plan:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Plan Fallback Token Cap" tip="Max output tokens for fallback planner calls." disabled={fallbackControlsLocked}>
                <select
                  value={runtimeDraft.llmTokensPlanFallback}
                  onChange={(event) => updateDraft('llmTokensPlanFallback', clampTokenForModel(runtimeDraft.llmFallbackPlanModel || runtimeDraft.phase2LlmModel, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady || fallbackControlsLocked}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.llmFallbackPlanModel || runtimeDraft.phase2LlmModel, 'fallback-plan')}
                </select>
              </SettingRow>
              <SettingRow label="Extract Fallback Model" tip="Fallback model for extraction lane." disabled={fallbackControlsLocked}>
                <select
                  value={runtimeDraft.llmFallbackExtractModel}
                  onChange={(event) => onFallbackModelChange('llmFallbackExtractModel', 'llmTokensExtractFallback', event.target.value, runtimeDraft.llmModelExtract)}
                  disabled={!runtimeSettingsReady || fallbackControlsLocked}
                  className={inputCls}
                >
                  <option value="">none</option>
                  {llmModelOptions.map((model) => (
                    <option key={`fallback:extract:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Extract Fallback Token Cap" tip="Max output tokens for fallback extraction calls." disabled={fallbackControlsLocked}>
                <select
                  value={runtimeDraft.llmTokensExtractFallback}
                  onChange={(event) => updateDraft('llmTokensExtractFallback', clampTokenForModel(runtimeDraft.llmFallbackExtractModel || runtimeDraft.llmModelExtract, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady || fallbackControlsLocked}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.llmFallbackExtractModel || runtimeDraft.llmModelExtract, 'fallback-extract')}
                </select>
              </SettingRow>
              <SettingRow label="Validate Fallback Model" tip="Fallback model for validation lane." disabled={fallbackControlsLocked}>
                <select
                  value={runtimeDraft.llmFallbackValidateModel}
                  onChange={(event) => onFallbackModelChange('llmFallbackValidateModel', 'llmTokensValidateFallback', event.target.value, runtimeDraft.llmModelValidate)}
                  disabled={!runtimeSettingsReady || fallbackControlsLocked}
                  className={inputCls}
                >
                  <option value="">none</option>
                  {llmModelOptions.map((model) => (
                    <option key={`fallback:validate:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Validate Fallback Token Cap" tip="Max output tokens for fallback validation calls." disabled={fallbackControlsLocked}>
                <select
                  value={runtimeDraft.llmTokensValidateFallback}
                  onChange={(event) => updateDraft('llmTokensValidateFallback', clampTokenForModel(runtimeDraft.llmFallbackValidateModel || runtimeDraft.llmModelValidate, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady || fallbackControlsLocked}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.llmFallbackValidateModel || runtimeDraft.llmModelValidate, 'fallback-validate')}
                </select>
              </SettingRow>
              <SettingRow label="Write Fallback Model" tip="Fallback model for write lane." disabled={fallbackControlsLocked}>
                <select
                  value={runtimeDraft.llmFallbackWriteModel}
                  onChange={(event) => onFallbackModelChange('llmFallbackWriteModel', 'llmTokensWriteFallback', event.target.value, runtimeDraft.llmModelWrite)}
                  disabled={!runtimeSettingsReady || fallbackControlsLocked}
                  className={inputCls}
                >
                  <option value="">none</option>
                  {llmModelOptions.map((model) => (
                    <option key={`fallback:write:${model}`} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Write Fallback Token Cap" tip="Max output tokens for fallback write calls." disabled={fallbackControlsLocked}>
                <select
                  value={runtimeDraft.llmTokensWriteFallback}
                  onChange={(event) => updateDraft('llmTokensWriteFallback', clampTokenForModel(runtimeDraft.llmFallbackWriteModel || runtimeDraft.llmModelWrite, Number.parseInt(event.target.value, 10)))}
                  disabled={!runtimeSettingsReady || fallbackControlsLocked}
                  className={inputCls}
                >
                  {renderTokenOptions(runtimeDraft.llmFallbackWriteModel || runtimeDraft.llmModelWrite, 'fallback-write')}
                </select>
              </SettingRow>
              {fallbackControlsLocked ? renderDisabledHint('Fallback routing controls are disabled because Fallback Enabled is OFF.') : null}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
