// ── Field Test Dashboard Types ───────────────────────────────────────
// WHY: Single source of truth for all data shapes used across test-mode components.

export interface TestCase {
  id: number;
  name: string;
  description: string;
  category?: string;
  productId?: string;
}

export interface GenerateResult {
  ok: boolean;
  products: string[];
  testCases: TestCase[];
}

export interface RepairLogSummary {
  total: number;
  repaired: number;
  failed: number;
  rerunRecommended: number;
  promptSkipped: number;
  pendingLlm: number;
  valid: number;
  costUsd: number;
}

export interface RepairRejection {
  reason_code: string;
  detail?: Record<string, unknown>;
}

export interface RepairEntry {
  field: string;
  promptId: string | null;
  prompt_in: { system: string; user: string } | null;
  response_out: unknown;
  status: string;
  confidence: number;
  value_before: string | null;
  value_after: string | null;
  flaggedForReview: boolean;
  error: string | null;
  rejections: RepairRejection[];
  revalidation: { valid: boolean } | null;
  model: string | null;
  cost_usd: number | null;
  tokens: number | null;
}

export interface RunResultItem {
  productId: string;
  status: string;
  testCase?: TestCase;
  confidence?: number;
  coverage?: number;
  completeness?: number;
  validated?: boolean;
  trafficLight?: { green?: number; yellow?: number; red?: number };
  constraintConflicts?: number;
  missingRequired?: string[];
  curationSuggestions?: number;
  runtimeFailures?: number;
  durationMs?: number;
  error?: string;
  repairLog?: RepairLogSummary | null;
}

// ── Per-Key Field Contract Audit Types ──────────────────────────────

export interface AuditPrompt {
  promptId: string;
  system: string;
  user: string;
  jsonSchema: Record<string, unknown>;
  params: Record<string, unknown>;
}

export interface AuditCheck {
  type: 'good' | 'reject' | 'repair';
  pass: boolean;
  value: unknown;
  detail: string;
  expectedCode?: string;
  actualCodes?: string[];
  description?: string;
  prompt?: AuditPrompt | null;
  knob?: string;
  expectedRepair?: unknown;
  actualValue?: unknown;
}

export interface FieldAuditResult {
  fieldKey: string;
  checks: AuditCheck[];
}

export interface FieldContractAuditResult {
  results: FieldAuditResult[];
  summary: { totalFields: number; totalChecks: number; passCount: number; failCount: number };
}

export interface MatrixRow {
  id: string;
  cells: Record<string, string | number | boolean>;
  testNumbers: number[];
  expectedBehavior: string;
  validationStatus?: 'pass' | 'fail' | 'pending';
}

export interface CoverageMatrix {
  title: string;
  columns: Array<{ key: string; label: string; width?: string }>;
  rows: MatrixRow[];
  summary: Record<string, string | number>;
}

export interface ScenarioDef {
  id: number;
  name: string;
  category: string;
  desc: string;
  aiCalls?: string;
}

export interface ContractSummary {
  fieldCount: number;
  fieldsByType: Record<string, number>;
  fieldsByShape: Record<string, number>;
  enumPolicies: Record<string, number>;
  parseTemplates: Record<string, number>;
  componentTypes: Array<{
    type: string;
    itemCount: number;
    aliasCount: number;
    propKeys: string[];
    varianceKeys: string[];
    hasConstraints: boolean;
  }>;
  requiredFields: string[];
  criticalFields: string[];
  rangeConstraints: Record<string, { min: number; max: number }>;
  crossValidationRules: string[];
  knownValuesCatalogs: string[];
  testProductCount: number;
  listFieldCount: number;
  componentRefFieldCount: number;
}

export interface ContractResponse {
  ok: boolean;
  summary: ContractSummary;
  matrices: {
    fieldRules: CoverageMatrix;
    components: CoverageMatrix;
    listsEnums: CoverageMatrix;
  };
  scenarioDefs?: ScenarioDef[];
}

export interface ImportProgress {
  step: string;
  status: 'copying' | 'done' | 'error';
  file?: string;
  detail?: string;
  summary?: {
    fields: number;
    components: number;
    componentItems: number;
    enums: number;
    rules: number;
  };
}

export interface RunProgress {
  index: number;
  total: number;
  productId: string;
  scenarioName: string;
  status: 'running' | 'complete' | 'error';
  aiReview?: boolean;
  error?: string;
  result?: RunResultItem;
}

export interface RepairProgress {
  productId: string;
  scenarioName: string;
  phase: 'repair';
  field: string;
  promptId: string | null;
  index: number;
  total: number;
  status: 'calling' | 'repaired' | 'still_failed' | 'prompt_skipped' | string;
  value_after?: unknown;
}

export interface RepairsResponse {
  ok: boolean;
  repairs: RepairEntry[];
  validation: {
    perField: Record<string, { valid: boolean; rejections: RepairRejection[] }>;
    crossFieldFailures: unknown[];
  } | null;
}
