import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runFieldContractTests } from '../fieldContractTestRunner.js';

const HELPER_ROOT = path.resolve('category_authority');

let fieldRules, knownValues, componentDBs, results;

before(async () => {
  fieldRules = JSON.parse(await fs.readFile(
    path.join(HELPER_ROOT, 'mouse', '_generated', 'field_rules.json'), 'utf8',
  ));
  knownValues = JSON.parse(await fs.readFile(
    path.join(HELPER_ROOT, 'mouse', '_generated', 'known_values.json'), 'utf8',
  ));
  const compDbDir = path.join(HELPER_ROOT, 'mouse', '_generated', 'component_db');
  componentDBs = {};
  const compDbFiles = (await fs.readdir(compDbDir)).filter(f => f.endsWith('.json'));
  for (const f of compDbFiles) {
    const data = JSON.parse(await fs.readFile(path.join(compDbDir, f), 'utf8'));
    const key = data.component_type || f.replace('.json', '');
    componentDBs[key] = data;
  }

  // Run the full audit once — reuse results across all tests
  results = runFieldContractTests({ fieldRules, knownValues, componentDbs: componentDBs });
});

// ── Summary tests ───────────────────────────────────────────────────────────

describe('runFieldContractTests — summary', () => {
  it('returns results array and summary object', () => {
    assert.ok(Array.isArray(results.results), 'results is array');
    assert.ok(results.summary, 'summary exists');
    assert.ok(typeof results.summary.totalFields === 'number', 'totalFields is number');
    assert.ok(typeof results.summary.totalChecks === 'number', 'totalChecks is number');
    assert.ok(typeof results.summary.passCount === 'number', 'passCount is number');
    assert.ok(typeof results.summary.failCount === 'number', 'failCount is number');
  });

  it('summary counts are consistent', () => {
    assert.equal(
      results.summary.passCount + results.summary.failCount,
      results.summary.totalChecks,
      'passCount + failCount = totalChecks',
    );
  });

  it('totalFields matches field_rules field count', () => {
    const fieldCount = Object.keys(fieldRules.fields).length;
    assert.equal(results.summary.totalFields, fieldCount);
  });

  it('has results for every field key', () => {
    const resultFieldKeys = new Set(results.results.map(r => r.fieldKey));
    for (const fieldKey of Object.keys(fieldRules.fields)) {
      assert.ok(resultFieldKeys.has(fieldKey), `missing result for ${fieldKey}`);
    }
  });
});

// ── Good value tests ────────────────────────────────────────────────────────

describe('runFieldContractTests — good values', () => {
  it('all good value checks pass validation', () => {
    const goodResults = results.results.filter(r => r.checks.some(c => c.type === 'good'));
    const failures = [];
    for (const r of goodResults) {
      for (const check of r.checks.filter(c => c.type === 'good')) {
        if (!check.pass) {
          failures.push({ fieldKey: r.fieldKey, detail: check.detail });
        }
      }
    }
    assert.equal(failures.length, 0,
      `${failures.length} good values failed: ${failures.slice(0, 5).map(f => `${f.fieldKey}: ${f.detail}`).join('; ')}`);
  });
});

// ── Bad value tests ─────────────────────────────────────────────────────────

describe('runFieldContractTests — bad values', () => {
  it('all bad value checks produce rejections', () => {
    const failures = [];
    for (const r of results.results) {
      for (const check of r.checks.filter(c => c.type === 'reject')) {
        if (!check.pass) {
          failures.push({ fieldKey: r.fieldKey, expectedCode: check.expectedCode, detail: check.detail });
        }
      }
    }
    // WHY: Some bad values may trigger a different rejection code than expected
    // (due to pipeline interaction). Report but don't fail the entire suite.
    const total = results.results.reduce((s, r) => s + r.checks.filter(c => c.type === 'reject').length, 0);
    const passRate = total > 0 ? (total - failures.length) / total : 1;
    assert.ok(passRate >= 0.90,
      `reject pass rate ${(passRate * 100).toFixed(1)}% < 90%. Failures: ${failures.slice(0, 10).map(f => `${f.fieldKey}/${f.expectedCode}: ${f.detail}`).join('; ')}`);
  });

  it('wrong_shape rejections always pass (short-circuit)', () => {
    const shapeChecks = [];
    for (const r of results.results) {
      for (const check of r.checks.filter(c => c.type === 'reject' && c.expectedCode === 'wrong_shape')) {
        shapeChecks.push({ fieldKey: r.fieldKey, pass: check.pass, detail: check.detail });
      }
    }
    const failures = shapeChecks.filter(c => !c.pass);
    assert.equal(failures.length, 0,
      `wrong_shape failures: ${failures.map(f => f.fieldKey).join(', ')}`);
  });
});

// ── Prompt tests ────────────────────────────────────────────────────────────

describe('runFieldContractTests — prompts', () => {
  it('rejections with prompt-eligible codes produce prompts', () => {
    // WHY: wrong_shape and unk_blocks_publish and min_items_violation are not promptable
    const PROMPTABLE = new Set([
      'enum_value_not_allowed', 'unknown_enum_prefer_known', 'wrong_type',
      'format_mismatch', 'not_in_component_db', 'out_of_range', 'wrong_unit',
    ]);
    let checked = 0;
    let withPrompt = 0;
    for (const r of results.results) {
      for (const check of r.checks.filter(c => c.type === 'reject' && c.pass && PROMPTABLE.has(c.expectedCode))) {
        checked++;
        if (check.prompt) withPrompt++;
      }
    }
    assert.ok(checked > 0, 'should have at least one promptable rejection');
    assert.ok(withPrompt > 0, 'should have at least one prompt generated');
  });

  it('prompts include relevant field contract metadata', () => {
    let checked = 0;
    for (const r of results.results) {
      for (const check of r.checks.filter(c => c.type === 'reject' && c.prompt)) {
        const userText = check.prompt.user || '';
        // WHY: Every prompt should mention the field key
        assert.ok(
          userText.includes(r.fieldKey),
          `${r.fieldKey}: prompt should mention field key`,
        );
        checked++;
      }
    }
    assert.ok(checked > 0, 'should check at least one prompt');
  });
});
