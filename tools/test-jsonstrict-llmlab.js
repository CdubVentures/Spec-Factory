#!/usr/bin/env node
// WHY: Live diagnostic — tests the Color Edition Finder through the real
// Spec Factory → LLM Lab → ChatGPT pipeline. Compares jsonStrict on vs off
// and direct HTTP to prove editions are found after the system-prompt fix.
//
// Usage:
//   node tools/test-jsonstrict-llmlab.js [mode]
//
// Modes:
//   diag            — Payload trace only (no LLM call)
//   pipeline        — callLlmWithRouting, jsonStrict=false (two-phase)
//   pipeline-strict — callLlmWithRouting, jsonStrict=true
//   direct          — Direct HTTP to LLM Lab, streaming, system+user
//   compare         — Run pipeline (free) then pipeline-strict sequentially
//   all             — Run pipeline + pipeline-strict + direct
//
// Requires: LLM Lab running on localhost:5001, .workspace/db/app.sqlite.

import http from 'node:http';
import { resolvePhaseOverrides } from '../src/core/config/configPostMerge.js';
import { callLlmWithRouting } from '../src/core/llm/client/routing.js';
import { buildColorEditionFinderPrompt } from '../src/features/color-edition/colorEditionLlmAdapter.js';
import { zodToLlmSchema } from '../src/core/llm/zodToLlmSchema.js';
import { colorEditionFinderResponseSchema } from '../src/features/color-edition/colorEditionSchema.js';
import { loadConfig } from '../src/core/config/configOrchestrator.js';
import { buildRegistryLookup } from '../src/core/llm/routeResolver.js';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// Terminal formatting
// ---------------------------------------------------------------------------
const B = '\x1b[1m', D = '\x1b[2m', R = '\x1b[0m';
const G = '\x1b[32m', RD = '\x1b[31m', C = '\x1b[36m', Y = '\x1b[33m';

const header = (m) => console.log(`\n${B}${C}══ ${m} ══${R}`);
const sub    = (m) => console.log(`\n${B}── ${m} ──${R}`);
const ok     = (m) => console.log(`  ${G}✓ ${m}${R}`);
const bad    = (m) => console.log(`  ${RD}✗ ${m}${R}`);
const note   = (m) => console.log(`  ${Y}→ ${m}${R}`);

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function buildConfig(jsonStrictOverride) {
  const config = loadConfig();
  const db = new Database('.workspace/db/app.sqlite', { readonly: true });
  for (const { key, value } of db.prepare('SELECT key,value FROM settings').all()) {
    if (value != null) config[key] = value;
  }
  db.close();
  const ov = JSON.parse(config.llmPhaseOverridesJson || '{}');
  ov.colorFinder = ov.colorFinder || {};
  ov.colorFinder.jsonStrict = jsonStrictOverride;
  config.llmPhaseOverridesJson = JSON.stringify(ov);
  config._registryLookup = buildRegistryLookup(config.llmProviderRegistryJson);
  resolvePhaseOverrides(config);
  return config;
}

// ---------------------------------------------------------------------------
// Prompt + schema
// ---------------------------------------------------------------------------

const COLORS = [
  { name: 'amber', hex: '#f59e0b' }, { name: 'beige', hex: '#f5f5f4' },
  { name: 'black', hex: '#3A3F41' }, { name: 'blue', hex: '#3b82f6' },
  { name: 'brown', hex: '#8b4513' }, { name: 'coral', hex: '#fb7185' },
  { name: 'cyan', hex: '#06b6d4' }, { name: 'dark-blue', hex: '#1d4ed8' },
  { name: 'dark-gray', hex: '#374151' }, { name: 'dark-green', hex: '#15803d' },
  { name: 'dark-red', hex: '#b91c1c' }, { name: 'emerald', hex: '#10b981' },
  { name: 'fuchsia', hex: '#c026d3' }, { name: 'gold', hex: '#eab308' },
  { name: 'gray', hex: '#586062' }, { name: 'green', hex: '#22c55e' },
  { name: 'indigo', hex: '#6366f1' }, { name: 'ivory', hex: '#fafaf9' },
  { name: 'lavender', hex: '#a78bfa' }, { name: 'light-blue', hex: '#60a5fa' },
  { name: 'light-gray', hex: '#6b7280' }, { name: 'lime', hex: '#84cc16' },
  { name: 'navy', hex: '#1e3a8a' }, { name: 'olive', hex: '#a16207' },
  { name: 'orange', hex: '#f97316' }, { name: 'pink', hex: '#ec4899' },
  { name: 'purple', hex: '#a855f7' }, { name: 'red', hex: '#ef4444' },
  { name: 'rose', hex: '#f43f5e' }, { name: 'silver', hex: '#cbd5e1' },
  { name: 'sky', hex: '#0ea5e9' }, { name: 'slate', hex: '#64748b' },
  { name: 'teal', hex: '#14b8a6' }, { name: 'violet', hex: '#8b5cf6' },
  { name: 'white', hex: '#ffffff' }, { name: 'yellow', hex: '#ffd83a' },
];

