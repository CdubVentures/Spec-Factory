export interface RuntimeOverrides {
  pause?: boolean;
  block_fields?: string[];
  force_rerun_fields?: string[];
  max_run_seconds?: number;
  escalate_fields?: string[];
  [key: string]: unknown;
}

export interface TraceEntry {
  file: string;
  section: string;
  ts: string;
  data: Record<string, unknown> | null;
}

export interface FrontierEntry {
  url: string;
  rootDomain: string;
  priority: number;
  attempts: number;
  lastAttempt: string | null;
  status: string;
}

export interface LlmTraceEntry {
  ts: string;
  model: string;
  purpose: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
  field: string | null;
}
