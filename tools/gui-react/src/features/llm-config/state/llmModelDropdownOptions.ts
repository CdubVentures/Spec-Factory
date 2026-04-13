import type { LlmProviderEntry, LlmModelRole, LlmAccessMode } from '../types/llmProviderRegistryTypes.ts';

export interface DropdownModelOption {
  value: string;
  label: string;
  providerId: string | null;
  providerName?: string;
  role?: LlmModelRole;
  costInputPer1M?: number;
  maxContextTokens?: number | null;
  accessMode?: LlmAccessMode;
  thinking?: boolean;
  webSearch?: boolean;
}

const ROLE_SORT_PRIORITY: Record<string, number> = {
  reasoning: 0,
  primary: 1,
  embedding: 2,
};
const UNKNOWN_ROLE_PRIORITY = 4;

export function compareModelsByRoleTokensCost(
  a: { role?: string; maxContextTokens?: number | null; costInputPer1M?: number },
  b: { role?: string; maxContextTokens?: number | null; costInputPer1M?: number },
): number {
  // 1. Role priority
  const aPri = ROLE_SORT_PRIORITY[a.role ?? ''] ?? UNKNOWN_ROLE_PRIORITY;
  const bPri = ROLE_SORT_PRIORITY[b.role ?? ''] ?? UNKNOWN_ROLE_PRIORITY;
  if (aPri !== bPri) return aPri - bPri;

  // 2. maxContextTokens descending (nulls last)
  const aCtx = a.maxContextTokens;
  const bCtx = b.maxContextTokens;
  if (aCtx != null && bCtx != null) {
    if (aCtx !== bCtx) return bCtx - aCtx;
  } else if (aCtx != null) {
    return -1;
  } else if (bCtx != null) {
    return 1;
  }

  // 3. costInputPer1M ascending (unknowns/undefined last)
  const aCost = a.costInputPer1M;
  const bCost = b.costInputPer1M;
  if (aCost != null && bCost != null) {
    if (aCost !== bCost) return aCost - bCost;
  } else if (aCost != null) {
    return -1;
  } else if (bCost != null) {
    return 1;
  }

  return 0;
}

export function formatContextTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    const m = Math.round(tokens / 1_000_000);
    return `${m}M`;
  }
  if (tokens >= 1_000) {
    const k = Math.round(tokens / 1_000);
    return `${k}K`;
  }
  return String(tokens);
}

function buildLabel(modelId: string): string {
  return modelId;
}

export function buildModelDropdownOptions(
  flatModelOptions: readonly string[],
  registry: LlmProviderEntry[],
  roleFilter?: LlmModelRole | LlmModelRole[],
  apiKeyFilter?: (provider: LlmProviderEntry) => boolean,
  ensureValues?: readonly string[],
): DropdownModelOption[] {
  const result: DropdownModelOption[] = [];
  const registryModelIds = new Set<string>();

  // WHY: Track ALL models from ALL registry providers (regardless of enabled/filter status)
  // so filtered-out registry models cannot leak back as flat options.
  const registryKnownModelIds = new Set<string>();
  for (const provider of registry) {
    for (const model of provider.models) {
      registryKnownModelIds.add(model.modelId);
    }
  }

  // WHY: Bare model IDs that must appear in the result (e.g. the current stored value).
  // If a model is available in the registry but excluded by role filter, it should NOT
  // show as "(not available)" — the role filter is a convenience, not an availability gate.
  const ensureBareIds = new Set<string>();
  if (ensureValues) {
    for (const v of ensureValues) {
      if (!v) continue;
      const colonIdx = v.indexOf(':');
      ensureBareIds.add(colonIdx > 0 ? v.slice(colonIdx + 1) : v);
    }
  }

  // WHY: Build provider rank map from registry order for grouped sorting.
  const providerRank = new Map<string, number>();
  const providerNameMap = new Map<string, string>();
  for (let i = 0; i < registry.length; i++) {
    providerRank.set(registry[i].id, i);
    providerNameMap.set(registry[i].id, registry[i].name || registry[i].id);
  }

  // 1. Collect enabled registry models matching role filter
  for (const provider of registry) {
    if (apiKeyFilter && !apiKeyFilter(provider)) continue;
    for (const model of provider.models) {
      if (roleFilter) {
        const roles = Array.isArray(roleFilter) ? roleFilter : [roleFilter];
        const pinned = ensureBareIds.has(model.modelId);
        if (!roles.includes(model.role) && !pinned) continue;
      }
      const effectiveAccessMode = model.accessMode ?? provider.accessMode;
      result.push({
        value: `${provider.id}:${model.modelId}`,
        label: buildLabel(model.modelId),
        providerId: provider.id,
        providerName: providerNameMap.get(provider.id),
        role: model.role,
        costInputPer1M: model.costInputPer1M,
        maxContextTokens: model.maxContextTokens,
        ...(effectiveAccessMode ? { accessMode: effectiveAccessMode } : {}),
        ...(model.thinking ? { thinking: true } : {}),
        ...(model.webSearch ? { webSearch: true } : {}),
      });
      registryModelIds.add(model.modelId);
    }
  }

  // 2. Append flat options not already covered by registry (registry version wins).
  //    When a role filter is active, skip unregistered flat options — they have no
  //    role metadata, so we cannot verify they belong in this dropdown.
  if (!roleFilter) {
    for (const modelId of flatModelOptions) {
      if (registryKnownModelIds.has(modelId)) continue;
      result.push({
        value: modelId,
        label: modelId,
        providerId: null,
      });
    }
  }

  // 3. Sort: group by provider (registry order), then cost ascending within group (worst→best)
  result.sort((a, b) => {
    const aRank = providerRank.get(a.providerId ?? '') ?? 999;
    const bRank = providerRank.get(b.providerId ?? '') ?? 999;
    if (aRank !== bRank) return aRank - bRank;
    // Within same provider: cost ascending (cheapest/worst first)
    const aCost = a.costInputPer1M ?? 999;
    const bCost = b.costInputPer1M ?? 999;
    return aCost - bCost;
  });

  return result;
}

/**
 * Finds an option matching `value` — either exact match or bare-model-ID match.
 * WHY: Stored values may be bare model IDs ("gemini-2.5-flash") while dropdown
 * options use composite keys ("default-gemini:gemini-2.5-flash").
 */
export function resolveOptionByValue(
  options: readonly DropdownModelOption[],
  value: string,
): DropdownModelOption | undefined {
  if (!value) return undefined;
  return options.find((o) => o.value === value)
    ?? options.find((o) => o.value.endsWith(`:${value}`));
}

export function ensureValueInOptions(
  options: readonly DropdownModelOption[],
  value: string,
): DropdownModelOption | null {
  if (!value) return null;
  if (resolveOptionByValue(options, value)) return null;
  // WHY: Show bare modelId in the fallback label, not the composite key
  const colonIdx = value.indexOf(':');
  const displayId = colonIdx > 0 ? value.slice(colonIdx + 1) : value;
  return { value, label: `${displayId} (not available)`, providerId: null };
}
