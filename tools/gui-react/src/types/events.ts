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
  run_id?: string | null;
  runId?: string | null;
  category?: string | null;
  product_id?: string | null;
  productId?: string | null;
  brand?: string | null;
  base_model?: string | null;
  model?: string | null;
  variant?: string | null;
  storage_destination?: 'local';
  storageDestination?: 'local';
  pid?: number | null;
  command?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  exitCode?: number | null;
}
