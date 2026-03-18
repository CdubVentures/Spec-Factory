import { LLM_SETTING_LIMITS } from '../../../stores/settingsManifest.ts';
import type { RuntimeModelTokenDefaultsResolver } from './runtimeSettingsDomainTypes.ts';

const LLM_MIN_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.min;
const LLM_MAX_OUTPUT_TOKENS = LLM_SETTING_LIMITS.maxTokens.max;

export function parseRuntimeLlmTokenCap(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(
    LLM_MIN_OUTPUT_TOKENS,
    Math.min(LLM_MAX_OUTPUT_TOKENS, parsed),
  );
}

export function parseRuntimeInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseRuntimeFloat(value: unknown, fallback: number): number {
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseRuntimeString(value: unknown, fallback = ''): string {
  const parsed = String(value ?? '').trim();
  return parsed || fallback;
}

export function clampTokenForModel(
  model: string,
  value: number | string,
  resolveModelTokenDefaults: RuntimeModelTokenDefaultsResolver,
): number {
  const defaults = resolveModelTokenDefaults(model);
  const parsed = Number.parseInt(String(value), 10);
  const safeValue = Math.max(
    LLM_MIN_OUTPUT_TOKENS,
    Number.isFinite(parsed) ? parsed : defaults.default_output_tokens,
  );
  return Math.min(safeValue, defaults.max_output_tokens);
}
