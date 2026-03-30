#!/usr/bin/env node
/**
 * Wave 4 verification script.
 * Run AFTER a pipeline run to confirm billing entries landed in SQL.
 *
 * Usage: node scripts/verify-wave4.js [category]
 *   category defaults to "mouse"
 */
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const category = process.argv[2] || 'mouse';
const dbPath = path.resolve(`.workspace/db/${category}/spec.sqlite`);

console.log(`\n=== Wave 4 Verification (${category}) ===\n`);
console.log(`DB: ${dbPath}`);

if (!fs.existsSync(dbPath)) {
  console.error(`\n  DB not found at ${dbPath}`);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

// --- 1. billing_entries table ---
console.log('\n--- billing_entries ---');
try {
  const count = db.prepare('SELECT COUNT(*) as c FROM billing_entries').get();
  console.log(`  Total rows: ${count.c}`);

  if (count.c > 0) {
    const byMonth = db.prepare(`
      SELECT month, COUNT(*) as calls, ROUND(SUM(cost_usd), 6) as total_cost
      FROM billing_entries GROUP BY month ORDER BY month DESC
    `).all();
    console.log('  By month:');
    for (const row of byMonth) {
      console.log(`    ${row.month}: ${row.calls} calls, $${row.total_cost}`);
    }

    const recent = db.prepare(`
      SELECT ts, provider, model, category, product_id, cost_usd, reason
      FROM billing_entries ORDER BY ts DESC LIMIT 5
    `).all();
    console.log('  Recent entries:');
    for (const row of recent) {
      console.log(`    ${row.ts} | ${row.provider}:${row.model} | ${row.category}/${row.product_id} | $${row.cost_usd} | ${row.reason}`);
    }
  } else {
    console.log('  ** NO BILLING ENTRIES — run a pipeline first, then re-check **');
  }
} catch (err) {
  console.log(`  Table missing or error: ${err.message}`);
}

// --- 2. Check for stale NDJSON billing files ---
console.log('\n--- NDJSON file check ---');
const outputRoot = path.resolve('specs/outputs');
const billingLedgerDir = path.join(outputRoot, '_billing', 'ledger');
const billingMonthlyDir = path.join(outputRoot, '_billing', 'monthly');

function checkDir(dir, label) {
  if (!fs.existsSync(dir)) {
    console.log(`  ${label}: directory does not exist (good — no legacy files)`);
    return;
  }
  const files = fs.readdirSync(dir);
  if (files.length === 0) {
    console.log(`  ${label}: empty (good)`);
  } else {
    console.log(`  ${label}: ${files.length} file(s) — these are pre-migration legacy data`);
    for (const f of files.slice(0, 5)) {
      const stat = fs.statSync(path.join(dir, f));
      console.log(`    ${f} (${stat.size} bytes, modified ${stat.mtime.toISOString().slice(0, 19)})`);
    }
    console.log('  After verifying SQL data is correct, these can be archived/deleted.');
  }
}

checkDir(billingLedgerDir, '_billing/ledger');
checkDir(billingMonthlyDir, '_billing/monthly');

// --- 4. Billing rollup via getBillingRollup (simulates API route) ---
console.log('\n--- Billing API rollup (simulated) ---');
try {
  const month = new Date().toISOString().slice(0, 7);
  const totals = db.prepare(`
    SELECT COUNT(*) as calls, COALESCE(SUM(cost_usd), 0) as cost_usd
    FROM billing_entries WHERE month = ? AND category = ?
  `).get(month, category);
  console.log(`  ${month} / ${category}: ${totals.calls} calls, $${Number(totals.cost_usd).toFixed(6)}`);
} catch (err) {
  console.log(`  Error: ${err.message}`);
}

db.close();
console.log('\n=== Done ===\n');
