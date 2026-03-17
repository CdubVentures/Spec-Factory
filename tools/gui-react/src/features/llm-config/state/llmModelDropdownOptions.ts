import type { LlmProviderEntry, LlmModelRole } from '../types/llmProviderRegistryTypes';

export interface DropdownModelOption {
  value: string;
  label: string;
  providerId: string | null;
  role?: LlmModelRole;
  costInputPer1M?: number;
  maxContextTokens?: number | null;
}

const ROLE_SORT_PRIORITY: Record<string, number> = {
  reasoning: 0,
  primary: 1,
  fast: 2,
  embedding: 3,
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

function buildEnrichedLabel(
  providerName: string,
  modelId: string,
  costInputPer1M: number,
  maxContextTokens: number | null,
): string {
  const base = providerName ? `${providerName} / ${modelId}` : modelId;
  const parts: string[] = [];
  if (maxContextTokens != null && maxContextTokens > 0) {
    parts.push(`${formatContextTokens(maxContextTokens)} ctx`);
  }
  if (costInputPer1M > 0) {
    const formatted = Number.isInteger(costInputPer1M) ? String(costInputPer1M) : costInputPer1M.toFixed(2);
    parts.push(`$${formatted} in`);
  }
  const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
  return `${base}${suffix}`;
}

export function buildModelDropdownOptions(
  flatModelOptions: readonly string[],
  registry: LlmProviderEntry[],
  roleFilter?: LlmModelRole | LlmModelRole[],
  apiKeyFilter?: (provider: LlmProviderEntry) => boolean,
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

  // 1. Collect enabled registry models matching role filter
  for (const provider of registry) {
    if (!provider.enabled) continue;
    if (apiKeyFilter && !apiKeyFilter(provider)) continue;
    for (const model of provider.models) {
      if (roleFilter) {
        const roles = Array.isArray(roleFilter) ? roleFilter : [roleFilter];
        if (!roles.includes(model.role)) continue;
      }
      result.push({
        value: model.modelId,
        label: buildEnrichedLabel(provider.name, model.modelId, model.costInputPer1M, model.maxContextTokens),
        providerId: provider.id,
        role: model.role,
        costInputPer1M: model.costInputPer1M,
        maxContextTokens: model.maxContextTokens,
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

  // 3. Sort using 3-tier comparator (stable sort preserves insertion order for equal keys)
  result.sort(compareModelsByRoleTokensCost);

  return result;
}

export function ensureValueInOptions(
  options: readonly DropdownModelOption[],
  value: string,
): DropdownModelOption | null {
  if (!value) return null;
  if (options.some((o) => o.value === value)) return null;
  return { value, label: `${value} (not available)`, providerId: null };
}
