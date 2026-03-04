import { useMemo, useCallback, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { IndexingLlmConfigResponse } from '../indexing/types';
import { api } from '../../api/client';
import { Tip } from '../../components/common/Tip';
import {
  LLM_SETTING_LIMITS,
  RUNTIME_SETTING_DEFAULTS,
  SETTINGS_AUTOSAVE_DEBOUNCE_MS,
  type RuntimeAutomationQueueStorageEngine,
  type RuntimeRepairDedupeRule,
  type RuntimeSettingDefaults,
} from '../../stores/settingsManifest';
import {
  readRuntimeSettingsBootstrap,
  type RuntimeSettings,
} from '../../stores/runtimeSettingsAuthority';
import { useRuntimeSettingsEditorAdapter } from '../../stores/runtimeSettingsEditorAdapter';
import {
  clampTokenForModel as clampRuntimeTokenForModel,
  collectRuntimeSettingsPayload,
  parseRuntimeLlmTokenCap,
  type RuntimeModelTokenDefaultsResolver,
} from '../../stores/runtimeSettingsDomain';
import { useSettingsAuthorityStore } from '../../stores/settingsAuthorityStore';
import { useUiStore } from '../../stores/uiStore';
import { usePersistedTab } from '../../stores/tabStore';

const PROFILE_OPTIONS = ['fast', 'standard', 'thorough'] as const;
const SEARCH_PROVIDER_OPTIONS = ['none', 'duckduckgo', 'searxng', 'bing', 'google', 'dual'] as const;
const OCR_BACKEND_OPTIONS = ['auto', 'tesseract', 'none'] as const;
const RESUME_MODE_OPTIONS = ['auto', 'force_resume', 'start_over'] as const;
const REPAIR_DEDUPE_RULE_OPTIONS = ['domain_once', 'domain_and_status', 'none'] as const;
const AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS = ['sqlite', 'memory'] as const;

const RUNTIME_STEP_IDS = [
  'run-setup',
  'run-output',
  'run-intelligence',
  'observability-trace',
  'fetch-render',
  'ocr',
  'planner-triage',
  'role-routing',
  'fallback-routing',
] as const;

type RuntimeStepId = (typeof RUNTIME_STEP_IDS)[number];
type RuntimeDraft = Omit<RuntimeSettingDefaults, 'runtimeAutoSaveEnabled'>;

interface RuntimeStep {
  id: RuntimeStepId;
  phase: string;
  label: string;
  tip: string;
  options: readonly string[];
}

interface RuntimeSubStep {
  id: string;
  label: string;
  tip: string;
}

interface NumberBound {
  min: number;
  max: number;
  int?: boolean;
}

const RUNTIME_STEPS: RuntimeStep[] = [
  {
    id: 'run-setup',
    phase: '01',
    label: 'Run Setup',
    tip: 'Pipeline bootstrap profile, discovery, and resume policy.',
    options: [
      'Run Profile',
      'Discovery Enabled',
      'Search Provider',
      'SearXNG Base URL',
      'Bing Search Endpoint',
      'Google CSE CX',
      'DuckDuckGo Base URL',
      'DuckDuckGo Timeout (ms)',
      'Fetch Candidate Sources',
      'Discovery Max Queries',
      'Discovery Results / Query',
      'Discovery Max Discovered',
      'Discovery Query Concurrency',
      'Search Profile Caps Map (JSON)',
      'Manufacturer Broad Discovery',
      'Manufacturer Seed Search URLs',
      'Manufacturer Deep Research Enabled',
      'Max URLs / Product',
      'Max Candidate URLs',
      'Max Pages / Domain',
      'Uber Max URLs / Product',
      'Uber Max URLs / Domain',
      'Max Run Seconds',
      'Max JSON Bytes',
      'Max Manufacturer URLs / Product',
      'Max Manufacturer Pages / Domain',
      'Manufacturer Reserve URLs',
      'User Agent',
      'Self Improve Enabled',
      'Max Hypothesis Items',
      'Hypothesis Auto Followup Rounds',
      'Hypothesis Followup URLs / Round',
      'Learning Confidence Threshold',
      'Component Lexicon Decay Days',
      'Component Lexicon Expire Days',
      'Field Anchors Decay Days',
      'URL Memory Decay Days',
      'Disable Google CSE',
      'CSE Rescue Only Mode',
      'CSE Rescue Required Iteration',
      'DuckDuckGo Enabled',
      'Endpoint Signal Limit',
      'Endpoint Suggestion Limit',
      'Endpoint Network Scan Limit',
      'Resume Mode',
      'Resume Window (hours)',
      'Re-extract Indexed',
      'Re-extract Age (hours)',
      'Convergence Identity Fail-Fast Rounds',
      'Identity Gate Publish Threshold',
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
      'LLM Enabled',
      'LLM Write Summary',
      'LLM Provider',
      'LLM Base URL',
      'OpenAI API Key',
      'Anthropic API Key',
      'Runtime Control File',
      'LLM Plan Provider',
      'LLM Plan Base URL',
      'NeedSet Evidence Decay Days',
      'NeedSet Evidence Decay Floor',
      'NeedSet Required Weight (Identity)',
      'NeedSet Required Weight (Critical)',
      'NeedSet Required Weight (Required)',
      'NeedSet Required Weight (Expected)',
      'NeedSet Required Weight (Optional)',
      'NeedSet Missing Multiplier',
      'NeedSet Tier Deficit Multiplier',
      'NeedSet Min-Refs Deficit Multiplier',
      'NeedSet Conflict Multiplier',
      'NeedSet Identity Lock Threshold',
      'NeedSet Identity Provisional Threshold',
      'NeedSet Identity Audit Limit',
      'Identity Gate Base Match Threshold',
      'Identity Gate Easy Ambiguity Reduction',
      'Identity Gate Medium Ambiguity Reduction',
      'Identity Gate Hard Ambiguity Reduction',
      'Identity Gate Very Hard Ambiguity Increase',
      'Identity Gate Extra Hard Ambiguity Increase',
      'Identity Gate Missing Strong ID Penalty',
      'Quality Gate Identity Threshold',
      'Consensus Method Weight (Network JSON)',
      'Consensus Method Weight (Adapter API)',
      'Consensus Method Weight (Structured Metadata)',
      'Consensus Method Weight (PDF)',
      'Consensus Method Weight (Table/KV)',
      'Consensus Method Weight (DOM)',
      'Consensus Method Weight (LLM Extract Base)',
      'Consensus Policy Bonus',
      'Consensus Weighted Majority Threshold',
      'Consensus Strict Acceptance Domain Count',
      'Consensus Relaxed Acceptance Domain Count',
      'Consensus Instrumented Field Threshold',
      'Consensus Confidence Scoring Base',
      'Consensus Pass Target (Identity/Strong)',
      'Consensus Pass Target (Normal)',
      'Retrieval Tier Weight (Tier 1)',
      'Retrieval Tier Weight (Tier 2)',
      'Retrieval Tier Weight (Tier 3)',
      'Retrieval Tier Weight (Tier 4)',
      'Retrieval Tier Weight (Tier 5)',
      'Retrieval Doc Weight (Manual PDF)',
      'Retrieval Doc Weight (Spec PDF)',
      'Retrieval Doc Weight (Support)',
      'Retrieval Doc Weight (Lab Review)',
      'Retrieval Doc Weight (Product Page)',
      'Retrieval Doc Weight (Other)',
      'Retrieval Method Weight (Table)',
      'Retrieval Method Weight (KV)',
      'Retrieval Method Weight (JSON-LD)',
      'Retrieval Method Weight (LLM Extract)',
      'Retrieval Method Weight (Helper Supportive)',
      'Retrieval Anchor Score Per Match',
      'Retrieval Identity Score Per Match',
      'Retrieval Unit Match Bonus',
      'Retrieval Direct Field Match Bonus',
      'Retrieval Internals Map (JSON)',
      'Parsing Confidence Base Map (JSON)',
      'Identity Gate Hard + Missing ID Increase',
      'Identity Gate Very Hard + Missing ID Increase',
      'Identity Gate Extra Hard + Missing ID Increase',
      'Identity Gate Numeric Token Boost',
      'Identity Gate Numeric Range Threshold',
      'Identity Gate Threshold Bounds Map (JSON)',
      'Evidence Text Max Chars',
      'Evidence Pack Limits Map (JSON)',
      'LLM Extract Max Tokens',
      'LLM Extract Max Snippets/Batch',
      'LLM Extract Max Snippet Chars',
      'LLM Extract Skip Low Signal',
      'LLM Extract Reasoning Budget',
      'LLM Reasoning Mode',
      'LLM Reasoning Budget',
      'LLM Monthly Budget (USD)',
      'LLM Per-Product Budget (USD)',
      'LLM Max Calls / Round',
      'LLM Max Output Tokens',
      'LLM Verify Sample Rate',
      'Disable LLM Budget Guards',
      'LLM Max Batches/Product',
      'LLM Max Evidence Chars',
      'LLM Max Tokens',
      'LLM Timeout (ms)',
      'LLM Cost Input / 1M',
      'LLM Cost Output / 1M',
      'LLM Cost Cached Input / 1M',
      'LLM Verify Mode',
      'Batch Strategy',
      'Field Reward Half-Life (days)',
      'Allow Below Pass-Target Fill',
      'Drift Detection Enabled',
      'Drift Poll Seconds',
      'Drift Scan Max Products',
      'Drift Auto Republish',
      'Aggressive Mode Enabled',
      'Aggressive Confidence Threshold',
      'Aggressive Max Search Queries',
      'Aggressive Evidence Audit Enabled',
      'Aggressive Evidence Audit Batch Size',
      'Aggressive Max Time / Product (ms)',
      'Aggressive Thorough From Round',
      'Aggressive Round 1 Max URLs',
      'Aggressive Round 1 Max Candidate URLs',
      'Aggressive LLM Max Calls / Round',
      'Aggressive LLM Max Calls / Product',
      'Aggressive LLM Target Max Fields',
      'Aggressive LLM Discovery Passes',
      'Aggressive LLM Discovery Query Cap',
      'Uber Aggressive Enabled',
      'Uber Max Rounds',
      'CORTEX Enabled',
      'CORTEX Async Enabled',
      'CORTEX Base URL',
      'CORTEX API Key',
      'CORTEX Async Base URL',
      'CORTEX Async Submit Path',
      'CORTEX Async Status Path',
      'CORTEX Sync Timeout (ms)',
      'CORTEX Async Poll Interval (ms)',
      'CORTEX Async Max Wait (ms)',
      'CORTEX Ensure Ready Timeout (ms)',
      'CORTEX Start Ready Timeout (ms)',
      'CORTEX Failure Threshold',
      'CORTEX Circuit Open (ms)',
      'CORTEX Model Fast',
      'CORTEX Model Audit',
      'CORTEX Model DOM',
      'CORTEX Model Reasoning Deep',
      'CORTEX Model Vision',
      'CORTEX Model Search Fast',
      'CORTEX Model Rerank Fast',
      'CORTEX Model Search Deep',
      'CORTEX Auto Start',
      'CORTEX Auto Restart On Auth',
      'CORTEX Escalate Confidence <',
      'CORTEX Escalate If Conflict',
      'CORTEX Escalate Critical Only',
      'CORTEX Max Deep Fields / Product',
      'Helper Files Enabled',
      'Helper Files Root',
      'Indexing Helper Files Enabled',
      'Helper Supportive Enabled',
      'Helper Supportive Fill Missing',
      'Helper Supportive Max Sources',
      'Helper Auto Seed Targets',
      'Helper Active Sync Limit',
    ],
  },
  {
    id: 'run-output',
    phase: '01B',
    label: 'Runtime Outputs',
    tip: 'Output destinations, provider credentials, and planner/runtime endpoint overrides.',
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
      'LLM Enabled',
      'LLM Write Summary',
      'LLM Provider',
      'LLM Base URL',
      'OpenAI API Key',
      'Anthropic API Key',
      'Runtime Control File',
      'LLM Plan Provider',
      'LLM Plan Base URL',
    ],
  },
  {
    id: 'run-intelligence',
    phase: '01C',
    label: 'Consensus and Learning',
    tip: 'Consensus scoring, drift automation, aggressive mode, cortex, and helper-runtime policy.',
    options: [
      'NeedSet Evidence Decay Days',
      'NeedSet Required Weight (Identity)',
      'Consensus Method Weight (Network JSON)',
      'Consensus Weighted Majority Threshold',
      'Retrieval Tier Weight (Tier 1)',
      'Retrieval Method Weight (JSON-LD)',
      'Evidence Pack Limits Map (JSON)',
      'LLM Monthly Budget (USD)',
      'Drift Detection Enabled',
      'Aggressive Mode Enabled',
      'CORTEX Enabled',
      'Helper Files Enabled',
      'Indexing Helper Files Enabled',
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
      'Brain JSON Write',
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
    id: 'fetch-render',
    phase: '03',
    label: 'Fetch and Render',
    tip: 'Fetch throughput and dynamic-render retry policy.',
    options: [
      'Fetch Concurrency',
      'Per Host Min Delay (ms)',
      'Fetch Scheduler Enabled',
      'Fetch Scheduler Max Retries',
      'Fetch Scheduler Fallback Wait (ms)',
      'Fetch Scheduler Internals Map (JSON)',
      'Prefer HTTP Fetcher',
      'Page Goto Timeout (ms)',
      'Page Network Idle Timeout (ms)',
      'Post Load Wait (ms)',
      'Frontier DB Path',
      'Frontier SQLite Enabled',
      'Frontier Strip Tracking Params',
      'Frontier Query Cooldown (sec)',
      'Frontier Cooldown 404 (sec)',
      'Frontier Cooldown 404 Repeat (sec)',
      'Frontier Cooldown 410 (sec)',
      'Frontier Cooldown Timeout (sec)',
      'Frontier Cooldown 403 Base (sec)',
      'Frontier Cooldown 429 Base (sec)',
      'Frontier Backoff Max Exponent',
      'Frontier Path Penalty Not-Found Threshold',
      'Frontier Blocked Domain Threshold',
      'Frontier Repair Search Enabled',
      'Repair Dedupe Rule',
      'Automation Queue Storage Engine',
      'Auto Scroll Enabled',
      'Auto Scroll Passes',
      'Auto Scroll Delay (ms)',
      'GraphQL Replay Enabled',
      'Max GraphQL Replays',
      'Max Network Responses / Page',
      'Robots.txt Compliant',
      'Robots.txt Timeout (ms)',
      'Dynamic Crawlee Enabled',
      'Crawlee Headless',
      'Crawlee Request Timeout (sec)',
      'Dynamic Retry Budget',
      'Dynamic Retry Backoff (ms)',
      'Dynamic Fetch Policy Map (JSON)',
      'Max PDF Bytes',
      'PDF Router Enabled',
      'PDF Preferred Backend',
      'PDF Router Timeout (ms)',
      'PDF Router Max Pages',
      'PDF Router Max Pairs',
      'PDF Router Max Text Preview Chars',
      'Capture Page Screenshot Enabled',
      'Capture Screenshot Format',
      'Capture Screenshot Quality',
      'Capture Screenshot Max Bytes',
      'Capture Screenshot Selectors',
      'Runtime Capture Screenshots',
      'Runtime Screenshot Mode',
      'Article Extractor V2 Enabled',
      'Article Extractor Min Chars',
      'Article Extractor Min Score',
      'Article Extractor Max Chars',
      'Article Extractor Domain Policy Map (JSON)',
      'HTML Table Extractor V2',
      'Static DOM Extractor Enabled',
      'Static DOM Mode',
      'Static DOM Target Match Threshold',
      'Static DOM Max Evidence Snippets',
      'Structured Metadata Extruct Enabled',
      'Structured Metadata Extruct URL',
      'Structured Metadata Extruct Timeout (ms)',
      'Structured Metadata Extruct Max Items / Surface',
      'Structured Metadata Extruct Cache Enabled',
      'Structured Metadata Extruct Cache Limit',
      'DOM Snippet Max Chars',
      'Spec DB Dir',
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
    label: 'Planner and Triage',
    tip: 'Planner and triage LLM lanes used before extraction.',
    options: [
      'Planner Enabled',
      'Planner Model',
      'Planner Token Cap',
      'Triage Enabled',
      'Triage Model',
      'Triage Token Cap',
      'SERP Reranker Weight Map (JSON)',
    ],
  },
  {
    id: 'role-routing',
    phase: '06',
    label: 'Role Routing',
    tip: 'Primary model/token routing for fast, reasoning, extract, validate, write.',
    options: [
      'Fast Model',
      'Fast Token Cap',
      'Reasoning Model',
      'Reasoning Token Cap',
      'Extract Model',
      'Extract Token Cap',
      'Validate Model',
      'Validate Token Cap',
      'Write Model',
      'Write Token Cap',
    ],
  },
  {
    id: 'fallback-routing',
    phase: '07',
    label: 'Fallback Routing',
    tip: 'Fallback route models/tokens used when primary lanes fail.',
    options: [
      'Fallback Enabled',
      'Plan Fallback Model',
      'Plan Fallback Token Cap',
      'LLM Plan API Key',
      'LLM Extraction Cache Enabled',
      'LLM Extraction Cache Dir',
      'LLM Extraction Cache TTL (ms)',
      'LLM Max Calls / Product Total',
      'LLM Max Calls / Product Fast',
      'Bing Search Key',
      'Google CSE Key',
      'Extract Fallback Model',
      'Extract Fallback Token Cap',
      'Validate Fallback Model',
      'Validate Fallback Token Cap',
      'Write Fallback Model',
      'Write Fallback Token Cap',
    ],
  },
];

const RUNTIME_SUB_STEPS: Record<RuntimeStepId, RuntimeSubStep[]> = {
  'run-setup': [
    {
      id: 'run-setup-discovery',
      label: 'Discovery and Policy',
      tip: 'Run profile, providers, discovery caps, and endpoint policy controls.',
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
    {
      id: 'run-output-providers',
      label: 'Provider and Runtime Keys',
      tip: 'Runtime provider endpoints, API keys, and planner endpoint overrides.',
    },
  ],
  'run-intelligence': [
    {
      id: 'run-intelligence-consensus',
      label: 'Consensus Core',
      tip: 'NeedSet, identity gate, consensus math, retrieval and evidence controls.',
    },
    {
      id: 'run-intelligence-drift',
      label: 'Drift Watcher',
      tip: 'Continuous drift detection and republish automation controls.',
    },
    {
      id: 'run-intelligence-aggressive',
      label: 'Aggressive and Cortex',
      tip: 'Aggressive mode and CORTEX orchestration controls.',
    },
    {
      id: 'run-intelligence-helper',
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
  'fetch-render': [
    {
      id: 'fetch-render-core',
      label: 'Core Throughput',
      tip: 'Fetch concurrency, scheduler pacing, and baseline browser timings.',
    },
    {
      id: 'fetch-render-frontier',
      label: 'Frontier and Repair',
      tip: 'Frontier cooldown, dedupe, queue engine, and repair controls.',
    },
    {
      id: 'fetch-render-replay',
      label: 'Render and Replay',
      tip: 'Auto-scroll, replay capture, and robots compliance controls.',
    },
    {
      id: 'fetch-render-dynamic',
      label: 'Dynamic Fallback',
      tip: 'Browser-based dynamic retry policy and host policy map.',
    },
    {
      id: 'fetch-render-parsing',
      label: 'Parsing and Screenshot',
      tip: 'PDF, screenshot, visual asset, and extraction parser controls.',
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
    {
      id: 'planner-triage-planner',
      label: 'Planner Lane',
      tip: 'Planner lane enablement, model, and token controls.',
    },
    {
      id: 'planner-triage-triage',
      label: 'Triage Lane',
      tip: 'Triage lane enablement, model, and token controls.',
    },
    {
      id: 'planner-triage-reranker',
      label: 'Reranker Policy',
      tip: 'SERP reranker weight map and deterministic scoring policy controls.',
    },
  ],
  'role-routing': [
    {
      id: 'role-routing-fast-reasoning',
      label: 'Fast and Reasoning',
      tip: 'Primary model/token routing for fast and reasoning lanes.',
    },
    {
      id: 'role-routing-extract-validate',
      label: 'Extract and Validate',
      tip: 'Primary model/token routing for extract and validate lanes.',
    },
    {
      id: 'role-routing-write',
      label: 'Write Lane',
      tip: 'Primary model/token routing for the write lane.',
    },
  ],
  'fallback-routing': [
    {
      id: 'fallback-routing-master',
      label: 'Fallback Master',
      tip: 'Global fallback routing enable/disable control.',
    },
    {
      id: 'fallback-routing-provider',
      label: 'Provider and Cache',
      tip: 'Fallback provider keys and extraction cache policy.',
    },
    {
      id: 'fallback-routing-lanes',
      label: 'Fallback Lanes',
      tip: 'Per-lane fallback model/token routes.',
    },
  ],
};

const RUNTIME_NUMBER_BOUNDS: Record<
  | 'fetchConcurrency'
  | 'perHostMinDelayMs'
  | 'crawleeRequestHandlerTimeoutSecs'
  | 'dynamicFetchRetryBudget'
  | 'dynamicFetchRetryBackoffMs'
  | 'fetchSchedulerMaxRetries'
  | 'fetchSchedulerFallbackWaitMs'
  | 'pageGotoTimeoutMs'
  | 'pageNetworkIdleTimeoutMs'
  | 'postLoadWaitMs'
  | 'frontierQueryCooldownSeconds'
  | 'frontierCooldown404Seconds'
  | 'frontierCooldown404RepeatSeconds'
  | 'frontierCooldown410Seconds'
  | 'frontierCooldownTimeoutSeconds'
  | 'frontierCooldown403BaseSeconds'
  | 'frontierCooldown429BaseSeconds'
  | 'frontierBackoffMaxExponent'
  | 'frontierPathPenaltyNotfoundThreshold'
  | 'frontierBlockedDomainThreshold'
  | 'autoScrollPasses'
  | 'autoScrollDelayMs'
  | 'maxGraphqlReplays'
  | 'maxNetworkResponsesPerPage'
  | 'robotsTxtTimeoutMs'
  | 'runtimeScreencastFps'
  | 'runtimeScreencastQuality'
  | 'runtimeScreencastMaxWidth'
  | 'runtimeScreencastMaxHeight'
  | 'endpointSignalLimit'
  | 'endpointSuggestionLimit'
  | 'endpointNetworkScanLimit'
  | 'discoveryMaxQueries'
  | 'discoveryResultsPerQuery'
  | 'discoveryMaxDiscovered'
  | 'discoveryQueryConcurrency'
  | 'maxUrlsPerProduct'
  | 'maxCandidateUrls'
  | 'maxPagesPerDomain'
  | 'uberMaxUrlsPerProduct'
  | 'uberMaxUrlsPerDomain'
  | 'maxRunSeconds'
  | 'maxJsonBytes'
  | 'maxPdfBytes'
  | 'pdfBackendRouterTimeoutMs'
  | 'pdfBackendRouterMaxPages'
  | 'pdfBackendRouterMaxPairs'
  | 'pdfBackendRouterMaxTextPreviewChars'
  | 'capturePageScreenshotQuality'
  | 'capturePageScreenshotMaxBytes'
  | 'visualAssetCaptureMaxPerSource'
  | 'visualAssetRetentionDays'
  | 'visualAssetReviewLgMaxSide'
  | 'visualAssetReviewSmMaxSide'
  | 'visualAssetReviewLgQuality'
  | 'visualAssetReviewSmQuality'
  | 'visualAssetRegionCropMaxSide'
  | 'visualAssetRegionCropQuality'
  | 'visualAssetLlmMaxBytes'
  | 'visualAssetMinWidth'
  | 'visualAssetMinHeight'
  | 'visualAssetMinSharpness'
  | 'visualAssetMinEntropy'
  | 'visualAssetMaxPhashDistance'
  | 'articleExtractorMinChars'
  | 'articleExtractorMinScore'
  | 'articleExtractorMaxChars'
  | 'staticDomTargetMatchThreshold'
  | 'staticDomMaxEvidenceSnippets'
  | 'structuredMetadataExtructTimeoutMs'
  | 'structuredMetadataExtructMaxItemsPerSurface'
  | 'structuredMetadataExtructCacheLimit'
  | 'domSnippetMaxChars'
  | 'llmExtractionCacheTtlMs'
  | 'llmMaxCallsPerProductTotal'
  | 'llmMaxCallsPerProductFast'
  | 'needsetEvidenceDecayDays'
  | 'needsetEvidenceDecayFloor'
  | 'needsetRequiredWeightIdentity'
  | 'needsetRequiredWeightCritical'
  | 'needsetRequiredWeightRequired'
  | 'needsetRequiredWeightExpected'
  | 'needsetRequiredWeightOptional'
  | 'needsetMissingMultiplier'
  | 'needsetTierDeficitMultiplier'
  | 'needsetMinRefsDeficitMultiplier'
  | 'needsetConflictMultiplier'
  | 'needsetIdentityLockThreshold'
  | 'needsetIdentityProvisionalThreshold'
  | 'needsetDefaultIdentityAuditLimit'
  | 'consensusMethodWeightNetworkJson'
  | 'consensusMethodWeightAdapterApi'
  | 'consensusMethodWeightStructuredMeta'
  | 'consensusMethodWeightPdf'
  | 'consensusMethodWeightTableKv'
  | 'consensusMethodWeightDom'
  | 'consensusMethodWeightLlmExtractBase'
  | 'consensusPolicyBonus'
  | 'consensusWeightedMajorityThreshold'
  | 'consensusStrictAcceptanceDomainCount'
  | 'consensusRelaxedAcceptanceDomainCount'
  | 'consensusInstrumentedFieldThreshold'
  | 'consensusConfidenceScoringBase'
  | 'consensusPassTargetIdentityStrong'
  | 'consensusPassTargetNormal'
  | 'retrievalTierWeightTier1'
  | 'retrievalTierWeightTier2'
  | 'retrievalTierWeightTier3'
  | 'retrievalTierWeightTier4'
  | 'retrievalTierWeightTier5'
  | 'retrievalDocKindWeightManualPdf'
  | 'retrievalDocKindWeightSpecPdf'
  | 'retrievalDocKindWeightSupport'
  | 'retrievalDocKindWeightLabReview'
  | 'retrievalDocKindWeightProductPage'
  | 'retrievalDocKindWeightOther'
  | 'retrievalMethodWeightTable'
  | 'retrievalMethodWeightKv'
  | 'retrievalMethodWeightJsonLd'
  | 'retrievalMethodWeightLlmExtract'
  | 'retrievalMethodWeightHelperSupportive'
  | 'retrievalAnchorScorePerMatch'
  | 'retrievalIdentityScorePerMatch'
  | 'retrievalUnitMatchBonus'
  | 'retrievalDirectFieldMatchBonus'
  | 'identityGateBaseMatchThreshold'
  | 'identityGateEasyAmbiguityReduction'
  | 'identityGateMediumAmbiguityReduction'
  | 'identityGateHardAmbiguityReduction'
  | 'identityGateVeryHardAmbiguityIncrease'
  | 'identityGateExtraHardAmbiguityIncrease'
  | 'identityGateMissingStrongIdPenalty'
  | 'identityGateHardMissingStrongIdIncrease'
  | 'identityGateVeryHardMissingStrongIdIncrease'
  | 'identityGateExtraHardMissingStrongIdIncrease'
  | 'identityGateNumericTokenBoost'
  | 'identityGateNumericRangeThreshold'
  | 'qualityGateIdentityThreshold'
  | 'evidenceTextMaxChars'
  | 'llmExtractMaxTokens'
  | 'llmExtractMaxSnippetsPerBatch'
  | 'llmExtractMaxSnippetChars'
  | 'llmExtractReasoningBudget'
  | 'llmReasoningBudget'
  | 'llmMonthlyBudgetUsd'
  | 'llmPerProductBudgetUsd'
  | 'llmMaxCallsPerRound'
  | 'llmMaxOutputTokens'
  | 'llmVerifySampleRate'
  | 'llmMaxBatchesPerProduct'
  | 'llmMaxEvidenceChars'
  | 'llmMaxTokens'
  | 'llmTimeoutMs'
  | 'llmCostInputPer1M'
  | 'llmCostOutputPer1M'
  | 'llmCostCachedInputPer1M'
  | 'maxManufacturerUrlsPerProduct'
  | 'maxManufacturerPagesPerDomain'
  | 'manufacturerReserveUrls'
  | 'maxHypothesisItems'
  | 'hypothesisAutoFollowupRounds'
  | 'hypothesisFollowupUrlsPerRound'
  | 'learningConfidenceThreshold'
  | 'componentLexiconDecayDays'
  | 'componentLexiconExpireDays'
  | 'fieldAnchorsDecayDays'
  | 'urlMemoryDecayDays'
  | 'cseRescueRequiredIteration'
  | 'duckduckgoTimeoutMs'
  | 'runtimeTraceFetchRing'
  | 'runtimeTraceLlmRing'
  | 'daemonConcurrency'
  | 'daemonGracefulShutdownTimeoutMs'
  | 'importsPollSeconds'
  | 'convergenceIdentityFailFastRounds'
  | 'identityGatePublishThreshold'
  | 'indexingResumeSeedLimit'
  | 'indexingResumePersistLimit'
  | 'helperSupportiveMaxSources'
  | 'helperActiveSyncLimit'
  | 'fieldRewardHalfLifeDays'
  | 'driftPollSeconds'
  | 'driftScanMaxProducts'
  | 'reCrawlStaleAfterDays'
  | 'aggressiveConfidenceThreshold'
  | 'aggressiveMaxSearchQueries'
  | 'aggressiveEvidenceAuditBatchSize'
  | 'aggressiveMaxTimePerProductMs'
  | 'aggressiveThoroughFromRound'
  | 'aggressiveRound1MaxUrls'
  | 'aggressiveRound1MaxCandidateUrls'
  | 'aggressiveLlmMaxCallsPerRound'
  | 'aggressiveLlmMaxCallsPerProductTotal'
  | 'aggressiveLlmTargetMaxFields'
  | 'aggressiveLlmDiscoveryPasses'
  | 'aggressiveLlmDiscoveryQueryCap'
  | 'uberMaxRounds'
  | 'cortexSyncTimeoutMs'
  | 'cortexAsyncPollIntervalMs'
  | 'cortexAsyncMaxWaitMs'
  | 'cortexEnsureReadyTimeoutMs'
  | 'cortexStartReadyTimeoutMs'
  | 'cortexFailureThreshold'
  | 'cortexCircuitOpenMs'
  | 'cortexEscalateConfidenceLt'
  | 'cortexMaxDeepFieldsPerProduct'
  | 'scannedPdfOcrMaxPages'
  | 'scannedPdfOcrMaxPairs'
  | 'scannedPdfOcrMinCharsPerPage'
  | 'scannedPdfOcrMinLinesPerPage'
  | 'scannedPdfOcrMinConfidence'
  | 'resumeWindowHours'
  | 'reextractAfterHours',
  NumberBound
> = {
  fetchConcurrency: { min: 1, max: 128, int: true },
  perHostMinDelayMs: { min: 0, max: 120_000, int: true },
  crawleeRequestHandlerTimeoutSecs: { min: 0, max: 300, int: true },
  dynamicFetchRetryBudget: { min: 0, max: 30, int: true },
  dynamicFetchRetryBackoffMs: { min: 0, max: 120_000, int: true },
  fetchSchedulerMaxRetries: { min: 0, max: 20, int: true },
  fetchSchedulerFallbackWaitMs: { min: 0, max: 600_000, int: true },
  pageGotoTimeoutMs: { min: 0, max: 120_000, int: true },
  pageNetworkIdleTimeoutMs: { min: 0, max: 60_000, int: true },
  postLoadWaitMs: { min: 0, max: 60_000, int: true },
  frontierQueryCooldownSeconds: { min: 0, max: 31_536_000, int: true },
  frontierCooldown404Seconds: { min: 0, max: 31_536_000, int: true },
  frontierCooldown404RepeatSeconds: { min: 0, max: 31_536_000, int: true },
  frontierCooldown410Seconds: { min: 0, max: 31_536_000, int: true },
  frontierCooldownTimeoutSeconds: { min: 0, max: 31_536_000, int: true },
  frontierCooldown403BaseSeconds: { min: 0, max: 86_400, int: true },
  frontierCooldown429BaseSeconds: { min: 0, max: 86_400, int: true },
  frontierBackoffMaxExponent: { min: 1, max: 12, int: true },
  frontierPathPenaltyNotfoundThreshold: { min: 1, max: 50, int: true },
  frontierBlockedDomainThreshold: { min: 1, max: 50, int: true },
  autoScrollPasses: { min: 0, max: 20, int: true },
  autoScrollDelayMs: { min: 0, max: 10_000, int: true },
  maxGraphqlReplays: { min: 0, max: 20, int: true },
  maxNetworkResponsesPerPage: { min: 100, max: 10_000, int: true },
  robotsTxtTimeoutMs: { min: 100, max: 120_000, int: true },
  runtimeScreencastFps: { min: 1, max: 60, int: true },
  runtimeScreencastQuality: { min: 10, max: 100, int: true },
  runtimeScreencastMaxWidth: { min: 320, max: 3840, int: true },
  runtimeScreencastMaxHeight: { min: 240, max: 2160, int: true },
  convergenceIdentityFailFastRounds: { min: 1, max: 12, int: true },
  identityGatePublishThreshold: { min: 0, max: 1 },
  helperSupportiveMaxSources: { min: 0, max: 100, int: true },
  helperActiveSyncLimit: { min: 0, max: 5000, int: true },
  fieldRewardHalfLifeDays: { min: 1, max: 365, int: true },
  driftPollSeconds: { min: 60, max: 604_800, int: true },
  driftScanMaxProducts: { min: 1, max: 10_000, int: true },
  aggressiveConfidenceThreshold: { min: 0, max: 1 },
  aggressiveMaxSearchQueries: { min: 1, max: 100, int: true },
  aggressiveEvidenceAuditBatchSize: { min: 1, max: 500, int: true },
  aggressiveMaxTimePerProductMs: { min: 1000, max: 3_600_000, int: true },
  aggressiveThoroughFromRound: { min: 1, max: 12, int: true },
  aggressiveRound1MaxUrls: { min: 1, max: 2000, int: true },
  aggressiveRound1MaxCandidateUrls: { min: 1, max: 5000, int: true },
  aggressiveLlmMaxCallsPerRound: { min: 1, max: 200, int: true },
  aggressiveLlmMaxCallsPerProductTotal: { min: 1, max: 500, int: true },
  aggressiveLlmTargetMaxFields: { min: 1, max: 500, int: true },
  aggressiveLlmDiscoveryPasses: { min: 1, max: 12, int: true },
  aggressiveLlmDiscoveryQueryCap: { min: 1, max: 200, int: true },
  uberMaxRounds: { min: 1, max: 12, int: true },
  cortexSyncTimeoutMs: { min: 1000, max: 600_000, int: true },
  cortexAsyncPollIntervalMs: { min: 250, max: 120_000, int: true },
  cortexAsyncMaxWaitMs: { min: 1000, max: 3_600_000, int: true },
  cortexEnsureReadyTimeoutMs: { min: 1000, max: 300_000, int: true },
  cortexStartReadyTimeoutMs: { min: 1000, max: 300_000, int: true },
  cortexFailureThreshold: { min: 1, max: 20, int: true },
  cortexCircuitOpenMs: { min: 1000, max: 600_000, int: true },
  cortexEscalateConfidenceLt: { min: 0, max: 1 },
  cortexMaxDeepFieldsPerProduct: { min: 1, max: 200, int: true },
  endpointSignalLimit: { min: 1, max: 500, int: true },
  endpointSuggestionLimit: { min: 1, max: 200, int: true },
  endpointNetworkScanLimit: { min: 50, max: 10_000, int: true },
  discoveryMaxQueries: { min: 1, max: 100, int: true },
  discoveryResultsPerQuery: { min: 1, max: 100, int: true },
  discoveryMaxDiscovered: { min: 1, max: 2000, int: true },
  discoveryQueryConcurrency: { min: 1, max: 64, int: true },
  maxUrlsPerProduct: { min: 1, max: 1000, int: true },
  maxCandidateUrls: { min: 1, max: 5000, int: true },
  maxPagesPerDomain: { min: 1, max: 100, int: true },
  uberMaxUrlsPerProduct: { min: 1, max: 2000, int: true },
  uberMaxUrlsPerDomain: { min: 1, max: 100, int: true },
  maxRunSeconds: { min: 30, max: 86_400, int: true },
  maxJsonBytes: { min: 1024, max: 100_000_000, int: true },
  maxPdfBytes: { min: 1024, max: 100_000_000, int: true },
  pdfBackendRouterTimeoutMs: { min: 1000, max: 600_000, int: true },
  pdfBackendRouterMaxPages: { min: 1, max: 1000, int: true },
  pdfBackendRouterMaxPairs: { min: 1, max: 100_000, int: true },
  pdfBackendRouterMaxTextPreviewChars: { min: 256, max: 200_000, int: true },
  capturePageScreenshotQuality: { min: 1, max: 100, int: true },
  capturePageScreenshotMaxBytes: { min: 1024, max: 100_000_000, int: true },
  visualAssetCaptureMaxPerSource: { min: 1, max: 100, int: true },
  visualAssetRetentionDays: { min: 1, max: 3650, int: true },
  visualAssetReviewLgMaxSide: { min: 128, max: 4096, int: true },
  visualAssetReviewSmMaxSide: { min: 128, max: 4096, int: true },
  visualAssetReviewLgQuality: { min: 1, max: 100, int: true },
  visualAssetReviewSmQuality: { min: 1, max: 100, int: true },
  visualAssetRegionCropMaxSide: { min: 128, max: 4096, int: true },
  visualAssetRegionCropQuality: { min: 1, max: 100, int: true },
  visualAssetLlmMaxBytes: { min: 1024, max: 100_000_000, int: true },
  visualAssetMinWidth: { min: 1, max: 10_000, int: true },
  visualAssetMinHeight: { min: 1, max: 10_000, int: true },
  visualAssetMinSharpness: { min: 0, max: 1000 },
  visualAssetMinEntropy: { min: 0, max: 100 },
  visualAssetMaxPhashDistance: { min: 0, max: 128, int: true },
  articleExtractorMinChars: { min: 50, max: 200_000, int: true },
  articleExtractorMinScore: { min: 1, max: 100, int: true },
  articleExtractorMaxChars: { min: 256, max: 500_000, int: true },
  staticDomTargetMatchThreshold: { min: 0, max: 1 },
  staticDomMaxEvidenceSnippets: { min: 10, max: 500, int: true },
  structuredMetadataExtructTimeoutMs: { min: 250, max: 15_000, int: true },
  structuredMetadataExtructMaxItemsPerSurface: { min: 1, max: 1000, int: true },
  structuredMetadataExtructCacheLimit: { min: 32, max: 5000, int: true },
  domSnippetMaxChars: { min: 600, max: 20_000, int: true },
  llmExtractionCacheTtlMs: { min: 60_000, max: 31_536_000_000, int: true },
  llmMaxCallsPerProductTotal: { min: 1, max: 100, int: true },
  llmMaxCallsPerProductFast: { min: 0, max: 100, int: true },
  needsetEvidenceDecayDays: { min: 1, max: 90, int: true },
  needsetEvidenceDecayFloor: { min: 0, max: 0.9 },
  needsetRequiredWeightIdentity: { min: 0.1, max: 100 },
  needsetRequiredWeightCritical: { min: 0.1, max: 100 },
  needsetRequiredWeightRequired: { min: 0.1, max: 100 },
  needsetRequiredWeightExpected: { min: 0.1, max: 100 },
  needsetRequiredWeightOptional: { min: 0.1, max: 100 },
  needsetMissingMultiplier: { min: 0.1, max: 100 },
  needsetTierDeficitMultiplier: { min: 0.1, max: 100 },
  needsetMinRefsDeficitMultiplier: { min: 0.1, max: 100 },
  needsetConflictMultiplier: { min: 0.1, max: 100 },
  needsetIdentityLockThreshold: { min: 0, max: 1 },
  needsetIdentityProvisionalThreshold: { min: 0, max: 1 },
  needsetDefaultIdentityAuditLimit: { min: 1, max: 200, int: true },
  consensusMethodWeightNetworkJson: { min: 0, max: 2 },
  consensusMethodWeightAdapterApi: { min: 0, max: 2 },
  consensusMethodWeightStructuredMeta: { min: 0, max: 2 },
  consensusMethodWeightPdf: { min: 0, max: 2 },
  consensusMethodWeightTableKv: { min: 0, max: 2 },
  consensusMethodWeightDom: { min: 0, max: 2 },
  consensusMethodWeightLlmExtractBase: { min: 0, max: 2 },
  consensusPolicyBonus: { min: -5, max: 5 },
  consensusWeightedMajorityThreshold: { min: 1, max: 10 },
  consensusStrictAcceptanceDomainCount: { min: 1, max: 50, int: true },
  consensusRelaxedAcceptanceDomainCount: { min: 1, max: 50, int: true },
  consensusInstrumentedFieldThreshold: { min: 1, max: 50, int: true },
  consensusConfidenceScoringBase: { min: 0, max: 1 },
  consensusPassTargetIdentityStrong: { min: 1, max: 50, int: true },
  consensusPassTargetNormal: { min: 1, max: 50, int: true },
  retrievalTierWeightTier1: { min: 0, max: 10 },
  retrievalTierWeightTier2: { min: 0, max: 10 },
  retrievalTierWeightTier3: { min: 0, max: 10 },
  retrievalTierWeightTier4: { min: 0, max: 10 },
  retrievalTierWeightTier5: { min: 0, max: 10 },
  retrievalDocKindWeightManualPdf: { min: 0, max: 10 },
  retrievalDocKindWeightSpecPdf: { min: 0, max: 10 },
  retrievalDocKindWeightSupport: { min: 0, max: 10 },
  retrievalDocKindWeightLabReview: { min: 0, max: 10 },
  retrievalDocKindWeightProductPage: { min: 0, max: 10 },
  retrievalDocKindWeightOther: { min: 0, max: 10 },
  retrievalMethodWeightTable: { min: 0, max: 10 },
  retrievalMethodWeightKv: { min: 0, max: 10 },
  retrievalMethodWeightJsonLd: { min: 0, max: 10 },
  retrievalMethodWeightLlmExtract: { min: 0, max: 10 },
  retrievalMethodWeightHelperSupportive: { min: 0, max: 10 },
  retrievalAnchorScorePerMatch: { min: 0, max: 2 },
  retrievalIdentityScorePerMatch: { min: 0, max: 2 },
  retrievalUnitMatchBonus: { min: 0, max: 2 },
  retrievalDirectFieldMatchBonus: { min: 0, max: 2 },
  identityGateBaseMatchThreshold: { min: 0, max: 1 },
  identityGateEasyAmbiguityReduction: { min: -1, max: 1 },
  identityGateMediumAmbiguityReduction: { min: -1, max: 1 },
  identityGateHardAmbiguityReduction: { min: -1, max: 1 },
  identityGateVeryHardAmbiguityIncrease: { min: -1, max: 1 },
  identityGateExtraHardAmbiguityIncrease: { min: -1, max: 1 },
  identityGateMissingStrongIdPenalty: { min: -1, max: 1 },
  identityGateHardMissingStrongIdIncrease: { min: -1, max: 1 },
  identityGateVeryHardMissingStrongIdIncrease: { min: -1, max: 1 },
  identityGateExtraHardMissingStrongIdIncrease: { min: -1, max: 1 },
  identityGateNumericTokenBoost: { min: -1, max: 1 },
  identityGateNumericRangeThreshold: { min: 0, max: 500, int: true },
  qualityGateIdentityThreshold: { min: 0, max: 1 },
  evidenceTextMaxChars: { min: 200, max: 200_000, int: true },
  llmExtractMaxTokens: { min: 128, max: 262_144, int: true },
  llmExtractMaxSnippetsPerBatch: { min: 1, max: 50, int: true },
  llmExtractMaxSnippetChars: { min: 100, max: 200_000, int: true },
  llmExtractReasoningBudget: { min: 128, max: 262_144, int: true },
  llmReasoningBudget: { min: 128, max: 262_144, int: true },
  llmMonthlyBudgetUsd: { min: 0, max: 100_000 },
  llmPerProductBudgetUsd: { min: 0, max: 1000 },
  llmMaxCallsPerRound: { min: 1, max: 200, int: true },
  llmMaxOutputTokens: { min: 128, max: 262_144, int: true },
  llmVerifySampleRate: { min: 1, max: 1000, int: true },
  llmMaxBatchesPerProduct: { min: 1, max: 100, int: true },
  llmMaxEvidenceChars: { min: 1000, max: 500_000, int: true },
  llmMaxTokens: { min: 128, max: 262_144, int: true },
  llmTimeoutMs: { min: 1000, max: 600_000, int: true },
  llmCostInputPer1M: { min: 0, max: 1000 },
  llmCostOutputPer1M: { min: 0, max: 1000 },
  llmCostCachedInputPer1M: { min: 0, max: 1000 },
  maxManufacturerUrlsPerProduct: { min: 1, max: 1000, int: true },
  maxManufacturerPagesPerDomain: { min: 1, max: 200, int: true },
  manufacturerReserveUrls: { min: 0, max: 1000, int: true },
  maxHypothesisItems: { min: 1, max: 1000, int: true },
  hypothesisAutoFollowupRounds: { min: 0, max: 10, int: true },
  hypothesisFollowupUrlsPerRound: { min: 1, max: 200, int: true },
  learningConfidenceThreshold: { min: 0, max: 1 },
  componentLexiconDecayDays: { min: 1, max: 3650, int: true },
  componentLexiconExpireDays: { min: 1, max: 3650, int: true },
  fieldAnchorsDecayDays: { min: 1, max: 3650, int: true },
  urlMemoryDecayDays: { min: 1, max: 3650, int: true },
  cseRescueRequiredIteration: { min: 1, max: 12, int: true },
  duckduckgoTimeoutMs: { min: 250, max: 120_000, int: true },
  runtimeTraceFetchRing: { min: 10, max: 2000, int: true },
  runtimeTraceLlmRing: { min: 10, max: 2000, int: true },
  daemonConcurrency: { min: 1, max: 128, int: true },
  daemonGracefulShutdownTimeoutMs: { min: 1000, max: 600_000, int: true },
  importsPollSeconds: { min: 1, max: 3600, int: true },
  indexingResumeSeedLimit: { min: 1, max: 10_000, int: true },
  indexingResumePersistLimit: { min: 1, max: 100_000, int: true },
  scannedPdfOcrMaxPages: { min: 1, max: 500, int: true },
  scannedPdfOcrMaxPairs: { min: 1, max: 500, int: true },
  scannedPdfOcrMinCharsPerPage: { min: 0, max: 50_000, int: true },
  scannedPdfOcrMinLinesPerPage: { min: 0, max: 10_000, int: true },
  scannedPdfOcrMinConfidence: { min: 0, max: 1 },
  resumeWindowHours: { min: 0, max: 8_760, int: true },
  reextractAfterHours: { min: 0, max: 8_760, int: true },
  reCrawlStaleAfterDays: { min: 1, max: 3650, int: true },
};

function toRuntimeDraft(defaults: RuntimeSettingDefaults): RuntimeDraft {
  const { runtimeAutoSaveEnabled: _runtimeAutoSaveEnabled, ...draft } = defaults;
  return draft;
}

function runtimeDraftEqual(a: RuntimeDraft, b: RuntimeDraft) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeToken(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function parseBoundedNumber(value: unknown, fallback: number, bounds: NumberBound): number {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  const clamped = Math.min(bounds.max, Math.max(bounds.min, parsed));
  return bounds.int ? Math.round(clamped) : clamped;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === 0 || value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return fallback;
}

function parseString(value: unknown, fallback: string, allowEmpty = false): string {
  if (typeof value !== 'string') return fallback;
  if (allowEmpty) return value;
  const token = value.trim();
  return token || fallback;
}

function parseEnum<T extends readonly string[]>(
  value: unknown,
  options: T,
  fallback: T[number],
): T[number] {
  const token = String(value || '').trim();
  if (!token) return fallback;
  return options.includes(token as T[number]) ? (token as T[number]) : fallback;
}

function normalizeRuntimeDraft(
  source: RuntimeSettings | undefined,
  fallback: RuntimeSettingDefaults,
): RuntimeDraft {
  const raw = source || {};
  return {
    runProfile: parseEnum(raw.runProfile ?? raw.profile, PROFILE_OPTIONS, fallback.runProfile),
    profile: parseEnum(raw.profile ?? raw.runProfile, PROFILE_OPTIONS, fallback.profile),
    searchProvider: parseEnum(raw.searchProvider, SEARCH_PROVIDER_OPTIONS, fallback.searchProvider),
    searxngBaseUrl: parseString(raw.searxngBaseUrl, fallback.searxngBaseUrl, true),
    bingSearchEndpoint: parseString(raw.bingSearchEndpoint, fallback.bingSearchEndpoint, true),
    bingSearchKey: parseString(raw.bingSearchKey, fallback.bingSearchKey, true),
    googleCseCx: parseString(raw.googleCseCx, fallback.googleCseCx, true),
    googleCseKey: parseString(raw.googleCseKey, fallback.googleCseKey, true),
    llmPlanApiKey: parseString(raw.llmPlanApiKey, fallback.llmPlanApiKey, true),
    duckduckgoBaseUrl: parseString(raw.duckduckgoBaseUrl, fallback.duckduckgoBaseUrl, true),
    llmModelPlan: parseString(raw.llmModelPlan ?? raw.phase2LlmModel, fallback.llmModelPlan),
    phase2LlmModel: parseString(raw.phase2LlmModel ?? raw.llmModelPlan, fallback.phase2LlmModel),
    llmModelTriage: parseString(raw.llmModelTriage ?? raw.phase3LlmModel, fallback.llmModelTriage),
    phase3LlmModel: parseString(raw.phase3LlmModel ?? raw.llmModelTriage, fallback.phase3LlmModel),
    llmModelFast: parseString(raw.llmModelFast, fallback.llmModelFast),
    llmModelReasoning: parseString(raw.llmModelReasoning, fallback.llmModelReasoning),
    llmModelExtract: parseString(raw.llmModelExtract, fallback.llmModelExtract),
    llmModelValidate: parseString(raw.llmModelValidate, fallback.llmModelValidate),
    llmModelWrite: parseString(raw.llmModelWrite, fallback.llmModelWrite),
    llmPlanFallbackModel: parseString(raw.llmPlanFallbackModel ?? raw.llmFallbackPlanModel, fallback.llmPlanFallbackModel, true),
    llmFallbackPlanModel: parseString(raw.llmFallbackPlanModel ?? raw.llmPlanFallbackModel, fallback.llmFallbackPlanModel, true),
    llmExtractFallbackModel: parseString(raw.llmExtractFallbackModel ?? raw.llmFallbackExtractModel, fallback.llmExtractFallbackModel, true),
    llmFallbackExtractModel: parseString(raw.llmFallbackExtractModel ?? raw.llmExtractFallbackModel, fallback.llmFallbackExtractModel, true),
    llmValidateFallbackModel: parseString(raw.llmValidateFallbackModel ?? raw.llmFallbackValidateModel, fallback.llmValidateFallbackModel, true),
    llmFallbackValidateModel: parseString(raw.llmFallbackValidateModel ?? raw.llmValidateFallbackModel, fallback.llmFallbackValidateModel, true),
    llmWriteFallbackModel: parseString(raw.llmWriteFallbackModel ?? raw.llmFallbackWriteModel, fallback.llmWriteFallbackModel, true),
    llmFallbackWriteModel: parseString(raw.llmFallbackWriteModel ?? raw.llmWriteFallbackModel, fallback.llmFallbackWriteModel, true),
    outputMode: parseString(raw.outputMode, fallback.outputMode, true),
    localInputRoot: parseString(raw.localInputRoot, fallback.localInputRoot, true),
    localOutputRoot: parseString(raw.localOutputRoot, fallback.localOutputRoot, true),
    runtimeEventsKey: parseString(raw.runtimeEventsKey, fallback.runtimeEventsKey, true),
    awsRegion: parseString(raw.awsRegion, fallback.awsRegion, true),
    s3Bucket: parseString(raw.s3Bucket, fallback.s3Bucket, true),
    s3InputPrefix: parseString(raw.s3InputPrefix, fallback.s3InputPrefix, true),
    s3OutputPrefix: parseString(raw.s3OutputPrefix, fallback.s3OutputPrefix, true),
    eloSupabaseAnonKey: parseString(raw.eloSupabaseAnonKey, fallback.eloSupabaseAnonKey, true),
    eloSupabaseEndpoint: parseString(raw.eloSupabaseEndpoint, fallback.eloSupabaseEndpoint, true),
    llmProvider: parseString(raw.llmProvider, fallback.llmProvider, true),
    llmBaseUrl: parseString(raw.llmBaseUrl, fallback.llmBaseUrl, true),
    openaiApiKey: parseString(raw.openaiApiKey, fallback.openaiApiKey, true),
    anthropicApiKey: parseString(raw.anthropicApiKey, fallback.anthropicApiKey, true),
    llmPlanProvider: parseString(raw.llmPlanProvider, fallback.llmPlanProvider, true),
    llmPlanBaseUrl: parseString(raw.llmPlanBaseUrl, fallback.llmPlanBaseUrl, true),
    importsRoot: parseString(raw.importsRoot, fallback.importsRoot, true),
    llmExtractionCacheDir: parseString(raw.llmExtractionCacheDir, fallback.llmExtractionCacheDir, true),
    resumeMode: parseEnum(raw.resumeMode, RESUME_MODE_OPTIONS, fallback.resumeMode),
    scannedPdfOcrBackend: parseEnum(raw.scannedPdfOcrBackend, OCR_BACKEND_OPTIONS, fallback.scannedPdfOcrBackend),
    fetchConcurrency: parseBoundedNumber(
      raw.fetchConcurrency,
      fallback.fetchConcurrency,
      RUNTIME_NUMBER_BOUNDS.fetchConcurrency,
    ),
    perHostMinDelayMs: parseBoundedNumber(
      raw.perHostMinDelayMs,
      fallback.perHostMinDelayMs,
      RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs,
    ),
    llmMaxOutputTokensPlan: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensPlan ?? raw.llmTokensPlan) || fallback.llmMaxOutputTokensPlan,
    llmTokensPlan: parseRuntimeLlmTokenCap(raw.llmTokensPlan ?? raw.llmMaxOutputTokensPlan) || fallback.llmTokensPlan,
    llmMaxOutputTokensTriage: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensTriage ?? raw.llmTokensTriage) || fallback.llmMaxOutputTokensTriage,
    llmTokensTriage: parseRuntimeLlmTokenCap(raw.llmTokensTriage ?? raw.llmMaxOutputTokensTriage) || fallback.llmTokensTriage,
    llmMaxOutputTokensFast: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensFast ?? raw.llmTokensFast) || fallback.llmMaxOutputTokensFast,
    llmTokensFast: parseRuntimeLlmTokenCap(raw.llmTokensFast ?? raw.llmMaxOutputTokensFast) || fallback.llmTokensFast,
    llmMaxOutputTokensReasoning: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensReasoning ?? raw.llmTokensReasoning) || fallback.llmMaxOutputTokensReasoning,
    llmTokensReasoning: parseRuntimeLlmTokenCap(raw.llmTokensReasoning ?? raw.llmMaxOutputTokensReasoning) || fallback.llmTokensReasoning,
    llmMaxOutputTokensExtract: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensExtract ?? raw.llmTokensExtract) || fallback.llmMaxOutputTokensExtract,
    llmTokensExtract: parseRuntimeLlmTokenCap(raw.llmTokensExtract ?? raw.llmMaxOutputTokensExtract) || fallback.llmTokensExtract,
    llmMaxOutputTokensValidate: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensValidate ?? raw.llmTokensValidate) || fallback.llmMaxOutputTokensValidate,
    llmTokensValidate: parseRuntimeLlmTokenCap(raw.llmTokensValidate ?? raw.llmMaxOutputTokensValidate) || fallback.llmTokensValidate,
    llmMaxOutputTokensWrite: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensWrite ?? raw.llmTokensWrite) || fallback.llmMaxOutputTokensWrite,
    llmTokensWrite: parseRuntimeLlmTokenCap(raw.llmTokensWrite ?? raw.llmMaxOutputTokensWrite) || fallback.llmTokensWrite,
    llmMaxOutputTokensPlanFallback: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensPlanFallback ?? raw.llmTokensPlanFallback) || fallback.llmMaxOutputTokensPlanFallback,
    llmTokensPlanFallback: parseRuntimeLlmTokenCap(raw.llmTokensPlanFallback ?? raw.llmMaxOutputTokensPlanFallback) || fallback.llmTokensPlanFallback,
    llmMaxOutputTokensExtractFallback: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensExtractFallback ?? raw.llmTokensExtractFallback) || fallback.llmMaxOutputTokensExtractFallback,
    llmTokensExtractFallback: parseRuntimeLlmTokenCap(raw.llmTokensExtractFallback ?? raw.llmMaxOutputTokensExtractFallback) || fallback.llmTokensExtractFallback,
    llmMaxOutputTokensValidateFallback: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensValidateFallback ?? raw.llmTokensValidateFallback) || fallback.llmMaxOutputTokensValidateFallback,
    llmTokensValidateFallback: parseRuntimeLlmTokenCap(raw.llmTokensValidateFallback ?? raw.llmMaxOutputTokensValidateFallback) || fallback.llmTokensValidateFallback,
    llmMaxOutputTokensWriteFallback: parseRuntimeLlmTokenCap(raw.llmMaxOutputTokensWriteFallback ?? raw.llmTokensWriteFallback) || fallback.llmMaxOutputTokensWriteFallback,
    llmTokensWriteFallback: parseRuntimeLlmTokenCap(raw.llmTokensWriteFallback ?? raw.llmMaxOutputTokensWriteFallback) || fallback.llmTokensWriteFallback,
    resumeWindowHours: parseBoundedNumber(
      raw.resumeWindowHours,
      fallback.resumeWindowHours,
      RUNTIME_NUMBER_BOUNDS.resumeWindowHours,
    ),
    indexingResumeSeedLimit: parseBoundedNumber(
      raw.indexingResumeSeedLimit,
      fallback.indexingResumeSeedLimit,
      RUNTIME_NUMBER_BOUNDS.indexingResumeSeedLimit,
    ),
    indexingResumePersistLimit: parseBoundedNumber(
      raw.indexingResumePersistLimit,
      fallback.indexingResumePersistLimit,
      RUNTIME_NUMBER_BOUNDS.indexingResumePersistLimit,
    ),
    reextractAfterHours: parseBoundedNumber(
      raw.reextractAfterHours,
      fallback.reextractAfterHours,
      RUNTIME_NUMBER_BOUNDS.reextractAfterHours,
    ),
    scannedPdfOcrMaxPages: parseBoundedNumber(
      raw.scannedPdfOcrMaxPages,
      fallback.scannedPdfOcrMaxPages,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages,
    ),
    scannedPdfOcrMaxPairs: parseBoundedNumber(
      raw.scannedPdfOcrMaxPairs,
      fallback.scannedPdfOcrMaxPairs,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs,
    ),
    scannedPdfOcrMinCharsPerPage: parseBoundedNumber(
      raw.scannedPdfOcrMinCharsPerPage,
      fallback.scannedPdfOcrMinCharsPerPage,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage,
    ),
    scannedPdfOcrMinLinesPerPage: parseBoundedNumber(
      raw.scannedPdfOcrMinLinesPerPage,
      fallback.scannedPdfOcrMinLinesPerPage,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage,
    ),
    scannedPdfOcrMinConfidence: parseBoundedNumber(
      raw.scannedPdfOcrMinConfidence,
      fallback.scannedPdfOcrMinConfidence,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence,
    ),
    crawleeRequestHandlerTimeoutSecs: parseBoundedNumber(
      raw.crawleeRequestHandlerTimeoutSecs,
      fallback.crawleeRequestHandlerTimeoutSecs,
      RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs,
    ),
    dynamicFetchRetryBudget: parseBoundedNumber(
      raw.dynamicFetchRetryBudget,
      fallback.dynamicFetchRetryBudget,
      RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget,
    ),
    dynamicFetchRetryBackoffMs: parseBoundedNumber(
      raw.dynamicFetchRetryBackoffMs,
      fallback.dynamicFetchRetryBackoffMs,
      RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs,
    ),
    fetchSchedulerMaxRetries: parseBoundedNumber(
      raw.fetchSchedulerMaxRetries,
      fallback.fetchSchedulerMaxRetries,
      RUNTIME_NUMBER_BOUNDS.fetchSchedulerMaxRetries,
    ),
    fetchSchedulerFallbackWaitMs: parseBoundedNumber(
      raw.fetchSchedulerFallbackWaitMs,
      fallback.fetchSchedulerFallbackWaitMs,
      RUNTIME_NUMBER_BOUNDS.fetchSchedulerFallbackWaitMs,
    ),
    pageGotoTimeoutMs: parseBoundedNumber(
      raw.pageGotoTimeoutMs,
      fallback.pageGotoTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.pageGotoTimeoutMs,
    ),
    pageNetworkIdleTimeoutMs: parseBoundedNumber(
      raw.pageNetworkIdleTimeoutMs,
      fallback.pageNetworkIdleTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.pageNetworkIdleTimeoutMs,
    ),
    postLoadWaitMs: parseBoundedNumber(
      raw.postLoadWaitMs,
      fallback.postLoadWaitMs,
      RUNTIME_NUMBER_BOUNDS.postLoadWaitMs,
    ),
    frontierDbPath: parseString(raw.frontierDbPath, fallback.frontierDbPath, true),
    frontierQueryCooldownSeconds: parseBoundedNumber(
      raw.frontierQueryCooldownSeconds,
      fallback.frontierQueryCooldownSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierQueryCooldownSeconds,
    ),
    frontierCooldown404Seconds: parseBoundedNumber(
      raw.frontierCooldown404Seconds,
      fallback.frontierCooldown404Seconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown404Seconds,
    ),
    frontierCooldown404RepeatSeconds: parseBoundedNumber(
      raw.frontierCooldown404RepeatSeconds,
      fallback.frontierCooldown404RepeatSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown404RepeatSeconds,
    ),
    frontierCooldown410Seconds: parseBoundedNumber(
      raw.frontierCooldown410Seconds,
      fallback.frontierCooldown410Seconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown410Seconds,
    ),
    frontierCooldownTimeoutSeconds: parseBoundedNumber(
      raw.frontierCooldownTimeoutSeconds,
      fallback.frontierCooldownTimeoutSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldownTimeoutSeconds,
    ),
    frontierCooldown403BaseSeconds: parseBoundedNumber(
      raw.frontierCooldown403BaseSeconds,
      fallback.frontierCooldown403BaseSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown403BaseSeconds,
    ),
    frontierCooldown429BaseSeconds: parseBoundedNumber(
      raw.frontierCooldown429BaseSeconds,
      fallback.frontierCooldown429BaseSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown429BaseSeconds,
    ),
    frontierBackoffMaxExponent: parseBoundedNumber(
      raw.frontierBackoffMaxExponent,
      fallback.frontierBackoffMaxExponent,
      RUNTIME_NUMBER_BOUNDS.frontierBackoffMaxExponent,
    ),
    frontierPathPenaltyNotfoundThreshold: parseBoundedNumber(
      raw.frontierPathPenaltyNotfoundThreshold,
      fallback.frontierPathPenaltyNotfoundThreshold,
      RUNTIME_NUMBER_BOUNDS.frontierPathPenaltyNotfoundThreshold,
    ),
    frontierBlockedDomainThreshold: parseBoundedNumber(
      raw.frontierBlockedDomainThreshold,
      fallback.frontierBlockedDomainThreshold,
      RUNTIME_NUMBER_BOUNDS.frontierBlockedDomainThreshold,
    ),
    autoScrollPasses: parseBoundedNumber(
      raw.autoScrollPasses,
      fallback.autoScrollPasses,
      RUNTIME_NUMBER_BOUNDS.autoScrollPasses,
    ),
    autoScrollDelayMs: parseBoundedNumber(
      raw.autoScrollDelayMs,
      fallback.autoScrollDelayMs,
      RUNTIME_NUMBER_BOUNDS.autoScrollDelayMs,
    ),
    maxGraphqlReplays: parseBoundedNumber(
      raw.maxGraphqlReplays,
      fallback.maxGraphqlReplays,
      RUNTIME_NUMBER_BOUNDS.maxGraphqlReplays,
    ),
    maxNetworkResponsesPerPage: parseBoundedNumber(
      raw.maxNetworkResponsesPerPage,
      fallback.maxNetworkResponsesPerPage,
      RUNTIME_NUMBER_BOUNDS.maxNetworkResponsesPerPage,
    ),
    robotsTxtTimeoutMs: parseBoundedNumber(
      raw.robotsTxtTimeoutMs,
      fallback.robotsTxtTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.robotsTxtTimeoutMs,
    ),
    endpointSignalLimit: parseBoundedNumber(
      raw.endpointSignalLimit,
      fallback.endpointSignalLimit,
      RUNTIME_NUMBER_BOUNDS.endpointSignalLimit,
    ),
    endpointSuggestionLimit: parseBoundedNumber(
      raw.endpointSuggestionLimit,
      fallback.endpointSuggestionLimit,
      RUNTIME_NUMBER_BOUNDS.endpointSuggestionLimit,
    ),
    endpointNetworkScanLimit: parseBoundedNumber(
      raw.endpointNetworkScanLimit,
      fallback.endpointNetworkScanLimit,
      RUNTIME_NUMBER_BOUNDS.endpointNetworkScanLimit,
    ),
    discoveryMaxQueries: parseBoundedNumber(
      raw.discoveryMaxQueries,
      fallback.discoveryMaxQueries,
      RUNTIME_NUMBER_BOUNDS.discoveryMaxQueries,
    ),
    discoveryResultsPerQuery: parseBoundedNumber(
      raw.discoveryResultsPerQuery,
      fallback.discoveryResultsPerQuery,
      RUNTIME_NUMBER_BOUNDS.discoveryResultsPerQuery,
    ),
    discoveryMaxDiscovered: parseBoundedNumber(
      raw.discoveryMaxDiscovered,
      fallback.discoveryMaxDiscovered,
      RUNTIME_NUMBER_BOUNDS.discoveryMaxDiscovered,
    ),
    discoveryQueryConcurrency: parseBoundedNumber(
      raw.discoveryQueryConcurrency,
      fallback.discoveryQueryConcurrency,
      RUNTIME_NUMBER_BOUNDS.discoveryQueryConcurrency,
    ),
    maxUrlsPerProduct: parseBoundedNumber(
      raw.maxUrlsPerProduct,
      fallback.maxUrlsPerProduct,
      RUNTIME_NUMBER_BOUNDS.maxUrlsPerProduct,
    ),
    maxCandidateUrls: parseBoundedNumber(
      raw.maxCandidateUrls,
      fallback.maxCandidateUrls,
      RUNTIME_NUMBER_BOUNDS.maxCandidateUrls,
    ),
    maxPagesPerDomain: parseBoundedNumber(
      raw.maxPagesPerDomain,
      fallback.maxPagesPerDomain,
      RUNTIME_NUMBER_BOUNDS.maxPagesPerDomain,
    ),
    uberMaxUrlsPerProduct: parseBoundedNumber(
      raw.uberMaxUrlsPerProduct,
      fallback.uberMaxUrlsPerProduct,
      RUNTIME_NUMBER_BOUNDS.uberMaxUrlsPerProduct,
    ),
    uberMaxUrlsPerDomain: parseBoundedNumber(
      raw.uberMaxUrlsPerDomain,
      fallback.uberMaxUrlsPerDomain,
      RUNTIME_NUMBER_BOUNDS.uberMaxUrlsPerDomain,
    ),
    maxRunSeconds: parseBoundedNumber(
      raw.maxRunSeconds,
      fallback.maxRunSeconds,
      RUNTIME_NUMBER_BOUNDS.maxRunSeconds,
    ),
    maxJsonBytes: parseBoundedNumber(
      raw.maxJsonBytes,
      fallback.maxJsonBytes,
      RUNTIME_NUMBER_BOUNDS.maxJsonBytes,
    ),
    maxPdfBytes: parseBoundedNumber(
      raw.maxPdfBytes,
      fallback.maxPdfBytes,
      RUNTIME_NUMBER_BOUNDS.maxPdfBytes,
    ),
    pdfBackendRouterTimeoutMs: parseBoundedNumber(
      raw.pdfBackendRouterTimeoutMs,
      fallback.pdfBackendRouterTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterTimeoutMs,
    ),
    pdfBackendRouterMaxPages: parseBoundedNumber(
      raw.pdfBackendRouterMaxPages,
      fallback.pdfBackendRouterMaxPages,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPages,
    ),
    pdfBackendRouterMaxPairs: parseBoundedNumber(
      raw.pdfBackendRouterMaxPairs,
      fallback.pdfBackendRouterMaxPairs,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPairs,
    ),
    pdfBackendRouterMaxTextPreviewChars: parseBoundedNumber(
      raw.pdfBackendRouterMaxTextPreviewChars,
      fallback.pdfBackendRouterMaxTextPreviewChars,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxTextPreviewChars,
    ),
    capturePageScreenshotQuality: parseBoundedNumber(
      raw.capturePageScreenshotQuality,
      fallback.capturePageScreenshotQuality,
      RUNTIME_NUMBER_BOUNDS.capturePageScreenshotQuality,
    ),
    capturePageScreenshotMaxBytes: parseBoundedNumber(
      raw.capturePageScreenshotMaxBytes,
      fallback.capturePageScreenshotMaxBytes,
      RUNTIME_NUMBER_BOUNDS.capturePageScreenshotMaxBytes,
    ),
    visualAssetCaptureMaxPerSource: parseBoundedNumber(
      raw.visualAssetCaptureMaxPerSource,
      fallback.visualAssetCaptureMaxPerSource,
      RUNTIME_NUMBER_BOUNDS.visualAssetCaptureMaxPerSource,
    ),
    visualAssetRetentionDays: parseBoundedNumber(
      raw.visualAssetRetentionDays,
      fallback.visualAssetRetentionDays,
      RUNTIME_NUMBER_BOUNDS.visualAssetRetentionDays,
    ),
    visualAssetReviewLgMaxSide: parseBoundedNumber(
      raw.visualAssetReviewLgMaxSide,
      fallback.visualAssetReviewLgMaxSide,
      RUNTIME_NUMBER_BOUNDS.visualAssetReviewLgMaxSide,
    ),
    visualAssetReviewSmMaxSide: parseBoundedNumber(
      raw.visualAssetReviewSmMaxSide,
      fallback.visualAssetReviewSmMaxSide,
      RUNTIME_NUMBER_BOUNDS.visualAssetReviewSmMaxSide,
    ),
    visualAssetReviewLgQuality: parseBoundedNumber(
      raw.visualAssetReviewLgQuality,
      fallback.visualAssetReviewLgQuality,
      RUNTIME_NUMBER_BOUNDS.visualAssetReviewLgQuality,
    ),
    visualAssetReviewSmQuality: parseBoundedNumber(
      raw.visualAssetReviewSmQuality,
      fallback.visualAssetReviewSmQuality,
      RUNTIME_NUMBER_BOUNDS.visualAssetReviewSmQuality,
    ),
    visualAssetRegionCropMaxSide: parseBoundedNumber(
      raw.visualAssetRegionCropMaxSide,
      fallback.visualAssetRegionCropMaxSide,
      RUNTIME_NUMBER_BOUNDS.visualAssetRegionCropMaxSide,
    ),
    visualAssetRegionCropQuality: parseBoundedNumber(
      raw.visualAssetRegionCropQuality,
      fallback.visualAssetRegionCropQuality,
      RUNTIME_NUMBER_BOUNDS.visualAssetRegionCropQuality,
    ),
    visualAssetLlmMaxBytes: parseBoundedNumber(
      raw.visualAssetLlmMaxBytes,
      fallback.visualAssetLlmMaxBytes,
      RUNTIME_NUMBER_BOUNDS.visualAssetLlmMaxBytes,
    ),
    visualAssetMinWidth: parseBoundedNumber(
      raw.visualAssetMinWidth,
      fallback.visualAssetMinWidth,
      RUNTIME_NUMBER_BOUNDS.visualAssetMinWidth,
    ),
    visualAssetMinHeight: parseBoundedNumber(
      raw.visualAssetMinHeight,
      fallback.visualAssetMinHeight,
      RUNTIME_NUMBER_BOUNDS.visualAssetMinHeight,
    ),
    visualAssetMinSharpness: parseBoundedNumber(
      raw.visualAssetMinSharpness,
      fallback.visualAssetMinSharpness,
      RUNTIME_NUMBER_BOUNDS.visualAssetMinSharpness,
    ),
    visualAssetMinEntropy: parseBoundedNumber(
      raw.visualAssetMinEntropy,
      fallback.visualAssetMinEntropy,
      RUNTIME_NUMBER_BOUNDS.visualAssetMinEntropy,
    ),
    visualAssetMaxPhashDistance: parseBoundedNumber(
      raw.visualAssetMaxPhashDistance,
      fallback.visualAssetMaxPhashDistance,
      RUNTIME_NUMBER_BOUNDS.visualAssetMaxPhashDistance,
    ),
    articleExtractorMinChars: parseBoundedNumber(
      raw.articleExtractorMinChars,
      fallback.articleExtractorMinChars,
      RUNTIME_NUMBER_BOUNDS.articleExtractorMinChars,
    ),
    articleExtractorMinScore: parseBoundedNumber(
      raw.articleExtractorMinScore,
      fallback.articleExtractorMinScore,
      RUNTIME_NUMBER_BOUNDS.articleExtractorMinScore,
    ),
    articleExtractorMaxChars: parseBoundedNumber(
      raw.articleExtractorMaxChars,
      fallback.articleExtractorMaxChars,
      RUNTIME_NUMBER_BOUNDS.articleExtractorMaxChars,
    ),
    staticDomTargetMatchThreshold: parseBoundedNumber(
      raw.staticDomTargetMatchThreshold,
      fallback.staticDomTargetMatchThreshold,
      RUNTIME_NUMBER_BOUNDS.staticDomTargetMatchThreshold,
    ),
    staticDomMaxEvidenceSnippets: parseBoundedNumber(
      raw.staticDomMaxEvidenceSnippets,
      fallback.staticDomMaxEvidenceSnippets,
      RUNTIME_NUMBER_BOUNDS.staticDomMaxEvidenceSnippets,
    ),
    structuredMetadataExtructTimeoutMs: parseBoundedNumber(
      raw.structuredMetadataExtructTimeoutMs,
      fallback.structuredMetadataExtructTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructTimeoutMs,
    ),
    structuredMetadataExtructMaxItemsPerSurface: parseBoundedNumber(
      raw.structuredMetadataExtructMaxItemsPerSurface,
      fallback.structuredMetadataExtructMaxItemsPerSurface,
      RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructMaxItemsPerSurface,
    ),
    structuredMetadataExtructCacheLimit: parseBoundedNumber(
      raw.structuredMetadataExtructCacheLimit,
      fallback.structuredMetadataExtructCacheLimit,
      RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructCacheLimit,
    ),
    domSnippetMaxChars: parseBoundedNumber(
      raw.domSnippetMaxChars,
      fallback.domSnippetMaxChars,
      RUNTIME_NUMBER_BOUNDS.domSnippetMaxChars,
    ),
    llmExtractionCacheTtlMs: parseBoundedNumber(
      raw.llmExtractionCacheTtlMs,
      fallback.llmExtractionCacheTtlMs,
      RUNTIME_NUMBER_BOUNDS.llmExtractionCacheTtlMs,
    ),
    llmMaxCallsPerProductTotal: parseBoundedNumber(
      raw.llmMaxCallsPerProductTotal,
      fallback.llmMaxCallsPerProductTotal,
      RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductTotal,
    ),
    llmMaxCallsPerProductFast: parseBoundedNumber(
      raw.llmMaxCallsPerProductFast,
      fallback.llmMaxCallsPerProductFast,
      RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductFast,
    ),
    needsetEvidenceDecayDays: parseBoundedNumber(
      raw.needsetEvidenceDecayDays,
      fallback.needsetEvidenceDecayDays,
      RUNTIME_NUMBER_BOUNDS.needsetEvidenceDecayDays,
    ),
    needsetEvidenceDecayFloor: parseBoundedNumber(
      raw.needsetEvidenceDecayFloor,
      fallback.needsetEvidenceDecayFloor,
      RUNTIME_NUMBER_BOUNDS.needsetEvidenceDecayFloor,
    ),
    needsetRequiredWeightIdentity: parseBoundedNumber(
      raw.needsetRequiredWeightIdentity,
      fallback.needsetRequiredWeightIdentity,
      RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightIdentity,
    ),
    needsetRequiredWeightCritical: parseBoundedNumber(
      raw.needsetRequiredWeightCritical,
      fallback.needsetRequiredWeightCritical,
      RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightCritical,
    ),
    needsetRequiredWeightRequired: parseBoundedNumber(
      raw.needsetRequiredWeightRequired,
      fallback.needsetRequiredWeightRequired,
      RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightRequired,
    ),
    needsetRequiredWeightExpected: parseBoundedNumber(
      raw.needsetRequiredWeightExpected,
      fallback.needsetRequiredWeightExpected,
      RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightExpected,
    ),
    needsetRequiredWeightOptional: parseBoundedNumber(
      raw.needsetRequiredWeightOptional,
      fallback.needsetRequiredWeightOptional,
      RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightOptional,
    ),
    needsetMissingMultiplier: parseBoundedNumber(
      raw.needsetMissingMultiplier,
      fallback.needsetMissingMultiplier,
      RUNTIME_NUMBER_BOUNDS.needsetMissingMultiplier,
    ),
    needsetTierDeficitMultiplier: parseBoundedNumber(
      raw.needsetTierDeficitMultiplier,
      fallback.needsetTierDeficitMultiplier,
      RUNTIME_NUMBER_BOUNDS.needsetTierDeficitMultiplier,
    ),
    needsetMinRefsDeficitMultiplier: parseBoundedNumber(
      raw.needsetMinRefsDeficitMultiplier,
      fallback.needsetMinRefsDeficitMultiplier,
      RUNTIME_NUMBER_BOUNDS.needsetMinRefsDeficitMultiplier,
    ),
    needsetConflictMultiplier: parseBoundedNumber(
      raw.needsetConflictMultiplier,
      fallback.needsetConflictMultiplier,
      RUNTIME_NUMBER_BOUNDS.needsetConflictMultiplier,
    ),
    needsetIdentityLockThreshold: parseBoundedNumber(
      raw.needsetIdentityLockThreshold,
      fallback.needsetIdentityLockThreshold,
      RUNTIME_NUMBER_BOUNDS.needsetIdentityLockThreshold,
    ),
    needsetIdentityProvisionalThreshold: parseBoundedNumber(
      raw.needsetIdentityProvisionalThreshold,
      fallback.needsetIdentityProvisionalThreshold,
      RUNTIME_NUMBER_BOUNDS.needsetIdentityProvisionalThreshold,
    ),
    needsetDefaultIdentityAuditLimit: parseBoundedNumber(
      raw.needsetDefaultIdentityAuditLimit,
      fallback.needsetDefaultIdentityAuditLimit,
      RUNTIME_NUMBER_BOUNDS.needsetDefaultIdentityAuditLimit,
    ),
    consensusMethodWeightNetworkJson: parseBoundedNumber(
      raw.consensusMethodWeightNetworkJson,
      fallback.consensusMethodWeightNetworkJson,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightNetworkJson,
    ),
    consensusMethodWeightAdapterApi: parseBoundedNumber(
      raw.consensusMethodWeightAdapterApi,
      fallback.consensusMethodWeightAdapterApi,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightAdapterApi,
    ),
    consensusMethodWeightStructuredMeta: parseBoundedNumber(
      raw.consensusMethodWeightStructuredMeta,
      fallback.consensusMethodWeightStructuredMeta,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightStructuredMeta,
    ),
    consensusMethodWeightPdf: parseBoundedNumber(
      raw.consensusMethodWeightPdf,
      fallback.consensusMethodWeightPdf,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightPdf,
    ),
    consensusMethodWeightTableKv: parseBoundedNumber(
      raw.consensusMethodWeightTableKv,
      fallback.consensusMethodWeightTableKv,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightTableKv,
    ),
    consensusMethodWeightDom: parseBoundedNumber(
      raw.consensusMethodWeightDom,
      fallback.consensusMethodWeightDom,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightDom,
    ),
    consensusMethodWeightLlmExtractBase: parseBoundedNumber(
      raw.consensusMethodWeightLlmExtractBase,
      fallback.consensusMethodWeightLlmExtractBase,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightLlmExtractBase,
    ),
    consensusPolicyBonus: parseBoundedNumber(
      raw.consensusPolicyBonus,
      fallback.consensusPolicyBonus,
      RUNTIME_NUMBER_BOUNDS.consensusPolicyBonus,
    ),
    consensusWeightedMajorityThreshold: parseBoundedNumber(
      raw.consensusWeightedMajorityThreshold,
      fallback.consensusWeightedMajorityThreshold,
      RUNTIME_NUMBER_BOUNDS.consensusWeightedMajorityThreshold,
    ),
    consensusStrictAcceptanceDomainCount: parseBoundedNumber(
      raw.consensusStrictAcceptanceDomainCount,
      fallback.consensusStrictAcceptanceDomainCount,
      RUNTIME_NUMBER_BOUNDS.consensusStrictAcceptanceDomainCount,
    ),
    consensusRelaxedAcceptanceDomainCount: parseBoundedNumber(
      raw.consensusRelaxedAcceptanceDomainCount,
      fallback.consensusRelaxedAcceptanceDomainCount,
      RUNTIME_NUMBER_BOUNDS.consensusRelaxedAcceptanceDomainCount,
    ),
    consensusInstrumentedFieldThreshold: parseBoundedNumber(
      raw.consensusInstrumentedFieldThreshold,
      fallback.consensusInstrumentedFieldThreshold,
      RUNTIME_NUMBER_BOUNDS.consensusInstrumentedFieldThreshold,
    ),
    consensusConfidenceScoringBase: parseBoundedNumber(
      raw.consensusConfidenceScoringBase,
      fallback.consensusConfidenceScoringBase,
      RUNTIME_NUMBER_BOUNDS.consensusConfidenceScoringBase,
    ),
    consensusPassTargetIdentityStrong: parseBoundedNumber(
      raw.consensusPassTargetIdentityStrong,
      fallback.consensusPassTargetIdentityStrong,
      RUNTIME_NUMBER_BOUNDS.consensusPassTargetIdentityStrong,
    ),
    consensusPassTargetNormal: parseBoundedNumber(
      raw.consensusPassTargetNormal,
      fallback.consensusPassTargetNormal,
      RUNTIME_NUMBER_BOUNDS.consensusPassTargetNormal,
    ),
    retrievalTierWeightTier1: parseBoundedNumber(
      raw.retrievalTierWeightTier1,
      fallback.retrievalTierWeightTier1,
      RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier1,
    ),
    retrievalTierWeightTier2: parseBoundedNumber(
      raw.retrievalTierWeightTier2,
      fallback.retrievalTierWeightTier2,
      RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier2,
    ),
    retrievalTierWeightTier3: parseBoundedNumber(
      raw.retrievalTierWeightTier3,
      fallback.retrievalTierWeightTier3,
      RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier3,
    ),
    retrievalTierWeightTier4: parseBoundedNumber(
      raw.retrievalTierWeightTier4,
      fallback.retrievalTierWeightTier4,
      RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier4,
    ),
    retrievalTierWeightTier5: parseBoundedNumber(
      raw.retrievalTierWeightTier5,
      fallback.retrievalTierWeightTier5,
      RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier5,
    ),
    retrievalDocKindWeightManualPdf: parseBoundedNumber(
      raw.retrievalDocKindWeightManualPdf,
      fallback.retrievalDocKindWeightManualPdf,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightManualPdf,
    ),
    retrievalDocKindWeightSpecPdf: parseBoundedNumber(
      raw.retrievalDocKindWeightSpecPdf,
      fallback.retrievalDocKindWeightSpecPdf,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightSpecPdf,
    ),
    retrievalDocKindWeightSupport: parseBoundedNumber(
      raw.retrievalDocKindWeightSupport,
      fallback.retrievalDocKindWeightSupport,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightSupport,
    ),
    retrievalDocKindWeightLabReview: parseBoundedNumber(
      raw.retrievalDocKindWeightLabReview,
      fallback.retrievalDocKindWeightLabReview,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightLabReview,
    ),
    retrievalDocKindWeightProductPage: parseBoundedNumber(
      raw.retrievalDocKindWeightProductPage,
      fallback.retrievalDocKindWeightProductPage,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightProductPage,
    ),
    retrievalDocKindWeightOther: parseBoundedNumber(
      raw.retrievalDocKindWeightOther,
      fallback.retrievalDocKindWeightOther,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightOther,
    ),
    retrievalMethodWeightTable: parseBoundedNumber(
      raw.retrievalMethodWeightTable,
      fallback.retrievalMethodWeightTable,
      RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightTable,
    ),
    retrievalMethodWeightKv: parseBoundedNumber(
      raw.retrievalMethodWeightKv,
      fallback.retrievalMethodWeightKv,
      RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightKv,
    ),
    retrievalMethodWeightJsonLd: parseBoundedNumber(
      raw.retrievalMethodWeightJsonLd,
      fallback.retrievalMethodWeightJsonLd,
      RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightJsonLd,
    ),
    retrievalMethodWeightLlmExtract: parseBoundedNumber(
      raw.retrievalMethodWeightLlmExtract,
      fallback.retrievalMethodWeightLlmExtract,
      RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightLlmExtract,
    ),
    retrievalMethodWeightHelperSupportive: parseBoundedNumber(
      raw.retrievalMethodWeightHelperSupportive,
      fallback.retrievalMethodWeightHelperSupportive,
      RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightHelperSupportive,
    ),
    retrievalAnchorScorePerMatch: parseBoundedNumber(
      raw.retrievalAnchorScorePerMatch,
      fallback.retrievalAnchorScorePerMatch,
      RUNTIME_NUMBER_BOUNDS.retrievalAnchorScorePerMatch,
    ),
    retrievalIdentityScorePerMatch: parseBoundedNumber(
      raw.retrievalIdentityScorePerMatch,
      fallback.retrievalIdentityScorePerMatch,
      RUNTIME_NUMBER_BOUNDS.retrievalIdentityScorePerMatch,
    ),
    retrievalUnitMatchBonus: parseBoundedNumber(
      raw.retrievalUnitMatchBonus,
      fallback.retrievalUnitMatchBonus,
      RUNTIME_NUMBER_BOUNDS.retrievalUnitMatchBonus,
    ),
    retrievalDirectFieldMatchBonus: parseBoundedNumber(
      raw.retrievalDirectFieldMatchBonus,
      fallback.retrievalDirectFieldMatchBonus,
      RUNTIME_NUMBER_BOUNDS.retrievalDirectFieldMatchBonus,
    ),
    llmExtractMaxTokens: parseBoundedNumber(
      raw.llmExtractMaxTokens,
      fallback.llmExtractMaxTokens,
      RUNTIME_NUMBER_BOUNDS.llmExtractMaxTokens,
    ),
    llmExtractMaxSnippetsPerBatch: parseBoundedNumber(
      raw.llmExtractMaxSnippetsPerBatch,
      fallback.llmExtractMaxSnippetsPerBatch,
      RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetsPerBatch,
    ),
    llmExtractMaxSnippetChars: parseBoundedNumber(
      raw.llmExtractMaxSnippetChars,
      fallback.llmExtractMaxSnippetChars,
      RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetChars,
    ),
    llmExtractReasoningBudget: parseBoundedNumber(
      raw.llmExtractReasoningBudget,
      fallback.llmExtractReasoningBudget,
      RUNTIME_NUMBER_BOUNDS.llmExtractReasoningBudget,
    ),
    llmReasoningBudget: parseBoundedNumber(
      raw.llmReasoningBudget,
      fallback.llmReasoningBudget,
      RUNTIME_NUMBER_BOUNDS.llmReasoningBudget,
    ),
    llmMonthlyBudgetUsd: parseBoundedNumber(
      raw.llmMonthlyBudgetUsd,
      fallback.llmMonthlyBudgetUsd,
      RUNTIME_NUMBER_BOUNDS.llmMonthlyBudgetUsd,
    ),
    llmPerProductBudgetUsd: parseBoundedNumber(
      raw.llmPerProductBudgetUsd,
      fallback.llmPerProductBudgetUsd,
      RUNTIME_NUMBER_BOUNDS.llmPerProductBudgetUsd,
    ),
    llmMaxCallsPerRound: parseBoundedNumber(
      raw.llmMaxCallsPerRound,
      fallback.llmMaxCallsPerRound,
      RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerRound,
    ),
    llmMaxOutputTokens: parseBoundedNumber(
      raw.llmMaxOutputTokens,
      fallback.llmMaxOutputTokens,
      RUNTIME_NUMBER_BOUNDS.llmMaxOutputTokens,
    ),
    llmVerifySampleRate: parseBoundedNumber(
      raw.llmVerifySampleRate,
      fallback.llmVerifySampleRate,
      RUNTIME_NUMBER_BOUNDS.llmVerifySampleRate,
    ),
    llmMaxBatchesPerProduct: parseBoundedNumber(
      raw.llmMaxBatchesPerProduct,
      fallback.llmMaxBatchesPerProduct,
      RUNTIME_NUMBER_BOUNDS.llmMaxBatchesPerProduct,
    ),
    llmMaxEvidenceChars: parseBoundedNumber(
      raw.llmMaxEvidenceChars,
      fallback.llmMaxEvidenceChars,
      RUNTIME_NUMBER_BOUNDS.llmMaxEvidenceChars,
    ),
    llmMaxTokens: parseBoundedNumber(
      raw.llmMaxTokens,
      fallback.llmMaxTokens,
      RUNTIME_NUMBER_BOUNDS.llmMaxTokens,
    ),
    llmTimeoutMs: parseBoundedNumber(
      raw.llmTimeoutMs,
      fallback.llmTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.llmTimeoutMs,
    ),
    llmCostInputPer1M: parseBoundedNumber(
      raw.llmCostInputPer1M,
      fallback.llmCostInputPer1M,
      RUNTIME_NUMBER_BOUNDS.llmCostInputPer1M,
    ),
    llmCostOutputPer1M: parseBoundedNumber(
      raw.llmCostOutputPer1M,
      fallback.llmCostOutputPer1M,
      RUNTIME_NUMBER_BOUNDS.llmCostOutputPer1M,
    ),
    llmCostCachedInputPer1M: parseBoundedNumber(
      raw.llmCostCachedInputPer1M,
      fallback.llmCostCachedInputPer1M,
      RUNTIME_NUMBER_BOUNDS.llmCostCachedInputPer1M,
    ),
    maxManufacturerUrlsPerProduct: parseBoundedNumber(
      raw.maxManufacturerUrlsPerProduct,
      fallback.maxManufacturerUrlsPerProduct,
      RUNTIME_NUMBER_BOUNDS.maxManufacturerUrlsPerProduct,
    ),
    maxManufacturerPagesPerDomain: parseBoundedNumber(
      raw.maxManufacturerPagesPerDomain,
      fallback.maxManufacturerPagesPerDomain,
      RUNTIME_NUMBER_BOUNDS.maxManufacturerPagesPerDomain,
    ),
    manufacturerReserveUrls: parseBoundedNumber(
      raw.manufacturerReserveUrls,
      fallback.manufacturerReserveUrls,
      RUNTIME_NUMBER_BOUNDS.manufacturerReserveUrls,
    ),
    maxHypothesisItems: parseBoundedNumber(
      raw.maxHypothesisItems,
      fallback.maxHypothesisItems,
      RUNTIME_NUMBER_BOUNDS.maxHypothesisItems,
    ),
    hypothesisAutoFollowupRounds: parseBoundedNumber(
      raw.hypothesisAutoFollowupRounds,
      fallback.hypothesisAutoFollowupRounds,
      RUNTIME_NUMBER_BOUNDS.hypothesisAutoFollowupRounds,
    ),
    hypothesisFollowupUrlsPerRound: parseBoundedNumber(
      raw.hypothesisFollowupUrlsPerRound,
      fallback.hypothesisFollowupUrlsPerRound,
      RUNTIME_NUMBER_BOUNDS.hypothesisFollowupUrlsPerRound,
    ),
    learningConfidenceThreshold: parseBoundedNumber(
      raw.learningConfidenceThreshold,
      fallback.learningConfidenceThreshold,
      RUNTIME_NUMBER_BOUNDS.learningConfidenceThreshold,
    ),
    componentLexiconDecayDays: parseBoundedNumber(
      raw.componentLexiconDecayDays,
      fallback.componentLexiconDecayDays,
      RUNTIME_NUMBER_BOUNDS.componentLexiconDecayDays,
    ),
    componentLexiconExpireDays: parseBoundedNumber(
      raw.componentLexiconExpireDays,
      fallback.componentLexiconExpireDays,
      RUNTIME_NUMBER_BOUNDS.componentLexiconExpireDays,
    ),
    fieldAnchorsDecayDays: parseBoundedNumber(
      raw.fieldAnchorsDecayDays,
      fallback.fieldAnchorsDecayDays,
      RUNTIME_NUMBER_BOUNDS.fieldAnchorsDecayDays,
    ),
    urlMemoryDecayDays: parseBoundedNumber(
      raw.urlMemoryDecayDays,
      fallback.urlMemoryDecayDays,
      RUNTIME_NUMBER_BOUNDS.urlMemoryDecayDays,
    ),
    cseRescueRequiredIteration: parseBoundedNumber(
      raw.cseRescueRequiredIteration,
      fallback.cseRescueRequiredIteration,
      RUNTIME_NUMBER_BOUNDS.cseRescueRequiredIteration,
    ),
    duckduckgoTimeoutMs: parseBoundedNumber(
      raw.duckduckgoTimeoutMs,
      fallback.duckduckgoTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.duckduckgoTimeoutMs,
    ),
    runtimeScreencastFps: parseBoundedNumber(
      raw.runtimeScreencastFps,
      fallback.runtimeScreencastFps,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastFps,
    ),
    runtimeScreencastQuality: parseBoundedNumber(
      raw.runtimeScreencastQuality,
      fallback.runtimeScreencastQuality,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastQuality,
    ),
    runtimeScreencastMaxWidth: parseBoundedNumber(
      raw.runtimeScreencastMaxWidth,
      fallback.runtimeScreencastMaxWidth,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxWidth,
    ),
    runtimeScreencastMaxHeight: parseBoundedNumber(
      raw.runtimeScreencastMaxHeight,
      fallback.runtimeScreencastMaxHeight,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxHeight,
    ),
    runtimeTraceFetchRing: parseBoundedNumber(
      raw.runtimeTraceFetchRing,
      fallback.runtimeTraceFetchRing,
      RUNTIME_NUMBER_BOUNDS.runtimeTraceFetchRing,
    ),
    runtimeTraceLlmRing: parseBoundedNumber(
      raw.runtimeTraceLlmRing,
      fallback.runtimeTraceLlmRing,
      RUNTIME_NUMBER_BOUNDS.runtimeTraceLlmRing,
    ),
    daemonConcurrency: parseBoundedNumber(
      raw.daemonConcurrency,
      fallback.daemonConcurrency,
      RUNTIME_NUMBER_BOUNDS.daemonConcurrency,
    ),
    daemonGracefulShutdownTimeoutMs: parseBoundedNumber(
      raw.daemonGracefulShutdownTimeoutMs,
      fallback.daemonGracefulShutdownTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.daemonGracefulShutdownTimeoutMs,
    ),
    importsPollSeconds: parseBoundedNumber(
      raw.importsPollSeconds,
      fallback.importsPollSeconds,
      RUNTIME_NUMBER_BOUNDS.importsPollSeconds,
    ),
    convergenceIdentityFailFastRounds: parseBoundedNumber(
      raw.convergenceIdentityFailFastRounds,
      fallback.convergenceIdentityFailFastRounds,
      RUNTIME_NUMBER_BOUNDS.convergenceIdentityFailFastRounds,
    ),
    identityGatePublishThreshold: parseBoundedNumber(
      raw.identityGatePublishThreshold,
      fallback.identityGatePublishThreshold,
      RUNTIME_NUMBER_BOUNDS.identityGatePublishThreshold,
    ),
    identityGateBaseMatchThreshold: parseBoundedNumber(
      raw.identityGateBaseMatchThreshold,
      fallback.identityGateBaseMatchThreshold,
      RUNTIME_NUMBER_BOUNDS.identityGateBaseMatchThreshold,
    ),
    identityGateEasyAmbiguityReduction: parseBoundedNumber(
      raw.identityGateEasyAmbiguityReduction,
      fallback.identityGateEasyAmbiguityReduction,
      RUNTIME_NUMBER_BOUNDS.identityGateEasyAmbiguityReduction,
    ),
    identityGateMediumAmbiguityReduction: parseBoundedNumber(
      raw.identityGateMediumAmbiguityReduction,
      fallback.identityGateMediumAmbiguityReduction,
      RUNTIME_NUMBER_BOUNDS.identityGateMediumAmbiguityReduction,
    ),
    identityGateHardAmbiguityReduction: parseBoundedNumber(
      raw.identityGateHardAmbiguityReduction,
      fallback.identityGateHardAmbiguityReduction,
      RUNTIME_NUMBER_BOUNDS.identityGateHardAmbiguityReduction,
    ),
    identityGateVeryHardAmbiguityIncrease: parseBoundedNumber(
      raw.identityGateVeryHardAmbiguityIncrease,
      fallback.identityGateVeryHardAmbiguityIncrease,
      RUNTIME_NUMBER_BOUNDS.identityGateVeryHardAmbiguityIncrease,
    ),
    identityGateExtraHardAmbiguityIncrease: parseBoundedNumber(
      raw.identityGateExtraHardAmbiguityIncrease,
      fallback.identityGateExtraHardAmbiguityIncrease,
      RUNTIME_NUMBER_BOUNDS.identityGateExtraHardAmbiguityIncrease,
    ),
    identityGateMissingStrongIdPenalty: parseBoundedNumber(
      raw.identityGateMissingStrongIdPenalty,
      fallback.identityGateMissingStrongIdPenalty,
      RUNTIME_NUMBER_BOUNDS.identityGateMissingStrongIdPenalty,
    ),
    identityGateHardMissingStrongIdIncrease: parseBoundedNumber(
      raw.identityGateHardMissingStrongIdIncrease,
      fallback.identityGateHardMissingStrongIdIncrease,
      RUNTIME_NUMBER_BOUNDS.identityGateHardMissingStrongIdIncrease,
    ),
    identityGateVeryHardMissingStrongIdIncrease: parseBoundedNumber(
      raw.identityGateVeryHardMissingStrongIdIncrease,
      fallback.identityGateVeryHardMissingStrongIdIncrease,
      RUNTIME_NUMBER_BOUNDS.identityGateVeryHardMissingStrongIdIncrease,
    ),
    identityGateExtraHardMissingStrongIdIncrease: parseBoundedNumber(
      raw.identityGateExtraHardMissingStrongIdIncrease,
      fallback.identityGateExtraHardMissingStrongIdIncrease,
      RUNTIME_NUMBER_BOUNDS.identityGateExtraHardMissingStrongIdIncrease,
    ),
    identityGateNumericTokenBoost: parseBoundedNumber(
      raw.identityGateNumericTokenBoost,
      fallback.identityGateNumericTokenBoost,
      RUNTIME_NUMBER_BOUNDS.identityGateNumericTokenBoost,
    ),
    identityGateNumericRangeThreshold: parseBoundedNumber(
      raw.identityGateNumericRangeThreshold,
      fallback.identityGateNumericRangeThreshold,
      RUNTIME_NUMBER_BOUNDS.identityGateNumericRangeThreshold,
    ),
    qualityGateIdentityThreshold: parseBoundedNumber(
      raw.qualityGateIdentityThreshold,
      fallback.qualityGateIdentityThreshold,
      RUNTIME_NUMBER_BOUNDS.qualityGateIdentityThreshold,
    ),
    evidenceTextMaxChars: parseBoundedNumber(
      raw.evidenceTextMaxChars,
      fallback.evidenceTextMaxChars,
      RUNTIME_NUMBER_BOUNDS.evidenceTextMaxChars,
    ),
    helperSupportiveMaxSources: parseBoundedNumber(
      raw.helperSupportiveMaxSources,
      fallback.helperSupportiveMaxSources,
      RUNTIME_NUMBER_BOUNDS.helperSupportiveMaxSources,
    ),
    helperActiveSyncLimit: parseBoundedNumber(
      raw.helperActiveSyncLimit,
      fallback.helperActiveSyncLimit,
      RUNTIME_NUMBER_BOUNDS.helperActiveSyncLimit,
    ),
    fieldRewardHalfLifeDays: parseBoundedNumber(
      raw.fieldRewardHalfLifeDays,
      fallback.fieldRewardHalfLifeDays,
      RUNTIME_NUMBER_BOUNDS.fieldRewardHalfLifeDays,
    ),
    driftPollSeconds: parseBoundedNumber(
      raw.driftPollSeconds,
      fallback.driftPollSeconds,
      RUNTIME_NUMBER_BOUNDS.driftPollSeconds,
    ),
    driftScanMaxProducts: parseBoundedNumber(
      raw.driftScanMaxProducts,
      fallback.driftScanMaxProducts,
      RUNTIME_NUMBER_BOUNDS.driftScanMaxProducts,
    ),
    reCrawlStaleAfterDays: parseBoundedNumber(
      raw.reCrawlStaleAfterDays,
      fallback.reCrawlStaleAfterDays,
      RUNTIME_NUMBER_BOUNDS.reCrawlStaleAfterDays,
    ),
    aggressiveConfidenceThreshold: parseBoundedNumber(
      raw.aggressiveConfidenceThreshold,
      fallback.aggressiveConfidenceThreshold,
      RUNTIME_NUMBER_BOUNDS.aggressiveConfidenceThreshold,
    ),
    aggressiveMaxSearchQueries: parseBoundedNumber(
      raw.aggressiveMaxSearchQueries,
      fallback.aggressiveMaxSearchQueries,
      RUNTIME_NUMBER_BOUNDS.aggressiveMaxSearchQueries,
    ),
    aggressiveEvidenceAuditBatchSize: parseBoundedNumber(
      raw.aggressiveEvidenceAuditBatchSize,
      fallback.aggressiveEvidenceAuditBatchSize,
      RUNTIME_NUMBER_BOUNDS.aggressiveEvidenceAuditBatchSize,
    ),
    aggressiveMaxTimePerProductMs: parseBoundedNumber(
      raw.aggressiveMaxTimePerProductMs,
      fallback.aggressiveMaxTimePerProductMs,
      RUNTIME_NUMBER_BOUNDS.aggressiveMaxTimePerProductMs,
    ),
    aggressiveThoroughFromRound: parseBoundedNumber(
      raw.aggressiveThoroughFromRound,
      fallback.aggressiveThoroughFromRound,
      RUNTIME_NUMBER_BOUNDS.aggressiveThoroughFromRound,
    ),
    aggressiveRound1MaxUrls: parseBoundedNumber(
      raw.aggressiveRound1MaxUrls,
      fallback.aggressiveRound1MaxUrls,
      RUNTIME_NUMBER_BOUNDS.aggressiveRound1MaxUrls,
    ),
    aggressiveRound1MaxCandidateUrls: parseBoundedNumber(
      raw.aggressiveRound1MaxCandidateUrls,
      fallback.aggressiveRound1MaxCandidateUrls,
      RUNTIME_NUMBER_BOUNDS.aggressiveRound1MaxCandidateUrls,
    ),
    aggressiveLlmMaxCallsPerRound: parseBoundedNumber(
      raw.aggressiveLlmMaxCallsPerRound,
      fallback.aggressiveLlmMaxCallsPerRound,
      RUNTIME_NUMBER_BOUNDS.aggressiveLlmMaxCallsPerRound,
    ),
    aggressiveLlmMaxCallsPerProductTotal: parseBoundedNumber(
      raw.aggressiveLlmMaxCallsPerProductTotal,
      fallback.aggressiveLlmMaxCallsPerProductTotal,
      RUNTIME_NUMBER_BOUNDS.aggressiveLlmMaxCallsPerProductTotal,
    ),
    aggressiveLlmTargetMaxFields: parseBoundedNumber(
      raw.aggressiveLlmTargetMaxFields,
      fallback.aggressiveLlmTargetMaxFields,
      RUNTIME_NUMBER_BOUNDS.aggressiveLlmTargetMaxFields,
    ),
    aggressiveLlmDiscoveryPasses: parseBoundedNumber(
      raw.aggressiveLlmDiscoveryPasses,
      fallback.aggressiveLlmDiscoveryPasses,
      RUNTIME_NUMBER_BOUNDS.aggressiveLlmDiscoveryPasses,
    ),
    aggressiveLlmDiscoveryQueryCap: parseBoundedNumber(
      raw.aggressiveLlmDiscoveryQueryCap,
      fallback.aggressiveLlmDiscoveryQueryCap,
      RUNTIME_NUMBER_BOUNDS.aggressiveLlmDiscoveryQueryCap,
    ),
    uberMaxRounds: parseBoundedNumber(
      raw.uberMaxRounds,
      fallback.uberMaxRounds,
      RUNTIME_NUMBER_BOUNDS.uberMaxRounds,
    ),
    cortexSyncTimeoutMs: parseBoundedNumber(
      raw.cortexSyncTimeoutMs,
      fallback.cortexSyncTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.cortexSyncTimeoutMs,
    ),
    cortexAsyncPollIntervalMs: parseBoundedNumber(
      raw.cortexAsyncPollIntervalMs,
      fallback.cortexAsyncPollIntervalMs,
      RUNTIME_NUMBER_BOUNDS.cortexAsyncPollIntervalMs,
    ),
    cortexAsyncMaxWaitMs: parseBoundedNumber(
      raw.cortexAsyncMaxWaitMs,
      fallback.cortexAsyncMaxWaitMs,
      RUNTIME_NUMBER_BOUNDS.cortexAsyncMaxWaitMs,
    ),
    cortexEnsureReadyTimeoutMs: parseBoundedNumber(
      raw.cortexEnsureReadyTimeoutMs,
      fallback.cortexEnsureReadyTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.cortexEnsureReadyTimeoutMs,
    ),
    cortexStartReadyTimeoutMs: parseBoundedNumber(
      raw.cortexStartReadyTimeoutMs,
      fallback.cortexStartReadyTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.cortexStartReadyTimeoutMs,
    ),
    cortexFailureThreshold: parseBoundedNumber(
      raw.cortexFailureThreshold,
      fallback.cortexFailureThreshold,
      RUNTIME_NUMBER_BOUNDS.cortexFailureThreshold,
    ),
    cortexCircuitOpenMs: parseBoundedNumber(
      raw.cortexCircuitOpenMs,
      fallback.cortexCircuitOpenMs,
      RUNTIME_NUMBER_BOUNDS.cortexCircuitOpenMs,
    ),
    cortexEscalateConfidenceLt: parseBoundedNumber(
      raw.cortexEscalateConfidenceLt,
      fallback.cortexEscalateConfidenceLt,
      RUNTIME_NUMBER_BOUNDS.cortexEscalateConfidenceLt,
    ),
    cortexMaxDeepFieldsPerProduct: parseBoundedNumber(
      raw.cortexMaxDeepFieldsPerProduct,
      fallback.cortexMaxDeepFieldsPerProduct,
      RUNTIME_NUMBER_BOUNDS.cortexMaxDeepFieldsPerProduct,
    ),
    userAgent: parseString(raw.userAgent, fallback.userAgent, true),
    pdfPreferredBackend: parseString(raw.pdfPreferredBackend, fallback.pdfPreferredBackend, true),
    capturePageScreenshotFormat: parseString(raw.capturePageScreenshotFormat, fallback.capturePageScreenshotFormat, true),
    capturePageScreenshotSelectors: parseString(raw.capturePageScreenshotSelectors, fallback.capturePageScreenshotSelectors, true),
    runtimeScreenshotMode: parseString(raw.runtimeScreenshotMode, fallback.runtimeScreenshotMode, true),
    visualAssetReviewFormat: parseString(raw.visualAssetReviewFormat, fallback.visualAssetReviewFormat, true),
    visualAssetHeroSelectorMapJson: parseString(raw.visualAssetHeroSelectorMapJson, fallback.visualAssetHeroSelectorMapJson, true),
    runtimeControlFile: parseString(raw.runtimeControlFile, fallback.runtimeControlFile, true),
    staticDomMode: parseString(raw.staticDomMode, fallback.staticDomMode, true),
    specDbDir: parseString(raw.specDbDir, fallback.specDbDir, true),
    articleExtractorDomainPolicyMapJson: parseString(raw.articleExtractorDomainPolicyMapJson, fallback.articleExtractorDomainPolicyMapJson, true),
    structuredMetadataExtructUrl: parseString(raw.structuredMetadataExtructUrl, fallback.structuredMetadataExtructUrl, true),
    cortexBaseUrl: parseString(raw.cortexBaseUrl, fallback.cortexBaseUrl, true),
    cortexApiKey: parseString(raw.cortexApiKey, fallback.cortexApiKey, true),
    cortexAsyncBaseUrl: parseString(raw.cortexAsyncBaseUrl, fallback.cortexAsyncBaseUrl, true),
    cortexAsyncSubmitPath: parseString(raw.cortexAsyncSubmitPath, fallback.cortexAsyncSubmitPath, true),
    cortexAsyncStatusPath: parseString(raw.cortexAsyncStatusPath, fallback.cortexAsyncStatusPath, true),
    cortexModelFast: parseString(raw.cortexModelFast, fallback.cortexModelFast, true),
    cortexModelAudit: parseString(raw.cortexModelAudit, fallback.cortexModelAudit, true),
    cortexModelDom: parseString(raw.cortexModelDom, fallback.cortexModelDom, true),
    cortexModelReasoningDeep: parseString(raw.cortexModelReasoningDeep, fallback.cortexModelReasoningDeep, true),
    cortexModelVision: parseString(raw.cortexModelVision, fallback.cortexModelVision, true),
    cortexModelSearchFast: parseString(raw.cortexModelSearchFast, fallback.cortexModelSearchFast, true),
    cortexModelRerankFast: parseString(raw.cortexModelRerankFast, fallback.cortexModelRerankFast, true),
    cortexModelSearchDeep: parseString(raw.cortexModelSearchDeep, fallback.cortexModelSearchDeep, true),
    helperFilesRoot: parseString(raw.helperFilesRoot, fallback.helperFilesRoot, true),
    batchStrategy: parseString(raw.batchStrategy, fallback.batchStrategy, true),
    dynamicFetchPolicyMapJson: parseString(raw.dynamicFetchPolicyMapJson, fallback.dynamicFetchPolicyMapJson, true),
    searchProfileCapMapJson: parseString(raw.searchProfileCapMapJson, fallback.searchProfileCapMapJson, true),
    serpRerankerWeightMapJson: parseString(raw.serpRerankerWeightMapJson, fallback.serpRerankerWeightMapJson, true),
    fetchSchedulerInternalsMapJson: parseString(raw.fetchSchedulerInternalsMapJson, fallback.fetchSchedulerInternalsMapJson, true),
    retrievalInternalsMapJson: parseString(raw.retrievalInternalsMapJson, fallback.retrievalInternalsMapJson, true),
    evidencePackLimitsMapJson: parseString(raw.evidencePackLimitsMapJson, fallback.evidencePackLimitsMapJson, true),
    identityGateThresholdBoundsMapJson: parseString(raw.identityGateThresholdBoundsMapJson, fallback.identityGateThresholdBoundsMapJson, true),
    parsingConfidenceBaseMapJson: parseString(raw.parsingConfidenceBaseMapJson, fallback.parsingConfidenceBaseMapJson, true),
    repairDedupeRule: parseString(raw.repairDedupeRule, fallback.repairDedupeRule, true) as RuntimeRepairDedupeRule,
    automationQueueStorageEngine: parseString(
      raw.automationQueueStorageEngine,
      fallback.automationQueueStorageEngine,
      true,
    ) as RuntimeAutomationQueueStorageEngine,
    scannedPdfOcrEnabled: parseBoolean(raw.scannedPdfOcrEnabled, fallback.scannedPdfOcrEnabled),
    scannedPdfOcrPromoteCandidates: parseBoolean(raw.scannedPdfOcrPromoteCandidates, fallback.scannedPdfOcrPromoteCandidates),
    llmPlanDiscoveryQueries: parseBoolean(raw.llmPlanDiscoveryQueries ?? raw.phase2LlmEnabled, fallback.llmPlanDiscoveryQueries),
    phase2LlmEnabled: parseBoolean(raw.phase2LlmEnabled ?? raw.llmPlanDiscoveryQueries, fallback.phase2LlmEnabled),
    llmSerpRerankEnabled: parseBoolean(raw.llmSerpRerankEnabled ?? raw.phase3LlmTriageEnabled, fallback.llmSerpRerankEnabled),
    phase3LlmTriageEnabled: parseBoolean(raw.phase3LlmTriageEnabled ?? raw.llmSerpRerankEnabled, fallback.phase3LlmTriageEnabled),
    llmExtractionCacheEnabled: parseBoolean(raw.llmExtractionCacheEnabled, fallback.llmExtractionCacheEnabled),
    llmFallbackEnabled: parseBoolean(raw.llmFallbackEnabled, fallback.llmFallbackEnabled),
    llmExtractSkipLowSignal: parseBoolean(raw.llmExtractSkipLowSignal, fallback.llmExtractSkipLowSignal),
    llmReasoningMode: parseBoolean(raw.llmReasoningMode, fallback.llmReasoningMode),
    llmDisableBudgetGuards: parseBoolean(raw.llmDisableBudgetGuards, fallback.llmDisableBudgetGuards),
    llmVerifyMode: parseBoolean(raw.llmVerifyMode, fallback.llmVerifyMode),
    localMode: parseBoolean(raw.localMode, fallback.localMode),
    dryRun: parseBoolean(raw.dryRun, fallback.dryRun),
    mirrorToS3: parseBoolean(raw.mirrorToS3, fallback.mirrorToS3),
    mirrorToS3Input: parseBoolean(raw.mirrorToS3Input, fallback.mirrorToS3Input),
    writeMarkdownSummary: parseBoolean(raw.writeMarkdownSummary, fallback.writeMarkdownSummary),
    llmEnabled: parseBoolean(raw.llmEnabled, fallback.llmEnabled),
    llmWriteSummary: parseBoolean(raw.llmWriteSummary, fallback.llmWriteSummary),
    reextractIndexed: parseBoolean(raw.reextractIndexed, fallback.reextractIndexed),
    fetchCandidateSources: parseBoolean(raw.fetchCandidateSources, fallback.fetchCandidateSources),
    manufacturerBroadDiscovery: parseBoolean(raw.manufacturerBroadDiscovery, fallback.manufacturerBroadDiscovery),
    manufacturerSeedSearchUrls: parseBoolean(raw.manufacturerSeedSearchUrls, fallback.manufacturerSeedSearchUrls),
    manufacturerDeepResearchEnabled: parseBoolean(raw.manufacturerDeepResearchEnabled, fallback.manufacturerDeepResearchEnabled),
    pdfBackendRouterEnabled: parseBoolean(raw.pdfBackendRouterEnabled, fallback.pdfBackendRouterEnabled),
    capturePageScreenshotEnabled: parseBoolean(raw.capturePageScreenshotEnabled, fallback.capturePageScreenshotEnabled),
    runtimeCaptureScreenshots: parseBoolean(raw.runtimeCaptureScreenshots, fallback.runtimeCaptureScreenshots),
    visualAssetCaptureEnabled: parseBoolean(raw.visualAssetCaptureEnabled, fallback.visualAssetCaptureEnabled),
    visualAssetStoreOriginal: parseBoolean(raw.visualAssetStoreOriginal, fallback.visualAssetStoreOriginal),
    visualAssetPhashEnabled: parseBoolean(raw.visualAssetPhashEnabled, fallback.visualAssetPhashEnabled),
    chartExtractionEnabled: parseBoolean(raw.chartExtractionEnabled, fallback.chartExtractionEnabled),
    articleExtractorV2Enabled: parseBoolean(raw.articleExtractorV2Enabled, fallback.articleExtractorV2Enabled),
    staticDomExtractorEnabled: parseBoolean(raw.staticDomExtractorEnabled, fallback.staticDomExtractorEnabled),
    htmlTableExtractorV2: parseBoolean(raw.htmlTableExtractorV2, fallback.htmlTableExtractorV2),
    structuredMetadataExtructEnabled: parseBoolean(raw.structuredMetadataExtructEnabled, fallback.structuredMetadataExtructEnabled),
    structuredMetadataExtructCacheEnabled: parseBoolean(raw.structuredMetadataExtructCacheEnabled, fallback.structuredMetadataExtructCacheEnabled),
    helperFilesEnabled: parseBoolean(raw.helperFilesEnabled, fallback.helperFilesEnabled),
    helperSupportiveEnabled: parseBoolean(raw.helperSupportiveEnabled, fallback.helperSupportiveEnabled),
    helperSupportiveFillMissing: parseBoolean(raw.helperSupportiveFillMissing, fallback.helperSupportiveFillMissing),
    helperAutoSeedTargets: parseBoolean(raw.helperAutoSeedTargets, fallback.helperAutoSeedTargets),
    driftDetectionEnabled: parseBoolean(raw.driftDetectionEnabled, fallback.driftDetectionEnabled),
    driftAutoRepublish: parseBoolean(raw.driftAutoRepublish, fallback.driftAutoRepublish),
    aggressiveModeEnabled: parseBoolean(raw.aggressiveModeEnabled, fallback.aggressiveModeEnabled),
    aggressiveEvidenceAuditEnabled: parseBoolean(raw.aggressiveEvidenceAuditEnabled, fallback.aggressiveEvidenceAuditEnabled),
    uberAggressiveEnabled: parseBoolean(raw.uberAggressiveEnabled, fallback.uberAggressiveEnabled),
    cortexEnabled: parseBoolean(raw.cortexEnabled, fallback.cortexEnabled),
    cortexAsyncEnabled: parseBoolean(raw.cortexAsyncEnabled, fallback.cortexAsyncEnabled),
    cortexAutoStart: parseBoolean(raw.cortexAutoStart, fallback.cortexAutoStart),
    cortexAutoRestartOnAuth: parseBoolean(raw.cortexAutoRestartOnAuth, fallback.cortexAutoRestartOnAuth),
    cortexEscalateIfConflict: parseBoolean(raw.cortexEscalateIfConflict, fallback.cortexEscalateIfConflict),
    cortexEscalateCriticalOnly: parseBoolean(raw.cortexEscalateCriticalOnly, fallback.cortexEscalateCriticalOnly),
    allowBelowPassTargetFill: parseBoolean(raw.allowBelowPassTargetFill, fallback.allowBelowPassTargetFill),
    indexingHelperFilesEnabled: parseBoolean(raw.indexingHelperFilesEnabled, fallback.indexingHelperFilesEnabled),
    disableGoogleCse: parseBoolean(raw.disableGoogleCse, fallback.disableGoogleCse),
    cseRescueOnlyMode: parseBoolean(raw.cseRescueOnlyMode, fallback.cseRescueOnlyMode),
    duckduckgoEnabled: parseBoolean(raw.duckduckgoEnabled, fallback.duckduckgoEnabled),
    discoveryEnabled: parseBoolean(raw.discoveryEnabled, fallback.discoveryEnabled),
    dynamicCrawleeEnabled: parseBoolean(raw.dynamicCrawleeEnabled, fallback.dynamicCrawleeEnabled),
    crawleeHeadless: parseBoolean(raw.crawleeHeadless, fallback.crawleeHeadless),
    fetchSchedulerEnabled: parseBoolean(raw.fetchSchedulerEnabled, fallback.fetchSchedulerEnabled),
    preferHttpFetcher: parseBoolean(raw.preferHttpFetcher, fallback.preferHttpFetcher),
    frontierEnableSqlite: parseBoolean(raw.frontierEnableSqlite, fallback.frontierEnableSqlite),
    frontierStripTrackingParams: parseBoolean(raw.frontierStripTrackingParams, fallback.frontierStripTrackingParams),
    frontierRepairSearchEnabled: parseBoolean(raw.frontierRepairSearchEnabled, fallback.frontierRepairSearchEnabled),
    autoScrollEnabled: parseBoolean(raw.autoScrollEnabled, fallback.autoScrollEnabled),
    graphqlReplayEnabled: parseBoolean(raw.graphqlReplayEnabled, fallback.graphqlReplayEnabled),
    robotsTxtCompliant: parseBoolean(raw.robotsTxtCompliant, fallback.robotsTxtCompliant),
    runtimeScreencastEnabled: parseBoolean(raw.runtimeScreencastEnabled, fallback.runtimeScreencastEnabled),
    runtimeTraceEnabled: parseBoolean(raw.runtimeTraceEnabled, fallback.runtimeTraceEnabled),
    runtimeTraceLlmPayloads: parseBoolean(raw.runtimeTraceLlmPayloads, fallback.runtimeTraceLlmPayloads),
    eventsJsonWrite: parseBoolean(raw.eventsJsonWrite, fallback.eventsJsonWrite),
    indexingSchemaPacketsValidationEnabled: parseBoolean(raw.indexingSchemaPacketsValidationEnabled, fallback.indexingSchemaPacketsValidationEnabled),
    indexingSchemaPacketsValidationStrict: parseBoolean(raw.indexingSchemaPacketsValidationStrict, fallback.indexingSchemaPacketsValidationStrict),
    queueJsonWrite: parseBoolean(raw.queueJsonWrite, fallback.queueJsonWrite),
    billingJsonWrite: parseBoolean(raw.billingJsonWrite, fallback.billingJsonWrite),
    brainJsonWrite: parseBoolean(raw.brainJsonWrite, fallback.brainJsonWrite),
    intelJsonWrite: parseBoolean(raw.intelJsonWrite, fallback.intelJsonWrite),
    corpusJsonWrite: parseBoolean(raw.corpusJsonWrite, fallback.corpusJsonWrite),
    learningJsonWrite: parseBoolean(raw.learningJsonWrite, fallback.learningJsonWrite),
    cacheJsonWrite: parseBoolean(raw.cacheJsonWrite, fallback.cacheJsonWrite),
    authoritySnapshotEnabled: parseBoolean(raw.authoritySnapshotEnabled, fallback.authoritySnapshotEnabled),
    selfImproveEnabled: parseBoolean(raw.selfImproveEnabled, fallback.selfImproveEnabled),
  };
}

function settingLabel(label: string, tip: string) {
  return (
    <span className="inline-flex items-center gap-1 sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>
      {label}
      <Tip text={tip} />
    </span>
  );
}

function SettingGroupBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      className="space-y-2.5 rounded border px-3 py-2.5"
      style={{
        borderColor: 'var(--sf-border)',
        backgroundColor: 'var(--sf-surface)',
      }}
    >
      <div className="flex items-center gap-2">
        <div className="sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
          {title}
        </div>
        <div className="h-px flex-1" style={{ backgroundColor: 'var(--sf-border)' }} />
      </div>
      {children}
    </section>
  );
}

function SettingRow({
  label,
  tip,
  children,
  disabled = false,
  description,
}: {
  label: string;
  tip: string;
  children: ReactNode;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <div className={`grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] md:items-center ${disabled ? 'opacity-55 pointer-events-none select-none' : ''}`}>
      <div>
        {settingLabel(label, tip)}
        {description ? (
          <div className="mt-0.5 sf-text-caption" style={{ color: 'var(--sf-muted)' }}>{description}</div>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

function SettingToggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? 'enabled' : 'disabled'}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`inline-flex w-full items-center justify-between sf-switch px-2.5 py-1.5 sf-text-label font-semibold transition focus:outline-none focus:ring-2 focus:ring-accent/25 ${
        checked
          ? 'sf-switch-on'
          : 'sf-switch-off'
      } disabled:opacity-60`}
    >
      <span>{checked ? 'Enabled' : 'Disabled'}</span>
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full sf-switch-track transition ${
          checked
            ? 'sf-switch-track-on'
            : ''
        }`}
        aria-hidden="true"
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full sf-switch-thumb transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

function FlowOptionPanel({
  title,
  subtitle,
  children,
  disabled = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <section
      className={`rounded sf-surface-elevated p-3.5 space-y-3 ${
        disabled ? 'opacity-55 pointer-events-none select-none' : ''
      }`}
    >
      <header className="space-y-0.5">
        <div className="sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-text)' }}>
          {title}
        </div>
        <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>{subtitle}</p>
      </header>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function RuntimeStepIcon({
  id,
  active,
  enabled = true,
}: {
  id: RuntimeStepId;
  active: boolean;
  enabled?: boolean;
}) {
  const toneClass = active
    ? 'sf-callout sf-callout-info'
    : 'sf-callout sf-callout-neutral';

  return (
    <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded ${toneClass}`}>
      <svg
        viewBox="0 0 24 24"
        className="h-4.5 w-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {id === 'run-setup' ? (
          <>
            <path d="M4 6h16M4 12h16M4 18h16" />
            <circle cx="9" cy="6" r="1.4" />
            <circle cx="15" cy="12" r="1.4" />
            <circle cx="11" cy="18" r="1.4" />
          </>
        ) : null}
        {id === 'run-output' ? (
          <>
            <path d="M4 6h16v12H4z" />
            <path d="M4 11h16" />
            <path d="M8 15h8" />
          </>
        ) : null}
        {id === 'run-intelligence' ? (
          <>
            <circle cx="12" cy="8" r="3" />
            <path d="M4 20c0-3.3 3.6-6 8-6s8 2.7 8 6" />
            <path d="M8 8h1M15 8h1" />
          </>
        ) : null}
        {id === 'observability-trace' ? (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7v5l3 2" />
            <path d="M7 3v3M17 3v3" />
          </>
        ) : null}
        {id === 'fetch-render' ? (
          <>
            <circle cx="12" cy="12" r="8" />
            <path d="M4 12h16" />
            <path d="M12 4c2 2.3 3 5.2 3 8s-1 5.7-3 8c-2-2.3-3-5.2-3-8s1-5.7 3-8Z" />
          </>
        ) : null}
        {id === 'ocr' ? (
          <>
            <path d="M5 4h4M15 4h4M5 20h4M15 20h4" />
            <path d="M4 5v4M4 15v4M20 5v4M20 15v4" />
            <path d="M8 9h8M8 12h6M8 15h8" />
          </>
        ) : null}
        {id === 'planner-triage' ? (
          <>
            <circle cx="6" cy="6" r="2" />
            <circle cx="18" cy="6" r="2" />
            <circle cx="12" cy="18" r="2" />
            <path d="M8 6h8" />
            <path d="M12 8v8" />
          </>
        ) : null}
        {id === 'role-routing' ? (
          <>
            <path d="M4 7h10" />
            <path d="m11 4 3 3-3 3" />
            <path d="M4 12h6" />
            <path d="M4 17h10" />
            <path d="m11 14 3 3-3 3" />
          </>
        ) : null}
        {id === 'fallback-routing' ? (
          <>
            <path d="m12 3 8 4v6c0 5.3-3.5 8.2-8 8.9-4.5-.7-8-3.6-8-8.9V7z" />
            <path d="M9.2 12a2.9 2.9 0 1 1 2.2 2.8" />
            <path d="M9.2 9v3h3" />
          </>
        ) : null}
      </svg>
    </span>
  );
}

function renderDisabledHint(message: string) {
  return (
    <div className="rounded sf-callout sf-callout-neutral px-3 py-2 sf-text-label">
      {message}
    </div>
  );
}

function runtimeSubStepDomId(id: string) {
  return `runtime-flow-substep-${id}`;
}

interface RuntimeSettingsFlowCardProps {
  actionPortalTarget?: HTMLElement | null;
  suppressInlineHeaderControls?: boolean;
}

export function RuntimeSettingsFlowCard({
  actionPortalTarget = null,
  suppressInlineHeaderControls = false,
}: RuntimeSettingsFlowCardProps = {}) {
  const queryClient = useQueryClient();
  const runtimeAutoSaveEnabled = useUiStore((state) => state.runtimeAutoSaveEnabled);
  const setRuntimeAutoSaveEnabled = useUiStore((state) => state.setRuntimeAutoSaveEnabled);
  const runtimeReadyFlag = useSettingsAuthorityStore((state) => state.snapshot.runtimeReady);

  const runtimeBootstrap = useMemo(
    () => readRuntimeSettingsBootstrap(queryClient, RUNTIME_SETTING_DEFAULTS),
    [queryClient],
  );
  const runtimeManifestDefaults = useMemo(() => toRuntimeDraft(RUNTIME_SETTING_DEFAULTS), []);
  const runtimeBootstrapDraft = useMemo(
    () => normalizeRuntimeDraft(undefined, runtimeBootstrap),
    [runtimeBootstrap],
  );

  const [activeStep, setActiveStep] = usePersistedTab<RuntimeStepId>(
    'pipeline-settings:runtime:active-step',
    'run-setup',
    { validValues: RUNTIME_STEP_IDS },
  );

  const { data: indexingLlmConfig } = useQuery({
    queryKey: ['indexing', 'llm-config'],
    queryFn: () => api.get<IndexingLlmConfigResponse>('/indexing/llm-config'),
  });

  const llmTokenProfileLookup = useMemo(() => {
    const lookup = new Map<string, { default_output_tokens: number; max_output_tokens: number }>();
    for (const row of indexingLlmConfig?.model_token_profiles || []) {
      const token = normalizeToken(row.model);
      if (!token) continue;
      lookup.set(token, {
        default_output_tokens: parseRuntimeLlmTokenCap(row.default_output_tokens) || 0,
        max_output_tokens: parseRuntimeLlmTokenCap(row.max_output_tokens) || 0,
      });
    }
    return lookup;
  }, [indexingLlmConfig]);

  const llmTokenContractPresetMax = useMemo(() => {
    const seeded = [
      ...(Array.isArray(indexingLlmConfig?.token_presets) ? indexingLlmConfig.token_presets : []),
      runtimeManifestDefaults.llmTokensPlan,
      runtimeManifestDefaults.llmTokensTriage,
      runtimeManifestDefaults.llmTokensFast,
      runtimeManifestDefaults.llmTokensReasoning,
      runtimeManifestDefaults.llmTokensExtract,
      runtimeManifestDefaults.llmTokensValidate,
      runtimeManifestDefaults.llmTokensWrite,
      runtimeManifestDefaults.llmTokensPlanFallback,
      runtimeManifestDefaults.llmTokensExtractFallback,
      runtimeManifestDefaults.llmTokensValidateFallback,
      runtimeManifestDefaults.llmTokensWriteFallback,
    ];
    const cleaned = seeded
      .map((row) => parseRuntimeLlmTokenCap(row))
      .filter((row): row is number => row !== null)
      .sort((a, b) => a - b);
    return cleaned[cleaned.length - 1] || runtimeManifestDefaults.llmTokensPlan;
  }, [indexingLlmConfig, runtimeManifestDefaults]);

  const resolveModelTokenDefaults: RuntimeModelTokenDefaultsResolver = useCallback((model: string) => {
    const profile = llmTokenProfileLookup.get(normalizeToken(model));
    const defaultFromConfig = parseRuntimeLlmTokenCap(indexingLlmConfig?.token_defaults?.plan);
    const fallbackDefault = runtimeManifestDefaults.llmTokensPlan;
    const globalDefault = defaultFromConfig || parseRuntimeLlmTokenCap(fallbackDefault) || LLM_SETTING_LIMITS.maxTokens.min;
    const fallbackMax = llmTokenContractPresetMax || globalDefault;
    const default_output_tokens = parseRuntimeLlmTokenCap(profile?.default_output_tokens) || globalDefault;
    const max_output_tokens = Math.max(
      default_output_tokens,
      parseRuntimeLlmTokenCap(profile?.max_output_tokens) || parseRuntimeLlmTokenCap(fallbackMax) || default_output_tokens,
    );
    return { default_output_tokens, max_output_tokens };
  }, [indexingLlmConfig, llmTokenContractPresetMax, llmTokenProfileLookup, runtimeManifestDefaults.llmTokensPlan]);

  const clampTokenForModel = useCallback((model: string, value: unknown) => (
    clampRuntimeTokenForModel(
      model,
      Number.parseInt(String(value), 10),
      resolveModelTokenDefaults,
    )
  ), [resolveModelTokenDefaults]);

  const payloadFromRuntimeDraft = useCallback((nextRuntimeDraft: RuntimeDraft) => collectRuntimeSettingsPayload({
    runProfile: nextRuntimeDraft.profile,
    profile: nextRuntimeDraft.profile,
    searchProvider: nextRuntimeDraft.searchProvider,
    searxngBaseUrl: String(nextRuntimeDraft.searxngBaseUrl || '').trim(),
    bingSearchEndpoint: String(nextRuntimeDraft.bingSearchEndpoint || '').trim(),
    bingSearchKey: String(nextRuntimeDraft.bingSearchKey || '').trim(),
    googleCseCx: String(nextRuntimeDraft.googleCseCx || '').trim(),
    googleCseKey: String(nextRuntimeDraft.googleCseKey || '').trim(),
    llmPlanApiKey: String(nextRuntimeDraft.llmPlanApiKey || '').trim(),
    duckduckgoBaseUrl: String(nextRuntimeDraft.duckduckgoBaseUrl || '').trim(),
    llmModelPlan: nextRuntimeDraft.phase2LlmModel,
    phase2LlmModel: nextRuntimeDraft.phase2LlmModel,
    llmModelTriage: nextRuntimeDraft.phase3LlmModel,
    phase3LlmModel: nextRuntimeDraft.phase3LlmModel,
    llmModelFast: nextRuntimeDraft.llmModelFast,
    llmModelReasoning: nextRuntimeDraft.llmModelReasoning,
    llmModelExtract: nextRuntimeDraft.llmModelExtract,
    llmModelValidate: nextRuntimeDraft.llmModelValidate,
    llmModelWrite: nextRuntimeDraft.llmModelWrite,
    llmPlanFallbackModel: nextRuntimeDraft.llmFallbackPlanModel,
    llmFallbackPlanModel: nextRuntimeDraft.llmFallbackPlanModel,
    llmExtractFallbackModel: nextRuntimeDraft.llmFallbackExtractModel,
    llmFallbackExtractModel: nextRuntimeDraft.llmFallbackExtractModel,
    llmValidateFallbackModel: nextRuntimeDraft.llmFallbackValidateModel,
    llmFallbackValidateModel: nextRuntimeDraft.llmFallbackValidateModel,
    llmWriteFallbackModel: nextRuntimeDraft.llmFallbackWriteModel,
    llmFallbackWriteModel: nextRuntimeDraft.llmFallbackWriteModel,
    outputMode: String(nextRuntimeDraft.outputMode || '').trim(),
    localInputRoot: String(nextRuntimeDraft.localInputRoot || '').trim(),
    localOutputRoot: String(nextRuntimeDraft.localOutputRoot || '').trim(),
    runtimeEventsKey: String(nextRuntimeDraft.runtimeEventsKey || '').trim(),
    awsRegion: String(nextRuntimeDraft.awsRegion || '').trim(),
    s3Bucket: String(nextRuntimeDraft.s3Bucket || '').trim(),
    s3InputPrefix: String(nextRuntimeDraft.s3InputPrefix || '').trim(),
    s3OutputPrefix: String(nextRuntimeDraft.s3OutputPrefix || '').trim(),
    eloSupabaseAnonKey: String(nextRuntimeDraft.eloSupabaseAnonKey || '').trim(),
    eloSupabaseEndpoint: String(nextRuntimeDraft.eloSupabaseEndpoint || '').trim(),
    llmProvider: String(nextRuntimeDraft.llmProvider || '').trim(),
    llmBaseUrl: String(nextRuntimeDraft.llmBaseUrl || '').trim(),
    openaiApiKey: String(nextRuntimeDraft.openaiApiKey || '').trim(),
    anthropicApiKey: String(nextRuntimeDraft.anthropicApiKey || '').trim(),
    llmPlanProvider: String(nextRuntimeDraft.llmPlanProvider || '').trim(),
    llmPlanBaseUrl: String(nextRuntimeDraft.llmPlanBaseUrl || '').trim(),
    importsRoot: String(nextRuntimeDraft.importsRoot || '').trim(),
    llmExtractionCacheDir: String(nextRuntimeDraft.llmExtractionCacheDir || '').trim(),
    resumeMode: nextRuntimeDraft.resumeMode,
    scannedPdfOcrBackend: nextRuntimeDraft.scannedPdfOcrBackend,
    fetchConcurrency: parseBoundedNumber(
      nextRuntimeDraft.fetchConcurrency,
      runtimeManifestDefaults.fetchConcurrency,
      RUNTIME_NUMBER_BOUNDS.fetchConcurrency,
    ),
    perHostMinDelayMs: parseBoundedNumber(
      nextRuntimeDraft.perHostMinDelayMs,
      runtimeManifestDefaults.perHostMinDelayMs,
      RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs,
    ),
    llmMaxOutputTokensPlan: nextRuntimeDraft.llmTokensPlan,
    llmTokensPlan: nextRuntimeDraft.llmTokensPlan,
    llmMaxOutputTokensTriage: nextRuntimeDraft.llmTokensTriage,
    llmTokensTriage: nextRuntimeDraft.llmTokensTriage,
    llmMaxOutputTokensFast: nextRuntimeDraft.llmTokensFast,
    llmTokensFast: nextRuntimeDraft.llmTokensFast,
    llmMaxOutputTokensReasoning: nextRuntimeDraft.llmTokensReasoning,
    llmTokensReasoning: nextRuntimeDraft.llmTokensReasoning,
    llmMaxOutputTokensExtract: nextRuntimeDraft.llmTokensExtract,
    llmTokensExtract: nextRuntimeDraft.llmTokensExtract,
    llmMaxOutputTokensValidate: nextRuntimeDraft.llmTokensValidate,
    llmTokensValidate: nextRuntimeDraft.llmTokensValidate,
    llmMaxOutputTokensWrite: nextRuntimeDraft.llmTokensWrite,
    llmTokensWrite: nextRuntimeDraft.llmTokensWrite,
    llmMaxOutputTokensPlanFallback: nextRuntimeDraft.llmTokensPlanFallback,
    llmTokensPlanFallback: nextRuntimeDraft.llmTokensPlanFallback,
    llmMaxOutputTokensExtractFallback: nextRuntimeDraft.llmTokensExtractFallback,
    llmTokensExtractFallback: nextRuntimeDraft.llmTokensExtractFallback,
    llmMaxOutputTokensValidateFallback: nextRuntimeDraft.llmTokensValidateFallback,
    llmTokensValidateFallback: nextRuntimeDraft.llmTokensValidateFallback,
    llmMaxOutputTokensWriteFallback: nextRuntimeDraft.llmTokensWriteFallback,
    llmTokensWriteFallback: nextRuntimeDraft.llmTokensWriteFallback,
    resumeWindowHours: parseBoundedNumber(
      nextRuntimeDraft.resumeWindowHours,
      runtimeManifestDefaults.resumeWindowHours,
      RUNTIME_NUMBER_BOUNDS.resumeWindowHours,
    ),
    indexingResumeSeedLimit: parseBoundedNumber(
      nextRuntimeDraft.indexingResumeSeedLimit,
      runtimeManifestDefaults.indexingResumeSeedLimit,
      RUNTIME_NUMBER_BOUNDS.indexingResumeSeedLimit,
    ),
    indexingResumePersistLimit: parseBoundedNumber(
      nextRuntimeDraft.indexingResumePersistLimit,
      runtimeManifestDefaults.indexingResumePersistLimit,
      RUNTIME_NUMBER_BOUNDS.indexingResumePersistLimit,
    ),
    reextractAfterHours: parseBoundedNumber(
      nextRuntimeDraft.reextractAfterHours,
      runtimeManifestDefaults.reextractAfterHours,
      RUNTIME_NUMBER_BOUNDS.reextractAfterHours,
    ),
    scannedPdfOcrMaxPages: parseBoundedNumber(
      nextRuntimeDraft.scannedPdfOcrMaxPages,
      runtimeManifestDefaults.scannedPdfOcrMaxPages,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages,
    ),
    scannedPdfOcrMaxPairs: parseBoundedNumber(
      nextRuntimeDraft.scannedPdfOcrMaxPairs,
      runtimeManifestDefaults.scannedPdfOcrMaxPairs,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs,
    ),
    scannedPdfOcrMinCharsPerPage: parseBoundedNumber(
      nextRuntimeDraft.scannedPdfOcrMinCharsPerPage,
      runtimeManifestDefaults.scannedPdfOcrMinCharsPerPage,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage,
    ),
    scannedPdfOcrMinLinesPerPage: parseBoundedNumber(
      nextRuntimeDraft.scannedPdfOcrMinLinesPerPage,
      runtimeManifestDefaults.scannedPdfOcrMinLinesPerPage,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage,
    ),
    scannedPdfOcrMinConfidence: parseBoundedNumber(
      nextRuntimeDraft.scannedPdfOcrMinConfidence,
      runtimeManifestDefaults.scannedPdfOcrMinConfidence,
      RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence,
    ),
    crawleeRequestHandlerTimeoutSecs: parseBoundedNumber(
      nextRuntimeDraft.crawleeRequestHandlerTimeoutSecs,
      runtimeManifestDefaults.crawleeRequestHandlerTimeoutSecs,
      RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs,
    ),
    dynamicFetchRetryBudget: parseBoundedNumber(
      nextRuntimeDraft.dynamicFetchRetryBudget,
      runtimeManifestDefaults.dynamicFetchRetryBudget,
      RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget,
    ),
    dynamicFetchRetryBackoffMs: parseBoundedNumber(
      nextRuntimeDraft.dynamicFetchRetryBackoffMs,
      runtimeManifestDefaults.dynamicFetchRetryBackoffMs,
      RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs,
    ),
    fetchSchedulerMaxRetries: parseBoundedNumber(
      nextRuntimeDraft.fetchSchedulerMaxRetries,
      runtimeManifestDefaults.fetchSchedulerMaxRetries,
      RUNTIME_NUMBER_BOUNDS.fetchSchedulerMaxRetries,
    ),
    fetchSchedulerFallbackWaitMs: parseBoundedNumber(
      nextRuntimeDraft.fetchSchedulerFallbackWaitMs,
      runtimeManifestDefaults.fetchSchedulerFallbackWaitMs,
      RUNTIME_NUMBER_BOUNDS.fetchSchedulerFallbackWaitMs,
    ),
    pageGotoTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.pageGotoTimeoutMs,
      runtimeManifestDefaults.pageGotoTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.pageGotoTimeoutMs,
    ),
    pageNetworkIdleTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.pageNetworkIdleTimeoutMs,
      runtimeManifestDefaults.pageNetworkIdleTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.pageNetworkIdleTimeoutMs,
    ),
    postLoadWaitMs: parseBoundedNumber(
      nextRuntimeDraft.postLoadWaitMs,
      runtimeManifestDefaults.postLoadWaitMs,
      RUNTIME_NUMBER_BOUNDS.postLoadWaitMs,
    ),
    frontierDbPath: String(nextRuntimeDraft.frontierDbPath || '').trim(),
    frontierQueryCooldownSeconds: parseBoundedNumber(
      nextRuntimeDraft.frontierQueryCooldownSeconds,
      runtimeManifestDefaults.frontierQueryCooldownSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierQueryCooldownSeconds,
    ),
    frontierCooldown404Seconds: parseBoundedNumber(
      nextRuntimeDraft.frontierCooldown404Seconds,
      runtimeManifestDefaults.frontierCooldown404Seconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown404Seconds,
    ),
    frontierCooldown404RepeatSeconds: parseBoundedNumber(
      nextRuntimeDraft.frontierCooldown404RepeatSeconds,
      runtimeManifestDefaults.frontierCooldown404RepeatSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown404RepeatSeconds,
    ),
    frontierCooldown410Seconds: parseBoundedNumber(
      nextRuntimeDraft.frontierCooldown410Seconds,
      runtimeManifestDefaults.frontierCooldown410Seconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown410Seconds,
    ),
    frontierCooldownTimeoutSeconds: parseBoundedNumber(
      nextRuntimeDraft.frontierCooldownTimeoutSeconds,
      runtimeManifestDefaults.frontierCooldownTimeoutSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldownTimeoutSeconds,
    ),
    frontierCooldown403BaseSeconds: parseBoundedNumber(
      nextRuntimeDraft.frontierCooldown403BaseSeconds,
      runtimeManifestDefaults.frontierCooldown403BaseSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown403BaseSeconds,
    ),
    frontierCooldown429BaseSeconds: parseBoundedNumber(
      nextRuntimeDraft.frontierCooldown429BaseSeconds,
      runtimeManifestDefaults.frontierCooldown429BaseSeconds,
      RUNTIME_NUMBER_BOUNDS.frontierCooldown429BaseSeconds,
    ),
    frontierBackoffMaxExponent: parseBoundedNumber(
      nextRuntimeDraft.frontierBackoffMaxExponent,
      runtimeManifestDefaults.frontierBackoffMaxExponent,
      RUNTIME_NUMBER_BOUNDS.frontierBackoffMaxExponent,
    ),
    frontierPathPenaltyNotfoundThreshold: parseBoundedNumber(
      nextRuntimeDraft.frontierPathPenaltyNotfoundThreshold,
      runtimeManifestDefaults.frontierPathPenaltyNotfoundThreshold,
      RUNTIME_NUMBER_BOUNDS.frontierPathPenaltyNotfoundThreshold,
    ),
    frontierBlockedDomainThreshold: parseBoundedNumber(
      nextRuntimeDraft.frontierBlockedDomainThreshold,
      runtimeManifestDefaults.frontierBlockedDomainThreshold,
      RUNTIME_NUMBER_BOUNDS.frontierBlockedDomainThreshold,
    ),
    autoScrollPasses: parseBoundedNumber(
      nextRuntimeDraft.autoScrollPasses,
      runtimeManifestDefaults.autoScrollPasses,
      RUNTIME_NUMBER_BOUNDS.autoScrollPasses,
    ),
    autoScrollDelayMs: parseBoundedNumber(
      nextRuntimeDraft.autoScrollDelayMs,
      runtimeManifestDefaults.autoScrollDelayMs,
      RUNTIME_NUMBER_BOUNDS.autoScrollDelayMs,
    ),
    maxGraphqlReplays: parseBoundedNumber(
      nextRuntimeDraft.maxGraphqlReplays,
      runtimeManifestDefaults.maxGraphqlReplays,
      RUNTIME_NUMBER_BOUNDS.maxGraphqlReplays,
    ),
    maxNetworkResponsesPerPage: parseBoundedNumber(
      nextRuntimeDraft.maxNetworkResponsesPerPage,
      runtimeManifestDefaults.maxNetworkResponsesPerPage,
      RUNTIME_NUMBER_BOUNDS.maxNetworkResponsesPerPage,
    ),
    robotsTxtTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.robotsTxtTimeoutMs,
      runtimeManifestDefaults.robotsTxtTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.robotsTxtTimeoutMs,
    ),
    endpointSignalLimit: parseBoundedNumber(
      nextRuntimeDraft.endpointSignalLimit,
      runtimeManifestDefaults.endpointSignalLimit,
      RUNTIME_NUMBER_BOUNDS.endpointSignalLimit,
    ),
    endpointSuggestionLimit: parseBoundedNumber(
      nextRuntimeDraft.endpointSuggestionLimit,
      runtimeManifestDefaults.endpointSuggestionLimit,
      RUNTIME_NUMBER_BOUNDS.endpointSuggestionLimit,
    ),
    endpointNetworkScanLimit: parseBoundedNumber(
      nextRuntimeDraft.endpointNetworkScanLimit,
      runtimeManifestDefaults.endpointNetworkScanLimit,
      RUNTIME_NUMBER_BOUNDS.endpointNetworkScanLimit,
    ),
    discoveryMaxQueries: parseBoundedNumber(
      nextRuntimeDraft.discoveryMaxQueries,
      runtimeManifestDefaults.discoveryMaxQueries,
      RUNTIME_NUMBER_BOUNDS.discoveryMaxQueries,
    ),
    discoveryResultsPerQuery: parseBoundedNumber(
      nextRuntimeDraft.discoveryResultsPerQuery,
      runtimeManifestDefaults.discoveryResultsPerQuery,
      RUNTIME_NUMBER_BOUNDS.discoveryResultsPerQuery,
    ),
    discoveryMaxDiscovered: parseBoundedNumber(
      nextRuntimeDraft.discoveryMaxDiscovered,
      runtimeManifestDefaults.discoveryMaxDiscovered,
      RUNTIME_NUMBER_BOUNDS.discoveryMaxDiscovered,
    ),
    discoveryQueryConcurrency: parseBoundedNumber(
      nextRuntimeDraft.discoveryQueryConcurrency,
      runtimeManifestDefaults.discoveryQueryConcurrency,
      RUNTIME_NUMBER_BOUNDS.discoveryQueryConcurrency,
    ),
    maxUrlsPerProduct: parseBoundedNumber(
      nextRuntimeDraft.maxUrlsPerProduct,
      runtimeManifestDefaults.maxUrlsPerProduct,
      RUNTIME_NUMBER_BOUNDS.maxUrlsPerProduct,
    ),
    maxCandidateUrls: parseBoundedNumber(
      nextRuntimeDraft.maxCandidateUrls,
      runtimeManifestDefaults.maxCandidateUrls,
      RUNTIME_NUMBER_BOUNDS.maxCandidateUrls,
    ),
    maxPagesPerDomain: parseBoundedNumber(
      nextRuntimeDraft.maxPagesPerDomain,
      runtimeManifestDefaults.maxPagesPerDomain,
      RUNTIME_NUMBER_BOUNDS.maxPagesPerDomain,
    ),
    uberMaxUrlsPerProduct: parseBoundedNumber(
      nextRuntimeDraft.uberMaxUrlsPerProduct,
      runtimeManifestDefaults.uberMaxUrlsPerProduct,
      RUNTIME_NUMBER_BOUNDS.uberMaxUrlsPerProduct,
    ),
    uberMaxUrlsPerDomain: parseBoundedNumber(
      nextRuntimeDraft.uberMaxUrlsPerDomain,
      runtimeManifestDefaults.uberMaxUrlsPerDomain,
      RUNTIME_NUMBER_BOUNDS.uberMaxUrlsPerDomain,
    ),
    maxRunSeconds: parseBoundedNumber(
      nextRuntimeDraft.maxRunSeconds,
      runtimeManifestDefaults.maxRunSeconds,
      RUNTIME_NUMBER_BOUNDS.maxRunSeconds,
    ),
    maxJsonBytes: parseBoundedNumber(
      nextRuntimeDraft.maxJsonBytes,
      runtimeManifestDefaults.maxJsonBytes,
      RUNTIME_NUMBER_BOUNDS.maxJsonBytes,
    ),
    maxPdfBytes: parseBoundedNumber(
      nextRuntimeDraft.maxPdfBytes,
      runtimeManifestDefaults.maxPdfBytes,
      RUNTIME_NUMBER_BOUNDS.maxPdfBytes,
    ),
    pdfBackendRouterTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.pdfBackendRouterTimeoutMs,
      runtimeManifestDefaults.pdfBackendRouterTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterTimeoutMs,
    ),
    pdfBackendRouterMaxPages: parseBoundedNumber(
      nextRuntimeDraft.pdfBackendRouterMaxPages,
      runtimeManifestDefaults.pdfBackendRouterMaxPages,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPages,
    ),
    pdfBackendRouterMaxPairs: parseBoundedNumber(
      nextRuntimeDraft.pdfBackendRouterMaxPairs,
      runtimeManifestDefaults.pdfBackendRouterMaxPairs,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPairs,
    ),
    pdfBackendRouterMaxTextPreviewChars: parseBoundedNumber(
      nextRuntimeDraft.pdfBackendRouterMaxTextPreviewChars,
      runtimeManifestDefaults.pdfBackendRouterMaxTextPreviewChars,
      RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxTextPreviewChars,
    ),
    capturePageScreenshotQuality: parseBoundedNumber(
      nextRuntimeDraft.capturePageScreenshotQuality,
      runtimeManifestDefaults.capturePageScreenshotQuality,
      RUNTIME_NUMBER_BOUNDS.capturePageScreenshotQuality,
    ),
    capturePageScreenshotMaxBytes: parseBoundedNumber(
      nextRuntimeDraft.capturePageScreenshotMaxBytes,
      runtimeManifestDefaults.capturePageScreenshotMaxBytes,
      RUNTIME_NUMBER_BOUNDS.capturePageScreenshotMaxBytes,
    ),
    visualAssetCaptureMaxPerSource: parseBoundedNumber(
      nextRuntimeDraft.visualAssetCaptureMaxPerSource,
      runtimeManifestDefaults.visualAssetCaptureMaxPerSource,
      RUNTIME_NUMBER_BOUNDS.visualAssetCaptureMaxPerSource,
    ),
    visualAssetRetentionDays: parseBoundedNumber(
      nextRuntimeDraft.visualAssetRetentionDays,
      runtimeManifestDefaults.visualAssetRetentionDays,
      RUNTIME_NUMBER_BOUNDS.visualAssetRetentionDays,
    ),
    visualAssetReviewLgMaxSide: parseBoundedNumber(
      nextRuntimeDraft.visualAssetReviewLgMaxSide,
      runtimeManifestDefaults.visualAssetReviewLgMaxSide,
      RUNTIME_NUMBER_BOUNDS.visualAssetReviewLgMaxSide,
    ),
    visualAssetReviewSmMaxSide: parseBoundedNumber(
      nextRuntimeDraft.visualAssetReviewSmMaxSide,
      runtimeManifestDefaults.visualAssetReviewSmMaxSide,
      RUNTIME_NUMBER_BOUNDS.visualAssetReviewSmMaxSide,
    ),
    visualAssetReviewLgQuality: parseBoundedNumber(
      nextRuntimeDraft.visualAssetReviewLgQuality,
      runtimeManifestDefaults.visualAssetReviewLgQuality,
      RUNTIME_NUMBER_BOUNDS.visualAssetReviewLgQuality,
    ),
    visualAssetReviewSmQuality: parseBoundedNumber(
      nextRuntimeDraft.visualAssetReviewSmQuality,
      runtimeManifestDefaults.visualAssetReviewSmQuality,
      RUNTIME_NUMBER_BOUNDS.visualAssetReviewSmQuality,
    ),
    visualAssetRegionCropMaxSide: parseBoundedNumber(
      nextRuntimeDraft.visualAssetRegionCropMaxSide,
      runtimeManifestDefaults.visualAssetRegionCropMaxSide,
      RUNTIME_NUMBER_BOUNDS.visualAssetRegionCropMaxSide,
    ),
    visualAssetRegionCropQuality: parseBoundedNumber(
      nextRuntimeDraft.visualAssetRegionCropQuality,
      runtimeManifestDefaults.visualAssetRegionCropQuality,
      RUNTIME_NUMBER_BOUNDS.visualAssetRegionCropQuality,
    ),
    visualAssetLlmMaxBytes: parseBoundedNumber(
      nextRuntimeDraft.visualAssetLlmMaxBytes,
      runtimeManifestDefaults.visualAssetLlmMaxBytes,
      RUNTIME_NUMBER_BOUNDS.visualAssetLlmMaxBytes,
    ),
    visualAssetMinWidth: parseBoundedNumber(
      nextRuntimeDraft.visualAssetMinWidth,
      runtimeManifestDefaults.visualAssetMinWidth,
      RUNTIME_NUMBER_BOUNDS.visualAssetMinWidth,
    ),
    visualAssetMinHeight: parseBoundedNumber(
      nextRuntimeDraft.visualAssetMinHeight,
      runtimeManifestDefaults.visualAssetMinHeight,
      RUNTIME_NUMBER_BOUNDS.visualAssetMinHeight,
    ),
    visualAssetMinSharpness: parseBoundedNumber(
      nextRuntimeDraft.visualAssetMinSharpness,
      runtimeManifestDefaults.visualAssetMinSharpness,
      RUNTIME_NUMBER_BOUNDS.visualAssetMinSharpness,
    ),
    visualAssetMinEntropy: parseBoundedNumber(
      nextRuntimeDraft.visualAssetMinEntropy,
      runtimeManifestDefaults.visualAssetMinEntropy,
      RUNTIME_NUMBER_BOUNDS.visualAssetMinEntropy,
    ),
    visualAssetMaxPhashDistance: parseBoundedNumber(
      nextRuntimeDraft.visualAssetMaxPhashDistance,
      runtimeManifestDefaults.visualAssetMaxPhashDistance,
      RUNTIME_NUMBER_BOUNDS.visualAssetMaxPhashDistance,
    ),
    articleExtractorMinChars: parseBoundedNumber(
      nextRuntimeDraft.articleExtractorMinChars,
      runtimeManifestDefaults.articleExtractorMinChars,
      RUNTIME_NUMBER_BOUNDS.articleExtractorMinChars,
    ),
    articleExtractorMinScore: parseBoundedNumber(
      nextRuntimeDraft.articleExtractorMinScore,
      runtimeManifestDefaults.articleExtractorMinScore,
      RUNTIME_NUMBER_BOUNDS.articleExtractorMinScore,
    ),
    articleExtractorMaxChars: parseBoundedNumber(
      nextRuntimeDraft.articleExtractorMaxChars,
      runtimeManifestDefaults.articleExtractorMaxChars,
      RUNTIME_NUMBER_BOUNDS.articleExtractorMaxChars,
    ),
    staticDomTargetMatchThreshold: parseBoundedNumber(
      nextRuntimeDraft.staticDomTargetMatchThreshold,
      runtimeManifestDefaults.staticDomTargetMatchThreshold,
      RUNTIME_NUMBER_BOUNDS.staticDomTargetMatchThreshold,
    ),
    staticDomMaxEvidenceSnippets: parseBoundedNumber(
      nextRuntimeDraft.staticDomMaxEvidenceSnippets,
      runtimeManifestDefaults.staticDomMaxEvidenceSnippets,
      RUNTIME_NUMBER_BOUNDS.staticDomMaxEvidenceSnippets,
    ),
    structuredMetadataExtructTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.structuredMetadataExtructTimeoutMs,
      runtimeManifestDefaults.structuredMetadataExtructTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructTimeoutMs,
    ),
    structuredMetadataExtructMaxItemsPerSurface: parseBoundedNumber(
      nextRuntimeDraft.structuredMetadataExtructMaxItemsPerSurface,
      runtimeManifestDefaults.structuredMetadataExtructMaxItemsPerSurface,
      RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructMaxItemsPerSurface,
    ),
    structuredMetadataExtructCacheLimit: parseBoundedNumber(
      nextRuntimeDraft.structuredMetadataExtructCacheLimit,
      runtimeManifestDefaults.structuredMetadataExtructCacheLimit,
      RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructCacheLimit,
    ),
    domSnippetMaxChars: parseBoundedNumber(
      nextRuntimeDraft.domSnippetMaxChars,
      runtimeManifestDefaults.domSnippetMaxChars,
      RUNTIME_NUMBER_BOUNDS.domSnippetMaxChars,
    ),
    llmExtractionCacheTtlMs: parseBoundedNumber(
      nextRuntimeDraft.llmExtractionCacheTtlMs,
      runtimeManifestDefaults.llmExtractionCacheTtlMs,
      RUNTIME_NUMBER_BOUNDS.llmExtractionCacheTtlMs,
    ),
    llmMaxCallsPerProductTotal: parseBoundedNumber(
      nextRuntimeDraft.llmMaxCallsPerProductTotal,
      runtimeManifestDefaults.llmMaxCallsPerProductTotal,
      RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductTotal,
    ),
    llmMaxCallsPerProductFast: parseBoundedNumber(
      nextRuntimeDraft.llmMaxCallsPerProductFast,
      runtimeManifestDefaults.llmMaxCallsPerProductFast,
      RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductFast,
    ),
    needsetEvidenceDecayDays: parseBoundedNumber(
      nextRuntimeDraft.needsetEvidenceDecayDays,
      runtimeManifestDefaults.needsetEvidenceDecayDays,
      RUNTIME_NUMBER_BOUNDS.needsetEvidenceDecayDays,
    ),
    needsetEvidenceDecayFloor: parseBoundedNumber(
      nextRuntimeDraft.needsetEvidenceDecayFloor,
      runtimeManifestDefaults.needsetEvidenceDecayFloor,
      RUNTIME_NUMBER_BOUNDS.needsetEvidenceDecayFloor,
    ),
    needsetRequiredWeightIdentity: parseBoundedNumber(
      nextRuntimeDraft.needsetRequiredWeightIdentity,
      runtimeManifestDefaults.needsetRequiredWeightIdentity,
      RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightIdentity,
    ),
    needsetRequiredWeightCritical: parseBoundedNumber(
      nextRuntimeDraft.needsetRequiredWeightCritical,
      runtimeManifestDefaults.needsetRequiredWeightCritical,
      RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightCritical,
    ),
    needsetRequiredWeightRequired: parseBoundedNumber(
      nextRuntimeDraft.needsetRequiredWeightRequired,
      runtimeManifestDefaults.needsetRequiredWeightRequired,
      RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightRequired,
    ),
    needsetRequiredWeightExpected: parseBoundedNumber(
      nextRuntimeDraft.needsetRequiredWeightExpected,
      runtimeManifestDefaults.needsetRequiredWeightExpected,
      RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightExpected,
    ),
    needsetRequiredWeightOptional: parseBoundedNumber(
      nextRuntimeDraft.needsetRequiredWeightOptional,
      runtimeManifestDefaults.needsetRequiredWeightOptional,
      RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightOptional,
    ),
    needsetMissingMultiplier: parseBoundedNumber(
      nextRuntimeDraft.needsetMissingMultiplier,
      runtimeManifestDefaults.needsetMissingMultiplier,
      RUNTIME_NUMBER_BOUNDS.needsetMissingMultiplier,
    ),
    needsetTierDeficitMultiplier: parseBoundedNumber(
      nextRuntimeDraft.needsetTierDeficitMultiplier,
      runtimeManifestDefaults.needsetTierDeficitMultiplier,
      RUNTIME_NUMBER_BOUNDS.needsetTierDeficitMultiplier,
    ),
    needsetMinRefsDeficitMultiplier: parseBoundedNumber(
      nextRuntimeDraft.needsetMinRefsDeficitMultiplier,
      runtimeManifestDefaults.needsetMinRefsDeficitMultiplier,
      RUNTIME_NUMBER_BOUNDS.needsetMinRefsDeficitMultiplier,
    ),
    needsetConflictMultiplier: parseBoundedNumber(
      nextRuntimeDraft.needsetConflictMultiplier,
      runtimeManifestDefaults.needsetConflictMultiplier,
      RUNTIME_NUMBER_BOUNDS.needsetConflictMultiplier,
    ),
    needsetIdentityLockThreshold: parseBoundedNumber(
      nextRuntimeDraft.needsetIdentityLockThreshold,
      runtimeManifestDefaults.needsetIdentityLockThreshold,
      RUNTIME_NUMBER_BOUNDS.needsetIdentityLockThreshold,
    ),
    needsetIdentityProvisionalThreshold: parseBoundedNumber(
      nextRuntimeDraft.needsetIdentityProvisionalThreshold,
      runtimeManifestDefaults.needsetIdentityProvisionalThreshold,
      RUNTIME_NUMBER_BOUNDS.needsetIdentityProvisionalThreshold,
    ),
    needsetDefaultIdentityAuditLimit: parseBoundedNumber(
      nextRuntimeDraft.needsetDefaultIdentityAuditLimit,
      runtimeManifestDefaults.needsetDefaultIdentityAuditLimit,
      RUNTIME_NUMBER_BOUNDS.needsetDefaultIdentityAuditLimit,
    ),
    consensusMethodWeightNetworkJson: parseBoundedNumber(
      nextRuntimeDraft.consensusMethodWeightNetworkJson,
      runtimeManifestDefaults.consensusMethodWeightNetworkJson,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightNetworkJson,
    ),
    consensusMethodWeightAdapterApi: parseBoundedNumber(
      nextRuntimeDraft.consensusMethodWeightAdapterApi,
      runtimeManifestDefaults.consensusMethodWeightAdapterApi,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightAdapterApi,
    ),
    consensusMethodWeightStructuredMeta: parseBoundedNumber(
      nextRuntimeDraft.consensusMethodWeightStructuredMeta,
      runtimeManifestDefaults.consensusMethodWeightStructuredMeta,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightStructuredMeta,
    ),
    consensusMethodWeightPdf: parseBoundedNumber(
      nextRuntimeDraft.consensusMethodWeightPdf,
      runtimeManifestDefaults.consensusMethodWeightPdf,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightPdf,
    ),
    consensusMethodWeightTableKv: parseBoundedNumber(
      nextRuntimeDraft.consensusMethodWeightTableKv,
      runtimeManifestDefaults.consensusMethodWeightTableKv,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightTableKv,
    ),
    consensusMethodWeightDom: parseBoundedNumber(
      nextRuntimeDraft.consensusMethodWeightDom,
      runtimeManifestDefaults.consensusMethodWeightDom,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightDom,
    ),
    consensusMethodWeightLlmExtractBase: parseBoundedNumber(
      nextRuntimeDraft.consensusMethodWeightLlmExtractBase,
      runtimeManifestDefaults.consensusMethodWeightLlmExtractBase,
      RUNTIME_NUMBER_BOUNDS.consensusMethodWeightLlmExtractBase,
    ),
    consensusPolicyBonus: parseBoundedNumber(
      nextRuntimeDraft.consensusPolicyBonus,
      runtimeManifestDefaults.consensusPolicyBonus,
      RUNTIME_NUMBER_BOUNDS.consensusPolicyBonus,
    ),
    consensusWeightedMajorityThreshold: parseBoundedNumber(
      nextRuntimeDraft.consensusWeightedMajorityThreshold,
      runtimeManifestDefaults.consensusWeightedMajorityThreshold,
      RUNTIME_NUMBER_BOUNDS.consensusWeightedMajorityThreshold,
    ),
    consensusStrictAcceptanceDomainCount: parseBoundedNumber(
      nextRuntimeDraft.consensusStrictAcceptanceDomainCount,
      runtimeManifestDefaults.consensusStrictAcceptanceDomainCount,
      RUNTIME_NUMBER_BOUNDS.consensusStrictAcceptanceDomainCount,
    ),
    consensusRelaxedAcceptanceDomainCount: parseBoundedNumber(
      nextRuntimeDraft.consensusRelaxedAcceptanceDomainCount,
      runtimeManifestDefaults.consensusRelaxedAcceptanceDomainCount,
      RUNTIME_NUMBER_BOUNDS.consensusRelaxedAcceptanceDomainCount,
    ),
    consensusInstrumentedFieldThreshold: parseBoundedNumber(
      nextRuntimeDraft.consensusInstrumentedFieldThreshold,
      runtimeManifestDefaults.consensusInstrumentedFieldThreshold,
      RUNTIME_NUMBER_BOUNDS.consensusInstrumentedFieldThreshold,
    ),
    consensusConfidenceScoringBase: parseBoundedNumber(
      nextRuntimeDraft.consensusConfidenceScoringBase,
      runtimeManifestDefaults.consensusConfidenceScoringBase,
      RUNTIME_NUMBER_BOUNDS.consensusConfidenceScoringBase,
    ),
    consensusPassTargetIdentityStrong: parseBoundedNumber(
      nextRuntimeDraft.consensusPassTargetIdentityStrong,
      runtimeManifestDefaults.consensusPassTargetIdentityStrong,
      RUNTIME_NUMBER_BOUNDS.consensusPassTargetIdentityStrong,
    ),
    consensusPassTargetNormal: parseBoundedNumber(
      nextRuntimeDraft.consensusPassTargetNormal,
      runtimeManifestDefaults.consensusPassTargetNormal,
      RUNTIME_NUMBER_BOUNDS.consensusPassTargetNormal,
    ),
    retrievalTierWeightTier1: parseBoundedNumber(
      nextRuntimeDraft.retrievalTierWeightTier1,
      runtimeManifestDefaults.retrievalTierWeightTier1,
      RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier1,
    ),
    retrievalTierWeightTier2: parseBoundedNumber(
      nextRuntimeDraft.retrievalTierWeightTier2,
      runtimeManifestDefaults.retrievalTierWeightTier2,
      RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier2,
    ),
    retrievalTierWeightTier3: parseBoundedNumber(
      nextRuntimeDraft.retrievalTierWeightTier3,
      runtimeManifestDefaults.retrievalTierWeightTier3,
      RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier3,
    ),
    retrievalTierWeightTier4: parseBoundedNumber(
      nextRuntimeDraft.retrievalTierWeightTier4,
      runtimeManifestDefaults.retrievalTierWeightTier4,
      RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier4,
    ),
    retrievalTierWeightTier5: parseBoundedNumber(
      nextRuntimeDraft.retrievalTierWeightTier5,
      runtimeManifestDefaults.retrievalTierWeightTier5,
      RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier5,
    ),
    retrievalDocKindWeightManualPdf: parseBoundedNumber(
      nextRuntimeDraft.retrievalDocKindWeightManualPdf,
      runtimeManifestDefaults.retrievalDocKindWeightManualPdf,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightManualPdf,
    ),
    retrievalDocKindWeightSpecPdf: parseBoundedNumber(
      nextRuntimeDraft.retrievalDocKindWeightSpecPdf,
      runtimeManifestDefaults.retrievalDocKindWeightSpecPdf,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightSpecPdf,
    ),
    retrievalDocKindWeightSupport: parseBoundedNumber(
      nextRuntimeDraft.retrievalDocKindWeightSupport,
      runtimeManifestDefaults.retrievalDocKindWeightSupport,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightSupport,
    ),
    retrievalDocKindWeightLabReview: parseBoundedNumber(
      nextRuntimeDraft.retrievalDocKindWeightLabReview,
      runtimeManifestDefaults.retrievalDocKindWeightLabReview,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightLabReview,
    ),
    retrievalDocKindWeightProductPage: parseBoundedNumber(
      nextRuntimeDraft.retrievalDocKindWeightProductPage,
      runtimeManifestDefaults.retrievalDocKindWeightProductPage,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightProductPage,
    ),
    retrievalDocKindWeightOther: parseBoundedNumber(
      nextRuntimeDraft.retrievalDocKindWeightOther,
      runtimeManifestDefaults.retrievalDocKindWeightOther,
      RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightOther,
    ),
    retrievalMethodWeightTable: parseBoundedNumber(
      nextRuntimeDraft.retrievalMethodWeightTable,
      runtimeManifestDefaults.retrievalMethodWeightTable,
      RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightTable,
    ),
    retrievalMethodWeightKv: parseBoundedNumber(
      nextRuntimeDraft.retrievalMethodWeightKv,
      runtimeManifestDefaults.retrievalMethodWeightKv,
      RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightKv,
    ),
    retrievalMethodWeightJsonLd: parseBoundedNumber(
      nextRuntimeDraft.retrievalMethodWeightJsonLd,
      runtimeManifestDefaults.retrievalMethodWeightJsonLd,
      RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightJsonLd,
    ),
    retrievalMethodWeightLlmExtract: parseBoundedNumber(
      nextRuntimeDraft.retrievalMethodWeightLlmExtract,
      runtimeManifestDefaults.retrievalMethodWeightLlmExtract,
      RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightLlmExtract,
    ),
    retrievalMethodWeightHelperSupportive: parseBoundedNumber(
      nextRuntimeDraft.retrievalMethodWeightHelperSupportive,
      runtimeManifestDefaults.retrievalMethodWeightHelperSupportive,
      RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightHelperSupportive,
    ),
    retrievalAnchorScorePerMatch: parseBoundedNumber(
      nextRuntimeDraft.retrievalAnchorScorePerMatch,
      runtimeManifestDefaults.retrievalAnchorScorePerMatch,
      RUNTIME_NUMBER_BOUNDS.retrievalAnchorScorePerMatch,
    ),
    retrievalIdentityScorePerMatch: parseBoundedNumber(
      nextRuntimeDraft.retrievalIdentityScorePerMatch,
      runtimeManifestDefaults.retrievalIdentityScorePerMatch,
      RUNTIME_NUMBER_BOUNDS.retrievalIdentityScorePerMatch,
    ),
    retrievalUnitMatchBonus: parseBoundedNumber(
      nextRuntimeDraft.retrievalUnitMatchBonus,
      runtimeManifestDefaults.retrievalUnitMatchBonus,
      RUNTIME_NUMBER_BOUNDS.retrievalUnitMatchBonus,
    ),
    retrievalDirectFieldMatchBonus: parseBoundedNumber(
      nextRuntimeDraft.retrievalDirectFieldMatchBonus,
      runtimeManifestDefaults.retrievalDirectFieldMatchBonus,
      RUNTIME_NUMBER_BOUNDS.retrievalDirectFieldMatchBonus,
    ),
    llmExtractMaxTokens: parseBoundedNumber(
      nextRuntimeDraft.llmExtractMaxTokens,
      runtimeManifestDefaults.llmExtractMaxTokens,
      RUNTIME_NUMBER_BOUNDS.llmExtractMaxTokens,
    ),
    llmExtractMaxSnippetsPerBatch: parseBoundedNumber(
      nextRuntimeDraft.llmExtractMaxSnippetsPerBatch,
      runtimeManifestDefaults.llmExtractMaxSnippetsPerBatch,
      RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetsPerBatch,
    ),
    llmExtractMaxSnippetChars: parseBoundedNumber(
      nextRuntimeDraft.llmExtractMaxSnippetChars,
      runtimeManifestDefaults.llmExtractMaxSnippetChars,
      RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetChars,
    ),
    llmExtractReasoningBudget: parseBoundedNumber(
      nextRuntimeDraft.llmExtractReasoningBudget,
      runtimeManifestDefaults.llmExtractReasoningBudget,
      RUNTIME_NUMBER_BOUNDS.llmExtractReasoningBudget,
    ),
    llmReasoningBudget: parseBoundedNumber(
      nextRuntimeDraft.llmReasoningBudget,
      runtimeManifestDefaults.llmReasoningBudget,
      RUNTIME_NUMBER_BOUNDS.llmReasoningBudget,
    ),
    llmMonthlyBudgetUsd: parseBoundedNumber(
      nextRuntimeDraft.llmMonthlyBudgetUsd,
      runtimeManifestDefaults.llmMonthlyBudgetUsd,
      RUNTIME_NUMBER_BOUNDS.llmMonthlyBudgetUsd,
    ),
    llmPerProductBudgetUsd: parseBoundedNumber(
      nextRuntimeDraft.llmPerProductBudgetUsd,
      runtimeManifestDefaults.llmPerProductBudgetUsd,
      RUNTIME_NUMBER_BOUNDS.llmPerProductBudgetUsd,
    ),
    llmMaxCallsPerRound: parseBoundedNumber(
      nextRuntimeDraft.llmMaxCallsPerRound,
      runtimeManifestDefaults.llmMaxCallsPerRound,
      RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerRound,
    ),
    llmMaxOutputTokens: parseBoundedNumber(
      nextRuntimeDraft.llmMaxOutputTokens,
      runtimeManifestDefaults.llmMaxOutputTokens,
      RUNTIME_NUMBER_BOUNDS.llmMaxOutputTokens,
    ),
    llmVerifySampleRate: parseBoundedNumber(
      nextRuntimeDraft.llmVerifySampleRate,
      runtimeManifestDefaults.llmVerifySampleRate,
      RUNTIME_NUMBER_BOUNDS.llmVerifySampleRate,
    ),
    llmMaxBatchesPerProduct: parseBoundedNumber(
      nextRuntimeDraft.llmMaxBatchesPerProduct,
      runtimeManifestDefaults.llmMaxBatchesPerProduct,
      RUNTIME_NUMBER_BOUNDS.llmMaxBatchesPerProduct,
    ),
    llmMaxEvidenceChars: parseBoundedNumber(
      nextRuntimeDraft.llmMaxEvidenceChars,
      runtimeManifestDefaults.llmMaxEvidenceChars,
      RUNTIME_NUMBER_BOUNDS.llmMaxEvidenceChars,
    ),
    llmMaxTokens: parseBoundedNumber(
      nextRuntimeDraft.llmMaxTokens,
      runtimeManifestDefaults.llmMaxTokens,
      RUNTIME_NUMBER_BOUNDS.llmMaxTokens,
    ),
    llmTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.llmTimeoutMs,
      runtimeManifestDefaults.llmTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.llmTimeoutMs,
    ),
    llmCostInputPer1M: parseBoundedNumber(
      nextRuntimeDraft.llmCostInputPer1M,
      runtimeManifestDefaults.llmCostInputPer1M,
      RUNTIME_NUMBER_BOUNDS.llmCostInputPer1M,
    ),
    llmCostOutputPer1M: parseBoundedNumber(
      nextRuntimeDraft.llmCostOutputPer1M,
      runtimeManifestDefaults.llmCostOutputPer1M,
      RUNTIME_NUMBER_BOUNDS.llmCostOutputPer1M,
    ),
    llmCostCachedInputPer1M: parseBoundedNumber(
      nextRuntimeDraft.llmCostCachedInputPer1M,
      runtimeManifestDefaults.llmCostCachedInputPer1M,
      RUNTIME_NUMBER_BOUNDS.llmCostCachedInputPer1M,
    ),
    maxManufacturerUrlsPerProduct: parseBoundedNumber(
      nextRuntimeDraft.maxManufacturerUrlsPerProduct,
      runtimeManifestDefaults.maxManufacturerUrlsPerProduct,
      RUNTIME_NUMBER_BOUNDS.maxManufacturerUrlsPerProduct,
    ),
    maxManufacturerPagesPerDomain: parseBoundedNumber(
      nextRuntimeDraft.maxManufacturerPagesPerDomain,
      runtimeManifestDefaults.maxManufacturerPagesPerDomain,
      RUNTIME_NUMBER_BOUNDS.maxManufacturerPagesPerDomain,
    ),
    manufacturerReserveUrls: parseBoundedNumber(
      nextRuntimeDraft.manufacturerReserveUrls,
      runtimeManifestDefaults.manufacturerReserveUrls,
      RUNTIME_NUMBER_BOUNDS.manufacturerReserveUrls,
    ),
    maxHypothesisItems: parseBoundedNumber(
      nextRuntimeDraft.maxHypothesisItems,
      runtimeManifestDefaults.maxHypothesisItems,
      RUNTIME_NUMBER_BOUNDS.maxHypothesisItems,
    ),
    hypothesisAutoFollowupRounds: parseBoundedNumber(
      nextRuntimeDraft.hypothesisAutoFollowupRounds,
      runtimeManifestDefaults.hypothesisAutoFollowupRounds,
      RUNTIME_NUMBER_BOUNDS.hypothesisAutoFollowupRounds,
    ),
    hypothesisFollowupUrlsPerRound: parseBoundedNumber(
      nextRuntimeDraft.hypothesisFollowupUrlsPerRound,
      runtimeManifestDefaults.hypothesisFollowupUrlsPerRound,
      RUNTIME_NUMBER_BOUNDS.hypothesisFollowupUrlsPerRound,
    ),
    learningConfidenceThreshold: parseBoundedNumber(
      nextRuntimeDraft.learningConfidenceThreshold,
      runtimeManifestDefaults.learningConfidenceThreshold,
      RUNTIME_NUMBER_BOUNDS.learningConfidenceThreshold,
    ),
    componentLexiconDecayDays: parseBoundedNumber(
      nextRuntimeDraft.componentLexiconDecayDays,
      runtimeManifestDefaults.componentLexiconDecayDays,
      RUNTIME_NUMBER_BOUNDS.componentLexiconDecayDays,
    ),
    componentLexiconExpireDays: parseBoundedNumber(
      nextRuntimeDraft.componentLexiconExpireDays,
      runtimeManifestDefaults.componentLexiconExpireDays,
      RUNTIME_NUMBER_BOUNDS.componentLexiconExpireDays,
    ),
    fieldAnchorsDecayDays: parseBoundedNumber(
      nextRuntimeDraft.fieldAnchorsDecayDays,
      runtimeManifestDefaults.fieldAnchorsDecayDays,
      RUNTIME_NUMBER_BOUNDS.fieldAnchorsDecayDays,
    ),
    urlMemoryDecayDays: parseBoundedNumber(
      nextRuntimeDraft.urlMemoryDecayDays,
      runtimeManifestDefaults.urlMemoryDecayDays,
      RUNTIME_NUMBER_BOUNDS.urlMemoryDecayDays,
    ),
    cseRescueRequiredIteration: parseBoundedNumber(
      nextRuntimeDraft.cseRescueRequiredIteration,
      runtimeManifestDefaults.cseRescueRequiredIteration,
      RUNTIME_NUMBER_BOUNDS.cseRescueRequiredIteration,
    ),
    duckduckgoTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.duckduckgoTimeoutMs,
      runtimeManifestDefaults.duckduckgoTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.duckduckgoTimeoutMs,
    ),
    runtimeScreencastFps: parseBoundedNumber(
      nextRuntimeDraft.runtimeScreencastFps,
      runtimeManifestDefaults.runtimeScreencastFps,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastFps,
    ),
    runtimeScreencastQuality: parseBoundedNumber(
      nextRuntimeDraft.runtimeScreencastQuality,
      runtimeManifestDefaults.runtimeScreencastQuality,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastQuality,
    ),
    runtimeScreencastMaxWidth: parseBoundedNumber(
      nextRuntimeDraft.runtimeScreencastMaxWidth,
      runtimeManifestDefaults.runtimeScreencastMaxWidth,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxWidth,
    ),
    runtimeScreencastMaxHeight: parseBoundedNumber(
      nextRuntimeDraft.runtimeScreencastMaxHeight,
      runtimeManifestDefaults.runtimeScreencastMaxHeight,
      RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxHeight,
    ),
    runtimeTraceFetchRing: parseBoundedNumber(
      nextRuntimeDraft.runtimeTraceFetchRing,
      runtimeManifestDefaults.runtimeTraceFetchRing,
      RUNTIME_NUMBER_BOUNDS.runtimeTraceFetchRing,
    ),
    runtimeTraceLlmRing: parseBoundedNumber(
      nextRuntimeDraft.runtimeTraceLlmRing,
      runtimeManifestDefaults.runtimeTraceLlmRing,
      RUNTIME_NUMBER_BOUNDS.runtimeTraceLlmRing,
    ),
    daemonConcurrency: parseBoundedNumber(
      nextRuntimeDraft.daemonConcurrency,
      runtimeManifestDefaults.daemonConcurrency,
      RUNTIME_NUMBER_BOUNDS.daemonConcurrency,
    ),
    daemonGracefulShutdownTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.daemonGracefulShutdownTimeoutMs,
      runtimeManifestDefaults.daemonGracefulShutdownTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.daemonGracefulShutdownTimeoutMs,
    ),
    importsPollSeconds: parseBoundedNumber(
      nextRuntimeDraft.importsPollSeconds,
      runtimeManifestDefaults.importsPollSeconds,
      RUNTIME_NUMBER_BOUNDS.importsPollSeconds,
    ),
    convergenceIdentityFailFastRounds: parseBoundedNumber(
      nextRuntimeDraft.convergenceIdentityFailFastRounds,
      runtimeManifestDefaults.convergenceIdentityFailFastRounds,
      RUNTIME_NUMBER_BOUNDS.convergenceIdentityFailFastRounds,
    ),
    identityGatePublishThreshold: parseBoundedNumber(
      nextRuntimeDraft.identityGatePublishThreshold,
      runtimeManifestDefaults.identityGatePublishThreshold,
      RUNTIME_NUMBER_BOUNDS.identityGatePublishThreshold,
    ),
    identityGateBaseMatchThreshold: parseBoundedNumber(
      nextRuntimeDraft.identityGateBaseMatchThreshold,
      runtimeManifestDefaults.identityGateBaseMatchThreshold,
      RUNTIME_NUMBER_BOUNDS.identityGateBaseMatchThreshold,
    ),
    identityGateEasyAmbiguityReduction: parseBoundedNumber(
      nextRuntimeDraft.identityGateEasyAmbiguityReduction,
      runtimeManifestDefaults.identityGateEasyAmbiguityReduction,
      RUNTIME_NUMBER_BOUNDS.identityGateEasyAmbiguityReduction,
    ),
    identityGateMediumAmbiguityReduction: parseBoundedNumber(
      nextRuntimeDraft.identityGateMediumAmbiguityReduction,
      runtimeManifestDefaults.identityGateMediumAmbiguityReduction,
      RUNTIME_NUMBER_BOUNDS.identityGateMediumAmbiguityReduction,
    ),
    identityGateHardAmbiguityReduction: parseBoundedNumber(
      nextRuntimeDraft.identityGateHardAmbiguityReduction,
      runtimeManifestDefaults.identityGateHardAmbiguityReduction,
      RUNTIME_NUMBER_BOUNDS.identityGateHardAmbiguityReduction,
    ),
    identityGateVeryHardAmbiguityIncrease: parseBoundedNumber(
      nextRuntimeDraft.identityGateVeryHardAmbiguityIncrease,
      runtimeManifestDefaults.identityGateVeryHardAmbiguityIncrease,
      RUNTIME_NUMBER_BOUNDS.identityGateVeryHardAmbiguityIncrease,
    ),
    identityGateExtraHardAmbiguityIncrease: parseBoundedNumber(
      nextRuntimeDraft.identityGateExtraHardAmbiguityIncrease,
      runtimeManifestDefaults.identityGateExtraHardAmbiguityIncrease,
      RUNTIME_NUMBER_BOUNDS.identityGateExtraHardAmbiguityIncrease,
    ),
    identityGateMissingStrongIdPenalty: parseBoundedNumber(
      nextRuntimeDraft.identityGateMissingStrongIdPenalty,
      runtimeManifestDefaults.identityGateMissingStrongIdPenalty,
      RUNTIME_NUMBER_BOUNDS.identityGateMissingStrongIdPenalty,
    ),
    identityGateHardMissingStrongIdIncrease: parseBoundedNumber(
      nextRuntimeDraft.identityGateHardMissingStrongIdIncrease,
      runtimeManifestDefaults.identityGateHardMissingStrongIdIncrease,
      RUNTIME_NUMBER_BOUNDS.identityGateHardMissingStrongIdIncrease,
    ),
    identityGateVeryHardMissingStrongIdIncrease: parseBoundedNumber(
      nextRuntimeDraft.identityGateVeryHardMissingStrongIdIncrease,
      runtimeManifestDefaults.identityGateVeryHardMissingStrongIdIncrease,
      RUNTIME_NUMBER_BOUNDS.identityGateVeryHardMissingStrongIdIncrease,
    ),
    identityGateExtraHardMissingStrongIdIncrease: parseBoundedNumber(
      nextRuntimeDraft.identityGateExtraHardMissingStrongIdIncrease,
      runtimeManifestDefaults.identityGateExtraHardMissingStrongIdIncrease,
      RUNTIME_NUMBER_BOUNDS.identityGateExtraHardMissingStrongIdIncrease,
    ),
    identityGateNumericTokenBoost: parseBoundedNumber(
      nextRuntimeDraft.identityGateNumericTokenBoost,
      runtimeManifestDefaults.identityGateNumericTokenBoost,
      RUNTIME_NUMBER_BOUNDS.identityGateNumericTokenBoost,
    ),
    identityGateNumericRangeThreshold: parseBoundedNumber(
      nextRuntimeDraft.identityGateNumericRangeThreshold,
      runtimeManifestDefaults.identityGateNumericRangeThreshold,
      RUNTIME_NUMBER_BOUNDS.identityGateNumericRangeThreshold,
    ),
    qualityGateIdentityThreshold: parseBoundedNumber(
      nextRuntimeDraft.qualityGateIdentityThreshold,
      runtimeManifestDefaults.qualityGateIdentityThreshold,
      RUNTIME_NUMBER_BOUNDS.qualityGateIdentityThreshold,
    ),
    evidenceTextMaxChars: parseBoundedNumber(
      nextRuntimeDraft.evidenceTextMaxChars,
      runtimeManifestDefaults.evidenceTextMaxChars,
      RUNTIME_NUMBER_BOUNDS.evidenceTextMaxChars,
    ),
    helperSupportiveMaxSources: parseBoundedNumber(
      nextRuntimeDraft.helperSupportiveMaxSources,
      runtimeManifestDefaults.helperSupportiveMaxSources,
      RUNTIME_NUMBER_BOUNDS.helperSupportiveMaxSources,
    ),
    helperActiveSyncLimit: parseBoundedNumber(
      nextRuntimeDraft.helperActiveSyncLimit,
      runtimeManifestDefaults.helperActiveSyncLimit,
      RUNTIME_NUMBER_BOUNDS.helperActiveSyncLimit,
    ),
    fieldRewardHalfLifeDays: parseBoundedNumber(
      nextRuntimeDraft.fieldRewardHalfLifeDays,
      runtimeManifestDefaults.fieldRewardHalfLifeDays,
      RUNTIME_NUMBER_BOUNDS.fieldRewardHalfLifeDays,
    ),
    driftPollSeconds: parseBoundedNumber(
      nextRuntimeDraft.driftPollSeconds,
      runtimeManifestDefaults.driftPollSeconds,
      RUNTIME_NUMBER_BOUNDS.driftPollSeconds,
    ),
    driftScanMaxProducts: parseBoundedNumber(
      nextRuntimeDraft.driftScanMaxProducts,
      runtimeManifestDefaults.driftScanMaxProducts,
      RUNTIME_NUMBER_BOUNDS.driftScanMaxProducts,
    ),
    reCrawlStaleAfterDays: parseBoundedNumber(
      nextRuntimeDraft.reCrawlStaleAfterDays,
      runtimeManifestDefaults.reCrawlStaleAfterDays,
      RUNTIME_NUMBER_BOUNDS.reCrawlStaleAfterDays,
    ),
    aggressiveConfidenceThreshold: parseBoundedNumber(
      nextRuntimeDraft.aggressiveConfidenceThreshold,
      runtimeManifestDefaults.aggressiveConfidenceThreshold,
      RUNTIME_NUMBER_BOUNDS.aggressiveConfidenceThreshold,
    ),
    aggressiveMaxSearchQueries: parseBoundedNumber(
      nextRuntimeDraft.aggressiveMaxSearchQueries,
      runtimeManifestDefaults.aggressiveMaxSearchQueries,
      RUNTIME_NUMBER_BOUNDS.aggressiveMaxSearchQueries,
    ),
    aggressiveEvidenceAuditBatchSize: parseBoundedNumber(
      nextRuntimeDraft.aggressiveEvidenceAuditBatchSize,
      runtimeManifestDefaults.aggressiveEvidenceAuditBatchSize,
      RUNTIME_NUMBER_BOUNDS.aggressiveEvidenceAuditBatchSize,
    ),
    aggressiveMaxTimePerProductMs: parseBoundedNumber(
      nextRuntimeDraft.aggressiveMaxTimePerProductMs,
      runtimeManifestDefaults.aggressiveMaxTimePerProductMs,
      RUNTIME_NUMBER_BOUNDS.aggressiveMaxTimePerProductMs,
    ),
    aggressiveThoroughFromRound: parseBoundedNumber(
      nextRuntimeDraft.aggressiveThoroughFromRound,
      runtimeManifestDefaults.aggressiveThoroughFromRound,
      RUNTIME_NUMBER_BOUNDS.aggressiveThoroughFromRound,
    ),
    aggressiveRound1MaxUrls: parseBoundedNumber(
      nextRuntimeDraft.aggressiveRound1MaxUrls,
      runtimeManifestDefaults.aggressiveRound1MaxUrls,
      RUNTIME_NUMBER_BOUNDS.aggressiveRound1MaxUrls,
    ),
    aggressiveRound1MaxCandidateUrls: parseBoundedNumber(
      nextRuntimeDraft.aggressiveRound1MaxCandidateUrls,
      runtimeManifestDefaults.aggressiveRound1MaxCandidateUrls,
      RUNTIME_NUMBER_BOUNDS.aggressiveRound1MaxCandidateUrls,
    ),
    aggressiveLlmMaxCallsPerRound: parseBoundedNumber(
      nextRuntimeDraft.aggressiveLlmMaxCallsPerRound,
      runtimeManifestDefaults.aggressiveLlmMaxCallsPerRound,
      RUNTIME_NUMBER_BOUNDS.aggressiveLlmMaxCallsPerRound,
    ),
    aggressiveLlmMaxCallsPerProductTotal: parseBoundedNumber(
      nextRuntimeDraft.aggressiveLlmMaxCallsPerProductTotal,
      runtimeManifestDefaults.aggressiveLlmMaxCallsPerProductTotal,
      RUNTIME_NUMBER_BOUNDS.aggressiveLlmMaxCallsPerProductTotal,
    ),
    aggressiveLlmTargetMaxFields: parseBoundedNumber(
      nextRuntimeDraft.aggressiveLlmTargetMaxFields,
      runtimeManifestDefaults.aggressiveLlmTargetMaxFields,
      RUNTIME_NUMBER_BOUNDS.aggressiveLlmTargetMaxFields,
    ),
    aggressiveLlmDiscoveryPasses: parseBoundedNumber(
      nextRuntimeDraft.aggressiveLlmDiscoveryPasses,
      runtimeManifestDefaults.aggressiveLlmDiscoveryPasses,
      RUNTIME_NUMBER_BOUNDS.aggressiveLlmDiscoveryPasses,
    ),
    aggressiveLlmDiscoveryQueryCap: parseBoundedNumber(
      nextRuntimeDraft.aggressiveLlmDiscoveryQueryCap,
      runtimeManifestDefaults.aggressiveLlmDiscoveryQueryCap,
      RUNTIME_NUMBER_BOUNDS.aggressiveLlmDiscoveryQueryCap,
    ),
    uberMaxRounds: parseBoundedNumber(
      nextRuntimeDraft.uberMaxRounds,
      runtimeManifestDefaults.uberMaxRounds,
      RUNTIME_NUMBER_BOUNDS.uberMaxRounds,
    ),
    cortexSyncTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.cortexSyncTimeoutMs,
      runtimeManifestDefaults.cortexSyncTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.cortexSyncTimeoutMs,
    ),
    cortexAsyncPollIntervalMs: parseBoundedNumber(
      nextRuntimeDraft.cortexAsyncPollIntervalMs,
      runtimeManifestDefaults.cortexAsyncPollIntervalMs,
      RUNTIME_NUMBER_BOUNDS.cortexAsyncPollIntervalMs,
    ),
    cortexAsyncMaxWaitMs: parseBoundedNumber(
      nextRuntimeDraft.cortexAsyncMaxWaitMs,
      runtimeManifestDefaults.cortexAsyncMaxWaitMs,
      RUNTIME_NUMBER_BOUNDS.cortexAsyncMaxWaitMs,
    ),
    cortexEnsureReadyTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.cortexEnsureReadyTimeoutMs,
      runtimeManifestDefaults.cortexEnsureReadyTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.cortexEnsureReadyTimeoutMs,
    ),
    cortexStartReadyTimeoutMs: parseBoundedNumber(
      nextRuntimeDraft.cortexStartReadyTimeoutMs,
      runtimeManifestDefaults.cortexStartReadyTimeoutMs,
      RUNTIME_NUMBER_BOUNDS.cortexStartReadyTimeoutMs,
    ),
    cortexFailureThreshold: parseBoundedNumber(
      nextRuntimeDraft.cortexFailureThreshold,
      runtimeManifestDefaults.cortexFailureThreshold,
      RUNTIME_NUMBER_BOUNDS.cortexFailureThreshold,
    ),
    cortexCircuitOpenMs: parseBoundedNumber(
      nextRuntimeDraft.cortexCircuitOpenMs,
      runtimeManifestDefaults.cortexCircuitOpenMs,
      RUNTIME_NUMBER_BOUNDS.cortexCircuitOpenMs,
    ),
    cortexEscalateConfidenceLt: parseBoundedNumber(
      nextRuntimeDraft.cortexEscalateConfidenceLt,
      runtimeManifestDefaults.cortexEscalateConfidenceLt,
      RUNTIME_NUMBER_BOUNDS.cortexEscalateConfidenceLt,
    ),
    cortexMaxDeepFieldsPerProduct: parseBoundedNumber(
      nextRuntimeDraft.cortexMaxDeepFieldsPerProduct,
      runtimeManifestDefaults.cortexMaxDeepFieldsPerProduct,
      RUNTIME_NUMBER_BOUNDS.cortexMaxDeepFieldsPerProduct,
    ),
    userAgent: String(nextRuntimeDraft.userAgent || '').trim(),
    pdfPreferredBackend: String(nextRuntimeDraft.pdfPreferredBackend || '').trim(),
    capturePageScreenshotFormat: String(nextRuntimeDraft.capturePageScreenshotFormat || '').trim(),
    capturePageScreenshotSelectors: String(nextRuntimeDraft.capturePageScreenshotSelectors || '').trim(),
    runtimeScreenshotMode: String(nextRuntimeDraft.runtimeScreenshotMode || '').trim(),
    visualAssetReviewFormat: String(nextRuntimeDraft.visualAssetReviewFormat || '').trim(),
    visualAssetHeroSelectorMapJson: String(nextRuntimeDraft.visualAssetHeroSelectorMapJson || '').trim(),
    runtimeControlFile: String(nextRuntimeDraft.runtimeControlFile || '').trim(),
    staticDomMode: String(nextRuntimeDraft.staticDomMode || '').trim(),
    specDbDir: String(nextRuntimeDraft.specDbDir || '').trim(),
    articleExtractorDomainPolicyMapJson: String(nextRuntimeDraft.articleExtractorDomainPolicyMapJson || '').trim(),
    structuredMetadataExtructUrl: String(nextRuntimeDraft.structuredMetadataExtructUrl || '').trim(),
    cortexBaseUrl: String(nextRuntimeDraft.cortexBaseUrl || '').trim(),
    cortexApiKey: String(nextRuntimeDraft.cortexApiKey || '').trim(),
    cortexAsyncBaseUrl: String(nextRuntimeDraft.cortexAsyncBaseUrl || '').trim(),
    cortexAsyncSubmitPath: String(nextRuntimeDraft.cortexAsyncSubmitPath || '').trim(),
    cortexAsyncStatusPath: String(nextRuntimeDraft.cortexAsyncStatusPath || '').trim(),
    cortexModelFast: String(nextRuntimeDraft.cortexModelFast || '').trim(),
    cortexModelAudit: String(nextRuntimeDraft.cortexModelAudit || '').trim(),
    cortexModelDom: String(nextRuntimeDraft.cortexModelDom || '').trim(),
    cortexModelReasoningDeep: String(nextRuntimeDraft.cortexModelReasoningDeep || '').trim(),
    cortexModelVision: String(nextRuntimeDraft.cortexModelVision || '').trim(),
    cortexModelSearchFast: String(nextRuntimeDraft.cortexModelSearchFast || '').trim(),
    cortexModelRerankFast: String(nextRuntimeDraft.cortexModelRerankFast || '').trim(),
    cortexModelSearchDeep: String(nextRuntimeDraft.cortexModelSearchDeep || '').trim(),
    helperFilesRoot: String(nextRuntimeDraft.helperFilesRoot || '').trim(),
    batchStrategy: String(nextRuntimeDraft.batchStrategy || '').trim(),
    dynamicFetchPolicyMapJson: String(nextRuntimeDraft.dynamicFetchPolicyMapJson || '').trim(),
    searchProfileCapMapJson: String(nextRuntimeDraft.searchProfileCapMapJson || '').trim(),
    serpRerankerWeightMapJson: String(nextRuntimeDraft.serpRerankerWeightMapJson || '').trim(),
    fetchSchedulerInternalsMapJson: String(nextRuntimeDraft.fetchSchedulerInternalsMapJson || '').trim(),
    retrievalInternalsMapJson: String(nextRuntimeDraft.retrievalInternalsMapJson || '').trim(),
    evidencePackLimitsMapJson: String(nextRuntimeDraft.evidencePackLimitsMapJson || '').trim(),
    identityGateThresholdBoundsMapJson: String(nextRuntimeDraft.identityGateThresholdBoundsMapJson || '').trim(),
    parsingConfidenceBaseMapJson: String(nextRuntimeDraft.parsingConfidenceBaseMapJson || '').trim(),
    repairDedupeRule: (String(nextRuntimeDraft.repairDedupeRule || '').trim() || runtimeManifestDefaults.repairDedupeRule) as RuntimeRepairDedupeRule,
    automationQueueStorageEngine: (
      String(nextRuntimeDraft.automationQueueStorageEngine || '').trim() || runtimeManifestDefaults.automationQueueStorageEngine
    ) as RuntimeAutomationQueueStorageEngine,
    scannedPdfOcrEnabled: nextRuntimeDraft.scannedPdfOcrEnabled,
    scannedPdfOcrPromoteCandidates: nextRuntimeDraft.scannedPdfOcrPromoteCandidates,
    llmPlanDiscoveryQueries: nextRuntimeDraft.phase2LlmEnabled,
    phase2LlmEnabled: nextRuntimeDraft.phase2LlmEnabled,
    llmSerpRerankEnabled: nextRuntimeDraft.phase3LlmTriageEnabled,
    phase3LlmTriageEnabled: nextRuntimeDraft.phase3LlmTriageEnabled,
    localMode: nextRuntimeDraft.localMode,
    dryRun: nextRuntimeDraft.dryRun,
    mirrorToS3: nextRuntimeDraft.mirrorToS3,
    mirrorToS3Input: nextRuntimeDraft.mirrorToS3Input,
    writeMarkdownSummary: nextRuntimeDraft.writeMarkdownSummary,
    llmEnabled: nextRuntimeDraft.llmEnabled,
    llmWriteSummary: nextRuntimeDraft.llmWriteSummary,
    llmExtractionCacheEnabled: nextRuntimeDraft.llmExtractionCacheEnabled,
    llmFallbackEnabled: nextRuntimeDraft.llmFallbackEnabled,
    llmExtractSkipLowSignal: nextRuntimeDraft.llmExtractSkipLowSignal,
    llmReasoningMode: nextRuntimeDraft.llmReasoningMode,
    llmDisableBudgetGuards: nextRuntimeDraft.llmDisableBudgetGuards,
    llmVerifyMode: nextRuntimeDraft.llmVerifyMode,
    reextractIndexed: nextRuntimeDraft.reextractIndexed,
    fetchCandidateSources: nextRuntimeDraft.fetchCandidateSources,
    manufacturerBroadDiscovery: nextRuntimeDraft.manufacturerBroadDiscovery,
    manufacturerSeedSearchUrls: nextRuntimeDraft.manufacturerSeedSearchUrls,
    manufacturerDeepResearchEnabled: nextRuntimeDraft.manufacturerDeepResearchEnabled,
    pdfBackendRouterEnabled: nextRuntimeDraft.pdfBackendRouterEnabled,
    capturePageScreenshotEnabled: nextRuntimeDraft.capturePageScreenshotEnabled,
    runtimeCaptureScreenshots: nextRuntimeDraft.runtimeCaptureScreenshots,
    visualAssetCaptureEnabled: nextRuntimeDraft.visualAssetCaptureEnabled,
    visualAssetStoreOriginal: nextRuntimeDraft.visualAssetStoreOriginal,
    visualAssetPhashEnabled: nextRuntimeDraft.visualAssetPhashEnabled,
    chartExtractionEnabled: nextRuntimeDraft.chartExtractionEnabled,
    articleExtractorV2Enabled: nextRuntimeDraft.articleExtractorV2Enabled,
    staticDomExtractorEnabled: nextRuntimeDraft.staticDomExtractorEnabled,
    htmlTableExtractorV2: nextRuntimeDraft.htmlTableExtractorV2,
    structuredMetadataExtructEnabled: nextRuntimeDraft.structuredMetadataExtructEnabled,
    structuredMetadataExtructCacheEnabled: nextRuntimeDraft.structuredMetadataExtructCacheEnabled,
    helperFilesEnabled: nextRuntimeDraft.helperFilesEnabled,
    helperSupportiveEnabled: nextRuntimeDraft.helperSupportiveEnabled,
    helperSupportiveFillMissing: nextRuntimeDraft.helperSupportiveFillMissing,
    helperAutoSeedTargets: nextRuntimeDraft.helperAutoSeedTargets,
    driftDetectionEnabled: nextRuntimeDraft.driftDetectionEnabled,
    driftAutoRepublish: nextRuntimeDraft.driftAutoRepublish,
    aggressiveModeEnabled: nextRuntimeDraft.aggressiveModeEnabled,
    aggressiveEvidenceAuditEnabled: nextRuntimeDraft.aggressiveEvidenceAuditEnabled,
    uberAggressiveEnabled: nextRuntimeDraft.uberAggressiveEnabled,
    cortexEnabled: nextRuntimeDraft.cortexEnabled,
    cortexAsyncEnabled: nextRuntimeDraft.cortexAsyncEnabled,
    cortexAutoStart: nextRuntimeDraft.cortexAutoStart,
    cortexAutoRestartOnAuth: nextRuntimeDraft.cortexAutoRestartOnAuth,
    cortexEscalateIfConflict: nextRuntimeDraft.cortexEscalateIfConflict,
    cortexEscalateCriticalOnly: nextRuntimeDraft.cortexEscalateCriticalOnly,
    allowBelowPassTargetFill: nextRuntimeDraft.allowBelowPassTargetFill,
    indexingHelperFilesEnabled: nextRuntimeDraft.indexingHelperFilesEnabled,
    disableGoogleCse: nextRuntimeDraft.disableGoogleCse,
    cseRescueOnlyMode: nextRuntimeDraft.cseRescueOnlyMode,
    duckduckgoEnabled: nextRuntimeDraft.duckduckgoEnabled,
    discoveryEnabled: nextRuntimeDraft.discoveryEnabled,
    dynamicCrawleeEnabled: nextRuntimeDraft.dynamicCrawleeEnabled,
    crawleeHeadless: nextRuntimeDraft.crawleeHeadless,
    fetchSchedulerEnabled: nextRuntimeDraft.fetchSchedulerEnabled,
    preferHttpFetcher: nextRuntimeDraft.preferHttpFetcher,
    frontierEnableSqlite: nextRuntimeDraft.frontierEnableSqlite,
    frontierStripTrackingParams: nextRuntimeDraft.frontierStripTrackingParams,
    frontierRepairSearchEnabled: nextRuntimeDraft.frontierRepairSearchEnabled,
    autoScrollEnabled: nextRuntimeDraft.autoScrollEnabled,
    graphqlReplayEnabled: nextRuntimeDraft.graphqlReplayEnabled,
    robotsTxtCompliant: nextRuntimeDraft.robotsTxtCompliant,
    runtimeScreencastEnabled: nextRuntimeDraft.runtimeScreencastEnabled,
    runtimeTraceEnabled: nextRuntimeDraft.runtimeTraceEnabled,
    runtimeTraceLlmPayloads: nextRuntimeDraft.runtimeTraceLlmPayloads,
    eventsJsonWrite: nextRuntimeDraft.eventsJsonWrite,
    indexingSchemaPacketsValidationEnabled: nextRuntimeDraft.indexingSchemaPacketsValidationEnabled,
    indexingSchemaPacketsValidationStrict: nextRuntimeDraft.indexingSchemaPacketsValidationStrict,
    queueJsonWrite: nextRuntimeDraft.queueJsonWrite,
    billingJsonWrite: nextRuntimeDraft.billingJsonWrite,
    brainJsonWrite: nextRuntimeDraft.brainJsonWrite,
    intelJsonWrite: nextRuntimeDraft.intelJsonWrite,
    corpusJsonWrite: nextRuntimeDraft.corpusJsonWrite,
    learningJsonWrite: nextRuntimeDraft.learningJsonWrite,
    cacheJsonWrite: nextRuntimeDraft.cacheJsonWrite,
    authoritySnapshotEnabled: nextRuntimeDraft.authoritySnapshotEnabled,
    selfImproveEnabled: nextRuntimeDraft.selfImproveEnabled,
    runtimeSettingsFallbackBaseline: runtimeManifestDefaults,
    resolveModelTokenDefaults,
  }), [resolveModelTokenDefaults, runtimeManifestDefaults]);

  const runtimeEditor = useRuntimeSettingsEditorAdapter<RuntimeDraft>({
    bootstrapValues: runtimeBootstrapDraft,
    payloadFromValues: payloadFromRuntimeDraft,
    normalizeSnapshot: (snapshot) => normalizeRuntimeDraft(snapshot, runtimeBootstrap),
    valuesEqual: runtimeDraftEqual,
    autoSaveEnabled: runtimeAutoSaveEnabled,
  });

  const runtimeDraft = runtimeEditor.values;
  const setRuntimeDraft = runtimeEditor.setValues;
  const runtimeDirty = runtimeEditor.dirty;
  const setRuntimeDirty = runtimeEditor.setDirty;
  const runtimeSaveState = runtimeEditor.saveStatus.kind;
  const runtimeSaveMessage = runtimeEditor.saveStatus.message;
  const runtimeSettingsLoading = runtimeEditor.isLoading;
  const runtimeSettingsSaving = runtimeEditor.isSaving;
  const saveNow = runtimeEditor.saveNow;

  const llmModelOptions = useMemo(() => {
    const options = Array.isArray(indexingLlmConfig?.model_options)
      ? indexingLlmConfig.model_options.map((row) => String(row || '').trim()).filter(Boolean)
      : [];
    const seeded = [
      ...options,
      runtimeDraft.phase2LlmModel,
      runtimeDraft.phase3LlmModel,
      runtimeDraft.llmModelFast,
      runtimeDraft.llmModelReasoning,
      runtimeDraft.llmModelExtract,
      runtimeDraft.llmModelValidate,
      runtimeDraft.llmModelWrite,
      runtimeDraft.llmFallbackPlanModel,
      runtimeDraft.llmFallbackExtractModel,
      runtimeDraft.llmFallbackValidateModel,
      runtimeDraft.llmFallbackWriteModel,
    ];
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const row of seeded) {
      const token = String(row || '').trim();
      if (!token) continue;
      const normalized = normalizeToken(token);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      deduped.push(token);
    }
    return deduped;
  }, [indexingLlmConfig, runtimeDraft]);

  const llmTokenPresetOptions = useMemo(() => {
    const seeded = [
      ...(Array.isArray(indexingLlmConfig?.token_presets) ? indexingLlmConfig.token_presets : []),
      runtimeDraft.llmTokensPlan,
      runtimeDraft.llmTokensTriage,
      runtimeDraft.llmTokensFast,
      runtimeDraft.llmTokensReasoning,
      runtimeDraft.llmTokensExtract,
      runtimeDraft.llmTokensValidate,
      runtimeDraft.llmTokensWrite,
      runtimeDraft.llmTokensPlanFallback,
      runtimeDraft.llmTokensExtractFallback,
      runtimeDraft.llmTokensValidateFallback,
      runtimeDraft.llmTokensWriteFallback,
      runtimeManifestDefaults.llmTokensPlan,
      runtimeManifestDefaults.llmTokensTriage,
      runtimeManifestDefaults.llmTokensFast,
      runtimeManifestDefaults.llmTokensReasoning,
      runtimeManifestDefaults.llmTokensExtract,
      runtimeManifestDefaults.llmTokensValidate,
      runtimeManifestDefaults.llmTokensWrite,
      runtimeManifestDefaults.llmTokensPlanFallback,
      runtimeManifestDefaults.llmTokensExtractFallback,
      runtimeManifestDefaults.llmTokensValidateFallback,
      runtimeManifestDefaults.llmTokensWriteFallback,
    ];
    const cleaned = seeded
      .map((row) => parseRuntimeLlmTokenCap(row))
      .filter((row): row is number => row !== null)
      .sort((a, b) => a - b);
    return [...new Set(cleaned)];
  }, [indexingLlmConfig, runtimeDraft, runtimeManifestDefaults]);

  const runtimeSettingsReady = runtimeReadyFlag && !runtimeSettingsLoading;
  const runtimeAutoSaveDelaySeconds = (SETTINGS_AUTOSAVE_DEBOUNCE_MS.runtime / 1000).toFixed(1);
  const dynamicFetchControlsLocked = !runtimeDraft.dynamicCrawleeEnabled;
  const ocrControlsLocked = !runtimeDraft.scannedPdfOcrEnabled;
  const plannerControlsLocked = !runtimeDraft.discoveryEnabled;
  const plannerModelLocked = plannerControlsLocked || !runtimeDraft.phase2LlmEnabled;
  const triageModelLocked = plannerControlsLocked || !runtimeDraft.phase3LlmTriageEnabled;
  const fallbackControlsLocked = !runtimeDraft.llmFallbackEnabled;
  const reextractWindowLocked = !runtimeDraft.reextractIndexed;
  const traceControlsLocked = !runtimeDraft.runtimeTraceEnabled;

  const stepEnabled = useMemo<Record<RuntimeStepId, boolean>>(() => ({
    'run-setup': true,
    'run-output': true,
    'run-intelligence': true,
    'observability-trace': true,
    'fetch-render': runtimeDraft.dynamicCrawleeEnabled,
    ocr: runtimeDraft.scannedPdfOcrEnabled,
    'planner-triage': runtimeDraft.discoveryEnabled && (runtimeDraft.phase2LlmEnabled || runtimeDraft.phase3LlmTriageEnabled),
    'role-routing': true,
    'fallback-routing': runtimeDraft.llmFallbackEnabled,
  }), [runtimeDraft]);
  const activeRuntimeStep = useMemo(
    () => RUNTIME_STEPS.find((step) => step.id === activeStep) || RUNTIME_STEPS[0],
    [activeStep],
  );
  const activeRuntimeSubSteps = useMemo(
    () => RUNTIME_SUB_STEPS[activeStep] || [],
    [activeStep],
  );
  const scrollToRuntimeSubStep = useCallback((subStepId: string) => {
    if (typeof document === 'undefined') return;
    const target = document.getElementById(runtimeSubStepDomId(subStepId));
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const runtimeStatusClass = runtimeSettingsSaving
    ? 'sf-status-text-info'
    : !runtimeSettingsReady
      ? 'sf-status-text-warning'
      : runtimeSaveState === 'error'
        ? 'sf-status-text-danger'
        : runtimeSaveState === 'partial'
          ? 'sf-status-text-warning'
          : runtimeDirty
            ? 'sf-status-text-warning'
            : 'sf-status-text-muted';

  const runtimeStatusText = runtimeSettingsSaving
    ? 'Saving runtime settings...'
    : !runtimeSettingsReady
      ? 'Loading persisted runtime settings...'
      : runtimeSaveState === 'error'
        ? (runtimeSaveMessage || 'Runtime settings save failed.')
        : runtimeSaveState === 'partial'
          ? runtimeSaveMessage
          : runtimeDirty
            ? (runtimeAutoSaveEnabled
              ? `Unsaved changes queued for auto save (${runtimeAutoSaveDelaySeconds}s).`
              : 'Unsaved changes.')
            : runtimeSaveState === 'ok'
              ? (runtimeSaveMessage || 'All changes saved.')
              : 'All changes saved.';

  function updateDraft<K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) {
    setRuntimeDraft((previous) => ({ ...previous, [key]: value }));
    setRuntimeDirty(true);
  }

  function onNumberChange<K extends keyof RuntimeDraft>(
    key: K,
    eventValue: string,
    bounds: NumberBound,
  ) {
    const current = runtimeDraft[key];
    const fallback = typeof current === 'number' ? current : 0;
    const next = parseBoundedNumber(eventValue, fallback, bounds) as RuntimeDraft[K];
    updateDraft(key, next);
  }

  function onRoleModelChange(
    modelKey:
      | 'phase2LlmModel'
      | 'phase3LlmModel'
      | 'llmModelFast'
      | 'llmModelReasoning'
      | 'llmModelExtract'
      | 'llmModelValidate'
      | 'llmModelWrite',
    tokenKey:
      | 'llmTokensPlan'
      | 'llmTokensTriage'
      | 'llmTokensFast'
      | 'llmTokensReasoning'
      | 'llmTokensExtract'
      | 'llmTokensValidate'
      | 'llmTokensWrite',
    model: string,
  ) {
    const defaults = resolveModelTokenDefaults(model);
    const nextToken = clampTokenForModel(model, defaults.default_output_tokens);
    setRuntimeDraft((previous) => ({
      ...previous,
      [modelKey]: model,
      [tokenKey]: nextToken,
    }));
    setRuntimeDirty(true);
  }

  function onFallbackModelChange(
    modelKey:
      | 'llmFallbackPlanModel'
      | 'llmFallbackExtractModel'
      | 'llmFallbackValidateModel'
      | 'llmFallbackWriteModel',
    tokenKey:
      | 'llmTokensPlanFallback'
      | 'llmTokensExtractFallback'
      | 'llmTokensValidateFallback'
      | 'llmTokensWriteFallback',
    model: string,
    fallbackModelWhenEmpty: string,
  ) {
    const effectiveModel = model || fallbackModelWhenEmpty;
    const defaults = resolveModelTokenDefaults(effectiveModel);
    const nextToken = clampTokenForModel(effectiveModel, defaults.default_output_tokens);
    setRuntimeDraft((previous) => ({
      ...previous,
      [modelKey]: model,
      [tokenKey]: nextToken,
    }));
    setRuntimeDirty(true);
  }

  function renderTokenOptions(model: string, prefix: string) {
    const cap = resolveModelTokenDefaults(model).max_output_tokens;
    return llmTokenPresetOptions.map((token) => {
      const disabled = token > cap;
      return (
        <option key={`${prefix}:${token}`} value={token} disabled={disabled}>
          {token}
          {disabled ? ' (model max)' : ''}
        </option>
      );
    });
  }

  function resetToDefaults() {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        'Reset all runtime settings to defaults? This overwrites current unsaved runtime edits.',
      );
      if (!confirmed) return;
    }
    setRuntimeDraft(runtimeManifestDefaults);
    setRuntimeDirty(true);
    setActiveStep('run-setup');
  }

  const inputCls = 'sf-input w-full py-2 sf-text-label leading-5 focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60';
  const panelDisabledCls = runtimeSettingsReady ? '' : 'opacity-70';
  const runtimeHeaderControls = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={saveNow}
        disabled={!runtimeSettingsReady || runtimeSettingsSaving || runtimeAutoSaveEnabled}
        className={`rounded px-3 py-1.5 sf-text-label disabled:opacity-50 ${
          runtimeAutoSaveEnabled
            ? 'sf-icon-button'
            : 'sf-primary-button'
        }`}
      >
        {runtimeSettingsSaving ? 'Saving...' : 'Save'}
      </button>
      <button
        onClick={() => setRuntimeAutoSaveEnabled(!runtimeAutoSaveEnabled)}
        disabled={!runtimeSettingsReady}
        className={`rounded px-3 py-1.5 sf-text-label ${
          runtimeAutoSaveEnabled
            ? 'sf-primary-button'
            : 'sf-action-button'
        }`}
        title={`When enabled, runtime settings are Auto-Saved ${runtimeAutoSaveDelaySeconds} seconds after each edit.`}
      >
        {runtimeAutoSaveEnabled ? 'Auto-Save On' : 'Auto-Save Off'}
      </button>
      <button
        onClick={resetToDefaults}
        disabled={!runtimeSettingsReady || runtimeSettingsSaving}
        className="rounded sf-danger-button px-3 py-1.5 sf-text-label disabled:opacity-50"
        title="Reset all runtime settings to default values."
      >
        Reset
      </button>
    </div>
  );

  return (
    <>
      {actionPortalTarget ? createPortal(runtimeHeaderControls, actionPortalTarget) : null}
      <div className="rounded sf-surface-card p-4 md:p-5 space-y-3.5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold inline-flex items-center" style={{ color: 'var(--sf-text)' }}>
            Runtime Flow Settings
            <Tip text="Phase 3 runtime settings migration. These controls are ordered to match pipeline execution from start to finish." />
          </h3>
          <p className="mt-1 sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
            Configure runtime behavior in pipeline order. Blue dots mark the selected step; enabled/disabled state is shown in each step row.
          </p>
          <p className={`mt-2 sf-text-label font-semibold ${runtimeStatusClass}`}>
            {runtimeStatusText}
          </p>
        </div>
        {!actionPortalTarget && !suppressInlineHeaderControls ? runtimeHeaderControls : null}
      </div>

      <div className={`grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-[280px_minmax(0,1fr)] ${panelDisabledCls}`}>
        <aside className="rounded sf-surface-elevated p-2.5 sm:p-3 flex min-h-0 flex-col">
          <div className="mb-2 px-2 sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
            Runtime Flow
          </div>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden pr-1">
          {RUNTIME_STEPS.map((step) => {
            const isActive = activeStep === step.id;
            const enabled = stepEnabled[step.id];
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                disabled={!runtimeSettingsReady}
                className={`group w-full sf-nav-item px-2.5 py-2.5 text-left ${
                  isActive
                    ? 'sf-nav-item-active'
                    : enabled
                      ? ''
                      : 'sf-nav-item-muted'
                } disabled:opacity-60`}
              >
                <div className="flex items-start gap-2">
                  <RuntimeStepIcon id={step.id} active={isActive} enabled={enabled} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="inline-flex items-center gap-1 sf-text-label font-semibold leading-5">
                        {step.label}
                        <Tip text={step.tip} />
                      </div>
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: isActive
                            ? 'rgb(var(--sf-color-accent-rgb))'
                            : 'rgb(var(--sf-color-border-subtle-rgb) / 0.7)',
                        }}
                        title={isActive ? 'Selected step' : enabled ? 'Enabled by master toggle' : 'Disabled by master toggle'}
                      />
                    </div>
                    <div className="mt-0.5 sf-text-caption leading-4" style={{ color: 'var(--sf-muted)' }}>
                      {step.tip}
                    </div>
                    <span
                      className={`mt-0.5 inline-flex rounded px-1.5 py-0.5 sf-text-label font-semibold leading-4 ${
                        enabled ? 'sf-callout sf-callout-success' : 'sf-callout sf-callout-neutral'
                      }`}
                    >
                      {enabled ? 'Enabled' : 'Disabled by master toggle'}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
          </div>
        </aside>

        <section className="rounded sf-surface-elevated p-3 md:p-4 space-y-3 min-h-0 overflow-x-hidden">
          <header className="rounded sf-surface-elevated px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2">
                <RuntimeStepIcon
                  id={activeRuntimeStep.id}
                  active
                  enabled
                />
                <div>
                  <div className="text-base font-semibold" style={{ color: 'var(--sf-text)' }}>
                    {activeRuntimeStep.label}
                  </div>
                  <div className="sf-text-label" style={{ color: 'var(--sf-muted)' }}>
                    {activeRuntimeStep.tip}
                  </div>
                </div>
              </div>
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor: 'rgb(var(--sf-color-accent-rgb))',
                }}
              />
            </div>
          </header>
          {activeRuntimeSubSteps.length > 1 ? (
            <aside className="rounded sf-surface-elevated p-2.5 sm:p-3">
              <div className="mb-2 inline-flex items-center gap-1 sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
                Runtime Sections
                <Tip text="Sub-step shortcuts for the selected main runtime step." />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeRuntimeSubSteps.map((subStep) => (
                  <button
                    key={`${activeStep}:substep:${subStep.id}`}
                    type="button"
                    data-runtime-substep={subStep.id}
                    onClick={() => scrollToRuntimeSubStep(subStep.id)}
                    disabled={!runtimeSettingsReady}
                    className="inline-flex items-center gap-1 rounded sf-nav-item px-2 py-1.5 sf-text-label font-semibold disabled:opacity-60"
                  >
                    <span>{subStep.label}</span>
                    <Tip text={subStep.tip} />
                  </button>
                ))}
              </div>
            </aside>
          ) : null}
          {activeStep === 'run-setup' || activeStep === 'run-output' || activeStep === 'run-intelligence' ? (
            <div className="space-y-3">
              <FlowOptionPanel
                title={
                  activeStep === 'run-output'
                    ? 'Runtime Outputs'
                    : activeStep === 'run-intelligence'
                      ? 'Consensus and Learning'
                      : 'Run Setup'
                }
                subtitle={
                  activeStep === 'run-output'
                    ? 'Output destinations, provider credentials, and planner/runtime endpoint overrides.'
                    : activeStep === 'run-intelligence'
                      ? 'Consensus scoring, drift automation, aggressive mode, cortex, and helper runtime.'
                      : 'Runtime bootstrap profile, discovery, and resume behavior.'
                }
              >
              {activeStep === 'run-setup' ? (
                <>
              <div id={runtimeSubStepDomId('run-setup-discovery')} className="scroll-mt-24" />
              <SettingRow label="Run Profile" tip="Controls runtime depth and cost envelope for this category run.">
                <select
                  value={runtimeDraft.profile}
                  onChange={(event) => updateDraft('profile', event.target.value as RuntimeDraft['profile'])}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  <option value="fast">fast</option>
                  <option value="standard">standard</option>
                  <option value="thorough">thorough</option>
                </select>
              </SettingRow>
              <SettingRow label="Discovery Enabled" tip="Master toggle for provider discovery and planner/triage controls.">
                <SettingToggle
                  checked={runtimeDraft.discoveryEnabled}
                  onChange={(enabled) => {
                    setRuntimeDraft((previous) => ({
                      ...previous,
                      discoveryEnabled: enabled,
                      searchProvider: enabled
                        ? (previous.searchProvider === 'none' ? 'duckduckgo' : previous.searchProvider)
                        : 'none',
                    }));
                    setRuntimeDirty(true);
                  }}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow
                label="Search Provider"
                tip="Search provider used during discovery. Disabled when discovery is off."
                disabled={!runtimeDraft.discoveryEnabled}
              >
                <select
                  value={runtimeDraft.searchProvider}
                  onChange={(event) => updateDraft('searchProvider', event.target.value as RuntimeDraft['searchProvider'])}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                >
                  {SEARCH_PROVIDER_OPTIONS.map((option) => (
                    <option key={`provider:${option}`} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow
                label="SearXNG Base URL"
                tip="Override endpoint for self-hosted SearXNG provider."
                disabled={!runtimeDraft.discoveryEnabled}
              >
                <input
                  type="text"
                  value={runtimeDraft.searxngBaseUrl}
                  onChange={(event) => updateDraft('searxngBaseUrl', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                  placeholder="http://localhost:8080"
                />
              </SettingRow>
              <SettingRow
                label="Bing Search Endpoint"
                tip="Override endpoint for Bing Web Search API."
                disabled={!runtimeDraft.discoveryEnabled}
              >
                <input
                  type="text"
                  value={runtimeDraft.bingSearchEndpoint}
                  onChange={(event) => updateDraft('bingSearchEndpoint', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                  placeholder="https://api.bing.microsoft.com/v7.0/search"
                />
              </SettingRow>
              <SettingRow
                label="Google CSE CX"
                tip="Google Custom Search Engine identifier used for CSE queries."
                disabled={!runtimeDraft.discoveryEnabled}
              >
                <input
                  type="text"
                  value={runtimeDraft.googleCseCx}
                  onChange={(event) => updateDraft('googleCseCx', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                  placeholder="custom-search-engine-id"
                />
              </SettingRow>
              <SettingRow
                label="DuckDuckGo Base URL"
                tip="Base URL for DuckDuckGo HTML search fallback."
                disabled={!runtimeDraft.discoveryEnabled}
              >
                <input
                  type="text"
                  value={runtimeDraft.duckduckgoBaseUrl}
                  onChange={(event) => updateDraft('duckduckgoBaseUrl', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                  placeholder="https://html.duckduckgo.com/html/"
                />
              </SettingRow>
              <SettingRow
                label="DuckDuckGo Timeout (ms)"
                tip="Request timeout for DuckDuckGo provider calls."
                disabled={!runtimeDraft.discoveryEnabled}
              >
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.duckduckgoTimeoutMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.duckduckgoTimeoutMs.max}
                  step={250}
                  value={runtimeDraft.duckduckgoTimeoutMs}
                  onChange={(event) => onNumberChange('duckduckgoTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.duckduckgoTimeoutMs)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Fetch Candidate Sources" tip="Allow candidate URL harvesting from discovered pages." disabled={!runtimeDraft.discoveryEnabled}>
                <SettingToggle
                  checked={runtimeDraft.fetchCandidateSources}
                  onChange={(next) => updateDraft('fetchCandidateSources', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                />
              </SettingRow>
              <SettingRow label="Manufacturer Broad Discovery" tip="Enable expanded manufacturer-domain search strategy." disabled={!runtimeDraft.discoveryEnabled}>
                <SettingToggle
                  checked={runtimeDraft.manufacturerBroadDiscovery}
                  onChange={(next) => updateDraft('manufacturerBroadDiscovery', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                />
              </SettingRow>
              <SettingRow label="Manufacturer Seed Search URLs" tip="Seed manufacturer-specific discovery URLs in early rounds." disabled={!runtimeDraft.discoveryEnabled}>
                <SettingToggle
                  checked={runtimeDraft.manufacturerSeedSearchUrls}
                  onChange={(next) => updateDraft('manufacturerSeedSearchUrls', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                />
              </SettingRow>
              <SettingRow label="Discovery Max Queries" tip="Maximum discovery search queries emitted for each product." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.discoveryMaxQueries.min}
                  max={RUNTIME_NUMBER_BOUNDS.discoveryMaxQueries.max}
                  step={1}
                  value={runtimeDraft.discoveryMaxQueries}
                  onChange={(event) => onNumberChange('discoveryMaxQueries', event.target.value, RUNTIME_NUMBER_BOUNDS.discoveryMaxQueries)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Discovery Results / Query" tip="SERP results retained for each discovery query." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.discoveryResultsPerQuery.min}
                  max={RUNTIME_NUMBER_BOUNDS.discoveryResultsPerQuery.max}
                  step={1}
                  value={runtimeDraft.discoveryResultsPerQuery}
                  onChange={(event) => onNumberChange('discoveryResultsPerQuery', event.target.value, RUNTIME_NUMBER_BOUNDS.discoveryResultsPerQuery)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Discovery Max Discovered" tip="Maximum discovered URLs admitted into the candidate set." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.discoveryMaxDiscovered.min}
                  max={RUNTIME_NUMBER_BOUNDS.discoveryMaxDiscovered.max}
                  step={1}
                  value={runtimeDraft.discoveryMaxDiscovered}
                  onChange={(event) => onNumberChange('discoveryMaxDiscovered', event.target.value, RUNTIME_NUMBER_BOUNDS.discoveryMaxDiscovered)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Discovery Query Concurrency" tip="Parallel discovery query fanout limit." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.discoveryQueryConcurrency.min}
                  max={RUNTIME_NUMBER_BOUNDS.discoveryQueryConcurrency.max}
                  step={1}
                  value={runtimeDraft.discoveryQueryConcurrency}
                  onChange={(event) => onNumberChange('discoveryQueryConcurrency', event.target.value, RUNTIME_NUMBER_BOUNDS.discoveryQueryConcurrency)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow
                label="Search Profile Caps Map (JSON)"
                tip="JSON map for deterministic alias, validation, hint, and dedupe caps used by search profile generation."
                disabled={!runtimeDraft.discoveryEnabled}
              >
                <textarea
                  value={runtimeDraft.searchProfileCapMapJson}
                  onChange={(event) => updateDraft('searchProfileCapMapJson', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
                  spellCheck={false}
                />
              </SettingRow>
              <SettingRow label="Manufacturer Deep Research Enabled" tip="Enable deeper manufacturer-only follow-up discovery strategy." disabled={!runtimeDraft.discoveryEnabled}>
                <SettingToggle
                  checked={runtimeDraft.manufacturerDeepResearchEnabled}
                  onChange={(next) => updateDraft('manufacturerDeepResearchEnabled', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                />
              </SettingRow>
              <SettingRow label="Max URLs / Product" tip="Primary ceiling for URLs collected per product." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxUrlsPerProduct.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxUrlsPerProduct.max}
                  step={1}
                  value={runtimeDraft.maxUrlsPerProduct}
                  onChange={(event) => onNumberChange('maxUrlsPerProduct', event.target.value, RUNTIME_NUMBER_BOUNDS.maxUrlsPerProduct)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Max Candidate URLs" tip="Upper bound for candidate URLs admitted before fetch." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxCandidateUrls.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxCandidateUrls.max}
                  step={1}
                  value={runtimeDraft.maxCandidateUrls}
                  onChange={(event) => onNumberChange('maxCandidateUrls', event.target.value, RUNTIME_NUMBER_BOUNDS.maxCandidateUrls)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Max Pages / Domain" tip="Per-domain page cap for discovery and fetch." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxPagesPerDomain.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxPagesPerDomain.max}
                  step={1}
                  value={runtimeDraft.maxPagesPerDomain}
                  onChange={(event) => onNumberChange('maxPagesPerDomain', event.target.value, RUNTIME_NUMBER_BOUNDS.maxPagesPerDomain)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Uber Max URLs / Product" tip="Upper bound used by uber-aggressive mode." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.uberMaxUrlsPerProduct.min}
                  max={RUNTIME_NUMBER_BOUNDS.uberMaxUrlsPerProduct.max}
                  step={1}
                  value={runtimeDraft.uberMaxUrlsPerProduct}
                  onChange={(event) => onNumberChange('uberMaxUrlsPerProduct', event.target.value, RUNTIME_NUMBER_BOUNDS.uberMaxUrlsPerProduct)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Uber Max URLs / Domain" tip="Per-domain URL cap in uber-aggressive mode." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.uberMaxUrlsPerDomain.min}
                  max={RUNTIME_NUMBER_BOUNDS.uberMaxUrlsPerDomain.max}
                  step={1}
                  value={runtimeDraft.uberMaxUrlsPerDomain}
                  onChange={(event) => onNumberChange('uberMaxUrlsPerDomain', event.target.value, RUNTIME_NUMBER_BOUNDS.uberMaxUrlsPerDomain)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Max Run Seconds" tip="Global wall-clock cap for a single product runtime." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxRunSeconds.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxRunSeconds.max}
                  step={1}
                  value={runtimeDraft.maxRunSeconds}
                  onChange={(event) => onNumberChange('maxRunSeconds', event.target.value, RUNTIME_NUMBER_BOUNDS.maxRunSeconds)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Max JSON Bytes" tip="Response JSON payload safety limit." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxJsonBytes.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxJsonBytes.max}
                  step={1024}
                  value={runtimeDraft.maxJsonBytes}
                  onChange={(event) => onNumberChange('maxJsonBytes', event.target.value, RUNTIME_NUMBER_BOUNDS.maxJsonBytes)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Max Manufacturer URLs / Product" tip="Manufacturer-specific URL budget per product." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxManufacturerUrlsPerProduct.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxManufacturerUrlsPerProduct.max}
                  step={1}
                  value={runtimeDraft.maxManufacturerUrlsPerProduct}
                  onChange={(event) => onNumberChange('maxManufacturerUrlsPerProduct', event.target.value, RUNTIME_NUMBER_BOUNDS.maxManufacturerUrlsPerProduct)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Max Manufacturer Pages / Domain" tip="Manufacturer domain page cap." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxManufacturerPagesPerDomain.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxManufacturerPagesPerDomain.max}
                  step={1}
                  value={runtimeDraft.maxManufacturerPagesPerDomain}
                  onChange={(event) => onNumberChange('maxManufacturerPagesPerDomain', event.target.value, RUNTIME_NUMBER_BOUNDS.maxManufacturerPagesPerDomain)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Manufacturer Reserve URLs" tip="Reserved URL budget kept for manufacturer domains." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.manufacturerReserveUrls.min}
                  max={RUNTIME_NUMBER_BOUNDS.manufacturerReserveUrls.max}
                  step={1}
                  value={runtimeDraft.manufacturerReserveUrls}
                  onChange={(event) => onNumberChange('manufacturerReserveUrls', event.target.value, RUNTIME_NUMBER_BOUNDS.manufacturerReserveUrls)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="User Agent" tip="HTTP User-Agent string for outbound fetch requests." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="text"
                  value={runtimeDraft.userAgent}
                  onChange={(event) => updateDraft('userAgent', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Self Improve Enabled" tip="Enable post-run hypothesis improvement and follow-up logic." disabled={!runtimeDraft.discoveryEnabled}>
                <SettingToggle
                  checked={runtimeDraft.selfImproveEnabled}
                  onChange={(next) => updateDraft('selfImproveEnabled', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                />
              </SettingRow>
              <SettingRow label="Max Hypothesis Items" tip="Maximum hypothesis rows considered during self-improve." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxHypothesisItems.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxHypothesisItems.max}
                  step={1}
                  value={runtimeDraft.maxHypothesisItems}
                  onChange={(event) => onNumberChange('maxHypothesisItems', event.target.value, RUNTIME_NUMBER_BOUNDS.maxHypothesisItems)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Hypothesis Auto Followup Rounds" tip="Number of automatic follow-up rounds for hypothesis exploration." disabled={!runtimeDraft.discoveryEnabled || !runtimeDraft.selfImproveEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.hypothesisAutoFollowupRounds.min}
                  max={RUNTIME_NUMBER_BOUNDS.hypothesisAutoFollowupRounds.max}
                  step={1}
                  value={runtimeDraft.hypothesisAutoFollowupRounds}
                  onChange={(event) => onNumberChange('hypothesisAutoFollowupRounds', event.target.value, RUNTIME_NUMBER_BOUNDS.hypothesisAutoFollowupRounds)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled || !runtimeDraft.selfImproveEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Hypothesis Followup URLs / Round" tip="URL budget consumed in each hypothesis follow-up round." disabled={!runtimeDraft.discoveryEnabled || !runtimeDraft.selfImproveEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.hypothesisFollowupUrlsPerRound.min}
                  max={RUNTIME_NUMBER_BOUNDS.hypothesisFollowupUrlsPerRound.max}
                  step={1}
                  value={runtimeDraft.hypothesisFollowupUrlsPerRound}
                  onChange={(event) => onNumberChange('hypothesisFollowupUrlsPerRound', event.target.value, RUNTIME_NUMBER_BOUNDS.hypothesisFollowupUrlsPerRound)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled || !runtimeDraft.selfImproveEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Learning Confidence Threshold" tip="Minimum confidence required for learning signal acceptance." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.learningConfidenceThreshold.min}
                  max={RUNTIME_NUMBER_BOUNDS.learningConfidenceThreshold.max}
                  step={0.01}
                  value={runtimeDraft.learningConfidenceThreshold}
                  onChange={(event) => onNumberChange('learningConfidenceThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.learningConfidenceThreshold)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Component Lexicon Decay Days" tip="Decay horizon in days for component lexicon learning memory." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.componentLexiconDecayDays.min}
                  max={RUNTIME_NUMBER_BOUNDS.componentLexiconDecayDays.max}
                  step={1}
                  value={runtimeDraft.componentLexiconDecayDays}
                  onChange={(event) => onNumberChange('componentLexiconDecayDays', event.target.value, RUNTIME_NUMBER_BOUNDS.componentLexiconDecayDays)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Component Lexicon Expire Days" tip="Expiration horizon in days for component lexicon entries." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.componentLexiconExpireDays.min}
                  max={RUNTIME_NUMBER_BOUNDS.componentLexiconExpireDays.max}
                  step={1}
                  value={runtimeDraft.componentLexiconExpireDays}
                  onChange={(event) => onNumberChange('componentLexiconExpireDays', event.target.value, RUNTIME_NUMBER_BOUNDS.componentLexiconExpireDays)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Field Anchors Decay Days" tip="Decay horizon in days for learned field-anchor associations." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.fieldAnchorsDecayDays.min}
                  max={RUNTIME_NUMBER_BOUNDS.fieldAnchorsDecayDays.max}
                  step={1}
                  value={runtimeDraft.fieldAnchorsDecayDays}
                  onChange={(event) => onNumberChange('fieldAnchorsDecayDays', event.target.value, RUNTIME_NUMBER_BOUNDS.fieldAnchorsDecayDays)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="URL Memory Decay Days" tip="Decay horizon in days for learned URL memory signals." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.urlMemoryDecayDays.min}
                  max={RUNTIME_NUMBER_BOUNDS.urlMemoryDecayDays.max}
                  step={1}
                  value={runtimeDraft.urlMemoryDecayDays}
                  onChange={(event) => onNumberChange('urlMemoryDecayDays', event.target.value, RUNTIME_NUMBER_BOUNDS.urlMemoryDecayDays)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Disable Google CSE" tip="Disable Google CSE provider even when credentials are configured." disabled={!runtimeDraft.discoveryEnabled}>
                <SettingToggle
                  checked={runtimeDraft.disableGoogleCse}
                  onChange={(next) => updateDraft('disableGoogleCse', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                />
              </SettingRow>
              <SettingRow label="CSE Rescue Only Mode" tip="Use Google CSE only as rescue fallback after primary search underperforms." disabled={!runtimeDraft.discoveryEnabled}>
                <SettingToggle
                  checked={runtimeDraft.cseRescueOnlyMode}
                  onChange={(next) => updateDraft('cseRescueOnlyMode', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                />
              </SettingRow>
              <SettingRow label="CSE Rescue Required Iteration" tip="Iteration threshold that activates Google CSE rescue mode." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.cseRescueRequiredIteration.min}
                  max={RUNTIME_NUMBER_BOUNDS.cseRescueRequiredIteration.max}
                  step={1}
                  value={runtimeDraft.cseRescueRequiredIteration}
                  onChange={(event) => onNumberChange('cseRescueRequiredIteration', event.target.value, RUNTIME_NUMBER_BOUNDS.cseRescueRequiredIteration)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="DuckDuckGo Enabled" tip="Enable DuckDuckGo provider fallback for free-search mode." disabled={!runtimeDraft.discoveryEnabled}>
                <SettingToggle
                  checked={runtimeDraft.duckduckgoEnabled}
                  onChange={(next) => updateDraft('duckduckgoEnabled', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                />
              </SettingRow>
              <SettingRow label="Endpoint Signal Limit" tip="Maximum endpoint signals retained per page scan." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.endpointSignalLimit.min}
                  max={RUNTIME_NUMBER_BOUNDS.endpointSignalLimit.max}
                  step={1}
                  value={runtimeDraft.endpointSignalLimit}
                  onChange={(event) => onNumberChange('endpointSignalLimit', event.target.value, RUNTIME_NUMBER_BOUNDS.endpointSignalLimit)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Endpoint Suggestion Limit" tip="Maximum endpoint suggestions promoted from signal analysis." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.endpointSuggestionLimit.min}
                  max={RUNTIME_NUMBER_BOUNDS.endpointSuggestionLimit.max}
                  step={1}
                  value={runtimeDraft.endpointSuggestionLimit}
                  onChange={(event) => onNumberChange('endpointSuggestionLimit', event.target.value, RUNTIME_NUMBER_BOUNDS.endpointSuggestionLimit)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Endpoint Network Scan Limit" tip="Maximum network responses inspected while mining endpoint signals." disabled={!runtimeDraft.discoveryEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.endpointNetworkScanLimit.min}
                  max={RUNTIME_NUMBER_BOUNDS.endpointNetworkScanLimit.max}
                  step={10}
                  value={runtimeDraft.endpointNetworkScanLimit}
                  onChange={(event) => onNumberChange('endpointNetworkScanLimit', event.target.value, RUNTIME_NUMBER_BOUNDS.endpointNetworkScanLimit)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.discoveryEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Resume Mode" tip="Controls whether prior run state is reused or ignored.">
                <select
                  value={runtimeDraft.resumeMode}
                  onChange={(event) => updateDraft('resumeMode', event.target.value as RuntimeDraft['resumeMode'])}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {RESUME_MODE_OPTIONS.map((mode) => (
                    <option key={`resume:${mode}`} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow
                label="Resume Window (hours)"
                tip="Maximum age of resumable state. Older state is ignored when resume mode allows resume."
              >
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.resumeWindowHours.min}
                  max={RUNTIME_NUMBER_BOUNDS.resumeWindowHours.max}
                  step={1}
                  value={runtimeDraft.resumeWindowHours}
                  onChange={(event) => onNumberChange('resumeWindowHours', event.target.value, RUNTIME_NUMBER_BOUNDS.resumeWindowHours)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Re-extract Indexed" tip="Master toggle for stale indexed-source re-extraction.">
                <SettingToggle
                  checked={runtimeDraft.reextractIndexed}
                  onChange={(next) => updateDraft('reextractIndexed', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow
                label="Re-extract Age (hours)"
                tip="Age threshold for re-extracting successful indexed sources."
                disabled={reextractWindowLocked}
              >
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.reextractAfterHours.min}
                  max={RUNTIME_NUMBER_BOUNDS.reextractAfterHours.max}
                  step={1}
                  value={runtimeDraft.reextractAfterHours}
                  onChange={(event) => onNumberChange('reextractAfterHours', event.target.value, RUNTIME_NUMBER_BOUNDS.reextractAfterHours)}
                  disabled={!runtimeSettingsReady || reextractWindowLocked}
                  className={inputCls}
                />
              </SettingRow>
                <div id={runtimeSubStepDomId('run-setup-resume')} className="scroll-mt-24" />
                </>
              ) : null}
              {activeStep === 'run-output' ? (
                <>
              <div id={runtimeSubStepDomId('run-output-destinations')} className="scroll-mt-24" />
              <SettingGroupBlock title="Output and Planner Overrides">
                <SettingRow label="Output Mode" tip="Output destination mode: local, dual, or s3.">
                  <select
                    value={runtimeDraft.outputMode}
                    onChange={(event) => updateDraft('outputMode', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    <option value="local">local</option>
                    <option value="dual">dual</option>
                    <option value="s3">s3</option>
                  </select>
                </SettingRow>
                <SettingRow label="Local Mode" tip="Run output pipeline in local-mode behavior path.">
                  <SettingToggle
                    checked={runtimeDraft.localMode}
                    onChange={(next) => updateDraft('localMode', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Dry Run" tip="Execute pipeline without persisting final publish artifacts.">
                  <SettingToggle
                    checked={runtimeDraft.dryRun}
                    onChange={(next) => updateDraft('dryRun', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Mirror To S3" tip="Mirror output artifacts to S3 destination paths.">
                  <SettingToggle
                    checked={runtimeDraft.mirrorToS3}
                    onChange={(next) => updateDraft('mirrorToS3', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Mirror To S3 Input" tip="Mirror local input fixtures to configured S3 input prefix.">
                  <SettingToggle
                    checked={runtimeDraft.mirrorToS3Input}
                    onChange={(next) => updateDraft('mirrorToS3Input', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Local Input Root" tip="Root path used for local input fixture ingestion.">
                  <input
                    type="text"
                    value={runtimeDraft.localInputRoot}
                    onChange={(event) => updateDraft('localInputRoot', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Local Output Root" tip="Root path where local output artifacts are written.">
                  <input
                    type="text"
                    value={runtimeDraft.localOutputRoot}
                    onChange={(event) => updateDraft('localOutputRoot', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Runtime Events Key" tip="Output key/path for runtime events stream artifact.">
                  <input
                    type="text"
                    value={runtimeDraft.runtimeEventsKey}
                    onChange={(event) => updateDraft('runtimeEventsKey', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Write Markdown Summary" tip="Emit Markdown summary artifact after run completion.">
                  <SettingToggle
                    checked={runtimeDraft.writeMarkdownSummary}
                    onChange={(next) => updateDraft('writeMarkdownSummary', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="AWS Region" tip="AWS region token for S3 and related integrations.">
                  <input
                    type="text"
                    value={runtimeDraft.awsRegion}
                    onChange={(event) => updateDraft('awsRegion', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="S3 Bucket" tip="S3 bucket name used for output/input mirroring.">
                  <input
                    type="text"
                    value={runtimeDraft.s3Bucket}
                    onChange={(event) => updateDraft('s3Bucket', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="S3 Input Prefix" tip="S3 prefix for mirrored input assets.">
                  <input
                    type="text"
                    value={runtimeDraft.s3InputPrefix}
                    onChange={(event) => updateDraft('s3InputPrefix', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="S3 Output Prefix" tip="S3 prefix for mirrored output artifacts.">
                  <input
                    type="text"
                    value={runtimeDraft.s3OutputPrefix}
                    onChange={(event) => updateDraft('s3OutputPrefix', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="ELO Supabase Anon Key" tip="Anonymous key for optional ELO Supabase integrations.">
                  <input
                    type="text"
                    value={runtimeDraft.eloSupabaseAnonKey}
                    onChange={(event) => updateDraft('eloSupabaseAnonKey', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="ELO Supabase Endpoint" tip="Base endpoint for optional ELO Supabase integrations.">
                  <input
                    type="text"
                    value={runtimeDraft.eloSupabaseEndpoint}
                    onChange={(event) => updateDraft('eloSupabaseEndpoint', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <div id={runtimeSubStepDomId('run-output-providers')} className="scroll-mt-24" />
                <SettingRow label="LLM Enabled" tip="Master runtime switch for LLM-powered enrichment lanes.">
                  <SettingToggle
                    checked={runtimeDraft.llmEnabled}
                    onChange={(next) => updateDraft('llmEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="LLM Write Summary" tip="Enable LLM-generated write-summary artifact output.">
                  <SettingToggle
                    checked={runtimeDraft.llmWriteSummary}
                    onChange={(next) => updateDraft('llmWriteSummary', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="LLM Provider" tip="Primary provider token for direct LLM runtime calls.">
                  <input
                    type="text"
                    value={runtimeDraft.llmProvider}
                    onChange={(event) => updateDraft('llmProvider', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="LLM Base URL" tip="Base URL override for the selected LLM provider.">
                  <input
                    type="text"
                    value={runtimeDraft.llmBaseUrl}
                    onChange={(event) => updateDraft('llmBaseUrl', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="OpenAI API Key" tip="Optional OpenAI key override for runtime model calls.">
                  <input
                    type="password"
                    value={runtimeDraft.openaiApiKey}
                    onChange={(event) => updateDraft('openaiApiKey', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Anthropic API Key" tip="Optional Anthropic key override for runtime model calls.">
                  <input
                    type="password"
                    value={runtimeDraft.anthropicApiKey}
                    onChange={(event) => updateDraft('anthropicApiKey', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Runtime Control File" tip="Runtime overrides control file path.">
                  <input
                    type="text"
                    value={runtimeDraft.runtimeControlFile}
                    onChange={(event) => updateDraft('runtimeControlFile', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                    placeholder="_runtime/control/runtime_overrides.json"
                  />
                </SettingRow>
                <SettingRow label="LLM Plan Provider" tip="Planner-provider override token (optional).">
                  <input
                    type="text"
                    value={runtimeDraft.llmPlanProvider}
                    onChange={(event) => updateDraft('llmPlanProvider', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="LLM Plan Base URL" tip="Planner-provider base URL override (optional).">
                  <input
                    type="text"
                    value={runtimeDraft.llmPlanBaseUrl}
                    onChange={(event) => updateDraft('llmPlanBaseUrl', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <div className="border-t sf-border-default pt-3">
                  <h4 className="sf-text-label font-semibold uppercase tracking-[0.08em] sf-text-subtle">LLM Budgets and Reasoning</h4>
                </div>
                <SettingRow label="NeedSet Evidence Decay Days" tip="Days for NeedSet evidence score decay horizon.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetEvidenceDecayDays.min} max={RUNTIME_NUMBER_BOUNDS.needsetEvidenceDecayDays.max} step={1} value={runtimeDraft.needsetEvidenceDecayDays} onChange={(event) => onNumberChange('needsetEvidenceDecayDays', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetEvidenceDecayDays)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Evidence Decay Floor" tip="Minimum retained NeedSet evidence weight after decay.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetEvidenceDecayFloor.min} max={RUNTIME_NUMBER_BOUNDS.needsetEvidenceDecayFloor.max} step={0.01} value={runtimeDraft.needsetEvidenceDecayFloor} onChange={(event) => onNumberChange('needsetEvidenceDecayFloor', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetEvidenceDecayFloor)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <div className="border-t sf-border-default pt-3">
                  <h4 className="sf-text-label font-semibold uppercase tracking-[0.08em] sf-text-subtle">NeedSet Identity Scoring</h4>
                </div>
                <SettingRow label="NeedSet Required Weight (Identity)" tip="NeedSet score weight for identity-level required fields.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightIdentity.min} max={RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightIdentity.max} step={0.1} value={runtimeDraft.needsetRequiredWeightIdentity} onChange={(event) => onNumberChange('needsetRequiredWeightIdentity', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightIdentity)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Required Weight (Critical)" tip="NeedSet score weight for critical required fields.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightCritical.min} max={RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightCritical.max} step={0.1} value={runtimeDraft.needsetRequiredWeightCritical} onChange={(event) => onNumberChange('needsetRequiredWeightCritical', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightCritical)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Required Weight (Required)" tip="NeedSet score weight for required fields.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightRequired.min} max={RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightRequired.max} step={0.1} value={runtimeDraft.needsetRequiredWeightRequired} onChange={(event) => onNumberChange('needsetRequiredWeightRequired', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightRequired)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Required Weight (Expected)" tip="NeedSet score weight for expected fields.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightExpected.min} max={RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightExpected.max} step={0.1} value={runtimeDraft.needsetRequiredWeightExpected} onChange={(event) => onNumberChange('needsetRequiredWeightExpected', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightExpected)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Required Weight (Optional)" tip="NeedSet score weight for optional fields.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightOptional.min} max={RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightOptional.max} step={0.1} value={runtimeDraft.needsetRequiredWeightOptional} onChange={(event) => onNumberChange('needsetRequiredWeightOptional', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetRequiredWeightOptional)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Missing Multiplier" tip="Penalty multiplier for missing required evidence in NeedSet scoring.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetMissingMultiplier.min} max={RUNTIME_NUMBER_BOUNDS.needsetMissingMultiplier.max} step={0.1} value={runtimeDraft.needsetMissingMultiplier} onChange={(event) => onNumberChange('needsetMissingMultiplier', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetMissingMultiplier)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Tier Deficit Multiplier" tip="Penalty multiplier for confidence-tier deficits in NeedSet scoring.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetTierDeficitMultiplier.min} max={RUNTIME_NUMBER_BOUNDS.needsetTierDeficitMultiplier.max} step={0.1} value={runtimeDraft.needsetTierDeficitMultiplier} onChange={(event) => onNumberChange('needsetTierDeficitMultiplier', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetTierDeficitMultiplier)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Min-Refs Deficit Multiplier" tip="Penalty multiplier when evidence ref-count is below threshold.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetMinRefsDeficitMultiplier.min} max={RUNTIME_NUMBER_BOUNDS.needsetMinRefsDeficitMultiplier.max} step={0.1} value={runtimeDraft.needsetMinRefsDeficitMultiplier} onChange={(event) => onNumberChange('needsetMinRefsDeficitMultiplier', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetMinRefsDeficitMultiplier)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Conflict Multiplier" tip="Penalty multiplier applied when NeedSet evidence conflicts.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetConflictMultiplier.min} max={RUNTIME_NUMBER_BOUNDS.needsetConflictMultiplier.max} step={0.1} value={runtimeDraft.needsetConflictMultiplier} onChange={(event) => onNumberChange('needsetConflictMultiplier', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetConflictMultiplier)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Identity Lock Threshold" tip="Identity confidence needed to mark identity state locked.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetIdentityLockThreshold.min} max={RUNTIME_NUMBER_BOUNDS.needsetIdentityLockThreshold.max} step={0.01} value={runtimeDraft.needsetIdentityLockThreshold} onChange={(event) => onNumberChange('needsetIdentityLockThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetIdentityLockThreshold)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Identity Provisional Threshold" tip="Identity confidence needed to mark identity state provisional.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetIdentityProvisionalThreshold.min} max={RUNTIME_NUMBER_BOUNDS.needsetIdentityProvisionalThreshold.max} step={0.01} value={runtimeDraft.needsetIdentityProvisionalThreshold} onChange={(event) => onNumberChange('needsetIdentityProvisionalThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetIdentityProvisionalThreshold)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="NeedSet Identity Audit Limit" tip="Maximum identity-audit rows retained in NeedSet diagnostics.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.needsetDefaultIdentityAuditLimit.min} max={RUNTIME_NUMBER_BOUNDS.needsetDefaultIdentityAuditLimit.max} step={1} value={runtimeDraft.needsetDefaultIdentityAuditLimit} onChange={(event) => onNumberChange('needsetDefaultIdentityAuditLimit', event.target.value, RUNTIME_NUMBER_BOUNDS.needsetDefaultIdentityAuditLimit)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Extract Max Tokens" tip="Token cap per extract completion.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmExtractMaxTokens.min} max={RUNTIME_NUMBER_BOUNDS.llmExtractMaxTokens.max} step={1} value={runtimeDraft.llmExtractMaxTokens} onChange={(event) => onNumberChange('llmExtractMaxTokens', event.target.value, RUNTIME_NUMBER_BOUNDS.llmExtractMaxTokens)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Extract Max Snippets/Batch" tip="Max evidence snippets grouped into each extract request.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetsPerBatch.min} max={RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetsPerBatch.max} step={1} value={runtimeDraft.llmExtractMaxSnippetsPerBatch} onChange={(event) => onNumberChange('llmExtractMaxSnippetsPerBatch', event.target.value, RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetsPerBatch)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Extract Max Snippet Chars" tip="Character ceiling per evidence snippet sent to extract lane.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetChars.min} max={RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetChars.max} step={50} value={runtimeDraft.llmExtractMaxSnippetChars} onChange={(event) => onNumberChange('llmExtractMaxSnippetChars', event.target.value, RUNTIME_NUMBER_BOUNDS.llmExtractMaxSnippetChars)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Extract Skip Low Signal" tip="Skip extraction attempts for low-signal evidence bundles.">
                  <SettingToggle checked={runtimeDraft.llmExtractSkipLowSignal} onChange={(next) => updateDraft('llmExtractSkipLowSignal', next)} disabled={!runtimeSettingsReady} />
                </SettingRow>
                <SettingRow label="LLM Extract Reasoning Budget" tip="Reasoning-token budget for extract lane completions.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmExtractReasoningBudget.min} max={RUNTIME_NUMBER_BOUNDS.llmExtractReasoningBudget.max} step={1} value={runtimeDraft.llmExtractReasoningBudget} onChange={(event) => onNumberChange('llmExtractReasoningBudget', event.target.value, RUNTIME_NUMBER_BOUNDS.llmExtractReasoningBudget)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Reasoning Mode" tip="Enable reasoning-first model behavior for deep lanes.">
                  <SettingToggle checked={runtimeDraft.llmReasoningMode} onChange={(next) => updateDraft('llmReasoningMode', next)} disabled={!runtimeSettingsReady} />
                </SettingRow>
                <SettingRow label="LLM Reasoning Budget" tip="Global reasoning-token budget cap for reasoning lanes.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmReasoningBudget.min} max={RUNTIME_NUMBER_BOUNDS.llmReasoningBudget.max} step={1} value={runtimeDraft.llmReasoningBudget} onChange={(event) => onNumberChange('llmReasoningBudget', event.target.value, RUNTIME_NUMBER_BOUNDS.llmReasoningBudget)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Monthly Budget (USD)" tip="Soft monthly LLM spend guardrail in USD.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmMonthlyBudgetUsd.min} max={RUNTIME_NUMBER_BOUNDS.llmMonthlyBudgetUsd.max} step={0.01} value={runtimeDraft.llmMonthlyBudgetUsd} onChange={(event) => onNumberChange('llmMonthlyBudgetUsd', event.target.value, RUNTIME_NUMBER_BOUNDS.llmMonthlyBudgetUsd)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Per-Product Budget (USD)" tip="Per-product LLM spend limit in USD.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmPerProductBudgetUsd.min} max={RUNTIME_NUMBER_BOUNDS.llmPerProductBudgetUsd.max} step={0.01} value={runtimeDraft.llmPerProductBudgetUsd} onChange={(event) => onNumberChange('llmPerProductBudgetUsd', event.target.value, RUNTIME_NUMBER_BOUNDS.llmPerProductBudgetUsd)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Max Calls / Round" tip="Global call cap applied per round across LLM lanes.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerRound.min} max={RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerRound.max} step={1} value={runtimeDraft.llmMaxCallsPerRound} onChange={(event) => onNumberChange('llmMaxCallsPerRound', event.target.value, RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerRound)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Max Output Tokens" tip="Default output-token cap used when lane-specific caps do not override it.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmMaxOutputTokens.min} max={RUNTIME_NUMBER_BOUNDS.llmMaxOutputTokens.max} step={1} value={runtimeDraft.llmMaxOutputTokens} onChange={(event) => onNumberChange('llmMaxOutputTokens', event.target.value, RUNTIME_NUMBER_BOUNDS.llmMaxOutputTokens)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Verify Sample Rate" tip="Verification sampling interval; 1 verifies every product, higher values sample less frequently.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmVerifySampleRate.min} max={RUNTIME_NUMBER_BOUNDS.llmVerifySampleRate.max} step={1} value={runtimeDraft.llmVerifySampleRate} onChange={(event) => onNumberChange('llmVerifySampleRate', event.target.value, RUNTIME_NUMBER_BOUNDS.llmVerifySampleRate)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Disable LLM Budget Guards" tip="Bypass budget-stop checks (use only for debugging).">
                  <SettingToggle checked={runtimeDraft.llmDisableBudgetGuards} onChange={(next) => updateDraft('llmDisableBudgetGuards', next)} disabled={!runtimeSettingsReady} />
                </SettingRow>
                <SettingRow label="LLM Max Batches/Product" tip="Max extraction/validation LLM batches allowed per product.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmMaxBatchesPerProduct.min} max={RUNTIME_NUMBER_BOUNDS.llmMaxBatchesPerProduct.max} step={1} value={runtimeDraft.llmMaxBatchesPerProduct} onChange={(event) => onNumberChange('llmMaxBatchesPerProduct', event.target.value, RUNTIME_NUMBER_BOUNDS.llmMaxBatchesPerProduct)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Max Evidence Chars" tip="Max accumulated evidence chars sent into LLM lanes.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmMaxEvidenceChars.min} max={RUNTIME_NUMBER_BOUNDS.llmMaxEvidenceChars.max} step={100} value={runtimeDraft.llmMaxEvidenceChars} onChange={(event) => onNumberChange('llmMaxEvidenceChars', event.target.value, RUNTIME_NUMBER_BOUNDS.llmMaxEvidenceChars)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Max Tokens" tip="Global max-token ceiling for LLM calls.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmMaxTokens.min} max={RUNTIME_NUMBER_BOUNDS.llmMaxTokens.max} step={1} value={runtimeDraft.llmMaxTokens} onChange={(event) => onNumberChange('llmMaxTokens', event.target.value, RUNTIME_NUMBER_BOUNDS.llmMaxTokens)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Timeout (ms)" tip="Request timeout for LLM calls.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmTimeoutMs.min} max={RUNTIME_NUMBER_BOUNDS.llmTimeoutMs.max} step={1000} value={runtimeDraft.llmTimeoutMs} onChange={(event) => onNumberChange('llmTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.llmTimeoutMs)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Cost Input / 1M" tip="Input token cost estimate per 1M tokens.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmCostInputPer1M.min} max={RUNTIME_NUMBER_BOUNDS.llmCostInputPer1M.max} step={0.001} value={runtimeDraft.llmCostInputPer1M} onChange={(event) => onNumberChange('llmCostInputPer1M', event.target.value, RUNTIME_NUMBER_BOUNDS.llmCostInputPer1M)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Cost Output / 1M" tip="Output token cost estimate per 1M tokens.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmCostOutputPer1M.min} max={RUNTIME_NUMBER_BOUNDS.llmCostOutputPer1M.max} step={0.001} value={runtimeDraft.llmCostOutputPer1M} onChange={(event) => onNumberChange('llmCostOutputPer1M', event.target.value, RUNTIME_NUMBER_BOUNDS.llmCostOutputPer1M)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Cost Cached Input / 1M" tip="Cached-input token cost estimate per 1M tokens.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.llmCostCachedInputPer1M.min} max={RUNTIME_NUMBER_BOUNDS.llmCostCachedInputPer1M.max} step={0.001} value={runtimeDraft.llmCostCachedInputPer1M} onChange={(event) => onNumberChange('llmCostCachedInputPer1M', event.target.value, RUNTIME_NUMBER_BOUNDS.llmCostCachedInputPer1M)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="LLM Verify Mode" tip="Enable extra verification pass behavior for extracted values.">
                  <SettingToggle checked={runtimeDraft.llmVerifyMode} onChange={(next) => updateDraft('llmVerifyMode', next)} disabled={!runtimeSettingsReady} />
                </SettingRow>
              </SettingGroupBlock>
                </>
              ) : null}
              {activeStep === 'run-intelligence' ? (
                <>
              <div id={runtimeSubStepDomId('run-intelligence-consensus')} className="scroll-mt-24" />
              <SettingGroupBlock title="Consensus and Convergence">
                <SettingRow label="Convergence Identity Fail-Fast Rounds" tip="Rounds before identity-fail fast stop engages.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.convergenceIdentityFailFastRounds.min}
                    max={RUNTIME_NUMBER_BOUNDS.convergenceIdentityFailFastRounds.max}
                    step={1}
                    value={runtimeDraft.convergenceIdentityFailFastRounds}
                    onChange={(event) => onNumberChange('convergenceIdentityFailFastRounds', event.target.value, RUNTIME_NUMBER_BOUNDS.convergenceIdentityFailFastRounds)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Identity Gate Publish Threshold" tip="Minimum identity confidence required to publish extracted values.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.identityGatePublishThreshold.min}
                    max={RUNTIME_NUMBER_BOUNDS.identityGatePublishThreshold.max}
                    step={0.01}
                    value={runtimeDraft.identityGatePublishThreshold}
                    onChange={(event) => onNumberChange('identityGatePublishThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGatePublishThreshold)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Identity Gate Base Match Threshold" tip="Base similarity threshold used before ambiguity adjustments.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateBaseMatchThreshold.min} max={RUNTIME_NUMBER_BOUNDS.identityGateBaseMatchThreshold.max} step={0.01} value={runtimeDraft.identityGateBaseMatchThreshold} onChange={(event) => onNumberChange('identityGateBaseMatchThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateBaseMatchThreshold)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Easy Ambiguity Reduction" tip="Threshold delta for easy ambiguity families.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateEasyAmbiguityReduction.min} max={RUNTIME_NUMBER_BOUNDS.identityGateEasyAmbiguityReduction.max} step={0.01} value={runtimeDraft.identityGateEasyAmbiguityReduction} onChange={(event) => onNumberChange('identityGateEasyAmbiguityReduction', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateEasyAmbiguityReduction)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Medium Ambiguity Reduction" tip="Threshold delta for medium ambiguity families.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateMediumAmbiguityReduction.min} max={RUNTIME_NUMBER_BOUNDS.identityGateMediumAmbiguityReduction.max} step={0.01} value={runtimeDraft.identityGateMediumAmbiguityReduction} onChange={(event) => onNumberChange('identityGateMediumAmbiguityReduction', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateMediumAmbiguityReduction)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Hard Ambiguity Reduction" tip="Threshold delta for hard ambiguity families.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateHardAmbiguityReduction.min} max={RUNTIME_NUMBER_BOUNDS.identityGateHardAmbiguityReduction.max} step={0.01} value={runtimeDraft.identityGateHardAmbiguityReduction} onChange={(event) => onNumberChange('identityGateHardAmbiguityReduction', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateHardAmbiguityReduction)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Very Hard Ambiguity Increase" tip="Threshold delta for very hard ambiguity families.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateVeryHardAmbiguityIncrease.min} max={RUNTIME_NUMBER_BOUNDS.identityGateVeryHardAmbiguityIncrease.max} step={0.01} value={runtimeDraft.identityGateVeryHardAmbiguityIncrease} onChange={(event) => onNumberChange('identityGateVeryHardAmbiguityIncrease', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateVeryHardAmbiguityIncrease)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Extra Hard Ambiguity Increase" tip="Threshold delta for extra hard ambiguity families.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateExtraHardAmbiguityIncrease.min} max={RUNTIME_NUMBER_BOUNDS.identityGateExtraHardAmbiguityIncrease.max} step={0.01} value={runtimeDraft.identityGateExtraHardAmbiguityIncrease} onChange={(event) => onNumberChange('identityGateExtraHardAmbiguityIncrease', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateExtraHardAmbiguityIncrease)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Missing Strong ID Penalty" tip="Threshold delta when strong-ID evidence is missing.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateMissingStrongIdPenalty.min} max={RUNTIME_NUMBER_BOUNDS.identityGateMissingStrongIdPenalty.max} step={0.01} value={runtimeDraft.identityGateMissingStrongIdPenalty} onChange={(event) => onNumberChange('identityGateMissingStrongIdPenalty', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateMissingStrongIdPenalty)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Quality Gate Identity Threshold" tip="Minimum identity confidence required by the validation quality gate.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.qualityGateIdentityThreshold.min} max={RUNTIME_NUMBER_BOUNDS.qualityGateIdentityThreshold.max} step={0.01} value={runtimeDraft.qualityGateIdentityThreshold} onChange={(event) => onNumberChange('qualityGateIdentityThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.qualityGateIdentityThreshold)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Method Weight (Network JSON)" tip="Relative consensus weighting for network JSON evidence sources.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightNetworkJson.min} max={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightNetworkJson.max} step={0.01} value={runtimeDraft.consensusMethodWeightNetworkJson} onChange={(event) => onNumberChange('consensusMethodWeightNetworkJson', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusMethodWeightNetworkJson)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Method Weight (Adapter API)" tip="Relative consensus weighting for adapter API evidence sources.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightAdapterApi.min} max={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightAdapterApi.max} step={0.01} value={runtimeDraft.consensusMethodWeightAdapterApi} onChange={(event) => onNumberChange('consensusMethodWeightAdapterApi', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusMethodWeightAdapterApi)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Method Weight (Structured Metadata)" tip="Relative consensus weighting for structured metadata evidence sources.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightStructuredMeta.min} max={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightStructuredMeta.max} step={0.01} value={runtimeDraft.consensusMethodWeightStructuredMeta} onChange={(event) => onNumberChange('consensusMethodWeightStructuredMeta', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusMethodWeightStructuredMeta)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Method Weight (PDF)" tip="Relative consensus weighting for PDF evidence sources.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightPdf.min} max={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightPdf.max} step={0.01} value={runtimeDraft.consensusMethodWeightPdf} onChange={(event) => onNumberChange('consensusMethodWeightPdf', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusMethodWeightPdf)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Method Weight (Table/KV)" tip="Relative consensus weighting for table/KV evidence sources.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightTableKv.min} max={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightTableKv.max} step={0.01} value={runtimeDraft.consensusMethodWeightTableKv} onChange={(event) => onNumberChange('consensusMethodWeightTableKv', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusMethodWeightTableKv)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Method Weight (DOM)" tip="Relative consensus weighting for DOM evidence sources.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightDom.min} max={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightDom.max} step={0.01} value={runtimeDraft.consensusMethodWeightDom} onChange={(event) => onNumberChange('consensusMethodWeightDom', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusMethodWeightDom)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Method Weight (LLM Extract Base)" tip="Base consensus method weight used for llm_extract evidence fallback tiers.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightLlmExtractBase.min} max={RUNTIME_NUMBER_BOUNDS.consensusMethodWeightLlmExtractBase.max} step={0.01} value={runtimeDraft.consensusMethodWeightLlmExtractBase} onChange={(event) => onNumberChange('consensusMethodWeightLlmExtractBase', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusMethodWeightLlmExtractBase)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Policy Bonus" tip="Policy-aligned evidence bonus applied during consensus scoring.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusPolicyBonus.min} max={RUNTIME_NUMBER_BOUNDS.consensusPolicyBonus.max} step={0.01} value={runtimeDraft.consensusPolicyBonus} onChange={(event) => onNumberChange('consensusPolicyBonus', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusPolicyBonus)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Weighted Majority Threshold" tip="Threshold required for weighted-majority consensus acceptance.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusWeightedMajorityThreshold.min} max={RUNTIME_NUMBER_BOUNDS.consensusWeightedMajorityThreshold.max} step={0.01} value={runtimeDraft.consensusWeightedMajorityThreshold} onChange={(event) => onNumberChange('consensusWeightedMajorityThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusWeightedMajorityThreshold)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Strict Acceptance Domain Count" tip="Minimum agreeing domains required for strict consensus acceptance.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusStrictAcceptanceDomainCount.min} max={RUNTIME_NUMBER_BOUNDS.consensusStrictAcceptanceDomainCount.max} step={1} value={runtimeDraft.consensusStrictAcceptanceDomainCount} onChange={(event) => onNumberChange('consensusStrictAcceptanceDomainCount', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusStrictAcceptanceDomainCount)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Relaxed Acceptance Domain Count" tip="Minimum agreeing domains required for relaxed consensus acceptance.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusRelaxedAcceptanceDomainCount.min} max={RUNTIME_NUMBER_BOUNDS.consensusRelaxedAcceptanceDomainCount.max} step={1} value={runtimeDraft.consensusRelaxedAcceptanceDomainCount} onChange={(event) => onNumberChange('consensusRelaxedAcceptanceDomainCount', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusRelaxedAcceptanceDomainCount)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Instrumented Field Threshold" tip="Instrumentation threshold for consensus field acceptance telemetry.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusInstrumentedFieldThreshold.min} max={RUNTIME_NUMBER_BOUNDS.consensusInstrumentedFieldThreshold.max} step={1} value={runtimeDraft.consensusInstrumentedFieldThreshold} onChange={(event) => onNumberChange('consensusInstrumentedFieldThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusInstrumentedFieldThreshold)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Confidence Scoring Base" tip="Base multiplier used in consensus confidence scoring.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusConfidenceScoringBase.min} max={RUNTIME_NUMBER_BOUNDS.consensusConfidenceScoringBase.max} step={0.01} value={runtimeDraft.consensusConfidenceScoringBase} onChange={(event) => onNumberChange('consensusConfidenceScoringBase', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusConfidenceScoringBase)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Pass Target (Identity/Strong)" tip="Pass-target threshold used for strong identity fields.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusPassTargetIdentityStrong.min} max={RUNTIME_NUMBER_BOUNDS.consensusPassTargetIdentityStrong.max} step={1} value={runtimeDraft.consensusPassTargetIdentityStrong} onChange={(event) => onNumberChange('consensusPassTargetIdentityStrong', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusPassTargetIdentityStrong)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Consensus Pass Target (Normal)" tip="Pass-target threshold used for non-identity consensus fields.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.consensusPassTargetNormal.min} max={RUNTIME_NUMBER_BOUNDS.consensusPassTargetNormal.max} step={1} value={runtimeDraft.consensusPassTargetNormal} onChange={(event) => onNumberChange('consensusPassTargetNormal', event.target.value, RUNTIME_NUMBER_BOUNDS.consensusPassTargetNormal)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Tier Weight (Tier 1)" tip="Score multiplier for tier-1 sources in phase-07 retrieval ranking.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier1.min} max={RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier1.max} step={0.01} value={runtimeDraft.retrievalTierWeightTier1} onChange={(event) => onNumberChange('retrievalTierWeightTier1', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier1)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Tier Weight (Tier 2)" tip="Score multiplier for tier-2 sources in phase-07 retrieval ranking.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier2.min} max={RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier2.max} step={0.01} value={runtimeDraft.retrievalTierWeightTier2} onChange={(event) => onNumberChange('retrievalTierWeightTier2', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier2)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Tier Weight (Tier 3)" tip="Score multiplier for tier-3 sources in phase-07 retrieval ranking.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier3.min} max={RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier3.max} step={0.01} value={runtimeDraft.retrievalTierWeightTier3} onChange={(event) => onNumberChange('retrievalTierWeightTier3', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier3)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Tier Weight (Tier 4)" tip="Score multiplier for tier-4 sources in phase-07 retrieval ranking.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier4.min} max={RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier4.max} step={0.01} value={runtimeDraft.retrievalTierWeightTier4} onChange={(event) => onNumberChange('retrievalTierWeightTier4', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier4)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Tier Weight (Tier 5)" tip="Score multiplier for tier-5 sources in phase-07 retrieval ranking.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier5.min} max={RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier5.max} step={0.01} value={runtimeDraft.retrievalTierWeightTier5} onChange={(event) => onNumberChange('retrievalTierWeightTier5', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalTierWeightTier5)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Doc Weight (Manual PDF)" tip="Ranking multiplier for manual PDF evidence in retrieval scoring.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightManualPdf.min} max={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightManualPdf.max} step={0.01} value={runtimeDraft.retrievalDocKindWeightManualPdf} onChange={(event) => onNumberChange('retrievalDocKindWeightManualPdf', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightManualPdf)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Doc Weight (Spec PDF)" tip="Ranking multiplier for spec PDF evidence in retrieval scoring.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightSpecPdf.min} max={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightSpecPdf.max} step={0.01} value={runtimeDraft.retrievalDocKindWeightSpecPdf} onChange={(event) => onNumberChange('retrievalDocKindWeightSpecPdf', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightSpecPdf)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Doc Weight (Support)" tip="Ranking multiplier for support pages in retrieval scoring.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightSupport.min} max={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightSupport.max} step={0.01} value={runtimeDraft.retrievalDocKindWeightSupport} onChange={(event) => onNumberChange('retrievalDocKindWeightSupport', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightSupport)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Doc Weight (Lab Review)" tip="Ranking multiplier for lab-review evidence in retrieval scoring.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightLabReview.min} max={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightLabReview.max} step={0.01} value={runtimeDraft.retrievalDocKindWeightLabReview} onChange={(event) => onNumberChange('retrievalDocKindWeightLabReview', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightLabReview)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Doc Weight (Product Page)" tip="Ranking multiplier for product-page evidence in retrieval scoring.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightProductPage.min} max={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightProductPage.max} step={0.01} value={runtimeDraft.retrievalDocKindWeightProductPage} onChange={(event) => onNumberChange('retrievalDocKindWeightProductPage', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightProductPage)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Doc Weight (Other)" tip="Ranking multiplier for uncategorized evidence in retrieval scoring.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightOther.min} max={RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightOther.max} step={0.01} value={runtimeDraft.retrievalDocKindWeightOther} onChange={(event) => onNumberChange('retrievalDocKindWeightOther', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalDocKindWeightOther)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Method Weight (Table)" tip="Ranking multiplier for table extraction evidence.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightTable.min} max={RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightTable.max} step={0.01} value={runtimeDraft.retrievalMethodWeightTable} onChange={(event) => onNumberChange('retrievalMethodWeightTable', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightTable)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Method Weight (KV)" tip="Ranking multiplier for key-value extraction evidence.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightKv.min} max={RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightKv.max} step={0.01} value={runtimeDraft.retrievalMethodWeightKv} onChange={(event) => onNumberChange('retrievalMethodWeightKv', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightKv)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Method Weight (JSON-LD)" tip="Ranking multiplier for JSON-LD extraction evidence.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightJsonLd.min} max={RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightJsonLd.max} step={0.01} value={runtimeDraft.retrievalMethodWeightJsonLd} onChange={(event) => onNumberChange('retrievalMethodWeightJsonLd', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightJsonLd)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Method Weight (LLM Extract)" tip="Ranking multiplier for LLM extraction evidence.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightLlmExtract.min} max={RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightLlmExtract.max} step={0.01} value={runtimeDraft.retrievalMethodWeightLlmExtract} onChange={(event) => onNumberChange('retrievalMethodWeightLlmExtract', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightLlmExtract)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Method Weight (Helper Supportive)" tip="Ranking multiplier for helper-supportive evidence.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightHelperSupportive.min} max={RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightHelperSupportive.max} step={0.01} value={runtimeDraft.retrievalMethodWeightHelperSupportive} onChange={(event) => onNumberChange('retrievalMethodWeightHelperSupportive', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalMethodWeightHelperSupportive)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Anchor Score Per Match" tip="Incremental score added per anchor-term match.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalAnchorScorePerMatch.min} max={RUNTIME_NUMBER_BOUNDS.retrievalAnchorScorePerMatch.max} step={0.01} value={runtimeDraft.retrievalAnchorScorePerMatch} onChange={(event) => onNumberChange('retrievalAnchorScorePerMatch', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalAnchorScorePerMatch)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Identity Score Per Match" tip="Incremental score added per identity-token match.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalIdentityScorePerMatch.min} max={RUNTIME_NUMBER_BOUNDS.retrievalIdentityScorePerMatch.max} step={0.01} value={runtimeDraft.retrievalIdentityScorePerMatch} onChange={(event) => onNumberChange('retrievalIdentityScorePerMatch', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalIdentityScorePerMatch)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Unit Match Bonus" tip="Bonus score applied when a candidate includes unit match context.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalUnitMatchBonus.min} max={RUNTIME_NUMBER_BOUNDS.retrievalUnitMatchBonus.max} step={0.01} value={runtimeDraft.retrievalUnitMatchBonus} onChange={(event) => onNumberChange('retrievalUnitMatchBonus', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalUnitMatchBonus)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Direct Field Match Bonus" tip="Bonus score applied for direct field-key matches in evidence rows.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.retrievalDirectFieldMatchBonus.min} max={RUNTIME_NUMBER_BOUNDS.retrievalDirectFieldMatchBonus.max} step={0.01} value={runtimeDraft.retrievalDirectFieldMatchBonus} onChange={(event) => onNumberChange('retrievalDirectFieldMatchBonus', event.target.value, RUNTIME_NUMBER_BOUNDS.retrievalDirectFieldMatchBonus)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Retrieval Internals Map (JSON)" tip="Optional JSON map for retrieval internals (pool caps, anchor limits, and scoring multipliers).">
                  <textarea
                    value={runtimeDraft.retrievalInternalsMapJson}
                    onChange={(event) => updateDraft('retrievalInternalsMapJson', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
                    spellCheck={false}
                  />
                </SettingRow>
                <SettingRow label="Parsing Confidence Base Map (JSON)" tip="Optional JSON map overriding parsing confidence bases for network_json, embedded_state, json_ld, microdata, opengraph, and microformat_rdfa.">
                  <textarea
                    value={runtimeDraft.parsingConfidenceBaseMapJson}
                    onChange={(event) => updateDraft('parsingConfidenceBaseMapJson', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
                    spellCheck={false}
                  />
                </SettingRow>
                <SettingRow label="Identity Gate Hard + Missing ID Increase" tip="Additional threshold increase for hard ambiguity plus missing strong ID.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateHardMissingStrongIdIncrease.min} max={RUNTIME_NUMBER_BOUNDS.identityGateHardMissingStrongIdIncrease.max} step={0.01} value={runtimeDraft.identityGateHardMissingStrongIdIncrease} onChange={(event) => onNumberChange('identityGateHardMissingStrongIdIncrease', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateHardMissingStrongIdIncrease)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Very Hard + Missing ID Increase" tip="Additional threshold increase for very hard ambiguity plus missing strong ID.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateVeryHardMissingStrongIdIncrease.min} max={RUNTIME_NUMBER_BOUNDS.identityGateVeryHardMissingStrongIdIncrease.max} step={0.01} value={runtimeDraft.identityGateVeryHardMissingStrongIdIncrease} onChange={(event) => onNumberChange('identityGateVeryHardMissingStrongIdIncrease', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateVeryHardMissingStrongIdIncrease)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Extra Hard + Missing ID Increase" tip="Additional threshold increase for extra-hard ambiguity plus missing strong ID.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateExtraHardMissingStrongIdIncrease.min} max={RUNTIME_NUMBER_BOUNDS.identityGateExtraHardMissingStrongIdIncrease.max} step={0.01} value={runtimeDraft.identityGateExtraHardMissingStrongIdIncrease} onChange={(event) => onNumberChange('identityGateExtraHardMissingStrongIdIncrease', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateExtraHardMissingStrongIdIncrease)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Numeric Token Boost" tip="Token-overlap boost applied when numeric fragments align.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateNumericTokenBoost.min} max={RUNTIME_NUMBER_BOUNDS.identityGateNumericTokenBoost.max} step={0.01} value={runtimeDraft.identityGateNumericTokenBoost} onChange={(event) => onNumberChange('identityGateNumericTokenBoost', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateNumericTokenBoost)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Numeric Range Threshold" tip="Allowed numeric-delta threshold for identity model match validation.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.identityGateNumericRangeThreshold.min} max={RUNTIME_NUMBER_BOUNDS.identityGateNumericRangeThreshold.max} step={1} value={runtimeDraft.identityGateNumericRangeThreshold} onChange={(event) => onNumberChange('identityGateNumericRangeThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.identityGateNumericRangeThreshold)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Identity Gate Threshold Bounds Map (JSON)" tip="Optional JSON map for dynamic identity threshold floor/ceiling bounds.">
                  <textarea
                    value={runtimeDraft.identityGateThresholdBoundsMapJson}
                    onChange={(event) => updateDraft('identityGateThresholdBoundsMapJson', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
                    spellCheck={false}
                  />
                </SettingRow>
                <SettingRow label="Evidence Text Max Chars" tip="Maximum evidence text characters retained per normalized evidence row.">
                  <input type="number" min={RUNTIME_NUMBER_BOUNDS.evidenceTextMaxChars.min} max={RUNTIME_NUMBER_BOUNDS.evidenceTextMaxChars.max} step={100} value={runtimeDraft.evidenceTextMaxChars} onChange={(event) => onNumberChange('evidenceTextMaxChars', event.target.value, RUNTIME_NUMBER_BOUNDS.evidenceTextMaxChars)} disabled={!runtimeSettingsReady} className={inputCls} />
                </SettingRow>
                <SettingRow label="Evidence Pack Limits Map (JSON)" tip="Optional JSON map for evidence-pack extraction limits (headings/chunk/spec sections).">
                  <textarea
                    value={runtimeDraft.evidencePackLimitsMapJson}
                    onChange={(event) => updateDraft('evidencePackLimitsMapJson', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
                    spellCheck={false}
                  />
                </SettingRow>
                <SettingRow label="Allow Below Pass-Target Fill" tip="Allow low-confidence fill below pass-target threshold.">
                  <SettingToggle
                    checked={runtimeDraft.allowBelowPassTargetFill}
                    onChange={(next) => updateDraft('allowBelowPassTargetFill', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('run-intelligence-drift')} className="scroll-mt-24" />
              <SettingGroupBlock title="Drift Watcher">
                <SettingRow label="Drift Detection Enabled" tip="Enable drift scanner background pass.">
                  <SettingToggle
                    checked={runtimeDraft.driftDetectionEnabled}
                    onChange={(next) => updateDraft('driftDetectionEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Drift Poll Seconds" tip="Seconds between drift scan polling cycles.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.driftPollSeconds.min}
                    max={RUNTIME_NUMBER_BOUNDS.driftPollSeconds.max}
                    step={60}
                    value={runtimeDraft.driftPollSeconds}
                    onChange={(event) => onNumberChange('driftPollSeconds', event.target.value, RUNTIME_NUMBER_BOUNDS.driftPollSeconds)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Drift Scan Max Products" tip="Maximum products scanned per drift cycle.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.driftScanMaxProducts.min}
                    max={RUNTIME_NUMBER_BOUNDS.driftScanMaxProducts.max}
                    step={1}
                    value={runtimeDraft.driftScanMaxProducts}
                    onChange={(event) => onNumberChange('driftScanMaxProducts', event.target.value, RUNTIME_NUMBER_BOUNDS.driftScanMaxProducts)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Drift Auto Republish" tip="Automatically republish on drift detections.">
                  <SettingToggle
                    checked={runtimeDraft.driftAutoRepublish}
                    onChange={(next) => updateDraft('driftAutoRepublish', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('run-intelligence-aggressive')} className="scroll-mt-24" />
              <SettingGroupBlock title="Aggressive and Cortex">
                <SettingRow label="Aggressive Mode Enabled" tip="Enable higher-budget aggressive extraction profile.">
                  <SettingToggle
                    checked={runtimeDraft.aggressiveModeEnabled}
                    onChange={(next) => updateDraft('aggressiveModeEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Aggressive Confidence Threshold" tip="Confidence floor used for aggressive-mode acceptance.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveConfidenceThreshold.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveConfidenceThreshold.max}
                    step={0.01}
                    value={runtimeDraft.aggressiveConfidenceThreshold}
                    onChange={(event) => onNumberChange('aggressiveConfidenceThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveConfidenceThreshold)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive Max Search Queries" tip="Per-pass search query cap in aggressive mode.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveMaxSearchQueries.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveMaxSearchQueries.max}
                    step={1}
                    value={runtimeDraft.aggressiveMaxSearchQueries}
                    onChange={(event) => onNumberChange('aggressiveMaxSearchQueries', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveMaxSearchQueries)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive Evidence Audit Enabled" tip="Enable extra evidence cross-check pass in aggressive mode.">
                  <SettingToggle
                    checked={runtimeDraft.aggressiveEvidenceAuditEnabled}
                    onChange={(next) => updateDraft('aggressiveEvidenceAuditEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Aggressive Evidence Audit Batch Size" tip="Batch size for aggressive evidence audit pass.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveEvidenceAuditBatchSize.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveEvidenceAuditBatchSize.max}
                    step={1}
                    value={runtimeDraft.aggressiveEvidenceAuditBatchSize}
                    onChange={(event) => onNumberChange('aggressiveEvidenceAuditBatchSize', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveEvidenceAuditBatchSize)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive Max Time / Product (ms)" tip="Hard runtime ceiling per product in aggressive mode.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveMaxTimePerProductMs.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveMaxTimePerProductMs.max}
                    step={1000}
                    value={runtimeDraft.aggressiveMaxTimePerProductMs}
                    onChange={(event) => onNumberChange('aggressiveMaxTimePerProductMs', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveMaxTimePerProductMs)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive Thorough From Round" tip="Round index where aggressive mode switches to deeper behavior.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveThoroughFromRound.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveThoroughFromRound.max}
                    step={1}
                    value={runtimeDraft.aggressiveThoroughFromRound}
                    onChange={(event) => onNumberChange('aggressiveThoroughFromRound', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveThoroughFromRound)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive Round 1 Max URLs" tip="URL budget for round 1 in aggressive mode.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveRound1MaxUrls.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveRound1MaxUrls.max}
                    step={1}
                    value={runtimeDraft.aggressiveRound1MaxUrls}
                    onChange={(event) => onNumberChange('aggressiveRound1MaxUrls', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveRound1MaxUrls)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive Round 1 Max Candidate URLs" tip="Candidate URL budget for round 1 in aggressive mode.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveRound1MaxCandidateUrls.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveRound1MaxCandidateUrls.max}
                    step={1}
                    value={runtimeDraft.aggressiveRound1MaxCandidateUrls}
                    onChange={(event) => onNumberChange('aggressiveRound1MaxCandidateUrls', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveRound1MaxCandidateUrls)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive LLM Max Calls / Round" tip="Max LLM calls allowed in each aggressive round.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveLlmMaxCallsPerRound.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveLlmMaxCallsPerRound.max}
                    step={1}
                    value={runtimeDraft.aggressiveLlmMaxCallsPerRound}
                    onChange={(event) => onNumberChange('aggressiveLlmMaxCallsPerRound', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveLlmMaxCallsPerRound)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive LLM Max Calls / Product" tip="Total LLM-call budget per product in aggressive mode.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveLlmMaxCallsPerProductTotal.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveLlmMaxCallsPerProductTotal.max}
                    step={1}
                    value={runtimeDraft.aggressiveLlmMaxCallsPerProductTotal}
                    onChange={(event) => onNumberChange('aggressiveLlmMaxCallsPerProductTotal', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveLlmMaxCallsPerProductTotal)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive LLM Target Max Fields" tip="Maximum field targets evaluated by aggressive LLM flow.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveLlmTargetMaxFields.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveLlmTargetMaxFields.max}
                    step={1}
                    value={runtimeDraft.aggressiveLlmTargetMaxFields}
                    onChange={(event) => onNumberChange('aggressiveLlmTargetMaxFields', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveLlmTargetMaxFields)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive LLM Discovery Passes" tip="Number of iterative discovery passes in aggressive LLM mode.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveLlmDiscoveryPasses.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveLlmDiscoveryPasses.max}
                    step={1}
                    value={runtimeDraft.aggressiveLlmDiscoveryPasses}
                    onChange={(event) => onNumberChange('aggressiveLlmDiscoveryPasses', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveLlmDiscoveryPasses)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Aggressive LLM Discovery Query Cap" tip="Maximum LLM-generated discovery queries in aggressive mode.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.aggressiveLlmDiscoveryQueryCap.min}
                    max={RUNTIME_NUMBER_BOUNDS.aggressiveLlmDiscoveryQueryCap.max}
                    step={1}
                    value={runtimeDraft.aggressiveLlmDiscoveryQueryCap}
                    onChange={(event) => onNumberChange('aggressiveLlmDiscoveryQueryCap', event.target.value, RUNTIME_NUMBER_BOUNDS.aggressiveLlmDiscoveryQueryCap)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Uber Aggressive Enabled" tip="Enable uber-aggressive profile toggles in runtime.">
                  <SettingToggle
                    checked={runtimeDraft.uberAggressiveEnabled}
                    onChange={(next) => updateDraft('uberAggressiveEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Uber Max Rounds" tip="Maximum round count allowed when uber-aggressive mode is active.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.uberMaxRounds.min}
                    max={RUNTIME_NUMBER_BOUNDS.uberMaxRounds.max}
                    step={1}
                    value={runtimeDraft.uberMaxRounds}
                    onChange={(event) => onNumberChange('uberMaxRounds', event.target.value, RUNTIME_NUMBER_BOUNDS.uberMaxRounds)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <div className="border-t sf-border-default pt-3">
                  <h4 className="sf-text-label font-semibold uppercase tracking-[0.08em] sf-text-subtle">CORTEX Endpoints</h4>
                </div>
                <SettingRow label="CORTEX Base URL" tip="Primary CORTEX sync endpoint base URL.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexBaseUrl}
                    onChange={(event) => updateDraft('cortexBaseUrl', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX API Key" tip="API key for CORTEX service authentication.">
                  <input
                    type="password"
                    value={runtimeDraft.cortexApiKey}
                    onChange={(event) => updateDraft('cortexApiKey', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Async Base URL" tip="Base URL for CORTEX async job service.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexAsyncBaseUrl}
                    onChange={(event) => updateDraft('cortexAsyncBaseUrl', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Async Submit Path" tip="Relative path used to submit async CORTEX jobs.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexAsyncSubmitPath}
                    onChange={(event) => updateDraft('cortexAsyncSubmitPath', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Async Status Path" tip="Relative path template used to poll async jobs.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexAsyncStatusPath}
                    onChange={(event) => updateDraft('cortexAsyncStatusPath', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Enabled" tip="Enable CORTEX orchestration path.">
                  <SettingToggle
                    checked={runtimeDraft.cortexEnabled}
                    onChange={(next) => updateDraft('cortexEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Async Enabled" tip="Use async CORTEX execution and polling flow.">
                  <SettingToggle
                    checked={runtimeDraft.cortexAsyncEnabled}
                    onChange={(next) => updateDraft('cortexAsyncEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Sync Timeout (ms)" tip="Timeout for synchronous CORTEX requests.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.cortexSyncTimeoutMs.min}
                    max={RUNTIME_NUMBER_BOUNDS.cortexSyncTimeoutMs.max}
                    step={250}
                    value={runtimeDraft.cortexSyncTimeoutMs}
                    onChange={(event) => onNumberChange('cortexSyncTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.cortexSyncTimeoutMs)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Async Poll Interval (ms)" tip="Polling interval used while waiting for async CORTEX jobs.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.cortexAsyncPollIntervalMs.min}
                    max={RUNTIME_NUMBER_BOUNDS.cortexAsyncPollIntervalMs.max}
                    step={250}
                    value={runtimeDraft.cortexAsyncPollIntervalMs}
                    onChange={(event) => onNumberChange('cortexAsyncPollIntervalMs', event.target.value, RUNTIME_NUMBER_BOUNDS.cortexAsyncPollIntervalMs)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Async Max Wait (ms)" tip="Maximum async wait window for CORTEX jobs.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.cortexAsyncMaxWaitMs.min}
                    max={RUNTIME_NUMBER_BOUNDS.cortexAsyncMaxWaitMs.max}
                    step={1000}
                    value={runtimeDraft.cortexAsyncMaxWaitMs}
                    onChange={(event) => onNumberChange('cortexAsyncMaxWaitMs', event.target.value, RUNTIME_NUMBER_BOUNDS.cortexAsyncMaxWaitMs)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Ensure Ready Timeout (ms)" tip="Timeout budget for ready-check probe operations.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.cortexEnsureReadyTimeoutMs.min}
                    max={RUNTIME_NUMBER_BOUNDS.cortexEnsureReadyTimeoutMs.max}
                    step={250}
                    value={runtimeDraft.cortexEnsureReadyTimeoutMs}
                    onChange={(event) => onNumberChange('cortexEnsureReadyTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.cortexEnsureReadyTimeoutMs)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Start Ready Timeout (ms)" tip="Timeout budget for startup readiness wait loop.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.cortexStartReadyTimeoutMs.min}
                    max={RUNTIME_NUMBER_BOUNDS.cortexStartReadyTimeoutMs.max}
                    step={250}
                    value={runtimeDraft.cortexStartReadyTimeoutMs}
                    onChange={(event) => onNumberChange('cortexStartReadyTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.cortexStartReadyTimeoutMs)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Failure Threshold" tip="Failures before CORTEX circuit-breaker opens.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.cortexFailureThreshold.min}
                    max={RUNTIME_NUMBER_BOUNDS.cortexFailureThreshold.max}
                    step={1}
                    value={runtimeDraft.cortexFailureThreshold}
                    onChange={(event) => onNumberChange('cortexFailureThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.cortexFailureThreshold)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Circuit Open (ms)" tip="Duration CORTEX circuit remains open after threshold breach.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.cortexCircuitOpenMs.min}
                    max={RUNTIME_NUMBER_BOUNDS.cortexCircuitOpenMs.max}
                    step={1000}
                    value={runtimeDraft.cortexCircuitOpenMs}
                    onChange={(event) => onNumberChange('cortexCircuitOpenMs', event.target.value, RUNTIME_NUMBER_BOUNDS.cortexCircuitOpenMs)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <div className="border-t sf-border-default pt-3">
                  <h4 className="sf-text-label font-semibold uppercase tracking-[0.08em] sf-text-subtle">CORTEX Model Routing</h4>
                </div>
                <SettingRow label="CORTEX Model Fast" tip="Primary fast CORTEX model token.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexModelFast}
                    onChange={(event) => updateDraft('cortexModelFast', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Model Audit" tip="Model token used for CORTEX audit operations.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexModelAudit}
                    onChange={(event) => updateDraft('cortexModelAudit', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Model DOM" tip="Model token used for DOM-analysis CORTEX lane.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexModelDom}
                    onChange={(event) => updateDraft('cortexModelDom', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Model Reasoning Deep" tip="Model token used for deep-reasoning CORTEX lane.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexModelReasoningDeep}
                    onChange={(event) => updateDraft('cortexModelReasoningDeep', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Model Vision" tip="Model token used for vision-assisted CORTEX lane.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexModelVision}
                    onChange={(event) => updateDraft('cortexModelVision', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Model Search Fast" tip="Model token used for fast CORTEX search lane.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexModelSearchFast}
                    onChange={(event) => updateDraft('cortexModelSearchFast', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Model Rerank Fast" tip="Model token used for fast reranking in CORTEX.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexModelRerankFast}
                    onChange={(event) => updateDraft('cortexModelRerankFast', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Model Search Deep" tip="Model token used for deep CORTEX search lane.">
                  <input
                    type="text"
                    value={runtimeDraft.cortexModelSearchDeep}
                    onChange={(event) => updateDraft('cortexModelSearchDeep', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <div className="border-t sf-border-default pt-3">
                  <h4 className="sf-text-label font-semibold uppercase tracking-[0.08em] sf-text-subtle">CORTEX Lifecycle</h4>
                </div>
                <SettingRow label="CORTEX Auto Start" tip="Auto-start CORTEX service when runtime starts.">
                  <SettingToggle
                    checked={runtimeDraft.cortexAutoStart}
                    onChange={(next) => updateDraft('cortexAutoStart', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Auto Restart On Auth" tip="Auto-restart CORTEX service after auth failures.">
                  <SettingToggle
                    checked={runtimeDraft.cortexAutoRestartOnAuth}
                    onChange={(next) => updateDraft('cortexAutoRestartOnAuth', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Escalate Confidence <" tip="Escalate when confidence is below this threshold.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.cortexEscalateConfidenceLt.min}
                    max={RUNTIME_NUMBER_BOUNDS.cortexEscalateConfidenceLt.max}
                    step={0.01}
                    value={runtimeDraft.cortexEscalateConfidenceLt}
                    onChange={(event) => onNumberChange('cortexEscalateConfidenceLt', event.target.value, RUNTIME_NUMBER_BOUNDS.cortexEscalateConfidenceLt)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Escalate If Conflict" tip="Escalate when extracted field evidence conflicts.">
                  <SettingToggle
                    checked={runtimeDraft.cortexEscalateIfConflict}
                    onChange={(next) => updateDraft('cortexEscalateIfConflict', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Escalate Critical Only" tip="Limit CORTEX escalation to critical/identity fields only.">
                  <SettingToggle
                    checked={runtimeDraft.cortexEscalateCriticalOnly}
                    onChange={(next) => updateDraft('cortexEscalateCriticalOnly', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="CORTEX Max Deep Fields / Product" tip="Maximum deep-escalated fields per product.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.cortexMaxDeepFieldsPerProduct.min}
                    max={RUNTIME_NUMBER_BOUNDS.cortexMaxDeepFieldsPerProduct.max}
                    step={1}
                    value={runtimeDraft.cortexMaxDeepFieldsPerProduct}
                    onChange={(event) => onNumberChange('cortexMaxDeepFieldsPerProduct', event.target.value, RUNTIME_NUMBER_BOUNDS.cortexMaxDeepFieldsPerProduct)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('run-intelligence-helper')} className="scroll-mt-24" />
              <SettingGroupBlock title="Helper Runtime">
                <SettingRow label="Helper Files Enabled" tip="Enable helper-files runtime substrate.">
                  <SettingToggle
                    checked={runtimeDraft.helperFilesEnabled}
                    onChange={(next) => updateDraft('helperFilesEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Helper Files Root" tip="Root directory for helper files.">
                  <input
                    type="text"
                    value={runtimeDraft.helperFilesRoot}
                    onChange={(event) => updateDraft('helperFilesRoot', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                    placeholder="helper_files"
                  />
                </SettingRow>
                <SettingRow label="Indexing Helper Files Enabled" tip="Enable indexing helper-file assist path.">
                  <SettingToggle
                    checked={runtimeDraft.indexingHelperFilesEnabled}
                    onChange={(next) => updateDraft('indexingHelperFilesEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Helper Supportive Enabled" tip="Enable supportive helper evidence mode.">
                  <SettingToggle
                    checked={runtimeDraft.helperSupportiveEnabled}
                    onChange={(next) => updateDraft('helperSupportiveEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Helper Supportive Fill Missing" tip="Allow helper supportive mode to fill missing values.">
                  <SettingToggle
                    checked={runtimeDraft.helperSupportiveFillMissing}
                    onChange={(next) => updateDraft('helperSupportiveFillMissing', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Helper Supportive Max Sources" tip="Maximum supportive helper sources admitted per field.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.helperSupportiveMaxSources.min}
                    max={RUNTIME_NUMBER_BOUNDS.helperSupportiveMaxSources.max}
                    step={1}
                    value={runtimeDraft.helperSupportiveMaxSources}
                    onChange={(event) => onNumberChange('helperSupportiveMaxSources', event.target.value, RUNTIME_NUMBER_BOUNDS.helperSupportiveMaxSources)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Helper Auto Seed Targets" tip="Auto-seed helper targets into runtime queue.">
                  <SettingToggle
                    checked={runtimeDraft.helperAutoSeedTargets}
                    onChange={(next) => updateDraft('helperAutoSeedTargets', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Helper Active Sync Limit" tip="Active helper synchronization cap per cycle.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.helperActiveSyncLimit.min}
                    max={RUNTIME_NUMBER_BOUNDS.helperActiveSyncLimit.max}
                    step={1}
                    value={runtimeDraft.helperActiveSyncLimit}
                    onChange={(event) => onNumberChange('helperActiveSyncLimit', event.target.value, RUNTIME_NUMBER_BOUNDS.helperActiveSyncLimit)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Batch Strategy" tip="Field-batching strategy token used by advanced runtime logic.">
                  <input
                    type="text"
                    value={runtimeDraft.batchStrategy}
                    onChange={(event) => updateDraft('batchStrategy', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Field Reward Half-Life (days)" tip="Reward-decay half-life for field selection strategy.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.fieldRewardHalfLifeDays.min}
                    max={RUNTIME_NUMBER_BOUNDS.fieldRewardHalfLifeDays.max}
                    step={1}
                    value={runtimeDraft.fieldRewardHalfLifeDays}
                    onChange={(event) => onNumberChange('fieldRewardHalfLifeDays', event.target.value, RUNTIME_NUMBER_BOUNDS.fieldRewardHalfLifeDays)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
              </SettingGroupBlock>
                </>
              ) : null}
              </FlowOptionPanel>
            </div>
          ) : null}

          {activeStep === 'observability-trace' ? (
            <div className="space-y-3">
              <FlowOptionPanel
                title="Observability and Trace"
                subtitle="Runtime trace and audit-stream controls for event visibility."
              >
                <div id={runtimeSubStepDomId('observability-trace-core')} className="scroll-mt-24" />
                <SettingRow label="Runtime Trace Enabled" tip="Master toggle for runtime trace capture and trace stream emission.">
                  <SettingToggle
                    checked={runtimeDraft.runtimeTraceEnabled}
                    onChange={(next) => updateDraft('runtimeTraceEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow
                  label="Fetch Trace Ring Size"
                  tip="In-memory ring size for fetch events."
                  disabled={traceControlsLocked}
                >
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.runtimeTraceFetchRing.min}
                    max={RUNTIME_NUMBER_BOUNDS.runtimeTraceFetchRing.max}
                    step={1}
                    value={runtimeDraft.runtimeTraceFetchRing}
                    onChange={(event) => onNumberChange('runtimeTraceFetchRing', event.target.value, RUNTIME_NUMBER_BOUNDS.runtimeTraceFetchRing)}
                    disabled={!runtimeSettingsReady || traceControlsLocked}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow
                  label="LLM Trace Ring Size"
                  tip="In-memory ring size for LLM trace events."
                  disabled={traceControlsLocked}
                >
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.runtimeTraceLlmRing.min}
                    max={RUNTIME_NUMBER_BOUNDS.runtimeTraceLlmRing.max}
                    step={1}
                    value={runtimeDraft.runtimeTraceLlmRing}
                    onChange={(event) => onNumberChange('runtimeTraceLlmRing', event.target.value, RUNTIME_NUMBER_BOUNDS.runtimeTraceLlmRing)}
                    disabled={!runtimeSettingsReady || traceControlsLocked}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow
                  label="Trace LLM Payloads"
                  tip="Capture LLM prompt/response payload previews in runtime trace events."
                  disabled={traceControlsLocked}
                >
                  <SettingToggle
                    checked={runtimeDraft.runtimeTraceLlmPayloads}
                    onChange={(next) => updateDraft('runtimeTraceLlmPayloads', next)}
                    disabled={!runtimeSettingsReady || traceControlsLocked}
                  />
                </SettingRow>
                <SettingRow label="Events NDJSON Write" tip="Write runtime events to NDJSON stream output.">
                  <SettingToggle
                    checked={runtimeDraft.eventsJsonWrite}
                    onChange={(next) => updateDraft('eventsJsonWrite', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <div id={runtimeSubStepDomId('observability-trace-daemon')} className="scroll-mt-24" />
                <SettingRow label="Indexing Resume Seed Limit" tip="Maximum seed URLs loaded during resume.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.indexingResumeSeedLimit.min}
                    max={RUNTIME_NUMBER_BOUNDS.indexingResumeSeedLimit.max}
                    step={1}
                    value={runtimeDraft.indexingResumeSeedLimit}
                    onChange={(event) => onNumberChange('indexingResumeSeedLimit', event.target.value, RUNTIME_NUMBER_BOUNDS.indexingResumeSeedLimit)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Indexing Resume Persist Limit" tip="Maximum persisted items loaded during resume.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.indexingResumePersistLimit.min}
                    max={RUNTIME_NUMBER_BOUNDS.indexingResumePersistLimit.max}
                    step={1}
                    value={runtimeDraft.indexingResumePersistLimit}
                    onChange={(event) => onNumberChange('indexingResumePersistLimit', event.target.value, RUNTIME_NUMBER_BOUNDS.indexingResumePersistLimit)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Indexing Schema Validation Enabled" tip="Enable schema packet validation for indexing payloads.">
                  <SettingToggle
                    checked={runtimeDraft.indexingSchemaPacketsValidationEnabled}
                    onChange={(next) => updateDraft('indexingSchemaPacketsValidationEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Indexing Schema Validation Strict" tip="Fail hard on schema validation errors when enabled.">
                  <SettingToggle
                    checked={runtimeDraft.indexingSchemaPacketsValidationStrict}
                    onChange={(next) => updateDraft('indexingSchemaPacketsValidationStrict', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Re-Crawl Stale After (days)" tip="Re-crawl source URLs after this staleness window.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.reCrawlStaleAfterDays.min}
                    max={RUNTIME_NUMBER_BOUNDS.reCrawlStaleAfterDays.max}
                    step={1}
                    value={runtimeDraft.reCrawlStaleAfterDays}
                    onChange={(event) => onNumberChange('reCrawlStaleAfterDays', event.target.value, RUNTIME_NUMBER_BOUNDS.reCrawlStaleAfterDays)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Daemon Concurrency" tip="Concurrent product runs for daemon mode.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.daemonConcurrency.min}
                    max={RUNTIME_NUMBER_BOUNDS.daemonConcurrency.max}
                    step={1}
                    value={runtimeDraft.daemonConcurrency}
                    onChange={(event) => onNumberChange('daemonConcurrency', event.target.value, RUNTIME_NUMBER_BOUNDS.daemonConcurrency)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Daemon Graceful Shutdown Timeout (ms)" tip="Grace period before daemon force-stop.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.daemonGracefulShutdownTimeoutMs.min}
                    max={RUNTIME_NUMBER_BOUNDS.daemonGracefulShutdownTimeoutMs.max}
                    step={1000}
                    value={runtimeDraft.daemonGracefulShutdownTimeoutMs}
                    onChange={(event) => onNumberChange('daemonGracefulShutdownTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.daemonGracefulShutdownTimeoutMs)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Imports Root" tip="Root directory monitored by daemon import watcher.">
                  <input
                    type="text"
                    value={runtimeDraft.importsRoot}
                    onChange={(event) => updateDraft('importsRoot', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Imports Poll Seconds" tip="Polling interval for daemon import watcher.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.importsPollSeconds.min}
                    max={RUNTIME_NUMBER_BOUNDS.importsPollSeconds.max}
                    step={1}
                    value={runtimeDraft.importsPollSeconds}
                    onChange={(event) => onNumberChange('importsPollSeconds', event.target.value, RUNTIME_NUMBER_BOUNDS.importsPollSeconds)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <div id={runtimeSubStepDomId('observability-trace-outputs')} className="scroll-mt-24" />
                <SettingRow label="Queue JSON Write" tip="Dual-write queue data to JSON for migration safety.">
                  <SettingToggle
                    checked={runtimeDraft.queueJsonWrite}
                    onChange={(next) => updateDraft('queueJsonWrite', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Billing JSON Write" tip="Dual-write billing data to JSON for migration safety.">
                  <SettingToggle
                    checked={runtimeDraft.billingJsonWrite}
                    onChange={(next) => updateDraft('billingJsonWrite', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Brain JSON Write" tip="Dual-write knowledge store data to JSON for migration safety.">
                  <SettingToggle
                    checked={runtimeDraft.brainJsonWrite}
                    onChange={(next) => updateDraft('brainJsonWrite', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Intel JSON Write" tip="Dual-write discovery intel data to JSON for migration safety.">
                  <SettingToggle
                    checked={runtimeDraft.intelJsonWrite}
                    onChange={(next) => updateDraft('intelJsonWrite', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Corpus JSON Write" tip="Dual-write corpus/evidence data to JSON for migration safety.">
                  <SettingToggle
                    checked={runtimeDraft.corpusJsonWrite}
                    onChange={(next) => updateDraft('corpusJsonWrite', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Learning JSON Write" tip="Dual-write learning store data to JSON for migration safety.">
                  <SettingToggle
                    checked={runtimeDraft.learningJsonWrite}
                    onChange={(next) => updateDraft('learningJsonWrite', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Cache JSON Write" tip="Dual-write cache data to JSON for migration safety.">
                  <SettingToggle
                    checked={runtimeDraft.cacheJsonWrite}
                    onChange={(next) => updateDraft('cacheJsonWrite', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Authority Snapshot Enabled" tip="Emit authority snapshot payloads for cross-surface settings propagation diagnostics.">
                  <SettingToggle
                    checked={runtimeDraft.authoritySnapshotEnabled}
                    onChange={(next) => updateDraft('authoritySnapshotEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Runtime Screencast Enabled" tip="Enable live browser screencast frame streaming for Runtime Ops.">
                  <SettingToggle
                    checked={runtimeDraft.runtimeScreencastEnabled}
                    onChange={(next) => updateDraft('runtimeScreencastEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Runtime Screencast FPS" tip="Target screencast frame rate (frames per second)." disabled={!runtimeDraft.runtimeScreencastEnabled}>
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.runtimeScreencastFps.min}
                    max={RUNTIME_NUMBER_BOUNDS.runtimeScreencastFps.max}
                    step={1}
                    value={runtimeDraft.runtimeScreencastFps}
                    onChange={(event) => onNumberChange('runtimeScreencastFps', event.target.value, RUNTIME_NUMBER_BOUNDS.runtimeScreencastFps)}
                    disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Runtime Screencast Quality" tip="JPEG quality for screencast frames." disabled={!runtimeDraft.runtimeScreencastEnabled}>
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.runtimeScreencastQuality.min}
                    max={RUNTIME_NUMBER_BOUNDS.runtimeScreencastQuality.max}
                    step={1}
                    value={runtimeDraft.runtimeScreencastQuality}
                    onChange={(event) => onNumberChange('runtimeScreencastQuality', event.target.value, RUNTIME_NUMBER_BOUNDS.runtimeScreencastQuality)}
                    disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Runtime Screencast Max Width" tip="Maximum screencast frame width in pixels." disabled={!runtimeDraft.runtimeScreencastEnabled}>
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxWidth.min}
                    max={RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxWidth.max}
                    step={10}
                    value={runtimeDraft.runtimeScreencastMaxWidth}
                    onChange={(event) => onNumberChange('runtimeScreencastMaxWidth', event.target.value, RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxWidth)}
                    disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Runtime Screencast Max Height" tip="Maximum screencast frame height in pixels." disabled={!runtimeDraft.runtimeScreencastEnabled}>
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxHeight.min}
                    max={RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxHeight.max}
                    step={10}
                    value={runtimeDraft.runtimeScreencastMaxHeight}
                    onChange={(event) => onNumberChange('runtimeScreencastMaxHeight', event.target.value, RUNTIME_NUMBER_BOUNDS.runtimeScreencastMaxHeight)}
                    disabled={!runtimeSettingsReady || !runtimeDraft.runtimeScreencastEnabled}
                    className={inputCls}
                  />
                </SettingRow>
              </FlowOptionPanel>
              {traceControlsLocked ? renderDisabledHint('Trace ring and payload controls are disabled because Runtime Trace is OFF.') : null}
            </div>
          ) : null}

          {activeStep === 'fetch-render' ? (
            <div className="space-y-3">
              <FlowOptionPanel
                title="Fetch and Render"
                subtitle="Fetch throughput and dynamic-render fallback policy."
              >
              <div id={runtimeSubStepDomId('fetch-render-core')} className="scroll-mt-24" />
              <SettingGroupBlock title="Core Throughput">
              <SettingRow label="Fetch Concurrency" tip="Maximum number of in-flight fetches.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.fetchConcurrency.min}
                  max={RUNTIME_NUMBER_BOUNDS.fetchConcurrency.max}
                  step={1}
                  value={runtimeDraft.fetchConcurrency}
                  onChange={(event) => onNumberChange('fetchConcurrency', event.target.value, RUNTIME_NUMBER_BOUNDS.fetchConcurrency)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Per Host Min Delay (ms)" tip="Minimum delay inserted between requests to the same host.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs.max}
                  step={100}
                  value={runtimeDraft.perHostMinDelayMs}
                  onChange={(event) => onNumberChange('perHostMinDelayMs', event.target.value, RUNTIME_NUMBER_BOUNDS.perHostMinDelayMs)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Fetch Scheduler Enabled" tip="Enable scheduler-based fetch orchestration before fallback fetch paths.">
                <SettingToggle
                  checked={runtimeDraft.fetchSchedulerEnabled}
                  onChange={(next) => updateDraft('fetchSchedulerEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Fetch Scheduler Max Retries" tip="Maximum scheduler retries before waiting for fallback.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.fetchSchedulerMaxRetries.min}
                  max={RUNTIME_NUMBER_BOUNDS.fetchSchedulerMaxRetries.max}
                  step={1}
                  value={runtimeDraft.fetchSchedulerMaxRetries}
                  onChange={(event) => onNumberChange('fetchSchedulerMaxRetries', event.target.value, RUNTIME_NUMBER_BOUNDS.fetchSchedulerMaxRetries)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Fetch Scheduler Fallback Wait (ms)" tip="Wait duration before retrying scheduler fallback queues.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.fetchSchedulerFallbackWaitMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.fetchSchedulerFallbackWaitMs.max}
                  step={100}
                  value={runtimeDraft.fetchSchedulerFallbackWaitMs}
                  onChange={(event) => onNumberChange('fetchSchedulerFallbackWaitMs', event.target.value, RUNTIME_NUMBER_BOUNDS.fetchSchedulerFallbackWaitMs)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow
                label="Fetch Scheduler Internals Map (JSON)"
                tip="Optional JSON map for fetch-scheduler internals defaults (delay/concurrency/retries/wait)."
              >
                <textarea
                  value={runtimeDraft.fetchSchedulerInternalsMapJson}
                  onChange={(event) => updateDraft('fetchSchedulerInternalsMapJson', event.target.value)}
                  disabled={!runtimeSettingsReady}
                  className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
                  spellCheck={false}
                />
              </SettingRow>
              <SettingRow label="Prefer HTTP Fetcher" tip="Prefer lightweight HTTP fetcher over browser rendering when possible.">
                <SettingToggle
                  checked={runtimeDraft.preferHttpFetcher}
                  onChange={(next) => updateDraft('preferHttpFetcher', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Page Goto Timeout (ms)" tip="Page navigation timeout used by browser fetch lanes.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.pageGotoTimeoutMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.pageGotoTimeoutMs.max}
                  step={100}
                  value={runtimeDraft.pageGotoTimeoutMs}
                  onChange={(event) => onNumberChange('pageGotoTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.pageGotoTimeoutMs)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Page Network Idle Timeout (ms)" tip="Maximum wait for network idle before extraction begins.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.pageNetworkIdleTimeoutMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.pageNetworkIdleTimeoutMs.max}
                  step={100}
                  value={runtimeDraft.pageNetworkIdleTimeoutMs}
                  onChange={(event) => onNumberChange('pageNetworkIdleTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.pageNetworkIdleTimeoutMs)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Post Load Wait (ms)" tip="Extra delay after load completion before parsing content.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.postLoadWaitMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.postLoadWaitMs.max}
                  step={100}
                  value={runtimeDraft.postLoadWaitMs}
                  onChange={(event) => onNumberChange('postLoadWaitMs', event.target.value, RUNTIME_NUMBER_BOUNDS.postLoadWaitMs)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('fetch-render-frontier')} className="scroll-mt-24" />
              <SettingGroupBlock title="Frontier and Repair">
              <SettingRow label="Frontier DB Path" tip="Path to the frontier persistence file or sqlite location hint.">
                <input
                  type="text"
                  value={runtimeDraft.frontierDbPath}
                  onChange={(event) => updateDraft('frontierDbPath', event.target.value)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                  placeholder="_intel/frontier/frontier.json"
                />
              </SettingRow>
              <SettingRow label="Frontier SQLite Enabled" tip="Use SQLite-backed frontier tracking store.">
                <SettingToggle
                  checked={runtimeDraft.frontierEnableSqlite}
                  onChange={(next) => updateDraft('frontierEnableSqlite', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Frontier Strip Tracking Params" tip="Strip URL tracking params before frontier persistence.">
                <SettingToggle
                  checked={runtimeDraft.frontierStripTrackingParams}
                  onChange={(next) => updateDraft('frontierStripTrackingParams', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Frontier Query Cooldown (sec)" tip="Cooldown applied between repeated domain query emissions.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.frontierQueryCooldownSeconds.min}
                  max={RUNTIME_NUMBER_BOUNDS.frontierQueryCooldownSeconds.max}
                  step={60}
                  value={runtimeDraft.frontierQueryCooldownSeconds}
                  onChange={(event) => onNumberChange('frontierQueryCooldownSeconds', event.target.value, RUNTIME_NUMBER_BOUNDS.frontierQueryCooldownSeconds)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Frontier Cooldown 404 (sec)" tip="Cooldown after first 404 outcome.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.frontierCooldown404Seconds.min}
                  max={RUNTIME_NUMBER_BOUNDS.frontierCooldown404Seconds.max}
                  step={60}
                  value={runtimeDraft.frontierCooldown404Seconds}
                  onChange={(event) => onNumberChange('frontierCooldown404Seconds', event.target.value, RUNTIME_NUMBER_BOUNDS.frontierCooldown404Seconds)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Frontier Cooldown 404 Repeat (sec)" tip="Cooldown after repeated 404 outcomes.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.frontierCooldown404RepeatSeconds.min}
                  max={RUNTIME_NUMBER_BOUNDS.frontierCooldown404RepeatSeconds.max}
                  step={60}
                  value={runtimeDraft.frontierCooldown404RepeatSeconds}
                  onChange={(event) => onNumberChange('frontierCooldown404RepeatSeconds', event.target.value, RUNTIME_NUMBER_BOUNDS.frontierCooldown404RepeatSeconds)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Frontier Cooldown 410 (sec)" tip="Cooldown after 410 gone responses.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.frontierCooldown410Seconds.min}
                  max={RUNTIME_NUMBER_BOUNDS.frontierCooldown410Seconds.max}
                  step={60}
                  value={runtimeDraft.frontierCooldown410Seconds}
                  onChange={(event) => onNumberChange('frontierCooldown410Seconds', event.target.value, RUNTIME_NUMBER_BOUNDS.frontierCooldown410Seconds)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Frontier Cooldown Timeout (sec)" tip="Cooldown after request timeout failures.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.frontierCooldownTimeoutSeconds.min}
                  max={RUNTIME_NUMBER_BOUNDS.frontierCooldownTimeoutSeconds.max}
                  step={60}
                  value={runtimeDraft.frontierCooldownTimeoutSeconds}
                  onChange={(event) => onNumberChange('frontierCooldownTimeoutSeconds', event.target.value, RUNTIME_NUMBER_BOUNDS.frontierCooldownTimeoutSeconds)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Frontier Cooldown 403 Base (sec)" tip="Base cooldown for 403 responses before exponential scaling.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.frontierCooldown403BaseSeconds.min}
                  max={RUNTIME_NUMBER_BOUNDS.frontierCooldown403BaseSeconds.max}
                  step={10}
                  value={runtimeDraft.frontierCooldown403BaseSeconds}
                  onChange={(event) => onNumberChange('frontierCooldown403BaseSeconds', event.target.value, RUNTIME_NUMBER_BOUNDS.frontierCooldown403BaseSeconds)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Frontier Cooldown 429 Base (sec)" tip="Base cooldown for 429 responses before exponential scaling.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.frontierCooldown429BaseSeconds.min}
                  max={RUNTIME_NUMBER_BOUNDS.frontierCooldown429BaseSeconds.max}
                  step={10}
                  value={runtimeDraft.frontierCooldown429BaseSeconds}
                  onChange={(event) => onNumberChange('frontierCooldown429BaseSeconds', event.target.value, RUNTIME_NUMBER_BOUNDS.frontierCooldown429BaseSeconds)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Frontier Backoff Max Exponent" tip="Maximum exponent used when scaling 403/429 frontier cooldown backoff.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.frontierBackoffMaxExponent.min}
                  max={RUNTIME_NUMBER_BOUNDS.frontierBackoffMaxExponent.max}
                  step={1}
                  value={runtimeDraft.frontierBackoffMaxExponent}
                  onChange={(event) => onNumberChange('frontierBackoffMaxExponent', event.target.value, RUNTIME_NUMBER_BOUNDS.frontierBackoffMaxExponent)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Frontier Path Penalty Not-Found Threshold" tip="Not-found streak threshold before path-level frontier penalties apply.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.frontierPathPenaltyNotfoundThreshold.min}
                  max={RUNTIME_NUMBER_BOUNDS.frontierPathPenaltyNotfoundThreshold.max}
                  step={1}
                  value={runtimeDraft.frontierPathPenaltyNotfoundThreshold}
                  onChange={(event) => onNumberChange('frontierPathPenaltyNotfoundThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.frontierPathPenaltyNotfoundThreshold)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Frontier Blocked Domain Threshold" tip="Consecutive blocked outcomes before a domain enters blocked state.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.frontierBlockedDomainThreshold.min}
                  max={RUNTIME_NUMBER_BOUNDS.frontierBlockedDomainThreshold.max}
                  step={1}
                  value={runtimeDraft.frontierBlockedDomainThreshold}
                  onChange={(event) => onNumberChange('frontierBlockedDomainThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.frontierBlockedDomainThreshold)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Frontier Repair Search Enabled" tip="Generate repair search passes after hard URL failures.">
                <SettingToggle
                  checked={runtimeDraft.frontierRepairSearchEnabled}
                  onChange={(next) => updateDraft('frontierRepairSearchEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Repair Dedupe Rule" tip="Domain-level dedupe policy for repair-query enqueue behavior.">
                <select
                  value={runtimeDraft.repairDedupeRule}
                  onChange={(event) => updateDraft('repairDedupeRule', event.target.value as RuntimeRepairDedupeRule)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {REPAIR_DEDUPE_RULE_OPTIONS.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow label="Automation Queue Storage Engine" tip="Storage engine selector for automation queue persistence.">
                <select
                  value={runtimeDraft.automationQueueStorageEngine}
                  onChange={(event) => updateDraft('automationQueueStorageEngine', event.target.value as RuntimeAutomationQueueStorageEngine)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                >
                  {AUTOMATION_QUEUE_STORAGE_ENGINE_OPTIONS.map((value) => (
                    <option key={value} value={value}>{value}</option>
                  ))}
                </select>
              </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('fetch-render-replay')} className="scroll-mt-24" />
              <SettingGroupBlock title="Render and Replay">
              <SettingRow label="Auto Scroll Enabled" tip="Enable browser auto-scroll before extraction on dynamic pages.">
                <SettingToggle
                  checked={runtimeDraft.autoScrollEnabled}
                  onChange={(next) => updateDraft('autoScrollEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Auto Scroll Passes" tip="Number of auto-scroll passes when auto-scroll is enabled." disabled={!runtimeDraft.autoScrollEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.autoScrollPasses.min}
                  max={RUNTIME_NUMBER_BOUNDS.autoScrollPasses.max}
                  step={1}
                  value={runtimeDraft.autoScrollPasses}
                  onChange={(event) => onNumberChange('autoScrollPasses', event.target.value, RUNTIME_NUMBER_BOUNDS.autoScrollPasses)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.autoScrollEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Auto Scroll Delay (ms)" tip="Delay between auto-scroll passes." disabled={!runtimeDraft.autoScrollEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.autoScrollDelayMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.autoScrollDelayMs.max}
                  step={50}
                  value={runtimeDraft.autoScrollDelayMs}
                  onChange={(event) => onNumberChange('autoScrollDelayMs', event.target.value, RUNTIME_NUMBER_BOUNDS.autoScrollDelayMs)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.autoScrollEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="GraphQL Replay Enabled" tip="Allow GraphQL response replay capture during fetch/render.">
                <SettingToggle
                  checked={runtimeDraft.graphqlReplayEnabled}
                  onChange={(next) => updateDraft('graphqlReplayEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Max GraphQL Replays" tip="Maximum GraphQL replay attempts per page when replay is enabled." disabled={!runtimeDraft.graphqlReplayEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxGraphqlReplays.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxGraphqlReplays.max}
                  step={1}
                  value={runtimeDraft.maxGraphqlReplays}
                  onChange={(event) => onNumberChange('maxGraphqlReplays', event.target.value, RUNTIME_NUMBER_BOUNDS.maxGraphqlReplays)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.graphqlReplayEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Max Network Responses / Page" tip="Hard cap for captured network responses per page.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxNetworkResponsesPerPage.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxNetworkResponsesPerPage.max}
                  step={10}
                  value={runtimeDraft.maxNetworkResponsesPerPage}
                  onChange={(event) => onNumberChange('maxNetworkResponsesPerPage', event.target.value, RUNTIME_NUMBER_BOUNDS.maxNetworkResponsesPerPage)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Robots.txt Compliant" tip="Respect robots.txt allow/deny rules during fetch scheduling.">
                <SettingToggle
                  checked={runtimeDraft.robotsTxtCompliant}
                  onChange={(next) => updateDraft('robotsTxtCompliant', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Robots.txt Timeout (ms)" tip="Timeout for robots.txt fetch checks." disabled={!runtimeDraft.robotsTxtCompliant}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.robotsTxtTimeoutMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.robotsTxtTimeoutMs.max}
                  step={100}
                  value={runtimeDraft.robotsTxtTimeoutMs}
                  onChange={(event) => onNumberChange('robotsTxtTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.robotsTxtTimeoutMs)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.robotsTxtCompliant}
                  className={inputCls}
                />
              </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('fetch-render-dynamic')} className="scroll-mt-24" />
              <SettingGroupBlock title="Dynamic Fallback">
              <SettingRow label="Dynamic Crawlee Enabled" tip="Master toggle for browser-based dynamic fetch fallback.">
                <SettingToggle
                  checked={runtimeDraft.dynamicCrawleeEnabled}
                  onChange={(next) => updateDraft('dynamicCrawleeEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Crawlee Headless" tip="Run browser fallback in headless mode." disabled={dynamicFetchControlsLocked}>
                <SettingToggle
                  checked={runtimeDraft.crawleeHeadless}
                  onChange={(next) => updateDraft('crawleeHeadless', next)}
                  disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
                />
              </SettingRow>
              <SettingRow
                label="Crawlee Request Timeout (sec)"
                tip="Per-request timeout for dynamic request handlers."
                disabled={dynamicFetchControlsLocked}
              >
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs.min}
                  max={RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs.max}
                  step={1}
                  value={runtimeDraft.crawleeRequestHandlerTimeoutSecs}
                  onChange={(event) => onNumberChange('crawleeRequestHandlerTimeoutSecs', event.target.value, RUNTIME_NUMBER_BOUNDS.crawleeRequestHandlerTimeoutSecs)}
                  disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Dynamic Retry Budget" tip="Maximum retry attempts for dynamic fetch policy." disabled={dynamicFetchControlsLocked}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget.min}
                  max={RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget.max}
                  step={1}
                  value={runtimeDraft.dynamicFetchRetryBudget}
                  onChange={(event) => onNumberChange('dynamicFetchRetryBudget', event.target.value, RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBudget)}
                  disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Dynamic Retry Backoff (ms)" tip="Backoff delay between dynamic retry attempts." disabled={dynamicFetchControlsLocked}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs.max}
                  step={100}
                  value={runtimeDraft.dynamicFetchRetryBackoffMs}
                  onChange={(event) => onNumberChange('dynamicFetchRetryBackoffMs', event.target.value, RUNTIME_NUMBER_BOUNDS.dynamicFetchRetryBackoffMs)}
                  disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow
                label="Dynamic Fetch Policy Map (JSON)"
                tip="Optional JSON policy map for host-specific dynamic fetch behavior."
                disabled={dynamicFetchControlsLocked}
              >
                <textarea
                  value={runtimeDraft.dynamicFetchPolicyMapJson}
                  onChange={(event) => updateDraft('dynamicFetchPolicyMapJson', event.target.value)}
                  disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
                  className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
                  spellCheck={false}
                />
              </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('fetch-render-parsing')} className="scroll-mt-24" />
              <SettingGroupBlock title="Parsing and Screenshot">
              <SettingRow label="Max PDF Bytes" tip="Maximum PDF payload bytes allowed for parsing.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.maxPdfBytes.min}
                  max={RUNTIME_NUMBER_BOUNDS.maxPdfBytes.max}
                  step={1024}
                  value={runtimeDraft.maxPdfBytes}
                  onChange={(event) => onNumberChange('maxPdfBytes', event.target.value, RUNTIME_NUMBER_BOUNDS.maxPdfBytes)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="PDF Router Enabled" tip="Enable backend PDF router selection logic.">
                <SettingToggle
                  checked={runtimeDraft.pdfBackendRouterEnabled}
                  onChange={(next) => updateDraft('pdfBackendRouterEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="PDF Preferred Backend" tip="Preferred PDF backend (auto/pdfplumber/pymupdf/camelot/tabula/legacy)." disabled={!runtimeDraft.pdfBackendRouterEnabled}>
                <input
                  type="text"
                  value={runtimeDraft.pdfPreferredBackend}
                  onChange={(event) => updateDraft('pdfPreferredBackend', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="PDF Router Timeout (ms)" tip="Maximum wait time for PDF router backend evaluation." disabled={!runtimeDraft.pdfBackendRouterEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.pdfBackendRouterTimeoutMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.pdfBackendRouterTimeoutMs.max}
                  step={1000}
                  value={runtimeDraft.pdfBackendRouterTimeoutMs}
                  onChange={(event) => onNumberChange('pdfBackendRouterTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.pdfBackendRouterTimeoutMs)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="PDF Router Max Pages" tip="Maximum pages scanned by the PDF router." disabled={!runtimeDraft.pdfBackendRouterEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPages.min}
                  max={RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPages.max}
                  step={1}
                  value={runtimeDraft.pdfBackendRouterMaxPages}
                  onChange={(event) => onNumberChange('pdfBackendRouterMaxPages', event.target.value, RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPages)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="PDF Router Max Pairs" tip="Maximum candidate key-value pairs evaluated by the PDF router." disabled={!runtimeDraft.pdfBackendRouterEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPairs.min}
                  max={RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPairs.max}
                  step={1}
                  value={runtimeDraft.pdfBackendRouterMaxPairs}
                  onChange={(event) => onNumberChange('pdfBackendRouterMaxPairs', event.target.value, RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxPairs)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="PDF Router Max Text Preview Chars" tip="Max text preview characters sampled for PDF backend routing." disabled={!runtimeDraft.pdfBackendRouterEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxTextPreviewChars.min}
                  max={RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxTextPreviewChars.max}
                  step={256}
                  value={runtimeDraft.pdfBackendRouterMaxTextPreviewChars}
                  onChange={(event) => onNumberChange('pdfBackendRouterMaxTextPreviewChars', event.target.value, RUNTIME_NUMBER_BOUNDS.pdfBackendRouterMaxTextPreviewChars)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.pdfBackendRouterEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Capture Page Screenshot Enabled" tip="Enable screenshot capture in fetch pipeline.">
                <SettingToggle
                  checked={runtimeDraft.capturePageScreenshotEnabled}
                  onChange={(next) => updateDraft('capturePageScreenshotEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Capture Screenshot Format" tip="Screenshot format (jpeg/png/webp)." disabled={!runtimeDraft.capturePageScreenshotEnabled}>
                <input
                  type="text"
                  value={runtimeDraft.capturePageScreenshotFormat}
                  onChange={(event) => updateDraft('capturePageScreenshotFormat', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Capture Screenshot Quality" tip="Quality for screenshot encoder when supported." disabled={!runtimeDraft.capturePageScreenshotEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.capturePageScreenshotQuality.min}
                  max={RUNTIME_NUMBER_BOUNDS.capturePageScreenshotQuality.max}
                  step={1}
                  value={runtimeDraft.capturePageScreenshotQuality}
                  onChange={(event) => onNumberChange('capturePageScreenshotQuality', event.target.value, RUNTIME_NUMBER_BOUNDS.capturePageScreenshotQuality)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Capture Screenshot Max Bytes" tip="Max screenshot payload bytes before truncation/rejection." disabled={!runtimeDraft.capturePageScreenshotEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.capturePageScreenshotMaxBytes.min}
                  max={RUNTIME_NUMBER_BOUNDS.capturePageScreenshotMaxBytes.max}
                  step={1024}
                  value={runtimeDraft.capturePageScreenshotMaxBytes}
                  onChange={(event) => onNumberChange('capturePageScreenshotMaxBytes', event.target.value, RUNTIME_NUMBER_BOUNDS.capturePageScreenshotMaxBytes)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Capture Screenshot Selectors" tip="CSS selectors used to focus screenshot capture on spec regions." disabled={!runtimeDraft.capturePageScreenshotEnabled}>
                <input
                  type="text"
                  value={runtimeDraft.capturePageScreenshotSelectors}
                  onChange={(event) => updateDraft('capturePageScreenshotSelectors', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Runtime Capture Screenshots" tip="Emit runtime screenshot events while process is running.">
                <SettingToggle
                  checked={runtimeDraft.runtimeCaptureScreenshots}
                  onChange={(next) => updateDraft('runtimeCaptureScreenshots', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Runtime Screenshot Mode" tip="Runtime screenshot persistence mode (last_only/all)." disabled={!runtimeDraft.runtimeCaptureScreenshots}>
                <input
                  type="text"
                  value={runtimeDraft.runtimeScreenshotMode}
                  onChange={(event) => updateDraft('runtimeScreenshotMode', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.runtimeCaptureScreenshots}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Capture Enabled" tip="Enable visual asset capture pipeline and review image derivatives.">
                <SettingToggle
                  checked={runtimeDraft.visualAssetCaptureEnabled}
                  onChange={(next) => updateDraft('visualAssetCaptureEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Capture Max Per Source" tip="Maximum visual assets retained per source." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetCaptureMaxPerSource.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetCaptureMaxPerSource.max}
                  step={1}
                  value={runtimeDraft.visualAssetCaptureMaxPerSource}
                  onChange={(event) => onNumberChange('visualAssetCaptureMaxPerSource', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetCaptureMaxPerSource)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Store Original" tip="Retain original-capture asset bytes in addition to review derivatives." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <SettingToggle
                  checked={runtimeDraft.visualAssetStoreOriginal}
                  onChange={(next) => updateDraft('visualAssetStoreOriginal', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Retention Days" tip="Retention window for stored visual assets." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetRetentionDays.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetRetentionDays.max}
                  step={1}
                  value={runtimeDraft.visualAssetRetentionDays}
                  onChange={(event) => onNumberChange('visualAssetRetentionDays', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetRetentionDays)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset pHash Enabled" tip="Enable perceptual hash generation for duplicate detection." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <SettingToggle
                  checked={runtimeDraft.visualAssetPhashEnabled}
                  onChange={(next) => updateDraft('visualAssetPhashEnabled', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Review Format" tip="Image format used for review derivatives." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="text"
                  value={runtimeDraft.visualAssetReviewFormat}
                  onChange={(event) => updateDraft('visualAssetReviewFormat', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Hero Selector Map JSON" tip="Per-domain JSON selector map to bias hero/region targeting." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <textarea
                  value={runtimeDraft.visualAssetHeroSelectorMapJson}
                  onChange={(event) => updateDraft('visualAssetHeroSelectorMapJson', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={`${inputCls} min-h-[72px]`}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Review LG Max Side" tip="Max side length for large review derivative." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetReviewLgMaxSide.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetReviewLgMaxSide.max}
                  step={1}
                  value={runtimeDraft.visualAssetReviewLgMaxSide}
                  onChange={(event) => onNumberChange('visualAssetReviewLgMaxSide', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetReviewLgMaxSide)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Review SM Max Side" tip="Max side length for small review derivative." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetReviewSmMaxSide.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetReviewSmMaxSide.max}
                  step={1}
                  value={runtimeDraft.visualAssetReviewSmMaxSide}
                  onChange={(event) => onNumberChange('visualAssetReviewSmMaxSide', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetReviewSmMaxSide)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Review LG Quality" tip="Quality setting for large review derivative." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetReviewLgQuality.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetReviewLgQuality.max}
                  step={1}
                  value={runtimeDraft.visualAssetReviewLgQuality}
                  onChange={(event) => onNumberChange('visualAssetReviewLgQuality', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetReviewLgQuality)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Review SM Quality" tip="Quality setting for small review derivative." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetReviewSmQuality.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetReviewSmQuality.max}
                  step={1}
                  value={runtimeDraft.visualAssetReviewSmQuality}
                  onChange={(event) => onNumberChange('visualAssetReviewSmQuality', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetReviewSmQuality)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Region Crop Max Side" tip="Max side length for region crop derivatives." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetRegionCropMaxSide.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetRegionCropMaxSide.max}
                  step={1}
                  value={runtimeDraft.visualAssetRegionCropMaxSide}
                  onChange={(event) => onNumberChange('visualAssetRegionCropMaxSide', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetRegionCropMaxSide)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Region Crop Quality" tip="Quality setting for region crop derivatives." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetRegionCropQuality.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetRegionCropQuality.max}
                  step={1}
                  value={runtimeDraft.visualAssetRegionCropQuality}
                  onChange={(event) => onNumberChange('visualAssetRegionCropQuality', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetRegionCropQuality)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset LLM Max Bytes" tip="Max bytes of visual payload allowed for LLM-side analysis." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetLlmMaxBytes.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetLlmMaxBytes.max}
                  step={1024}
                  value={runtimeDraft.visualAssetLlmMaxBytes}
                  onChange={(event) => onNumberChange('visualAssetLlmMaxBytes', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetLlmMaxBytes)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Min Width" tip="Minimum accepted width for candidate visual assets." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetMinWidth.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetMinWidth.max}
                  step={1}
                  value={runtimeDraft.visualAssetMinWidth}
                  onChange={(event) => onNumberChange('visualAssetMinWidth', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetMinWidth)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Min Height" tip="Minimum accepted height for candidate visual assets." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetMinHeight.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetMinHeight.max}
                  step={1}
                  value={runtimeDraft.visualAssetMinHeight}
                  onChange={(event) => onNumberChange('visualAssetMinHeight', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetMinHeight)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Min Sharpness" tip="Minimum sharpness score for accepting visual assets." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetMinSharpness.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetMinSharpness.max}
                  step={0.1}
                  value={runtimeDraft.visualAssetMinSharpness}
                  onChange={(event) => onNumberChange('visualAssetMinSharpness', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetMinSharpness)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Min Entropy" tip="Minimum entropy score for accepting visual assets." disabled={!runtimeDraft.visualAssetCaptureEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetMinEntropy.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetMinEntropy.max}
                  step={0.1}
                  value={runtimeDraft.visualAssetMinEntropy}
                  onChange={(event) => onNumberChange('visualAssetMinEntropy', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetMinEntropy)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Visual Asset Max pHash Distance" tip="Maximum pHash distance for near-duplicate filtering." disabled={!runtimeDraft.visualAssetCaptureEnabled || !runtimeDraft.visualAssetPhashEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.visualAssetMaxPhashDistance.min}
                  max={RUNTIME_NUMBER_BOUNDS.visualAssetMaxPhashDistance.max}
                  step={1}
                  value={runtimeDraft.visualAssetMaxPhashDistance}
                  onChange={(event) => onNumberChange('visualAssetMaxPhashDistance', event.target.value, RUNTIME_NUMBER_BOUNDS.visualAssetMaxPhashDistance)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.visualAssetCaptureEnabled || !runtimeDraft.visualAssetPhashEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Chart Extraction Enabled" tip="Enable chart extraction assist path for parse stage.">
                <SettingToggle
                  checked={runtimeDraft.chartExtractionEnabled}
                  onChange={(next) => updateDraft('chartExtractionEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Article Extractor V2 Enabled" tip="Enable article extractor readability-v2 path.">
                <SettingToggle
                  checked={runtimeDraft.articleExtractorV2Enabled}
                  onChange={(next) => updateDraft('articleExtractorV2Enabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Article Extractor Min Chars" tip="Minimum body character count for article extractor acceptance." disabled={!runtimeDraft.articleExtractorV2Enabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.articleExtractorMinChars.min}
                  max={RUNTIME_NUMBER_BOUNDS.articleExtractorMinChars.max}
                  step={10}
                  value={runtimeDraft.articleExtractorMinChars}
                  onChange={(event) => onNumberChange('articleExtractorMinChars', event.target.value, RUNTIME_NUMBER_BOUNDS.articleExtractorMinChars)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.articleExtractorV2Enabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Article Extractor Min Score" tip="Minimum extractor score threshold for acceptance." disabled={!runtimeDraft.articleExtractorV2Enabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.articleExtractorMinScore.min}
                  max={RUNTIME_NUMBER_BOUNDS.articleExtractorMinScore.max}
                  step={1}
                  value={runtimeDraft.articleExtractorMinScore}
                  onChange={(event) => onNumberChange('articleExtractorMinScore', event.target.value, RUNTIME_NUMBER_BOUNDS.articleExtractorMinScore)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.articleExtractorV2Enabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Article Extractor Max Chars" tip="Maximum extractor body characters retained." disabled={!runtimeDraft.articleExtractorV2Enabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.articleExtractorMaxChars.min}
                  max={RUNTIME_NUMBER_BOUNDS.articleExtractorMaxChars.max}
                  step={100}
                  value={runtimeDraft.articleExtractorMaxChars}
                  onChange={(event) => onNumberChange('articleExtractorMaxChars', event.target.value, RUNTIME_NUMBER_BOUNDS.articleExtractorMaxChars)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.articleExtractorV2Enabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Static DOM Extractor Enabled" tip="Enable static DOM extraction fallback path.">
                <SettingToggle
                  checked={runtimeDraft.staticDomExtractorEnabled}
                  onChange={(next) => updateDraft('staticDomExtractorEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Static DOM Mode" tip="Static DOM extraction mode (cheerio/regex_fallback)." disabled={!runtimeDraft.staticDomExtractorEnabled}>
                <input
                  type="text"
                  value={runtimeDraft.staticDomMode}
                  onChange={(event) => updateDraft('staticDomMode', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.staticDomExtractorEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Static DOM Target Match Threshold" tip="Minimum target-match confidence for static DOM extraction candidates." disabled={!runtimeDraft.staticDomExtractorEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.staticDomTargetMatchThreshold.min}
                  max={RUNTIME_NUMBER_BOUNDS.staticDomTargetMatchThreshold.max}
                  step={0.01}
                  value={runtimeDraft.staticDomTargetMatchThreshold}
                  onChange={(event) => onNumberChange('staticDomTargetMatchThreshold', event.target.value, RUNTIME_NUMBER_BOUNDS.staticDomTargetMatchThreshold)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.staticDomExtractorEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Static DOM Max Evidence Snippets" tip="Maximum static-DOM snippets retained per candidate field." disabled={!runtimeDraft.staticDomExtractorEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.staticDomMaxEvidenceSnippets.min}
                  max={RUNTIME_NUMBER_BOUNDS.staticDomMaxEvidenceSnippets.max}
                  step={1}
                  value={runtimeDraft.staticDomMaxEvidenceSnippets}
                  onChange={(event) => onNumberChange('staticDomMaxEvidenceSnippets', event.target.value, RUNTIME_NUMBER_BOUNDS.staticDomMaxEvidenceSnippets)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.staticDomExtractorEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Article Extractor Domain Policy Map (JSON)" tip="Host policy map JSON override for article-extractor mode selection.">
                <textarea
                  value={runtimeDraft.articleExtractorDomainPolicyMapJson}
                  onChange={(event) => updateDraft('articleExtractorDomainPolicyMapJson', event.target.value)}
                  disabled={!runtimeSettingsReady}
                  className={`${inputCls} min-h-[72px]`}
                />
              </SettingRow>
              <SettingRow label="HTML Table Extractor V2" tip="Enable table-focused HTML extractor v2 path.">
                <SettingToggle
                  checked={runtimeDraft.htmlTableExtractorV2}
                  onChange={(next) => updateDraft('htmlTableExtractorV2', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Structured Metadata Extruct Enabled" tip="Enable structured-metadata extruct service client path.">
                <SettingToggle
                  checked={runtimeDraft.structuredMetadataExtructEnabled}
                  onChange={(next) => updateDraft('structuredMetadataExtructEnabled', next)}
                  disabled={!runtimeSettingsReady}
                />
              </SettingRow>
              <SettingRow label="Structured Metadata Extruct URL" tip="Base URL for the structured-metadata extruct service." disabled={!runtimeDraft.structuredMetadataExtructEnabled}>
                <input
                  type="text"
                  value={runtimeDraft.structuredMetadataExtructUrl}
                  onChange={(event) => updateDraft('structuredMetadataExtructUrl', event.target.value)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.structuredMetadataExtructEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Structured Metadata Extruct Timeout (ms)" tip="Timeout for extruct service requests." disabled={!runtimeDraft.structuredMetadataExtructEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructTimeoutMs.min}
                  max={RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructTimeoutMs.max}
                  step={50}
                  value={runtimeDraft.structuredMetadataExtructTimeoutMs}
                  onChange={(event) => onNumberChange('structuredMetadataExtructTimeoutMs', event.target.value, RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructTimeoutMs)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.structuredMetadataExtructEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Structured Metadata Extruct Max Items / Surface" tip="Maximum extruct metadata items retained per page surface." disabled={!runtimeDraft.structuredMetadataExtructEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructMaxItemsPerSurface.min}
                  max={RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructMaxItemsPerSurface.max}
                  step={1}
                  value={runtimeDraft.structuredMetadataExtructMaxItemsPerSurface}
                  onChange={(event) => onNumberChange('structuredMetadataExtructMaxItemsPerSurface', event.target.value, RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructMaxItemsPerSurface)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.structuredMetadataExtructEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Structured Metadata Extruct Cache Enabled" tip="Cache extruct responses to reduce repeated metadata fetch calls." disabled={!runtimeDraft.structuredMetadataExtructEnabled}>
                <SettingToggle
                  checked={runtimeDraft.structuredMetadataExtructCacheEnabled}
                  onChange={(next) => updateDraft('structuredMetadataExtructCacheEnabled', next)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.structuredMetadataExtructEnabled}
                />
              </SettingRow>
              <SettingRow label="Structured Metadata Extruct Cache Limit" tip="Maximum number of extruct cache entries retained." disabled={!runtimeDraft.structuredMetadataExtructEnabled || !runtimeDraft.structuredMetadataExtructCacheEnabled}>
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructCacheLimit.min}
                  max={RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructCacheLimit.max}
                  step={1}
                  value={runtimeDraft.structuredMetadataExtructCacheLimit}
                  onChange={(event) => onNumberChange('structuredMetadataExtructCacheLimit', event.target.value, RUNTIME_NUMBER_BOUNDS.structuredMetadataExtructCacheLimit)}
                  disabled={!runtimeSettingsReady || !runtimeDraft.structuredMetadataExtructEnabled || !runtimeDraft.structuredMetadataExtructCacheEnabled}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="DOM Snippet Max Chars" tip="Maximum DOM snippet characters retained per source.">
                <input
                  type="number"
                  min={RUNTIME_NUMBER_BOUNDS.domSnippetMaxChars.min}
                  max={RUNTIME_NUMBER_BOUNDS.domSnippetMaxChars.max}
                  step={50}
                  value={runtimeDraft.domSnippetMaxChars}
                  onChange={(event) => onNumberChange('domSnippetMaxChars', event.target.value, RUNTIME_NUMBER_BOUNDS.domSnippetMaxChars)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              <SettingRow label="Spec DB Dir" tip="Root directory for per-category spec SQLite databases.">
                <input
                  type="text"
                  value={runtimeDraft.specDbDir}
                  onChange={(event) => updateDraft('specDbDir', event.target.value)}
                  disabled={!runtimeSettingsReady}
                  className={inputCls}
                />
              </SettingRow>
              </SettingGroupBlock>
              </FlowOptionPanel>
              {dynamicFetchControlsLocked ? renderDisabledHint('Dynamic fetch controls are disabled because Dynamic Crawlee is OFF.') : null}
            </div>
          ) : null}

          {activeStep === 'ocr' ? (
            <div className="space-y-3">
              <FlowOptionPanel
                title="OCR"
                subtitle="Scanned PDF OCR activation and evidence-promotion controls."
              >
              <div id={runtimeSubStepDomId('ocr-activation')} className="scroll-mt-24" />
              <SettingGroupBlock title="OCR Activation">
                <SettingRow label="OCR Enabled" tip="Master toggle for OCR fallback on scanned or image-only PDFs.">
                  <SettingToggle
                    checked={runtimeDraft.scannedPdfOcrEnabled}
                    onChange={(next) => updateDraft('scannedPdfOcrEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="Promote OCR Candidates" tip="Allows OCR-extracted candidates to be promoted into extraction context." disabled={ocrControlsLocked}>
                  <SettingToggle
                    checked={runtimeDraft.scannedPdfOcrPromoteCandidates}
                    onChange={(next) => updateDraft('scannedPdfOcrPromoteCandidates', next)}
                    disabled={!runtimeSettingsReady || ocrControlsLocked}
                  />
                </SettingRow>
                <SettingRow label="OCR Backend" tip="OCR engine selection for scanned documents." disabled={ocrControlsLocked}>
                  <select
                    value={runtimeDraft.scannedPdfOcrBackend}
                    onChange={(event) => updateDraft('scannedPdfOcrBackend', event.target.value as RuntimeDraft['scannedPdfOcrBackend'])}
                    disabled={!runtimeSettingsReady || ocrControlsLocked}
                    className={inputCls}
                  >
                    {OCR_BACKEND_OPTIONS.map((backend) => (
                      <option key={`ocr:${backend}`} value={backend}>
                        {backend}
                      </option>
                    ))}
                  </select>
                </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('ocr-thresholds')} className="scroll-mt-24" />
              <SettingGroupBlock title="OCR Sampling Thresholds">
                <SettingRow label="OCR Max Pages" tip="Maximum number of pages sampled by OCR fallback." disabled={ocrControlsLocked}>
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages.min}
                    max={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages.max}
                    step={1}
                    value={runtimeDraft.scannedPdfOcrMaxPages}
                    onChange={(event) => onNumberChange('scannedPdfOcrMaxPages', event.target.value, RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPages)}
                    disabled={!runtimeSettingsReady || ocrControlsLocked}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="OCR Max Pairs" tip="Maximum source pairs promoted from OCR extraction." disabled={ocrControlsLocked}>
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs.min}
                    max={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs.max}
                    step={1}
                    value={runtimeDraft.scannedPdfOcrMaxPairs}
                    onChange={(event) => onNumberChange('scannedPdfOcrMaxPairs', event.target.value, RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMaxPairs)}
                    disabled={!runtimeSettingsReady || ocrControlsLocked}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="OCR Min Chars / Page" tip="Minimum characters required per OCR page." disabled={ocrControlsLocked}>
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage.min}
                    max={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage.max}
                    step={10}
                    value={runtimeDraft.scannedPdfOcrMinCharsPerPage}
                    onChange={(event) => onNumberChange('scannedPdfOcrMinCharsPerPage', event.target.value, RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinCharsPerPage)}
                    disabled={!runtimeSettingsReady || ocrControlsLocked}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="OCR Min Lines / Page" tip="Minimum OCR line count required per page." disabled={ocrControlsLocked}>
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage.min}
                    max={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage.max}
                    step={1}
                    value={runtimeDraft.scannedPdfOcrMinLinesPerPage}
                    onChange={(event) => onNumberChange('scannedPdfOcrMinLinesPerPage', event.target.value, RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinLinesPerPage)}
                    disabled={!runtimeSettingsReady || ocrControlsLocked}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="OCR Min Confidence" tip="Minimum OCR confidence required before candidate promotion." disabled={ocrControlsLocked}>
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence.min}
                    max={RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence.max}
                    step={0.01}
                    value={runtimeDraft.scannedPdfOcrMinConfidence}
                    onChange={(event) => onNumberChange('scannedPdfOcrMinConfidence', event.target.value, RUNTIME_NUMBER_BOUNDS.scannedPdfOcrMinConfidence)}
                    disabled={!runtimeSettingsReady || ocrControlsLocked}
                    className={inputCls}
                  />
                </SettingRow>
              </SettingGroupBlock>
              </FlowOptionPanel>
              {ocrControlsLocked ? renderDisabledHint('OCR controls are disabled because OCR Enabled is OFF.') : null}
            </div>
          ) : null}

          {activeStep === 'planner-triage' ? (
            <div className="space-y-3">
              <FlowOptionPanel
                title="Planner and Triage"
                subtitle="Planner/triage LLM lanes used before extraction."
              >
              <div id={runtimeSubStepDomId('planner-triage-planner')} className="scroll-mt-24" />
              <SettingGroupBlock title="Planner Lane">
                <SettingRow label="Planner Enabled" tip="Master toggle for phase-2 planner lane." disabled={plannerControlsLocked}>
                  <SettingToggle
                    checked={runtimeDraft.phase2LlmEnabled}
                    onChange={(next) => updateDraft('phase2LlmEnabled', next)}
                    disabled={!runtimeSettingsReady || plannerControlsLocked}
                  />
                </SettingRow>
                <SettingRow label="Planner Model" tip="Model used for phase-2 planning prompts." disabled={plannerModelLocked}>
                  <select
                    value={runtimeDraft.phase2LlmModel}
                    onChange={(event) => onRoleModelChange('phase2LlmModel', 'llmTokensPlan', event.target.value)}
                    disabled={!runtimeSettingsReady || plannerModelLocked}
                    className={inputCls}
                  >
                    {llmModelOptions.map((model) => (
                      <option key={`p2:model:${model}`} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Planner Token Cap" tip="Max output tokens for planner responses." disabled={plannerModelLocked}>
                  <select
                    value={runtimeDraft.llmTokensPlan}
                    onChange={(event) => updateDraft('llmTokensPlan', clampTokenForModel(runtimeDraft.phase2LlmModel, Number.parseInt(event.target.value, 10)))}
                    disabled={!runtimeSettingsReady || plannerModelLocked}
                    className={inputCls}
                  >
                    {renderTokenOptions(runtimeDraft.phase2LlmModel, 'planner')}
                  </select>
                </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('planner-triage-triage')} className="scroll-mt-24" />
              <SettingGroupBlock title="Triage Lane">
                <SettingRow label="Triage Enabled" tip="Master toggle for phase-3 SERP triage lane." disabled={plannerControlsLocked}>
                  <SettingToggle
                    checked={runtimeDraft.phase3LlmTriageEnabled}
                    onChange={(next) => updateDraft('phase3LlmTriageEnabled', next)}
                    disabled={!runtimeSettingsReady || plannerControlsLocked}
                  />
                </SettingRow>
                <SettingRow label="Triage Model" tip="Model used to score SERP candidates." disabled={triageModelLocked}>
                  <select
                    value={runtimeDraft.phase3LlmModel}
                    onChange={(event) => onRoleModelChange('phase3LlmModel', 'llmTokensTriage', event.target.value)}
                    disabled={!runtimeSettingsReady || triageModelLocked}
                    className={inputCls}
                  >
                    {llmModelOptions.map((model) => (
                      <option key={`p3:model:${model}`} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Triage Token Cap" tip="Max output tokens for triage responses." disabled={triageModelLocked}>
                  <select
                    value={runtimeDraft.llmTokensTriage}
                    onChange={(event) => updateDraft('llmTokensTriage', clampTokenForModel(runtimeDraft.phase3LlmModel, Number.parseInt(event.target.value, 10)))}
                    disabled={!runtimeSettingsReady || triageModelLocked}
                    className={inputCls}
                  >
                    {renderTokenOptions(runtimeDraft.phase3LlmModel, 'triage')}
                  </select>
                </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('planner-triage-reranker')} className="scroll-mt-24" />
              <SettingGroupBlock title="Reranker Policy">
                <SettingRow
                  label="SERP Reranker Weight Map (JSON)"
                  tip="JSON weight map used by deterministic SERP reranker scoring bonuses and penalties."
                  disabled={plannerControlsLocked}
                >
                  <textarea
                    value={runtimeDraft.serpRerankerWeightMapJson}
                    onChange={(event) => updateDraft('serpRerankerWeightMapJson', event.target.value)}
                    disabled={!runtimeSettingsReady || plannerControlsLocked}
                    className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
                    spellCheck={false}
                  />
                </SettingRow>
              </SettingGroupBlock>
              </FlowOptionPanel>
              {plannerControlsLocked ? renderDisabledHint('Planner and triage controls are disabled because Discovery Enabled is OFF.') : null}
            </div>
          ) : null}

          {activeStep === 'role-routing' ? (
            <div className="space-y-3">
              <FlowOptionPanel
                title="Role Routing"
                subtitle="Primary model/token routing for fast, reasoning, extract, validate, and write lanes."
              >
              <div id={runtimeSubStepDomId('role-routing-fast-reasoning')} className="scroll-mt-24" />
              <SettingGroupBlock title="Fast and Reasoning">
                <SettingRow label="Fast Model" tip="Primary model for fast-pass lane.">
                  <select
                    value={runtimeDraft.llmModelFast}
                    onChange={(event) => onRoleModelChange('llmModelFast', 'llmTokensFast', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    {llmModelOptions.map((model) => (
                      <option key={`fast:model:${model}`} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Fast Token Cap" tip="Max output tokens for fast-pass calls.">
                  <select
                    value={runtimeDraft.llmTokensFast}
                    onChange={(event) => updateDraft('llmTokensFast', clampTokenForModel(runtimeDraft.llmModelFast, Number.parseInt(event.target.value, 10)))}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    {renderTokenOptions(runtimeDraft.llmModelFast, 'fast')}
                  </select>
                </SettingRow>
                <SettingRow label="Reasoning Model" tip="Primary model for reasoning lane.">
                  <select
                    value={runtimeDraft.llmModelReasoning}
                    onChange={(event) => onRoleModelChange('llmModelReasoning', 'llmTokensReasoning', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    {llmModelOptions.map((model) => (
                      <option key={`reasoning:model:${model}`} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Reasoning Token Cap" tip="Max output tokens for reasoning calls.">
                  <select
                    value={runtimeDraft.llmTokensReasoning}
                    onChange={(event) => updateDraft('llmTokensReasoning', clampTokenForModel(runtimeDraft.llmModelReasoning, Number.parseInt(event.target.value, 10)))}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    {renderTokenOptions(runtimeDraft.llmModelReasoning, 'reasoning')}
                  </select>
                </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('role-routing-extract-validate')} className="scroll-mt-24" />
              <SettingGroupBlock title="Extract and Validate">
                <SettingRow label="Extract Model" tip="Primary model for extraction lane.">
                  <select
                    value={runtimeDraft.llmModelExtract}
                    onChange={(event) => onRoleModelChange('llmModelExtract', 'llmTokensExtract', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    {llmModelOptions.map((model) => (
                      <option key={`extract:model:${model}`} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Extract Token Cap" tip="Max output tokens for extraction calls.">
                  <select
                    value={runtimeDraft.llmTokensExtract}
                    onChange={(event) => updateDraft('llmTokensExtract', clampTokenForModel(runtimeDraft.llmModelExtract, Number.parseInt(event.target.value, 10)))}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    {renderTokenOptions(runtimeDraft.llmModelExtract, 'extract')}
                  </select>
                </SettingRow>
                <SettingRow label="Validate Model" tip="Primary model for validation lane.">
                  <select
                    value={runtimeDraft.llmModelValidate}
                    onChange={(event) => onRoleModelChange('llmModelValidate', 'llmTokensValidate', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    {llmModelOptions.map((model) => (
                      <option key={`validate:model:${model}`} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Validate Token Cap" tip="Max output tokens for validation calls.">
                  <select
                    value={runtimeDraft.llmTokensValidate}
                    onChange={(event) => updateDraft('llmTokensValidate', clampTokenForModel(runtimeDraft.llmModelValidate, Number.parseInt(event.target.value, 10)))}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    {renderTokenOptions(runtimeDraft.llmModelValidate, 'validate')}
                  </select>
                </SettingRow>
              </SettingGroupBlock>
              <div id={runtimeSubStepDomId('role-routing-write')} className="scroll-mt-24" />
              <SettingGroupBlock title="Write Lane">
                <SettingRow label="Write Model" tip="Primary model for write lane.">
                  <select
                    value={runtimeDraft.llmModelWrite}
                    onChange={(event) => onRoleModelChange('llmModelWrite', 'llmTokensWrite', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    {llmModelOptions.map((model) => (
                      <option key={`write:model:${model}`} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Write Token Cap" tip="Max output tokens for write calls.">
                  <select
                    value={runtimeDraft.llmTokensWrite}
                    onChange={(event) => updateDraft('llmTokensWrite', clampTokenForModel(runtimeDraft.llmModelWrite, Number.parseInt(event.target.value, 10)))}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  >
                    {renderTokenOptions(runtimeDraft.llmModelWrite, 'write')}
                  </select>
                </SettingRow>
              </SettingGroupBlock>
              </FlowOptionPanel>
            </div>
          ) : null}

          {activeStep === 'fallback-routing' ? (
            <div className="space-y-3">
              <FlowOptionPanel
                title="Fallback Routing"
                subtitle="Fallback routes used when primary role lanes fail."
              >
                <div id={runtimeSubStepDomId('fallback-routing-master')} className="scroll-mt-24" />
                <SettingRow label="Fallback Enabled" tip="Master toggle for all fallback role routes.">
                  <SettingToggle
                    checked={runtimeDraft.llmFallbackEnabled}
                    onChange={(next) => updateDraft('llmFallbackEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
              </FlowOptionPanel>
              <FlowOptionPanel
                title="Provider Secrets and Cache"
                subtitle="Advanced provider credentials and extraction-cache controls."
              >
                <div id={runtimeSubStepDomId('fallback-routing-provider')} className="scroll-mt-24" />
                <SettingRow label="LLM Plan API Key" tip="Optional dedicated API key for planner lane provider calls.">
                  <input
                    type="password"
                    value={runtimeDraft.llmPlanApiKey}
                    onChange={(event) => updateDraft('llmPlanApiKey', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Bing Search Key" tip="API key used for Bing search provider requests.">
                  <input
                    type="password"
                    value={runtimeDraft.bingSearchKey}
                    onChange={(event) => updateDraft('bingSearchKey', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="Google CSE Key" tip="API key used for Google CSE provider requests.">
                  <input
                    type="password"
                    value={runtimeDraft.googleCseKey}
                    onChange={(event) => updateDraft('googleCseKey', event.target.value)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="LLM Extraction Cache Enabled" tip="Enable cached reuse of prior extraction completions.">
                  <SettingToggle
                    checked={runtimeDraft.llmExtractionCacheEnabled}
                    onChange={(next) => updateDraft('llmExtractionCacheEnabled', next)}
                    disabled={!runtimeSettingsReady}
                  />
                </SettingRow>
                <SettingRow label="LLM Extraction Cache Dir" tip="Directory path for extraction cache files." disabled={!runtimeDraft.llmExtractionCacheEnabled}>
                  <input
                    type="text"
                    value={runtimeDraft.llmExtractionCacheDir}
                    onChange={(event) => updateDraft('llmExtractionCacheDir', event.target.value)}
                    disabled={!runtimeSettingsReady || !runtimeDraft.llmExtractionCacheEnabled}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="LLM Extraction Cache TTL (ms)" tip="Retention lifetime for extraction-cache entries." disabled={!runtimeDraft.llmExtractionCacheEnabled}>
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.llmExtractionCacheTtlMs.min}
                    max={RUNTIME_NUMBER_BOUNDS.llmExtractionCacheTtlMs.max}
                    step={1000}
                    value={runtimeDraft.llmExtractionCacheTtlMs}
                    onChange={(event) => onNumberChange('llmExtractionCacheTtlMs', event.target.value, RUNTIME_NUMBER_BOUNDS.llmExtractionCacheTtlMs)}
                    disabled={!runtimeSettingsReady || !runtimeDraft.llmExtractionCacheEnabled}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="LLM Max Calls / Product Total" tip="Global per-product cap across all extraction lanes.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductTotal.min}
                    max={RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductTotal.max}
                    step={1}
                    value={runtimeDraft.llmMaxCallsPerProductTotal}
                    onChange={(event) => onNumberChange('llmMaxCallsPerProductTotal', event.target.value, RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductTotal)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
                <SettingRow label="LLM Max Calls / Product Fast" tip="Per-product cap for fast-lane extraction calls.">
                  <input
                    type="number"
                    min={RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductFast.min}
                    max={RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductFast.max}
                    step={1}
                    value={runtimeDraft.llmMaxCallsPerProductFast}
                    onChange={(event) => onNumberChange('llmMaxCallsPerProductFast', event.target.value, RUNTIME_NUMBER_BOUNDS.llmMaxCallsPerProductFast)}
                    disabled={!runtimeSettingsReady}
                    className={inputCls}
                  />
                </SettingRow>
              </FlowOptionPanel>
              <div id={runtimeSubStepDomId('fallback-routing-lanes')} className="scroll-mt-24" />
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <FlowOptionPanel
                  title="Planner Lane"
                  subtitle="Fallback planner route."
                  disabled={fallbackControlsLocked}
                >
                  <SettingRow label="Plan Fallback Model" tip="Fallback model for planner lane." disabled={fallbackControlsLocked}>
                    <select
                      value={runtimeDraft.llmFallbackPlanModel}
                      onChange={(event) => onFallbackModelChange('llmFallbackPlanModel', 'llmTokensPlanFallback', event.target.value, runtimeDraft.phase2LlmModel)}
                      disabled={!runtimeSettingsReady || fallbackControlsLocked}
                      className={inputCls}
                    >
                      <option value="">none</option>
                      {llmModelOptions.map((model) => (
                        <option key={`fallback:plan:${model}`} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow label="Plan Fallback Token Cap" tip="Max output tokens for fallback planner calls." disabled={fallbackControlsLocked}>
                    <select
                      value={runtimeDraft.llmTokensPlanFallback}
                      onChange={(event) => updateDraft('llmTokensPlanFallback', clampTokenForModel(runtimeDraft.llmFallbackPlanModel || runtimeDraft.phase2LlmModel, Number.parseInt(event.target.value, 10)))}
                      disabled={!runtimeSettingsReady || fallbackControlsLocked}
                      className={inputCls}
                    >
                      {renderTokenOptions(runtimeDraft.llmFallbackPlanModel || runtimeDraft.phase2LlmModel, 'fallback-plan')}
                    </select>
                  </SettingRow>
                </FlowOptionPanel>
                <FlowOptionPanel
                  title="Extract Lane"
                  subtitle="Fallback extract route."
                  disabled={fallbackControlsLocked}
                >
                  <SettingRow label="Extract Fallback Model" tip="Fallback model for extraction lane." disabled={fallbackControlsLocked}>
                    <select
                      value={runtimeDraft.llmFallbackExtractModel}
                      onChange={(event) => onFallbackModelChange('llmFallbackExtractModel', 'llmTokensExtractFallback', event.target.value, runtimeDraft.llmModelExtract)}
                      disabled={!runtimeSettingsReady || fallbackControlsLocked}
                      className={inputCls}
                    >
                      <option value="">none</option>
                      {llmModelOptions.map((model) => (
                        <option key={`fallback:extract:${model}`} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow label="Extract Fallback Token Cap" tip="Max output tokens for fallback extraction calls." disabled={fallbackControlsLocked}>
                    <select
                      value={runtimeDraft.llmTokensExtractFallback}
                      onChange={(event) => updateDraft('llmTokensExtractFallback', clampTokenForModel(runtimeDraft.llmFallbackExtractModel || runtimeDraft.llmModelExtract, Number.parseInt(event.target.value, 10)))}
                      disabled={!runtimeSettingsReady || fallbackControlsLocked}
                      className={inputCls}
                    >
                      {renderTokenOptions(runtimeDraft.llmFallbackExtractModel || runtimeDraft.llmModelExtract, 'fallback-extract')}
                    </select>
                  </SettingRow>
                </FlowOptionPanel>
                <FlowOptionPanel
                  title="Validate Lane"
                  subtitle="Fallback validate route."
                  disabled={fallbackControlsLocked}
                >
                  <SettingRow label="Validate Fallback Model" tip="Fallback model for validation lane." disabled={fallbackControlsLocked}>
                    <select
                      value={runtimeDraft.llmFallbackValidateModel}
                      onChange={(event) => onFallbackModelChange('llmFallbackValidateModel', 'llmTokensValidateFallback', event.target.value, runtimeDraft.llmModelValidate)}
                      disabled={!runtimeSettingsReady || fallbackControlsLocked}
                      className={inputCls}
                    >
                      <option value="">none</option>
                      {llmModelOptions.map((model) => (
                        <option key={`fallback:validate:${model}`} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow label="Validate Fallback Token Cap" tip="Max output tokens for fallback validation calls." disabled={fallbackControlsLocked}>
                    <select
                      value={runtimeDraft.llmTokensValidateFallback}
                      onChange={(event) => updateDraft('llmTokensValidateFallback', clampTokenForModel(runtimeDraft.llmFallbackValidateModel || runtimeDraft.llmModelValidate, Number.parseInt(event.target.value, 10)))}
                      disabled={!runtimeSettingsReady || fallbackControlsLocked}
                      className={inputCls}
                    >
                      {renderTokenOptions(runtimeDraft.llmFallbackValidateModel || runtimeDraft.llmModelValidate, 'fallback-validate')}
                    </select>
                  </SettingRow>
                </FlowOptionPanel>
                <FlowOptionPanel
                  title="Write Lane"
                  subtitle="Fallback write route."
                  disabled={fallbackControlsLocked}
                >
                  <SettingRow label="Write Fallback Model" tip="Fallback model for write lane." disabled={fallbackControlsLocked}>
                    <select
                      value={runtimeDraft.llmFallbackWriteModel}
                      onChange={(event) => onFallbackModelChange('llmFallbackWriteModel', 'llmTokensWriteFallback', event.target.value, runtimeDraft.llmModelWrite)}
                      disabled={!runtimeSettingsReady || fallbackControlsLocked}
                      className={inputCls}
                    >
                      <option value="">none</option>
                      {llmModelOptions.map((model) => (
                        <option key={`fallback:write:${model}`} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </SettingRow>
                  <SettingRow label="Write Fallback Token Cap" tip="Max output tokens for fallback write calls." disabled={fallbackControlsLocked}>
                    <select
                      value={runtimeDraft.llmTokensWriteFallback}
                      onChange={(event) => updateDraft('llmTokensWriteFallback', clampTokenForModel(runtimeDraft.llmFallbackWriteModel || runtimeDraft.llmModelWrite, Number.parseInt(event.target.value, 10)))}
                      disabled={!runtimeSettingsReady || fallbackControlsLocked}
                      className={inputCls}
                    >
                      {renderTokenOptions(runtimeDraft.llmFallbackWriteModel || runtimeDraft.llmModelWrite, 'fallback-write')}
                    </select>
                  </SettingRow>
                </FlowOptionPanel>
              </div>
              {fallbackControlsLocked ? renderDisabledHint('Fallback routing controls are disabled because Fallback Enabled is OFF.') : null}
            </div>
          ) : null}
        </section>
      </div>
      </div>
    </>
  );
}
