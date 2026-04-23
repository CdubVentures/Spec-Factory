// WHY: Persists crawl4ai extraction output to
// {runDir}/extractions/crawl4ai/<hash12>.json as plain JSON (no gzip —
// downstream bundle + LLM phases read these directly). Mirrors
// htmlArtifactPersister.js atomic write pattern so repeated runs on the
// same content hash are idempotent.
//
// The file is keyed by the HTML content hash (same 12-char prefix as
// html_file in buildCrawlCheckpoint.mapSource) so later phases can join
// extraction bundles to their source HTML.

import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {{
 *   result: { ok: boolean, markdown?: string, tables?: Array, lists?: Array, metrics?: object, error?: string },
 *   extractionsDir: string,
 *   contentHash: string,
 *   url: string,
 *   finalUrl?: string,
 * }} opts
 * @returns {{ filename: string, file_path: string, size_bytes: number, table_count: number, word_count: number } | null}
 */
export function persistCrawl4aiArtifact({ result, extractionsDir, contentHash, url, finalUrl }) {
  if (!contentHash || !extractionsDir) return null;
  if (!result || typeof result !== 'object') return null;
  if (!result.ok) return null;

  const hash12 = String(contentHash).slice(0, 12);
  if (!hash12) return null;

  const pluginDir = path.join(extractionsDir, 'crawl4ai');
  const filename = `${hash12}.json`;
  const filePath = path.join(pluginDir, filename);

  const tables = Array.isArray(result.tables) ? result.tables : [];
  const lists = Array.isArray(result.lists) ? result.lists : [];
  const jsonLd = Array.isArray(result.json_ld) ? result.json_ld : [];
  const microdata = Array.isArray(result.microdata) ? result.microdata : [];
  const opengraph = (result.opengraph && typeof result.opengraph === 'object') ? result.opengraph : {};
  const metrics = (result.metrics && typeof result.metrics === 'object') ? result.metrics : {};

  const payload = {
    schema_version: 2, // bumped for structured-data fields (json_ld, microdata, opengraph)
    plugin: 'crawl4ai',
    url: String(url || ''),
    final_url: String(finalUrl || url || ''),
    content_hash: String(contentHash),
    captured_at: new Date().toISOString(),
    markdown: typeof result.markdown === 'string' ? result.markdown : '',
    tables,
    lists,
    json_ld: jsonLd,
    microdata,
    opengraph,
    metrics: {
      duration_ms: Number(metrics.duration_ms || 0),
      word_count: Number(metrics.word_count || 0),
      table_count: Number(metrics.table_count || tables.length || 0),
      json_ld_count: Number(metrics.json_ld_count || jsonLd.length || 0),
      microdata_count: Number(metrics.microdata_count || microdata.length || 0),
      has_product_jsonld: Boolean(metrics.has_product_jsonld),
    },
  };

  const serialized = JSON.stringify(payload);
  const sizeBytes = Buffer.byteLength(serialized, 'utf8');

  try {
    fs.mkdirSync(pluginDir, { recursive: true });
    // Temp-then-rename keeps readers from ever seeing a half-written file.
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, serialized);
    fs.renameSync(tmpPath, filePath);
  } catch {
    return null;
  }

  return {
    filename,
    file_path: filePath,
    size_bytes: sizeBytes,
    table_count: payload.metrics.table_count,
    word_count: payload.metrics.word_count,
  };
}
