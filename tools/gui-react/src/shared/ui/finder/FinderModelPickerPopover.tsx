import { useCallback, useMemo, type ReactNode } from 'react';
import { Popover } from '../overlay/Popover.tsx';
import { FinderRunPopoverShell } from '../overlay/FinderRunPopoverShell.tsx';
import {
  LlmCapabilityPickerCore,
  type LlmCapabilityBundle,
  type LlmCapabilityEffort,
} from './LlmCapabilityPickerCore.tsx';
import { useLlmPolicyAuthority } from '../../../features/llm-config/state/useLlmPolicyAuthority.ts';
import { DEFAULT_LLM_POLICY } from '../../../features/llm-config/state/llmPolicyDefaults.ts';
import { RUNTIME_SETTING_DEFAULTS } from '../../../stores/settingsManifest.ts';
import { mergeDefaultsIntoRegistry } from '../../../features/llm-config/state/llmDefaultProviderRegistry.ts';
import { parseProviderRegistry } from '../../../features/llm-config/state/llmProviderRegistryBridge.ts';
import {
  PROVIDER_API_KEY_MAP,
  providerHasApiKey,
  type RuntimeApiKeySlice,
} from '../../../features/llm-config/state/llmProviderApiKeyGate.ts';
import type {
  LlmOverridePhaseId,
  LlmPhaseOverride,
  LlmPhaseOverrides,
} from '../../../features/llm-config/types/llmPhaseOverrideTypes.generated.ts';
import type { LlmProviderEntry } from '../../../features/llm-config/types/llmProviderRegistryTypes.ts';
import './FinderModelPickerPopover.css';

export type KfTierModelPickerSlot = 'easy' | 'medium' | 'hard' | 'very_hard' | 'fallback';

interface SharedBindingResult {
  readonly value: LlmCapabilityBundle;
  readonly onChange: (next: LlmCapabilityBundle) => void;
  readonly registry: LlmProviderEntry[];
  readonly globalDefaultPlanModel: string;
  readonly globalDefaultReasoningModel: string;
  readonly inheritedModelId: string;
  readonly allowModelNone: boolean;
  readonly allowWebSearch: boolean;
  readonly apiKeyFilter: (provider: LlmProviderEntry) => boolean;
}

interface PickerTierBundle {
  model?: string;
  useReasoning?: boolean;
  reasoningModel?: string;
  thinking?: boolean;
  thinkingEffort?: string;
  webSearch?: boolean;
}

interface PickerTierSettings {
  easy?: PickerTierBundle;
  medium?: PickerTierBundle;
  hard?: PickerTierBundle;
  very_hard?: PickerTierBundle;
  fallback?: PickerTierBundle;
}

export const EMPTY_LLM_CAPABILITY_BUNDLE: LlmCapabilityBundle = {
  model: '',
  useReasoning: false,
  reasoningModel: '',
  thinking: false,
  thinkingEffort: '',
  webSearch: false,
};

const DEFAULT_REGISTRY = parseProviderRegistry(RUNTIME_SETTING_DEFAULTS.llmProviderRegistryJson);

export function runtimeApiKeysFromPolicy(policy: ReturnType<typeof useLlmPolicyAuthority>['policy']): RuntimeApiKeySlice {
  return {
    geminiApiKey: policy.apiKeys.gemini ?? '',
    deepseekApiKey: policy.apiKeys.deepseek ?? '',
    anthropicApiKey: policy.apiKeys.anthropic ?? '',
    openaiApiKey: policy.apiKeys.openai ?? '',
  };
}

export function buildFinderModelPickerRegistry(
  policy: ReturnType<typeof useLlmPolicyAuthority>['policy'],
  runtimeApiKeys: RuntimeApiKeySlice,
): LlmProviderEntry[] {
  const rawRegistry: LlmProviderEntry[] = Array.isArray(policy.providerRegistry)
    ? (policy.providerRegistry as LlmProviderEntry[])
    : [];
  const merged = mergeDefaultsIntoRegistry(rawRegistry, DEFAULT_REGISTRY);
  return merged.map((provider) => {
    const runtimeKeyField = PROVIDER_API_KEY_MAP[provider.id];
    const runtimeKey = runtimeKeyField ? runtimeApiKeys[runtimeKeyField] : '';
    const apiKey = provider.apiKey || runtimeKey || '';
    return apiKey === provider.apiKey ? provider : { ...provider, apiKey };
  });
}

