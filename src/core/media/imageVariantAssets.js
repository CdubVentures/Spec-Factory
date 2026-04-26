import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const IMAGE_MIME_TYPES = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
});

const ASSET_MIME_TYPES = Object.freeze({
  ...IMAGE_MIME_TYPES,
  '.webm': 'video/webm',
});

const IMAGE_VARIANTS = Object.freeze({
  thumb: { maxDimension: 320, quality: 88, maxAge: 86400 },
  preview: { maxDimension: 1600, quality: 94, maxAge: 86400 },
});

function fileFingerprint(stat) {
  return `${Math.trunc(stat.mtimeMs).toString(36)}-${stat.size.toString(36)}`;
}

function normalizeVariant(value) {
  const token = String(value || '').trim().toLowerCase();
  return Object.hasOwn(IMAGE_VARIANTS, token) ? token : 'full';
}

function mimeTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ASSET_MIME_TYPES[ext] || 'application/octet-stream';
}

function isImagePath(filePath) {
  return Object.hasOwn(IMAGE_MIME_TYPES, path.extname(filePath).toLowerCase());
}

function etagFor({ variant, stat }) {
  return `"${variant}-${fileFingerprint(stat)}"`;
}

function shouldReturnNotModified(req, etag) {
  const header = req?.headers?.['if-none-match'] || req?.headers?.['If-None-Match'];
  if (!header) return false;
  return String(header).split(',').map((part) => part.trim()).includes(etag);
}

function cacheControlFor(variant) {
  if (variant === 'full') {
    return 'private, max-age=300, stale-while-revalidate=3600';
  }
  return `private, max-age=${IMAGE_VARIANTS[variant].maxAge}, stale-while-revalidate=604800`;
}

function derivedFilename({ sourcePath, variant, sourceStat }) {
  const stem = path.basename(sourcePath, path.extname(sourcePath)).replace(/[^\w-]+/g, '-');
  return `${stem}-${fileFingerprint(sourceStat)}-${variant}.webp`;
}

function derivedStem(sourcePath) {
  return path.basename(sourcePath, path.extname(sourcePath)).replace(/[^\w-]+/g, '-');
}

async function ensureDerivedImage({ sourcePath, cacheDir, variant, sourceStat }) {
  const config = IMAGE_VARIANTS[variant];
  if (!config || !isImagePath(sourcePath)) {
    return { filePath: sourcePath, contentType: mimeTypeFor(sourcePath), variant: 'full' };
  }

  const targetDir = path.join(cacheDir, variant);
  const targetPath = path.join(targetDir, derivedFilename({ sourcePath, variant, sourceStat }));
  if (fs.existsSync(targetPath)) {
    return { filePath: targetPath, contentType: 'image/webp', variant };
  }

  fs.mkdirSync(targetDir, { recursive: true });
  const tmpPath = `${targetPath}.${process.pid}.tmp`;
  try {
    await sharp(sourcePath)
      .rotate()
      .resize({
        width: config.maxDimension,
        height: config.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: config.quality,
        effort: 4,
        smartSubsample: true,
      })
      .toFile(tmpPath);
    fs.renameSync(tmpPath, targetPath);
    return { filePath: targetPath, contentType: 'image/webp', variant };
  } catch {
    try { fs.rmSync(tmpPath, { force: true }); } catch { /* best effort */ }
    return { filePath: sourcePath, contentType: mimeTypeFor(sourcePath), variant: 'full' };
  }
}

export async function serveLocalAsset({ sourcePath, cacheDir, variant: rawVariant, req, res }) {
  const sourceStat = fs.statSync(sourcePath);
  const variant = normalizeVariant(rawVariant);
  const resolved = variant === 'full'
    ? { filePath: sourcePath, contentType: mimeTypeFor(sourcePath), variant: 'full' }
    : await ensureDerivedImage({ sourcePath, cacheDir, variant, sourceStat });
  const assetStat = fs.statSync(resolved.filePath);
  const etag = etagFor({ variant: resolved.variant, stat: resolved.variant === 'full' ? sourceStat : assetStat });
  const headers = {
    'Content-Type': resolved.contentType,
    'Content-Length': assetStat.size,
    'Cache-Control': cacheControlFor(resolved.variant),
    ETag: etag,
  };

  if (shouldReturnNotModified(req, etag)) {
    res.writeHead(304, {
      'Cache-Control': headers['Cache-Control'],
      ETag: etag,
    });
    res.end();
    return true;
  }

  res.writeHead(200, headers);
  fs.createReadStream(resolved.filePath).pipe(res);
  return true;
}

export function removeLocalAssetVariants({ sourcePath, cacheDir }) {
  const stem = `${derivedStem(sourcePath)}-`;
  for (const variant of Object.keys(IMAGE_VARIANTS)) {
    const dir = path.join(cacheDir, variant);
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.startsWith(stem)) continue;
      try { fs.rmSync(path.join(dir, entry), { force: true }); } catch { /* best effort */ }
    }
  }
}
