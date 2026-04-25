import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createPhaseCallLlm } from '../../features/indexing/pipeline/shared/createPhaseCallLlm.js';
import { zodToLlmSchema } from '../../core/llm/zodToLlmSchema.js';
import { resolvePromptTemplate } from '../../core/llm/resolvePromptTemplate.js';
import { viewEvalResponseSchema, heroEvalResponseSchema } from './imageEvaluatorSchema.js';
import { readProductImages, writeProductImages } from './productImageStore.js';
import { matchVariant } from './variantMatch.js';
import { resolveViewEvalPromptInputs } from './productImagePreviewPrompt.js';

/* ── Thumbnail pipeline (Phase 1) ───────────────────────────────── */

/**
 * Create a base64-encoded PNG thumbnail from a master image.
 *
 * WHY: Vision LLM calls need images as base64 data URIs.
 * Default controlled by evalThumbSize setting (registry default 768).
 * 768 uses 4 tiles (same as 1024) — good sharpness/watermark detection
 * without jumping to the 9-tile bracket (1025+).
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
// WHY: Default template for view evaluation prompt. {{CRITERIA}} resolves to per-category/per-view
// eval criteria (already editable in the GUI), so the structural prompt around it is now also editable.
export const VIEW_EVAL_DEFAULT_TEMPLATE = `{{IDENTITY}}
{{VIEW_LINE}}
{{COUNT_LINE}}

Images are labeled Image 1, Image 2, etc. matching the order of image content parts.
Each label includes the original dimensions and file size — use these to judge resolution quality since the thumbnails shown are downscaled.

{{CAROUSEL_CONTEXT}}

{{CRITERIA}}
Respond with JSON matching this schema:
{
  "winner": {
    "filename": "the best candidate filename",
    "reasoning": "1-2 sentences: why this image won and how it compares to the others"
  },
  "candidates": [
    {
      "filename": "candidate.png",
      "actual_view": "top|bottom|left|right|front|rear|sangle|angle|generic",
      "matches_requested_view": true,
      "usable_as_required_view": true,
      "usable_as_carousel_extra": true,
      "quality": "pass|borderline|fail",
      "duplicate": false,
      "flags": ["cropped"],
      "reasoning": "1 sentence classification and quality explanation"
    }
  ],
  "rejected": [
    { "filename": "disqualified.png", "flags": ["watermark"], "reasoning": "1 sentence why" },
    { "filename": "outranked.png", "reasoning": "1 sentence why not picked" }
  ]
}

Rules:
- "winner": Pick exactly one best image for this view. Explain why it won over the others. Set to null if NO candidate is acceptable.
- Existing carousel slot images are context only, not selectable candidates. The winner filename MUST be one of the candidate Image filenames.
- Prefer "winner": null over selecting a wrong-view candidate, an off-angle candidate, or a near-duplicate of an existing carousel slot.
- "candidates": Classify every candidate image by visible pixels, not by query intent, filename, alt text, page label, or the requested view.
- Query intent is not view evidence. A top-down image found during a front-view search has "actual_view": "top" and "matches_requested_view": false.
- Set "usable_as_required_view": true only when the image could fill the required slot for its actual_view.
- Set "usable_as_carousel_extra": true for clean exact-product shots that are not the winner but could still be useful as numbered extras like top2, sangle2, or img1.
- Use "actual_view": "generic" only for clean exact-product shots that are useful but do not match a named canonical view.
- Set "duplicate": true for near-duplicates of a winner, another candidate, or an existing carousel slot.
- "rejected": List ALL candidates that were not picked as winner. Include a brief "reasoning" (1 sentence) for each.
- If a rejected candidate has a disqualifying defect, include "flags" with one or more of: "watermark", "badge", "cropped", "wrong_product", "other". Use "other" when the issue doesn't fit standard flags (explain in reasoning).
- If the candidate was simply outranked (no defects, just lower quality), omit "flags" and explain why in "reasoning".
- If ALL candidates are disqualified, set "winner" to null and list every candidate in "rejected" with their flags. Do NOT force-pick a bad image.`;

function buildCarouselContextPromptBlock(carouselContext = []) {
  const usableContext = (carouselContext || []).filter((item) => item?.filename);
  if (usableContext.length === 0) {
    return 'Existing carousel slots: none yet.';
  }
  return [
    'Existing carousel slots (context only, not selectable):',
    ...usableContext.map((item) => `- ${item.slot}: ${item.filename}`),
    'Use these to avoid filling this slot with a near-duplicate composition.',
  ].join('\n');
}

export function buildViewEvalPrompt({
  product = {},
  variantLabel = '',
  variantType = 'color',
  view = '',
  viewDescription = '',
  candidateCount = 0,
  promptOverride = '',
  evalCriteria = '',
  templateOverride = '',
  carouselContext = [],
}) {
  const brand = product.brand || '';
  const model = product.model || '';
  const variantDesc = variantType === 'edition'
    ? `the "${variantLabel}" edition`
    : `the "${variantLabel}" color variant`;

  const identity = `Product: ${brand} ${model} — ${variantDesc}`.trim();
  const viewLine = `View: "${view}" — ${viewDescription || view}`;
  const countLine = `You are evaluating ${candidateCount} candidate image${candidateCount !== 1 ? 's' : ''} for this view.`;

  const defaultCriteria = `Evaluation criteria — pick the BEST candidate:
- Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled.
- Watermarks: Getty, Shutterstock, retailer logos, "SAMPLE" text, copyright overlays → disqualify (flag: "watermark")
- Badges / overlays: Sale stickers, "NEW" badges, retailer branding, promotional text → disqualify (flag: "badge")
- Cropping: Product cut off at edges, missing parts, too tight framing → penalty (flag: "cropped")
- Wrong product: Different model, wrong color, accessory instead of product → disqualify (flag: "wrong_product")
- Sharpness: Blur, compression artifacts, noise → prefer the better candidate
- Composition: View angle matches the requested view above, product centered, clean background → prefer the better candidate
- Background removal quality: Halo artifacts, missing parts, jagged edges → prefer the better candidate`;

  const criteria = evalCriteria || defaultCriteria;

  const template = templateOverride || promptOverride || VIEW_EVAL_DEFAULT_TEMPLATE;

  return resolvePromptTemplate(template, {
    IDENTITY: identity,
    VIEW_LINE: viewLine,
    COUNT_LINE: countLine,
    CRITERIA: criteria,
    CAROUSEL_CONTEXT: buildCarouselContextPromptBlock(carouselContext),
  });
}

/**
 * Build the system prompt for evaluating hero/marketing image candidates.
 *
 * WHY: Hero images are full-scene 16:9 marketing shots (not cutouts).
 * They're evaluated as vision candidates — same pattern as view eval —
 * and ranked for the carousel hero section.
 */
