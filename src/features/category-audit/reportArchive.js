import fs from 'node:fs/promises';
import path from 'node:path';

const REPORT_ARCHIVE_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const ARCHIVABLE_TREES = new Set(['per-key', 'per-prompt', 'keys-order']);

function assertSafeCategoryPath(outputRoot, category, targetPath, label) {
  const root = path.resolve(outputRoot);
  const categoryRoot = path.resolve(root, category);
  const resolved = path.resolve(targetPath);
  if (resolved === categoryRoot || resolved.startsWith(`${categoryRoot}${path.sep}`)) {
    return resolved;
  }
  throw new Error(`${label}: unsafe archive path for ${category}`);
}

function archiveTimestamp(now) {
  return now.toISOString().replace(/[:.]/g, '-');
}

async function pathExists(filePath) {
  return fs.access(filePath).then(() => true).catch(() => false);
}

async function uniqueArchiveDestination(basePath) {
  if (!(await pathExists(basePath))) return basePath;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${basePath}-${index}`;
    if (!(await pathExists(candidate))) return candidate;
  }
  throw new Error(`archive destination collision at ${basePath}`);
}

export async function pruneReportArchives({ outputRoot, category, now = new Date() }) {
  const archiveRoot = assertSafeCategoryPath(
    outputRoot,
    category,
    path.resolve(outputRoot, category, 'archive'),
    'pruneReportArchives',
  );
  const cutoff = now.getTime() - REPORT_ARCHIVE_RETENTION_MS;
  const entries = await fs.readdir(archiveRoot, { withFileTypes: true }).catch((err) => {
    if (err?.code === 'ENOENT') return [];
    throw err;
  });

  await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const archivePath = path.join(archiveRoot, entry.name);
      const stat = await fs.stat(archivePath);
      if (stat.mtimeMs >= cutoff) return;
      await fs.rm(archivePath, { recursive: true, force: true });
    }));
}

export async function archiveExistingReportTree({
  outputRoot,
  category,
  treeName,
  now = new Date(),
}) {
  if (!ARCHIVABLE_TREES.has(treeName)) {
    throw new Error(`archiveExistingReportTree: unsupported report tree "${treeName}"`);
  }

  const sourcePath = assertSafeCategoryPath(
    outputRoot,
    category,
    path.resolve(outputRoot, category, treeName),
    'archiveExistingReportTree',
  );
  const archiveRoot = assertSafeCategoryPath(
    outputRoot,
    category,
    path.resolve(outputRoot, category, 'archive'),
    'archiveExistingReportTree',
  );

  let archivedPath = null;
  if (await pathExists(sourcePath)) {
    const baseDestination = path.join(archiveRoot, archiveTimestamp(now), treeName);
    const destination = await uniqueArchiveDestination(baseDestination);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(sourcePath, destination);
    archivedPath = destination;
  }

  await pruneReportArchives({ outputRoot, category, now });
  return { archivedPath, archiveRoot };
}

export async function ensureAuditorResponsesDir({ outputRoot, category }) {
  const responsesPath = assertSafeCategoryPath(
    outputRoot,
    category,
    path.resolve(outputRoot, category, 'auditors-responses'),
    'ensureAuditorResponsesDir',
  );
  await fs.mkdir(responsesPath, { recursive: true });
  return responsesPath;
}
