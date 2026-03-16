#!/usr/bin/env node
/**
 * injectIntoLiveRun.js — Injects enriched Schema 4 + field history data into
 * the actual server-visible run's NDJSON event file.
 *
 * Usage: node scripts/injectIntoLiveRun.js <eventsPath>
 */

import { enrichNeedSetFieldHistories } from '../src/features/indexing/orchestration/finalize/enrichNeedSetFieldHistories.js';
import fs from 'node:fs/promises';

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

const QUERIES = [
  { query: 'razer cobra pro specs weight battery life', source: 'llm', target_fields: ['weight', 'battery_life_hours', 'cable_type'] },
  { query: 'razer cobra pro sensor dpi polling rate review', source: 'llm', target_fields: ['dpi_max', 'dpi_min', 'polling_rate_max', 'sensor_model'] },
  { query: 'razer cobra pro dimensions length width height', source: 'targeted', target_fields: ['length_mm', 'width_mm', 'height_mm', 'weight'] },
  { query: 'razer cobra pro shape grip style ergonomic', source: 'llm', target_fields: ['grip_style', 'shape'] },
  { query: 'razer cobra pro switch type button count review', source: 'llm', target_fields: ['switch_type', 'switch_brand', 'button_count'] },
  { query: 'razer cobra pro release date price', source: 'targeted', target_fields: ['release_date', 'price_usd'] },
  { query: 'razer cobra pro wireless connection bluetooth dongle', source: 'llm', target_fields: ['connection_type'] },
  { query: 'razer cobra pro rgb lighting customization', source: 'llm', target_fields: ['rgb_lighting'] },
];

const GROUPS = [
  { key: 'identity', label: 'Identity', desc: 'Brand and model identification', source_target: 'manufacturer', content_target: 'product page', search_intent: 'identify', host_class: 'official', priority: 1, field_keys: ['brand', 'model'], rl: { brand: 'identity', model: 'identity' } },
  { key: 'sensor_performance', label: 'Sensor & Performance', desc: 'Sensor specs and tracking performance', source_target: 'manufacturer+review', content_target: 'spec sheet', search_intent: 'technical', host_class: 'official', priority: 2, field_keys: ['sensor_brand', 'sensor_model', 'dpi_max', 'dpi_min', 'polling_rate_max'], rl: { sensor_brand: 'critical', sensor_model: 'critical', dpi_max: 'required', dpi_min: 'required', polling_rate_max: 'required' } },
  { key: 'physical', label: 'Physical Properties', desc: 'Weight, dimensions, and form factor', source_target: 'manufacturer+review', content_target: 'spec sheet', search_intent: 'technical', host_class: 'official', priority: 3, field_keys: ['weight', 'length_mm', 'width_mm', 'height_mm', 'shape', 'grip_style'], rl: { weight: 'required', length_mm: 'expected', width_mm: 'expected', height_mm: 'expected', shape: 'expected', grip_style: 'expected' } },
  { key: 'switches_buttons', label: 'Switches & Buttons', desc: 'Switch type, brand, and button configuration', source_target: 'manufacturer', content_target: 'product page', search_intent: 'technical', host_class: 'official', priority: 4, field_keys: ['switch_type', 'switch_brand', 'button_count'], rl: { switch_type: 'required', switch_brand: 'required', button_count: 'expected' } },
  { key: 'connectivity', label: 'Connectivity & Power', desc: 'Connection, cable, and battery', source_target: 'manufacturer+review', content_target: 'spec sheet', search_intent: 'technical', host_class: 'official', priority: 5, field_keys: ['connection_type', 'cable_type', 'battery_life_hours'], rl: { connection_type: 'required', cable_type: 'expected', battery_life_hours: 'expected' } },
  { key: 'features', label: 'Features & Extras', desc: 'RGB, software, and other features', source_target: 'manufacturer', content_target: 'product page', search_intent: 'feature', host_class: 'official', priority: 6, field_keys: ['rgb_lighting'], rl: { rgb_lighting: 'optional' } },
  { key: 'market', label: 'Market & Availability', desc: 'Price and release information', source_target: 'marketplace', content_target: 'store listing', search_intent: 'commercial', host_class: 'marketplace', priority: 7, field_keys: ['release_date', 'price_usd'], rl: { release_date: 'optional', price_usd: 'optional' } },
];

function rlToBucket(l) {
  if (l === 'identity' || l === 'critical') return 'core';
  if (l === 'required') return 'secondary';
  if (l === 'expected') return 'expected';
  return 'optional';
}