// WHY: Default template for hero evaluation. {{CRITERIA}} resolves to per-category hero criteria
// (already editable), {{HERO_COUNT}} controls how many heroes to pick.
export const HERO_EVAL_DEFAULT_TEMPLATE = `{{IDENTITY}}
{{COUNT_LINE}}

Images are labeled Image 1, Image 2, etc. matching the order of image content parts.
These are hero images for a product page. Any style of image is acceptable as long as it is clean and source-safe.

{{CRITERIA}}

Respond with JSON matching this schema:
{
  "heroes": [
    {
      "filename": "the best candidate filename",
      "hero_rank": 1,
      "reasoning": "short explanation — why this image is usable"
    }
  ],
  "rejected": [
    { "filename": "disqualified.png", "flags": ["watermark"], "reasoning": "1 sentence why" },
    { "filename": "outranked.png", "reasoning": "1 sentence why not picked" }
  ]
}

Rules:
- Pick up to {{HERO_COUNT}} images for the product page hero section.
- hero_rank 1 = primary hero, 2 = secondary, etc.
- "reasoning" should be 1-2 sentences: is the source safe? Is the image clean?
- When picking multiple heroes, prefer different shots over near-duplicates of the same angle.
- You may pick FEWER than {{HERO_COUNT}} if not enough candidates pass the gates.
- If ALL candidates are disqualified, return an empty "heroes" array.
- "rejected": List ALL candidates you did NOT pick. Include "reasoning" (1 sentence) for each.
- If a rejected candidate has a disqualifying defect, include "flags" with one or more of: "watermark", "badge", "cropped", "wrong_product", "other". Use "other" when the issue doesn't fit standard flags (explain in reasoning).
- If the candidate was simply outranked (no defects), omit "flags" and explain why in "reasoning".`;

