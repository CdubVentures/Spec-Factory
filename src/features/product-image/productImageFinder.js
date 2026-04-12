/**
 * Product Image Finder — variant-aware orchestrator.
 *
 * Each color variant and edition gets its own LLM call + download.
 * Supports single-variant runs and batch "run all" mode.
 *
 * Variant key format:
 *   "color:{atom}"    — standard color variant
 *   "edition:{slug}"  — named edition
 *
 * Filename convention (aligned with Photoshop cut-out pipeline):
 *   {view}-{variant_slug}{ext}
 *   e.g. top-black.jpg, left-glacier-blue.png, sangle-cod-bo6-edition.jpg
 *   Duplicates: top-black-2.jpg, top-black-3.jpg
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
  resolveViewConfig,
  migrateFromLegacyViews,
  CANONICAL_VIEW_KEYS,
  accumulateVariantDiscoveryLog,
} from './productImageLlmAdapter.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { readProductImages, mergeProductImageDiscovery } from './productImageStore.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { configInt } from '../../shared/settingsAccessor.js';

const COOLDOWN_DAYS = 30;

/* ── Image dimension reader (header-only) ─────────────────────────── */

/**
 * Read image dimensions from file header bytes without loading full image.
 * Supports JPEG, PNG, WebP, GIF.
 */
export function readImageDimensions(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(32);
    fs.readSync(fd, buf, 0, 32, 0);
    fs.closeSync(fd);

    // PNG: IHDR at offset 16 = width (4 bytes BE), offset 20 = height (4 bytes BE)
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }

    // GIF: bytes 6-9 contain width (LE 16-bit) and height (LE 16-bit)
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) {
      return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
    }

    // WebP: RIFF header, then VP8 chunk at byte 12
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
      // VP8 lossy: width at 26, height at 28 (LE 16-bit, masked)
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x20) {
        const fd2 = fs.openSync(filePath, 'r');
        const wbuf = Buffer.alloc(10);
        fs.readSync(fd2, wbuf, 0, 10, 26);
        fs.closeSync(fd2);
        return { width: wbuf.readUInt16LE(0) & 0x3FFF, height: wbuf.readUInt16LE(2) & 0x3FFF };
      }
      // VP8L lossless: dimensions at byte 21
      if (buf[12] === 0x56 && buf[13] === 0x50 && buf[14] === 0x38 && buf[15] === 0x4C) {
        const fd2 = fs.openSync(filePath, 'r');
        const wbuf = Buffer.alloc(4);
        fs.readSync(fd2, wbuf, 0, 4, 21);
        fs.closeSync(fd2);
        const bits = wbuf.readUInt32LE(0);
        return { width: (bits & 0x3FFF) + 1, height: ((bits >> 14) & 0x3FFF) + 1 };
      }
    }

    // JPEG: scan for SOF0/SOF2 markers (0xFF 0xC0 or 0xFF 0xC2)
    const fd2 = fs.openSync(filePath, 'r');
    const jbuf = Buffer.alloc(65536);
    const bytesRead = fs.readSync(fd2, jbuf, 0, 65536, 0);
    fs.closeSync(fd2);
    for (let i = 0; i < bytesRead - 9; i++) {
      if (jbuf[i] === 0xFF && (jbuf[i + 1] === 0xC0 || jbuf[i + 1] === 0xC2)) {
        return { height: jbuf.readUInt16BE(i + 5), width: jbuf.readUInt16BE(i + 7) };
      }
    }

    return null;
  } catch { return null; }
}

/* ── Download helpers ──────────────────────────────────────────────── */

/**
 * Normalize a URL before fetching.
 *
 * CDNs serve resized/compressed variants via URL params. The LLM often
 * returns these CDN URLs which give us tiny thumbnails. Strip sizing
 * params to request the original full-resolution source.
 *
 * Known patterns:
 * - Best Buy: .jpg%3BmaxHeight%3D1920%3BmaxWidth%3D900 or .jpg;maxHeight=1920;maxWidth=900
 * - Shopify (Corsair retail): ?width=1946 or _1946x.png
 * - Cloudinary: /w_800,h_600/ or /f_auto,q_auto/
 */
