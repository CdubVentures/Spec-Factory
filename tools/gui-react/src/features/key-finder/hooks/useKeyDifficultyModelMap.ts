/**
 * useKeyDifficultyModelMap — reads the Key Finder tier settings JSON from the
 * runtime settings store and projects it into a per-tier resolved model map.
 *
 * Source of truth: runtimeSettings.keyFinderTierSettingsJson (stringified
 * TierSettings). Each tier inherits from `fallback` when its own model field
 * is empty.
 */

import { useMemo } from 'react';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';

export type DifficultyTier = 'easy' | 'medium' | 'hard' | 'very_hard';

export interface TierResolvedModel {
  readonly model: string;
  readonly accessMode?: 'api' | 'lab';
  readonly thinking: boolean;
  readonly webSearch: boolean;
  readonly effortLevel: string;
}

export type KeyDifficultyModelMap = Readonly<Record<DifficultyTier, TierResolvedModel>>;

interface TierBundleLike {
  readonly model?: string;
  readonly useReasoning?: boolean;
  readonly reasoningModel?: string;
  readonly thinking?: boolean;
  readonly thinkingEffort?: string;
  readonly webSearch?: boolean;
}

interface TierSettingsLike {
  readonly easy?: TierBundleLike;
  readonly medium?: TierBundleLike;
  readonly hard?: TierBundleLike;
  readonly very_hard?: TierBundleLike;
  readonly fallback?: TierBundleLike;
}

interface ProviderModelLike {
  readonly modelId?: string;
  readonly accessMode?: string;
}

interface ProviderLike {
  readonly id?: string;
  readonly accessMode?: string;
  readonly models?: readonly ProviderModelLike[];
}

function safeParse(raw: string): TierSettingsLike | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as TierSettingsLike;
    return null;
  } catch {
    return null;
  }
}

function safeParseRegistry(raw: unknown): readonly ProviderLike[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as ProviderLike[] : [];
  } catch {
    return [];
  }
}

function parseModelKey(modelKey: string): { providerId: string; modelId: string } {
  const idx = modelKey.indexOf(':');
  if (idx > 0) return { providerId: modelKey.slice(0, idx), modelId: modelKey.slice(idx + 1) };
  return { providerId: '', modelId: modelKey };
}

function normalizeAccessMode(value: unknown): 'api' | 'lab' | undefined {
  return value === 'lab' ? 'lab' : value === 'api' ? 'api' : undefined;
}

function resolveAccessMode(registry: readonly ProviderLike[], modelKey: string): 'api' | 'lab' | undefined {
  if (!modelKey || modelKey === 'not configured') return undefined;
  const { providerId, modelId } = parseModelKey(modelKey);
  const provider = providerId
    ? registry.find((entry) => entry.id === providerId && entry.models?.some((model) => model.modelId === modelId))
    : registry.find((entry) => entry.models?.some((model) => model.modelId === modelId));
  if (!provider) return undefined;
  const model = provider.models?.find((entry) => entry.modelId === modelId);
  return normalizeAccessMode(model?.accessMode) ?? normalizeAccessMode(provider.accessMode) ?? 'api';
}

function isTierConfigured(tier: TierBundleLike | undefined): boolean {
  if (!tier) return false;
  return Boolean(tier.model || (tier.useReasoning && tier.reasoningModel));
}

function resolveTier(
  tier: TierBundleLike | undefined,
  fallback: TierBundleLike,
  globalPlanModel: string,
  registry: readonly ProviderLike[],
): TierResolvedModel {
  const t = tier ?? {};
  const effective = isTierConfigured(t) ? t : fallback;
  const useReasoning = effective.useReasoning ?? false;
  const model = (
    useReasoning && effective.reasoningModel
      ? effective.reasoningModel
      : effective.model
  ) || globalPlanModel || 'not configured';
  return {
    model,
    accessMode: resolveAccessMode(registry, model),
    thinking: effective.thinking ?? false,
    webSearch: effective.webSearch ?? false,
    effortLevel: effective.thinkingEffort ?? '',
  };
}

const TIERS: readonly DifficultyTier[] = ['easy', 'medium', 'hard', 'very_hard'];

export function resolveKeyDifficultyModelMapFromSettings(
  storeValues: Record<string, unknown> | null | undefined,
): KeyDifficultyModelMap {
  const raw = storeValues?.keyFinderTierSettingsJson;
  const parsed = typeof raw === 'string' && raw ? safeParse(raw) : null;
  const fallback: TierBundleLike = parsed?.fallback ?? {};
  const globalPlanModel = String(storeValues?.llmModelPlan ?? '').trim();
  const registry = safeParseRegistry(storeValues?.llmProviderRegistryJson);
  const map = {} as Record<DifficultyTier, TierResolvedModel>;
  for (const tier of TIERS) {
    map[tier] = resolveTier(parsed?.[tier], fallback, globalPlanModel, registry);
  }
  return map as KeyDifficultyModelMap;
}

export function useKeyDifficultyModelMap(): KeyDifficultyModelMap {
  const storeValues = useRuntimeSettingsValueStore((s) => s.values);
  return useMemo(() => {
    return resolveKeyDifficultyModelMapFromSettings(storeValues as Record<string, unknown> | null | undefined);
  }, [storeValues]);
}
