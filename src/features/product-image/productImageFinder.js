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
  buildHeroImageFinderPrompt,
  createProductImageFinderCallLlm,
  createHeroImageFinderCallLlm,
  resolveViewConfig,
  resolveViewBudget,
  migrateFromLegacyViews,
  CANONICAL_VIEW_KEYS,
  accumulateVariantDiscoveryLog,
} from './productImageLlmAdapter.js';
import { evaluateCarousel } from './carouselStrategy.js';
import { resolveViewQualityConfig } from './viewQualityDefaults.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { readProductImages, mergeProductImageDiscovery } from './productImageStore.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { configInt } from '../../shared/settingsAccessor.js';
import { processImage, loadModel, releaseModel, setInferenceConcurrency } from './imageProcessor.js';
import { ensureModelReady } from './modelDownloader.js';

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

// WHY: The stem is the extension-free base name (e.g. "top-black-2").
// It is the canonical identity for an image — matching, dedup, and
// original↔master pairing all key on stem, never on full filename.
export function imageStem(filename) {
  if (!filename) return '';
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : filename;
}

// WHY: After deletions, numbering gaps appear (e.g. -1 gone, -2 survives).
// Counting files would produce a suffix that collides with a survivor.
// Instead, find the highest existing N and increment from there.
export function maxDedupN(prefix, filenames) {
  let max = 0;
  for (const f of filenames) {
    const stem = imageStem(f);
    if (stem === prefix) { max = Math.max(max, 1); }
    else if (stem.startsWith(prefix + '-')) {
      const n = parseInt(stem.slice(prefix.length + 1), 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return max;
}

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
  product, variant, viewConfig, viewQualityMap,
  callLlm, productRoot, specDb, actualModel, actualFallbackUsed,
  logger, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery,
  rmbgSession = null,
  promptOverride = '',
  mode = 'view',
}) {
  // WHY: hero mode needs hero-specific quality thresholds in the prompt,
  // not the top-view thresholds. The quality gate at download time already
  // uses per-view thresholds, but the prompt should tell the LLM the right minimums.
  const qualityKey = mode === 'hero' ? 'hero' : 'top';
  const promptMinWidth = viewQualityMap[qualityKey]?.minWidth || 600;
  const promptMinHeight = viewQualityMap[qualityKey]?.minHeight || 400;

  let response;
  try {
    response = await callLlm({
      product,
      variantLabel: variant.label,
      variantType: variant.type,
      viewConfig,
      minWidth: promptMinWidth,
      minHeight: promptMinHeight,
      viewQualityMap,
      siblingsExcluded: siblingsExcluded || [],
      familyModelCount: familyModelCount || 1,
      ambiguityLevel: ambiguityLevel || 'easy',
      previousDiscovery: previousDiscovery || { urlsChecked: [], queriesRun: [] },
      promptOverride,
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
  // WHY: Track highest existing N per view so that deletions (gaps) don't
  // cause suffix collisions. maxDedupN returns the highest N on disk;
  // new downloads increment from there.
  const viewMaxN = {};
  try {
    const existingFiles = fs.readdirSync(imagesDir);
    for (const vk of [...CANONICAL_VIEW_KEYS, 'hero']) {
      viewMaxN[vk] = maxDedupN(`${vk}-${variantSlug}`, existingFiles);
    }
  } catch { /* dir may not exist yet */ }

  for (const img of llmImages) {
    if (!img.url || !img.view) continue;

    // Normalize view to canonical (lowercase, strip whitespace)
    const view = (img.view || '').toLowerCase().trim();
    if (!CANONICAL_VIEW_KEYS.includes(view) && view !== 'hero') {
      errors.push({ view: img.view, url: img.url, error: `non-canonical view "${img.view}" skipped` });
      continue;
    }

    try {
      // Dedup numbering: first = no suffix, 2nd+ = -2, -3, etc.
      viewMaxN[view] = (viewMaxN[view] || 0) + 1;
      const n = viewMaxN[view];
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

        // Quality gate: per-view thresholds reject below-quality images.
        // WHY: dimensions are the primary gate. File size is a fallback for
        // formats where we can't read dimensions. WebP/AVIF compress so well
        // that a 2000x1500 image can be <20KB — rejecting on size alone
        // discards perfectly good high-res images.
        const vq = viewQualityMap[view] || viewQualityMap.hero || { minWidth: 600, minHeight: 400, minFileSize: 30000 };
        const dims = readImageDimensions(finalPath);
        const belowMinDims = dims && ((vq.minWidth > 0 && dims.width < vq.minWidth) || (vq.minHeight > 0 && dims.height < vq.minHeight));
        const belowMinSize = !dims && vq.minFileSize > 0 && result.bytes < vq.minFileSize;

        if (belowMinDims || belowMinSize) {
          try { fs.unlinkSync(finalPath); } catch { /* */ }
          const reason = belowMinDims
            ? `dimensions ${dims?.width}x${dims?.height} < min ${vq.minWidth}x${vq.minHeight}`
            : `file size ${result.bytes} < min ${vq.minFileSize}`;
          errors.push({ view, url: img.url, error: `quality rejected: ${reason} (${view} view)` });
          continue;
        }

        // RMBG post-processing: move raw to originals/, process to master PNG
        const originalExt = path.extname(finalFilename).toLowerCase().replace('.', '');
        const originalsDir = path.join(imagesDir, 'originals');
        fs.mkdirSync(originalsDir, { recursive: true });
        const originalPath = path.join(originalsDir, finalFilename);
        fs.renameSync(finalPath, originalPath);

        const masterFilename = finalFilename.replace(/\.\w+$/, '.png');
        const masterPath = path.join(imagesDir, masterFilename);

        const procResult = await processImage({
          inputPath: originalPath,
          outputPath: masterPath,
          session: rmbgSession,
        });

        // Update metadata from processed result
        const masterBytes = procResult.ok ? procResult.bytes : result.bytes;
        const masterWidth = procResult.ok ? procResult.width : (dims?.width || 0);
        const masterHeight = procResult.ok ? procResult.height : (dims?.height || 0);

        downloaded.push({
          view,
          filename: masterFilename,
          url: img.url,
          source_page: img.source_page || '',
          alt_text: img.alt_text || '',
          bytes: masterBytes,
          width: masterWidth,
          height: masterHeight,
          quality_pass: true,
          variant_key: variant.key,
          variant_label: variant.label,
          variant_type: variant.type,
          downloaded_at: new Date().toISOString(),
          original_filename: finalFilename,
          bg_removed: procResult.ok ? procResult.bg_removed : false,
          original_format: originalExt || 'unknown',
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
 * @param {'view'|'hero'} [opts.mode] — search mode: 'view' for angle-based, 'hero' for promotional images.
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
  mode = 'view',
  _callLlmOverride = null,
  _modelDirOverride = null,
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

  // Per-view quality thresholds
  const viewQualityMap = resolveViewQualityConfig(
    finderStore.getSetting('viewQualityConfig'), product.category, minWidth, minHeight, minFileSize,
  );

  // Carousel strategy settings
  const viewBudget = resolveViewBudget(finderStore.getSetting('viewBudget'), product.category);
  const satisfactionThreshold = parseInt(finderStore.getSetting('satisfactionThreshold'), 10) || 3;
  const heroEnabled = finderStore.getSetting('heroEnabled') !== 'false';
  const heroCount = parseInt(finderStore.getSetting('heroCount'), 10) || 3;
  const viewAttemptBudget = parseInt(finderStore.getSetting('viewAttemptBudget'), 10) || 5;
  const heroAttemptBudget = parseInt(finderStore.getSetting('heroAttemptBudget'), 10) || 3;
  const viewPromptOverride = finderStore.getSetting('viewPromptOverride') || '';
  const heroPromptOverride = finderStore.getSetting('heroPromptOverride') || '';

  // Gate: reject hero mode when heroEnabled is false
  if (mode === 'hero' && !heroEnabled) {
    return { images: [], rejected: true, rejections: [{ reason_code: 'hero_disabled', message: 'Hero search is disabled for this category' }] };
  }

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

  // Build LLM caller (mode-aware: view vs hero)
  const llmDeps = buildLlmCallDeps({
    config, logger,
    onPhaseChange: onStageAdvance ? (phase) => { if (phase === 'writer') onStageAdvance('Writer'); } : undefined,
    onModelResolved: wrappedOnModelResolved,
    onStreamChunk,
  });
  const callLlm = _callLlmOverride
    ? (domainArgs) => _callLlmOverride(domainArgs, { onModelResolved: wrappedOnModelResolved })
    : mode === 'hero'
      ? createHeroImageFinderCallLlm(llmDeps)
      : createProductImageFinderCallLlm(llmDeps);

  // Load RMBG model (once before variant loop)
  const modelDir = _modelDirOverride || path.join(productRoot, '..', 'models', 'rmbg-2.0');
  const modelStatus = await ensureModelReady({ modelDir });
  let rmbgSession = null;
  if (modelStatus.ready) {
    rmbgSession = await loadModel({ modelDir });
  } else {
    logger?.warn?.('rmbg_model_unavailable', { error: modelStatus.error });
  }

  // Configure RMBG inference concurrency from per-category setting
  const rmbgConcurrency = parseInt(finderStore.getSetting('rmbgConcurrency'), 10) || 0;
  if (rmbgConcurrency > 0) setInferenceConcurrency(rmbgConcurrency);

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

        // Strategy engine: determine which views still need images (view mode only)
        let effectiveViewConfig = viewConfig;
        if (mode === 'view') {
          const allSelectedImages = (pifDoc?.selected?.images || []).map((img) => ({
            view: img.view, variant_key: img.variant_key, quality_pass: img.quality_pass !== false,
          }));
          const strategy = evaluateCarousel({
            collectedImages: allSelectedImages,
            viewBudget, satisfactionThreshold, heroEnabled, heroCount,
            variantKey: variant.key,
          });
          // Filter viewConfig to only include unsatisfied views from strategy
          if (strategy.viewsToSearch.length > 0) {
            const needed = new Set(strategy.viewsToSearch);
            effectiveViewConfig = viewConfig.map((v) => ({
              ...v,
              priority: needed.has(v.key) ? true : false,
            })).filter((v) => needed.has(v.key) || v.priority);
            // Keep needed views as priority, drop unneeded ones
            effectiveViewConfig = viewConfig.filter((v) => needed.has(v.key));
          }
        }

        const result = await runSingleVariant({
          product, variant, viewConfig: effectiveViewConfig, viewQualityMap,
          callLlm, productRoot, specDb, actualModel, actualFallbackUsed, logger,
          siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery,
          rmbgSession,
          promptOverride: mode === 'hero' ? heroPromptOverride : viewPromptOverride,
          mode,
        });

        allImages.push(...result.images);
        allErrors.push(...result.errors);

        // Persist immediately on completion
        const ranAt = new Date().toISOString();
        const selected = { images: result.images };
        const promptBuilder = mode === 'hero' ? buildHeroImageFinderPrompt : buildProductImageFinderPrompt;
        const heroQuality = viewQualityMap.hero || {};
        const promptArgs = mode === 'hero'
          ? { product, variantLabel: variant.label, variantType: variant.type, minWidth: heroQuality.minWidth || 600, minHeight: heroQuality.minHeight || 400, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery, promptOverride: heroPromptOverride }
          : { product, variantLabel: variant.label, variantType: variant.type, viewConfig: effectiveViewConfig, minWidth, minHeight, viewQualityMap, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery, promptOverride: viewPromptOverride };
        const systemPrompt = promptBuilder(promptArgs);

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

  // Compute post-run carousel progress for all processed variants
  const updatedPifDoc = readProductImages({ productId: product.product_id, productRoot });
  const updatedImages = (updatedPifDoc?.selected?.images || []).map((img) => ({
    view: img.view, variant_key: img.variant_key, quality_pass: img.quality_pass !== false,
  }));
  const carouselProgress = {};
  for (const v of variants) {
    carouselProgress[v.key] = evaluateCarousel({
      collectedImages: updatedImages,
      viewBudget, satisfactionThreshold, heroEnabled, heroCount,
      variantKey: v.key,
    }).carouselProgress;
  }

  return {
    images: allImages,
    download_errors: allErrors,
    variants_processed: variants.length,
    fallbackUsed: actualFallbackUsed,
    rejected: false,
    carouselProgress,
    carouselSettings: { viewAttemptBudget, heroAttemptBudget, heroEnabled },
  };
}

/* ── Carousel Loop Orchestrator ──────────────────────────────────── */

/**
 * Run the carousel loop for a product: views (focused, one at a time) then
 * heroes, then done. Each LLM call targets one unsatisfied view as priority
 * but keeps all canonical images returned (side-catches).
 *
 * @param {object} opts
 * @param {string} [opts.variantKey] — single variant, or null for all
 * @param {Function} [opts.onLoopProgress] — ({ callNumber, estimatedRemaining, variant, focusView, mode }) => void
 */
export async function runCarouselLoop({
  product,
  appDb,
  specDb,
  config = {},
  logger = null,
  productRoot,
  variantKey = null,
  _callLlmOverride = null,
  _modelDirOverride = null,
  onStageAdvance = null,
  onModelResolved = null,
  onStreamChunk = null,
  onLoopProgress = null,
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

  const viewQualityMap = resolveViewQualityConfig(
    finderStore.getSetting('viewQualityConfig'), product.category, minWidth, minHeight, minFileSize,
  );

  const viewBudget = resolveViewBudget(finderStore.getSetting('viewBudget'), product.category);
  const satisfactionThreshold = parseInt(finderStore.getSetting('satisfactionThreshold'), 10) || 3;
  const heroEnabled = finderStore.getSetting('heroEnabled') !== 'false';
  const heroCount = parseInt(finderStore.getSetting('heroCount'), 10) || 3;
  const viewAttemptBudget = parseInt(finderStore.getSetting('viewAttemptBudget'), 10) || 5;
  const heroAttemptBudget = parseInt(finderStore.getSetting('heroAttemptBudget'), 10) || 3;
  const viewPromptOverride = finderStore.getSetting('viewPromptOverride') || '';
  const heroPromptOverride = finderStore.getSetting('heroPromptOverride') || '';

  // Resolve identity ambiguity
  let familyModelCount = 1;
  let ambiguityLevel = 'easy';
  try {
    const snap = await resolveIdentityAmbiguitySnapshot({
      config, category: product.category,
      identityLock: { brand: product.brand, base_model: product.base_model },
      specDb,
    });
    familyModelCount = snap.family_model_count || 1;
    ambiguityLevel = snap.ambiguity_level || 'easy';
  } catch { /* non-fatal */ }

  // Read CEF data
  const cefPath = path.join(productRoot, product.product_id, 'color_edition.json');
  let cefData;
  try {
    cefData = JSON.parse(fs.readFileSync(cefPath, 'utf8'));
  } catch {
    return { images: [], download_errors: [], totalLlmCalls: 0, rejected: true, rejections: [{ reason_code: 'no_cef_data', message: 'Run CEF first — no color data found' }] };
  }

  const colors = cefData?.selected?.colors || [];
  if (colors.length === 0) {
    return { images: [], download_errors: [], totalLlmCalls: 0, rejected: true, rejections: [{ reason_code: 'no_colors', message: 'No colors discovered — run CEF first' }] };
  }

  const colorNames = cefData?.selected?.color_names || {};
  const editions = cefData?.selected?.editions || {};
  const allVariants = buildVariantList({ colors, colorNames, editions });

  const siblingsExcluded = [];
  for (const run of (cefData?.runs || [])) {
    for (const s of (run.response?.siblings_excluded || run.selected?.siblings_excluded || [])) {
      if (s && !siblingsExcluded.includes(s)) siblingsExcluded.push(s);
    }
  }

  const variants = variantKey
    ? allVariants.filter(v => v.key === variantKey)
    : allVariants;

  if (variants.length === 0) {
    return { images: [], download_errors: [], totalLlmCalls: 0, rejected: true, rejections: [{ reason_code: 'unknown_variant', message: `Variant not found: ${variantKey}` }] };
  }

  // Load RMBG model once
  const modelDir = _modelDirOverride || path.join(productRoot, '..', 'models', 'rmbg-2.0');
  const modelStatus = await ensureModelReady({ modelDir });
  let rmbgSession = null;
  if (modelStatus.ready) {
    rmbgSession = await loadModel({ modelDir });
  }

  const now = new Date();
  const cooldownUntil = new Date(now.getTime() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const allImages = [];
  const allErrors = [];
  let totalLlmCalls = 0;

  // Shared: execute one LLM call, persist, report progress
  async function executeOneCall({ variant, callMode, focusView, estimatedRemaining }) {
    // Re-read fresh state from disk (discovery log accumulates across all calls)
    const pifDoc = readProductImages({ productId: product.product_id, productRoot });
    const previousPifRuns = Array.isArray(pifDoc?.runs) ? pifDoc.runs : [];
    const previousDiscovery = accumulateVariantDiscoveryLog(previousPifRuns, variant.key);

    const llmDeps = buildLlmCallDeps({
      config, logger,
      onPhaseChange: onStageAdvance ? (phase) => { if (phase === 'writer') onStageAdvance('Writer'); } : undefined,
      onModelResolved: wrappedOnModelResolved,
      onStreamChunk,
    });

    const callLlm = _callLlmOverride
      ? (domainArgs) => _callLlmOverride(domainArgs, { onModelResolved: wrappedOnModelResolved })
      : callMode === 'hero'
        ? createHeroImageFinderCallLlm(llmDeps)
        : createProductImageFinderCallLlm(llmDeps);

    let effectiveViewConfig = viewConfig;
    if (callMode === 'view' && focusView) {
      effectiveViewConfig = viewConfig.map((v) => ({
        ...v,
        priority: v.key === focusView,
      }));
    }

    const result = await runSingleVariant({
      product, variant, viewConfig: effectiveViewConfig, viewQualityMap,
      callLlm, productRoot, specDb, actualModel, actualFallbackUsed, logger,
      siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery,
      rmbgSession,
      promptOverride: callMode === 'hero' ? heroPromptOverride : viewPromptOverride,
      mode: callMode,
    });

    allImages.push(...result.images);
    allErrors.push(...result.errors);
    totalLlmCalls++;

    // Persist immediately
    const ranAt = new Date().toISOString();
    const selected = { images: result.images };
    const promptBuilder = callMode === 'hero' ? buildHeroImageFinderPrompt : buildProductImageFinderPrompt;
    const heroQuality = viewQualityMap.hero || {};
    const promptArgs = callMode === 'hero'
      ? { product, variantLabel: variant.label, variantType: variant.type, minWidth: heroQuality.minWidth || 600, minHeight: heroQuality.minHeight || 400, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery, promptOverride: heroPromptOverride }
      : { product, variantLabel: variant.label, variantType: variant.type, viewConfig: effectiveViewConfig, minWidth, minHeight, viewQualityMap, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery, promptOverride: viewPromptOverride };
    const systemPrompt = promptBuilder(promptArgs);

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

    onLoopProgress?.({
      callNumber: totalLlmCalls,
      estimatedRemaining: Math.max(0, estimatedRemaining - 1),
      variant: variant.key,
      variantLabel: variant.label,
      focusView,
      mode: callMode,
    });
  }

  // Process variants sequentially for clean progress reporting
  for (const variant of variants) {
    onStageAdvance?.(`${variant.type === 'edition' ? 'Ed' : 'Color'}: ${variant.label}`);

    // Check if carousel is already complete for this variant
    const initialDoc = readProductImages({ productId: product.product_id, productRoot });
    const initialImages = (initialDoc?.selected?.images || []).map((img) => ({
      view: img.view, variant_key: img.variant_key, quality_pass: img.quality_pass !== false,
    }));
    const initialStrategy = evaluateCarousel({
      collectedImages: initialImages, viewBudget, satisfactionThreshold,
      heroEnabled, heroCount, variantKey: variant.key,
    });

    if (initialStrategy.isComplete) {
      // Forced cycle: 1 call per budget view + 1 hero call to accumulate more candidates
      const forcedTotal = viewBudget.length + (heroEnabled ? 1 : 0);
      for (const view of viewBudget) {
        await executeOneCall({ variant, callMode: 'view', focusView: view, estimatedRemaining: forcedTotal - totalLlmCalls });
      }
      if (heroEnabled) {
        await executeOneCall({ variant, callMode: 'hero', focusView: null, estimatedRemaining: 0 });
      }
    } else {
      // Normal loop: views (focused) → heroes → done
      const viewAttemptCounts = {};
      let heroAttemptCount = 0;

      while (true) {
        const pifDoc = readProductImages({ productId: product.product_id, productRoot });
        const collectedImages = (pifDoc?.selected?.images || []).map((img) => ({
          view: img.view, variant_key: img.variant_key, quality_pass: img.quality_pass !== false,
        }));

        const strategy = evaluateCarousel({
          collectedImages, viewBudget, satisfactionThreshold,
          heroEnabled, heroCount, variantKey: variant.key,
          viewAttemptBudget, viewAttemptCounts,
          heroAttemptBudget, heroAttemptCount,
        });

        if (strategy.isComplete) break;

        const focusView = strategy.focusView;
        const callMode = strategy.mode;

        await executeOneCall({ variant, callMode, focusView, estimatedRemaining: strategy.estimatedCallsRemaining });

        if (callMode === 'view' && focusView) {
          viewAttemptCounts[focusView] = (viewAttemptCounts[focusView] || 0) + 1;
        } else if (callMode === 'hero') {
          heroAttemptCount++;
        }
      }
    }
  }

  onStageAdvance?.('Complete');

  // Final carousel progress
  const finalDoc = readProductImages({ productId: product.product_id, productRoot });
  const finalImages = (finalDoc?.selected?.images || []).map((img) => ({
    view: img.view, variant_key: img.variant_key, quality_pass: img.quality_pass !== false,
  }));
  const carouselProgress = {};
  for (const v of variants) {
    carouselProgress[v.key] = evaluateCarousel({
      collectedImages: finalImages,
      viewBudget, satisfactionThreshold, heroEnabled, heroCount,
      variantKey: v.key,
    }).carouselProgress;
  }

  return {
    images: allImages,
    download_errors: allErrors,
    variants_processed: variants.length,
    totalLlmCalls,
    fallbackUsed: actualFallbackUsed,
    rejected: false,
    carouselProgress,
    carouselSettings: { viewAttemptBudget, heroAttemptBudget, heroEnabled },
  };
}
