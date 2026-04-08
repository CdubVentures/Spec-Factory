// ── Field Contract Audit Types ───────────────────────────────────────

export interface ValidatorOutput {
  valid: boolean;
  value: unknown;
  repairs: Array<{ step: string; before: unknown; after: unknown; rule: string }>;
  rejections: Array<{ reason_code: string; detail: Record<string, unknown> }>;
}

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
  description?: string;
  expectedCode?: string;
  actualCodes?: string[];
  prompt?: AuditPrompt | null;
  knob?: string;
  expectedRepair?: unknown;
  actualValue?: unknown;
  validatorOutput?: ValidatorOutput;
}

export interface FieldKnob {
  knob: string;
  value: string;
  step: number;
  action: 'reject' | 'reject+llm' | 'deterministic' | 'dispatch' | 'pass-through' | 'info' | 'llm_repair';
  code: string | null;
  prompt?: string;
}

export interface FieldAuditResult {
  fieldKey: string;
  checks: AuditCheck[];
  knobs: FieldKnob[];
}

export interface PhaseInfo {
  id: string;
  title: string;
  order: number;
  description: string;
  behaviorNote: string;
}

export interface FieldContractAuditResult {
  results: FieldAuditResult[];
  phases: PhaseInfo[];
  summary: { totalFields: number; totalChecks: number; passCount: number; failCount: number };
}
