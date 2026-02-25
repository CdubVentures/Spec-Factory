export interface RuntimeEvent {
  ts: string;
  event: string;
  productId?: string;
  runId?: string;
  field?: string;
  url?: string;
  detail?: string;
  [key: string]: unknown;
}

export interface ProcessStatus {
  running: boolean;
  relocating?: boolean;
  relocatingRunId?: string | null;
  run_id?: string | null;
  runId?: string | null;
  pid?: number;
  command?: string;
  startedAt?: string;
  endedAt?: string | null;
  exitCode?: number | null;
}