function normalizeImageUrl(raw) {
  let url = raw;

  try {
    const parsed = new URL(url);

    // 1. Best Buy: strip semicolon-delimited sizing from pathname
    //    .jpg;maxHeight=1920;maxWidth=900 → .jpg
    //    Also handles encoded form: .jpg%3BmaxHeight%3D1920
    let pathname = decodeURIComponent(parsed.pathname);
    const semiIdx = pathname.search(/;(max|min)(Height|Width)=/i);
    if (semiIdx > 0) {
      pathname = pathname.slice(0, semiIdx);
    }
    parsed.pathname = pathname;

    // 2. Shopify: strip width/height resize params, keep version
    if (parsed.hostname.includes('shopify') || parsed.hostname.includes('retail.corsair')) {
      parsed.searchParams.delete('width');
      parsed.searchParams.delete('height');
    }

    // 3. Strip format-override params that force low-quality output
    if (parsed.searchParams.get('format') === 'webp') {
      parsed.searchParams.delete('format');
    }

    url = parsed.href;
  } catch { /* use as-is */ }

  return url;
}

const DOWNLOAD_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  // WHY: Do NOT advertise avif/webp — CDNs auto-convert and serve tiny compressed
  // versions. Request the original format (usually JPEG/PNG) for maximum file size.
  'Accept': 'image/png,image/jpeg,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'identity',
};

