import type { ScopeLevel } from './discoveryHistoryHelpers.ts';

export type DiscoveryHistoryScrubKind = 'url' | 'query' | 'all';
export type DiscoveryHistoryScrubScope = 'product' | 'variant' | 'variant_mode' | 'field_key';

export interface DiscoveryHistoryScrubRequest {
  readonly scope: DiscoveryHistoryScrubScope;
  readonly kind: DiscoveryHistoryScrubKind;
  readonly variantId?: string;
  readonly variantKey?: string;
  readonly mode?: string;
  readonly fieldKey?: string;
}

export interface BuildDiscoveryHistoryScrubRequestInput {
  readonly scopeLevel: ScopeLevel;
  readonly kind: DiscoveryHistoryScrubKind;
  readonly variantId?: string;
  readonly variantKey?: string;
  readonly mode?: string;
  readonly fieldKey?: string;
}

export function buildDiscoveryHistoryScrubRequest(
  input: BuildDiscoveryHistoryScrubRequestInput,
): DiscoveryHistoryScrubRequest {
  const base = { kind: input.kind };

  if (input.scopeLevel === 'field_key' && input.fieldKey) {
    return { ...base, scope: 'field_key', fieldKey: input.fieldKey };
  }

  if (input.variantId || input.variantKey) {
    const variantRef = {
      ...(input.variantId ? { variantId: input.variantId } : {}),
      ...(input.variantKey ? { variantKey: input.variantKey } : {}),
    };
    if (input.scopeLevel === 'variant+mode' && input.mode) {
      return { ...base, scope: 'variant_mode', ...variantRef, mode: input.mode };
    }
    return { ...base, scope: 'variant', ...variantRef };
  }

  return { ...base, scope: 'product' };
}
