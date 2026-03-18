import type { RuntimeStepId } from '../components/RuntimeFlowStepIcon';

export type { RuntimeStepId } from '../components/RuntimeFlowStepIcon';

export interface RuntimeStepEntry {
  id: RuntimeStepId;
  phase: string;
  label: string;
  tip: string;
  options: readonly string[];
}

export interface RuntimeSubStepEntry {
  id: string;
  label: string;
  tip: string;
}

export const RUNTIME_STEP_IDS: readonly RuntimeStepId[] = [
  'run-setup',
  'run-output',
  'automation',
  'observability-trace',
  'fetch-network',
  'browser-rendering',
  'parsing',
  'ocr',
] as const;

export const RUNTIME_STEPS: RuntimeStepEntry[] = [
  {
    id: 'run-setup',
    phase: '01',
    label: 'Run Setup',
    tip: 'Stages 01-07 discovery setup: NeedSet through SERP Triage.',
    options: [
      'Search Route',
      'SearXNG Base URL',
      'Fetch Candidate Sources',
      'Search Profile Caps Map (JSON)',
      'SERP Reranker Weight Map (JSON)',
      'Manufacturer Auto Promote',
      'Discovery Max Queries',
      'Discovery Max Discovered',
      'Max URLs / Product',
      'Max Candidate URLs',
      'Max Pages / Domain',
      'Max Run Seconds',
      'Max JSON Bytes',
      'User Agent',
      'Resume Mode',
      'Resume Window (hours)',
      'Re-extract Indexed',
      'Re-extract Age (hours)',
    ],
  },
  {
    id: 'run-output',
    phase: '01B',
    label: 'Runtime Outputs',
    tip: 'Artifact and export controls for Stage 13 output plus run persistence.',
    options: [
      'Output Mode',
      'Local Mode',
      'Dry Run',
      'Runtime Control File',
      'Mirror To S3',
      'Mirror To S3 Input',
      'Local Input Root',
      'Local Output Root',
      'Runtime Events Key',
      'Write Markdown Summary',
      'AWS Region',
      'S3 Bucket',
      'S3 Input Prefix',
      'S3 Output Prefix',
      'ELO Supabase Anon Key',
      'ELO Supabase Endpoint',
    ],
  },
  {
    id: 'automation',
    phase: '02B',
    label: 'Automation',
    tip: 'Background control plane for drift scans, learning loops, and daemon ops.',
    options: [
      'Drift Detection Enabled',
      'Drift Poll Seconds',
      'Drift Scan Max Products',
      'Self Improve Enabled',
      'Batch Strategy',
      'Category Authority Enabled',
      'Daemon Concurrency',
      'Imports Root',
      'Imports Poll Seconds',
    ],
  },
  {
    id: 'observability-trace',
    phase: '02',
    label: 'Observability',
    tip: 'Cross-cutting trace, event, and screencast controls across stages 01-13.',
    options: [
      'Runtime Trace Enabled',
      'Fetch Trace Ring Size',
      'LLM Trace Ring Size',
      'Trace LLM Payloads',
      'Events NDJSON Write',
      'Authority Snapshot Enabled',
      'Queue JSON Write',
      'Billing JSON Write',
      'Intel JSON Write',
      'Corpus JSON Write',
      'Learning JSON Write',
      'Cache JSON Write',
      'Runtime Screencast Enabled',
      'Runtime Screencast FPS',
      'Runtime Screencast Quality',
      'Runtime Screencast Max Width',
      'Runtime Screencast Max Height',
    ],
  },
  {
    id: 'fetch-network',
    phase: '03',
    label: 'Fetch and Network',
    tip: 'Stage 08 fetch-entry scheduling, pacing, cooldowns, and repair search.',
    options: [
      'Fetch Scheduler Enabled',
      'Fetch Concurrency',
      'Fetch Budget (ms)',
      'Per Host Min Delay (ms)',
      'Fetch Per-Host Concurrency Cap',
      'Prefer HTTP Fetcher',
      'Frontier Repair Search Enabled',
      'Frontier Query Cooldown (sec)',
      'Frontier SQLite Enabled',
      'Repair Dedupe Rule',
    ],
  },
  {
    id: 'browser-rendering',
    phase: '03B',
    label: 'Browser and Rendering',
    tip: 'Stage 08 browser fallback, replay, and screenshot capture.',
    options: [
      'Dynamic Crawlee Enabled',
      'Crawlee Headless',
      'Page Goto Timeout (ms)',
      'Page Network Idle Timeout (ms)',
      'Post Load Wait (ms)',
      'Auto Scroll Enabled',
      'GraphQL Replay Enabled',
      'Robots.txt Compliant',
      'Capture Page Screenshot Enabled',
    ],
  },
  {
    id: 'parsing',
    phase: '03C',
    label: 'Parsing',
    tip: 'Stage 09 fetch-to-extraction parsing for PDF, article, DOM, and tables.',
    options: [
      'PDF Router Enabled',
      'PDF Preferred Backend',
      'Max PDF Bytes',
      'Article Extractor V2 Enabled',
      'Static DOM Extractor Enabled',
      'HTML Table Extractor V2',
    ],
  },
  {
    id: 'ocr',
    phase: '04',
    label: 'OCR',
    tip: 'Stage 09 scanned-PDF OCR thresholds and candidate promotion.',
    options: [
      'OCR Enabled',
      'Promote OCR Candidates',
      'OCR Backend',
      'OCR Max Pages',
      'OCR Max Pairs',
      'OCR Min Chars / Page',
      'OCR Min Lines / Page',
      'OCR Min Confidence',
    ],
  },
];