export function createFinderModelPickerApiKeyFilter(runtimeApiKeys: RuntimeApiKeySlice): (provider: LlmProviderEntry) => boolean {
  return (provider: LlmProviderEntry) => providerHasApiKey(provider, runtimeApiKeys);
}

export function bundleFromPhaseSlot(slot: Partial<LlmPhaseOverride> | undefined): LlmCapabilityBundle {
  return {
    model: slot?.baseModel ?? '',
    useReasoning: slot?.useReasoning ?? false,
    reasoningModel: slot?.reasoningModel ?? '',
    thinking: slot?.thinking ?? false,
    thinkingEffort: (slot?.thinkingEffort ?? '') as LlmCapabilityEffort,
    webSearch: slot?.webSearch ?? false,
  };
}

export function bundleFromTierSlot(slot: PickerTierBundle | undefined): LlmCapabilityBundle {
  return {
    model: slot?.model ?? '',
    useReasoning: slot?.useReasoning ?? false,
    reasoningModel: slot?.reasoningModel ?? '',
    thinking: slot?.thinking ?? false,
    thinkingEffort: (slot?.thinkingEffort ?? '') as LlmCapabilityEffort,
    webSearch: slot?.webSearch ?? false,
  };
}

export function useFinderPhaseModelPickerBinding(phaseId: LlmOverridePhaseId): SharedBindingResult {
  const llmAuthority = useLlmPolicyAuthority({ defaultPolicy: DEFAULT_LLM_POLICY });
  const overrides = (llmAuthority.policy.phaseOverrides ?? {}) as LlmPhaseOverrides;
  const slot = overrides[phaseId];
  const value = useMemo(() => bundleFromPhaseSlot(slot), [slot]);
  const runtimeApiKeys = useMemo(
    () => runtimeApiKeysFromPolicy(llmAuthority.policy),
    [llmAuthority.policy],
  );
  const registry = useMemo(
    () => buildFinderModelPickerRegistry(llmAuthority.policy, runtimeApiKeys),
    [llmAuthority.policy, runtimeApiKeys],
  );
  const apiKeyFilter = useMemo(
    () => createFinderModelPickerApiKeyFilter(runtimeApiKeys),
    [runtimeApiKeys],
  );

  const onChange = useCallback((next: LlmCapabilityBundle) => {
    const current = (overrides[phaseId] ?? {}) as Partial<LlmPhaseOverride>;
    const patch: Partial<LlmPhaseOverride> = {};
    if (next.model !== (current.baseModel ?? '')) patch.baseModel = next.model;
    if (next.useReasoning !== (current.useReasoning ?? false)) patch.useReasoning = next.useReasoning;
    if (next.reasoningModel !== (current.reasoningModel ?? '')) patch.reasoningModel = next.reasoningModel;
    if (next.thinking !== (current.thinking ?? false)) patch.thinking = next.thinking;
    if (next.thinkingEffort !== (current.thinkingEffort ?? '')) patch.thinkingEffort = next.thinkingEffort;
    if (next.webSearch !== (current.webSearch ?? false)) patch.webSearch = next.webSearch;
    if (Object.keys(patch).length === 0) return;
    llmAuthority.updatePolicy({
      phaseOverrides: {
        ...overrides,
        [phaseId]: { ...current, ...patch },
      },
    });
  }, [llmAuthority, overrides, phaseId]);

  return {
    value,
    onChange,
    registry,
    globalDefaultPlanModel: llmAuthority.policy.models.plan,
    globalDefaultReasoningModel: llmAuthority.policy.models.reasoning,
    inheritedModelId: llmAuthority.policy.models.plan,
    allowModelNone: true,
    allowWebSearch: phaseId !== 'writer',
    apiKeyFilter,
  };
}

