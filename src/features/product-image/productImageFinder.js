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
import { buildBillingOnUsage } from '../../billing/costLedger.js';
import {
  resolveModelTracking,
  resolveAmbiguityContext,
  buildFinderLlmCaller,
} from '../../core/finder/finderOrchestrationHelpers.js';
import {
  buildProductImageFinderPrompt,
  buildHeroImageFinderPrompt,
  createProductImageFinderCallLlm,
  createHeroImageFinderCallLlm,
  resolveViewConfig,
  resolveViewBudget,
  CANONICAL_VIEW_KEYS,
} from './productImageLlmAdapter.js';
import { accumulateDiscoveryLog } from '../../core/finder/discoveryLog.js';
import { runPerVariant } from '../../core/finder/runPerVariant.js';
import { evaluateCarousel } from './carouselStrategy.js';
import { resolveViewQualityConfig } from './viewQualityDefaults.js';
import { resolveViewAttemptBudgets } from './viewAttemptDefaults.js';
import {
  resolveSingleRunSecondaryHints,
  resolveLoopRunSecondaryHints,
} from './secondaryHintsDefaults.js';
import { resolveViewPrompt, viewPromptSettingKey } from './viewPromptDefaults.js';
import { resolveIdentityAmbiguitySnapshot } from '../indexing/orchestration/shared/identityHelpers.js';
import { readProductImages, mergeProductImageDiscovery } from './productImageStore.js';
import { matchVariant } from './variantMatch.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';
import { processImage, processHeroImage, loadModel, releaseModel, setInferenceConcurrency } from './imageProcessor.js';
import { ensureModelReady } from './modelDownloader.js';
import { computeFileContentHash } from '../../shared/contentHash.js';

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
  // WHY: Dual-rule mirrors buildVariantRegistry. Only MULTI-ATOM combos dedupe
  // against editions — for combos like "black+red+yellow", the colors[] entry
  // IS the edition's body. Single-atom entries are always plain colorways:
  // "black" is the base black SKU, distinct from any edition that happens to
  // be black-bodied. Pre-fix regression (M75 Wireless): single-atom editions
  // absorbed the plain color, dropping a search variant and routing edition
  // images onto the plain color slot.
  const multiAtomComboToEdition = new Map();
  for (const [slug, ed] of Object.entries(editions)) {
    const combo = (ed.colors || [])[0];
    if (combo && combo.includes('+')) {
      multiAtomComboToEdition.set(combo, { slug, displayName: ed.display_name || slug });
    }
  }

  const variants = [];
  const seenEditionSlugs = new Set();

  for (const entry of colors) {
    const edition = multiAtomComboToEdition.get(entry);
    if (edition) {
      seenEditionSlugs.add(edition.slug);
      variants.push({ key: `edition:${edition.slug}`, label: edition.displayName, type: 'edition' });
    } else {
      const name = colorNames[entry];
      const hasName = name && name.toLowerCase() !== entry.toLowerCase();
      variants.push({ key: `color:${entry}`, label: hasName ? name : entry, type: 'color' });
    }
  }

  // Single-atom editions and editions whose combo isn't in colors[] land here.
  for (const [slug, ed] of Object.entries(editions)) {
    if (seenEditionSlugs.has(slug)) continue;
    const displayName = ed.display_name || slug;
    variants.push({ key: `edition:${slug}`, label: displayName, type: 'edition' });
  }

  return variants;
}

/* ── Single-variant runner ─────────────────────────────────────────── */