export const RUNTIME_SUB_STEPS: Record<RuntimeStepId, RuntimeSubStepEntry[]> = {
  'run-setup': [
    {
      id: 'run-setup-discovery',
      label: 'Discovery',
      tip: 'Phases 01-07. Tunes NeedSet-driven discovery, Brand Resolver, Search Profile, Search Planner, Query Journey, Search Results, and SERP Triage before any URL is fetched.',
    },
    {
      id: 'run-setup-budgets',
      label: 'URL Budgets',
      tip: 'Phases 05-08. Caps how many URLs, pages, bytes, and seconds discovery can spend before the fetch handoff.',
    },
    {
      id: 'run-setup-resume',
      label: 'Resume and Re-extract',
      tip: 'Bootstrap plus late refresh. Decides whether prior run state is reused and when old indexed sources are forced back through extraction.',
    },
  ],
  'run-output': [
    {
      id: 'run-output-destinations',
      label: 'Output Destinations',
      tip: 'Stage 13 and durable artifact persistence. Controls where runs/, latest/, final/, markdown, events, and cloud mirrors are written.',
    },
  ],
  'automation': [
    {
      id: 'automation-drift',
      label: 'Drift Detection',
      tip: 'Out-of-band maintenance after normal runs complete. Controls drift rescans, recrawl timing, and optional auto-republish behavior.',
    },
    {
      id: 'automation-learning',
      label: 'Self-Improvement',
      tip: 'Post-run learning loop that reacts to weak coverage and stale evidence. Controls follow-up budgets, reward decay, and endpoint mining.',
    },
    {
      id: 'automation-helper',
      label: 'Helper Runtime',
      tip: 'External helper substrate used alongside the main pipeline. Controls category-authority roots and helper fill policy outside the stage graph.',
    },
    {
      id: 'automation-operations',
      label: 'Operations',
      tip: 'Daemon and resume infrastructure around the pipeline, including concurrent run limits, schema validation, and import watching.',
    },
  ],
  'observability-trace': [
    {
      id: 'observability-trace-core',
      label: 'Trace Core',
      tip: 'Cross-cutting trace capture for stages 01-13, including fetch and LLM ring buffers plus event-stream emission.',
    },
    {
      id: 'observability-trace-outputs',
      label: 'Data Streams',
      tip: 'Cross-surface diagnostics and migration outputs, including authority snapshots and JSON dual-write streams.',
    },
    {
      id: 'observability-trace-video',
      label: 'Video Capture',
      tip: 'Runtime Ops screencast output for browser-backed fetch lanes during Stage 08 fetch and render work.',
    },
  ],
  'fetch-network': [
    {
      id: 'fetch-network-throughput',
      label: 'Core Throughput',
      tip: 'Stage 08. Scheduler concurrency, host pacing, and request budgets before Stage 09 extraction begins.',
    },
    {
      id: 'fetch-network-frontier',
      label: 'Frontier and Repair',
      tip: 'Stages 07-08. Repair search, frontier persistence, cooldowns, and blocked-host policy after SERP triage selects URLs.',
    },
  ],
  'browser-rendering': [
    {
      id: 'browser-rendering-core',
      label: 'Browser Core',
      tip: 'Stage 08 browser-backed fetch policy, including dynamic fallback enablement, headless mode, and retry behavior.',
    },
    {
      id: 'browser-rendering-scroll',
      label: 'Scroll and Replay',
      tip: 'Stage 08 rendered-page enrichment before extraction, including auto-scroll, response replay capture, and robots checks.',
    },
    {
      id: 'browser-rendering-screenshots',
      label: 'Screenshots',
      tip: 'Stage 08 artifact capture for screenshots that later support Stage 09 extraction and Runtime Ops review.',
    },
  ],
  'parsing': [
    {
      id: 'parsing-pdf',
      label: 'PDF Processing',
      tip: 'Stage 09 PDF intake and backend routing before field and identity candidates are emitted.',
    },
    {
      id: 'parsing-article',
      label: 'Article Extraction',
      tip: 'Stage 09 article/readability parsing that converts long-form pages into extraction-ready evidence.',
    },
    {
      id: 'parsing-dom',
      label: 'Static DOM',
      tip: 'Stage 09 deterministic DOM parsing, including fallback mode, confidence threshold, and snippet retention.',
    },
  ],
  ocr: [
    {
      id: 'ocr-activation',
      label: 'Activation',
      tip: 'Stage 09 OCR gate for scanned PDFs, including enablement, promotion policy, and backend selection.',
    },
    {
      id: 'ocr-thresholds',
      label: 'Sampling Thresholds',
      tip: 'Stage 09 OCR sampling and evidence-promotion thresholds that decide whether OCR output can reach extraction.',
    },
  ],
};
