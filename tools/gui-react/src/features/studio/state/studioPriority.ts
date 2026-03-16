import {
  clampNumber,
  parseBoundedIntInput,
  parseOptionalPositiveIntInput,
} from "./numericInputHelpers";
import { STUDIO_NUMERIC_KNOB_BOUNDS } from "./studioNumericKnobBounds";
import type {
  AiAssistConfig,
  ComponentSource,
  FieldRule,
  PriorityProfile,
} from "../../../types/studio";

export const DEFAULT_PRIORITY_PROFILE: Required<PriorityProfile> = {
  required_level: "expected",
  availability: "expected",
  difficulty: "medium",
  effort: 3,
};

const PRIORITY_REQUIRED_LEVELS = [
  "identity",
  "critical",
  "required",
  "expected",
  "optional",
  "editorial",
  "commerce",
];
const PRIORITY_AVAILABILITY_LEVELS = [
  "always",
  "expected",
  "sometimes",
  "rare",
  "editorial_only",
];
const PRIORITY_DIFFICULTY_LEVELS = ["easy", "medium", "hard", "instrumented"];
const REQUIRED_LEVEL_RANK: Record<string, number> = {
  identity: 6,
  critical: 5,
  required: 4,
  expected: 3,
  optional: 2,
  editorial: 1,
  commerce: 1,
};
const AVAILABILITY_RANK: Record<string, number> = {
  always: 5,
  expected: 4,
  sometimes: 3,
  rare: 2,
  editorial_only: 1,
};
const DIFFICULTY_RANK: Record<string, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
  instrumented: 4,
};
const LIST_FIELD_ALIASES: Record<string, string[]> = {
  polling: ["polling_rate"],
  switches: ["switch"],
};
const AI_MODES = ["off", "advisory", "planner", "judge"];
const AI_MODEL_STRATEGIES = ["auto", "force_fast", "force_deep"];

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
  const effort = parseBoundedIntInput(
    input.effort,
    STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.min,
    STUDIO_NUMERIC_KNOB_BOUNDS.priorityEffort.max,
    DEFAULT_PRIORITY_PROFILE.effort,
  );
  return {
    required_level: PRIORITY_REQUIRED_LEVELS.includes(required_level)
      ? required_level
      : DEFAULT_PRIORITY_PROFILE.required_level,
    availability: PRIORITY_AVAILABILITY_LEVELS.includes(availability)
      ? availability
      : DEFAULT_PRIORITY_PROFILE.availability,
    difficulty: PRIORITY_DIFFICULTY_LEVELS.includes(difficulty)
      ? difficulty
      : DEFAULT_PRIORITY_PROFILE.difficulty,
    effort,
  };
}

export function hasExplicitPriority(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const priority = value as Record<string, unknown>;
  return (
    priority.required_level !== undefined ||
    priority.availability !== undefined ||
    priority.difficulty !== undefined ||
    priority.effort !== undefined
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
    effort: priority.effort ?? rule?.effort,
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
  const effort = Math.max(
    ...priorities.map((priority) =>
      Number(priority.effort || DEFAULT_PRIORITY_PROFILE.effort),
    ),
  );

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
    effort,
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
): Required<AiAssistConfig> {
  const input =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const modeToken = String(input.mode || "")
    .trim()
    .toLowerCase();
  const strategyToken = String(input.model_strategy || "auto")
    .trim()
    .toLowerCase();
  const maxCallsRaw = parseOptionalPositiveIntInput(input.max_calls);
  const maxTokensRaw = parseOptionalPositiveIntInput(input.max_tokens);
  const maxCalls =
    maxCallsRaw === null
      ? null
      : clampNumber(
          maxCallsRaw,
          STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.min,
          STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxCalls.max,
        );
  const maxTokens =
    maxTokensRaw === null
      ? null
      : clampNumber(
          maxTokensRaw,
          STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.min,
          STUDIO_NUMERIC_KNOB_BOUNDS.aiMaxTokens.max,
        );
  return {
    mode: AI_MODES.includes(modeToken) ? modeToken : null,
    model_strategy: AI_MODEL_STRATEGIES.includes(strategyToken)
      ? strategyToken
      : "auto",
    max_calls: maxCalls,
    max_tokens: maxTokens,
    reasoning_note: String(input.reasoning_note || ""),
  };
}

export function deriveAiModeFromPriority(
  priority: Required<PriorityProfile>,
): string {
  const requiredLevel = priority.required_level;
  const difficulty = priority.difficulty;
  if (["identity", "required", "critical"].includes(requiredLevel)) {
    return "judge";
  }
  if (requiredLevel === "expected" && difficulty === "hard") return "planner";
  if (requiredLevel === "expected") return "advisory";
  return "off";
}

export function deriveAiCallsFromEffort(effort: number): number {
  if (effort <= 3) return 1;
  if (effort <= 6) return 2;
  return 3;
}