export function buildHeroSelectionPrompt({
  product = {},
  variantLabel = '',
  variantType = 'color',
  candidates = [],
  promptOverride = '',
  heroCriteria = '',
  heroCount = 3,
  templateOverride = '',
}) {
  const brand = product.brand || '';
  const model = product.model || '';
  const variantDesc = variantType === 'edition'
    ? `the "${variantLabel}" edition`
    : `the "${variantLabel}" color variant`;

  const identity = `Product: ${brand} ${model} — ${variantDesc}`.trim();
  const countLine = `You are evaluating ${candidates.length} hero/marketing image candidate${candidates.length !== 1 ? 's' : ''}.`;

  const defaultCriteria = `Hero image evaluation criteria:

Your job is a LEGAL and QUALITY gatekeeper, not an art director. Any image type is acceptable — cutouts, lifestyle desk shots, promotional renders, studio multi-color lineups, unboxing kit layouts, dramatic RGB scenes — as long as it passes these gates:

1. SOURCE SAFETY (copyright gate — most important):
   - ACCEPT: Manufacturer promotional images, official product pages, press kit photos, retailer CDN images (Amazon A+ content, Best Buy). These are brand assets meant for redistribution.
   - REJECT: Photos taken by review sites, tech publications, YouTubers, or bloggers (PC Gamer, Tom's Hardware, RTINGS, TechPowerUp, The Verge, LTT, etc.). These are copyrighted editorial content even when they look clean.
   - How to tell: Editorial/review photos typically show lab environments, test equipment, desk clutter, hands holding the product, inconsistent overhead lighting, measurement setups. Manufacturer promo images have polished studio lighting, consistent brand aesthetics, clean backgrounds, or stylized scenes.

2. CLEANLINESS (usability gate):
   - REJECT: Watermarks (Getty, Shutterstock, iStock, Alamy), "SAMPLE" text, copyright overlays.
   - REJECT: Sale stickers, "NEW" badges, retailer branding baked into the image, promotional text overlays.

3. IDENTITY (correct product gate):
   - The correct model and correct color/edition variant must be visible and identifiable. Wrong product or wrong color → skip.

4. IMAGE QUALITY:
   - Resolution: Check original dimensions in image labels — higher resolution preferred. Thumbnails are downscaled for evaluation.
   - Must not be blurry, heavily compressed, or look like a low-res screenshot.`;

  const criteria = heroCriteria || defaultCriteria;

  const template = templateOverride || promptOverride || HERO_EVAL_DEFAULT_TEMPLATE;

  return resolvePromptTemplate(template, {
    IDENTITY: identity,
    COUNT_LINE: countLine,
    CRITERIA: criteria,
    HERO_COUNT: String(heroCount),
  });
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
    evalCriteria: domainArgs.evalCriteria,
    carouselContext: domainArgs.carouselContext,
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
    candidates: domainArgs.candidates,
    promptOverride: domainArgs.promptOverride,
    heroCriteria: domainArgs.heroCriteria,
    heroCount: domainArgs.heroCount,
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
  imageMetadata = [],
  view,
  product,
  variantLabel,
  variantType,
  size = 512,
  promptOverride = '',
  evalCriteria = '',
  carouselContext = [],
  callLlm,
  createThumbnail = createThumbnailBase64,
}) {
  if (!imagePaths || imagePaths.length === 0) return { rankings: [] };

  const filenames = imagePaths.map((p) => path.basename(p));

  // Build thumbnails + image payloads for vision call
  // WHY: Include real dimensions so the LLM can factor resolution into its decision.
  // The thumbnails are downscaled to ${size}px — the LLM cannot judge actual resolution from pixels alone.
  const images = [];
  const lines = [];
  for (let i = 0; i < imagePaths.length; i++) {
    const b64 = await createThumbnail({ imagePath: imagePaths[i], size });
    images.push({
      id: `img-${i + 1}`,
      file_uri: `data:image/png;base64,${b64}`,
      mime_type: 'image/png',
    });
    const meta = imageMetadata[i];
    const dimStr = meta?.width && meta?.height ? ` (${meta.width}×${meta.height}px` + (meta.bytes ? `, ${Math.round(meta.bytes / 1024)}KB` : '') + ')' : '';
    lines.push(`Image ${i + 1}: ${filenames[i]}${dimStr}`);
  }

  const contextLines = [];
  for (let i = 0; i < carouselContext.length; i++) {
    const context = carouselContext[i];
    const filename = context?.filename || (context?.imagePath ? path.basename(context.imagePath) : '');
    if (!filename) continue;
    if (context?.imagePath) {
      try {
        const b64 = await createThumbnail({ imagePath: context.imagePath, size });
        images.push({
          id: `ctx-${i + 1}`,
          file_uri: `data:image/png;base64,${b64}`,
          mime_type: 'image/png',
        });
      } catch {
        // Context helps duplicate detection; candidates remain the source of truth.
      }
    }
    const dimStr = context?.width && context?.height ? ` (${context.width}Ã—${context.height}px` + (context.bytes ? `, ${Math.round(context.bytes / 1024)}KB` : '') + ')' : '';
    contextLines.push(`Context ${contextLines.length + 1}: ${context.slot}: ${filename}${dimStr} (existing carousel slot; not selectable)`);
  }

  const userText = [
    lines.join('\n'),
    contextLines.length
      ? `Existing carousel slots (context only, not selectable):\n${contextLines.join('\n')}`
      : '',
  ].filter(Boolean).join('\n\n');
  const knownFilenames = new Set(filenames);

  // WHY: Build system prompt text for eval history audit trail. Routed through
  // resolveViewEvalPromptInputs so any new field in buildViewEvalPrompt flows
  // through a single SSOT shared with the preview compiler.
  const systemPrompt = buildViewEvalPrompt({
    ...resolveViewEvalPromptInputs({
      product,
      variant: { key: variantLabel, label: variantLabel, type: variantType },
      view,
      viewDescription: '',
      candidates: filenames.map((filename) => ({ filename })),
      evalPromptOverride: promptOverride,
      evalCriteria,
    }),
    carouselContext,
  });

  const { result: response, usage } = await callLlm({
    product,
    variantLabel,
    variantType,
    view,
    candidateCount: imagePaths.length,
    promptOverride,
    evalCriteria,
    carouselContext,
    userText,
    images,
  });

  // WHY: Convert { winner, rejected } → internal rankings array for mergeEvaluation.
  // Winner gets eval_best=true + reasoning. Rejected entries get flags + reasoning.
  const rankings = [];
  const seenRankingFilenames = new Set();
  const winnerFilename = response.winner && knownFilenames.has(response.winner.filename)
    ? response.winner.filename
    : '';

  for (const candidate of (response.candidates || [])) {
    if (!knownFilenames.has(candidate.filename)) continue;
    const actualView = candidate.actual_view || '';
    const matchesRequestedView = candidate.matches_requested_view === true;
    const isWinner = candidate.filename === winnerFilename
      && actualView === view
      && matchesRequestedView;
    rankings.push({
      filename: candidate.filename,
      best: isWinner,
      flags: candidate.flags || [],
      reasoning: candidate.reasoning || (isWinner ? response.winner?.reasoning || '' : ''),
      actualView,
      matchesRequestedView,
      usableAsRequiredView: candidate.usable_as_required_view === true,
      usableAsCarouselExtra: candidate.usable_as_carousel_extra === true,
      duplicate: candidate.duplicate === true,
      quality: candidate.quality || '',
    });
    seenRankingFilenames.add(candidate.filename);
  }

  if (winnerFilename && !seenRankingFilenames.has(winnerFilename)) {
    rankings.push({
      filename: winnerFilename,
      best: true,
      flags: [],
      reasoning: response.winner.reasoning || '',
      actualView: view,
      matchesRequestedView: true,
      usableAsRequiredView: true,
      usableAsCarouselExtra: true,
      duplicate: false,
      quality: 'pass',
    });
    seenRankingFilenames.add(winnerFilename);
  }

  for (const rej of (response.rejected || [])) {
    if (!knownFilenames.has(rej.filename) || seenRankingFilenames.has(rej.filename)) continue;
    rankings.push({
      filename: rej.filename,
      best: false,
      flags: rej.flags || [],
      reasoning: rej.reasoning || '',
      actualView: '',
      matchesRequestedView: false,
      usableAsRequiredView: false,
      usableAsCarouselExtra: false,
      duplicate: false,
      quality: '',
    });
    seenRankingFilenames.add(rej.filename);
  }

  return { rankings, _prompt: { system: systemPrompt, user: userText }, _response: response, usage };
}

