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

function safeParse(raw: string): TierSettingsLike | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as TierSettingsLike;
    return null;
  } catch {
    return null;
  }
}

function resolveTier(tier: TierBundleLike | undefined, fallback: TierBundleLike): TierResolvedModel {
  const t = tier ?? {};
  const useReasoning = t.useReasoning ?? false;
  const ownModel = useReasoning ? (t.reasoningModel ?? '') : (t.model ?? '');
  const fbModel = useReasoning ? (fallback.reasoningModel ?? '') : (fallback.model ?? '');
  const model = ownModel || fbModel || 'not configured';
  return {
    model,
    thinking: t.thinking ?? fallback.thinking ?? false,
    webSearch: t.webSearch ?? fallback.webSearch ?? false,
    effortLevel: t.thinkingEffort ?? fallback.thinkingEffort ?? '',
  };
}

const TIERS: readonly DifficultyTier[] = ['easy', 'medium', 'hard', 'very_hard'];

export function useKeyDifficultyModelMap(): KeyDifficultyModelMap {
  const storeValues = useRuntimeSettingsValueStore((s) => s.values);
  return useMemo(() => {
    const raw = (storeValues as Record<string, unknown> | null | undefined)?.keyFinderTierSettingsJson;
    const parsed = typeof raw === 'string' && raw ? safeParse(raw) : null;
    const fallback: TierBundleLike = parsed?.fallback ?? {};
    const map = {} as Record<DifficultyTier, TierResolvedModel>;
    for (const tier of TIERS) {
      map[tier] = resolveTier(parsed?.[tier], fallback);
    }
    return map as KeyDifficultyModelMap;
  }, [storeValues]);
}
