import {
  readSourcesFile,
} from './sourceFileService.js';
import {
  readSpecSeedsFile,
  defaultSpecSeeds,
} from './specSeedsFileService.js';

function hasSourceContent(data) {
  return Object.keys(data?.sources || {}).length > 0
    || Object.keys(data?.approved || {}).length > 0
    || (Array.isArray(data?.denylist) && data.denylist.length > 0);
}

export async function rebuildSourceStrategyFromJson({ specDb, helperRoot }) {
  const category = String(specDb?.category || '').trim().toLowerCase();
  if (!specDb?.replaceSourceStrategyDocument || !category) {
    return { reseeded: false, sources_seeded: 0 };
  }
  const data = await readSourcesFile(helperRoot, category);
  if (!hasSourceContent(data)) {
    return { reseeded: false, sources_seeded: 0 };
  }
  const doc = specDb.replaceSourceStrategyDocument(data, category);
  return {
    reseeded: true,
    sources_seeded: Object.keys(doc?.sources || {}).length,
  };
}

export async function rebuildSpecSeedsFromJson({ specDb, helperRoot }) {
  const category = String(specDb?.category || '').trim().toLowerCase();
  if (!specDb?.replaceSpecSeedTemplates || !category) {
    return { reseeded: false, seeds_seeded: 0 };
  }
  const seeds = await readSpecSeedsFile(helperRoot, category);
  const resolvedSeeds = Array.isArray(seeds) ? seeds : defaultSpecSeeds();
  specDb.replaceSpecSeedTemplates(resolvedSeeds, category);
  return {
    reseeded: true,
    seeds_seeded: resolvedSeeds.length,
  };
}
