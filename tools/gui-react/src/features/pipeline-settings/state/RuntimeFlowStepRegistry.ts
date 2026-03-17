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
  'planner-triage',
] as const;

export const RUNTIME_STEPS: RuntimeStepEntry[] = [
  {
    id: 'run-setup',
    phase: '01',
    label: 'Run Setup',
    tip: 'Pipeline bootstrap profile, discovery, and resume policy.',
    options: [
      'Discovery Enabled',
      'Search Route',
      'SearXNG Base URL',
      'Fetch Candidate Sources',
      'Discovery Max Queries',
      'Discovery Results / Query',
      'Discovery Max Discovered',
      'Discovery Query Concurrency',
      'Search Profile Caps Map (JSON)',
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
      'Convergence Identity Fail-Fast Rounds',
    ],
  },
  {
    id: 'run-output',
    phase: '01B',
    label: 'Runtime Outputs',
    tip: 'Output destinations, artifact paths, and runtime control overrides.',
    options: [
      'Output Mode',
      'Local Mode',
      'Dry Run',
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
      'Runtime Control File',
    ],
  },
  {
    id: 'automation',
    phase: '02B',
    label: 'Automation',
    tip: 'Drift detection, self-improvement, and helper runtime.',
    options: [
      'Drift Detection Enabled',
      'Drift Poll Seconds',
      'Drift Scan Max Products',
      'Self Improve Enabled',
      'Batch Strategy',
      'Helper Files Enabled',
      'Helper Supportive Enabled',
    ],
  },
  {
    id: 'observability-trace',
    phase: '02',
    label: 'Observability and Trace',
    tip: 'Runtime trace, event stream, and screencast diagnostics.',
    options: [
      'Runtime Trace Enabled',
      'Fetch Trace Ring Size',
      'LLM Trace Ring Size',
      'Trace LLM Payloads',
      'Events NDJSON Write',
      'Indexing Resume Seed Limit',
      'Indexing Resume Persist Limit',
      'Indexing Schema Validation Enabled',
      'Indexing Schema Validation Strict',
      'Re-Crawl Stale After (days)',
      'Daemon Concurrency',
      'Daemon Graceful Shutdown Timeout (ms)',
      'Imports Root',
      'Imports Poll Seconds',
      'Queue JSON Write',
      'Billing JSON Write',
      'Intel JSON Write',
      'Corpus JSON Write',
      'Learning JSON Write',
      'Cache JSON Write',
      'Authority Snapshot Enabled',
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
    tip: 'Fetch throughput, scheduler pacing, frontier cooldown, and repair controls.',
    options: [
      'Fetch Scheduler Enabled',
      'Fetch Concurrency',
      'Per Host Min Delay (ms)',
      'Fetch Per-Host Concurrency Cap',
      'Prefer HTTP Fetcher',
      'Frontier Repair Search Enabled',
      'Frontier Query Cooldown (sec)',
      'Frontier SQLite Enabled',
      'Repair Dedupe Rule',
      'Automation Queue Storage Engine',
    ],
  },
  {
    id: 'browser-rendering',
    phase: '03B',
    label: 'Browser and Rendering',
    tip: 'Dynamic browser rendering, scroll/replay, screenshots, and visual asset capture.',
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
      'Runtime Capture Screenshots',
    ],
  },
  {
    id: 'parsing',
    phase: '03C',
    label: 'Parsing',
    tip: 'PDF processing, article extraction, DOM parsing, and structured metadata.',
    options: [
      'PDF Router Enabled',
      'PDF Preferred Backend',
      'Max PDF Bytes',
      'Article Extractor V2 Enabled',
      'Static DOM Extractor Enabled',
      'Structured Metadata Extruct Enabled',
      'HTML Table Extractor V2',
      'Chart Extraction Enabled',
    ],
  },
  {
    id: 'ocr',
    phase: '04',
    label: 'OCR',
    tip: 'Scanned PDF OCR activation and evidence promotion rules.',
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
  {
    id: 'planner-triage',
    phase: '05',
    label: 'Search & Reranker',
    tip: 'Search planner, LLM discovery queries, and SERP reranker scoring policy.',
    options: [
      'Planner Enabled',
      'LLM Discovery Queries',
      'Search Profile Caps Map (JSON)',
      'SERP Reranker Weight Map (JSON)',
    ],
  },
];

export const RUNTIME_SUB_STEPS: Record<RuntimeStepId, RuntimeSubStepEntry[]> = {
  'run-setup': [
    {
      id: 'run-setup-discovery',
      label: 'Discovery',
      tip: 'Search routing and discovery caps.',
    },
    {
      id: 'run-setup-budgets',
      label: 'URL Budgets',
      tip: 'URL budget caps, runtime timeout, and user agent controls.',
    },
    {
      id: 'run-setup-manufacturer',
      label: 'Manufacturer Discovery',
      tip: 'Manufacturer-domain auto-promote classification control.',
    },
    {
      id: 'run-setup-results',
      label: 'Discovery Results',
      tip: 'Discovery query counts and result caps.',
    },
    {
      id: 'run-setup-resume',
      label: 'Resume and Re-extract',
      tip: 'Resume strategy plus stale indexed-source re-extraction controls.',
    },
  ],
  'run-output': [
    {
      id: 'run-output-destinations',
      label: 'Output Destinations',
      tip: 'Output mode, local/S3 paths, and artifact destination controls.',
    },
  ],
  'automation': [
    {
      id: 'automation-drift',
      label: 'Drift Detection',
      tip: 'Drift scanning cadence and auto-republish controls.',
    },
    {
      id: 'automation-learning',
      label: 'Self-Improvement',
      tip: 'Learning confidence, hypothesis queue, and endpoint signal controls.',
    },
    {
      id: 'automation-helper',
      label: 'Helper Runtime',
      tip: 'Helper-file runtime sourcing and supportive-fill policy.',
    },
  ],
  'observability-trace': [
    {
      id: 'observability-trace-core',
      label: 'Trace Core',
      tip: 'Runtime trace capture and event ring configuration.',
    },
    {
      id: 'observability-trace-daemon',
      label: 'Daemon and Imports',
      tip: 'Daemon runtime limits and import watcher controls.',
    },
    {
      id: 'observability-trace-outputs',
      label: 'Diagnostic Outputs',
      tip: 'Dual-write diagnostics, snapshots, and screencast stream controls.',
    },
  ],
  'fetch-network': [
    {
      id: 'fetch-network-throughput',
      label: 'Core Throughput',
      tip: 'Fetch concurrency, scheduler pacing, and RPS/burst controls.',
    },
    {
      id: 'fetch-network-frontier',
      label: 'Frontier and Repair',
      tip: 'Frontier cooldown, dedupe, queue engine, and repair controls.',
    },
  ],
  'browser-rendering': [
    {
      id: 'browser-rendering-core',
      label: 'Browser Core',
      tip: 'Dynamic crawlee, headless mode, and page timeout controls.',
    },
    {
      id: 'browser-rendering-scroll',
      label: 'Scroll and Replay',
      tip: 'Auto-scroll, GraphQL replay, and robots compliance controls.',
    },
    {
      id: 'browser-rendering-screenshots',
      label: 'Screenshots',
      tip: 'Page screenshot capture format, quality, and selector controls.',
    },
  ],
  'parsing': [
    {
      id: 'parsing-pdf',
      label: 'PDF Processing',
      tip: 'PDF backend routing, page limits, and text preview controls.',
    },
    {
      id: 'parsing-article',
      label: 'Article Extraction',
      tip: 'Article extractor enablement, score, and char limit controls.',
    },
    {
      id: 'parsing-dom',
      label: 'Static DOM',
      tip: 'Static DOM extraction mode, threshold, and snippet controls.',
    },
    {
      id: 'parsing-metadata',
      label: 'Structured Metadata',
      tip: 'Extruct URL, timeout, caching, and item limit controls.',
    },
  ],
  ocr: [
    {
      id: 'ocr-activation',
      label: 'Activation',
      tip: 'OCR enablement, promotion policy, and backend selection controls.',
    },
    {
      id: 'ocr-thresholds',
      label: 'Sampling Thresholds',
      tip: 'OCR page/pair/quality thresholds for evidence promotion.',
    },
  ],
  'planner-triage': [
    { id: 'planner-triage-reranker', label: 'Reranker Policy', tip: 'SERP reranker weight map and deterministic scoring policy controls.' },
  ],
};
