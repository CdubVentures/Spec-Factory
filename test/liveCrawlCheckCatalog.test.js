import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CHECK_CATALOG,
  getCheck,
  getSection,
  getSectionChecks,
  SECTION_IDS,
  VERDICT_IDS,
  sectionToVerdict
} from '../src/features/indexing/validation/live-crawl/checkCatalog.js';

// ── Catalog structure ───────────────────────────────────────

test('CHECK_CATALOG is non-empty and section metadata reconciles to the catalog', () => {
  assert.equal(CHECK_CATALOG.length > 0, true);

  const totalFromSections = SECTION_IDS.reduce((sum, sectionId) => {
    const section = getSection(sectionId);
    assert.ok(section, `missing section metadata for ${sectionId}`);
    return sum + section.check_count;
  }, 0);

  assert.equal(totalFromSections, CHECK_CATALOG.length);
});

test('every check has required fields', () => {
  for (const check of CHECK_CATALOG) {
    assert.ok(check.id, `check missing id`);
    assert.ok(check.section, `${check.id} missing section`);
    assert.ok(check.description, `${check.id} missing description`);
    assert.ok(check.pass_when, `${check.id} missing pass_when`);
    assert.ok(typeof check.automatable === 'boolean', `${check.id} missing automatable flag`);
  }
});

test('all check IDs are unique', () => {
  const ids = CHECK_CATALOG.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('check IDs follow expected prefix pattern', () => {
  const prefixes = new Set(CHECK_CATALOG.map((c) => c.id.replace(/[-_]\d+$/, '')));
  // Should have RB0, RB1, DA, CA, CF, DC, PA, EA, PB, UI, SS, RQ, IX, OP
  for (const p of ['RB0', 'RB1', 'DA', 'CA', 'CF', 'DC', 'PA', 'EA', 'PB', 'UI', 'SS', 'RQ', 'IX', 'OP']) {
    assert.ok(prefixes.has(p), `missing prefix ${p}`);
  }
});

// ── Section metadata ────────────────────────────────────────

test('SECTION_IDS is unique and every section has metadata', () => {
  assert.equal(new Set(SECTION_IDS).size, SECTION_IDS.length);
  for (const sectionId of SECTION_IDS) {
    assert.ok(getSection(sectionId), `missing metadata for ${sectionId}`);
  }
});

test('getSection returns section metadata', () => {
  const s = getSection('RB-0');
  assert.ok(s);
  assert.equal(s.title, 'CP-0 GUI lane contract');
  assert.equal(s.check_count, 5);
});

test('getSectionChecks returns checks for a section', () => {
  const checks = getSectionChecks('RB-0');
  assert.equal(checks.length, 5);
  assert.ok(checks.every((c) => c.section === 'RB-0'));
});

// ── Verdict mapping ─────────────────────────────────────────

test('VERDICT_IDS has exactly 5 verdicts', () => {
  assert.equal(VERDICT_IDS.length, 5);
  assert.deepEqual(VERDICT_IDS, [
    'defaults_aligned',
    'crawl_alive',
    'parser_alive',
    'extraction_alive',
    'publishable_alive'
  ]);
});

test('sectionToVerdict maps every section to a verdict', () => {
  for (const sId of SECTION_IDS) {
    const verdict = sectionToVerdict(sId);
    assert.ok(verdict, `section ${sId} has no verdict mapping`);
    assert.ok(VERDICT_IDS.includes(verdict), `${sId} maps to unknown verdict ${verdict}`);
  }
});

// ── Lookup helpers ──────────────────────────────────────────

test('getCheck returns check by ID', () => {
  const c = getCheck('DA-01');
  assert.ok(c);
  assert.equal(c.id, 'DA-01');
  assert.equal(c.section, 'S1');
});

test('getCheck returns null for unknown ID', () => {
  assert.equal(getCheck('NONEXISTENT-99'), null);
});

// ── Section check counts match the document ─────────────────

test('section metadata check counts match the concrete catalog contents', () => {
  for (const sectionId of SECTION_IDS) {
    const section = getSection(sectionId);
    const checks = getSectionChecks(sectionId);
    assert.equal(
      checks.length,
      section.check_count,
      `section ${sectionId} metadata count should match catalog contents`,
    );
  }
});
