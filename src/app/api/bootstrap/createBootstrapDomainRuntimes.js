import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeLower, isMeaningfulValue, candidateLooksReference } from '../../../features/review/domain/reviewCandidateRuntime.js';
import {
  createCatalogBuilder,
  createCompiledComponentDbPatcher,
} from '../catalogHelpers.js';
import { safeReadJson, listFiles } from '../../../shared/fileHelpers.js';

export function createBootstrapDomainRuntimes({
  config, HELPER_ROOT, storage, getSpecDb, cleanVariant,
}) {

  // ── Catalog builder (SQL-first: reads from specDb products + queue tables) ──
  const buildCatalog = createCatalogBuilder({
    config,
    storage,
    getSpecDb,
    cleanVariant,
  });

  const patchCompiledComponentDb = createCompiledComponentDbPatcher({
    helperRoot: HELPER_ROOT,
    listFiles,
    safeReadJson,
    fs,
    path,
  });

  return {
    // Review candidate
    normalizeLower, isMeaningfulValue, candidateLooksReference,
    // Catalog
    buildCatalog, patchCompiledComponentDb,
  };
}
