// WHY: Pure helpers for per-category spec seed templates. SQL is the runtime
// source when a SpecDb is available; spec_seeds.json is the rebuild mirror.

import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_SPEC_SEEDS = Object.freeze(['{product} specifications']);

export function defaultSpecSeeds() {
  return [...DEFAULT_SPEC_SEEDS];
}

export function validateSpecSeeds(data) {
  if (!Array.isArray(data)) return { valid: false, reason: 'not_an_array' };
  for (let i = 0; i < data.length; i++) {
    if (typeof data[i] !== 'string' || !data[i].trim()) {
      return { valid: false, reason: `entry_${i}_not_a_nonempty_string` };
    }
  }
  return { valid: true, reason: '' };
}

export async function readSpecSeedsFile(root, category) {
  const filePath = path.join(root, category, 'spec_seeds.json');
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const check = validateSpecSeeds(parsed);
    return check.valid ? parsed : defaultSpecSeeds();
  } catch (error) {
    if (error.code === 'ENOENT') return defaultSpecSeeds();
    throw error;
  }
}

export async function readSpecSeeds({ root, category, specDb = null } = {}) {
  if (specDb?.hasSpecSeedTemplates?.(category)) {
    return specDb.listSpecSeedTemplates(category);
  }
  const seeds = await readSpecSeedsFile(root, category);
  if (specDb?.replaceSpecSeedTemplates) {
    return specDb.replaceSpecSeedTemplates(seeds, category);
  }
  return seeds;
}

export async function writeSpecSeedsFile(root, category, seeds) {
  const check = validateSpecSeeds(seeds);
  if (!check.valid) throw new Error(`Invalid spec seeds: ${check.reason}`);
  const dir = path.join(root, category);
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, 'spec_seeds.json');
  const tmpPath = filePath + '.tmp';
  await fs.writeFile(tmpPath, JSON.stringify(seeds, null, 2) + '\n', 'utf8');
  await fs.rename(tmpPath, filePath);
}

export async function writeSpecSeeds({ root, category, seeds, specDb = null } = {}) {
  const check = validateSpecSeeds(seeds);
  if (!check.valid) throw new Error(`Invalid spec seeds: ${check.reason}`);
  if (specDb?.replaceSpecSeedTemplates) {
    specDb.replaceSpecSeedTemplates(seeds, category);
  }
  await writeSpecSeedsFile(root, category, seeds);
  return seeds;
}
