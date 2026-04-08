// WHY: Type declaration for the JS ESM phase registry, consumed by GUI TypeScript.

export interface PhaseEntry {
  id: string;
  title: string;
  order: number;
  description: string;
  behaviorNote: string;
  isApplicable: (rule: Record<string, unknown> | null, ctx?: { knownValuesCount?: number } | null) => boolean;
  triggerDetail: (rule: Record<string, unknown> | null, ctx?: { knownValuesCount?: number } | null) => string;
}

export const PHASE_REGISTRY: ReadonlyArray<PhaseEntry>;
