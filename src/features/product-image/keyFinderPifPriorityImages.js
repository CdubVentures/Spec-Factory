import fs from 'node:fs';
import path from 'node:path';

import { resolveViewConfig } from './productImageLlmAdapter.js';
import { createThumbnailBase64, resolveCarouselSlots } from './imageEvaluator.js';
import { matchVariant } from './variantMatch.js';
import { defaultProductRoot } from '../../core/config/runtimeArtifactRoots.js';

function normalizeToken(value) {
  return String(value || '').trim().toLowerCase().replace(/^color:/, '').replace(/\s+/g, '-');
}

function isEnabled(fieldRule = {}) {
  const raw = fieldRule?.ai_assist?.pif_priority_images;
  if (typeof raw === 'boolean') return raw;
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.enabled === 'boolean') {
    return raw.enabled;
  }
  return false;
}

function encodedImageUrl({ category, productId, filename, bytes }) {
  const base = `/api/v1/product-image-finder/${encodeURIComponent(category)}/${encodeURIComponent(productId)}/images/${encodeURIComponent(filename)}`;
  return bytes ? `${base}?v=${bytes}` : base;
}

function parseJsonValue(value, fallback) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function readSqlProductImages({ finderStore, productId }) {
  const row = typeof finderStore?.get === 'function' ? finderStore.get(productId) : null;
  if (!row) return null;

  const images = parseJsonValue(row.images, []);
  const evalState = parseJsonValue(row.eval_state, {});
  const carouselSlots = parseJsonValue(row.carousel_slots, {});
  const selectedImages = (Array.isArray(images) ? images : [])
    .map((img) => {
      const filename = String(img?.filename || '');
      return filename ? { ...img, ...(evalState?.[filename] || {}) } : null;
    })
    .filter(Boolean);

  return {
    product_id: row.product_id || productId,
    category: row.category || '',
    selected: { images: selectedImages },
    carousel_slots: carouselSlots && typeof carouselSlots === 'object' ? carouselSlots : {},
  };
}

function readPifPrioritySource({ finderStore, productId }) {
  return readSqlProductImages({ finderStore, productId });
}

function getDefaultColor(specDb, productId) {
  const row = typeof specDb?.getColorEditionFinder === 'function'
    ? specDb.getColorEditionFinder(productId)
    : null;
  return normalizeToken(row?.default_color || '');
}

function matchesDefaultColor(variant, defaultColor) {
  if (!defaultColor) return false;
  const atoms = Array.isArray(variant.color_atoms) ? variant.color_atoms : [];
  if (atoms.some((atom) => normalizeToken(atom) === defaultColor)) return true;
  return [
    variant.variant_key,
    variant.variant_label,
    variant.edition_display_name,
  ].some((value) => normalizeToken(value) === defaultColor);
}

function pickDefaultVariant({ variants, defaultColor }) {
  const list = Array.isArray(variants) ? variants.filter(Boolean) : [];
  if (list.length === 0) return null;
  const defaultMatch = list.find((variant) =>
    String(variant.variant_type || '').toLowerCase() === 'color'
    && matchesDefaultColor(variant, defaultColor));
  if (defaultMatch) return { variant: defaultMatch, basis: 'CEF default_color' };
  const firstColor = list.find((variant) => String(variant.variant_type || '').toLowerCase() === 'color');
  if (firstColor) return { variant: firstColor, basis: defaultColor ? 'first color fallback' : 'first color' };
  return { variant: list[0], basis: 'first active variant' };
}

function contextUnavailable({ status, priorityViews = [], variant = null, message }) {
  return {
    enabled: true,
    status,
    priorityViews,
    variant,
    images: [],
    message,
  };
}

