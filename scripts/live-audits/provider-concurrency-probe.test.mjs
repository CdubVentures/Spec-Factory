import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import {
  buildPayload,
  endpointFromBaseUrl,
  isEntrypoint,
  parseArgs,
  summarizeResults,
} from './provider-concurrency-probe.mjs';

test('parseArgs applies safe concurrency probe defaults', () => {
  const args = parseArgs([]);

  assert.equal(args.baseUrl, 'http://localhost:5001/v1');
  assert.equal(args.count, 200);
  assert.equal(args.model, 'gpt-5.4-mini');
  assert.equal(args.reasoningEffort, 'low');
});

test('parseArgs accepts common override flags', () => {
  const args = parseArgs([
    '--base-url', 'http://localhost:5002/v1',
    '--count', '12',
    '--model', 'gpt-test',
    '--prompt', '1+1',
    '--timeout-ms', '5000',
  ]);

  assert.equal(args.baseUrl, 'http://localhost:5002/v1');
  assert.equal(args.count, 12);
  assert.equal(args.model, 'gpt-test');
  assert.equal(args.prompt, '1+1');
  assert.equal(args.timeoutMs, 5000);
});

test('endpointFromBaseUrl appends chat completions path once', () => {
  assert.equal(
    endpointFromBaseUrl('http://localhost:5001/v1/'),
    'http://localhost:5001/v1/chat/completions',
  );
});

test('buildPayload sends low-reasoning non-stream chat completion', () => {
  const payload = buildPayload({
    model: 'gpt-5.4-mini',
    system: 'numbers only',
    prompt: '2+2',
    reasoningEffort: 'low',
  });

  assert.equal(payload.model, 'gpt-5.4-mini');
  assert.equal(payload.stream, false);
  assert.deepEqual(payload.request_options, {
    reasoning_effort: 'low',
    reasoning_summary: 'none',
  });
  assert.equal(payload.messages[0].content, 'numbers only');
  assert.equal(payload.messages[1].content, '2+2');
});

test('summarizeResults reports status counts, latency, and samples', () => {
  const summary = summarizeResults({
    count: 3,
    startedAt: 10,
    endedAt: 20,
    results: [
      { ok: true, status: 200, elapsedMs: 1000, sentOffsetMs: 1, text: '4', error: '' },
      { ok: true, status: 200, elapsedMs: 2000, sentOffsetMs: 2, text: '4', error: '' },
      { ok: false, status: 429, elapsedMs: 3000, sentOffsetMs: 3, text: '', error: 'rate' },
    ],
  });

  assert.equal(summary.n, 3);
  assert.equal(summary.ok, 2);
  assert.equal(summary.failed, 1);
  assert.deepEqual(summary.status_counts, { '200': 2, '429': 1 });
  assert.equal(summary.latency_ms.max, 3000);
  assert.equal(summary.sample_fail[0].error, 'rate');
});

test('isEntrypoint recognizes the script path used by node on Windows', () => {
  const metaUrl = new URL('./provider-concurrency-probe.mjs', import.meta.url).href;
  const argvPath = fileURLToPath(metaUrl);

  assert.equal(isEntrypoint({ metaUrl, argvPath }), true);
});
