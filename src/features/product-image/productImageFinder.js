/**
 * Product Image Finder — variant-aware orchestrator.
 *
 * Each color variant and edition gets its own LLM call + download.
 * Supports single-variant runs and batch "run all" mode.
 *
 * Variant key format:
 *   "color:{atom}"    — standard color variant
 *   "edition:{slug}"  — named edition
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

/* ── Download helpers ──────────────────────────────────────────────── */

function downloadFile(url, destPath) {
  return new Promise((resolve) => {
    const proto = url.startsWith('https') ? https : http;
    const req = proto.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return downloadFile(new URL(res.headers.location, url).href, destPath).then(resolve);
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
    req.setTimeout(30000, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
  });
}

function inferExtension(url, contentType) {
  try {
    const ext = path.extname(new URL(url, 'https://x').pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif'].includes(ext)) {
      return ext === '.jpeg' ? '.jpg' : ext;
    }
  } catch { /* */ }
  if (contentType?.includes('png')) return '.png';
  if (contentType?.includes('webp')) return '.webp';
  return '.jpg';
}

/* ── Variant list builder ──────────────────────────────────────────── */

/**
 * Build the list of variants to process from CEF data.
 * Each variant gets: { key, label, type }
 *
 * - Standard colors: key = "color:{atom}", label = marketing name or atom
 * - Editions: key = "edition:{slug}", label = display_name
 * - Colors that exist ONLY in editions are skipped (covered by edition runs)
 */
export function buildVariantList({ colors = [], colorNames = {}, editions = {} }) {
  const editionColorSet = new Set();
  for (const ed of Object.values(editions)) {
    for (const c of (ed.colors || [])) editionColorSet.add(c);
  }

  const variants = [];

  // Standard colors (skip colors that only appear in editions)
  for (const atom of colors) {
    // A color is "edition-only" if it appears in an edition but is NOT a base product color
    // beyond being merged in by mergeEditionColorsInto. We can't easily distinguish here,
    // so we include all colors in the colors array — the LLM will handle it.
    const label = colorNames[atom] || atom;
    variants.push({ key: `color:${atom}`, label, type: 'color' });
  }

  // Editions
  for (const [slug, ed] of Object.entries(editions)) {
    variants.push({ key: `edition:${slug}`, label: ed.display_name || slug, type: 'edition' });
  }

  return variants;
}

/* ── Single-variant runner ─────────────────────────────────────────── */

async function runSingleVariant({
  product, variant, view1, view2, minWidth,
  callLlm, productRoot, specDb, actualModel, actualFallbackUsed,
  logger,
}) {
  let response;
  try {
    response = await callLlm({
      product,
      variantLabel: variant.label,
      variantType: variant.type,
      view1, view2, minWidth,
    });
  } catch (err) {
    logger?.error?.('pif_llm_failed', { product_id: product.product_id, variant: variant.key, error: err.message });
    return { images: [], errors: [{ view: '*', url: '', error: err.message }], variant };
  }

  const llmImages = Array.isArray(response?.images) ? response.images : [];
  const imagesDir = path.join(productRoot, product.product_id, 'images');
  const downloaded = [];
  const errors = [];

  // Sanitize variant key for filenames: "color:black" → "color-black"
  const filePrefix = variant.key.replace(/:/g, '-');

  for (const img of llmImages) {
    if (!img.url || !img.view) continue;
    try {
      const ext = inferExtension(img.url, '');
      const filename = `${filePrefix}_${img.view}${ext}`;
      const destPath = path.join(imagesDir, filename);
      const result = await downloadFile(img.url, destPath);

      if (result.ok) {
        const actualExt = inferExtension(img.url, result.contentType || '');
        let finalFilename = filename;
        if (actualExt !== ext) {
          const newPath = path.join(imagesDir, `${filePrefix}_${img.view}${actualExt}`);
          try { fs.renameSync(destPath, newPath); finalFilename = `${filePrefix}_${img.view}${actualExt}`; } catch { /* */ }
        }
        downloaded.push({
          view: img.view,
          filename: finalFilename,
          url: img.url,
          source_page: img.source_page || '',
          alt_text: img.alt_text || '',
          bytes: result.bytes,
          variant_key: variant.key,
          variant_label: variant.label,
          variant_type: variant.type,
          downloaded_at: new Date().toISOString(),
        });
      } else {
        errors.push({ view: img.view, url: img.url, error: result.error });
      }
    } catch (err) {
      errors.push({ view: img.view, url: img.url || '', error: err.message });
    }
  }

  return {
    images: downloaded,
    errors,
    variant,
    discovery_log: response?.discovery_log || { urls_checked: [], queries_run: [], notes: [] },
  };
}

/* ── Main orchestrator ─────────────────────────────────────────────── */

/**
 * Run the Product Image Finder for a single product.
 *
 * @param {object} opts
 * @param {string} [opts.variantKey] — if provided, run only this variant. Otherwise run all.
 * @param {Function} [opts.onVariantProgress] — (completed, total, variantKey) => void
 */
export async function runProductImageFinder({
  product,
  appDb,
  specDb,
  config = {},
  logger = null,
  productRoot,
  variantKey = null,
  _callLlmOverride = null,
  onStageAdvance = null,
  onModelResolved = null,
  onStreamChunk = null,
  onVariantProgress = null,
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

  // Read per-category view settings
  const finderStore = specDb.getFinderStore('productImageFinder');
  const view1 = finderStore.getSetting('view1') || 'top';
  const view2 = finderStore.getSetting('view2') || 'left';
  const minWidth = configInt(config, 'pifMinWidth') || 800;

  // Read CEF data — gate: must have colors
  const cefPath = path.join(productRoot, product.product_id, 'color_edition.json');
  let cefData;
  try {
    cefData = JSON.parse(fs.readFileSync(cefPath, 'utf8'));
  } catch {
    return { images: [], rejected: true, rejections: [{ reason_code: 'no_cef_data', message: 'Run CEF first — no color data found' }] };
  }

  const colors = cefData?.selected?.colors || [];
  if (colors.length === 0) {
    return { images: [], rejected: true, rejections: [{ reason_code: 'no_colors', message: 'No colors discovered — run CEF first' }] };
  }

  const colorNames = cefData?.selected?.color_names || {};
  const editions = cefData?.selected?.editions || {};
  const allVariants = buildVariantList({ colors, colorNames, editions });

  // Filter to single variant if requested
  const variants = variantKey
    ? allVariants.filter(v => v.key === variantKey)
    : allVariants;

  if (variants.length === 0) {
    return { images: [], rejected: true, rejections: [{ reason_code: 'unknown_variant', message: `Variant not found: ${variantKey}` }] };
  }

  // Build LLM caller
  const callLlm = _callLlmOverride
    ? (domainArgs) => _callLlmOverride(domainArgs, { onModelResolved: wrappedOnModelResolved })
    : createProductImageFinderCallLlm(buildLlmCallDeps({
        config, logger,
        onPhaseChange: onStageAdvance ? (phase) => { if (phase === 'writer') onStageAdvance('Writer'); } : undefined,
        onModelResolved: wrappedOnModelResolved,
        onStreamChunk,
      }));

  // Run each variant sequentially
  const allImages = [];
  const allErrors = [];
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    onStageAdvance?.(`${variant.type === 'edition' ? 'Ed' : 'Color'}: ${variant.label}`);
    onVariantProgress?.(i, variants.length, variant.key);

    const result = await runSingleVariant({
      product, variant, view1, view2, minWidth,
      callLlm, productRoot, specDb, actualModel, actualFallbackUsed, logger,
    });

    allImages.push(...result.images);
    allErrors.push(...result.errors);

    // Persist each variant run individually
    const ranAt = new Date().toISOString();
    const selected = { images: result.images };
    const systemPrompt = buildProductImageFinderPrompt({
      product, variantLabel: variant.label, variantType: variant.type,
      view1, view2, minWidth,
    });

    const merged = mergeProductImageDiscovery({
      productId: product.product_id,
      productRoot,
      newDiscovery: { category: product.category, cooldown_until: cooldownUntil, last_ran_at: ranAt },
      run: {
        model: actualModel,
        fallback_used: actualFallbackUsed,
        selected,
        prompt: { system: systemPrompt, user: JSON.stringify({ brand: product.brand, model: product.model, variant: variant.key }) },
        response: { images: result.images, download_errors: result.errors, discovery_log: result.discovery_log, variant_key: variant.key, variant_label: variant.label },
      },
    });

    // SQL projection
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
      prompt: latestRun.prompt,
      response: latestRun.response,
    });

    store.upsert({
      category: product.category,
      product_id: product.product_id,
      images: merged.selected.images.map(img => ({ view: img.view, filename: img.filename, variant_key: img.variant_key })),
      image_count: merged.selected.images.length,
      cooldown_until: cooldownUntil,
      latest_ran_at: ranAt,
      run_count: merged.run_count,
    });
  }

  onVariantProgress?.(variants.length, variants.length, 'done');
  onStageAdvance?.('Complete');

  return {
    images: allImages,
    download_errors: allErrors,
    variants_processed: variants.length,
    fallbackUsed: actualFallbackUsed,
    rejected: false,
  };
}
