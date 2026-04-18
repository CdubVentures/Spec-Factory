#!/usr/bin/env node
/**
 * PIF view-mode raw-response capture.
 *
 * Replays a recorded PIF view-mode prompt against the lab proxy and writes
 * the FULL raw response (HTTP body + extracted content + parse outcome) to
 * disk so we can see *why* `parseJsonContent` is returning null for 34% of
 * view-mode runs on gpt-5.4-mini.
 *
 * This tool is intentionally isolated: it does not import src/ runtime code,
 * does not touch .workspace/ writes, and does not go through the production
 * LLM client. It builds the same request body shape and POSTs directly.
 *
 * Usage:
 *   node tools/feature-audit-tests/pif/capture.mjs [options]
 *
 * Options:
 *   --product=<id>     Product id under .workspace/products/ (default: mouse-76a41560)
 *   --run=<N>          Replay a specific run_number (default: latest view-mode parse-fail)
 *   --n=<N>            Repeat the call N times (default: 1)
 *   --model=<name>     Model override (default: whatever the recorded run used)
 *   --endpoint=<url>   Lab endpoint (default: http://localhost:5001/v1/chat/completions)
 *   --no-web-search    Disable web_search request option
 *   --no-json-schema   Send plain json_mode only, no schema (isolate schema effect)
 *   --key=<key>        Bearer token (or set env LAB_API_KEY)
 *
 * Environment:
 *   LAB_API_KEY        Bearer token for the lab proxy (local proxies often accept none)
 *
 * Output:
 *   tools/feature-audit-tests/pif/results/<product>-r<run>-<timestamp>/
 *     request-body.json          — the exact body POSTed
 *     prompt-system.txt          — system prompt (verbatim from recorded run)
 *     prompt-user.txt            — user prompt
 *     attempt-NNN-http.json      — HTTP status, headers, duration
 *     attempt-NNN-raw-body.txt   — raw HTTP response body (what the proxy returned)
 *     attempt-NNN-content.txt    — the `choices[0].message.content` string (what parseJsonContent sees)
 *     attempt-NNN-parsed.json    — if content was valid JSON
 *     attempt-NNN-diagnosis.json — parse outcome + failure category
 *     summary.json               — per-run results + totals
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent, setGlobalDispatcher } from 'undici';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');

function parseArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) out[m[1]] = m[2] === undefined ? true : m[2];
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

const PRODUCT_ID = args.product || 'mouse-76a41560';
const REPEATS = Number(args.n) || 1;
const RUN_NUMBER = args.run ? Number(args.run) : null;
const ENDPOINT = args.endpoint || 'http://localhost:5001/v1/chat/completions';
const API_KEY = args.key || process.env.LAB_API_KEY || '';
const USE_WEB_SEARCH = !args['no-web-search'];
const USE_JSON_SCHEMA = !args['no-json-schema'];
// WHY: Production PIF view calls have median duration ~900s on gpt-5.4-mini
// with xhigh+web_search. Node undici's default headersTimeout/bodyTimeout
// (both 300s) cut the fetch at ~5 min before the proxy returns headers,
// hiding the real failure mode. Install a custom dispatcher with matching
// long timeouts so we can actually see what mini returns after 15 min.
const TIMEOUT_MS = Number(args.timeout) || 1_200_000;

setGlobalDispatcher(new Agent({
  headersTimeout: TIMEOUT_MS,
  bodyTimeout: TIMEOUT_MS,
  connectTimeout: 30_000,
  keepAliveTimeout: TIMEOUT_MS
}));

const pifPath = join(REPO_ROOT, '.workspace', 'products', PRODUCT_ID, 'product_images.json');
if (!existsSync(pifPath)) {
  console.error(`Not found: ${pifPath}`);
  process.exit(1);
}
const pifDoc = JSON.parse(readFileSync(pifPath, 'utf-8'));
const runs = Array.isArray(pifDoc.runs) ? pifDoc.runs : [];

let chosenRun;
if (RUN_NUMBER !== null) {
  chosenRun = runs.find(r => r.run_number === RUN_NUMBER);
  if (!chosenRun) {
    console.error(`Run ${RUN_NUMBER} not found in ${PRODUCT_ID}.`);
    process.exit(1);
  }
} else {
  chosenRun = [...runs].reverse().find(r =>
    r.mode === 'view' &&
    Array.isArray(r.response?.download_errors) &&
    r.response.download_errors.some(e => String(e?.error || '').includes('not valid JSON'))
  );
  if (!chosenRun) {
    console.error(`No view-mode parse-fail run found in ${PRODUCT_ID}. Specify --run=N.`);
    process.exit(1);
  }
}

const system = chosenRun.prompt?.system || '';
const user = chosenRun.prompt?.user || '';
const variantLabel = chosenRun.response?.variant_label || '(unknown)';
const recordedModel = chosenRun.model || 'gpt-5.4-mini';
const MODEL = args.model || recordedModel;

if (!system || !user) {
  console.error(`Run ${chosenRun.run_number} has no prompt data.`);
  process.exit(1);
}

console.log('='.repeat(70));
console.log(`PIF raw-response capture`);
console.log(`  product:      ${PRODUCT_ID}`);
console.log(`  run_number:   ${chosenRun.run_number}  (${chosenRun.ran_at || ''})`);
console.log(`  variant:      ${variantLabel}`);
console.log(`  mode:         ${chosenRun.mode}`);
console.log(`  recorded model: ${recordedModel}`);
console.log(`  using model:  ${MODEL}`);
console.log(`  endpoint:     ${ENDPOINT}`);
console.log(`  repeats:      ${REPEATS}`);
console.log(`  json_schema:  ${USE_JSON_SCHEMA}`);
console.log(`  web_search:   ${USE_WEB_SEARCH}`);
console.log(`  auth:         ${API_KEY ? `bearer (${API_KEY.length} chars)` : '(none)'}`);
console.log(`  timeout_ms:   ${TIMEOUT_MS}  (${Math.round(TIMEOUT_MS / 1000)}s)`);
console.log('='.repeat(70));

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultsDir = join(
  __dirname,
  'results',
  `${PRODUCT_ID}-r${chosenRun.run_number}-${timestamp}`
);
mkdirSync(resultsDir, { recursive: true });
console.log(`Results: ${resultsDir}\n`);

// Minimal JSON schema — same top-level shape the production schema enforces
// (we're not testing schema validity, just reproducing the request shape).
const productionLikeSchema = {
  type: 'object',
  properties: {
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          view: { type: 'string' },
          url: { type: 'string' },
          source_page: { type: 'string' },
          alt_text: { type: 'string' }
        },
        required: ['view', 'url', 'source_page', 'alt_text'],
        additionalProperties: false
      }
    },
    discovery_log: {
      type: 'object',
      properties: {
        urls_checked: { type: 'array', items: { type: 'string' } },
        queries_run: { type: 'array', items: { type: 'string' } },
        notes: { type: 'array', items: { type: 'string' } }
      },
      required: ['urls_checked', 'queries_run', 'notes'],
      additionalProperties: false
    }
  },
  required: ['images', 'discovery_log'],
  additionalProperties: false
};

const body = {
  model: MODEL,
  temperature: 0,
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
};

if (USE_JSON_SCHEMA) {
  body.response_format = {
    type: 'json_schema',
    json_schema: {
      name: 'structured_output',
      strict: true,
      schema: productionLikeSchema
    }
  };
}

const requestOptions = { json_mode: true };
if (USE_WEB_SEARCH) requestOptions.web_search = true;
body.request_options = requestOptions;

writeFileSync(join(resultsDir, 'request-body.json'), JSON.stringify(body, null, 2));
writeFileSync(join(resultsDir, 'prompt-system.txt'), system);
writeFileSync(join(resultsDir, 'prompt-user.txt'), user);

function categorizeFailure({ httpStatus, httpBody, content, parsedContent, contentParseError }) {
  if (httpStatus === 0) return 'network_error';
  if (httpStatus >= 500) return 'provider_5xx';
  if (httpStatus >= 400) return 'provider_4xx';
  if (!content || content.length === 0) return 'empty_content';
  if (parsedContent !== null) return 'parse_ok';
  if (/^\s*(I\b|I'm|Sorry|I cannot|I can't|Unable)/i.test(content)) return 'refusal_prose';
  if (/<think>|<\/think>/.test(content)) return 'think_tags_leaked';
  if (content.trim().endsWith(',') || content.trim().endsWith(':')) return 'truncated_midway';
  if (content.includes('```')) return 'markdown_fenced';
  if (contentParseError && /Unexpected end/.test(contentParseError)) return 'truncated_midway';
  if (contentParseError && /Unexpected token/.test(contentParseError)) return 'malformed_json';
  return 'other';
}

const summary = {
  started_at: new Date().toISOString(),
  product_id: PRODUCT_ID,
  source_run_number: chosenRun.run_number,
  variant_label: variantLabel,
  model: MODEL,
  endpoint: ENDPOINT,
  options: { use_json_schema: USE_JSON_SCHEMA, use_web_search: USE_WEB_SEARCH },
  repeats: REPEATS,
  attempts: [],
  totals: {
    parse_ok: 0,
    parse_fail: 0,
    http_fail: 0,
    by_category: {}
  }
};

for (let i = 1; i <= REPEATS; i++) {
  const tag = String(i).padStart(3, '0');
  const started = Date.now();
  console.log(`[${i}/${REPEATS}] POST → ${ENDPOINT} …`);

  let httpStatus = 0;
  let httpHeaders = {};
  let httpBody = '';
  let fetchError = null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    httpStatus = resp.status;
    httpHeaders = Object.fromEntries(resp.headers.entries());
    httpBody = await resp.text();
  } catch (err) {
    fetchError = err?.message || String(err);
  } finally {
    clearTimeout(timer);
  }

  const duration = Date.now() - started;

  let respJson = null;
  let respJsonError = null;
  try {
    respJson = httpBody ? JSON.parse(httpBody) : null;
  } catch (e) {
    respJsonError = e?.message || String(e);
  }

  const content =
    respJson?.choices?.[0]?.message?.content ??
    respJson?.choices?.[0]?.delta?.content ??
    '';
  const finishReason = respJson?.choices?.[0]?.finish_reason ?? null;
  const usage = respJson?.usage ?? null;

  let parsedContent = null;
  let contentParseError = null;
  if (content) {
    try {
      parsedContent = JSON.parse(content);
    } catch (e) {
      contentParseError = e?.message || String(e);
      const stripped = String(content).replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
      if (stripped && stripped !== content) {
        try {
          parsedContent = JSON.parse(stripped);
          contentParseError = null;
        } catch {
          /* leave error */
        }
      }
    }
  }

  const category = fetchError
    ? 'network_error'
    : categorizeFailure({ httpStatus, httpBody, content, parsedContent, contentParseError });

  const attempt = {
    i,
    duration_ms: duration,
    http_status: httpStatus,
    finish_reason: finishReason,
    content_length: content.length,
    parse_ok: parsedContent !== null && !contentParseError,
    content_parse_error: contentParseError,
    resp_json_error: respJsonError,
    fetch_error: fetchError,
    usage,
    category
  };

  summary.attempts.push(attempt);
  summary.totals.by_category[category] = (summary.totals.by_category[category] || 0) + 1;
  if (attempt.parse_ok) summary.totals.parse_ok++;
  else if (httpStatus >= 200 && httpStatus < 300) summary.totals.parse_fail++;
  else summary.totals.http_fail++;

  writeFileSync(
    join(resultsDir, `attempt-${tag}-http.json`),
    JSON.stringify({ httpStatus, httpHeaders, finishReason, usage, duration_ms: duration, fetchError }, null, 2)
  );
  writeFileSync(join(resultsDir, `attempt-${tag}-raw-body.txt`), httpBody || '');
  writeFileSync(join(resultsDir, `attempt-${tag}-content.txt`), content || '');
  if (parsedContent !== null) {
    writeFileSync(
      join(resultsDir, `attempt-${tag}-parsed.json`),
      JSON.stringify(parsedContent, null, 2)
    );
  }
  writeFileSync(
    join(resultsDir, `attempt-${tag}-diagnosis.json`),
    JSON.stringify({ category, content_parse_error: contentParseError, first_200_chars: content.slice(0, 200) }, null, 2)
  );

  const tail = content.length > 0
    ? `content=${content.length}ch finish=${finishReason || '?'} first="${content.slice(0, 40).replace(/\n/g, ' ')}..."`
    : `empty content`;
  console.log(`       http=${httpStatus}  ${duration}ms  ${category}  ${tail}`);
  if (contentParseError) console.log(`       parse_err: ${contentParseError.slice(0, 120)}`);
}

summary.ended_at = new Date().toISOString();
writeFileSync(join(resultsDir, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));
console.log(`  parse_ok:   ${summary.totals.parse_ok}/${summary.repeats}`);
console.log(`  parse_fail: ${summary.totals.parse_fail}/${summary.repeats}`);
console.log(`  http_fail:  ${summary.totals.http_fail}/${summary.repeats}`);
console.log(`\n  by_category:`);
for (const [cat, count] of Object.entries(summary.totals.by_category)) {
  console.log(`    ${cat.padEnd(22)} ${count}`);
}
console.log(`\nResults written to: ${resultsDir}`);
