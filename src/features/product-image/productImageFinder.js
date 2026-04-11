/**
 * Product Image Finder — orchestrator.
 *
 * Step 1: Calls the LLM to discover direct-download URLs for product views.
 * Step 2: Downloads each image to `.workspace/products/{pid}/images/`.
 * Step 3: Validates dimensions against the min-width knob.
 * Step 4: Merges results into JSON + SQL.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import { buildLlmCallDeps } from '../../core/llm/buildLlmCallDeps.js';
import { resolvePhaseModel } from '../../core/llm/client/routing.js';
import { stripCompositeKey } from '../../core/llm/routeResolver.js';
import {
  buildProductImageFinderPrompt,
  createProductImageFinderCallLlm,
} from './productImageLlmAdapter.js';
import { readProductImages, mergeProductImageDiscovery } from './productImageStore.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { configInt } from '../../shared/settingsAccessor.js';

const COOLDOWN_DAYS = 30;

/**
 * Download a file from a URL to a local path.
 * Returns { ok, bytes, contentType, error }.
 */
function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      // Follow redirects (up to 5)
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href;
        return downloadFile(redirectUrl, destPath).then(resolve);
      }

      if (res.statusCode !== 200) {
        res.resume();
        return resolve({ ok: false, error: `HTTP ${res.statusCode}` });
      }

      const contentType = res.headers['content-type'] || '';
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      const stream = fs.createWriteStream(destPath);
      let bytes = 0;
      res.on('data', (chunk) => { bytes += chunk.length; });
      res.pipe(stream);
      stream.on('finish', () => resolve({ ok: true, bytes, contentType }));
      stream.on('error', (err) => resolve({ ok: false, error: err.message }));
    });

    req.on('error', (err) => resolve({ ok: false, error: err.message }));
    req.setTimeout(30000, () => {
      req.destroy();
      resolve({ ok: false, error: 'timeout' });
    });
  });
}

/**
 * Infer file extension from URL or content-type.
 */
function inferExtension(url, contentType) {
  // Try URL extension first
  const urlPath = new URL(url, 'https://placeholder').pathname;
  const ext = path.extname(urlPath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext)) {
    return ext === '.jpeg' ? '.jpg' : ext;
  }
  // Fall back to content-type
  if (contentType.includes('png')) return '.png';
  if (contentType.includes('webp')) return '.webp';
  if (contentType.includes('gif')) return '.gif';
  if (contentType.includes('avif')) return '.avif';
  return '.jpg'; // default
}

/**
 * Run the Product Image Finder for a single product.
 */
