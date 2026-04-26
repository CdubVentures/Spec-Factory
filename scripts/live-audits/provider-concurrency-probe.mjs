#!/usr/bin/env node

import process from 'node:process';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const DEFAULTS = Object.freeze({
  baseUrl: 'http://localhost:5001/v1',
  count: 200,
  model: 'gpt-5.4-mini',
  system: 'Answer with only the final number.',
  prompt: '2+2',
  reasoningEffort: 'low',
  timeoutMs: 600_000,
  settleMs: 200,
});

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (key === '--help' || key === '-h') {
      return { ...args, help: true };
    }
    if (key === '--base-url') {
      args.baseUrl = requireValue(key, next);
      i += 1;
    } else if (key === '--endpoint') {
      args.endpoint = requireValue(key, next);
      i += 1;
    } else if (key === '--count') {
      args.count = parsePositiveInt(key, next);
      i += 1;
    } else if (key === '--model') {
      args.model = requireValue(key, next);
      i += 1;
    } else if (key === '--system') {
      args.system = requireValue(key, next);
      i += 1;
    } else if (key === '--prompt') {
      args.prompt = requireValue(key, next);
      i += 1;
    } else if (key === '--reasoning-effort') {
      args.reasoningEffort = requireValue(key, next);
      i += 1;
    } else if (key === '--timeout-ms') {
      args.timeoutMs = parsePositiveInt(key, next);
      i += 1;
    } else if (key === '--settle-ms') {
      args.settleMs = parsePositiveInt(key, next);
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${key}`);
    }
  }
  return args;
}

export function endpointFromBaseUrl(baseUrl) {
  return `${String(baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
}

export function buildPayload({
  model,
  system,
  prompt,
  reasoningEffort,
}) {
  return {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt },
    ],
    stream: false,
    request_options: {
      reasoning_effort: reasoningEffort,
      reasoning_summary: 'none',
    },
  };
}

export function summarizeResults({
  count,
  startedAt,
  endedAt,
  results,
}) {
  const ok = results.filter((result) => result.ok);
  const failed = results.filter((result) => !result.ok);
  const statusCounts = {};
  for (const result of results) {
    const key = String(result.status ?? 'none');
    statusCounts[key] = (statusCounts[key] || 0) + 1;
  }
  const latencies = results.map((result) => result.elapsedMs);
  const sentOffsets = results.map((result) => result.sentOffsetMs);
  return {
    n: count,
    ok: ok.length,
    failed: failed.length,
    status_counts: statusCounts,
    total_wall_ms: round(endedAt - startedAt),
    sent_offset_ms: stats(sentOffsets),
    latency_ms: stats(latencies),
    sample_ok: ok.slice(0, 3),
    sample_fail: failed.slice(0, 10),
  };
}

export function isEntrypoint({ metaUrl, argvPath }) {
  if (!argvPath) return false;
  return path.resolve(fileURLToPath(metaUrl)) === path.resolve(argvPath);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  const endpoint = args.endpoint || endpointFromBaseUrl(args.baseUrl);
  const payload = buildPayload(args);
  const body = JSON.stringify(payload);
  const release = createReleaseGate();

  const startedAt = performance.now();
  const tasks = Array.from({ length: args.count }, (_, i) => runOne({
    index: i,
    endpoint,
    body,
    release,
    timeoutMs: args.timeoutMs,
  }));

  await sleep(args.settleMs);
  release.open();
  const results = await Promise.all(tasks);
  const endedAt = performance.now();
  const summary = summarizeResults({
    count: args.count,
    startedAt,
    endedAt,
    results,
  });
  console.log(JSON.stringify(summary, null, 2));
}

function requireValue(key, value) {
  if (value === undefined || String(value).startsWith('--')) {
    throw new Error(`${key} requires a value`);
  }
  return String(value);
}

function parsePositiveInt(key, value) {
  const parsed = Number.parseInt(requireValue(key, value), 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${key} must be a positive integer`);
  }
  return parsed;
}

function createReleaseGate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  let releaseAt = 0;
  return {
    async wait() {
      await promise;
      return releaseAt;
    },
    open() {
      releaseAt = performance.now();
      release();
    },
  };
}

async function runOne({
  index,
  endpoint,
  body,
  release,
  timeoutMs,
}) {
  const releaseAt = await release.wait();
  const sentAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    return {
      i: index,
      ok: response.ok,
      status: response.status,
      elapsedMs: round(performance.now() - sentAt),
      sentOffsetMs: round(sentAt - releaseAt),
      text: extractText(text),
      error: response.ok ? '' : text.slice(0, 500),
    };
  } catch (error) {
    return {
      i: index,
      ok: false,
      status: null,
      elapsedMs: round(performance.now() - sentAt),
      sentOffsetMs: round(sentAt - releaseAt),
      text: '',
      error: String(error?.stack || error?.message || error).slice(0, 500),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractText(raw) {
  try {
    const parsed = JSON.parse(raw);
    return String(parsed?.choices?.[0]?.message?.content || '').slice(0, 120);
  } catch {
    return String(raw || '').slice(0, 120);
  }
}

function stats(values) {
  if (!values.length) {
    return { min: 0, p50: 0, p90: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  return {
    min: round(sorted[0]),
    p50: round(percentile(sorted, 0.5)),
    p90: round(percentile(sorted, 0.9)),
    max: round(sorted[sorted.length - 1]),
  };
}

function percentile(sorted, fraction) {
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function round(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

function printHelp() {
  console.log(`Provider concurrency live probe

This sends real provider requests. Use small counts unless you intend to spend
quota. Defaults target local LLM Lab OpenAI on port 5001.

Usage:
  node scripts/live-audits/provider-concurrency-probe.mjs [options]

Options:
  --base-url <url>            OpenAI-compatible base URL (default: ${DEFAULTS.baseUrl})
  --endpoint <url>            Full chat completions endpoint, overrides --base-url
  --count <n>                 Number of requests to release together (default: ${DEFAULTS.count})
  --model <id>                Model id (default: ${DEFAULTS.model})
  --system <text>             System prompt
  --prompt <text>             User prompt (default: ${DEFAULTS.prompt})
  --reasoning-effort <level>  Request option reasoning_effort (default: ${DEFAULTS.reasoningEffort})
  --timeout-ms <n>            Per-request timeout (default: ${DEFAULTS.timeoutMs})
  --settle-ms <n>             Let workers park before release (default: ${DEFAULTS.settleMs})
`);
}

if (isEntrypoint({ metaUrl: import.meta.url, argvPath: process.argv[1] })) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
