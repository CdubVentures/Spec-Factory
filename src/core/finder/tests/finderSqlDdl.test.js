import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateFinderDdl } from '../finderSqlDdl.js';

const CEF_MODULE = {
  id: 'colorEditionFinder',
  tableName: 'color_edition_finder',
  runsTableName: 'color_edition_finder_runs',
  summaryColumns: [
    { name: 'colors', type: 'TEXT', default: "'[]'" },
    { name: 'editions', type: 'TEXT', default: "'[]'" },
    { name: 'default_color', type: 'TEXT', default: "''" },
  ],
  summaryIndexes: [],
};

const SIMPLE_MODULE = {
  id: 'skuFinder',
  tableName: 'sku_finder',
  runsTableName: 'sku_finder_runs',
  summaryColumns: [
    { name: 'sku', type: 'TEXT', default: "''" },
  ],
  summaryIndexes: [],
};

describe('generateFinderDdl', () => {
  it('generates CREATE TABLE for summary with common + custom columns', () => {
    const ddl = generateFinderDdl([CEF_MODULE]);
    const joined = ddl.join('\n');
    assert.ok(joined.includes('CREATE TABLE IF NOT EXISTS color_edition_finder'));
    assert.ok(joined.includes('category'));
    assert.ok(joined.includes('product_id'));
    assert.ok(joined.includes('run_count'));
    // Custom columns
    assert.ok(joined.includes('colors'));
    assert.ok(joined.includes('editions'));
    assert.ok(joined.includes('default_color'));
    assert.ok(joined.includes('PRIMARY KEY'));
  });

  it('generates CREATE TABLE for runs with standard shape', () => {
    const ddl = generateFinderDdl([CEF_MODULE]);
    const joined = ddl.join('\n');
    assert.ok(joined.includes('CREATE TABLE IF NOT EXISTS color_edition_finder_runs'));
    assert.ok(joined.includes('run_number'));
    assert.ok(joined.includes('model'));
    assert.ok(joined.includes('selected_json'));
    assert.ok(joined.includes('prompt_json'));
    assert.ok(joined.includes('response_json'));
    assert.ok(joined.includes('UNIQUE'));
  });

  it('runs table includes effort_level and access_mode columns', () => {
    const ddl = generateFinderDdl([CEF_MODULE]);
    const joined = ddl.join('\n');
    assert.ok(joined.includes("effort_level TEXT DEFAULT ''"), 'missing effort_level column');
    assert.ok(joined.includes("access_mode TEXT DEFAULT ''"), 'missing access_mode column');
  });

  // WHY: Global guardrail — the shared DDL generator is the single choke point
  // for every finder's runs table. ran_at must default to a real timestamp so
  // future finders created from this template cannot regress into empty-string
  // timestamps that break audit-log ordering after a rebuild.
  it('runs table ran_at defaults to datetime(now), not empty string', () => {
    const ddl = generateFinderDdl([CEF_MODULE]);
    const joined = ddl.join('\n');
    assert.ok(
      joined.includes("ran_at TEXT NOT NULL DEFAULT (datetime('now'))"),
      'ran_at must default to a real timestamp so Publisher / Indexing panel ORDER BY ran_at is meaningful after rebuild',
    );
  });

  // WHY: First-class timing — every finder persists started_at + duration_ms as
  // real columns on the shared runs table so the Indexing panel can render
  // "date · time · duration" without embedding timing inside response_json.
  // New finders inherit these columns automatically from the DDL generator.
  it('runs table includes started_at + duration_ms columns', () => {
    const ddl = generateFinderDdl([CEF_MODULE]);
    const joined = ddl.join('\n');
    assert.ok(
      joined.includes('started_at TEXT DEFAULT NULL'),
      'started_at must be a first-class column on the runs table',
    );
    assert.ok(
      joined.includes('duration_ms INTEGER DEFAULT NULL'),
      'duration_ms must be a first-class column on the runs table',
    );
  });

  it('generates runs index on (category, product_id)', () => {
    const ddl = generateFinderDdl([CEF_MODULE]);
    const joined = ddl.join('\n');
    assert.ok(joined.includes(`idx_${CEF_MODULE.tableName}_runs_product`));
  });

  it('handles multiple modules', () => {
    const ddl = generateFinderDdl([CEF_MODULE, SIMPLE_MODULE]);
    const joined = ddl.join('\n');
    assert.ok(joined.includes('color_edition_finder'));
    assert.ok(joined.includes('sku_finder'));
    assert.ok(joined.includes('sku_finder_runs'));
  });

  it('simple module with no indexes gets only runs index', () => {
    const ddl = generateFinderDdl([SIMPLE_MODULE]);
    const joined = ddl.join('\n');
    assert.ok(joined.includes('sku_finder'));
    assert.ok(joined.includes('sku_finder_runs'));
    assert.ok(!joined.includes('idx_cef'));
  });

  it('returns empty array for empty modules', () => {
    const ddl = generateFinderDdl([]);
    assert.deepEqual(ddl, []);
  });
});
