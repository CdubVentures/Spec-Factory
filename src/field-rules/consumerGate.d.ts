// WHY: Type declaration for the JS ESM consumer gate, consumed by GUI TypeScript.

export const FIELD_SYSTEM_MAP: Record<string, string[]>;

export function normalizeConsumerSystem(system: string): string | null;

export function normalizeConsumerOverrides(
  consumers: unknown,
): Record<string, Record<string, boolean>> | null;

export function resolveConsumerGate(
  rule: Record<string, unknown>,
  fieldPath: string,
  system: string,
): { fieldPath: string; system: string; enabled: boolean; explicit: boolean };

export function isConsumerEnabled(
  rule: Record<string, unknown>,
  fieldPath: string,
  system: string,
): boolean;

export function projectRuleForConsumer(
  rule: Record<string, unknown>,
  system: string,
): Record<string, unknown>;

export function projectFieldRulesForConsumer(
  payload: Record<string, unknown>,
  system: string,
): Record<string, unknown>;
