import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { generatePromptAuditReports } from '../promptAuditReportBuilder.js';

async function mkTmpDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'prompt-audit-'));
}

function pifSettingsFixture() {
  return {
    viewBudget: '["top","left","sangle","angle"]',
    viewConfig: JSON.stringify([
      { key: 'top', priority: true, description: 'Category-authored top view' },
      { key: 'left', priority: true, description: 'Category-authored left view' },
      { key: 'sangle', priority: true, description: 'Category-authored primary angle' },
      { key: 'angle', priority: true, description: 'Category-authored secondary angle' },
      { key: 'bottom', priority: false, description: 'Category-authored bottom view' },
    ]),
    minWidth: '900',
    minHeight: '700',
    heroCount: '2',
    priorityViewPrompt_top: 'Audit-specific top prompt copy',
    evalViewCriteria_top: 'Audit-specific top eval criteria',
    heroEvalCriteria: 'Audit-specific hero eval criteria',
  };
}

test('generatePromptAuditReports writes category summary and per-prompt reports with variable/global coverage', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const result = await generatePromptAuditReports({
      category: 'mouse',
      outputRoot,
      moduleSettings: {
        productImageFinder: pifSettingsFixture(),
        colorEditionFinder: {},
        releaseDateFinder: {},
        skuFinder: {},
      },
      now: new Date('2026-04-26T12:00:00Z'),
    });

    assert.equal(result.summary.htmlPath, path.join(outputRoot, 'mouse', 'summary', 'mouse-prompt-audit-summary.html'));
    assert.equal(result.summary.mdPath, path.join(outputRoot, 'mouse', 'summary', 'mouse-prompt-audit-summary.md'));
    assert.ok(result.perPromptReports.basePath.endsWith(path.join('mouse', 'per-prompt')));
    assert.ok(result.perPromptReports.count >= 8, 'CEF/PIF/eval/RDF/SKU reports are generated');

    const summary = await fs.readFile(result.summary.mdPath, 'utf8');
    assert.match(summary, /Prompt Audit Summary - `mouse`/);
    assert.match(summary, /Prompt Surface Matrix/);
    assert.match(summary, /Global Prompt Fragment Matrix/);
    assert.match(summary, /Global Prompt Fragment Details/);
    assert.match(summary, /CEF/);
    assert.match(summary, /PIF/);
    assert.match(summary, /Image Eval/);
    assert.match(summary, /RDF/);
    assert.match(summary, /SKU/);
    assert.match(summary, /`categoryContext`/);
    assert.match(summary, /`variantScalarDisambiguation`/);

    const pifViewPath = path.join(result.perPromptReports.basePath, 'pif', 'view-search.md');
    const pifView = await fs.readFile(pifViewPath, 'utf8');
    assert.match(pifView, /PIF View Search Prompt/);
    assert.match(pifView, /Prompt Variable Matrix/);
    assert.match(pifView, /`\{\{PRODUCT_IMAGE_IDENTITY_FACTS\}\}`/);
    assert.match(pifView, /`\{\{PIF_PROMPT_HISTORY\}\}`/);
    assert.match(pifView, /Global Prompt Sources/);
    assert.match(pifView, /`categoryContext`/);
    assert.match(pifView, /Effective Global Prompt/);
    assert.match(pifView, /Full Compiled Sample Prompt/);
    assert.match(pifView, /Category: mouse/);
    assert.match(pifView, /Audit-specific top prompt copy/);

    const evalPath = path.join(result.perPromptReports.basePath, 'eval', 'view-eval.md');
    const evalDoc = await fs.readFile(evalPath, 'utf8');
    assert.match(evalDoc, /Image Eval View Eval Prompt/);
    assert.match(evalDoc, /`\{\{CRITERIA\}\}`/);
    assert.match(evalDoc, /`\{\{CAROUSEL_CONTEXT\}\}`/);
    assert.match(evalDoc, /Audit-specific top eval criteria/);
    assert.match(evalDoc, /Response Schema/);

    const rdfPath = path.join(result.perPromptReports.basePath, 'rdf', 'discovery.md');
    const rdfDoc = await fs.readFile(rdfPath, 'utf8');
    assert.match(rdfDoc, /RDF Discovery Prompt/);
    assert.match(rdfDoc, /`\{\{VARIANT_DISAMBIGUATION\}\}`/);
    assert.match(rdfDoc, /`variantScalarDisambiguation`/);
    await fs.access(path.join(outputRoot, 'mouse', 'auditors-responses'));
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test('generatePromptAuditReports flags generic fallback prompt surfaces for categories without authored PIF defaults', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const result = await generatePromptAuditReports({
      category: 'chair',
      outputRoot,
      moduleSettings: {},
      now: new Date('2026-04-26T12:00:00Z'),
    });

    const summary = await fs.readFile(result.summary.mdPath, 'utf8');
    assert.match(summary, /generic fallback/i);

    const pifView = await fs.readFile(
      path.join(result.perPromptReports.basePath, 'pif', 'view-search.md'),
      'utf8',
    );
    assert.match(pifView, /Generic fallback/i);
    assert.match(pifView, /Full Compiled Sample Prompt/);
    assert.match(pifView, /Category: chair/);
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test('generatePromptAuditReports archives previous per-prompt tree on regeneration', async () => {
  const outputRoot = await mkTmpDir();
  try {
    await generatePromptAuditReports({
      category: 'mouse',
      outputRoot,
      moduleSettings: {
        productImageFinder: pifSettingsFixture(),
        colorEditionFinder: {},
        releaseDateFinder: {},
        skuFinder: {},
      },
      now: new Date('2026-04-01T00:00:00Z'),
    });

    await generatePromptAuditReports({
      category: 'mouse',
      outputRoot,
      moduleSettings: {
        productImageFinder: pifSettingsFixture(),
        colorEditionFinder: {},
        releaseDateFinder: {},
        skuFinder: {},
      },
      now: new Date('2026-04-02T00:00:00Z'),
    });

    const archivedPrompt = path.join(
      outputRoot,
      'mouse',
      'archive',
      '2026-04-02T00-00-00-000Z',
      'per-prompt',
      'pif',
      'view-search.md',
    );
    const archived = await fs.readFile(archivedPrompt, 'utf8');
    assert.match(archived, /2026-04-01T00:00:00.000Z/);
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});

test('generatePromptAuditReports overwrites prompt tree without deleting auditor response patches', async () => {
  const outputRoot = await mkTmpDir();
  try {
    const categoryRoot = path.join(outputRoot, 'mouse');
    await fs.mkdir(categoryRoot, { recursive: true });
    const humanFile = path.join(categoryRoot, 'mouse-prompt-review-notes.txt');
    await fs.writeFile(humanFile, 'keep this', 'utf8');

    const first = await generatePromptAuditReports({
      category: 'mouse',
      outputRoot,
      moduleSettings: {},
      now: new Date('2026-04-26T12:00:00Z'),
    });
    const stale = path.join(first.perPromptReports.basePath, 'pif', 'stale.md');
    await fs.writeFile(stale, 'stale prompt report', 'utf8');

    const second = await generatePromptAuditReports({
      category: 'mouse',
      outputRoot,
      moduleSettings: {},
      now: new Date('2026-04-26T13:00:00Z'),
    });

    assert.equal(first.summary.mdPath, second.summary.mdPath);
    assert.equal(await fs.readFile(humanFile, 'utf8'), 'keep this');
    await assert.rejects(() => fs.access(stale), /ENOENT/);
    const summary = await fs.readFile(second.summary.mdPath, 'utf8');
    assert.match(summary, /2026-04-26T13:00:00\.000Z/);
    assert.doesNotMatch(summary, /2026-04-26T12:00:00\.000Z/);
  } finally {
    await fs.rm(outputRoot, { recursive: true, force: true });
  }
});
