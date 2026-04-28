import type {
  AiAssistConfig,
} from "../../../types/studio.ts";
import {
  FIELD_RULE_AI_ASSIST_TOGGLE_SPECS,
  normalizeFieldRuleAiAssistToggleFromConfig,
  readFieldRuleAiAssistToggleEnabled,
} from "../../../../../../src/field-rules/fieldRuleSchema.js";
import { getN } from "./nestedValueHelpers.ts";

type EnabledToggleConfig = { enabled: boolean };
type NormalizedAiAssistConfig = AiAssistConfig & {
  reasoning_note: string;
  [key: string]: EnabledToggleConfig | string | undefined;
};

export function readAiAssistToggleEnabled(
  rule: Record<string, unknown> | null | undefined,
  path: string,
): boolean {
  const toggleSpec = FIELD_RULE_AI_ASSIST_TOGGLE_SPECS.find((spec) => spec.path === path);
  if (toggleSpec) {
    return readFieldRuleAiAssistToggleEnabled(toggleSpec.key, rule, toggleSpec.defaultEnabled);
  }
  const ruleObj = rule || {};
  const subEnabled = getN(ruleObj, `${path}.enabled`);
  if (typeof subEnabled === "boolean") return subEnabled;
  const directValue = getN(ruleObj, path);
  if (typeof directValue === "boolean") return directValue;
  return false;
}

export function normalizeAiAssistConfig(
  value: unknown,
): NormalizedAiAssistConfig {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const normalized: NormalizedAiAssistConfig = {
    reasoning_note: String(input.reasoning_note || ""),
  };
  for (const toggleSpec of FIELD_RULE_AI_ASSIST_TOGGLE_SPECS) {
    const normalizedToggle = normalizeFieldRuleAiAssistToggleFromConfig(input, toggleSpec.key);
    if (normalizedToggle) {
      normalized[toggleSpec.key] = normalizedToggle;
    }
  }
  return normalized;
}
