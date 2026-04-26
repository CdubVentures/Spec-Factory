import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  SettingGroupBlock,
  SettingRow,
  SettingToggle,
} from '../../pipeline-settings/index.ts';
import type { LlmPhaseId } from '../types/llmPhaseTypes.generated.ts';
import type { LlmPhaseOverride, LlmPhaseOverrides } from '../types/llmPhaseOverrideTypes.generated.ts';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes.ts';
import { resolvePhaseModel, uiPhaseIdToOverrideKey, type GlobalDraftSlice } from '../state/llmPhaseOverridesBridge.generated.ts';
import { buildModelDropdownOptions } from '../state/llmModelDropdownOptions.ts';
import { AlertBanner } from '../../../shared/ui/feedback/AlertBanner.tsx';
import { resolveProviderForModel, parseModelKey } from '../state/llmProviderRegistryBridge.ts';
import { ModelSelectDropdown, GlobalDefaultIcon } from '../components/ModelSelectDropdown.tsx';
import {
  LlmCapabilityPickerCore,
  resolveModelCapabilities,
  LockedEffortIcon,
  type LlmCapabilityBundle,
  type LlmCapabilityEffort,
} from '../../../shared/ui/finder/LlmCapabilityPickerCore.tsx';
import { useModuleSettingsAuthority } from '../../pipeline-settings/state/moduleSettingsAuthority.ts';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import { PromptTemplateEditor, UserMessageInjectionPanel, VariableReferencePanels } from '../../../shared/ui/prompt-template/PromptTemplateEditor.tsx';
import type { TemplateVariableDef, UserMessageInjection } from '../../../shared/ui/prompt-template/PromptTemplateEditor.tsx';
import { NumberStepper } from '../../../shared/ui/forms/NumberStepper.tsx';

/** Shape of a prompt template definition from the backend registry. */
export interface PromptTemplateDef {
  readonly promptKey: string;
  readonly label: string;
  readonly storageScope: 'global' | 'module';
  readonly moduleId?: string;
  readonly settingKey?: string;
  readonly defaultTemplate: string;
  readonly variables: readonly TemplateVariableDef[];
  readonly userMessageInfo?: readonly UserMessageInjection[];
}

interface LlmPhaseSectionProps {
  phaseId: LlmPhaseId;
  inputCls: string;
  llmModelOptions: readonly string[];
  phaseOverrides: LlmPhaseOverrides;
  onPhaseOverrideChange: (overrides: LlmPhaseOverrides) => void;
  registry: LlmProviderEntry[];
  globalDraft: GlobalDraftSlice;
  apiKeyFilter?: (provider: LlmProviderEntry) => boolean;
  phaseSchema?: { system_prompt: string; user_message?: string; hero_system_prompt?: string; identity_check_prompt?: string; response_schema: Record<string, unknown>; hero_response_schema?: Record<string, unknown>; identity_check_response_schema?: Record<string, unknown>; view_prompts?: Record<string, string>; eval_criteria_defaults?: Record<string, Record<string, string>>; eval_criteria_categories?: readonly string[]; view_prompt_defaults?: Record<string, Record<string, Record<'loop' | 'priority' | 'additional', string>>>; view_prompt_categories?: readonly string[]; view_prompt_roles?: readonly ('loop' | 'priority' | 'additional')[]; prompt_templates?: readonly PromptTemplateDef[] } | null;
  onRunWriterTest?: () => void;
  writerTestDisabled?: boolean;
}

