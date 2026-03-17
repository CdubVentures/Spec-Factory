import fsSync from 'node:fs';

export function escapeSvgText(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function shouldSynthesizeRuntimeProofFrame(worker = {}) {
  const pool = String(worker?.pool || '').trim();
  const fetchMode = String(worker?.fetch_mode || '').trim();
  const state = String(worker?.state || '').trim();
  return (
    pool === 'fetch'
    && (fetchMode === 'crawlee' || fetchMode === 'playwright')
    && state !== 'running'
    && state !== 'stuck'
  );
}

export function buildSyntheticRuntimeProofFrame({
  runId = '',
  worker = {},
  detail = {},
} = {}) {
  const width = 1280;
  const height = 720;
  const documents = Array.isArray(detail?.documents) ? detail.documents : [];
  const primaryDocument = documents[0] || {};
  const statusCode = primaryDocument?.status_code ?? null;
  const docStatus = String(primaryDocument?.status || '').trim();
  const fetchMode = String(worker?.fetch_mode || 'fetch').trim();
  const currentUrl = String(worker?.current_url || primaryDocument?.url || '').trim();
  const host = String(primaryDocument?.host || '').trim();
  const lastError = String(worker?.last_error || '').trim() || 'No browser frame was captured before this fetch ended.';
  const endedAt = String(primaryDocument?.last_event_ts || worker?.started_at || new Date().toISOString()).trim();
  const statusLabel = statusCode !== null && statusCode !== undefined
    ? `HTTP ${statusCode}`
    : (docStatus ? docStatus.toUpperCase() : 'NO_STATUS');
  const title = `Synthetic proof frame · ${fetchMode}`;
  const lines = [
    currentUrl || '(no url recorded)',
    `Status: ${statusLabel}`,
    host ? `Host: ${host}` : '',
    `Worker: ${String(worker?.worker_id || '').trim() || '(unknown worker)'}`,
    lastError,
    'Reason: browser-backed fetch ended without a retained runtime screenshot.',
  ].filter(Boolean);
  const safeTitle = escapeSvgText(title);
  const safeTimestamp = escapeSvgText(endedAt);
  const lineSvg = lines
    .slice(0, 6)
    .map((line, index) => (
      `<text x="72" y="${188 + (index * 64)}" fill="#d7e1eb" font-size="28" font-family="Consolas, 'Courier New', monospace">${escapeSvgText(line)}</text>`
    ))
    .join('');
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#09111a"/>',
    '<rect x="40" y="40" width="1200" height="640" rx="24" fill="#101a25" stroke="#2d4358" stroke-width="2"/>',
    `<text x="72" y="112" fill="#f8fafc" font-size="42" font-family="Segoe UI, Arial, sans-serif" font-weight="700">${safeTitle}</text>`,
    `<text x="72" y="148" fill="#7dd3fc" font-size="22" font-family="Segoe UI, Arial, sans-serif">Ended ${safeTimestamp}</text>`,
    lineSvg,
    '<text x="72" y="628" fill="#8aa0b5" font-size="22" font-family="Segoe UI, Arial, sans-serif">Runtime Ops generated this proof frame because no retained browser image was available.</text>',
    '</svg>',
  ].join('');

  return {
    run_id: String(runId || '').trim(),
    worker_id: String(worker?.worker_id || '').trim(),
    data: Buffer.from(svg, 'utf8').toString('base64'),
    width,
    height,
    ts: endedAt,
    mime_type: 'image/svg+xml',
    synthetic: true,
  };
}