export async function runProductImageFinder({
  product,
  appDb,
  specDb,
  config = {},
  logger = null,
  productRoot,
  _callLlmOverride = null,
  onStageAdvance = null,
  onModelResolved = null,
  onStreamChunk = null,
}) {
  productRoot = productRoot || defaultProductRoot();
  const configModel = resolvePhaseModel(config, 'imageFinder') || String(config.llmModelPlan || 'unknown');
  let actualModel = stripCompositeKey(configModel);
  let actualFallbackUsed = false;

  const wrappedOnModelResolved = (info) => {
    if (info.model) actualModel = info.model;
    if (info.isFallback) actualFallbackUsed = true;
    onModelResolved?.(info);
  };

  // Read per-category view settings from the module's own settings table
  const finderStore = specDb.getFinderStore('productImageFinder');
  const view1 = finderStore.getSetting('view1') || 'top';
  const view2 = finderStore.getSetting('view2') || 'left';
  // Global quality gate from runtime config
  const minWidth = configInt(config, 'pifMinWidth') || 800;

  // Read product's color/edition data from CEF
  const cefData = (() => {
    try {
      const cefPath = path.join(productRoot, product.product_id, 'color_edition.json');
      return JSON.parse(fs.readFileSync(cefPath, 'utf8'));
    } catch { return null; }
  })();

  const colors = cefData?.selected?.colors || [];
  const colorNames = cefData?.selected?.color_names || {};
  const editions = cefData?.selected?.editions || {};
  const defaultColor = cefData?.selected?.default_color || colors[0] || '';

  // Read existing runs for historical context
  const existing = readProductImages({ productId: product.product_id, productRoot });
  const previousRuns = Array.isArray(existing?.runs) ? existing.runs : [];

  // Build LLM caller
  const callLlm = _callLlmOverride
    ? (domainArgs) => _callLlmOverride(domainArgs, { onModelResolved: wrappedOnModelResolved })
    : createProductImageFinderCallLlm(buildLlmCallDeps({
        config,
        logger,
        onPhaseChange: onStageAdvance ? (phase) => {
          if (phase === 'writer') onStageAdvance('Writer');
        } : undefined,
        onModelResolved: wrappedOnModelResolved,
        onStreamChunk,
      }));

  // Call LLM
  let response;
  try {
    response = await callLlm({
      product, colors, colorNames, editions, defaultColor,
      view1, view2, minWidth, previousRuns,
    });
    onStageAdvance?.('Download');
  } catch (err) {
    logger?.error?.('product_image_finder_llm_failed', {
      product_id: product.product_id,
      error: err.message,
    });
    return {
      images: [], fallbackUsed: false, rejected: true,
      rejections: [{ reason_code: 'llm_error', message: err.message }],
    };
  }

  const llmImages = Array.isArray(response?.images) ? response.images : [];

  // Download each image
  const imagesDir = path.join(productRoot, product.product_id, 'images');
  const downloadedImages = [];
  const downloadErrors = [];

  for (const img of llmImages) {
    if (!img.url || !img.view) continue;

    try {
      const ext = inferExtension(img.url, '');
      const filename = `${img.view}${ext}`;
      const destPath = path.join(imagesDir, filename);

      const result = await downloadFile(img.url, destPath);
      if (result.ok) {
        // Re-check extension from content-type if needed
        const actualExt = inferExtension(img.url, result.contentType || '');
        let finalFilename = filename;
        if (actualExt !== ext) {
          const newPath = path.join(imagesDir, `${img.view}${actualExt}`);
          try {
            fs.renameSync(destPath, newPath);
            finalFilename = `${img.view}${actualExt}`;
          } catch { /* keep original */ }
        }

        downloadedImages.push({
          view: img.view,
          filename: finalFilename,
          url: img.url,
          source_page: img.source_page || '',
          alt_text: img.alt_text || '',
          bytes: result.bytes,
          downloaded_at: new Date().toISOString(),
        });
      } else {
        downloadErrors.push({ view: img.view, url: img.url, error: result.error });
      }
    } catch (err) {
      downloadErrors.push({ view: img.view, url: img.url, error: err.message });
    }
  }

  onStageAdvance?.('Validate');

  const selected = { images: downloadedImages };

  const emptyLog = { urls_checked: [], queries_run: [], notes: [] };
  const storedResponse = {
    images: downloadedImages,
    download_errors: downloadErrors,
    discovery_log: response?.discovery_log || emptyLog,
  };

  // Cooldown + timestamps
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const ranAt = now.toISOString();

  // Capture prompt snapshot
  const systemPrompt = buildProductImageFinderPrompt({
    product, colors, colorNames, editions, defaultColor,
    view1, view2, minWidth, previousRuns,
  });
  const userMessage = JSON.stringify({
    brand: product.brand || '',
    model: product.model || '',
    variant: product.variant || '',
  });

  // Merge into JSON (durable memory — write first)
  const merged = mergeProductImageDiscovery({
    productId: product.product_id,
    productRoot,
    newDiscovery: {
      category: product.category,
      cooldown_until: cooldownUntil,
      last_ran_at: ranAt,
    },
    run: {
      model: actualModel,
      fallback_used: actualFallbackUsed,
      selected,
      prompt: { system: systemPrompt, user: userMessage },
      response: storedResponse,
    },
  });

  // Project run into SQL
  const store = specDb.getFinderStore('productImageFinder');
  const latestRun = merged.runs[merged.runs.length - 1];
  store.insertRun({
    category: product.category,
    product_id: product.product_id,
    run_number: latestRun.run_number,
    ran_at: ranAt,
    model: actualModel,
    fallback_used: actualFallbackUsed,
    cooldown_until: cooldownUntil,
    selected,
    prompt: { system: systemPrompt, user: userMessage },
    response: storedResponse,
  });

  // Upsert SQL summary
  store.upsert({
    category: product.category,
    product_id: product.product_id,
    images: downloadedImages.map(i => ({ view: i.view, filename: i.filename })),
    image_count: downloadedImages.length,
    cooldown_until: cooldownUntil,
    latest_ran_at: ranAt,
    run_count: merged.run_count,
  });

  return {
    images: downloadedImages,
    download_errors: downloadErrors,
    fallbackUsed: actualFallbackUsed,
    rejected: false,
  };
}