const product = { brand: 'Corsair', base_model: '', model: 'M75 Wireless', variant: 'Wireless' };

const sysPrompt = buildColorEditionFinderPrompt({
  colorNames: COLORS.map(c => c.name), colors: COLORS, product, previousRuns: [],
});

const userMsg = JSON.stringify({
  brand: product.brand, base_model: product.base_model,
  model: product.model, variant: product.variant,
});

const schema = zodToLlmSchema(colorEditionFinderResponseSchema);

// ---------------------------------------------------------------------------
// Result display
// ---------------------------------------------------------------------------

function showResult(result) {
  if (!result || typeof result !== 'object') {
    if (typeof result === 'string') console.log(`  ${result.slice(0, 1500)}`);
    return { colors: 0, editions: 0 };
  }
  const colors = result.colors || [];
  const editions = result.editions || {};
  const eNames = Object.keys(editions);

  console.log(`  ${G}${B}Colors: ${colors.length}${R}  ${colors.join(', ')}`);

  const eClr = eNames.length > 0 ? G : RD;
  console.log(`  ${eClr}${B}Editions: ${eNames.length}${R}`);
  for (const e of eNames) console.log(`    • ${e}: ${editions[e]?.display_name || ''}`);

  const dl = result.discovery_log || {};
  console.log(`  ${D}URLs: ${(dl.urls_checked || []).length} | Queries: ${(dl.queries_run || []).length}${R}`);
  return { colors: colors.length, editions: eNames.length };
}

function tryParseJson(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch { /* */ }
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (m?.[1]) try { return JSON.parse(m[1].trim()); } catch { /* */ }
  const idx = s.indexOf('{');
  if (idx < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = idx; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') { inStr = true; continue; }
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) { try { return JSON.parse(s.slice(idx, i + 1)); } catch { return null; } } }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Test A: Through callLlmWithRouting (the real Spec Factory pipeline)
// ---------------------------------------------------------------------------

