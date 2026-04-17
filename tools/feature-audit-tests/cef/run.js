#!/usr/bin/env node
// CEF Feature Audit Tool — CLI entrypoint.
//
// Runs the 9 T-scenarios against the real CEF pipeline using canned LLM
// overrides (no network, no LLM, no .workspace/ contact). Writes a
// standalone HTML report and exits non-zero if any scenario failed.
//
// Usage:
//   node tools/feature-audit-tests/cef/run.js
//   node tools/feature-audit-tests/cef/run.js --only T1,T8

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { runColorEditionFinder } from '../../../src/features/color-edition/index.js';
import { buildTestEnv, cannedLlm } from './testEnv.js';
import { SCENARIOS } from './scenarios.js';
import { renderHtmlReport } from './report.js';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(HERE, 'report.html');

function parseFilter(argv) {
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  if (!onlyArg) return null;
  return new Set(onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean));
}

function buildProduct(productId) {
  return {
    product_id: productId,
    category: 'mouse',
    brand: 'AuditBrand',
    base_model: '',
    model: 'AuditModel',
    variant: '',
  };
}

async function runScenario(scenario) {
  const env = buildTestEnv(scenario.id);
  const { productId } = scenario;
  const steps = [];
  const stepResults = [];
  const scenarioStart = Date.now();

  try {
    env.ensureProductJson(productId, { brand: 'AuditBrand', model: 'AuditModel' });

    let priorState = { cefJson: null, pifJson: null };
    for (const step of scenario.steps) {
      steps.push(step.label);

      if (step.preStep) {
        step.preStep({
          productId,
          productRoot: env.productRoot,
          specDb: env.specDb,
          seedPif: env.seedPif,
          ...priorState,
        });
      }

      const discoveryOverride = cannedLlm(step.cannedDiscovery);
      const judgePayload = typeof step.cannedJudge === 'function'
        ? step.cannedJudge(priorState)
        : step.cannedJudge;
      const judgeOverride = judgePayload ? cannedLlm(judgePayload) : null;

      const product = buildProduct(productId);

      const result = await runColorEditionFinder({
        product,
        appDb: env.appDb,
        specDb: env.specDb,
        config: { llmModelPlan: 'audit-stub' },
        logger: null,
        productRoot: env.productRoot,
        _callLlmOverride: discoveryOverride,
        _callIdentityCheckOverride: judgeOverride,
      });

      const cefJson = env.readCef(productId);
      const pifJson = env.readPif(productId);
      const stepResult = { result, cefJson, pifJson };
      stepResults.push(stepResult);

      if (step.postStep) {
        step.postStep({
          productId,
          productRoot: env.productRoot,
          specDb: env.specDb,
          seedPif: env.seedPif,
          cefJson,
          pifJson,
          result,
        });
      }

      priorState = { cefJson, pifJson };
    }

    const checks = scenario.finalAssertions({
      stepResults,
      productId,
      readCef: env.readCef,
      readPif: env.readPif,
      specDb: env.specDb,
    });

    return {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      gate: scenario.gate,
      productId,
      steps,
      checks,
      error: null,
      durationMs: Date.now() - scenarioStart,
    };
  } catch (err) {
    return {
      id: scenario.id,
      title: scenario.title,
      description: scenario.description,
      gate: scenario.gate,
      productId,
      steps,
      checks: [],
      error: `${err.message}\n${err.stack || ''}`,
      durationMs: Date.now() - scenarioStart,
    };
  } finally {
    env.cleanup();
  }
}

async function main() {
  const filter = parseFilter(process.argv.slice(2));
  const selected = filter ? SCENARIOS.filter((s) => filter.has(s.id)) : SCENARIOS;

  if (selected.length === 0) {
    console.error(`No scenarios matched filter: ${filter ? [...filter].join(',') : '(none)'}`);
    process.exit(2);
  }

  const runStartedAt = new Date().toISOString();
  const start = Date.now();
  const results = [];

  for (const scenario of selected) {
    const res = await runScenario(scenario);
    results.push(res);
    const pass = !res.error && res.checks.every((c) => c.pass);
    const icon = pass ? 'PASS' : 'FAIL';
    const failedCount = res.error ? '(errored)' : `${res.checks.filter((c) => !c.pass).length} failed of ${res.checks.length}`;
    console.log(`[${icon}] ${res.id} ${res.title} — ${res.durationMs}ms ${pass ? '' : failedCount}`);
  }

  const durationMs = Date.now() - start;
  const html = renderHtmlReport({ results, runStartedAt, durationMs });
  fs.writeFileSync(REPORT_PATH, html);

  const passed = results.filter((r) => !r.error && r.checks.every((c) => c.pass)).length;
  const failed = results.length - passed;

  console.log('');
  console.log(`${passed}/${results.length} scenarios passed — total ${durationMs}ms`);
  console.log(`Report: ${REPORT_PATH}`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Audit tool crashed:', err);
  process.exit(3);
});
