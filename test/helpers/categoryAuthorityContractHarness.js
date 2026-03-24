import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveRepoRoot(importMetaUrl) {
  return path.resolve(path.dirname(fileURLToPath(importMetaUrl)), '../../..');
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

export function approvedDomainsFromSources(sources) {
  const approved = new Set();
  for (const values of Object.values(sources.approved || {})) {
    for (const value of values || []) {
      approved.add(String(value).trim().toLowerCase());
    }
  }
  for (const source of Object.values(sources.sources || {})) {
    if (!source?.base_url) {
      continue;
    }
    approved.add(new URL(source.base_url).hostname.replace(/^www\./, '').toLowerCase());
  }
  return approved;
}

export function mapSourcesByHost(sources) {
  const byHost = new Map();
  for (const [sourceId, source] of Object.entries(sources.sources || {})) {
    if (!source?.base_url) {
      continue;
    }
    const host = new URL(source.base_url).hostname.replace(/^www\./, '').toLowerCase();
    byHost.set(host, { sourceId, source });
  }
  return byHost;
}

export function createCategoryAuthorityHarness({ category, importMetaUrl }) {
  const repoRoot = resolveRepoRoot(importMetaUrl);
  const categoryRoot = path.join(repoRoot, 'category_authority', category);

  return {
    category,
    repoRoot,
    categoryRoot,
    readCategoryJson(...segments) {
      return readJson(path.join(categoryRoot, ...segments));
    },
  };
}

export async function createCategoryAuthorityWorkspace({
  category,
  categoryRoot,
  prefix = `${category}-contract-`,
}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const helperRoot = path.join(tempRoot, 'category_authority');
  const localCategoryRoot = path.join(helperRoot, category);
  const dbPath = path.join(tempRoot, 'spec.sqlite');

  await fs.mkdir(helperRoot, { recursive: true });
  await fs.cp(categoryRoot, localCategoryRoot, { recursive: true });

  return {
    tempRoot,
    helperRoot,
    localCategoryRoot,
    dbPath,
    async cleanup() {
      await fs.rm(tempRoot, { recursive: true, force: true });
    },
  };
}