async function buildLlmImageDataUri(filePath) {
  try {
    const b64 = await createThumbnailBase64({ imagePath: filePath, size: 512 });
    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}

/**
 * Resolve Key Finder visual context from PIF's already-evaluated carousel data.
 *
 * This never discovers or ranks images. It only reads PIF-evaluated/user-picked
 * winners for the default/base variant and the category's configured priority
 * views.
 */
export async function resolveKeyFinderPifPriorityImageContext({
  specDb,
  product,
  productRoot,
  fieldRule,
} = {}) {
  if (!isEnabled(fieldRule)) {
    return { enabled: false, status: 'disabled', images: [], priorityViews: [] };
  }

  const productId = String(product?.product_id || '').trim();
  const category = String(product?.category || specDb?.category || '').trim();
  if (!productId || !category) {
    return contextUnavailable({
      status: 'missing_product',
      message: 'PIF priority images are enabled, but product identity was unavailable.',
    });
  }

  const finderStore = specDb?.getFinderStore?.('productImageFinder') ?? null;
  const viewConfig = resolveViewConfig(finderStore?.getSetting?.('viewConfig') || '', category);
  const priorityViews = viewConfig.filter((view) => view.priority).map((view) => view.key);
  if (priorityViews.length === 0) {
    return contextUnavailable({
      status: 'no_priority_views',
      priorityViews,
      message: 'PIF priority images are enabled, but no priority views are configured for this category.',
    });
  }

  const variants = typeof specDb?.variants?.listActive === 'function'
    ? specDb.variants.listActive(productId)
    : [];
  const picked = pickDefaultVariant({ variants, defaultColor: getDefaultColor(specDb, productId) });
  if (!picked?.variant) {
    return contextUnavailable({
      status: 'no_default_variant',
      priorityViews,
      message: 'PIF priority images are enabled, but no active CEF variant is available to identify the default/base image set.',
    });
  }

  const variant = picked.variant;
  const variantShape = {
    variant_id: String(variant.variant_id || ''),
    variant_key: String(variant.variant_key || ''),
    label: String(variant.variant_label || variant.variant_key || ''),
    type: String(variant.variant_type || ''),
    basis: picked.basis,
  };

  const root = productRoot || defaultProductRoot();
  const pifDoc = readPifPrioritySource({ finderStore, productId });
  const allImages = pifDoc?.selected?.images || [];
  const slots = resolveCarouselSlots({
    viewBudget: priorityViews,
    heroCount: 0,
    variantId: variantShape.variant_id,
    variantKey: variantShape.variant_key,
    carouselSlots: pifDoc?.carousel_slots || {},
    images: allImages,
  });

  const imagesDir = path.join(root, productId, 'images');
  const resolvedImages = (await Promise.all(slots
    .filter((slot) => slot?.filename)
    .map(async (slot) => {
      const image = allImages.find((img) =>
        matchVariant(img, { variantId: variantShape.variant_id, variantKey: variantShape.variant_key })
        && img.filename === slot.filename);
      if (!image?.filename) return null;
      const filePath = path.join(imagesDir, image.filename);
      if (!fs.existsSync(filePath)) return null;
      const llmDataUri = await buildLlmImageDataUri(filePath);
      if (!llmDataUri) return null;
      const caption = `${slot.slot} view: ${image.filename}`;
      return {
        view: slot.slot,
        filename: image.filename,
        source: slot.source || '',
        variant_id: variantShape.variant_id,
        variant_key: variantShape.variant_key,
        preview_url: encodedImageUrl({ category, productId, filename: image.filename, bytes: image.bytes }),
        llm_file_uri: llmDataUri,
        llm_source_file_uri: filePath,
        mime_type: 'image/png',
        caption,
        original_url: String(image.eval_source || image.url || ''),
        eval_reasoning: String(image.eval_reasoning || ''),
        bytes: image.bytes ?? undefined,
      };
    })))
    .filter(Boolean);

  if (resolvedImages.length === 0) {
    return contextUnavailable({
      status: 'no_images',
      priorityViews,
      variant: variantShape,
      message: 'No PIF-evaluated priority images are available for the default/base variant.',
    });
  }

  return {
    enabled: true,
    status: 'available',
    priorityViews,
    variant: variantShape,
    images: resolvedImages,
  };
}
