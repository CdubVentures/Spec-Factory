// WHY: Transform-phase extraction plugin. Calls the Python crawl4ai sidecar
// (via ctx.crawl4aiClient injected by runProduct), persists the result as one
// JSON artifact per URL under {runDir}/extractions/crawl4ai/<hash12>.json.
//
// Emits no candidates — this phase only collects raw artifacts. Bundle +
// LLM-reviewer phases (later) read these files and produce field candidates.

import { persistCrawl4aiArtifact } from './crawl4aiArtifactPersister.js';
import { computePageContentHash } from '../../../../shared/contentHash.js';

export const crawl4aiPlugin = {
  name: 'crawl4ai',
  phase: 'transform',
  concurrent: true,

  summarize(result) {
    return {
      status: result?.status || 'unknown',
      table_count: Number(result?.metrics?.table_count || 0),
      word_count: Number(result?.metrics?.word_count || 0),
      path: result?.path || null,
    };
  },

  async onExtract(ctx) {
    if (!ctx?.settings?.crawl4aiEnabled) {
      return { status: 'skipped', reason: 'disabled' };
    }
    const client = ctx.crawl4aiClient;
    if (!client || typeof client.extract !== 'function') {
      return { status: 'skipped', reason: 'no_client' };
    }
    const html = typeof ctx.html === 'string' ? ctx.html : '';
    if (!html) return { status: 'skipped', reason: 'no_html' };

    const extractionsDir = ctx.extractionsDir;
    if (!extractionsDir) return { status: 'skipped', reason: 'no_extractions_dir' };

    const contentHash = computePageContentHash(html);
    if (!contentHash) return { status: 'skipped', reason: 'no_content_hash' };

    const features = ['markdown', 'lists'];
    if (ctx.settings?.crawl4aiTableExtractEnabled !== false) features.push('tables');

    let response;
    try {
      response = await client.extract({ url: ctx.finalUrl || ctx.url, html, features });
    } catch (err) {
      const reason = err?.message || String(err);
      ctx.logger?.error?.('crawl4ai_extract_failed', {
        url: ctx.finalUrl || ctx.url,
        reason,
      });
      return { status: 'failed', reason };
    }

    if (!response || response.ok !== true) {
      const reason = response?.error || 'sidecar_not_ok';
      ctx.logger?.error?.('crawl4ai_extract_failed', {
        url: ctx.finalUrl || ctx.url,
        reason,
      });
      return { status: 'failed', reason };
    }

    const artifact = persistCrawl4aiArtifact({
      result: response,
      extractionsDir,
      contentHash,
      url: ctx.url,
      finalUrl: ctx.finalUrl,
    });
    if (!artifact) {
      return { status: 'failed', reason: 'persist_failed' };
    }

    // WHY: Supplement the runner's extraction_plugin_completed event with
    // filenames + sizes so the Documents tab per-URL artifact row shows
    // real byte counts. Mirrors the screenshot + video emit pattern in
    // crawlSession — runtimeOpsExtractionPluginBuilders joins these back
    // onto the matching entry by (plugin, url, worker_id).
    ctx.logger?.info?.('extraction_artifacts_persisted', {
      plugin: 'crawl4ai',
      url: ctx.url,
      worker_id: ctx.workerId || '',
      filenames: [artifact.filename],
      file_sizes: [artifact.size_bytes],
    });

    ctx.logger?.info?.('crawl4ai_extract_completed', {
      url: ctx.finalUrl || ctx.url,
      path: artifact.file_path,
      table_count: artifact.table_count,
      word_count: artifact.word_count,
    });

    return {
      status: 'ok',
      path: artifact.file_path,
      filename: artifact.filename,
      content_hash: contentHash,
      metrics: {
        table_count: artifact.table_count,
        word_count: artifact.word_count,
        size_bytes: artifact.size_bytes,
      },
    };
  },
};
