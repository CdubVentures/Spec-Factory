import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeLower, isMeaningfulValue, candidateLooksReference } from '../../../features/review/domain/reviewCandidateRuntime.js';
import {
  createCatalogBuilder,
  createCompiledComponentDbPatcher,
} from '../catalogHelpers.js';
import { safeReadJson, listFiles } from '../../../shared/fileHelpers.js';

export function createBootstrapDomainRuntimes({
  HELPER_ROOT, getSpecDb, cleanVariant,
}) {

  // ── Catalog builder (SQL-first: reads from specDb products + field_candidates) ──
  const buildCatalog = createCatalogBuilder({
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