async function main() {
  const eventsPath = process.argv[2];
  if (!eventsPath) {
    console.error('Usage: node scripts/injectIntoLiveRun.js <eventsPath>');
    process.exit(1);
  }

  // Read existing events to extract metadata
  const text = await fs.readFile(eventsPath, 'utf8');
  const lines = text.trim().split('\n').filter(Boolean);
  let runId = '', productId = '', category = '';
  for (const line of lines) {
    try {
      const row = JSON.parse(line);
      if (row.runId || row.run_id) runId = runId || String(row.runId || row.run_id);
      if (row.productId || row.product_id) productId = productId || String(row.productId || row.product_id);
      if (row.category) category = category || String(row.category);
    } catch { /* skip */ }
  }
  runId = runId || '20260316001421-7bdc5f';
  productId = productId || 'mouse-razer-cobra-pro';
  category = category || 'mouse';

  console.log(`Injecting into: ${eventsPath}`);
  console.log(`Run: ${runId}, Product: ${productId}, Category: ${category}`);

  // Build seed fields
  const seeds = Object.keys(PROVENANCE).map((fk) => {
    const p = PROVENANCE[fk];
    const has = p.value && p.value !== 'unk' && p.evidence.length > 0;
    let rl = 'optional', gk = 'general';
    for (const g of GROUPS) {
      if (g.rl[fk]) rl = g.rl[fk];
      if (g.field_keys.includes(fk)) gk = g.key;
    }
    return {
      field_key: fk, state: has ? 'accepted' : 'missing', group_key: gk, required_level: rl,
      history: { existing_queries: [], domains_tried: [], host_classes_tried: [], evidence_classes_tried: [], query_count: 0, urls_examined_count: 0, no_value_attempts: 0, duplicate_attempts_suppressed: 0 },
    };
  });

  // Enrich fields with history using production function
  const fields = enrichNeedSetFieldHistories({ fields: seeds, provenance: PROVENANCE, searchPlanQueries: QUERIES });

  // Build bundles
  const qa = {};
  for (const q of QUERIES) {
    for (const fk of q.target_fields) {
      qa[fk] = qa[fk] || [];
      qa[fk].push({ q: q.query, family: q.source === 'llm' ? 'review_lookup' : 'manufacturer_html' });
    }
  }
  const bundles = GROUPS.map((g) => {
    const bq = [];
    for (const fk of g.field_keys) {
      for (const x of (qa[fk] || [])) {
        if (!bq.find((b) => b.q === x.q)) bq.push(x);
      }
    }
    const bf = g.field_keys.map((fk) => ({
      key: fk,
      state: fields.find((f) => f.field_key === fk)?.state || 'missing',
      bucket: rlToBucket(g.rl[fk] || 'optional'),
    }));
    return {
      key: g.key, label: g.label, desc: g.desc,
      source_target: g.source_target, content_target: g.content_target,
      search_intent: g.search_intent, host_class: g.host_class, priority: g.priority,
      queries: bq,
      query_family_mix: bq.length > 0 ? [...new Set(bq.map((q) => q.family))].sort().join('+') : null,
      reason_active: bq.length > 0 ? `${bf.filter((f) => f.state === 'missing').length} unresolved — diversify sources` : null,
      fields: bf,
    };
  });

  // Profile influence
  const FK = ['manufacturer_html', 'manual_pdf', 'support_docs', 'review_lookup', 'benchmark_lookup', 'fallback_web', 'targeted_single'];
  const fc = Object.fromEntries(FK.map((k) => [k, 0]));
  for (const q of QUERIES) {
    if (q.source === 'llm') fc.review_lookup++;
    else fc.manufacturer_html++;
  }
  const pi = {
    ...fc,
    duplicates_suppressed: 1,
    focused_bundles: bundles.filter((b) => b.queries.length > 0).length,
    targeted_exceptions: 2,
    total_queries: QUERIES.length,
    trusted_host_share: fc.manufacturer_html + fc.support_docs,
    docs_manual_share: fc.manual_pdf,
  };

  // Deltas
  const deltas = Object.entries(PROVENANCE)
    .filter(([, p]) => p.value && p.value !== 'unk' && p.evidence.length > 0)
    .map(([fk]) => ({ field: fk, from: 'missing', to: 'satisfied' }));

  const unresolved = fields.filter((f) => f.state !== 'accepted');

  // Build the event — matches runtimeBridge._emit format:
  // { run_id, category, product_id, ts, stage, event, payload: {...} }
  const evt = {
    run_id: runId,
    category,
    product_id: productId,
    ts: new Date().toISOString(),
    stage: 'index',
    event: 'needset_computed',
    payload: {
      scope: 'needset',
      needset_size: unresolved.length,
      total_fields: fields.length,
      summary: { missing_count: unresolved.length, accepted_count: fields.length - unresolved.length },
      blockers: {},
      bundles,
      profile_influence: pi,
      deltas,
      round: 1,
      round_mode: 'carry_forward',
      schema_version: 'needset_planner_output.v2',
      fields,
    },
  };

  // Append
  await fs.appendFile(eventsPath, JSON.stringify(evt) + '\n', 'utf8');

  const withHistory = fields.filter((f) => f.history?.query_count > 0 || f.history?.domains_tried?.length > 0);

  console.log('\n=== Injection Complete ===');
  console.log(`Fields: ${fields.length} total, ${withHistory.length} with history`);
  console.log(`Bundles: ${bundles.length} total, ${bundles.filter((b) => b.queries.length > 0).length} with queries`);
  console.log(`Profile influence: ${pi.total_queries} queries`);
  console.log(`Deltas: ${deltas.length} transitions`);

  console.log('\n--- Sample Field History ---');
  for (const f of withHistory.slice(0, 6)) {
    const h = f.history;
    console.log(`  ${f.field_key}: queries=${h.query_count}, domains=[${h.domains_tried.join(',')}], no_val=${h.no_value_attempts}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
