import { matchVariant } from './variantMatch.js';

export const PIF_PROMPT_HISTORY_KNOBS = Object.freeze({
  priority: Object.freeze({
    imageHistory: 'priorityViewRunImageHistoryEnabled',
    linkValidation: 'priorityViewRunLinkValidationEnabled',
  }),
  individual: Object.freeze({
    imageHistory: 'individualViewRunImageHistoryEnabled',
    linkValidation: 'individualViewRunLinkValidationEnabled',
  }),
  loop: Object.freeze({
    imageHistory: 'loopRunImageHistoryEnabled',
    linkValidation: 'loopRunLinkValidationEnabled',
  }),
});

export const LINK_VALIDATION_CHECKLIST = Object.freeze([
  'page loaded successfully',
  'direct image URL returns 2xx',
  'content-type is image',
  'dimensions pass the view minimum',
  'content hash is not duplicate',
  'variant/source evidence matches',
  'view label is based on pixels, not filename/query intent',
]);

function readBool(finderStore, key) {
  return finderStore?.getSetting?.(key) === 'true';
}

export function pifPromptHistoryRunType(runScopeKey = '') {
  if (runScopeKey === 'priority-view') return 'priority';
  if (String(runScopeKey).startsWith('view:')) return 'individual';
  if (String(runScopeKey).startsWith('loop-')) return 'loop';
  return null;
}

export function resolvePifPromptHistorySettings({ finderStore, runScopeKey } = {}) {
  const runType = pifPromptHistoryRunType(runScopeKey);
  const keys = runType ? PIF_PROMPT_HISTORY_KNOBS[runType] : null;
  return {
    runType,
    imageHistoryEnabled: keys ? readBool(finderStore, keys.imageHistory) : false,
    linkValidationEnabled: keys ? readBool(finderStore, keys.linkValidation) : false,
  };
}

function compactImageHistoryEntry(img) {
  return {
    view: img.view || '',
    url: img.url || '',
    source_page: img.source_page || '',
    width: Number(img.width) || 0,
    height: Number(img.height) || 0,
    content_hash: img.content_hash || '',
  };
}

export function collectPifImageHistory({ pifDoc, variant } = {}) {
  const images = Array.isArray(pifDoc?.selected?.images) ? pifDoc.selected.images : [];
  const seen = new Set();
  const history = [];

  for (const img of images) {
    if (!matchVariant(img, { variantId: variant?.variant_id, variantKey: variant?.key })) continue;
    const compact = compactImageHistoryEntry(img);
    const dedupKey = compact.url || compact.content_hash || `${compact.view}:${compact.source_page}`;
    if (!dedupKey || seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    history.push(compact);
  }

  return history;
}

function runMatchesVariant(run, variant) {
  const response = run?.response || {};
  const rId = response.variant_id;
  const rKey = response.variant_key;
  if (variant?.variant_id && rId) return rId === variant.variant_id;
  if (variant?.key && rKey) return rKey === variant.key;
  return false;
}

function validationEntryMatchesVariant(entry, variant) {
  const rId = entry?.variant_id;
  const rKey = entry?.variant_key;
  if (variant?.variant_id && rId) return rId === variant.variant_id;
  if (variant?.key && rKey) return rKey === variant.key;
  return true;
}

function compactValidationEntry(entry) {
  return {
    view: entry.view || '',
    url: entry.url || '',
    source_page: entry.source_page || '',
    accepted: Boolean(entry.accepted),
    stage: entry.stage || '',
    reason: entry.reason || '',
    status_code: entry.direct_image?.status_code ?? null,
    content_type: entry.direct_image?.content_type || '',
    width: entry.dimensions?.width ?? null,
    height: entry.dimensions?.height ?? null,
    duplicate_of: entry.content_hash?.duplicate_of || '',
  };
}

function compactLegacyDownloadError(error) {
  return {
    view: error?.view || '',
    url: error?.url || '',
    source_page: '',
    accepted: false,
    stage: 'legacy_download_error',
    reason: error?.error || error?.message || '',
    status_code: null,
    content_type: '',
    width: null,
    height: null,
    duplicate_of: '',
  };
}

export function collectPifLinkValidationHistory({ pifDoc, variant } = {}) {
  const runs = Array.isArray(pifDoc?.runs) ? pifDoc.runs : [];
  const seen = new Set();
  const history = [];

  for (const run of runs) {
    if (!runMatchesVariant(run, variant)) continue;

    const validationLog = Array.isArray(run.response?.image_validation_log)
      ? run.response.image_validation_log
      : [];
    for (const entry of validationLog) {
      if (!validationEntryMatchesVariant(entry, variant)) continue;
      const compact = compactValidationEntry(entry);
      const dedupKey = `${compact.url}:${compact.stage}:${compact.reason}:${compact.accepted}`;
      if (!compact.url || seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      history.push(compact);
    }

    const downloadErrors = Array.isArray(run.response?.download_errors)
      ? run.response.download_errors
      : [];
    for (const error of downloadErrors) {
      const compact = compactLegacyDownloadError(error);
      const dedupKey = `${compact.url}:${compact.reason}`;
      if (!compact.url || seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      history.push(compact);
    }
  }

  return history;
}

export function buildPifImageHistoryBlock({ imageHistory = [] } = {}) {
  if (!Array.isArray(imageHistory) || imageHistory.length === 0) return '';
  return `IMAGE HISTORY FOR THIS VARIANT
- Already accepted images are context, not a coverage ceiling.
- Better quality versions, alternate crops, and different useful angles are still welcome.
- Do not return the same direct image URL or byte-identical file again.
- Accepted images: ${JSON.stringify(imageHistory)}
`;
}

export function buildPifLinkValidationBlock({ linkValidationHistory = [] } = {}) {
  const checklist = LINK_VALIDATION_CHECKLIST.map((item) => `- ${item}`).join('\n');
  const lines = [
    'LINK VALIDATION CHECKLIST',
    'Before returning image candidates, validate each candidate against these checks:',
    checklist,
  ];

  if (Array.isArray(linkValidationHistory) && linkValidationHistory.length > 0) {
    lines.push(
      '',
      'Known prior candidate outcomes for this variant:',
      JSON.stringify(linkValidationHistory),
    );
  }

  return `${lines.join('\n')}\n`;
}

export function buildPifPromptHistoryBlocks({
  imageHistoryEnabled = false,
  linkValidationEnabled = false,
  imageHistory = [],
  linkValidationHistory = [],
} = {}) {
  const blocks = [];
  if (imageHistoryEnabled) {
    const block = buildPifImageHistoryBlock({ imageHistory });
    if (block) blocks.push(block);
  }
  if (linkValidationEnabled) {
    blocks.push(buildPifLinkValidationBlock({ linkValidationHistory }));
  }
  return blocks.length > 0 ? `${blocks.join('\n')}\n` : '';
}
