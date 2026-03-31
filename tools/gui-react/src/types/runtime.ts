export interface RuntimeOverrides {
  pause?: boolean;
  block_fields?: string[];
  force_rerun_fields?: string[];
  max_run_seconds?: number;
  escalate_fields?: string[];
  [key: string]: unknown;
}

export interface FrontierEntry {
  url: string;
  rootDomain: string;
  priority: number;
  attempts: number;
  lastAttempt: string | null;
  status: string;
}