/* ── Eval persistence (Phase 2) ─────────────────────────────────── */

// WHY: Eval fields to clear before applying fresh results.
// This list must match the TypeScript ProductImageEntry eval fields.
const EVAL_FIELDS = [
  'eval_best',
  'eval_flags',
  'eval_reasoning',
  'eval_source',
  'eval_actual_view',
  'eval_matches_requested_view',
  'eval_usable_as_required_view',
  'eval_usable_as_carousel_extra',
  'eval_duplicate',
  'eval_quality',
  'hero',
  'hero_rank',
];

function clearEvalFieldsForVariant(images = [], selector) {
  for (const img of (images || [])) {
    if (!matchVariant(img, selector)) continue;
    for (const field of EVAL_FIELDS) delete img[field];
  }
}

// WHY: Multiple eval operations fire simultaneously (one per view).
// Each reads/modifies/writes the same JSON file. Without serialization,
// later writes overwrite earlier ones (last-writer-wins race condition).
// This per-product lock queue ensures sequential JSON file access.
const _productLocks = new Map();
export function withProductLock(productId, fn) {
  const prev = _productLocks.get(productId) || Promise.resolve();
  const next = prev.then(fn, fn);
  _productLocks.set(productId, next);
  return next;
}

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
export function mergeEvaluation({ productId, productRoot, variantKey, variantId, viewResults, heroResults }) {
  const doc = readProductImages({ productId, productRoot });
  if (!doc) return null;

  const images = doc.selected?.images || [];

  // Step 1: Clear eval fields ONLY on images whose view is being re-evaluated.
  // WHY: Each view eval fires as a separate operation. Clearing the entire variant
  // would wipe results from other views that already completed.
  // Hero merges (heroResults !== null) clear hero fields on the whole variant.
  const viewsBeingUpdated = new Set(viewResults.keys());
  for (const img of images) {
    if (!matchVariant(img, { variantId, variantKey })) continue;
    if (viewsBeingUpdated.has(img.view)) {
      // Clear view-eval fields for this view
      delete img.eval_best;
      delete img.eval_flags;
      delete img.eval_reasoning;
      delete img.eval_source;
    }
    if (heroResults) {
      // Clear hero fields for re-evaluation
      delete img.hero;
      delete img.hero_rank;
      // WHY: Hero-view images may have eval_flags/eval_reasoning from prior hero rejection.
      // Clear them so fresh hero eval results can be applied cleanly.
      if (img.view === 'hero') {
        delete img.eval_flags;
        delete img.eval_reasoning;
      }
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
    if (!matchVariant(img, { variantId, variantKey })) continue;
    const ranking = rankingByFilename.get(img.filename);
    if (!ranking) continue;
    img.eval_best = ranking.best;
    img.eval_flags = ranking.flags;
    img.eval_reasoning = ranking.reasoning;
    img.eval_source = img.url || '';
    if (ranking.actualView !== undefined && ranking.actualView !== '') {
      img.eval_actual_view = ranking.actualView;
    }
    if (ranking.matchesRequestedView !== undefined) {
      img.eval_matches_requested_view = ranking.matchesRequestedView;
    }
    if (ranking.usableAsRequiredView !== undefined) {
      img.eval_usable_as_required_view = ranking.usableAsRequiredView;
    }
    if (ranking.usableAsCarouselExtra !== undefined) {
      img.eval_usable_as_carousel_extra = ranking.usableAsCarouselExtra;
    }
    if (ranking.duplicate !== undefined) {
      img.eval_duplicate = ranking.duplicate;
    }
    if (ranking.quality !== undefined && ranking.quality !== '') {
      img.eval_quality = ranking.quality;
    }
  }

  // Step 4: Apply hero results if provided
  if (heroResults) {
    const heroByFilename = new Map();
    for (const hero of (heroResults.heroes || [])) {
      heroByFilename.set(hero.filename, hero);
    }
    for (const img of images) {
      if (!matchVariant(img, { variantId, variantKey })) continue;
      const hero = heroByFilename.get(img.filename);
      if (!hero) continue;
      img.hero = true;
      img.hero_rank = hero.hero_rank;
      img.eval_reasoning = hero.reasoning || '';
    }

    // Step 5: Apply hero rejection flags + reasoning
    for (const rej of (heroResults.rejected || [])) {
      const img = images.find(i => matchVariant(i, { variantId, variantKey }) && i.filename === rej.filename);
      if (!img) continue;
      img.eval_flags = rej.flags || [];
      img.eval_reasoning = rej.reasoning || '';
    }
  }

  writeProductImages({ productId, productRoot, data: doc });
  return doc;
}

/* ── Eval state extraction (SQL projection) ─────────────────────── */

/**
 * Build an eval_state blob from doc.selected.images for SQL dual-write.
 * Keyed by filename for O(1) lookup. Only includes images that have
 * at least one eval field set.
 *
 * @param {object|null|undefined} doc — product images JSON document
 * @returns {object} — { [filename]: { eval_best, eval_flags, ... } }
 */
export function extractEvalState(doc) {
  const state = {};
  for (const img of (doc?.selected?.images || [])) {
    const hasEval = EVAL_FIELDS.some(f => img[f] !== undefined);
    if (hasEval) {
      state[img.filename] = {};
      for (const f of EVAL_FIELDS) {
        if (img[f] !== undefined) state[img.filename][f] = img[f];
      }
    }
  }
  return state;
}

/* ── Carousel slot persistence ──────────────────────────────────── */

/**
 * Write a single carousel slot override to JSON.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} opts.productRoot
 * @param {string} opts.variantKey — e.g. 'color:black'
 * @param {string} opts.slot — e.g. 'top', 'hero_1'
 * @param {string|null} opts.filename — image filename or null to clear
 * @returns {object} — updated carousel_slots object (all variants)
 */
export function writeCarouselSlot({ productId, productRoot, variantKey, slot, filename }) {
  const doc = readProductImages({ productId, productRoot });
  if (!doc) return {};

  if (!doc.carousel_slots) doc.carousel_slots = {};
  if (!doc.carousel_slots[variantKey]) doc.carousel_slots[variantKey] = {};
  doc.carousel_slots[variantKey][slot] = filename;

  writeProductImages({ productId, productRoot, data: doc });
  return doc.carousel_slots;
}

/**
 * Clear all carousel winners for one variant while preserving images, runs,
 * and eval history. Removes both auto-fill eval fields and user slot overrides
 * so a later Eval run can repopulate the carousel from fresh selections.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} opts.productRoot
 * @param {string} opts.variantKey
 * @param {string|null} [opts.variantId]
 * @returns {object|null} updated product_images document, or null if missing
 */
export function clearCarouselWinners({ productId, productRoot, variantKey, variantId = null }) {
  const doc = readProductImages({ productId, productRoot });
  if (!doc) return null;

  const selector = { variantId, variantKey };
  clearEvalFieldsForVariant(doc.selected?.images, selector);

  for (const run of (doc.runs || [])) {
    clearEvalFieldsForVariant(run.selected?.images, selector);
    clearEvalFieldsForVariant(run.response?.images, selector);
  }

  if (doc.carousel_slots?.[variantKey] !== undefined) {
    delete doc.carousel_slots[variantKey];
  }

  writeProductImages({ productId, productRoot, data: doc });
  return doc;
}

/**
 * Resolve carousel slot contents for one variant.
 *
 * Precedence: user override (carousel_slots) > eval_best/hero > empty.
 *
 * @param {object} opts
 * @param {string[]} opts.viewBudget — canonical views in priority order
 * @param {number} opts.heroCount — number of hero slots
 * @param {string} opts.variantKey
 * @param {object} opts.carouselSlots — full carousel_slots from JSON/SQL
 * @param {Array} opts.images — all images (with eval fields overlayed)
 * @returns {Array<{slot, filename, source}>} — resolved slots in order
 */
const CANONICAL_EXTRA_VIEWS = new Set(['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle']);
const DISQUALIFYING_EXTRA_FLAGS = new Set(['watermark', 'badge', 'cropped', 'wrong_product', 'other']);

function imageArea(img) {
  return (Number(img?.width) || 0) * (Number(img?.height) || 0);
}

function hasDisqualifyingFlags(img) {
  return (img?.eval_flags || []).some((flag) => DISQUALIFYING_EXTRA_FLAGS.has(flag));
}

function actualViewForImage(img) {
  if (img?.eval_actual_view) return img.eval_actual_view;
  return CANONICAL_EXTRA_VIEWS.has(img?.view) ? img.view : '';
}

function isRequiredViewCandidate(img, view) {
  if (!img || img.quality_pass === false) return false;
  const actualView = actualViewForImage(img);
  if (actualView !== view) return false;
  if (img.eval_duplicate === true) return false;
  if (hasDisqualifyingFlags(img)) return false;
  if (img.eval_usable_as_required_view === true) return true;
  return img.eval_best === true && (!img.eval_actual_view || img.eval_matches_requested_view !== false);
}

function isExtraCandidate(img) {
  if (!img || img.quality_pass === false) return false;
  if (img.view === 'hero' || img.hero === true) return false;
  if (img.eval_usable_as_carousel_extra !== true) return false;
  if (img.eval_duplicate === true) return false;
  if (hasDisqualifyingFlags(img)) return false;
  const actualView = actualViewForImage(img);
  return actualView === 'generic' || CANONICAL_EXTRA_VIEWS.has(actualView);
}

function sortCandidatesByQuality(a, b) {
  const qualityRank = { pass: 0, borderline: 1, fail: 2 };
  const qa = qualityRank[a.eval_quality] ?? 1;
  const qb = qualityRank[b.eval_quality] ?? 1;
  if (qa !== qb) return qa - qb;
  if ((a.eval_best === true) !== (b.eval_best === true)) return a.eval_best === true ? -1 : 1;
  return imageArea(b) - imageArea(a);
}

function nextExtraSlotKey({ actualView, slotCounts }) {
  if (actualView === 'generic') {
    const count = (slotCounts.get('img') || 0) + 1;
    slotCounts.set('img', count);
    return `img${count}`;
  }

  const count = (slotCounts.get(actualView) || 0) + 1;
  slotCounts.set(actualView, count);
  return count === 1 ? actualView : `${actualView}${count}`;
}

export function resolveCarouselSlots({ viewBudget, heroCount, variantKey, variantId, carouselSlots, images }) {
  const variantSlots = carouselSlots?.[variantKey] || {};
  const variantImages = (images || []).filter(img => matchVariant(img, { variantId, variantKey }));

  const viewOrder = viewBudget || [];
  const viewOrderIndex = new Map(viewOrder.map((view, index) => [view, index]));
  const result = [];
  const usedFilenames = new Set();
  const usedHashes = new Set();
  const slotCounts = new Map();

  for (const view of viewOrder) {
    if (CANONICAL_EXTRA_VIEWS.has(view)) slotCounts.set(view, 1);
  }

  const markUsed = (filename) => {
    if (!filename || filename === '__cleared__') return;
    usedFilenames.add(filename);
    const img = variantImages.find((item) => item.filename === filename);
    if (img?.content_hash) usedHashes.add(img.content_hash);
  };

  // View slots — in category priority order
  // WHY: '__cleared__' means "user explicitly emptied this slot — don't auto-fill from eval"
  for (const view of viewOrder) {
    const override = variantSlots[view];
    if (override === '__cleared__') {
      result.push({ slot: view, filename: null, source: 'empty' });
      continue;
    }
    if (override) {
      result.push({ slot: view, filename: override, source: 'user' });
      markUsed(override);
      continue;
    }

    const evalWinner = variantImages
      .filter((img) => !usedFilenames.has(img.filename) && isRequiredViewCandidate(img, view))
      .sort(sortCandidatesByQuality)[0];
    if (evalWinner) {
      result.push({ slot: view, filename: evalWinner.filename, source: 'eval' });
      markUsed(evalWinner.filename);
      continue;
    }
    result.push({ slot: view, filename: null, source: 'empty' });
  }

  const extraImages = variantImages
    .filter((img) => !usedFilenames.has(img.filename))
    .filter((img) => !img.content_hash || !usedHashes.has(img.content_hash))
    .filter(isExtraCandidate)
    .sort((a, b) => {
      const av = actualViewForImage(a);
      const bv = actualViewForImage(b);
      const ai = av === 'generic' ? 99 : viewOrderIndex.get(av) ?? 90;
      const bi = bv === 'generic' ? 99 : viewOrderIndex.get(bv) ?? 90;
      if (ai !== bi) return ai - bi;
      return sortCandidatesByQuality(a, b);
    });

  for (const img of extraImages) {
    const actualView = actualViewForImage(img);
    const slotKey = nextExtraSlotKey({ actualView, slotCounts });
    const override = variantSlots[slotKey];
    if (override === '__cleared__') {
      result.push({ slot: slotKey, filename: null, source: 'empty' });
      continue;
    }
    if (override) {
      result.push({ slot: slotKey, filename: override, source: 'user' });
      markUsed(override);
      continue;
    }
    result.push({ slot: slotKey, filename: img.filename, source: 'eval' });
    markUsed(img.filename);
  }

  // Hero slots
  const heroImages = variantImages
    .filter(img => img.hero === true && img.hero_rank != null)
    .sort((a, b) => (a.hero_rank || 99) - (b.hero_rank || 99));

  for (let i = 0; i < heroCount; i++) {
    const slotKey = `hero_${i + 1}`;
    const override = variantSlots[slotKey];
    if (override === '__cleared__') {
      result.push({ slot: slotKey, filename: null, source: 'empty' });
    } else if (override) {
      result.push({ slot: slotKey, filename: override, source: 'user' });
    } else if (heroImages[i]) {
      result.push({ slot: slotKey, filename: heroImages[i].filename, source: 'eval' });
    } else {
      result.push({ slot: slotKey, filename: null, source: 'empty' });
    }
  }

  return result;
}

/* ── Eval history persistence ───────────────────────────────────── */

/**
 * Append an eval record to the evaluations array in JSON.
 *
 * WHY: Eval calls don't create PIF runs — they mutate existing images.
 * But users need to inspect the system prompt + LLM response for each
 * eval call. The evaluations array stores this audit trail separately.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} opts.productRoot
 * @param {string} opts.variantKey
 * @param {string} opts.type — 'view' or 'hero'
 * @param {string} [opts.view] — canonical view key (for view evals)
 * @param {string} opts.model — LLM model used
 * @param {object} opts.prompt — { system, user }
 * @param {object} opts.response — raw LLM response
 * @param {object} opts.result — parsed result (rankings or heroes)
 * @param {number} [opts.durationMs] — call duration
 * @returns {object} — the appended eval record
 */
export function appendEvalRecord({ productId, productRoot, variantKey, variantId, type, view, model, prompt, response, result, durationMs, startedAt, effortLevel, accessMode, fallbackUsed, thinking, webSearch, variantLabel, variantType }) {
  const doc = readProductImages({ productId, productRoot });
  if (!doc) return null;

  if (!doc.evaluations) doc.evaluations = [];

  const record = {
    eval_number: doc.evaluations.length + 1,
    type,
    view: view || null,
    variant_id: variantId || null,
    variant_key: variantKey,
    model: model || 'unknown',
    ran_at: new Date().toISOString(),
    duration_ms: durationMs || null,
    started_at: startedAt || null,
    effort_level: effortLevel || null,
    access_mode: accessMode || null,
    fallback_used: fallbackUsed ?? false,
    thinking: Boolean(thinking),
    web_search: Boolean(webSearch),
    variant_label: variantLabel || null,
    variant_type: variantType || null,
    prompt: prompt || {},
    response: response || {},
    result: result || {},
  };

  doc.evaluations.push(record);
  writeProductImages({ productId, productRoot, data: doc });
  return record;
}

/**
 * Delete an eval record and clear eval fields it produced on images.
 *
 * WHY: If the user deletes an eval, the images it selected should no
 * longer be marked as winners. Clears eval fields for the view (or hero
 * fields for hero evals) on matching variant images.
 *
 * @param {object} opts
 * @param {string} opts.productId
 * @param {string} opts.productRoot
 * @param {number} opts.evalNumber
 * @returns {object|null} — updated doc, or null if not found
 */
export function deleteEvalRecord({ productId, productRoot, evalNumber }) {
  const doc = readProductImages({ productId, productRoot });
  if (!doc || !doc.evaluations) return null;

  const idx = doc.evaluations.findIndex(e => e.eval_number === evalNumber);
  if (idx === -1) return null;

  const record = doc.evaluations[idx];
  doc.evaluations.splice(idx, 1);

  // Clear eval fields from images that this eval produced
  const images = doc.selected?.images || [];
  const delSelector = { variantId: record.variant_id, variantKey: record.variant_key };
  if (record.type === 'view' && record.view) {
    for (const img of images) {
      if (matchVariant(img, delSelector) && img.view === record.view) {
        delete img.eval_best;
        delete img.eval_flags;
        delete img.eval_reasoning;
        delete img.eval_source;
        delete img.eval_actual_view;
        delete img.eval_matches_requested_view;
        delete img.eval_usable_as_required_view;
        delete img.eval_usable_as_carousel_extra;
        delete img.eval_duplicate;
        delete img.eval_quality;
      }
    }
  } else if (record.type === 'hero') {
    for (const img of images) {
      if (matchVariant(img, delSelector)) {
        delete img.hero;
        delete img.hero_rank;
      }
    }
  }

  writeProductImages({ productId, productRoot, data: doc });
  return doc;
}
