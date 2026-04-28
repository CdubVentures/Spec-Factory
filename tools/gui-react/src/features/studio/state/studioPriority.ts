import type {
  AiAssistConfig,
  ComponentSource,
  FieldRule,
  PriorityProfile,
} from "../../../types/studio.ts";
import {
  REQUIRED_LEVEL_OPTIONS,
  REQUIRED_LEVEL_RANK,
  AVAILABILITY_OPTIONS,
  AVAILABILITY_RANK,
  DIFFICULTY_OPTIONS,
  DIFFICULTY_RANK,
} from "../../../registries/fieldRuleTaxonomy.ts";
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

export const DEFAULT_PRIORITY_PROFILE: Required<PriorityProfile> = {
  required_level: "non_mandatory",
  availability: "sometimes",
  difficulty: "medium",
};

const LIST_FIELD_ALIASES: Record<string, string[]> = {
  polling: ["polling_rate"],
  switches: ["switch"],
};

export function normalizePriorityProfile(
  value: unknown,
): Required<PriorityProfile> {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const required_level = String(
    input.required_level || DEFAULT_PRIORITY_PROFILE.required_level,
  );
  const availability = String(
    input.availability || DEFAULT_PRIORITY_PROFILE.availability,
  );
  const difficulty = String(
    input.difficulty || DEFAULT_PRIORITY_PROFILE.difficulty,
  );
  return {
    required_level: (REQUIRED_LEVEL_OPTIONS as readonly string[]).includes(required_level)
      ? (required_level as Required<PriorityProfile>['required_level'])
      : DEFAULT_PRIORITY_PROFILE.required_level,
    availability: (AVAILABILITY_OPTIONS as readonly string[]).includes(availability)
      ? (availability as Required<PriorityProfile>['availability'])
      : DEFAULT_PRIORITY_PROFILE.availability,
    difficulty: (DIFFICULTY_OPTIONS as readonly string[]).includes(difficulty)
      ? (difficulty as Required<PriorityProfile>['difficulty'])
      : DEFAULT_PRIORITY_PROFILE.difficulty,
  };
}

export function hasExplicitPriority(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const priority = value as Record<string, unknown>;
  return (
    priority.required_level !== undefined ||
    priority.availability !== undefined ||
    priority.difficulty !== undefined
  );
}

function pickRankedToken(
  tokens: string[],
  rankMap: Record<string, number>,
  fallback: string,
): string {
  let best = fallback;
  let bestRank = rankMap[fallback] ?? 0;
  for (const token of tokens) {
    const rank = rankMap[token] ?? 0;
    if (rank > bestRank) {
      best = token;
      bestRank = rank;
    }
  }
  return best;
}

export function resolveRulePriority(
  rule: FieldRule | undefined,
): Required<PriorityProfile> {
  const priority =
    rule?.priority && typeof rule.priority === "object"
      ? (rule.priority as Record<string, unknown>)
      : {};
  return normalizePriorityProfile({
    required_level: priority.required_level ?? rule?.required_level,
    availability: priority.availability ?? rule?.availability,
    difficulty: priority.difficulty ?? rule?.difficulty,
  });
}

function derivePriorityFromRuleKeys(
  ruleKeys: string[],
  rules: Record<string, FieldRule>,
): Required<PriorityProfile> {
  const priorities = ruleKeys
    .map((key) => rules[key])
    .filter(Boolean)
    .map((rule) => resolveRulePriority(rule));

  if (priorities.length === 0) {
    return { ...DEFAULT_PRIORITY_PROFILE };
  }

  const requiredLevels = priorities.map((priority) => priority.required_level);
  const availabilities = priorities.map((priority) => priority.availability);
  const difficulties = priorities.map((priority) => priority.difficulty);

  return normalizePriorityProfile({
    required_level: pickRankedToken(
      requiredLevels,
      REQUIRED_LEVEL_RANK,
      DEFAULT_PRIORITY_PROFILE.required_level,
    ),
    availability: pickRankedToken(
      availabilities,
      AVAILABILITY_RANK,
      DEFAULT_PRIORITY_PROFILE.availability,
    ),
    difficulty: pickRankedToken(
      difficulties,
      DIFFICULTY_RANK,
      DEFAULT_PRIORITY_PROFILE.difficulty,
    ),
  });
}

export function deriveComponentSourcePriority(
  source: ComponentSource,
  rules: Record<string, FieldRule>,
): Required<PriorityProfile> {
  const keys = new Set<string>();
  const typeToken = String(source.type || source.component_type || "").trim();
  if (typeToken && rules[typeToken]) {
    keys.add(typeToken);
  }

  const properties = Array.isArray(source.roles?.properties)
    ? source.roles?.properties
    : [];
  for (const property of properties || []) {
    const fieldKey = String(property?.field_key || property?.key || "").trim();
    if (fieldKey && rules[fieldKey]) {
      keys.add(fieldKey);
    }
  }

  if (keys.size === 0 && typeToken) {
    const fallback = Object.keys(rules).find(
      (key) => key.toLowerCase() === typeToken.toLowerCase(),
    );
    if (fallback) keys.add(fallback);
  }

  return derivePriorityFromRuleKeys(Array.from(keys), rules);
}

export function deriveListPriority(
  field: string,
  rules: Record<string, FieldRule>,
): Required<PriorityProfile> {
  const key = String(field || "").trim();
  const candidates = [key, ...(LIST_FIELD_ALIASES[key] || [])];
  const matched = candidates.find((candidate) => candidate && rules[candidate]);
  if (!matched) return { ...DEFAULT_PRIORITY_PROFILE };
  return derivePriorityFromRuleKeys([matched], rules);
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