export function readPngDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 24) {
    return { width: 0, height: 0 };
  }
  const pngSignature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== pngSignature) {
    return { width: 0, height: 0 };
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

export function isJpegStartOfFrameMarker(marker) {
  return marker === 0xc0
    || marker === 0xc1
    || marker === 0xc2
    || marker === 0xc3
    || marker === 0xc5
    || marker === 0xc6
    || marker === 0xc7
    || marker === 0xc9
    || marker === 0xca
    || marker === 0xcb
    || marker === 0xcd
    || marker === 0xce
    || marker === 0xcf;
}

export function readJpegDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) {
    return { width: 0, height: 0 };
  }
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return { width: 0, height: 0 };
  }
  let offset = 2;
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let markerOffset = offset + 1;
    while (markerOffset < buffer.length && buffer[markerOffset] === 0xff) {
      markerOffset += 1;
    }
    if (markerOffset >= buffer.length) {
      break;
    }
    const marker = buffer[markerOffset];
    offset = markerOffset + 1;
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    if (offset + 1 >= buffer.length) {
      break;
    }
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) {
      break;
    }
    if (isJpegStartOfFrameMarker(marker) && offset + 7 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }
    offset += segmentLength;
  }
  return { width: 0, height: 0 };
}

export function readImageDimensions(buffer, filename = '') {
  const token = String(filename || '').trim().toLowerCase();
  if (token.endsWith('.png')) {
    return readPngDimensions(buffer);
  }
  return readJpegDimensions(buffer);
}

export function buildRuntimeAssetCandidatePaths({ filename, storage, OUTPUT_ROOT, path, runDir = '', runId = '' }) {
  const normalized = String(filename || '').trim().replace(/\\/g, '/');
  if (!normalized) {
    return [];
  }

  const candidates = [];
  const seen = new Set();
  const pushCandidate = (candidatePath) => {
    const token = String(candidatePath || '').trim();
    if (!token) return;
    const resolved = path.resolve(token);
    if (seen.has(resolved)) return;
    seen.add(resolved);
    candidates.push(resolved);
  };

  if (normalized.includes('/')) {
    if (typeof storage?.resolveLocalPath === 'function') {
      pushCandidate(storage.resolveLocalPath(normalized));
    } else if (OUTPUT_ROOT) {
      pushCandidate(path.join(OUTPUT_ROOT, ...normalized.split('/')));
    }

    const runMatch = normalized.match(/(?:^|\/)runs\/([^/]+)\/(.+)$/);
    const archiveRunId = String(runId || runMatch?.[1] || '').trim();
    const relativeRunPath = String(runMatch?.[2] || '').trim();
    if (OUTPUT_ROOT && archiveRunId && relativeRunPath) {
      pushCandidate(path.join(
        OUTPUT_ROOT,
        '_runtime',
        'archived_runs',
        's3',
        archiveRunId,
        'run_output',
        ...relativeRunPath.split('/'),
      ));
      pushCandidate(path.join(
        OUTPUT_ROOT,
        '_runtime',
        'archived_runs',
        's3',
        archiveRunId,
        'latest_snapshot',
        ...relativeRunPath.split('/'),
      ));
    }
    return candidates;
  }

  if (runDir) {
    pushCandidate(path.join(runDir, 'screenshots', normalized));
  }
  return candidates;
}

export function createRuntimeScreenshotMetadataResolver({ storage, OUTPUT_ROOT, path }) {
  const cache = new Map();
  return function resolveScreenshotMetadata(filename, context = {}) {
    const key = String(filename || '').trim().replace(/\\/g, '/');
    if (!key) {
      return null;
    }
    if (cache.has(key)) {
      return cache.get(key);
    }
    const eventRunId = String(context?.event?.run_id || context?.event?.runId || '').trim();
    const candidatePaths = buildRuntimeAssetCandidatePaths({
      filename: key,
      storage,
      OUTPUT_ROOT,
      path,
      runId: eventRunId,
    });
    if (candidatePaths.length === 0) {
      cache.set(key, null);
      return null;
    }

    for (const localPath of candidatePaths) {
      try {
        const buffer = fsSync.readFileSync(localPath);
        const dimensions = readImageDimensions(buffer, key);
        const metadata = {
          bytes: buffer.length,
          width: Number(dimensions.width || 0) || 0,
          height: Number(dimensions.height || 0) || 0,
        };
        cache.set(key, metadata);
        return metadata;
      } catch {
        // Try the next candidate.
      }
    }

    cache.set(key, null);
    return null;
  };
}
