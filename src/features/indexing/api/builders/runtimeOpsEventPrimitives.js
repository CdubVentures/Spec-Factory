export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toFloat(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function parseTsMs(value) {
  if (!value) return 0;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : 0;
}

export function extractUrl(event) {
  const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
  return String(payload.url || event?.url || '').trim();
}

export function extractEventUrls(event) {
  const payload = payloadOf(event);
  const urls = new Set();
  const directUrl = String(payload.url || event?.url || '').trim();
  const finalUrl = String(payload.final_url || payload.finalUrl || '').trim();
  if (directUrl) urls.add(directUrl);
  if (finalUrl) urls.add(finalUrl);
  return [...urls];
}

export function extractPrimaryEventUrl(event) {
  const payload = payloadOf(event);
  return String(payload.final_url || payload.finalUrl || payload.url || event?.url || '').trim();
}

export function extractHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

export function eventType(event) {
  return String(event?.event || '').trim();
}

export function payloadOf(event) {
  const p = event?.payload;
  return p && typeof p === 'object' ? p : {};
}

export function fetchStatusCode(payload, fallback = 0) {
  const source = payload && typeof payload === 'object' ? payload : {};
  if (source.status_code !== undefined && source.status_code !== null && source.status_code !== '') {
    return toInt(source.status_code, fallback);
  }
  return toInt(source.status, fallback);
}

export function sourceProcessedParseMethod(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return String(
    source.parse_method
    || source.article_extraction_method
    || source.static_dom_mode
    || ''
  ).trim() || null;
}

export function parseFinishedMethod(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  return String(source.parse_method || source.article_extraction_method || source.static_dom_mode || '').trim() || null;
}

export function buildScreenshotRecord(evt, payload, kindOverride = null, options = {}) {
  const filename = String(payload?.screenshot_uri || '').trim();
  if (!filename) return null;
  const kind = String(kindOverride || eventType(evt) || '').trim() || 'screenshot';
  const resolveScreenshotMetadata = typeof options?.resolveScreenshotMetadata === 'function'
    ? options.resolveScreenshotMetadata
    : null;
  let width = toInt(payload?.width, 0);
  let height = toInt(payload?.height, 0);
  let bytes = toInt(payload?.bytes, 0);
  if (resolveScreenshotMetadata && (width <= 0 || height <= 0 || bytes <= 0)) {
    try {
      const metadata = resolveScreenshotMetadata(filename, {
        event: evt,
        payload,
        kind,
      });
      if (metadata && typeof metadata === 'object') {
        width = width > 0 ? width : toInt(metadata.width, 0);
        height = height > 0 ? height : toInt(metadata.height, 0);
        bytes = bytes > 0 ? bytes : toInt(metadata.bytes, 0);
      }
    } catch {
      // Keep event payload values when metadata hydration fails.
    }
  }
  return {
    filename,
    url: extractUrl(evt),
    width,
    height,
    bytes,
    ts: String(evt?.ts || '').trim(),
    kind,
  };
}
