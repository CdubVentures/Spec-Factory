import type { RuntimeStepId } from '../components/RuntimeFlowStepIcon';

export type { RuntimeStepId } from '../components/RuntimeFlowStepIcon';

export interface RuntimeStepEntry {
  id: RuntimeStepId;
  phase: string;
  label: string;
  tip: string;
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
] as const;

export const RUNTIME_STEPS: RuntimeStepEntry[] = [
  {
    id: 'run-setup',
    phase: '01',
    label: 'Run Setup',
    tip: 'Stages 01-07 discovery setup: NeedSet through SERP Selector.',
  },
  {
    id: 'run-output',
    phase: '01B',
    label: 'Runtime Outputs',
    tip: 'Artifact and export controls for Stage 13 output plus run persistence.',
  },
  {
    id: 'automation',
    phase: '02B',
    label: 'Automation',
    tip: 'Background control plane for category authority and resume operations.',
  },
  {
    id: 'observability-trace',
    phase: '02',
    label: 'Observability',
    tip: 'Cross-cutting trace, event, and screencast controls across stages 01-13.',
  },
  {
    id: 'fetch-network',
    phase: '03',
    label: 'Fetch and Network',
    tip: 'Stage 08 fetch-entry scheduling, pacing, cooldowns, and repair search.',
  },
  {
    id: 'browser-rendering',
    phase: '03B',
    label: 'Browser and Rendering',
    tip: 'Stage 08 browser fallback, replay, and screenshot capture.',
  },
  {
    id: 'parsing',
    phase: '03C',
    label: 'Storage',
    tip: 'Spec database directory and storage settings.',
  },
];

export const RUNTIME_SUB_STEPS: Record<RuntimeStepId, RuntimeSubStepEntry[]> = {
  'run-setup': [
    {
      id: 'run-setup-timeout',
      label: 'Run Timeout',
      tip: 'Maximum wall-clock time per product run. Enforced at scheduler, lifecycle, hypothesis, preflight, and repair phases.',
    },
    {
      id: 'run-setup-discovery',
      label: 'Discovery',
      tip: 'Phases 01-07. Search Planner is precomputed from NeedSet, Search Profile is the deterministic/fallback branch, and Query Journey chooses between them before search executes.',
    },
    {
      id: 'run-setup-budgets',
      label: 'URL Budgets',
      tip: 'Caps how many URLs and pages discovery can spend before the fetch handoff.',
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
      id: 'automation-helper',
      label: 'Category Authority',
      tip: 'Category-authority roots and configuration outside the stage graph.',
    },
    {
      id: 'automation-operations',
      label: 'Resume',
      tip: 'Resume infrastructure around the pipeline, including seed and persist limits.',
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
  'parsing': [],
};
