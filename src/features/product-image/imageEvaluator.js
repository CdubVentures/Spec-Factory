import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createPhaseCallLlm } from '../../features/indexing/pipeline/shared/createPhaseCallLlm.js';
import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { viewEvalResponseSchema, heroEvalResponseSchema } from './imageEvaluatorSchema.js';
import { readProductImages, writeProductImages } from './productImageStore.js';

/* ── Thumbnail pipeline (Phase 1) ───────────────────────────────── */

/**
 * Create a base64-encoded PNG thumbnail from a master image.
 *
 * WHY: Vision LLM calls need images as base64 data URIs.
 * 512×512 is enough for judging composition, watermarks, and sharpness
 * while keeping token cost low (~80-100K per call).
 *
 * @param {object} opts
 * @param {string} opts.imagePath - absolute path to source image
 * @param {number} [opts.size=512] - max dimension (width and height)
 * @returns {Promise<string>} base64-encoded PNG data
 */
export async function createThumbnailBase64({ imagePath, size = 512 }) {
  if (size <= 0) throw new Error(`Invalid thumbnail size: ${size}`);
  if (!fs.existsSync(imagePath)) throw new Error(`Image not found: ${imagePath}`);

  const buffer = await sharp(imagePath)
    .resize(size, size, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();

  return buffer.toString('base64');
}

/* ── Prompt builders (Phase 2) ──────────────────────────────────── */

/**
 * Build the system prompt for evaluating candidates of a single view.
 *
 * Each view gets its own LLM call with all candidates for that angle.
 * The view description tells the LLM what the correct angle looks like.
 */
export function buildViewEvalPrompt({
  product = {},
  variantLabel = '',
  variantType = 'color',
  view = '',
  viewDescription = '',
  candidateCount = 0,
  promptOverride = '',
}) {
  const brand = product.brand || '';
  const model = product.model || '';
  const variantDesc = variantType === 'edition'
    ? `the "${variantLabel}" edition`
    : `the "${variantLabel}" color variant`;

  const identity = `Product: ${brand} ${model} — ${variantDesc}`.trim();
  const viewLine = `View: "${view}" — ${viewDescription || view}`;
  const countLine = `You are evaluating ${candidateCount} candidate image${candidateCount !== 1 ? 's' : ''} for this view.`;

  const defaultCriteria = `Evaluation criteria (judge each image against ALL of these):
- Watermarks: Getty, Shutterstock, retailer logos, "SAMPLE" text, copyright overlays → disqualify (flag: "watermark")
- Badges / overlays: Sale stickers, "NEW" badges, retailer branding, promotional text → disqualify (flag: "badge")
- Cropping: Product cut off at edges, missing parts, too tight framing → penalty (flag: "cropped")
- Wrong product: Different model, wrong color, accessory instead of product → disqualify (flag: "wrong_product")
- Sharpness: Blur, compression artifacts, noise, low resolution appearance → affects ranking
- Composition: View angle matches the requested view above, product centered, clean background → affects ranking
- Background removal quality: Halo artifacts, missing parts, jagged edges → affects ranking`;

  const criteria = promptOverride.trim() || defaultCriteria;

  return `${identity}
${viewLine}
${countLine}

Images are labeled Image 1, Image 2, etc. matching the order of image content parts.

${criteria}

Respond with JSON matching this schema:
{
  "rankings": [
    {
      "filename": "the candidate filename",
      "rank": 1,
      "best": true,
      "flags": [],
      "reasoning": "short explanation"
    }
  ]
}

Rules:
- Rank ALL candidates from best (rank 1) to worst.
- Set "best": true on exactly one image (the winner for this view).
- Set "best": false on all others.
- "flags" is an array of zero or more: "watermark", "badge", "cropped", "wrong_product".
- "reasoning" should be 1-2 sentences explaining your ranking decision.`;
}

/**
 * Build the system prompt for selecting hero shots from view winners.
 */
export function buildHeroSelectionPrompt({
  product = {},
  variantLabel = '',
  variantType = 'color',
  viewWinners = [],
  promptOverride = '',
}) {
  const brand = product.brand || '';
  const model = product.model || '';
  const variantDesc = variantType === 'edition'
    ? `the "${variantLabel}" edition`
    : `the "${variantLabel}" color variant`;

  const identity = `Product: ${brand} ${model} — ${variantDesc}`.trim();

  const winnerList = viewWinners.length > 0
    ? viewWinners.map((w, i) => `Image ${i + 1}: ${w.filename} (${w.view} view)`).join('\n')
    : '(no view winners available)';

  const defaultCriteria = `Hero selection criteria for a product page carousel:
- Which images best showcase the product's design and features?
- Which angles are most attractive and informative for a buyer?
- Prefer images that are sharp, well-composed, and free of defects.
- A good hero set covers different perspectives (not all the same angle).`;

  const criteria = promptOverride.trim() || defaultCriteria;

  return `${identity}

You are selecting hero images for the product page carousel.
These are the best images from each evaluated view:

${winnerList}

${criteria}

Respond with JSON matching this schema:
{
  "heroes": [
    {
      "filename": "the winner filename",
      "hero_rank": 1,
      "reasoning": "short explanation"
    }
  ]
}

Rules:
- Pick the best images for a product page carousel hero section.
- hero_rank 1 = primary hero (most prominent placement).
- "reasoning" should be 1-2 sentences explaining why this image is a good hero shot.`;
}

/* ── LLM caller factories (Phase 2) ────────────────────────────── */

const VIEW_EVAL_SPEC = {
  phase: 'imageEvaluator',
  reason: 'image_view_evaluation',
  role: 'triage',
  system: (domainArgs) => buildViewEvalPrompt({
    product: domainArgs.product,
    variantLabel: domainArgs.variantLabel,
    variantType: domainArgs.variantType,
    view: domainArgs.view,
    viewDescription: domainArgs.viewDescription,
    candidateCount: domainArgs.candidateCount,
    promptOverride: domainArgs.promptOverride,
  }),
  jsonSchema: zodToLlmSchema(viewEvalResponseSchema),
};

const HERO_EVAL_SPEC = {
  phase: 'imageEvaluator',
  reason: 'image_hero_selection',
  role: 'triage',
  system: (domainArgs) => buildHeroSelectionPrompt({
    product: domainArgs.product,
    variantLabel: domainArgs.variantLabel,
    variantType: domainArgs.variantType,
    viewWinners: domainArgs.viewWinners,
    promptOverride: domainArgs.promptOverride,
  }),
  jsonSchema: zodToLlmSchema(heroEvalResponseSchema),
};

/**
 * Factory: create a bound LLM caller for view evaluation.
 */
export function createImageEvaluatorCallLlm(deps) {
  return createPhaseCallLlm(deps, VIEW_EVAL_SPEC, (domainArgs) => ({
    user: {
      text: domainArgs.userText || '',
      images: domainArgs.images || [],
    },
  }));
}

/**
 * Factory: create a bound LLM caller for hero selection.
 */
export function createHeroEvalCallLlm(deps) {
  return createPhaseCallLlm(deps, HERO_EVAL_SPEC, (domainArgs) => ({
    user: {
      text: domainArgs.userText || '',
      images: domainArgs.images || [],
    },
  }));
}

/* ── View evaluation orchestrator (Phase 2) ─────────────────────── */

/**
 * Evaluate candidates for a single view of a single variant.
 *
 * Skip logic:
 * - 0 candidates → empty rankings (no LLM call)
 * - 1 candidate → auto-elect as winner (no LLM call)
 * - 2+ candidates → create thumbnails, call vision LLM, parse rankings
 *
 * @param {object} opts
 * @param {string[]} opts.imagePaths — absolute paths to candidate master PNGs
 * @param {string} opts.view — canonical view key (e.g. 'top')
 * @param {object} opts.product — { brand, model, base_model, variant }
 * @param {string} opts.variantLabel
 * @param {string} opts.variantType — 'color' or 'edition'
 * @param {number} [opts.size=512] — thumbnail dimension
 * @param {string} [opts.promptOverride='']
 * @param {Function} opts.callLlm — bound LLM caller
 * @param {Function} [opts.createThumbnail] — injectable for testing
 * @returns {Promise<{rankings: Array}>}
 */
export async function evaluateViewCandidates({
  imagePaths,
  view,
  product,
  variantLabel,
  variantType,
  size = 512,
  promptOverride = '',
  callLlm,
  createThumbnail = createThumbnailBase64,
}) {
  if (!imagePaths || imagePaths.length === 0) return { rankings: [] };

  const filenames = imagePaths.map((p) => path.basename(p));

  // WHY: Single candidate = auto-elect, no LLM call needed
  if (imagePaths.length === 1) {
    return {
      rankings: [{
        filename: filenames[0],
        rank: 1,
        best: true,
        flags: [],
        reasoning: 'auto-elected: sole candidate for this view',
      }],
    };
  }

  // Build thumbnails + image payloads for vision call
  const images = [];
  const lines = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const b64 = await createThumbnail({ imagePath: imagePaths[i], size });
    images.push({
      id: `img-${i + 1}`,
      file_uri: `data:image/png;base64,${b64}`,
      mime_type: 'image/png',
    });
    lines.push(`Image ${i + 1}: ${filenames[i]}`);
  }

  const userText = lines.join('\n');
  const knownFilenames = new Set(filenames);

  const response = await callLlm({
    product,
    variantLabel,
    variantType,
    view,
    candidateCount: imagePaths.length,
    promptOverride,
    userText,
    images,
  });

  // WHY: Filter out unknown filenames — LLM may hallucinate entries
  const rankings = (response.rankings || [])
    .filter((r) => knownFilenames.has(r.filename));

  return { rankings };
}