async function testPipeline(label, jsonStrict) {
  header(label);
  const config = buildConfig(jsonStrict);
  const model = config._resolvedColorFinderReasoningModel
    || config._resolvedColorFinderBaseModel
    || config.llmModelPlan;
  const webSearch = config._resolvedColorFinderWebSearch;
  const writerModel = config._resolvedColorFinderWriterModel || '(primary)';
  console.log(`  ${D}model: ${model} | jsonStrict: ${jsonStrict} | webSearch: ${webSearch} | writer: ${writerModel}${R}`);

  const logs = [];
  const t0 = Date.now();
  try {
    const result = await callLlmWithRouting({
      config, phase: 'colorFinder', reason: 'color_edition_finding', role: 'triage',
      system: sysPrompt, user: userMsg, jsonSchema: schema, timeoutMs: 600_000,
      logger: { info(e, d) { logs.push({ e, ...d }); }, warn(e, d) { logs.push({ e, ...d }); } },
    });
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ${D}Duration: ${dur}s${R}`);
    const rl = logs.find(l => l.e === 'llm_route_selected');
    if (rl) console.log(`  ${D}Route: ${rl.model} via ${rl.provider} | two_phase=${rl.two_phase_writer}${R}`);

    // Show any response preview from logs
    const completedLog = logs.find(l => l.e === 'llm_call_completed' && l.response_preview);
    if (completedLog?.response_preview) {
      const preview = completedLog.response_preview;
      const mentionsEdition = /edition/i.test(preview);
      const mentionsWitcher = /witcher/i.test(preview);
      const mentionsCyberpunk = /cyberpunk/i.test(preview);
      console.log(`  ${D}Raw mentions: edition=${mentionsEdition} witcher=${mentionsWitcher} cyberpunk=${mentionsCyberpunk}${R}`);
    }

    return { ...showResult(result), raw: null };
  } catch (err) {
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    bad(`ERROR after ${dur}s: ${err.message}`);
    for (const l of logs.filter(l => l.e?.includes('fallback') || l.e?.includes('failed'))) {
      console.log(`  ${D}log: ${l.e} — ${l.message || ''}${R}`);
    }
    return { colors: 0, editions: 0, raw: null };
  }
}

// ---------------------------------------------------------------------------
// Test B: Direct HTTP to LLM Lab via node:http (fetch drops SSE on long waits)
// ---------------------------------------------------------------------------

function httpPost(url, body) {
  // WHY: Node fetch() drops long-lived SSE connections during reasoning.
  // Raw http.request with disabled socket timeout survives 5+ min streams.
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = JSON.stringify(body);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer session',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      // WHY: Disable socket timeout — reasoning can take 5+ minutes with no data.
      res.socket.setTimeout(0);
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') }));
      res.on('error', reject);
    });
    req.socket?.setTimeout?.(0);
    req.setTimeout(600_000, () => { req.destroy(new Error('Request timeout (600s)')); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function extractSseContent(text) {
  const parts = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
    try {
      const evt = JSON.parse(line.slice(6));
      const d = evt?.choices?.[0]?.delta?.content;
      if (d) parts.push(d);
    } catch { /* skip */ }
  }
  return parts.join('');
}

async function testDirect(label, { messages, model = 'gpt-5.4-xhigh', webSearch = true, reasoningEffort = 'xhigh' } = {}) {
  header(label);

  const body = {
    model,
    temperature: 0,
    messages,
    request_options: {
      web_search: webSearch,
      reasoning_effort: reasoningEffort,
    },
    // WHY: stream: true — fetch handles SSE fine for requests under ~5 min.
    // For xhigh reasoning (can take 7+ min), increase AbortSignal timeout.
    stream: true,
  };

  console.log(`  ${D}model: ${model} | msgs: ${messages.length} | msg[0].role: ${messages[0].role}${R}`);
  console.log(`  ${D}web_search: ${webSearch} | reasoning: ${reasoningEffort}${R}`);

  const t0 = Date.now();
  try {
    const resp = await fetch('http://localhost:5001/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer session' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(900_000), // 15 min — xhigh can take 7+
    });

    if (!resp.ok) {
      const errText = await resp.text();
      const dur = ((Date.now() - t0) / 1000).toFixed(1);
      bad(`HTTP ${resp.status} after ${dur}s: ${errText.slice(0, 300)}`);
      return { colors: 0, editions: 0, raw: errText };
    }

    const respBody = await resp.text();
    const dur = ((Date.now() - t0) / 1000).toFixed(1);

    if (resp.status >= 400) {
      bad(`HTTP ${resp.status} after ${dur}s: ${respBody.slice(0, 300)}`);
      return { colors: 0, editions: 0, raw: respBody };
    }

    const content = extractSseContent(respBody);
    console.log(`  ${D}Duration: ${dur}s | Response: ${content.length} chars${R}`);

    if (!content) { bad('Empty response content'); return { colors: 0, editions: 0, raw: '' }; }

    const mentionsEdition = /edition/i.test(content);
    const mentionsWitcher = /witcher/i.test(content);
    const mentionsCyberpunk = /cyberpunk/i.test(content);
    const mentionsCod = /call of duty|black ops/i.test(content);
    console.log(`  ${D}Raw mentions: edition=${mentionsEdition} witcher=${mentionsWitcher} cyberpunk=${mentionsCyberpunk} cod=${mentionsCod}${R}`);

    const parsed = tryParseJson(content);
    if (parsed) {
      return { ...showResult(parsed), raw: content };
    }

    sub('Raw response (first 2000 chars)');
    console.log(content.slice(0, 2000));
    return { colors: 0, editions: 0, raw: content };
  } catch (err) {
    const dur = ((Date.now() - t0) / 1000).toFixed(1);
    bad(`ERROR after ${dur}s: ${err.message}`);
    return { colors: 0, editions: 0, raw: null };
  }
}

// ---------------------------------------------------------------------------
// Diagnostic (no LLM call)
// ---------------------------------------------------------------------------

function runDiag() {
  header('PAYLOAD TRACE — Spec Factory → LLM Lab → ChatGPT Responses API');

  const config = buildConfig(false);
  const ov = JSON.parse(config.llmPhaseOverridesJson || '{}').colorFinder || {};

  sub('Phase config');
  for (const [k, v] of Object.entries(ov)) console.log(`  ${k}: ${JSON.stringify(v)}`);

  sub('What Spec Factory sends to LLM Lab (HTTP body)');
  console.log(`  model: "gpt-5.4-xhigh"`);
  console.log(`  messages[0]: { role: "system", content: <CEF prompt, ${sysPrompt.length} chars> }`);
  console.log(`  messages[1]: { role: "user", content: <product JSON, ${userMsg.length} chars> }`);
  console.log(`  request_options: { web_search: true, reasoning_effort: "high" }`);

  sub('What LLM Lab does (after fix)');
  console.log(`  1. normalize_model_name("gpt-5.4-xhigh") → "gpt-5.4"`);
  console.log(`  2. extract_reasoning_from_model_name → { effort: "xhigh" }`);
  console.log(`  3. ${G}System message extracted → used as Responses API "instructions"${R}`);
  console.log(`  4. convert_chat_messages_to_responses_input (user message only)`);
  console.log(`  5. web_search=true → adds { type: "web_search" } tool  ✓`);
  console.log(`  6. reasoning → { effort: "xhigh", summary: "auto" }  ✓`);

  sub('What ChatGPT Responses API receives (after fix)');
  console.log(`  ${G}instructions${R}: "${sysPrompt.slice(0, 80)}..."`);
  console.log(`  ${G}input[0]${R}: { user, '{"brand":"Corsair","model":"M75 Wireless",...}' }`);
  console.log(`  ${G}tools${R}: [{ type: "web_search" }]  ✓`);
  console.log(`  ${G}reasoning${R}: { effort: "xhigh" }  ✓`);

  sub('Behavior per provider');
  console.log(`  ${G}OpenAI${R}: system msg → instructions field (FIXED — was overridden by prompt.md)`);
  console.log(`  ${G}Gemini${R}: system msg preserved in build_prompt_from_messages (already correct)`);
  console.log(`  ${G}Claude${R}: system msg preserved in build_prompt_from_messages (already correct)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const mode = process.argv[2] || 'diag';

console.log(`${B}CEF LLM Lab Test — ${product.brand} ${product.model}${R}`);
console.log(`Mode: ${mode}\n`);

const allResults = [];

if (mode === 'diag') {
  runDiag();
}

if (mode === 'pipeline') {
  const r = await testPipeline('PIPELINE jsonStrict=false (two-phase: research → writer)', false);
  allResults.push({ label: 'pipeline free', ...r });
}

if (mode === 'pipeline-strict') {
  const r = await testPipeline('PIPELINE jsonStrict=true (single call with schema)', true);
  allResults.push({ label: 'pipeline strict', ...r });
}

if (mode === 'direct') {
  const r = await testDirect('DIRECT HTTP — system + user, streaming', {
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userMsg },
    ],
  });
  allResults.push({ label: 'direct', ...r });
}

