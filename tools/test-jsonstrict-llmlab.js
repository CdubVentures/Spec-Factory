#!/usr/bin/env node
// WHY: Sends the exact CEF colorFinder prompt through the LLM Lab to compare
// free-form (no schema) vs strict JSON mode. Proves whether response_format
// constrains discovery depth.
//
// Usage: node tools/test-jsonstrict-llmlab.js
//
// Requires LLM Lab running on localhost:5002 (Gemini channel).

import { buildColorEditionFinderPrompt } from '../src/features/color-edition/colorEditionLlmAdapter.js';
import { zodToLlmSchema } from '../src/core/llm/zodToLlmSchema.js';
import { colorEditionFinderResponseSchema } from '../src/features/color-edition/colorEditionSchema.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';

// ---------------------------------------------------------------------------
// Build the exact prompt CEF uses
// ---------------------------------------------------------------------------

// Minimal color palette (same atoms the real pipeline injects)
const TEST_COLORS = [
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

const systemPrompt = buildColorEditionFinderPrompt({
  colorNames: TEST_COLORS.map(c => c.name),
  colors: TEST_COLORS,
  product,
  previousRuns: [],
});

const userMessage = JSON.stringify({
  brand: product.brand,
  base_model: product.base_model,
  model: product.model,
  variant: product.variant,
});

const jsonSchema = zodToLlmSchema(colorEditionFinderResponseSchema);

// ---------------------------------------------------------------------------
// LLM Lab call helper
// ---------------------------------------------------------------------------

const LAB_URL = 'http://localhost:5001/v1/chat/completions';
const MODEL = 'gpt-5.4-xhigh';

async function callLab({ label, useSchema, useWebSearch }) {
  console.log(`\n${BOLD}${CYAN}── ${label} ──${RESET}`);
  console.log(`${DIM}  Model: ${MODEL}  |  Web search: ${useWebSearch}  |  JSON schema: ${useSchema ? 'YES (strict)' : 'NO (free-form)'}${RESET}`);

  const body = {
    model: MODEL,
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    stream: false,
    request_options: {
      web_search: useWebSearch,
      json_mode: useSchema,
    },
  };

  if (useSchema) {
    body.response_format = {
      type: 'json_schema',
      json_schema: {
        name: 'structured_output',
        strict: true,
        schema: jsonSchema,
      },
    };
  }

  const startMs = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 300_000); // 5 min timeout

  let res;
  try {
    res = await fetch(LAB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer key' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    console.log(`  ${BOLD}FETCH ERROR:${RESET} ${err.message}`);
    return null;
  }
  clearTimeout(timer);

  const durationMs = Date.now() - startMs;
  const text = await res.text();

  if (!res.ok) {
    console.log(`  ${BOLD}ERROR ${res.status}:${RESET} ${text.slice(0, 500)}`);
    return null;
  }

  let parsed;
  try { parsed = JSON.parse(text); } catch { console.log('  Failed to parse response JSON'); return null; }

  const content = parsed?.choices?.[0]?.message?.content || '';
  const usage = parsed?.usage || {};

  console.log(`  ${DIM}Duration: ${(durationMs / 1000).toFixed(1)}s  |  Tokens: ${usage.prompt_tokens || '?'}→${usage.completion_tokens || '?'}${RESET}`);

  // Try to extract JSON from the response
  let resultJson = null;
  try {
    resultJson = JSON.parse(content);
  } catch {
    // Try to find JSON in the text
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try { resultJson = JSON.parse(match[0]); } catch { /* no json */ }
    }
  }

  if (resultJson) {
    const colors = resultJson.colors || [];
    const editions = resultJson.editions || {};
    const editionNames = Object.keys(editions);
    const siblings = resultJson.siblings_excluded || [];
    const log = resultJson.discovery_log || {};

    console.log(`\n  ${GREEN}${BOLD}Colors found: ${colors.length}${RESET}`);
    for (const c of colors) console.log(`    • ${c}`);

    console.log(`  ${GREEN}${BOLD}Editions found: ${editionNames.length}${RESET}`);
    for (const e of editionNames) console.log(`    • ${e}: ${editions[e].display_name || ''}`);

    if (siblings.length > 0) {
      console.log(`  Siblings excluded: ${siblings.join(', ')}`);
    }
    console.log(`  URLs checked: ${(log.urls_checked || []).length}`);
    console.log(`  Queries run: ${(log.queries_run || []).length}`);
  } else {
    console.log(`\n  ${BOLD}Raw response (first 2000 chars):${RESET}`);
    console.log(content.slice(0, 2000));
  }

  return resultJson;
}

// ---------------------------------------------------------------------------
// Run both tests
// ---------------------------------------------------------------------------

console.log(`${BOLD}jsonStrict Comparison — LLM Lab Live Test${RESET}`);
console.log(`Product: ${product.brand} ${product.model}`);
console.log(`Prompt length: ${systemPrompt.length} chars`);

// Test A: Free-form with web search (what jsonStrict=false Phase 1 does)
const freeForm = await callLab({
  label: 'Test A: FREE-FORM + Web Search (no JSON schema)',
  useSchema: false,
  useWebSearch: true,
});

// Test B: Strict JSON with web search (what jsonStrict=true does)
const strict = await callLab({
  label: 'Test B: STRICT JSON + Web Search (response_format with schema)',
  useSchema: true,
  useWebSearch: true,
});

// ---------------------------------------------------------------------------
// Compare
// ---------------------------------------------------------------------------

console.log(`\n${BOLD}── Comparison ──${RESET}`);
const freeColors = freeForm?.colors?.length || 0;
const strictColors = strict?.colors?.length || 0;
const freeEditions = Object.keys(freeForm?.editions || {}).length;
const strictEditions = Object.keys(strict?.editions || {}).length;

console.log(`  Free-form:   ${freeColors} colors, ${freeEditions} editions`);
console.log(`  Strict JSON: ${strictColors} colors, ${strictEditions} editions`);

if (freeColors > strictColors || freeEditions > strictEditions) {
  console.log(`\n  ${BOLD}⚡ Strict JSON mode IS constraining discovery.${RESET}`);
  console.log(`  The jsonStrict=false two-phase flow should fix this.`);
} else if (freeColors === strictColors && freeEditions === strictEditions) {
  console.log(`\n  Both modes found the same results — strict mode is not the bottleneck here.`);
} else {
  console.log(`\n  Strict mode found MORE — unexpected. May need prompt tuning.`);
}

console.log();
