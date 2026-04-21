import test from 'node:test';
import assert from 'node:assert/strict';

import { detectTableUsage, parseTables } from './generateSchemaReference.js';

test('parseTables finds a simple CREATE TABLE', () => {
  const ddl = `
    CREATE TABLE IF NOT EXISTS widgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
  `;
  const tables = parseTables(ddl);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].name, 'widgets');
});

test('parseTables handles CREATE TABLE bodies whose SQL line-comments contain semicolons', () => {
  // Regression: the body-matching regex excludes ';' so any table whose
  // -- comment contains a ';' was silently dropped. Real-world trigger:
  // field_candidate_evidence's comment "pre-upgrade legacy row; publisher gate".
  const ddl = `
    CREATE TABLE IF NOT EXISTS gadgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- WHY: first clause; second clause after a semicolon inside a comment.
      label TEXT NOT NULL
    );
  `;
  const tables = parseTables(ddl);
  assert.equal(tables.length, 1);
  assert.equal(tables[0].name, 'gadgets');
});

test('parseTables finds multiple tables even when earlier bodies contain commented semicolons', () => {
  const ddl = `
    CREATE TABLE IF NOT EXISTS alpha (
      id INTEGER PRIMARY KEY,
      -- first; second; third
      v TEXT
    );
    CREATE TABLE IF NOT EXISTS beta (
      id INTEGER PRIMARY KEY,
      v TEXT
    );
  `;
  const names = parseTables(ddl).map((t) => t.name);
  assert.deepEqual(names, ['alpha', 'beta']);
});

test('detectTableUsage treats field_studio_map accessors as table usage', () => {
  const usageText = `
    export function loadRuntimeFieldRulesPayload({ specDb }) {
      return specDb.getCompiledRules();
    }
  `;

  assert.equal(detectTableUsage(usageText, 'field_studio_map'), true);
});

test('detectTableUsage treats field_studio_map statement refs as table usage', () => {
  const usageText = `
    export function createFieldStudioMapStore({ stmts }) {
      return stmts._getFieldStudioMap.get();
    }
  `;

  assert.equal(detectTableUsage(usageText, 'field_studio_map'), true);
});

test('detectTableUsage does not misclassify unrelated accessor names for other tables', () => {
  const usageText = `
    export function loadRuntimeFieldRulesPayload({ specDb }) {
      return specDb.getCompiledRules();
    }
  `;

  assert.equal(detectTableUsage(usageText, 'settings'), false);
});

test('detectTableUsage treats appDb brand accessors as brands table usage', () => {
  const usageText = `
    export function resolveBrand(appDb, identifier) {
      return appDb.getBrand(identifier);
    }
  `;

  assert.equal(detectTableUsage(usageText, 'brands'), true);
});

test('detectTableUsage treats appDb setting accessors as settings table usage', () => {
  const usageText = `
    export function readRuntimeSettings(db) {
      return db.getSetting('runtime', 'llmProvider');
    }
  `;

  assert.equal(detectTableUsage(usageText, 'settings'), true);
});

test('detectTableUsage treats specDb product accessors as products table usage', () => {
  const usageText = `
    export function getProductSummary(specDb, productId) {
      return specDb.getProduct(productId);
    }
  `;

  assert.equal(detectTableUsage(usageText, 'products'), true);
});

test('detectTableUsage treats appDb category accessors as brand_categories table usage', () => {
  const usageText = `
    export function assignCategories(appDb, identifier, categories) {
      appDb.setBrandCategories(identifier, categories);
      return appDb.getCategoriesForBrand(identifier);
    }
  `;

  assert.equal(detectTableUsage(usageText, 'brand_categories'), true);
});

test('detectTableUsage treats color edition finder accessors as table usage', () => {
  const usageText = `
    export function getFinder(specDb, productId) {
      return specDb.getColorEditionFinder(productId);
    }
  `;

  assert.equal(detectTableUsage(usageText, 'color_edition_finder'), true);
});

test('detectTableUsage treats color edition finder run accessors as run table usage', () => {
  const usageText = `
    export function listFinderRuns(specDb, productId) {
      return specDb.listColorEditionFinderRuns(productId);
    }
  `;

  assert.equal(detectTableUsage(usageText, 'color_edition_finder_runs'), true);
});
