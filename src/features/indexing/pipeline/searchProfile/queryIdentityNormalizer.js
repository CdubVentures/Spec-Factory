export function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

import { deriveFullModel } from '../../../catalog/identity/identityDedup.js';
import { toArray, isObject } from '../../../../shared/primitives.js';
export { toArray, isObject };

export function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key);
}

export function readPathValue(target, segments = []) {
  let cursor = target;
  for (const segment of segments) {
    if (!isObject(cursor) || !hasOwn(cursor, segment)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

export function hasPathValue(target, segments = []) {
  if (!segments.length) return false;
  let cursor = target;
  for (const segment of segments) {
    if (!isObject(cursor) || !hasOwn(cursor, segment)) {
      return false;
    }
    cursor = cursor[segment];
  }
  return true;
}

export function resolveJobIdentity(job = {}) {
  const identityLock = isObject(job?.identityLock) ? job.identityLock : {};
  const brand = clean(identityLock.brand || job?.brand || '');
  const base_model = clean(identityLock.base_model || job?.base_model || '');
  const variant = clean(identityLock.variant || job?.variant || '');
  const rawModel = clean(identityLock.model || job?.model || '');
  return {
    brand,
    base_model,
    model: base_model ? clean(deriveFullModel(base_model, variant)) : rawModel,
    variant
  };
}

export const STOPWORDS = new Set([
  'according',
  'after',
  'before',
  'common',
  'contract',
  'define',
  'evidence',
  'field',
  'from',
  'list',
  'normalize',
  'output',
  'prefer',
  'proval',
  'provable',
  'reason',
  'required',
  'sorted',
  'value',
  'values',
  'when',
  'with'
]);

export function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3);
}

export function normalizeSearchTerm(value) {
  return clean(String(value || '').replace(/_/g, ' '));
}

export function splitAlphaDigit(value) {
  return clean(
    String(value || '')
      .replace(/([a-z])([0-9])/gi, '$1 $2')
      .replace(/([0-9])([a-z])/gi, '$1 $2')
  );
}

export function sanitizeAlias(value) {
  return clean(String(value || '').toLowerCase());
}

export const GENERIC_GUARD_TOKENS = new Set([
  'gaming',
  'mouse',
  'mice',
  'wireless',
  'wired',
  'edition',
  'black',
  'white',
  'mini',
  'ultra',
  'pro',
  'plus',
  'core',
  'version',
  'series',
  'usb',
  'rgb'
]);

export function compactToken(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

export function extractIdentityTokens(value, { minLength = 2 } = {}) {
  return [...new Set(
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .map((token) => token.trim())
      .filter((token) => token.length >= Math.max(1, minLength))
  )];
}

export function extractDigitGroups(value) {
  return [...new Set(
    String(value || '')
      .toLowerCase()
      .match(/\d{2,}/g) || []
  )];
}

export function buildVariantGuardTerms(identity = {}) {
  const brand = clean(identity.brand || '').toLowerCase();
  const baseModel = clean(identity.base_model || '').toLowerCase();
  const variant = clean(identity.variant || '').toLowerCase();
  const model = clean(baseModel || identity.model || '').toLowerCase();
  const variantToken = baseModel ? variant : '';
  const product = clean([brand, model, variantToken].filter(Boolean).join(' '));
  const modelVariant = clean([model, variantToken].filter(Boolean).join(' '));
  const productCompact = compactToken(product);
  const brandCompact = compactToken(brand);
  const modelCompact = compactToken(modelVariant || model);
  const tokens = [...new Set([
    ...extractIdentityTokens(modelVariant || model, { minLength: 2 }),
    ...extractIdentityTokens(variant, { minLength: 2 })
  ])]
    .filter((token) => !GENERIC_GUARD_TOKENS.has(token))
    .slice(0, 10);
  const digitGroups = extractDigitGroups(modelVariant || model).slice(0, 6);

  return [...new Set([
    product,
    clean([brand, model].filter(Boolean).join(' ')),
    modelVariant || model,
    brandCompact,
    modelCompact,
    productCompact,
    ...tokens,
    ...digitGroups
  ].map((value) => clean(value).toLowerCase()).filter(Boolean))]
    .slice(0, 16);
}

export function buildModelAliasCandidates(identity = {}) {
  const baseModel = clean(identity.base_model || '');
  const model = clean(baseModel || identity.model || '');
  const variant = clean(identity.variant || '');
  const base = clean([model, baseModel ? variant : ''].filter(Boolean).join(' '));
  if (!base) {
    return [];
  }

  const compact = sanitizeAlias(base).replace(/[^a-z0-9]+/g, '');
  const spaced = splitAlphaDigit(compact);
  const hyphen = spaced.replace(/\s+/g, '-');
  const raw = sanitizeAlias(base);
  const spacedRaw = splitAlphaDigit(raw);
  const hyphenRaw = sanitizeAlias(spacedRaw.replace(/\s+/g, '-'));

  return [...new Set([compact, spaced, hyphen, raw, spacedRaw, hyphenRaw].filter(Boolean))];
}
