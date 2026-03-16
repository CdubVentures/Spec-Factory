#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../config.js';
import { defaultLocalOutputRoot } from '../core/config/runtimeArtifactRoots.js';
import { createStorage } from '../s3/storage.js';
import { runProduct } from '../pipeline/runProduct.js';
import { asBool, parseArgs } from './args.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function resolveSmokeLocalOutputPaths(outputRoot = defaultLocalOutputRoot()) {
  const resolvedOutputRoot = path.resolve(String(outputRoot || defaultLocalOutputRoot()));
  return {
    outputRoot: resolvedOutputRoot,
    normalizedOutPath: path.join(resolvedOutputRoot, 'normalized', 'spec.normalized.json'),
    summaryOutPath: path.join(resolvedOutputRoot, 'logs', 'summary.json'),
  };
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runLlmMode = asBool(args.llm, process.env.LLM_ENABLED === 'true');
  const { outputRoot, normalizedOutPath, summaryOutPath } = resolveSmokeLocalOutputPaths();

  const config = loadConfig({
    localMode: true,
    dryRun: true,
    localInputRoot: 'fixtures/s3',
    localOutputRoot: outputRoot,
    writeMarkdownSummary: false,
    discoveryEnabled: false,
    llmEnabled: false
  });

  const storage = createStorage(config);
  const s3Key = 'specs/inputs/mouse/products/mouse-smoke-validation.json';
  const result = await runProduct({ storage, config, s3Key });

  await fs.mkdir(path.dirname(normalizedOutPath), { recursive: true });
  await fs.mkdir(path.dirname(summaryOutPath), { recursive: true });

  await fs.writeFile(normalizedOutPath, JSON.stringify(result.normalized, null, 2));
  await fs.writeFile(summaryOutPath, JSON.stringify(result.summary, null, 2));

  assert(result.summary.validated === false, 'Smoke assertion failed: expected validated=false');
  assert(
    result.summary.validated_reason === 'BELOW_CONFIDENCE_THRESHOLD',
    `Smoke assertion failed: expected BELOW_CONFIDENCE_THRESHOLD, got ${result.summary.validated_reason}`
  );

  let llmRun = {
    enabled: false
  };
  if (runLlmMode) {
    if (!process.env.OPENAI_API_KEY) {
      llmRun = {
        enabled: false,
        skipped: true,
        reason: 'OPENAI_API_KEY not set'
      };
    } else {
      const llmConfig = loadConfig({
        localMode: true,
        dryRun: true,
        localInputRoot: 'fixtures/s3',
        localOutputRoot: outputRoot,
        writeMarkdownSummary: false,
        discoveryEnabled: false,
        llmEnabled: true
      });
      const llmStorage = createStorage(llmConfig);
      const llmResult = await runProduct({ storage: llmStorage, config: llmConfig, s3Key });
      llmRun = {
        enabled: true,
        runId: llmResult.runId,
        validated: llmResult.summary.validated,
        validated_reason: llmResult.summary.validated_reason,
        llm_summary: llmResult.summary.llm
      };
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        smoke: 'local',
        productId: result.productId,
        runId: result.runId,
        validated: result.summary.validated,
        validated_reason: result.summary.validated_reason,
        confidence: result.summary.confidence,
        completeness_required_percent: result.summary.completeness_required_percent,
        coverage_overall_percent: result.summary.coverage_overall_percent,
        normalized_out: normalizedOutPath,
        summary_out: summaryOutPath,
        llm_mode: llmRun
      },
      null,
      2
    )}\n`
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
