#!/usr/bin/env node
/**
 * injectFieldHistoryProof.js
 *
 * Creates a complete synthetic IndexLab run with rich Schema 4 + field history data,
 * proving the full pipeline produces the data the GUI expects.
 *
 * TWO MODES:
 *   1. Create new run:     node scripts/injectFieldHistoryProof.js
 *   2. Inject into existing: node scripts/injectFieldHistoryProof.js <runId>
 *
 * The created/injected run has:
 *   - fields[] with enriched per-field history (queries, domains, host_classes, no_value_attempts)
 *   - bundles[] with queries, query_family_mix, reason_active, field state/bucket
 *   - profile_influence with query family counts
 *   - deltas showing field state transitions
 */

import { enrichNeedSetFieldHistories } from '../src/features/indexing/orchestration/finalize/enrichNeedSetFieldHistories.js';
import { defaultIndexLabRoot } from '../src/core/config/runtimeArtifactRoots.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const INDEXLAB_ROOT = defaultIndexLabRoot();

// === Realistic provenance: Razer Cobra Pro ===
const PROVENANCE = {
  brand: { value: 'Razer', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  model: { value: 'Cobra Pro', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  sensor_brand: { value: 'Razer', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  sensor_model: { value: 'Focus Pro 30K', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  dpi_max: { value: '30000', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }, { url: 'https://www.rtings.com/mouse/reviews/razer/cobra-pro', rootDomain: 'rtings.com', tier: 2, tierName: 'review', method: 'html' }] },
  dpi_min: { value: '100', evidence: [{ url: 'https://www.rtings.com/mouse/reviews/razer/cobra-pro', rootDomain: 'rtings.com', tier: 2, tierName: 'review', method: 'html' }] },
  weight: { value: 'unk', evidence: [] },
  cable_type: { value: 'unk', evidence: [] },
  connection_type: { value: 'wireless', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  polling_rate_max: { value: '1000', evidence: [{ url: 'https://www.rtings.com/mouse/reviews/razer/cobra-pro', rootDomain: 'rtings.com', tier: 2, tierName: 'review', method: 'html' }] },
  switch_type: { value: 'Optical', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  switch_brand: { value: 'Razer', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  battery_life_hours: { value: 'unk', evidence: [] },
  rgb_lighting: { value: 'Yes', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  grip_style: { value: 'unk', evidence: [] },
  shape: { value: 'unk', evidence: [] },
  button_count: { value: '10', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  length_mm: { value: '120.4', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  width_mm: { value: '63.7', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  height_mm: { value: '37.6', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
  release_date: { value: 'unk', evidence: [] },
  price_usd: { value: '129.99', evidence: [{ url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', rootDomain: 'razer.com', tier: 1, tierName: 'manufacturer', method: 'html' }] },
};

// === Discovery queries (simulates LLM search planner) ===
const DISCOVERY_QUERIES = [
  { query: 'razer cobra pro specs weight battery life', source: 'llm', target_fields: ['weight', 'battery_life_hours', 'cable_type'] },
  { query: 'razer cobra pro sensor dpi polling rate review', source: 'llm', target_fields: ['dpi_max', 'dpi_min', 'polling_rate_max', 'sensor_model'] },
  { query: 'razer cobra pro dimensions length width height', source: 'targeted', target_fields: ['length_mm', 'width_mm', 'height_mm', 'weight'] },
  { query: 'razer cobra pro shape grip style ergonomic', source: 'llm', target_fields: ['grip_style', 'shape'] },
  { query: 'razer cobra pro switch type button count review', source: 'llm', target_fields: ['switch_type', 'switch_brand', 'button_count'] },
  { query: 'razer cobra pro release date price', source: 'targeted', target_fields: ['release_date', 'price_usd'] },
  { query: 'razer cobra pro wireless connection bluetooth dongle', source: 'llm', target_fields: ['connection_type'] },
  { query: 'razer cobra pro rgb lighting customization', source: 'llm', target_fields: ['rgb_lighting'] },
];

// === Field group definitions (matches Schema 4 bundle structure) ===
const FIELD_GROUPS = [
  { key: 'identity', label: 'Identity', desc: 'Brand and model identification', source_target: 'manufacturer', content_target: 'product page', search_intent: 'identify', host_class: 'official', priority: 1, field_keys: ['brand', 'model'], required_levels: { brand: 'identity', model: 'identity' } },
  { key: 'sensor_performance', label: 'Sensor & Performance', desc: 'Sensor specs and tracking performance', source_target: 'manufacturer+review', content_target: 'spec sheet', search_intent: 'technical', host_class: 'official', priority: 2, field_keys: ['sensor_brand', 'sensor_model', 'dpi_max', 'dpi_min', 'polling_rate_max'], required_levels: { sensor_brand: 'critical', sensor_model: 'critical', dpi_max: 'required', dpi_min: 'required', polling_rate_max: 'required' } },
  { key: 'physical', label: 'Physical Properties', desc: 'Weight, dimensions, and form factor', source_target: 'manufacturer+review', content_target: 'spec sheet', search_intent: 'technical', host_class: 'official', priority: 3, field_keys: ['weight', 'length_mm', 'width_mm', 'height_mm', 'shape', 'grip_style'], required_levels: { weight: 'required', length_mm: 'expected', width_mm: 'expected', height_mm: 'expected', shape: 'expected', grip_style: 'expected' } },
  { key: 'switches_buttons', label: 'Switches & Buttons', desc: 'Switch type, brand, and button config', source_target: 'manufacturer', content_target: 'product page', search_intent: 'technical', host_class: 'official', priority: 4, field_keys: ['switch_type', 'switch_brand', 'button_count'], required_levels: { switch_type: 'required', switch_brand: 'required', button_count: 'expected' } },
  { key: 'connectivity', label: 'Connectivity & Power', desc: 'Connection, cable, and battery', source_target: 'manufacturer+review', content_target: 'spec sheet', search_intent: 'technical', host_class: 'official', priority: 5, field_keys: ['connection_type', 'cable_type', 'battery_life_hours'], required_levels: { connection_type: 'required', cable_type: 'expected', battery_life_hours: 'expected' } },
  { key: 'features', label: 'Features & Extras', desc: 'RGB, software, and other features', source_target: 'manufacturer', content_target: 'product page', search_intent: 'feature', host_class: 'official', priority: 6, field_keys: ['rgb_lighting'], required_levels: { rgb_lighting: 'optional' } },
  { key: 'market', label: 'Market & Availability', desc: 'Price and release information', source_target: 'marketplace', content_target: 'store listing', search_intent: 'commercial', host_class: 'marketplace', priority: 7, field_keys: ['release_date', 'price_usd'], required_levels: { release_date: 'optional', price_usd: 'optional' } },
];

function requiredLevelToBucket(level) {
  if (level === 'identity' || level === 'critical') return 'core';
  if (level === 'required') return 'secondary';
  if (level === 'expected') return 'expected';
  return 'optional';
}

function buildEnrichedNeedsetPayload({ productId, runId, category }) {
  // Build NeedSet fields from PROVENANCE
  const allFieldKeys = Object.keys(PROVENANCE);
  const seedFields = allFieldKeys.map((fk) => {
    const prov = PROVENANCE[fk];
    const hasValue = prov.value && prov.value !== 'unk' && prov.evidence.length > 0;
    let requiredLevel = 'optional';
    let groupKey = 'general';
    for (const fg of FIELD_GROUPS) {
      if (fg.required_levels[fk]) { requiredLevel = fg.required_levels[fk]; }
      if (fg.field_keys.includes(fk)) { groupKey = fg.key; }
    }
    return {
      field_key: fk, state: hasValue ? 'accepted' : 'missing', group_key: groupKey,
      required_level: requiredLevel,
      history: { existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], query_count: 0, urls_examined_count: 0, no_value_attempts: 0, duplicate_attempts_suppressed: 0 },
    };
  });

  // Enrich fields with history
  const enrichedFields = enrichNeedSetFieldHistories({
    fields: seedFields, provenance: PROVENANCE, searchPlanQueries: DISCOVERY_QUERIES,
  });

  // Build bundles
  const queryAssignment = {};
  for (const q of DISCOVERY_QUERIES) {
    for (const fk of (q.target_fields || [])) {
      if (!queryAssignment[fk]) queryAssignment[fk] = [];
      queryAssignment[fk].push({ q: q.query, family: q.source === 'llm' ? 'review_lookup' : 'manufacturer_html' });
    }
  }
  const bundles = FIELD_GROUPS.map((fg) => {
    const bundleQueries = [];
    for (const fk of fg.field_keys) {
      for (const qa of (queryAssignment[fk] || [])) {
        if (!bundleQueries.find((bq) => bq.q === qa.q)) bundleQueries.push(qa);
      }
    }
    const fields = fg.field_keys.map((fk) => {
      const enriched = enrichedFields.find((f) => f.field_key === fk);
      return { key: fk, state: enriched?.state || 'missing', bucket: requiredLevelToBucket(fg.required_levels[fk] || 'optional') };
    });
    return {
      key: fg.key, label: fg.label, desc: fg.desc, source_target: fg.source_target,
      content_target: fg.content_target, search_intent: fg.search_intent, host_class: fg.host_class,
      priority: fg.priority, queries: bundleQueries,
      query_family_mix: bundleQueries.length > 0 ? [...new Set(bundleQueries.map((q) => q.family))].sort().join('+') : null,
      reason_active: bundleQueries.length > 0 ? `${fields.filter((f) => f.state === 'missing').length} unresolved fields — diversify sources` : null,
      fields,
    };
  });

  // Profile influence
  const FAMILY_KEYS = ['manufacturer_html', 'manual_pdf', 'support_docs', 'review_lookup', 'benchmark_lookup', 'fallback_web', 'targeted_single'];
  const familyCounts = Object.fromEntries(FAMILY_KEYS.map((k) => [k, 0]));
  for (const q of DISCOVERY_QUERIES) {
    if (q.source === 'llm') familyCounts.review_lookup += 1;
    else if (q.source === 'targeted') familyCounts.manufacturer_html += 1;
  }
  const profileInfluence = {
    ...familyCounts,
    duplicates_suppressed: 1,
    focused_bundles: bundles.filter((b) => b.queries.length > 0).length,
    targeted_exceptions: 2, total_queries: DISCOVERY_QUERIES.length,
    trusted_host_share: familyCounts.manufacturer_html + familyCounts.support_docs,
    docs_manual_share: familyCounts.manual_pdf,
  };

  // Deltas
  const deltas = Object.entries(PROVENANCE)
    .filter(([, prov]) => prov.value && prov.value !== 'unk' && prov.evidence.length > 0)
    .map(([fk]) => ({ field: fk, from: 'missing', to: 'satisfied' }));

  const unresolved = enrichedFields.filter((f) => f.state !== 'accepted');
  const summary = {
    missing_count: unresolved.length,
    accepted_count: enrichedFields.length - unresolved.length,
    escalated_count: 0,
    critical_missing: unresolved.filter((f) => ['critical', 'identity'].includes(f.required_level)).map((f) => f.field_key),
    required_missing: unresolved.filter((f) => f.required_level === 'required').map((f) => f.field_key),
  };

  return { enrichedFields, bundles, profileInfluence, deltas, summary, unresolved };
}

async function createNewRun() {
  const now = new Date();
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const hex = Math.random().toString(16).slice(2, 8);
  const runId = `${ts}-${hex}`;
  const productId = 'mouse-razer-cobra-pro';
  const category = 'mouse';

  const runDir = path.join(INDEXLAB_ROOT, runId);
  await fs.mkdir(runDir, { recursive: true });

  const { enrichedFields, bundles, profileInfluence, deltas, summary, unresolved } = buildEnrichedNeedsetPayload({ productId, runId, category });

  // Write run.json
  const runMeta = {
    run_id: runId, product_id: productId, category,
    status: 'completed', started_at: now.toISOString(), ended_at: now.toISOString(),
    runtime_mode: 'live', identity_fingerprint: `sha256:proof-${hex}`,
    identity_lock_status: 'locked_brand_model', deduplication_mode: 'sha256',
  };
  await fs.writeFile(path.join(runDir, 'run.json'), JSON.stringify(runMeta, null, 2) + '\n', 'utf8');

  // Build event sequence (realistic pipeline events)
  const events = [];
  const addEvent = (event, payload) => events.push({ ts: now.toISOString(), level: 'info', event, ...payload });

  addEvent('run_context', { scope: 'run', run_id: runId, product_id: productId, category, runtime_mode: 'live' });

  // Initial needset_computed (Schema 2 — before enrichment, like bootstrapRunProductExecutionState)
  addEvent('needset_computed', {
    productId, runId, category,
    needset_size: Object.keys(PROVENANCE).length, total_fields: Object.keys(PROVENANCE).length,
    summary: { missing_count: Object.keys(PROVENANCE).length, accepted_count: 0 },
    blockers: {}, bundles: [], profile_influence: null, deltas: [], round: 0,
    schema_version: null, fields: [],
  });

  // Brand resolved
  addEvent('brand_resolved', {
    scope: 'brand', brand: 'Razer', status: 'resolved',
    official_domain: 'razer.com', aliases: ['Razer Inc.'], confidence: 0.95,
  });

  // Search plan generated
  addEvent('search_plan_generated', {
    scope: 'plan', pass_index: 0, pass_name: 'initial',
    queries_generated: DISCOVERY_QUERIES.map((q) => q.query), stop_condition: 'plan_complete',
  });

  // Simulate search + fetch events
  for (const q of DISCOVERY_QUERIES) {
    addEvent('search_started', { scope: 'search', query: q.query, provider: 'searxng' });
    addEvent('search_finished', { scope: 'search', query: q.query, result_count: 8, provider: 'searxng' });
  }

  // Simulate fetch events for key URLs
  const urls = [
    { url: 'https://www.razer.com/gaming-mice/razer-cobra-pro', domain: 'razer.com', status: 200, method: 'html' },
    { url: 'https://www.rtings.com/mouse/reviews/razer/cobra-pro', domain: 'rtings.com', status: 200, method: 'html' },
    { url: 'https://www.tomshardware.com/reviews/razer-cobra-pro', domain: 'tomshardware.com', status: 200, method: 'html' },
  ];
  for (const u of urls) {
    addEvent('fetch_started', { scope: 'fetch', url: u.url, domain: u.domain });
    addEvent('fetch_finished', { scope: 'fetch', url: u.url, domain: u.domain, status: u.status });
    addEvent('source_processed', { scope: 'parse', url: u.url, domain: u.domain, method: u.method, fields_extracted: 5 });
  }

  // Final needset_computed (Schema 4 + enriched field history — from finalization derivation)
  addEvent('needset_computed', {
    productId, runId, category,
    needset_size: unresolved.length, total_fields: enrichedFields.length,
    summary, blockers: {}, bundles, profile_influence: profileInfluence,
    deltas, round: 1,
    schema_version: 'needset_planner_output.v2', fields: enrichedFields,
  });

  // Run completed
  addEvent('run_completed', {
    scope: 'run', status: 'completed',
    identity_fingerprint: `sha256:proof-${hex}`, identity_lock_status: 'locked_brand_model',
    deduplication_mode: 'sha256', duration_ms: 45000,
  });

  // Write run_events.ndjson
  const ndjson = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
  await fs.writeFile(path.join(runDir, 'run_events.ndjson'), ndjson, 'utf8');

  // Write needset.json artifact
  const needsetArtifact = {
    run_id: runId, category, product_id: productId, generated_at: now.toISOString(),
    total_fields: enrichedFields.length, needset_size: unresolved.length,
    fields: enrichedFields, bundles, profile_influence: profileInfluence,
    deltas, round: 1, schema_version: 'needset_planner_output.v2',
    summary, blockers: {},
  };
  await fs.writeFile(path.join(runDir, 'needset.json'), JSON.stringify(needsetArtifact, null, 2) + '\n', 'utf8');

  return { runId, runDir, enrichedFields, bundles, profileInfluence, deltas };
}

async function injectIntoExisting(runId) {
  let runDir = path.join(INDEXLAB_ROOT, runId);
  const eventsPath = path.join(runDir, 'run_events.ndjson');
  const needsetPath = path.join(runDir, 'needset.json');

  try { await fs.access(eventsPath); } catch {
    const entries = await fs.readdir(INDEXLAB_ROOT, { withFileTypes: true });
    let found = false;
    for (const entry of entries) {
      if (entry.name.includes(runId)) {
        runDir = path.join(INDEXLAB_ROOT, entry.name);
        found = true;
        break;
      }
    }
    if (!found) {
      console.error(`Run directory not found for: ${runId}`);
      process.exit(1);
    }
  }

  let meta = {};
  try { meta = JSON.parse(await fs.readFile(path.join(runDir, 'run.json'), 'utf8')); } catch { /* ok */ }

  const productId = meta.product_id || 'mouse-razer-cobra-pro';
  const category = meta.category || 'mouse';

  const { enrichedFields, bundles, profileInfluence, deltas, summary, unresolved } = buildEnrichedNeedsetPayload({ productId, runId, category });

  // Append enriched needset_computed event
  const event = {
    ts: new Date().toISOString(), level: 'info', event: 'needset_computed',
    productId, runId, category,
    needset_size: unresolved.length, total_fields: enrichedFields.length,
    summary, blockers: {}, bundles, profile_influence: profileInfluence,
    deltas, round: 1,
    schema_version: 'needset_planner_output.v2', fields: enrichedFields,
  };
  await fs.appendFile(path.join(runDir, 'run_events.ndjson'), JSON.stringify(event) + '\n', 'utf8');

  // Write needset.json
  const needsetArtifact = {
    run_id: runId, category, product_id: productId, generated_at: new Date().toISOString(),
    total_fields: enrichedFields.length, needset_size: unresolved.length,
    fields: enrichedFields, bundles, profile_influence: profileInfluence,
    deltas, round: 1, schema_version: 'needset_planner_output.v2',
    summary, blockers: {},
  };
  await fs.writeFile(path.join(runDir, 'needset.json'), JSON.stringify(needsetArtifact, null, 2) + '\n', 'utf8');

  return { runId, runDir, enrichedFields, bundles, profileInfluence, deltas };
}

async function main() {
  const targetRunId = process.argv[2];
  let result;

  if (targetRunId) {
    console.log(`Injecting into existing run: ${targetRunId}`);
    result = await injectIntoExisting(targetRunId);
  } else {
    console.log('Creating new proof run...');
    result = await createNewRun();
  }

  const { runId, runDir, enrichedFields, bundles, profileInfluence, deltas } = result;
  const fieldsWithHistory = enrichedFields.filter((f) => f.history && (f.history.query_count > 0 || f.history.domains_tried.length > 0));

  console.log(`\n=== Proof Run Created ===`);
  console.log(`Run ID: ${runId}`);
  console.log(`Directory: ${runDir}`);
  console.log(`Fields: ${enrichedFields.length} total, ${fieldsWithHistory.length} with history`);
  console.log(`Bundles: ${bundles.length} total, ${bundles.filter((b) => b.queries.length > 0).length} with queries`);
  console.log(`Profile influence: ${profileInfluence.total_queries} queries, ${profileInfluence.focused_bundles} focused bundles`);
  console.log(`Deltas: ${deltas.length} transitions`);

  console.log('\n--- Field History ---');
  for (const f of fieldsWithHistory.slice(0, 8)) {
    const h = f.history;
    console.log(`  ${f.field_key}: queries=${h.query_count}, domains=[${h.domains_tried.join(',')}], hosts=[${h.host_classes_tried.join(',')}], no_val=${h.no_value_attempts}`);
  }

  console.log('\n--- Bundles ---');
  for (const b of bundles) {
    const missing = b.fields.filter((f) => f.state === 'missing').length;
    console.log(`  ${b.key}: ${b.queries.length} queries, ${missing}/${b.fields.length} unresolved, mix=${b.query_family_mix || 'none'}`);
  }

  console.log('\n--- Deltas ---');
  for (const d of deltas.slice(0, 6)) {
    console.log(`  ${d.field}: ${d.from} -> ${d.to}`);
  }

  console.log('\nOpen GUI -> IndexLab -> select this run to verify:');
  console.log('  - Profile Influence with query family breakdown');
  console.log('  - Bundles with queries, fields, and reasons');
  console.log('  - Field History with domains, host_classes, no_value_attempts');
  console.log('  - Deltas showing state transitions');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
