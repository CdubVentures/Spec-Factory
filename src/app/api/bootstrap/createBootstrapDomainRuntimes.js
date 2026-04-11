import fs from 'node:fs/promises';
import path from 'node:path';
import { createReviewCandidateRuntime } from '../../../features/review/domain/reviewCandidateRuntime.js';
import {
  createCatalogBuilder,
  createCompiledComponentDbPatcher,
} from '../catalogHelpers.js';
import { safeReadJson, listFiles } from '../../../shared/fileHelpers.js';

export function createBootstrapDomainRuntimes({
  config, HELPER_ROOT, storage, getSpecDb, cleanVariant,
}) {
  const {
    normalizeLower,
    isMeaningfulValue,
    candidateLooksReference,
    remapPendingComponentReviewItemsForNameChange,
  } = createReviewCandidateRuntime({
    getSpecDb,
  });

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
    remapPendingComponentReviewItemsForNameChange,
    // Catalog
    buildCatalog, patchCompiledComponentDb,
  };
}
