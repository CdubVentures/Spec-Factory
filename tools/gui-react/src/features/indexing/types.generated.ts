// AUTO-GENERATED from backend shape descriptors — do not edit manually.
// Run: node tools/gui-react/scripts/generateAutomationQueueTypes.js
//
// Shape descriptors live in:
//   src/features/indexing/api/contracts/automationQueueContract.js

export interface AutomationJobRowGen {
  job_id: string;
  job_type: string;
  priority: number;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cooldown';
  category: string;
  product_id: string;
  run_id: string;
  field_targets: string[];
  url: string | null;
  domain: string | null;
  query: string | null;
  provider: string | null;
  doc_hint: string | null;
  dedupe_key: string;
  source_signal: string;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  next_run_at: string | null;
  attempt_count: number;
  reason_tags: string[];
  last_error: string | null;
  notes: string[];
}

export interface AutomationActionRowGen {
  ts: string | null;
  event: string | null;
  job_id: string;
  job_type: string;
  status: 'queued' | 'running' | 'done' | 'failed' | 'cooldown';
  source_signal: string;
  priority: number;
  detail: string | null;
  domain: string | null;
  url: string | null;
  query: string | null;
  field_targets: string[];
  reason_tags: string[];
}

export interface AutomationSummaryGen {
  total_jobs: number;
  queue_depth: number;
  active_jobs: number;
  queued: number;
  running: number;
  done: number;
  failed: number;
  cooldown: number;
  repair_search: number;
  staleness_refresh: number;
  deficit_rediscovery: number;
  domain_backoff: number;
}