function downloadFile(url, destPath) {
  const normalizedUrl = normalizeImageUrl(url);
  // Set Referer to the origin of the image URL (CDNs often check this)
  let referer = '';
  try { referer = new URL(normalizedUrl).origin + '/'; } catch { /* */ }
  const headers = { ...DOWNLOAD_HEADERS, ...(referer ? { Referer: referer } : {}) };

  return new Promise((resolve) => {
    const proto = normalizedUrl.startsWith('https') ? https : http;
    const req = proto.get(normalizedUrl, { headers }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
        return downloadFile(new URL(res.headers.location, normalizedUrl).href, destPath).then(resolve);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve({ ok: false, error: `HTTP ${res.statusCode}` });
      }
      const contentType = res.headers['content-type'] || '';

      // Guard: if the response isn't an image content-type, don't save it
      if (contentType && !contentType.startsWith('image/')) {
        res.resume();
        return resolve({ ok: false, error: `not an image: ${contentType}` });
      }

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

/* ── Filename helpers ────────────────────────────────────────────── */

/**
 * Slugify a variant label for use in filenames.
 *   "Glacier Blue"  → "glacier-blue"
 *   "black+red"     → "black-red"
 *   "CoD: BO6 Ed."  → "cod-bo6-ed"
 */
function slugifyLabel(label) {
  return (label || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'unknown';
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
/**
 * Build the list of search variants from CEF data.
 *
 * Every entry in the colors array is a colorway — single atom or "+" combo.
 * If a combo matches an edition, search by edition display name.
 * If a color has a marketing name, use that.
 * Otherwise use the atom/combo string.
 */
export function buildVariantList({ colors = [], colorNames = {}, editions = {} }) {
  // Build reverse lookup: combo string → edition display name
  const comboToEdition = new Map();
  for (const [slug, ed] of Object.entries(editions)) {
    const combo = (ed.colors || [])[0];
    if (combo) comboToEdition.set(combo, { slug, displayName: ed.display_name || slug });
  }

  const variants = [];
  for (const entry of colors) {
    const edition = comboToEdition.get(entry);
    if (edition) {
      variants.push({ key: `edition:${edition.slug}`, label: edition.displayName, type: 'edition' });
    } else {
      const name = colorNames[entry];
      const hasName = name && name.toLowerCase() !== entry.toLowerCase();
      variants.push({ key: `color:${entry}`, label: hasName ? name : entry, type: 'color' });
    }
  }

  return variants;
}

/* ── Single-variant runner ─────────────────────────────────────────── */

async function runSingleVariant({
  product, variant, viewConfig, minWidth, minHeight, minFileSize,
  callLlm, productRoot, specDb, actualModel, actualFallbackUsed,
  logger, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery,
}) {
  let response;
  try {
    response = await callLlm({
      product,
      variantLabel: variant.label,
      variantType: variant.type,
      viewConfig, minWidth, minHeight,
      siblingsExcluded: siblingsExcluded || [],
      familyModelCount: familyModelCount || 1,
      ambiguityLevel: ambiguityLevel || 'easy',
      previousDiscovery: previousDiscovery || { urlsChecked: [], queriesRun: [] },
    });
  } catch (err) {
    logger?.error?.('pif_llm_failed', { product_id: product.product_id, variant: variant.key, error: err.message });
    return { images: [], errors: [{ view: '*', url: '', error: err.message }], variant };
  }

  const llmImages = Array.isArray(response?.images) ? response.images : [];
  const imagesDir = path.join(productRoot, product.product_id, 'images');
  const downloaded = [];
  const errors = [];

  // Filename: {view}-{variant_slug}{-N}{ext}
  const variantSlug = slugifyLabel(variant.label);
  const viewCounts = {}; // track per-view counts for dedup numbering

  for (const img of llmImages) {
    if (!img.url || !img.view) continue;

    // Normalize view to canonical (lowercase, strip whitespace)
    const view = (img.view || '').toLowerCase().trim();
    if (!CANONICAL_VIEW_KEYS.includes(view)) {
      errors.push({ view: img.view, url: img.url, error: `non-canonical view "${img.view}" skipped` });
      continue;
    }

    try {
      // Dedup numbering: first = no suffix, 2nd+ = -2, -3, etc.
      viewCounts[view] = (viewCounts[view] || 0) + 1;
      const n = viewCounts[view];
      const suffix = n > 1 ? `-${n}` : '';

      const ext = inferExtension(img.url, '');
      const filename = `${view}-${variantSlug}${suffix}${ext}`;
      const destPath = path.join(imagesDir, filename);
      const result = await downloadFile(img.url, destPath);

      if (result.ok) {
        const actualExt = inferExtension(img.url, result.contentType || '');
        let finalFilename = filename;
        if (actualExt !== ext) {
          const corrected = `${view}-${variantSlug}${suffix}${actualExt}`;
          const newPath = path.join(imagesDir, corrected);
          try { fs.renameSync(destPath, newPath); finalFilename = corrected; } catch { /* */ }
        }

        const finalPath = path.join(imagesDir, finalFilename);

        // Quality gate: reject and delete below-quality images
        const dims = readImageDimensions(finalPath);
        const belowMinSize = minFileSize > 0 && result.bytes < minFileSize;
        const belowMinDims = dims && ((minWidth > 0 && dims.width < minWidth) || (minHeight > 0 && dims.height < minHeight));

        if (belowMinSize || belowMinDims) {
          // Delete the file — we don't keep below-quality images
          try { fs.unlinkSync(finalPath); } catch { /* */ }
          const reason = belowMinSize
            ? `file size ${result.bytes} < min ${minFileSize}`
            : `dimensions ${dims?.width}x${dims?.height} < min ${minWidth}x${minHeight}`;
          errors.push({ view, url: img.url, error: `quality rejected: ${reason}` });
          continue;
        }

        downloaded.push({
          view,
          filename: finalFilename,
          url: img.url,
          source_page: img.source_page || '',
          alt_text: img.alt_text || '',
          bytes: result.bytes,
          width: dims?.width || 0,
          height: dims?.height || 0,
          quality_pass: true,
          variant_key: variant.key,
          variant_label: variant.label,
          variant_type: variant.type,
          downloaded_at: new Date().toISOString(),
        });
      } else {
        errors.push({ view, url: img.url, error: result.error });
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

  // Read per-category settings
  const finderStore = specDb.getFinderStore('productImageFinder');

  // View config: new viewConfig setting → legacy view1/view2 migration → category defaults
  const rawViewConfig = finderStore.getSetting('viewConfig');
  const legacyView1 = finderStore.getSetting('view1');
  const legacyView2 = finderStore.getSetting('view2');

  let viewConfig;
  if (rawViewConfig && rawViewConfig.trim()) {
    viewConfig = resolveViewConfig(rawViewConfig, product.category);
  } else if (legacyView1 || legacyView2) {
    viewConfig = migrateFromLegacyViews(legacyView1, legacyView2, product.category);
  } else {
    viewConfig = resolveViewConfig('', product.category);
  }

  const minWidth = parseInt(finderStore.getSetting('minWidth'), 10) || 800;
  const minHeight = parseInt(finderStore.getSetting('minHeight'), 10) || 600;
  const minFileSize = parseInt(finderStore.getSetting('minFileSize'), 10) || 50000;

  // Resolve identity ambiguity from product family
  let familyModelCount = 1;
  let ambiguityLevel = 'easy';
  try {
    const ambiguitySnapshot = await resolveIdentityAmbiguitySnapshot({
      config,
      category: product.category,
      identityLock: { brand: product.brand, base_model: product.base_model },
      specDb,
    });
    familyModelCount = ambiguitySnapshot.family_model_count || 1;
    ambiguityLevel = ambiguitySnapshot.ambiguity_level || 'easy';
  } catch {
    // Non-fatal — fall back to easy
  }

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

  // Read siblings from CEF runs (identity context)
  const siblingsExcluded = [];
  for (const run of (cefData?.runs || [])) {
    for (const s of (run.response?.siblings_excluded || run.selected?.siblings_excluded || [])) {
      if (s && !siblingsExcluded.includes(s)) siblingsExcluded.push(s);
    }
  }

  // Filter to single variant if requested
  const variants = variantKey
    ? allVariants.filter(v => v.key === variantKey)
    : allVariants;

  if (variants.length === 0) {
    return { images: [], rejected: true, rejections: [{ reason_code: 'unknown_variant', message: `Variant not found: ${variantKey}` }] };
  }

  // Read previous PIF runs for discovery log feedback
  const pifDoc = readProductImages({ productId: product.product_id, productRoot });
  const previousPifRuns = Array.isArray(pifDoc?.runs) ? pifDoc.runs : [];

  // Build LLM caller
  const callLlm = _callLlmOverride
    ? (domainArgs) => _callLlmOverride(domainArgs, { onModelResolved: wrappedOnModelResolved })
    : createProductImageFinderCallLlm(buildLlmCallDeps({
        config, logger,
        onPhaseChange: onStageAdvance ? (phase) => { if (phase === 'writer') onStageAdvance('Writer'); } : undefined,
        onModelResolved: wrappedOnModelResolved,
        onStreamChunk,
      }));

  // Fire all variants concurrently with 1s stagger
  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const STAGGER_MS = 1000;

  // Fire all variants with 1s stagger, persist each as it completes
  const allImages = [];
  const allErrors = [];

  const variantPromises = variants.map((variant, i) => {
    const delay = i * STAGGER_MS;
    return new Promise((resolve) => setTimeout(resolve, delay)).then(async () => {
      onStageAdvance?.(`${variant.type === 'edition' ? 'Ed' : 'Color'}: ${variant.label}`);
      onVariantProgress?.(i, variants.length, variant.key);

      try {
        // Accumulate discovery logs from previous runs for this specific variant
        const previousDiscovery = accumulateVariantDiscoveryLog(previousPifRuns, variant.key);

        const result = await runSingleVariant({
          product, variant, viewConfig, minWidth, minHeight, minFileSize,
          callLlm, productRoot, specDb, actualModel, actualFallbackUsed, logger,
          siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery,
        });

        allImages.push(...result.images);
        allErrors.push(...result.errors);

        // Persist immediately on completion
        const ranAt = new Date().toISOString();
        const selected = { images: result.images };
        const systemPrompt = buildProductImageFinderPrompt({
          product, variantLabel: variant.label, variantType: variant.type,
          viewConfig, minWidth, minHeight, siblingsExcluded,
          familyModelCount, ambiguityLevel, previousDiscovery,
        });

        const merged = mergeProductImageDiscovery({
          productId: product.product_id,
          productRoot,
          newDiscovery: { category: product.category, cooldown_until: cooldownUntil, last_ran_at: ranAt },
          run: {
            model: actualModel,
            fallback_used: actualFallbackUsed,
            selected,
            prompt: { system: systemPrompt, user: JSON.stringify({ brand: product.brand, model: product.model, base_model: product.base_model, variant: variant.key }) },
            response: { images: result.images, download_errors: result.errors, discovery_log: result.discovery_log, variant_key: variant.key, variant_label: variant.label },
          },
        });

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
      } catch (err) {
        logger?.error?.('pif_variant_failed', { product_id: product.product_id, variant: variant.key, error: err.message });
        allErrors.push({ view: '*', url: '', error: `variant ${variant.key} failed: ${err.message}` });
      }
    });
  });

  await Promise.all(variantPromises);

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