async function runSingleVariant({
  product, variant, priorityViews = [], additionalViews = [], viewQualityMap,
  callLlm, productRoot, specDb, actualModel, actualFallbackUsed,
  logger, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery,
  rmbgSession = null,
  promptOverride = '',
  mode = 'view',
  onPhaseChange = null,
  alreadyDownloadedUrls = new Set(),
}) {
  // WHY: Self-heal dedup sets when caller did not provide them.
  // The carousel loop path (executeOneCall) does not pass alreadyDownloadedUrls,
  // so every call would start empty. Instead of fixing every caller, reconstruct
  // from disk: read product_images.json, filter to this variant, build both sets.
  const alreadyDownloadedHashes = new Set();
  const hashToFilename = new Map();
  {
    let variantImages = [];
    try {
      const existingDoc = readProductImages({ productId: product.product_id, productRoot });
      const existingImages = existingDoc?.selected?.images || [];
      variantImages = existingImages.filter(img =>
        matchVariant(img, { variantId: variant.variant_id, variantKey: variant.key })
      );
    } catch { /* no existing images — empty sets are correct */ }

    if (alreadyDownloadedUrls.size === 0) {
      for (const img of variantImages) {
        if (img.url) alreadyDownloadedUrls.add(normalizeImageUrl(img.url));
      }
    }

    for (const img of variantImages) {
      if (img.content_hash) {
        alreadyDownloadedHashes.add(img.content_hash);
        hashToFilename.set(img.content_hash, img.filename || img.original_filename || 'unknown');
      }
    }
  }

  // WHY: hero mode needs hero-specific quality thresholds in the prompt,
  // not the top-view thresholds. The quality gate at download time already
  // uses per-view thresholds, but the prompt should tell the LLM the right minimums.
  const qualityKey = mode === 'hero' ? 'hero' : 'top';
  const promptMinWidth = viewQualityMap[qualityKey]?.minWidth || 600;
  const promptMinHeight = viewQualityMap[qualityKey]?.minHeight || 400;

  let response, usage;
  try {
    ({ result: response, usage } = await callLlm({
      product,
      variantLabel: variant.label,
      variantType: variant.type,
      priorityViews,
      additionalViews,
      minWidth: promptMinWidth,
      minHeight: promptMinHeight,
      viewQualityMap,
      siblingsExcluded: siblingsExcluded || [],
      familyModelCount: familyModelCount || 1,
      ambiguityLevel: ambiguityLevel || 'easy',
      previousDiscovery: previousDiscovery || { urlsChecked: [], queriesRun: [] },
      promptOverride,
    }));
  } catch (err) {
    logger?.error?.('pif_llm_failed', { product_id: product.product_id, variant: variant.key, error: err.message });
    return { images: [], errors: [{ view: '*', url: '', error: err.message }], variant };
  }

  const llmImages = Array.isArray(response?.images) ? response.images : [];
  onPhaseChange?.('Download');
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

    // WHY: Hard URL dedup gate. The LLM ignores prompt hints to avoid
    // previously-downloaded URLs. This rejects at the download boundary
    // so the same image is never fetched twice for the same variant.
    const normUrl = normalizeImageUrl(img.url);
    if (alreadyDownloadedUrls.has(normUrl)) {
      errors.push({ view, url: img.url, error: 'duplicate URL: already downloaded for this variant' });
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

        // Content hash gate: reject byte-identical files before expensive RMBG.
        // WHY: CDN resize params (e.g., ?width=1946 vs ?width=1445) produce
        // different URLs but serve identical bytes. Hash the downloaded file
        // and check against known hashes for this variant.
        const fileBuffer = fs.readFileSync(finalPath);
        const fileHash = computeFileContentHash(fileBuffer);
        if (fileHash && alreadyDownloadedHashes.has(fileHash)) {
          try { fs.unlinkSync(finalPath); } catch { /* */ }
          const existingFile = hashToFilename.get(fileHash) || 'unknown';
          errors.push({ view, url: img.url, error: `duplicate content: identical to ${existingFile}` });
          continue;
        }
        if (fileHash) {
          alreadyDownloadedHashes.add(fileHash);
          hashToFilename.set(fileHash, finalFilename);
        }

        // WHY: Hero images are contextual/lifestyle shots where the background
        // is intentional. RMBG would destroy the scene. Skip bg removal entirely.
        const skipRmbg = view === 'hero';

        onPhaseChange?.('Processing');
        const originalExt = path.extname(finalFilename).toLowerCase().replace('.', '');
        const originalsDir = path.join(imagesDir, 'originals');
        fs.mkdirSync(originalsDir, { recursive: true });
        const originalPath = path.join(originalsDir, finalFilename);
        fs.renameSync(finalPath, originalPath);

        const masterFilename = finalFilename.replace(/\.\w+$/, '.png');
        const masterPath = path.join(imagesDir, masterFilename);

        const procResult = skipRmbg
          ? await processHeroImage({ inputPath: originalPath, outputPath: masterPath })
          : await processImage({ inputPath: originalPath, outputPath: masterPath, session: rmbgSession });

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
          variant_id: variant.variant_id || null,
          variant_key: variant.key,
          variant_label: variant.label,
          variant_type: variant.type,
          downloaded_at: new Date().toISOString(),
          original_filename: finalFilename,
          bg_removed: skipRmbg ? true : (procResult.ok ? procResult.bg_removed : false),
          original_format: originalExt || 'unknown',
          content_hash: fileHash || '',
        });
        alreadyDownloadedUrls.add(normUrl);
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
    usage,
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
  onQueueWait = null,
  onLlmCallComplete = null,
  onVariantProgress = null,
  signal,
}) {
  productRoot = productRoot || defaultProductRoot();
  const _mt = resolveModelTracking({ config, phaseKey: 'imageFinder', onModelResolved });
  const wrappedOnModelResolved = _mt.wrappedOnModelResolved;

  // Read per-category settings
  const finderStore = specDb.getFinderStore('productImageFinder');
  const urlHistoryEnabled = finderStore.getSetting('urlHistoryEnabled') === 'true';
  const queryHistoryEnabled = finderStore.getSetting('queryHistoryEnabled') === 'true';

  // View config: explicit viewConfig setting → category defaults
  const rawViewConfig = finderStore.getSetting('viewConfig');
  const viewConfig = resolveViewConfig(rawViewConfig || '', product.category);

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
  const viewAttemptBudgets = resolveViewAttemptBudgets(
    finderStore.getSetting('viewAttemptBudgets'), product.category, viewBudget, viewAttemptBudget,
  );
  const heroAttemptBudget = parseInt(finderStore.getSetting('heroAttemptBudget'), 10) || 3;
  const viewPromptOverride = finderStore.getSetting('viewPromptOverride') || '';
  const heroPromptOverride = finderStore.getSetting('heroPromptOverride') || '';

  // Single-run secondary hints: views listed in ADDITIONAL alongside the priority views.
  const singleRunHintKeys = resolveSingleRunSecondaryHints(
    finderStore.getSetting('singleRunSecondaryHints') || '', product.category,
  );

  // Gate: reject hero mode when heroEnabled is false
  if (mode === 'hero' && !heroEnabled) {
    return { images: [], rejected: true, rejections: [{ reason_code: 'hero_disabled', message: 'Hero search is disabled for this category' }] };
  }

  const { familyModelCount, ambiguityLevel, siblingModels } = await resolveAmbiguityContext({
    config, category: product.category, brand: product.brand,
    baseModel: product.base_model, currentModel: product.model,
    specDb, resolveFn: resolveIdentityAmbiguitySnapshot,
  });

  // Read siblings from CEF runs (identity context — still from JSON) BEFORE
  // merging with siblingModels to avoid TDZ on siblingsExcluded.
  const cefPath = path.join(productRoot, product.product_id, 'color_edition.json');
  let cefData;
  try { cefData = JSON.parse(fs.readFileSync(cefPath, 'utf8')); } catch { cefData = null; }

  const siblingsExcluded = [];
  for (const run of (cefData?.runs || [])) {
    for (const s of (run.response?.siblings_excluded || run.selected?.siblings_excluded || [])) {
      if (s && !siblingsExcluded.includes(s)) siblingsExcluded.push(s);
    }
  }

  // WHY: Merge DB-known sibling model names with LLM-discovered siblings.
  for (const m of siblingModels) {
    if (m && !siblingsExcluded.includes(m)) siblingsExcluded.push(m);
  }

  // WHY: Read variants from SQL (SSOT) to pre-check before expensive RMBG model load.
  // The runner also loads variants, but this short-circuit avoids the ~140MB ONNX
  // download + load on the no-variants / unknown-variant rejection paths.
  const dbVariantsPre = specDb.variants?.listActive(product.product_id) || [];
  if (dbVariantsPre.length === 0) {
    return { images: [], rejected: true, rejections: [{ reason_code: 'no_cef_data', message: 'Run CEF first — no color data found' }] };
  }
  if (variantKey && !dbVariantsPre.some((v) => v.variant_key === variantKey)) {
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
    onQueueWait,
    signal,
    onUsage: appDb ? buildBillingOnUsage({ config, appDb, category: product.category, productId: product.product_id }) : undefined,
  });
  const callLlmFactory = mode === 'hero' ? createHeroImageFinderCallLlm : createProductImageFinderCallLlm;
  const callLlm = buildFinderLlmCaller({ _callLlmOverride, wrappedOnModelResolved, createCallLlm: callLlmFactory, llmDeps });

  // Load RMBG model (once before variant loop)
  const modelDir = _modelDirOverride || path.join(productRoot, '..', 'models', 'rmbg-2.0');
  const hfToken = config?.hfToken || '';
  const modelStatus = await ensureModelReady({ modelDir, token: hfToken });
  let rmbgSession = null;
  if (modelStatus.ready) {
    rmbgSession = await loadModel({ modelDir });
  } else {
    logger?.warn?.('rmbg_model_unavailable', { error: modelStatus.error });
  }

  // Configure RMBG inference concurrency from per-category setting
  const rmbgConcurrency = parseInt(finderStore.getSetting('rmbgConcurrency'), 10) || 0;
  if (rmbgConcurrency > 0) setInferenceConcurrency(rmbgConcurrency);

  const ranAt = new Date().toISOString();
  const STAGGER_MS = 1000;

  // Per-variant body: discovery + carousel strategy + LLM call + download/RMBG + persist.
  // Called by runPerVariant for each variant; return value is aggregated below.
  async function produceForVariant(variant) {
    // Universal discovery-log history — scope: variant + mode (view vs hero).
    // View-mode runs don't leak URLs to hero-mode runs and vice versa.
    const pifSuppRows = (finderStore.listSuppressions?.(product.product_id) || [])
      .filter((s) => s.variant_id === (variant.variant_id || '') && s.mode === mode);
    const previousDiscovery = accumulateDiscoveryLog(previousPifRuns, {
      runMatcher: (r) => {
        const rId = r.response?.variant_id;
        const rKey = r.response?.variant_key;
        const variantMatch = (variant.variant_id && rId) ? rId === variant.variant_id : rKey === variant.key;
        return variantMatch && r.response?.mode === mode;
      },
      includeUrls: urlHistoryEnabled,
      includeQueries: queryHistoryEnabled,
      suppressions: {
        urlsChecked: new Set(pifSuppRows.filter((s) => s.kind === 'url').map((s) => s.item)),
        queriesRun: new Set(pifSuppRows.filter((s) => s.kind === 'query').map((s) => s.item)),
      },
    });

    const variantImages = (pifDoc?.selected?.images || []).filter(img => matchVariant(img, { variantId: variant.variant_id, variantKey: variant.key }));
    const alreadyDownloadedUrls = new Set(variantImages.map(img => normalizeImageUrl(img.url)).filter(Boolean));

    // Single-run prompt composition:
    //   PRIORITY = priority views from viewConfig (GUI order), role='priority'.
    //   ADDITIONAL = singleRunSecondaryHints, role='additional',
    //                filtered to never duplicate a priority view.
    // Each entry's description text comes from resolveViewPrompt with the
    // appropriate role so per-role user overrides flow through cleanly.
    const priorityViews = viewConfig
      .filter((v) => v.priority)
      .map((v) => ({
        key: v.key,
        description: resolveViewPrompt({
          role: 'priority', category: product.category, view: v.key,
          dbOverride: finderStore.getSetting(viewPromptSettingKey('priority', v.key)) || '',
        }),
      }));
    const priorityKeySet = new Set(priorityViews.map((v) => v.key));
    const additionalViews = singleRunHintKeys
      .filter((k) => !priorityKeySet.has(k))
      .map((k) => ({
        key: k,
        description: resolveViewPrompt({
          role: 'additional', category: product.category, view: k,
          dbOverride: finderStore.getSetting(viewPromptSettingKey('additional', k)) || '',
        }),
      }));

    const promptBuilder = mode === 'hero' ? buildHeroImageFinderPrompt : buildProductImageFinderPrompt;
    const heroQuality = viewQualityMap.hero || {};
    const promptArgs = mode === 'hero'
      ? { product, variantLabel: variant.label, variantType: variant.type, minWidth: heroQuality.minWidth || 600, minHeight: heroQuality.minHeight || 400, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery, promptOverride: heroPromptOverride }
      : { product, variantLabel: variant.label, variantType: variant.type, priorityViews, additionalViews, minWidth, minHeight, viewQualityMap, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery, promptOverride: viewPromptOverride };
    const systemPrompt = promptBuilder(promptArgs);
    const userMsg = JSON.stringify({ brand: product.brand, model: product.model, base_model: product.base_model, variant: variant.key });

    const variantStartedAt = new Date().toISOString();
    const variantStartMs = Date.now();

    onLlmCallComplete?.({
      prompt: { system: systemPrompt, user: userMsg },
      response: null,
      model: _mt.actualModel,
      isFallback: _mt.actualFallbackUsed,
      thinking: _mt.actualThinking,
      webSearch: _mt.actualWebSearch,
      effortLevel: _mt.actualEffortLevel,
      accessMode: _mt.actualAccessMode,
      variant: variant.label,
      mode,
      label: mode === 'hero' ? 'Discovery Hero' : 'Discovery',
    });

    const result = await runSingleVariant({
      product, variant, priorityViews, additionalViews, viewQualityMap,
      callLlm, productRoot, specDb, actualModel: _mt.actualModel, actualFallbackUsed: _mt.actualFallbackUsed, logger,
      siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery,
      rmbgSession,
      promptOverride: mode === 'hero' ? heroPromptOverride : viewPromptOverride,
      mode,
      onPhaseChange: onStageAdvance,
      alreadyDownloadedUrls,
    });

    const variantDurationMs = Date.now() - variantStartMs;

    const selected = { images: result.images };
    const responsePayload = { mode, started_at: variantStartedAt, duration_ms: variantDurationMs, images: result.images, download_errors: result.errors, discovery_log: result.discovery_log, variant_id: variant.variant_id || null, variant_key: variant.key, variant_label: variant.label };

    onLlmCallComplete?.({
      prompt: { system: systemPrompt, user: userMsg },
      response: responsePayload,
      model: _mt.actualModel,
      isFallback: _mt.actualFallbackUsed,
      thinking: _mt.actualThinking,
      webSearch: _mt.actualWebSearch,
      effortLevel: _mt.actualEffortLevel,
      accessMode: _mt.actualAccessMode,
      variant: variant.label,
      mode,
      usage: result.usage,
      label: mode === 'hero' ? 'Discovery Hero' : 'Discovery',
    });

    const merged = mergeProductImageDiscovery({
      productId: product.product_id,
      productRoot,
      newDiscovery: { category: product.category, last_ran_at: ranAt },
      run: {
        mode,
        started_at: variantStartedAt,
        duration_ms: variantDurationMs,
        model: _mt.actualModel,
        fallback_used: _mt.actualFallbackUsed,
        effort_level: _mt.actualEffortLevel,
        access_mode: _mt.actualAccessMode,
        thinking: _mt.actualThinking,
        web_search: _mt.actualWebSearch,
        selected,
        prompt: { system: systemPrompt, user: userMsg },
        response: responsePayload,
      },
    });

    const store = specDb.getFinderStore('productImageFinder');
    const latestRun = merged.runs[merged.runs.length - 1];
    store.insertRun({
      category: product.category,
      product_id: product.product_id,
      run_number: latestRun.run_number,
      ran_at: ranAt,
      model: _mt.actualModel,
      fallback_used: _mt.actualFallbackUsed,
      effort_level: _mt.actualEffortLevel,
      access_mode: _mt.actualAccessMode,
      thinking: _mt.actualThinking,
      web_search: _mt.actualWebSearch,
      selected,
      prompt: latestRun.prompt,
      response: latestRun.response,
    });

    store.upsert({
      category: product.category,
      product_id: product.product_id,
      images: merged.selected.images.map(img => ({ view: img.view, filename: img.filename, variant_key: img.variant_key })),
      image_count: merged.selected.images.length,
      latest_ran_at: ranAt,
      run_count: merged.run_count,
    });

    return { images: result.images, errors: result.errors };
  }

  const { perVariantResults, variants } = await runPerVariant({
    specDb, product, variantKey,
    staggerMs: STAGGER_MS,
    onStageAdvance, onVariantProgress, logger,
    produceForVariant,
  });

  const allImages = [];
  const allErrors = [];
  for (const { variant, result, error } of perVariantResults) {
    if (error) {
      logger?.error?.('pif_variant_failed', { product_id: product.product_id, variant: variant.key, error });
      allErrors.push({ view: '*', url: '', error: `variant ${variant.key} failed: ${error}` });
      continue;
    }
    if (result) {
      allImages.push(...result.images);
      allErrors.push(...result.errors);
    }
  }

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
      variantKey: v.key, variantId: v.variant_id,
    }).carouselProgress;
  }

  return {
    images: allImages,
    download_errors: allErrors,
    variants_processed: variants.length,
    fallbackUsed: _mt.actualFallbackUsed,
    rejected: false,
    carouselProgress,
    carouselSettings: { viewAttemptBudget, viewAttemptBudgets, heroAttemptBudget, heroEnabled },
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
 * @param {Function} [opts.onLoopProgress] — ({ callNumber, estimatedRemaining, variant, variantLabel, focusView, mode, variantIndex, variantTotal, carouselProgress }) => void
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
  onQueueWait = null,
  onLlmCallComplete = null,
  onLoopProgress = null,
  signal,
}) {
  productRoot = productRoot || defaultProductRoot();
  const loopId = `loop-${Date.now()}`;
  const _mtLoop = resolveModelTracking({ config, phaseKey: 'imageFinder', onModelResolved });
  const wrappedOnModelResolved = _mtLoop.wrappedOnModelResolved;

  // Read per-category settings
  const finderStore = specDb.getFinderStore('productImageFinder');

  const rawViewConfig = finderStore.getSetting('viewConfig');
  const viewConfig = resolveViewConfig(rawViewConfig || '', product.category);

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
  const viewAttemptBudgets = resolveViewAttemptBudgets(
    finderStore.getSetting('viewAttemptBudgets'), product.category, viewBudget, viewAttemptBudget,
  );
  const heroAttemptBudget = parseInt(finderStore.getSetting('heroAttemptBudget'), 10) || 3;
  const reRunBudgetRaw = parseInt(finderStore.getSetting('reRunBudget'), 10);
  const reRunBudget = Number.isNaN(reRunBudgetRaw) ? 1 : reRunBudgetRaw;
  const viewPromptOverride = finderStore.getSetting('viewPromptOverride') || '';
  const heroPromptOverride = finderStore.getSetting('heroPromptOverride') || '';

  const urlHistoryEnabled = finderStore.getSetting('urlHistoryEnabled') === 'true';
  const queryHistoryEnabled = finderStore.getSetting('queryHistoryEnabled') === 'true';

  // Loop-run secondary hints: views listed in ADDITIONAL alongside the focus view.
  const loopRunHintKeys = resolveLoopRunSecondaryHints(
    finderStore.getSetting('loopRunSecondaryHints') || '', product.category,
  );

  const { familyModelCount, ambiguityLevel, siblingModels } = await resolveAmbiguityContext({
    config, category: product.category, brand: product.brand,
    baseModel: product.base_model, currentModel: product.model,
    specDb, resolveFn: resolveIdentityAmbiguitySnapshot,
  });

  // WHY: Read variants from SQL (SSOT) — not from cefData.selected on disk.
  const dbVariants = specDb.variants?.listActive(product.product_id) || [];
  if (dbVariants.length === 0) {
    return { images: [], download_errors: [], totalLlmCalls: 0, rejected: true, rejections: [{ reason_code: 'no_cef_data', message: 'Run CEF first — no color data found' }] };
  }

  const allVariants = dbVariants.map(v => ({
    variant_id: v.variant_id,
    key: v.variant_key,
    label: v.variant_label,
    type: v.variant_type,
  }));

  // Read siblings from CEF runs (identity context — still from JSON)
  const cefPath = path.join(productRoot, product.product_id, 'color_edition.json');
  let cefData;
  try { cefData = JSON.parse(fs.readFileSync(cefPath, 'utf8')); } catch { cefData = null; }

  const siblingsExcluded = [];
  for (const run of (cefData?.runs || [])) {
    for (const s of (run.response?.siblings_excluded || run.selected?.siblings_excluded || [])) {
      if (s && !siblingsExcluded.includes(s)) siblingsExcluded.push(s);
    }
  }

  // WHY: Merge DB-known sibling model names with LLM-discovered siblings.
  for (const m of siblingModels) {
    if (m && !siblingsExcluded.includes(m)) siblingsExcluded.push(m);
  }

  const variants = variantKey
    ? allVariants.filter(v => v.key === variantKey)
    : allVariants;

  if (variants.length === 0) {
    return { images: [], download_errors: [], totalLlmCalls: 0, rejected: true, rejections: [{ reason_code: 'unknown_variant', message: `Variant not found: ${variantKey}` }] };
  }

  // Load RMBG model once
  const modelDir = _modelDirOverride || path.join(productRoot, '..', 'models', 'rmbg-2.0');
  const hfTokenLoop = config?.hfToken || '';
  const modelStatus = await ensureModelReady({ modelDir, token: hfTokenLoop });
  let rmbgSession = null;
  if (modelStatus.ready) {
    rmbgSession = await loadModel({ modelDir });
  }

  const ranAt = new Date().toISOString();

  const allImages = [];
  const allErrors = [];
  let totalLlmCalls = 0;

  // Shared: execute one LLM call, persist, report progress
  async function executeOneCall({ variant, callMode, focusView, estimatedRemaining, variantIndex, variantTotal, viewAttemptCounts: vatCounts, heroAttemptCount: haCnt }) {
    // WHY: Cycle stage back to Discovery on each new call so the sidebar
    // pipeline animates Discovery → Download → Processing → (next call) Discovery → ...
    onStageAdvance?.('Discovery');

    // WHY: Inject a separator into the LLM stream so the live output panel
    // shows clear boundaries between calls (variant, mode, target view).
    const target = callMode === 'hero' ? 'hero' : (focusView || '?');
    const separator = totalLlmCalls > 0 ? '\n\n' : '';
    onStreamChunk?.({ content: `${separator}── call ${totalLlmCalls + 1} · ${variant.label} · ${callMode}: ${target} ──\n` });

    // Re-read fresh state from disk (discovery log accumulates across all calls)
    const pifDoc = readProductImages({ productId: product.product_id, productRoot });
    const previousPifRuns = Array.isArray(pifDoc?.runs) ? pifDoc.runs : [];
    // Scope matches the current call's mode so view/hero histories stay separate.
    const loopFinderStore = specDb.getFinderStore('productImageFinder');
    const loopSuppRows = (loopFinderStore?.listSuppressions?.(product.product_id) || [])
      .filter((s) => s.variant_id === (variant.variant_id || '') && s.mode === callMode);
    const previousDiscovery = accumulateDiscoveryLog(previousPifRuns, {
      runMatcher: (r) => {
        const rId = r.response?.variant_id;
        const rKey = r.response?.variant_key;
        const variantMatch = (variant.variant_id && rId) ? rId === variant.variant_id : rKey === variant.key;
        return variantMatch && r.response?.mode === callMode;
      },
      includeUrls: urlHistoryEnabled,
      includeQueries: queryHistoryEnabled,
      suppressions: {
        urlsChecked: new Set(loopSuppRows.filter((s) => s.kind === 'url').map((s) => s.item)),
        queriesRun: new Set(loopSuppRows.filter((s) => s.kind === 'query').map((s) => s.item)),
      },
    });

    const llmDeps = buildLlmCallDeps({
      config, logger,
      onPhaseChange: onStageAdvance ? (phase) => { if (phase === 'writer') onStageAdvance('Writer'); } : undefined,
      onModelResolved: wrappedOnModelResolved,
      onStreamChunk,
      onQueueWait,
      signal,
      onUsage: appDb ? buildBillingOnUsage({ config, appDb, category: product.category, productId: product.product_id }) : undefined,
    });

    const callLlmFactory = callMode === 'hero' ? createHeroImageFinderCallLlm : createProductImageFinderCallLlm;
    const callLlm = buildFinderLlmCaller({ _callLlmOverride, wrappedOnModelResolved, createCallLlm: callLlmFactory, llmDeps });

    // Loop-run prompt composition:
    //   PRIORITY = exactly the focusView (one view per call), role='loop'.
    //   ADDITIONAL = loopRunSecondaryHints minus focusView, role='additional'.
    let priorityViews = [];
    let additionalViews = [];
    if (callMode === 'view' && focusView) {
      priorityViews = [{
        key: focusView,
        description: resolveViewPrompt({
          role: 'loop', category: product.category, view: focusView,
          dbOverride: finderStore.getSetting(viewPromptSettingKey('loop', focusView)) || '',
        }),
      }];
      additionalViews = loopRunHintKeys
        .filter((k) => k !== focusView)
        .map((k) => ({
          key: k,
          description: resolveViewPrompt({
            role: 'additional', category: product.category, view: k,
            dbOverride: finderStore.getSetting(viewPromptSettingKey('additional', k)) || '',
          }),
        }));
    }

    // Build prompt BEFORE call so operations modal shows it immediately
    const promptBuilder = callMode === 'hero' ? buildHeroImageFinderPrompt : buildProductImageFinderPrompt;
    const heroQuality = viewQualityMap.hero || {};
    const promptArgs = callMode === 'hero'
      ? { product, variantLabel: variant.label, variantType: variant.type, minWidth: heroQuality.minWidth || 600, minHeight: heroQuality.minHeight || 400, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery, promptOverride: heroPromptOverride }
      : { product, variantLabel: variant.label, variantType: variant.type, priorityViews, additionalViews, minWidth, minHeight, viewQualityMap, siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery, promptOverride: viewPromptOverride };
    const systemPrompt = promptBuilder(promptArgs);
    const userMsg = JSON.stringify({ brand: product.brand, model: product.model, base_model: product.base_model, variant: variant.key });

    const callStartedAt = new Date().toISOString();
    const callStartMs = Date.now();
    const callLabel = callMode === 'hero'
      ? `Discovery Hero ${totalLlmCalls + 1}`
      : `Discovery ${(focusView || '').charAt(0).toUpperCase() + (focusView || '').slice(1)} ${totalLlmCalls + 1}`;

    onLlmCallComplete?.({
      prompt: { system: systemPrompt, user: userMsg },
      response: null,
      model: _mtLoop.actualModel,
      isFallback: _mtLoop.actualFallbackUsed,
      thinking: _mtLoop.actualThinking,
      webSearch: _mtLoop.actualWebSearch,
      effortLevel: _mtLoop.actualEffortLevel,
      accessMode: _mtLoop.actualAccessMode,
      variant: variant.label,
      mode: callMode,
      label: callLabel,
    });

    const result = await runSingleVariant({
      product, variant, priorityViews, additionalViews, viewQualityMap,
      callLlm, productRoot, specDb, actualModel: _mtLoop.actualModel, actualFallbackUsed: _mtLoop.actualFallbackUsed, logger,
      siblingsExcluded, familyModelCount, ambiguityLevel, previousDiscovery,
      rmbgSession,
      promptOverride: callMode === 'hero' ? heroPromptOverride : viewPromptOverride,
      mode: callMode,
      onPhaseChange: onStageAdvance,
    });

    const callDurationMs = Date.now() - callStartMs;

    allImages.push(...result.images);
    allErrors.push(...result.errors);
    totalLlmCalls++;

    // WHY: Inject call result summary into the stream so the live output
    // panel shows what images were found and any errors per call.
    const imgViews = result.images.map(i => i.view).join(', ');
    const errCount = result.errors.length;
    const summary = `\n── ${result.images.length} image${result.images.length !== 1 ? 's' : ''} found${imgViews ? ` (${imgViews})` : ''}${errCount ? ` · ${errCount} error${errCount !== 1 ? 's' : ''}` : ''} ──\n`;
    onStreamChunk?.({ content: summary });

    const selected = { images: result.images };
    const responsePayload = { mode: callMode, loop_id: loopId, started_at: callStartedAt, duration_ms: callDurationMs, images: result.images, download_errors: result.errors, discovery_log: result.discovery_log, variant_id: variant.variant_id || null, variant_key: variant.key, variant_label: variant.label };

    // Smart update — fills response into the pending prompt entry
    onLlmCallComplete?.({
      prompt: { system: systemPrompt, user: userMsg },
      response: responsePayload,
      model: _mtLoop.actualModel,
      isFallback: _mtLoop.actualFallbackUsed,
      thinking: _mtLoop.actualThinking,
      webSearch: _mtLoop.actualWebSearch,
      effortLevel: _mtLoop.actualEffortLevel,
      accessMode: _mtLoop.actualAccessMode,
      variant: variant.label,
      mode: callMode,
      usage: result.usage,
      label: callLabel,
    });

    const merged = mergeProductImageDiscovery({
      productId: product.product_id,
      productRoot,
      newDiscovery: { category: product.category, last_ran_at: ranAt },
      run: {
        mode: callMode,
        loop_id: loopId,
        started_at: callStartedAt,
        duration_ms: callDurationMs,
        model: _mtLoop.actualModel,
        fallback_used: _mtLoop.actualFallbackUsed,
        effort_level: _mtLoop.actualEffortLevel,
        access_mode: _mtLoop.actualAccessMode,
        thinking: _mtLoop.actualThinking,
        web_search: _mtLoop.actualWebSearch,
        selected,
        prompt: { system: systemPrompt, user: userMsg },
        response: responsePayload,
      },
    });

    const store = specDb.getFinderStore('productImageFinder');
    const latestRun = merged.runs[merged.runs.length - 1];
    store.insertRun({
      category: product.category,
      product_id: product.product_id,
      run_number: latestRun.run_number,
      ran_at: ranAt,
      model: _mtLoop.actualModel,
      fallback_used: _mtLoop.actualFallbackUsed,
      effort_level: _mtLoop.actualEffortLevel,
      access_mode: _mtLoop.actualAccessMode,
      thinking: _mtLoop.actualThinking,
      web_search: _mtLoop.actualWebSearch,
      selected,
      prompt: latestRun.prompt,
      response: latestRun.response,
    });

    store.upsert({
      category: product.category,
      product_id: product.product_id,
      images: merged.selected.images.map(img => ({ view: img.view, filename: img.filename, variant_key: img.variant_key })),
      image_count: merged.selected.images.length,
      latest_ran_at: ranAt,
      run_count: merged.run_count,
    });

    // WHY: Re-evaluate carousel AFTER persist to get accurate post-call progress
    const postCallImages = merged.selected.images.map(img => ({
      view: img.view, variant_key: img.variant_key, quality_pass: img.quality_pass !== false,
    }));
    const postCallStrategy = evaluateCarousel({
      collectedImages: postCallImages, viewBudget, satisfactionThreshold,
      heroEnabled, heroCount, variantKey: variant.key, variantId: variant.variant_id,
      viewAttemptBudget, viewAttemptBudgets, viewAttemptCounts: vatCounts,
      heroAttemptBudget, heroAttemptCount: haCnt,
      reRunBudget,
    });
    onLoopProgress?.({
      callNumber: totalLlmCalls,
      estimatedRemaining: Math.max(0, estimatedRemaining - 1),
      variant: variant.key,
      variantLabel: variant.label,
      focusView,
      mode: callMode,
      variantIndex: variantIndex ?? 0,
      variantTotal: variantTotal ?? 1,
      carouselProgress: postCallStrategy.carouselProgress,
    });
  }

  // Process variants sequentially for clean progress reporting
  // WHY: try/catch around the loop catches AbortError from cancellation.
  // Completed iterations already persisted — we keep that data and exit gracefully.
  try {
  for (let vi = 0; vi < variants.length; vi++) {
    if (signal?.aborted) break;
    const variant = variants[vi];

    // Unified loop: evaluateCarousel handles per-view budgets via reRunBudget.
    // Unsatisfied views get viewAttemptBudget; satisfied views get reRunBudget.
    const initialDoc = readProductImages({ productId: product.product_id, productRoot });
    const initialImages = (initialDoc?.selected?.images || []).map((img) => ({
      view: img.view, variant_key: img.variant_key, quality_pass: img.quality_pass !== false,
    }));

    const viewAttemptCounts = {};
    let heroAttemptCount = 0;

    const initialStrategy = evaluateCarousel({
      collectedImages: initialImages, viewBudget, satisfactionThreshold,
      heroEnabled, heroCount, variantKey: variant.key, variantId: variant.variant_id,
      viewAttemptBudget, viewAttemptBudgets, viewAttemptCounts,
      heroAttemptBudget, heroAttemptCount,
      reRunBudget,
    });

    // WHY: Emit initial progress before first call so the sidebar shows
    // carousel state immediately, not only after call 1 finishes.
    onLoopProgress?.({
      callNumber: totalLlmCalls,
      estimatedRemaining: initialStrategy.estimatedCallsRemaining,
      variant: variant.key,
      variantLabel: variant.label,
      focusView: initialStrategy.focusView,
      mode: initialStrategy.mode,
      variantIndex: vi,
      variantTotal: variants.length,
      carouselProgress: initialStrategy.carouselProgress,
    });

    while (true) {
      if (signal?.aborted) break;
      const pifDoc = readProductImages({ productId: product.product_id, productRoot });
      const collectedImages = (pifDoc?.selected?.images || []).map((img) => ({
        view: img.view, variant_key: img.variant_key, quality_pass: img.quality_pass !== false,
      }));

      const strategy = evaluateCarousel({
        collectedImages, viewBudget, satisfactionThreshold,
        heroEnabled, heroCount, variantKey: variant.key, variantId: variant.variant_id,
        viewAttemptBudget, viewAttemptBudgets, viewAttemptCounts,
        heroAttemptBudget, heroAttemptCount,
        reRunBudget,
      });

      if (strategy.isComplete) break;

      const focusView = strategy.focusView;
      const callMode = strategy.mode;

      // WHY: Increment BEFORE the call so the progress emission inside
      // executeOneCall reflects this call as counted.
      if (callMode === 'view' && focusView) {
        viewAttemptCounts[focusView] = (viewAttemptCounts[focusView] || 0) + 1;
      } else if (callMode === 'hero') {
        heroAttemptCount++;
      }

      await executeOneCall({ variant, callMode, focusView, estimatedRemaining: strategy.estimatedCallsRemaining, variantIndex: vi, variantTotal: variants.length, viewAttemptCounts, heroAttemptCount });
    }
  }
  } catch (err) {
    // WHY: AbortError from in-flight LLM call during cancellation. Completed iterations
    // already persisted — fall through to return accumulated results.
    if (err.name !== 'AbortError' && !signal?.aborted) throw err;
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
      variantKey: v.key, variantId: v.variant_id,
      viewAttemptBudget, viewAttemptBudgets, heroAttemptBudget, reRunBudget,
    }).carouselProgress;
  }

  return {
    images: allImages,
    download_errors: allErrors,
    variants_processed: variants.length,
    totalLlmCalls,
    fallbackUsed: _mtLoop.actualFallbackUsed,
    rejected: false,
    carouselProgress,
    carouselSettings: { viewAttemptBudget, viewAttemptBudgets, heroAttemptBudget, heroEnabled },
  };
}