export function useKeyFinderTierModelPickerBinding(tier: KfTierModelPickerSlot): SharedBindingResult {
  const llmAuthority = useLlmPolicyAuthority({ defaultPolicy: DEFAULT_LLM_POLICY });
  const tiers = ((llmAuthority.policy as unknown as { keyFinderTiers?: PickerTierSettings }).keyFinderTiers ?? {}) as PickerTierSettings;
  const slot = tiers[tier];
  const fallbackSlot = tiers.fallback;
  const value = useMemo(() => bundleFromTierSlot(slot), [slot]);
  const runtimeApiKeys = useMemo(
    () => runtimeApiKeysFromPolicy(llmAuthority.policy),
    [llmAuthority.policy],
  );
  const registry = useMemo(
    () => buildFinderModelPickerRegistry(llmAuthority.policy, runtimeApiKeys),
    [llmAuthority.policy, runtimeApiKeys],
  );
  const apiKeyFilter = useMemo(
    () => createFinderModelPickerApiKeyFilter(runtimeApiKeys),
    [runtimeApiKeys],
  );

  const onChange = useCallback((next: LlmCapabilityBundle) => {
    const current = (tiers[tier] ?? {}) as PickerTierBundle;
    const updated: PickerTierBundle = { ...current, ...next };
    const nextTiers: PickerTierSettings = { ...tiers, [tier]: updated };
    llmAuthority.updatePolicy(
      { keyFinderTiers: nextTiers } as unknown as Partial<typeof llmAuthority.policy>,
    );
  }, [llmAuthority, tiers, tier]);

  const isFallback = tier === 'fallback';
  return {
    value,
    onChange,
    registry,
    globalDefaultPlanModel: llmAuthority.policy.models.plan,
    globalDefaultReasoningModel: llmAuthority.policy.models.reasoning,
    inheritedModelId: !isFallback ? (fallbackSlot?.model ?? '') : '',
    allowModelNone: !isFallback,
    allowWebSearch: true,
    apiKeyFilter,
  };
}

interface FinderPhaseBindingProps {
  readonly binding: 'phase';
  readonly phaseId: LlmOverridePhaseId;
}

interface FinderKfTierBindingProps {
  readonly binding: 'kfTier';
  readonly tier: KfTierModelPickerSlot;
}

type FinderModelPickerBinding = FinderPhaseBindingProps | FinderKfTierBindingProps;

export type FinderModelPickerPopoverProps = {
  readonly trigger: ReactNode;
  readonly title: string;
  readonly triggerLabel?: string;
} & FinderModelPickerBinding;

function PhasePickerBody({ phaseId, title }: { readonly phaseId: LlmOverridePhaseId; readonly title: string }) {
  const binding = useFinderPhaseModelPickerBinding(phaseId);
  return (
    <FinderRunPopoverShell title={title}>
      <LlmCapabilityPickerCore
        value={binding.value}
        onChange={binding.onChange}
        registry={binding.registry}
        llmModelOptions={[]}
        globalDefaultPlanModel={binding.globalDefaultPlanModel}
        globalDefaultReasoningModel={binding.globalDefaultReasoningModel}
        inheritedModelId={binding.inheritedModelId}
        allowModelNone={binding.allowModelNone}
        allowWebSearch={binding.allowWebSearch}
        apiKeyFilter={binding.apiKeyFilter}
        inputCls="sf-input w-full py-2 sf-text-label leading-5"
      />
    </FinderRunPopoverShell>
  );
}

function KfTierPickerBody({ tier, title }: { readonly tier: KfTierModelPickerSlot; readonly title: string }) {
  const binding = useKeyFinderTierModelPickerBinding(tier);
  return (
    <FinderRunPopoverShell title={title}>
      <LlmCapabilityPickerCore
        value={binding.value}
        onChange={binding.onChange}
        registry={binding.registry}
        llmModelOptions={[]}
        globalDefaultPlanModel={binding.globalDefaultPlanModel}
        globalDefaultReasoningModel={binding.globalDefaultReasoningModel}
        inheritedModelId={binding.inheritedModelId}
        allowModelNone={binding.allowModelNone}
        allowWebSearch={binding.allowWebSearch}
        apiKeyFilter={binding.apiKeyFilter}
        inputCls="sf-input w-full py-2 sf-text-label leading-5"
      />
    </FinderRunPopoverShell>
  );
}

export function FinderModelPickerPopover(props: FinderModelPickerPopoverProps) {
  const body = props.binding === 'phase'
    ? <PhasePickerBody phaseId={props.phaseId} title={props.title} />
    : <KfTierPickerBody tier={props.tier} title={props.title} />;

  return (
    <Popover
      trigger={props.trigger}
      triggerLabel={props.triggerLabel ?? `${props.title} model picker`}
      contentClassName="sf-finder-model-picker-panel"
    >
      {body}
    </Popover>
  );
}

