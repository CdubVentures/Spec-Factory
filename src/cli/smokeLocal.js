#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultLocalOutputRoot } from '../core/config/runtimeArtifactRoots.js';

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
  const [
    { loadConfigWithUserSettings },
    { createStorage },
    { runProduct },
    { asBool, parseArgs },
  ] = await Promise.all([
    import('../config.js'),
    import('../core/storage/storage.js'),
    import('../pipeline/runProduct.js'),
    import('./args.js'),
  ]);
  const args = parseArgs(process.argv.slice(2));
  const runLlmMode = asBool(args.llm, Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.ANTHROPIC_API_KEY));
  const { outputRoot, normalizedOutPath, summaryOutPath } = resolveSmokeLocalOutputPaths();

  const config = loadConfigWithUserSettings({
    dryRun: true,
    localInputRoot: '.workspace',
    localOutputRoot: outputRoot,
    discoveryEnabled: false
  });

  const storage = createStorage(config);
  const s3Key = 'specs/inputs/mouse/products/mouse-smoke-validation.json';
  const result = await runProduct({ storage, config, s3Key });

  await fs.mkdir(path.dirname(normalizedOutPath), { recursive: true });
  await fs.mkdir(path.dirname(summaryOutPath), { recursive: true });

  const crawlSummary = {
    urls_crawled: result.crawlResults?.length ?? 0,
    urls_successful: result.crawlResults?.filter((r) => r.success).length ?? 0,
  };
  await fs.writeFile(normalizedOutPath, JSON.stringify(crawlSummary, null, 2));
  await fs.writeFile(summaryOutPath, JSON.stringify(crawlSummary, null, 2));

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
      const llmConfig = loadConfigWithUserSettings({
        dryRun: true,
        localInputRoot: '.workspace',
        localOutputRoot: outputRoot,
        discoveryEnabled: false
      });
      const llmStorage = createStorage(llmConfig);
      const llmResult = await runProduct({ storage: llmStorage, config: llmConfig, s3Key });
      llmRun = {
        enabled: true,
        runId: llmResult.runId,
        urls_crawled: llmResult.crawlResults?.length ?? 0,
      };
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        smoke: 'local',
        productId: result.productId,
        runId: result.runId,
        urls_crawled: result.crawlResults?.length ?? 0,
        urls_successful: result.crawlResults?.filter((r) => r.success).length ?? 0,
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