export const LlmPhaseSection = memo(function LlmPhaseSection({
  phaseId,
  inputCls,
  llmModelOptions,
  phaseOverrides,
  onPhaseOverrideChange,
  registry,
  globalDraft,
  apiKeyFilter,
  phaseSchema,
  onRunWriterTest,
  writerTestDisabled,
}: LlmPhaseSectionProps) {
  const overrideKey = uiPhaseIdToOverrideKey(phaseId);
  const resolved = overrideKey
    ? resolvePhaseModel(phaseOverrides, overrideKey, globalDraft)
    : null;

  const baseOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, 'primary', apiKeyFilter, resolved ? [resolved.baseModel] : undefined),
    [llmModelOptions, registry, apiKeyFilter, resolved?.baseModel],
  );
  const reasoningOptions = useMemo(
    () => buildModelDropdownOptions(llmModelOptions, registry, 'reasoning', apiKeyFilter, resolved ? [resolved.reasoningModel] : undefined),
    [llmModelOptions, registry, apiKeyFilter, resolved?.reasoningModel],
  );
  const updateOverrideField = useCallback((field: string, value: string | boolean | number | null) => {
    if (!overrideKey) return;
    const current = phaseOverrides[overrideKey] ?? {};
    const next: LlmPhaseOverrides = {
      ...phaseOverrides,
      [overrideKey]: { ...current, [field]: value },
    };
    onPhaseOverrideChange(next);
  }, [overrideKey, phaseOverrides, onPhaseOverrideChange]);

  const fallbackModelCapabilities = useMemo(
    () => resolveModelCapabilities(registry, resolved?.effectiveFallbackModel ?? ''),
    [resolved?.effectiveFallbackModel, registry],
  );

  // WHY: Bundle assembled from phaseOverrides + resolved.useReasoning (which
  // may inherit from global). The picker's onChange hands back a full bundle;
  // we diff to keep persistence shape identical to the legacy per-field writes.
  const baseBundle: LlmCapabilityBundle = useMemo(() => {
    const slot = overrideKey ? phaseOverrides[overrideKey] : undefined;
    return {
      model: slot?.baseModel ?? '',
      useReasoning: resolved?.useReasoning ?? false,
      reasoningModel: slot?.reasoningModel ?? '',
      thinking: slot?.thinking ?? false,
      thinkingEffort: (slot?.thinkingEffort ?? '') as LlmCapabilityEffort,
      webSearch: slot?.webSearch ?? false,
    };
  }, [phaseOverrides, overrideKey, resolved?.useReasoning]);

  const handleBaseBundleChange = useCallback((next: LlmCapabilityBundle) => {
    if (!overrideKey) return;
    const current = phaseOverrides[overrideKey] ?? {};
    const patch: Partial<LlmPhaseOverride> = {};
    if (next.model !== baseBundle.model) patch.baseModel = next.model;
    if (next.useReasoning !== baseBundle.useReasoning) patch.useReasoning = next.useReasoning;
    if (next.reasoningModel !== baseBundle.reasoningModel) patch.reasoningModel = next.reasoningModel;
    if (next.thinking !== baseBundle.thinking) patch.thinking = next.thinking;
    if (next.thinkingEffort !== baseBundle.thinkingEffort) patch.thinkingEffort = next.thinkingEffort;
    if (next.webSearch !== baseBundle.webSearch) patch.webSearch = next.webSearch;
    if (Object.keys(patch).length === 0) return;
    onPhaseOverrideChange({ ...phaseOverrides, [overrideKey]: { ...current, ...patch } });
  }, [overrideKey, phaseOverrides, baseBundle, onPhaseOverrideChange]);

  const phaseTokenWarnings = useMemo(() => {
    if (!overrideKey || !resolved) return [];
    const tokenCap = phaseOverrides[overrideKey]?.maxOutputTokens;
    if (tokenCap == null || tokenCap <= 0) return [];
    const rawModelKey = resolved.baseModel;
    if (!rawModelKey) return [];
    const provider = resolveProviderForModel(registry, rawModelKey);
    if (!provider) return [];
    const { modelId: bareModelId } = parseModelKey(rawModelKey);
    const model = provider.models.find((m) => m.modelId === bareModelId);
    if (!model) return [];
    const warnings: { field: 'maxOutput' | 'contextOverflow'; model: string; setting: number; limit: number }[] = [];
    if (model.maxOutputTokens != null && tokenCap > model.maxOutputTokens) {
      warnings.push({ field: 'maxOutput', model: bareModelId, setting: tokenCap, limit: model.maxOutputTokens });
    }
    if (model.maxContextTokens != null && tokenCap > model.maxContextTokens * 0.5) {
      warnings.push({ field: 'contextOverflow', model: bareModelId, setting: tokenCap, limit: model.maxContextTokens });
    }
    return warnings;
  }, [overrideKey, resolved, phaseOverrides, registry]);

  if (!overrideKey || !resolved) return null;

  return (
    <>
    {/* ── Limits ── */}
    <SettingGroupBlock title="Limits" collapsible storageKey={`sf:llm-phase:${phaseId}:limits`}>
      <SettingRow label="Disable Limits" tip="Remove all per-phase token and timeout caps. Only the model's hardware maximum applies.">
        <SettingToggle
          checked={resolved.disableLimits}
          onChange={(v) => updateOverrideField('disableLimits', v)}
        />
      </SettingRow>
      {phaseId !== 'writer' && (
        <SettingRow label="JSON Strict Mode" tip="When ON (default), one LLM call with strict JSON schema. When OFF, two-phase: free-form research then the global Writer phase formats the JSON.">
          <SettingToggle
            checked={resolved.jsonStrict}
            onChange={(v) => updateOverrideField('jsonStrict', v)}
          />
        </SettingRow>
      )}
      {phaseId !== 'writer' && !resolved.jsonStrict && (
        <div className="sf-text-caption sf-text-muted px-1 -mt-1">
          Research uses the primary model freely. The global <strong>Writer</strong> phase formats the JSON output.
        </div>
      )}
      <SettingRow label="Max Output Tokens" tip="Maximum output tokens for this phase. Leave empty to inherit global default.">
        <div className="flex items-center gap-1.5">
          {phaseOverrides[overrideKey]?.maxOutputTokens == null && !resolved.disableLimits && <GlobalDefaultIcon />}
          <NumberStepper
            className="w-full"
            min={0}
            step={1}
            value={resolved.disableLimits ? '' : String(phaseOverrides[overrideKey]?.maxOutputTokens ?? '')}
            placeholder={resolved.disableLimits ? 'hardware max' : `↩ ${resolved.maxOutputTokens ?? 'auto'}`}
            disabled={resolved.disableLimits}
            ariaLabel="max output tokens"
            onChange={(next) => {
              updateOverrideField('maxOutputTokens', next === '' ? null : (Number.parseInt(next, 10) || 0));
            }}
          />
        </div>
      </SettingRow>
      <SettingRow label="Max Context Tokens" tip="Maximum context window tokens for this phase. Leave empty to inherit global default.">
        <div className="flex items-center gap-1.5">
          {phaseOverrides[overrideKey]?.maxContextTokens == null && !resolved.disableLimits && <GlobalDefaultIcon />}
          <NumberStepper
            className="w-full"
            min={128}
            step={1}
            value={resolved.disableLimits ? '' : String(phaseOverrides[overrideKey]?.maxContextTokens ?? '')}
            placeholder={resolved.disableLimits ? 'hardware max' : `↩ ${resolved.maxContextTokens ?? 'auto'}`}
            disabled={resolved.disableLimits}
            ariaLabel="max context tokens"
            onChange={(next) => {
              updateOverrideField('maxContextTokens', next === '' ? null : (Number.parseInt(next, 10) || 0));
            }}
          />
        </div>
      </SettingRow>
      <SettingRow label="Reasoning Budget" tip="Thinking/reasoning token budget for this phase. Inherited by the fallback model. Leave empty to inherit the global default.">
        <div className="flex items-center gap-1.5">
          {phaseOverrides[overrideKey]?.reasoningBudget == null && !resolved.disableLimits && <GlobalDefaultIcon />}
          <NumberStepper
            className="w-full"
            min={0}
            step={1}
            value={resolved.disableLimits ? '' : String(phaseOverrides[overrideKey]?.reasoningBudget ?? '')}
            placeholder={resolved.disableLimits ? 'hardware max' : `↩ ${resolved.reasoningBudget ?? 'auto'}`}
            disabled={resolved.disableLimits}
            ariaLabel="reasoning budget"
            onChange={(next) => {
              updateOverrideField('reasoningBudget', next === '' ? null : (Number.parseInt(next, 10) || 0));
            }}
          />
        </div>
      </SettingRow>
      <SettingRow label="Timeout (ms)" tip="LLM request timeout for this phase. Leave empty to inherit global default.">
        <div className="flex items-center gap-1.5">
          {phaseOverrides[overrideKey]?.timeoutMs == null && !resolved.disableLimits && <GlobalDefaultIcon />}
          <NumberStepper
            className="w-full"
            min={1000}
            step={1000}
            value={resolved.disableLimits ? '' : String(phaseOverrides[overrideKey]?.timeoutMs ?? '')}
            placeholder={resolved.disableLimits ? '1200000 (20 min)' : `↩ ${resolved.timeoutMs ?? 'auto'}`}
            disabled={resolved.disableLimits}
            ariaLabel="timeout ms"
            onChange={(next) => {
              updateOverrideField('timeoutMs', next === '' ? null : (Number.parseInt(next, 10) || 0));
            }}
          />
        </div>
      </SettingRow>
      {phaseTokenWarnings.map((w) => (
        <AlertBanner
          key={`phase-token-${w.field}`}
          severity="warning"
          title={w.field === 'contextOverflow'
            ? 'Output allocation exceeds 50% of context window'
            : 'Token cap exceeds model limit'}
          message={w.field === 'contextOverflow'
            ? `${w.model} context window is ${w.limit.toLocaleString()}, but this phase output is set to ${w.setting.toLocaleString()} (>${Math.floor(w.limit * 0.5).toLocaleString()}).`
            : `${w.model} max output is ${w.limit.toLocaleString()}, but this phase is set to ${w.setting.toLocaleString()}.`}
        />
      ))}
    </SettingGroupBlock>

    {/* ── Base Model ── */}
    <SettingGroupBlock title="Base Model" collapsible storageKey={`sf:llm-phase:${phaseId}:base`}>
      <LlmCapabilityPickerCore
        value={baseBundle}
        onChange={handleBaseBundleChange}
        registry={registry}
        llmModelOptions={llmModelOptions}
        apiKeyFilter={apiKeyFilter}
        globalDefaultPlanModel={globalDraft.llmModelPlan}
        globalDefaultReasoningModel={globalDraft.llmModelReasoning}
        inheritedModelId={resolved.baseModel}
        allowWebSearch={phaseId !== 'writer'}
        inputCls={inputCls}
      />
    </SettingGroupBlock>

    {/* ── Fallback (error recovery) ── */}
    {phaseId === 'writer' && onRunWriterTest && (
      <SettingGroupBlock title="Writer Test" collapsible storageKey={`sf:llm-phase:${phaseId}:test`}>
        <SettingRow label="Model Test" tip="Runs the visible Writer test prompt against the selected Writer model and validates strict JSON behavior.">
          <button
            type="button"
            onClick={onRunWriterTest}
            disabled={writerTestDisabled}
            className="sf-primary-button px-3 py-1.5 sf-text-label disabled:opacity-50"
          >
            Run Test
          </button>
        </SettingRow>
      </SettingGroupBlock>
    )}

    <SettingGroupBlock title="Fallback" collapsible storageKey={`sf:llm-phase:${phaseId}:fallback`}>
      <SettingRow label="Model" tip="Fallback model when the primary fails. Leave on default to inherit global fallback.">
        <div className="flex items-center gap-1.5">
          {!phaseOverrides[overrideKey]?.fallbackModel && <GlobalDefaultIcon />}
          <ModelSelectDropdown
            options={baseOptions}
            className={inputCls}
            value={phaseOverrides[overrideKey]?.fallbackModel ?? ''}
            onChange={(v) => updateOverrideField('fallbackModel', v)}
            disabled={resolved.fallbackUseReasoning}
            allowNone
            noneLabel={`↩ ${parseModelKey(resolved.fallbackModel).modelId || '(none)'}`}
            noneModelId={resolved.fallbackModel}
            globalDefaultModelId={globalDraft.llmPlanFallbackModel}
          />
        </div>
      </SettingRow>
      <SettingRow label="Use Reasoning" tip="Enable reasoning model for the fallback.">
        <SettingToggle
          checked={resolved.fallbackUseReasoning}
          onChange={(v) => updateOverrideField('fallbackUseReasoning', v)}
        />
      </SettingRow>
      {resolved.fallbackUseReasoning && (
        <SettingRow label="Reasoning Model" tip="Reasoning model for the fallback.">
          <div className="flex items-center gap-1.5">
            {!phaseOverrides[overrideKey]?.fallbackReasoningModel && <GlobalDefaultIcon />}
            <ModelSelectDropdown
              options={reasoningOptions}
              className={inputCls}
              value={phaseOverrides[overrideKey]?.fallbackReasoningModel ?? ''}
              onChange={(v) => updateOverrideField('fallbackReasoningModel', v)}
              allowNone
              noneLabel={`↩ ${parseModelKey(globalDraft.llmReasoningFallbackModel).modelId || '(none)'}`}
              noneModelId={globalDraft.llmReasoningFallbackModel}
              globalDefaultModelId={globalDraft.llmReasoningFallbackModel}
            />
          </div>
        </SettingRow>
      )}
      {fallbackModelCapabilities.thinking && (
        <SettingRow label="Thinking" tip="Send thinking flag to the fallback model.">
          <SettingToggle
            checked={phaseOverrides[overrideKey]?.fallbackThinking ?? false}
            onChange={(v) => updateOverrideField('fallbackThinking', v)}
          />
        </SettingRow>
      )}
      {fallbackModelCapabilities.thinking && (phaseOverrides[overrideKey]?.fallbackThinking ?? false) && fallbackModelCapabilities.lockedEffort && (
        <SettingRow label="Thinking Effort" tip="Effort level is locked in the model name.">
          <div className="flex items-center gap-1.5">
            <LockedEffortIcon />
            <select className={inputCls} disabled value={fallbackModelCapabilities.lockedEffort}>
              <option value={fallbackModelCapabilities.lockedEffort}>{fallbackModelCapabilities.lockedEffort}</option>
            </select>
          </div>
        </SettingRow>
      )}
      {fallbackModelCapabilities.thinking && (phaseOverrides[overrideKey]?.fallbackThinking ?? false) && !fallbackModelCapabilities.lockedEffort && fallbackModelCapabilities.thinkingEffortOptions.length > 1 && (
        <SettingRow label="Thinking Effort" tip="Reasoning effort for the fallback model.">
          <select
            className={inputCls}
            value={phaseOverrides[overrideKey]?.fallbackThinkingEffort ?? 'medium'}
            onChange={(e) => updateOverrideField('fallbackThinkingEffort', e.target.value)}
          >
            {fallbackModelCapabilities.thinkingEffortOptions.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </SettingRow>
      )}
      {phaseId !== 'writer' && fallbackModelCapabilities.webSearch && (
        <SettingRow label="Web Search" tip="Send web_search flag to the fallback model.">
          <SettingToggle
            checked={phaseOverrides[overrideKey]?.fallbackWebSearch ?? false}
            onChange={(v) => updateOverrideField('fallbackWebSearch', v)}
          />
        </SettingRow>
      )}
    </SettingGroupBlock>

    {phaseSchema && (
      <SettingGroupBlock title="LLM Call Contract">
        {/* Prompt template editors (generic, registry-driven) */}
        {phaseSchema.prompt_templates && phaseSchema.prompt_templates.length > 0 ? (
          phaseSchema.eval_criteria_defaults && phaseSchema.eval_criteria_categories ? (
            /* Image-evaluator: single column — view eval, criteria tabs, then hero eval */
            <EvalPromptLayout
              phaseId={phaseId}
              promptTemplates={phaseSchema.prompt_templates}
              phaseOverrides={phaseOverrides}
              onPhaseOverrideChange={onPhaseOverrideChange}
              responseSchemas={[
                phaseSchema.response_schema,
                ...(phaseSchema.hero_response_schema ? [phaseSchema.hero_response_schema] : []),
              ]}
              phaseSchema={phaseSchema as CategoryViewPromptTabsPhaseSchema}
            />
          ) : (
            /* CEF / Image-finder: two-column grid for multiple prompts.
             * For image-finder, the per-view per-role editors slot inside
             * the view column between the view template and its schema. */
            <PromptTemplatesSection
              phaseId={phaseId}
              promptTemplates={phaseSchema.prompt_templates}
              phaseOverrides={phaseOverrides}
              onPhaseOverrideChange={onPhaseOverrideChange}
              responseSchemas={[
                phaseSchema.response_schema,
                ...(phaseSchema.identity_check_response_schema ? [phaseSchema.identity_check_response_schema] : []),
                ...(phaseSchema.hero_response_schema ? [phaseSchema.hero_response_schema] : []),
              ]}
              renderExtraForTemplate={(tmpl, activeCategory) =>
                tmpl.promptKey === 'view'
                && phaseSchema.view_prompt_defaults
                && phaseSchema.view_prompt_categories
                && phaseSchema.view_prompt_roles
                  ? (
                    <DiscoveryViewPromptTabs
                      phaseSchema={phaseSchema as DiscoveryViewPromptTabsPhaseSchema}
                      activeCategory={activeCategory}
                    />
                  )
                  : null
              }
            />
          )
        ) : phaseSchema.eval_criteria_defaults && phaseSchema.eval_criteria_categories ? (
          <CategoryViewPromptTabs phaseSchema={phaseSchema as CategoryViewPromptTabsPhaseSchema} />
        ) : (
          /* Fallback: read-only display for phases without templates */
          <div className="space-y-3">
            {phaseSchema.system_prompt && (
              <div>
                <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">System Prompt</div>
                <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                  {String(phaseSchema.system_prompt)}
                </pre>
              </div>
            )}
            {phaseSchema.user_message && (
              <div>
                <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">User Message</div>
                <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                  {String(phaseSchema.user_message)}
                </pre>
              </div>
            )}
            {phaseSchema.response_schema && (
              <div>
                <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">Response Schema</div>
                <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                  {JSON.stringify(phaseSchema.response_schema, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </SettingGroupBlock>
    )}
  </>
  );
});

/* ── Global Prompt Template Editor (phaseOverrides storage) ──────── */

function GlobalPromptTemplateEditor({ phaseId, templateDef, phaseOverrides, onPhaseOverrideChange, hideVariablesPanel, hideUserMessagePanel }: {
  readonly phaseId: LlmPhaseId;
  readonly templateDef: PromptTemplateDef;
  readonly phaseOverrides: LlmPhaseOverrides;
  readonly onPhaseOverrideChange: (overrides: LlmPhaseOverrides) => void;
  readonly hideVariablesPanel?: boolean;
  readonly hideUserMessagePanel?: boolean;
}) {
  const overrideKey = uiPhaseIdToOverrideKey(phaseId);
  const currentOverride = (overrideKey && (phaseOverrides as Record<string, Record<string, string>>)?.[overrideKey]?.systemPromptTemplate) || '';

  const handleSave = useCallback((value: string) => {
    if (!overrideKey) return;
    const prev = (phaseOverrides as Record<string, Record<string, unknown>>)?.[overrideKey] ?? {};
    onPhaseOverrideChange({
      ...phaseOverrides,
      [overrideKey]: { ...prev, systemPromptTemplate: value },
    } as LlmPhaseOverrides);
  }, [overrideKey, phaseOverrides, onPhaseOverrideChange]);

  const handleReset = useCallback(() => handleSave(''), [handleSave]);

  return (
    <PromptTemplateEditor
      label={templateDef.label}
      defaultTemplate={templateDef.defaultTemplate}
      currentOverride={currentOverride}
      variables={templateDef.variables}
      onSave={handleSave}
      onReset={handleReset}
      userMessageInfo={templateDef.userMessageInfo}
      hideVariablesPanel={hideVariablesPanel}
      hideUserMessagePanel={hideUserMessagePanel}
    />
  );
}

/* ── Module Prompt Template Editor (finderSqlStore storage) ──────── */

function ModulePromptTemplateEditor({ templateDef, category, hideVariablesPanel, hideUserMessagePanel }: {
  readonly templateDef: PromptTemplateDef;
  readonly category: string;
  readonly hideVariablesPanel?: boolean;
  readonly hideUserMessagePanel?: boolean;
}) {
  const { settings, saveSetting, isLoading } = useModuleSettingsAuthority({
    category,
    moduleId: templateDef.moduleId ?? '',
  });

  const settingKey = templateDef.settingKey ?? `${templateDef.promptKey}PromptTemplate`;
  const currentOverride = (settings[settingKey] as string) ?? '';

  const handleSave = useCallback((value: string) => {
    saveSetting(settingKey, value);
  }, [settingKey, saveSetting]);

  const handleReset = useCallback(() => {
    saveSetting(settingKey, '');
  }, [settingKey, saveSetting]);

  return (
    <PromptTemplateEditor
      label={templateDef.label}
      defaultTemplate={templateDef.defaultTemplate}
      currentOverride={currentOverride}
      variables={templateDef.variables}
      onSave={handleSave}
      onReset={handleReset}
      isLoading={isLoading}
      userMessageInfo={templateDef.userMessageInfo}
      hideVariablesPanel={hideVariablesPanel}
      hideUserMessagePanel={hideUserMessagePanel}
    />
  );
}

/* ── Eval Prompt Layout (image-evaluator — two columns: View Eval | Hero Eval) ──
 * WHY: Two LLM calls = two columns. Shared tabs (category, view) on top.
 * Left column:  view criteria → view structural prompt → view schema
 * Right column: hero criteria → hero structural prompt → hero schema
 */

const EVAL_VIEW_TABS = ['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle'] as const;

function EvalPromptLayout({ promptTemplates, responseSchemas, phaseSchema }: {
  readonly phaseId: LlmPhaseId;
  readonly promptTemplates: readonly PromptTemplateDef[];
  readonly phaseOverrides: LlmPhaseOverrides;
  readonly onPhaseOverrideChange: (overrides: LlmPhaseOverrides) => void;
  readonly responseSchemas: Record<string, unknown>[];
  readonly phaseSchema: CategoryViewPromptTabsPhaseSchema;
}) {
  const categories = phaseSchema.eval_criteria_categories;
  const defaults = phaseSchema.eval_criteria_defaults;
  const viewEval = promptTemplates[0];
  const heroEval = promptTemplates[1];

  const [activeCategory, setActiveCategory] = usePersistedTab<string>(
    'llm-config:eval-category',
    categories[0] ?? 'mouse',
    { validValues: categories as unknown as readonly string[] },
  );
  const [activeView, setActiveView] = usePersistedTab<string>(
    'llm-config:eval-view',
    'top',
    { validValues: EVAL_VIEW_TABS as unknown as readonly string[] },
  );

  const { settings, saveSetting, isLoading } = useModuleSettingsAuthority({
    category: activeCategory,
    moduleId: 'productImageFinder',
  });

  return (
    <div className="space-y-3">
      {/* Category tabs (shared) */}
      <div className="flex flex-wrap gap-1 mb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded cursor-pointer transition-opacity ${
              activeCategory === cat ? 'sf-primary-button' : 'sf-btn-ghost sf-text-muted hover:opacity-80'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* View tabs (shared — controls left column's criteria) */}
      <div className="flex flex-wrap gap-1">
        {EVAL_VIEW_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveView(tab)}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer transition-opacity ${
              activeView === tab ? 'sf-primary-button' : 'sf-btn-ghost sf-text-muted hover:opacity-80'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Two columns: View Eval | Hero Eval */}
      <div className="grid grid-cols-2 gap-4 items-start">
        {/* ── Left: View Eval ── */}
        <div className="space-y-3">
          <EvalCriteriaEditor
            label={`${activeCategory} \u2014 ${activeView} View Eval Criteria`}
            settingKey={`evalViewCriteria_${activeView}`}
            defaultValue={defaults[activeCategory]?.[activeView] ?? ''}
            settings={settings}
            saveSetting={saveSetting}
            isLoading={isLoading}
            tabKey={`${activeCategory}:${activeView}`}
          />
          {viewEval && (
            <ModulePromptTemplateEditor
              key={`${viewEval.promptKey}-${activeCategory}`}
              templateDef={viewEval}
              category={activeCategory}
            />
          )}
          {responseSchemas[0] && (
            <div>
              <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">View Eval Response Schema</div>
              <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                {JSON.stringify(responseSchemas[0], null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* ── Right: Hero Eval ── */}
        <div className="space-y-3">
          <EvalCriteriaEditor
            label={`${activeCategory} \u2014 Hero Selection Criteria`}
            settingKey="heroEvalCriteria"
            defaultValue={defaults[activeCategory]?.hero ?? ''}
            settings={settings}
            saveSetting={saveSetting}
            isLoading={isLoading}
            tabKey={`${activeCategory}:hero`}
          />
          {heroEval && (
            <ModulePromptTemplateEditor
              key={`${heroEval.promptKey}-${activeCategory}`}
              templateDef={heroEval}
              category={activeCategory}
            />
          )}
          {responseSchemas[1] && (
            <div>
              <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">Hero Eval Response Schema</div>
              <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                {JSON.stringify(responseSchemas[1], null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Eval Criteria Editor (reusable per-column criteria textarea) ── */

function EvalCriteriaEditor({ label, settingKey, defaultValue, settings, saveSetting, isLoading, tabKey }: {
  readonly label: string;
  readonly settingKey: string;
  readonly defaultValue: string;
  readonly settings: Record<string, string>;
  readonly saveSetting: (key: string, value: string) => void;
  readonly isLoading: boolean;
  readonly tabKey: string;
}) {
  const dbValue = (settings[settingKey] as string) ?? '';
  const displayValue = dbValue || defaultValue;
  const isOverridden = dbValue.length > 0;

  // WHY: setState-during-render so the draft resyncs synchronously before paint
  // when tabKey or displayValue changes — avoids a stale-draft frame that flashes
  // the Save button during tab switches.
  const [draft, setDraft] = useState(displayValue);
  const [syncedKey, setSyncedKey] = useState(tabKey);
  const [syncedDisplay, setSyncedDisplay] = useState(displayValue);
  if (syncedKey !== tabKey || syncedDisplay !== displayValue) {
    setSyncedKey(tabKey);
    setSyncedDisplay(displayValue);
    setDraft(displayValue);
  }

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    saveSetting(settingKey, trimmed === defaultValue.trim() ? '' : trimmed);
  }, [draft, defaultValue, settingKey, saveSetting]);

  const handleReset = useCallback(() => {
    saveSetting(settingKey, '');
    setDraft(defaultValue);
  }, [settingKey, defaultValue, saveSetting]);

  const isDirty = draft.trim() !== displayValue.trim();

  // WHY: Auto-size textarea to full content height — no scrolling inside the editor.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(autoResize, [draft, autoResize]);

  return (
    <div className="rounded border sf-border-soft p-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted">{label}</div>
        <div className="flex items-center gap-2">
          {isOverridden && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded sf-chip-warning">Customized</span>
          )}
          {isLoading && <span className="text-[10px] sf-text-muted">Loading...</span>}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        className="sf-pre-block sf-text-caption font-mono rounded p-3 w-full overflow-hidden whitespace-pre-wrap leading-relaxed resize-none"
        style={{ minHeight: '120px' }}
        spellCheck={false}
      />
      <div className="flex items-center gap-2">
        {isDirty && (
          <button onClick={handleSave} className="sf-primary-button px-3 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer">Save</button>
        )}
        {isOverridden && (
          <button onClick={handleReset} className="sf-btn-ghost sf-text-muted px-3 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer hover:opacity-80">Reset to Default</button>
        )}
      </div>
    </div>
  );
}

/* ── Prompt Templates Section (generic, driven by prompt_templates array) ── */

export function PromptTemplatesSection({ phaseId, promptTemplates, phaseOverrides, onPhaseOverrideChange, responseSchemas, renderExtraForTemplate }: {
  readonly phaseId: LlmPhaseId;
  readonly promptTemplates: readonly PromptTemplateDef[];
  readonly phaseOverrides: LlmPhaseOverrides;
  readonly onPhaseOverrideChange: (overrides: LlmPhaseOverrides) => void;
  readonly responseSchemas: Record<string, unknown>[];
  readonly renderExtraForTemplate?: (tmpl: PromptTemplateDef, activeCategory: string) => ReactNode;
}) {
  // WHY: Module-scope templates need a category. Use 'mouse' as default preview category.
  const hasModuleTemplates = promptTemplates.some(t => t.storageScope === 'module');
  const categories = hasModuleTemplates ? ['mouse', 'keyboard', 'monitor', 'mousepad'] : [];
  const [activeCategory, setActiveCategory] = usePersistedTab<string>(`llmPhase:${phaseId}:templateCategory`, categories[0] ?? '');

  return (
    <div className="space-y-3">
      {/* Category tabs for module-scope templates */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer transition-opacity ${
                activeCategory === cat ? 'sf-primary-button' : 'sf-btn-ghost sf-text-muted hover:opacity-80'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Template editors — every column follows one canonical order:
       *   1. Prompt editor (high-level system prompt textarea + Save/Reset)
       *   2. Sub-level prompts / extras (e.g. per-view discovery prompts)
       *   3. Template variables reference panel(s)
       *   4. User message injection panel
       *   5. Response schema
       *
       * Variables + user-message panels are always rendered externally here
       * so the ordering is identical whether a template has extras or not.
       */}
      <div className={promptTemplates.length > 1 ? 'grid grid-cols-2 gap-4 items-start' : ''}>
        {promptTemplates.map((tmpl, i) => {
          const extra = renderExtraForTemplate?.(tmpl, activeCategory);
          const hasExtra = extra !== null && extra !== undefined && extra !== false;
          return (
            <div key={tmpl.promptKey} className="space-y-3">
              {tmpl.storageScope === 'global' ? (
                <GlobalPromptTemplateEditor
                  phaseId={phaseId}
                  templateDef={tmpl}
                  phaseOverrides={phaseOverrides}
                  onPhaseOverrideChange={onPhaseOverrideChange}
                  hideVariablesPanel
                  hideUserMessagePanel
                />
              ) : (
                <ModulePromptTemplateEditor
                  key={`${tmpl.promptKey}-${activeCategory}`}
                  templateDef={tmpl}
                  category={activeCategory}
                  hideVariablesPanel
                  hideUserMessagePanel
                />
              )}
              {hasExtra && extra}
              {tmpl.variables.length > 0 && (
                <VariableReferencePanels variables={tmpl.variables} />
              )}
              {tmpl.userMessageInfo && tmpl.userMessageInfo.length > 0 && (
                <UserMessageInjectionPanel info={tmpl.userMessageInfo} />
              )}
              {responseSchemas[i] && (
                <div>
                  <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">Response Schema</div>
                  <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                    {JSON.stringify(responseSchemas[i], null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── View Prompt Tabs (Carousel Builder) ────────────────────────── */

function ViewPromptTabs({ phaseSchema }: {
  readonly phaseSchema: {
    system_prompt: string;
    hero_system_prompt?: string;
    response_schema: Record<string, unknown>;
    hero_response_schema?: Record<string, unknown>;
    view_prompts?: Record<string, string>;
  };
}) {
  const viewEntries = Object.entries(phaseSchema.view_prompts ?? {});
  const tabs = [
    ...viewEntries.map(([view]) => view),
    ...(phaseSchema.hero_system_prompt ? ['hero'] : []),
    'schema',
  ];
  const [activeTab, setActiveTab] = usePersistedTab<string>('llmPhase:viewPromptTab', tabs[0] ?? 'schema');

  const activePrompt = activeTab === 'hero'
    ? phaseSchema.hero_system_prompt ?? ''
    : activeTab === 'schema'
      ? null
      : (phaseSchema.view_prompts?.[activeTab] ?? '');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer transition-opacity ${
              activeTab === tab
                ? 'sf-primary-button'
                : 'sf-btn-ghost sf-text-muted hover:opacity-80'
            }`}
          >
            {tab === 'schema' ? 'Schema' : tab === 'hero' ? 'Hero' : tab}
          </button>
        ))}
      </div>

      {activeTab === 'schema' ? (
        <div className="space-y-3">
          <div>
            <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">View Eval Response Schema</div>
            <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
              {JSON.stringify(phaseSchema.response_schema, null, 2)}
            </pre>
          </div>
          {phaseSchema.hero_response_schema && (
            <div>
              <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">Hero Selection Response Schema</div>
              <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                {JSON.stringify(phaseSchema.hero_response_schema, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">
            {activeTab === 'hero' ? 'Hero Selection' : `${activeTab} View`} System Prompt
          </div>
          <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text" style={{ minHeight: '300px' }}>
            {String(activePrompt)}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ── Category View Prompt Tabs (Carousel Builder — editable per-category) ── */

const VIEW_TABS = ['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle', 'hero', 'schema'] as const;
type ViewTab = typeof VIEW_TABS[number];

function settingKeyForView(view: ViewTab): string {
  return view === 'hero' ? 'heroEvalCriteria' : `evalViewCriteria_${view}`;
}

interface CategoryViewPromptTabsPhaseSchema {
  readonly response_schema: Record<string, unknown>;
  readonly hero_response_schema?: Record<string, unknown>;
  readonly eval_criteria_defaults: Record<string, Record<string, string>>;
  readonly eval_criteria_categories: readonly string[];
}

function CategoryViewPromptTabs({ phaseSchema }: { readonly phaseSchema: CategoryViewPromptTabsPhaseSchema }) {
  const categories = phaseSchema.eval_criteria_categories;
  const defaults = phaseSchema.eval_criteria_defaults;

  const [activeCategory, setActiveCategory] = usePersistedTab<string>(
    'llm-config:eval-category',
    categories[0] ?? 'mouse',
    { validValues: categories as unknown as readonly string[] },
  );
  const [activeView, setActiveView] = usePersistedTab<string>(
    'llm-config:eval-view',
    'top',
    { validValues: VIEW_TABS as unknown as readonly string[] },
  );

  const { settings, saveSetting, isLoading } = useModuleSettingsAuthority({
    category: activeCategory,
    moduleId: 'productImageFinder',
  });

  const dbValue = settings[settingKeyForView(activeView as ViewTab)] ?? '';
  const defaultValue = defaults[activeCategory]?.[activeView] ?? '';
  const displayValue = dbValue || defaultValue;
  const isOverridden = dbValue.length > 0;
  const tabKey = `${activeCategory}:${activeView}`;

  // WHY: setState-during-render so the draft resyncs synchronously before paint
  // when tabKey or displayValue changes — avoids a stale-draft frame that flashes
  // the Save button during tab switches.
  const [draft, setDraft] = useState(displayValue);
  const [syncedKey, setSyncedKey] = useState(tabKey);
  const [syncedDisplay, setSyncedDisplay] = useState(displayValue);
  if (syncedKey !== tabKey || syncedDisplay !== displayValue) {
    setSyncedKey(tabKey);
    setSyncedDisplay(displayValue);
    setDraft(displayValue);
  }

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed === defaultValue.trim()) {
      saveSetting(settingKeyForView(activeView as ViewTab), '');
    } else {
      saveSetting(settingKeyForView(activeView as ViewTab), trimmed);
    }
  }, [draft, defaultValue, activeView, saveSetting]);

  const handleReset = useCallback(() => {
    saveSetting(settingKeyForView(activeView as ViewTab), '');
    setDraft(defaultValue);
  }, [activeView, defaultValue, saveSetting]);

  const isDirty = draft.trim() !== displayValue.trim();

  return (
    <div className="space-y-2">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-1 mb-1">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide rounded cursor-pointer transition-opacity ${
              activeCategory === cat
                ? 'sf-primary-button'
                : 'sf-btn-ghost sf-text-muted hover:opacity-80'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* View tabs */}
      <div className="flex flex-wrap gap-1">
        {VIEW_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveView(tab)}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer transition-opacity ${
              activeView === tab
                ? 'sf-primary-button'
                : 'sf-btn-ghost sf-text-muted hover:opacity-80'
            }`}
          >
            {tab === 'schema' ? 'Schema' : tab === 'hero' ? 'Hero' : tab}
          </button>
        ))}
      </div>

      {activeView === 'schema' ? (
        <div className="space-y-3">
          <div>
            <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">View Eval Response Schema</div>
            <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
              {JSON.stringify(phaseSchema.response_schema, null, 2)}
            </pre>
          </div>
          {phaseSchema.hero_response_schema && (
            <div>
              <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted mb-1">Hero Selection Response Schema</div>
              <pre className="sf-pre-block sf-text-caption font-mono rounded p-3 overflow-auto whitespace-pre-wrap leading-relaxed select-text cursor-text">
                {JSON.stringify(phaseSchema.hero_response_schema, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted">
              {activeCategory} &mdash; {activeView === 'hero' ? 'Hero Selection' : `${activeView} View`} Eval Criteria
            </div>
            <div className="flex items-center gap-2">
              {isOverridden && (
                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded sf-chip-warning">Customized</span>
              )}
              {isLoading && (
                <span className="text-[10px] sf-text-muted">Loading...</span>
              )}
            </div>
          </div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={handleSave}
            className="sf-pre-block sf-text-caption font-mono rounded p-3 w-full overflow-auto whitespace-pre-wrap leading-relaxed resize-y"
            style={{ minHeight: '300px' }}
            spellCheck={false}
          />
          <div className="flex items-center gap-2">
            {isDirty && (
              <button
                onClick={handleSave}
                className="sf-primary-button px-3 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer"
              >
                Save
              </button>
            )}
            {isOverridden && (
              <button
                onClick={handleReset}
                className="sf-btn-ghost sf-text-muted px-3 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer hover:opacity-80"
              >
                Reset to Default
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Discovery View Prompt Tabs (Image Finder — per-view per-role) ── */

const DISCOVERY_VIEW_TABS = ['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle'] as const;
type DiscoveryViewTab = typeof DISCOVERY_VIEW_TABS[number];
type DiscoveryRole = 'loop' | 'priority' | 'additional';

const ROLE_LABELS: Record<DiscoveryRole, string> = {
  loop: 'Loop Run (focus view)',
  priority: 'Priority View (single run)',
  additional: 'Additional View (secondary hint)',
};

const ROLE_HELPERS: Record<DiscoveryRole, string> = {
  loop: 'Injected when this view is the sole focus of a carousel loop call.',
  priority: 'Injected when this view appears in the PRIORITY section of a single-run prompt.',
  additional: 'Injected when this view appears in the ADDITIONAL section as a secondary hint.',
};

function discoveryPromptSettingKey(role: DiscoveryRole, view: DiscoveryViewTab): string {
  return `${role}ViewPrompt_${view}`;
}

interface DiscoveryViewPromptTabsPhaseSchema {
  readonly view_prompt_defaults: Record<string, Record<string, Record<DiscoveryRole, string>>>;
  readonly view_prompt_categories: readonly string[];
  readonly view_prompt_roles: readonly DiscoveryRole[];
}

function DiscoveryViewPromptTabs({ phaseSchema, activeCategory }: {
  readonly phaseSchema: DiscoveryViewPromptTabsPhaseSchema;
  readonly activeCategory: string;
}) {
  const defaults = phaseSchema.view_prompt_defaults;
  const roles = (phaseSchema.view_prompt_roles ?? ['loop', 'priority', 'additional']) as readonly DiscoveryRole[];

  const [activeView, setActiveView] = usePersistedTab<DiscoveryViewTab>(
    'llm-config:discovery-view-view',
    'top',
    { validValues: DISCOVERY_VIEW_TABS as unknown as readonly DiscoveryViewTab[] },
  );

  return (
    <div className="space-y-2">
      <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted pt-2">
        Per-View Discovery Prompts
      </div>

      {/* View tabs (category is inherited from the parent category selector) */}
      <div className="flex flex-wrap gap-1">
        {DISCOVERY_VIEW_TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveView(tab)}
            className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer transition-opacity ${
              activeView === tab
                ? 'sf-primary-button'
                : 'sf-btn-ghost sf-text-muted hover:opacity-80'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Three role editors stacked */}
      <div className="space-y-3 mt-2">
        {roles.map((role) => (
          <DiscoveryRoleEditor
            key={role}
            role={role}
            category={activeCategory}
            view={activeView}
            defaultValue={defaults[activeCategory]?.[activeView]?.[role] ?? ''}
          />
        ))}
      </div>
    </div>
  );
}

function DiscoveryRoleEditor({ role, category, view, defaultValue }: {
  readonly role: DiscoveryRole;
  readonly category: string;
  readonly view: DiscoveryViewTab;
  readonly defaultValue: string;
}) {
  const { settings, saveSetting, isLoading } = useModuleSettingsAuthority({
    category,
    moduleId: 'productImageFinder',
  });
  const settingKey = discoveryPromptSettingKey(role, view);
  const dbValue = (settings[settingKey] as string) ?? '';
  const displayValue = dbValue || defaultValue;
  const isOverridden = dbValue.length > 0;
  const tabKey = `${category}:${view}:${role}`;

  // WHY: setState-during-render so the draft resyncs synchronously before paint
  // when tabKey or displayValue changes — avoids a stale-draft frame that flashes
  // the Save button during tab switches.
  const [draft, setDraft] = useState(displayValue);
  const [syncedKey, setSyncedKey] = useState(tabKey);
  const [syncedDisplay, setSyncedDisplay] = useState(displayValue);
  if (syncedKey !== tabKey || syncedDisplay !== displayValue) {
    setSyncedKey(tabKey);
    setSyncedDisplay(displayValue);
    setDraft(displayValue);
  }

  const handleSave = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed === defaultValue.trim()) {
      saveSetting(settingKey, '');
    } else {
      saveSetting(settingKey, trimmed);
    }
  }, [draft, defaultValue, settingKey, saveSetting]);

  const handleReset = useCallback(() => {
    saveSetting(settingKey, '');
    setDraft(defaultValue);
  }, [settingKey, defaultValue, saveSetting]);

  const isDirty = draft.trim() !== displayValue.trim();

  return (
    <div className="rounded border sf-border-soft p-2">
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="sf-text-nano font-bold tracking-wider uppercase sf-text-muted">
            {ROLE_LABELS[role]}
          </div>
          <div className="text-[10px] sf-text-muted mt-0.5">{ROLE_HELPERS[role]}</div>
        </div>
        <div className="flex items-center gap-2">
          {isOverridden && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded sf-chip-warning">Customized</span>
          )}
          {isLoading && <span className="text-[10px] sf-text-muted">Loading…</span>}
        </div>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        className="sf-pre-block sf-text-caption font-mono rounded p-2 w-full overflow-auto whitespace-pre-wrap leading-relaxed resize-y"
        style={{ minHeight: '90px' }}
        spellCheck={false}
      />
      <div className="flex items-center gap-2 mt-1">
        {isDirty && (
          <button
            onClick={handleSave}
            className="sf-primary-button px-3 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer"
          >
            Save
          </button>
        )}
        {isOverridden && (
          <button
            onClick={handleReset}
            className="sf-btn-ghost sf-text-muted px-3 py-1 text-[10px] font-bold uppercase tracking-wide rounded cursor-pointer hover:opacity-80"
          >
            Reset to Default
          </button>
        )}
      </div>
    </div>
  );
}