/* ── Eval persistence (Phase 2) ─────────────────────────────────── */

// WHY: Eval fields to clear before applying fresh results.
// This list must match the TypeScript ProductImageEntry eval fields.
const EVAL_FIELDS = ['eval_best', 'eval_flags', 'eval_reasoning', 'eval_source', 'hero', 'hero_rank'];

/**
 * Persist evaluation results onto existing image entries.
 *
 * Clear-then-write: clears all eval fields on images matching the variant,
 * then applies fresh results. Re-running always produces fresh state.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} opts.productRoot
 * @param {string} opts.variantKey — e.g. 'color:black'
 * @param {Map<string, {rankings: Array}>} opts.viewResults — keyed by view
 * @param {{heroes: Array}|null} opts.heroResults — null to skip hero application
 * @returns {object|null} — updated document, or null if file not found
 */
export function mergeEvaluation({ productId, productRoot, variantKey, viewResults, heroResults }) {
  const doc = readProductImages({ productId, productRoot });
  if (!doc) return null;

  const images = doc.selected?.images || [];

  // Step 1: Clear all eval fields on matching variant
  for (const img of images) {
    if (img.variant_key === variantKey) {
      for (const field of EVAL_FIELDS) delete img[field];
    }
  }

  // Step 2: Build filename→ranking lookup from all view results
  const rankingByFilename = new Map();
  for (const [, viewResult] of viewResults) {
    for (const ranking of (viewResult.rankings || [])) {
      rankingByFilename.set(ranking.filename, ranking);
    }
  }

  // Step 3: Apply eval results by filename match
  for (const img of images) {
    if (img.variant_key !== variantKey) continue;
    const ranking = rankingByFilename.get(img.filename);
    if (!ranking) continue;
    img.eval_best = ranking.best;
    img.eval_flags = ranking.flags;
    img.eval_reasoning = ranking.reasoning;
    img.eval_source = img.url || '';
  }

  // Step 4: Apply hero results if provided
  if (heroResults) {
    const heroByFilename = new Map();
    for (const hero of (heroResults.heroes || [])) {
      heroByFilename.set(hero.filename, hero);
    }
    for (const img of images) {
      if (img.variant_key !== variantKey) continue;
      const hero = heroByFilename.get(img.filename);
      if (!hero) continue;
      img.hero = true;
      img.hero_rank = hero.hero_rank;
    }
  }

  writeProductImages({ productId, productRoot, data: doc });
  return doc;
}