if (mode === 'compare') {
  console.log(`${Y}Running jsonStrict=false then jsonStrict=true sequentially...${R}`);
  const r1 = await testPipeline('TEST 1/2 — PIPELINE jsonStrict=false (two-phase)', false);
  allResults.push({ label: 'pipeline free', ...r1 });
  const r2 = await testPipeline('TEST 2/2 — PIPELINE jsonStrict=true (single call)', true);
  allResults.push({ label: 'pipeline strict', ...r2 });
}

if (mode === 'all') {
  const r1 = await testPipeline('TEST 1/3 — PIPELINE jsonStrict=false', false);
  allResults.push({ label: 'pipeline free', ...r1 });
  const r2 = await testPipeline('TEST 2/3 — PIPELINE jsonStrict=true', true);
  allResults.push({ label: 'pipeline strict', ...r2 });
  const r3 = await testDirect('TEST 3/3 — DIRECT HTTP streaming', {
    messages: [
      { role: 'system', content: sysPrompt },
      { role: 'user', content: userMsg },
    ],
  });
  allResults.push({ label: 'direct', ...r3 });
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (allResults.length > 0) {
  header('RESULTS');
  for (const { label, colors, editions } of allResults) {
    const eClr = editions > 0 ? G : RD;
    console.log(`  ${label.padEnd(22)} → ${colors} colors, ${eClr}${B}${editions} editions${R}`);
  }

  const anyEditions = allResults.some(r => r.editions > 0);
  if (anyEditions) {
    const best = allResults.reduce((a, b) => (b.editions > a.editions ? b : a));
    console.log(`\n  ${G}${B}Best: "${best.label}" — ${best.editions} editions${R}`);
  } else {
    console.log(`\n  ${RD}${B}No editions found in any test.${R}`);
    console.log(`  ${Y}Check: is LLM Lab restarted with the system-prompt fix?${R}`);
    console.log(`  ${Y}Check: is web search actually being used? (look for urls_checked > 0)${R}`);
  }
}

console.log();
