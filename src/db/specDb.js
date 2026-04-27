/**
 * SpecDb — SQLite-backed spec data store.
 *
 * Pattern:
 * - better-sqlite3 synchronous API
 * - WAL journal mode + NORMAL sync
 * - Schema auto-created on construction
 * - All methods synchronous
 */

import Database from 'better-sqlite3';
import { SCHEMA } from './specDbSchema.js';
import { expandListLinkValues } from './specDbHelpers.js';
import { applyMigrations, backfillValueFingerprints } from './specDbMigrations.js';
import { prepareStatements } from './specDbStatements.js';
import {
  assertStrictIdentitySlotIntegrity as _assertIntegrity
} from './specDbIntegrity.js';
import { createItemStateStore } from './stores/itemStateStore.js';
import { createComponentStore } from './stores/componentStore.js';
import { createEnumListStore } from './stores/enumListStore.js';
import { createSourceIntelStore } from './stores/sourceIntelStore.js';
import { createQueueProductStore } from './stores/queueProductStore.js';
import { createPurgeStore } from './stores/purgeStore.js';
import { createRunMetaStore } from './stores/runMetaStore.js';
import { createArtifactStore } from './stores/artifactStore.js';
import { createRunArtifactStore } from './stores/runArtifactStore.js';
import { createTelemetryIndexStore } from './stores/telemetryIndexStore.js';
import { createFieldStudioMapStore } from './stores/fieldStudioMapStore.js';
import { createFieldKeyOrderStore } from './stores/fieldKeyOrderStore.js';
import { createCrawlLedgerStore } from './stores/crawlLedgerStore.js';
import { createSourceStrategyStore } from './stores/sourceStrategyStore.js';
import { createSpecSeedStore } from './stores/specSeedStore.js';
import { FINDER_MODULES } from '../core/finder/finderModuleRegistry.js';
import { createFinderSqlStore } from '../core/finder/finderSqlStore.js';
import { generateFinderDdl } from '../core/finder/finderSqlDdl.js';
import { FINDER_GLOBAL_SETTINGS_DDL } from './appDbSchema.js';
import { createFieldCandidateStore } from './stores/fieldCandidateStore.js';
import { createFieldCandidateEvidenceStore } from './stores/fieldCandidateEvidenceStore.js';
import { createVariantStore } from './stores/variantStore.js';
import { createPifVariantProgressStore } from './stores/pifVariantProgressStore.js';

export class SpecDb {
  constructor({ dbPath, category, globalDb }) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    // WHY: field_candidate_evidence.candidate_id FK uses ON DELETE CASCADE —
    // SQLite requires this pragma to enforce references at runtime.
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
    // WHY: Auto-create tables for all registered finder modules.
    // Uses IF NOT EXISTS so existing tables (like CEF in static SCHEMA) are no-ops.
    for (const ddl of generateFinderDdl(FINDER_MODULES)) {
      this.db.exec(ddl);
    }
    this.category = category;

    // WHY: Finder modules with settingsScope='global' read/write against a
    // shared `finder_global_settings` table. Production wiring passes the
    // appDb handle. Unit tests that construct specDb standalone get an
    // ephemeral in-memory globalDb so the store's settings path works.
    if (globalDb) {
      this._globalDb = globalDb;
      this._ownsGlobalDb = false;
    } else {
      this._globalDb = new Database(':memory:');
      this._globalDb.exec(FINDER_GLOBAL_SETTINGS_DDL);
      this._ownsGlobalDb = true;
    }

    applyMigrations(this.db);
    this.assertStrictIdentitySlotIntegrity();


    Object.assign(this, prepareStatements(this.db));

    this._componentStore = createComponentStore({
      db: this.db, category: this.category,
      stmts: { _upsertComponentIdentity: this._upsertComponentIdentity, _insertAlias: this._insertAlias, _upsertComponentValue: this._upsertComponentValue }
    });
    this._enumListStore = createEnumListStore({
      db: this.db, category: this.category,
      stmts: { _upsertEnumList: this._upsertEnumList, _upsertListValue: this._upsertListValue },
    });
    this._itemStateStore = createItemStateStore({
      db: this.db, category: this.category,
      stmts: { _upsertItemComponentLink: this._upsertItemComponentLink, _upsertItemListLink: this._upsertItemListLink },
      expandListLinkValues,
      getListValueByFieldAndValue: (...args) => this._enumListStore.getListValueByFieldAndValue(...args)
    });
    this._sourceIntelStore = createSourceIntelStore({
      db: this.db, category: this.category,
      stmts: {
        _insertBridgeEvent: this._insertBridgeEvent, _getBridgeEventsByRunId: this._getBridgeEventsByRunId,
      }
    });
    this._queueProductStore = createQueueProductStore({
      db: this.db, category: this.category,
      stmts: {
        _upsertProduct: this._upsertProduct,
      }
    });
    this._purgeStore = createPurgeStore({ db: this.db, category: this.category });
    this._runMetaStore = createRunMetaStore({
      db: this.db, category: this.category,
      stmts: {
        _upsertRun: this._upsertRun,
        _getRunByRunId: this._getRunByRunId,
        _getRunsByCategory: this._getRunsByCategory,
        _sweepOrphanRuns: this._sweepOrphanRuns,
      }
    });
    this._artifactStore = createArtifactStore({
      db: this.db, category: this.category,
      stmts: {
        _insertCrawlSource: this._insertCrawlSource, _insertScreenshot: this._insertScreenshot, _insertVideo: this._insertVideo,
        _getCrawlSourcesByProduct: this._getCrawlSourcesByProduct, _getScreenshotsByProduct: this._getScreenshotsByProduct, _getVideosByProduct: this._getVideosByProduct,
        _getCrawlSourceByHash: this._getCrawlSourceByHash,
      }
    });
    this._runArtifactStore = createRunArtifactStore({
      stmts: { _upsertRunArtifact: this._upsertRunArtifact, _getRunArtifact: this._getRunArtifact, _getRunArtifactsByRunId: this._getRunArtifactsByRunId }
    });
    this._telemetryIndexStore = createTelemetryIndexStore({
      db: this.db,
      category: this.category,
      stmts: {
        _insertKnobSnapshot: this._insertKnobSnapshot,
        _getKnobSnapshots: this._getKnobSnapshots,
        _insertQueryIndexEntry: this._insertQueryIndexEntry,
        _getQueryIndexByCategory: this._getQueryIndexByCategory,
        _insertUrlIndexEntry: this._insertUrlIndexEntry,
        _getUrlIndexByCategory: this._getUrlIndexByCategory,
        _insertPromptIndexEntry: this._insertPromptIndexEntry,
        _getPromptIndexByCategory: this._getPromptIndexByCategory,
      }
    });
    this._fieldStudioMapStore = createFieldStudioMapStore({
      stmts: { _getFieldStudioMap: this._getFieldStudioMap, _upsertFieldStudioMap: this._upsertFieldStudioMap, _upsertCompiledRules: this._upsertCompiledRules },
    });
    this._fieldKeyOrderStore = createFieldKeyOrderStore({
      stmts: { _getFieldKeyOrder: this._getFieldKeyOrder, _setFieldKeyOrder: this._setFieldKeyOrder, _deleteFieldKeyOrder: this._deleteFieldKeyOrder },
    });
    this._sourceStrategyStore = createSourceStrategyStore({
      db: this.db,
      category: this.category,
      stmts: {
        _upsertSourceStrategyMeta: this._upsertSourceStrategyMeta,
        _getSourceStrategyMeta: this._getSourceStrategyMeta,
        _deleteSourceStrategyEntries: this._deleteSourceStrategyEntries,
        _upsertSourceStrategyEntry: this._upsertSourceStrategyEntry,
        _listSourceStrategyEntries: this._listSourceStrategyEntries,
        _countSourceStrategyEntries: this._countSourceStrategyEntries,
      },
    });
    this._specSeedStore = createSpecSeedStore({
      db: this.db,
      category: this.category,
      stmts: {
        _upsertSpecSeedSet: this._upsertSpecSeedSet,
        _getSpecSeedSet: this._getSpecSeedSet,
        _deleteSpecSeedTemplates: this._deleteSpecSeedTemplates,
        _insertSpecSeedTemplate: this._insertSpecSeedTemplate,
        _listSpecSeedTemplates: this._listSpecSeedTemplates,
      },
    });
    this._crawlLedgerStore = createCrawlLedgerStore({
      db: this.db,
      category: this.category,
      stmts: {
        _upsertUrlCrawlEntry: this._upsertUrlCrawlEntry,
        _getUrlCrawlEntry: this._getUrlCrawlEntry,
        _getUrlCrawlEntriesByProduct: this._getUrlCrawlEntriesByProduct,
        _aggregateDomainStats: this._aggregateDomainStats,
        _upsertQueryCooldown: this._upsertQueryCooldown,
        _getQueryCooldown: this._getQueryCooldown,
        _getQueryCooldownRaw: this._getQueryCooldownRaw,
        _getQueryCooldownsByProduct: this._getQueryCooldownsByProduct,
        _purgeExpiredCooldowns: this._purgeExpiredCooldowns,
      },
    });
    // WHY: Generic finder store map — auto-wires all registered finder modules.
    // Existing CEF delegating methods below use this map for backward compat.
    // globalDb flows into stores whose module declares settingsScope='global'.
    this._finderStores = new Map();
    for (const mod of FINDER_MODULES) {
      this._finderStores.set(mod.id, createFinderSqlStore({
        db: this.db, category: this.category, module: mod, globalDb: this._globalDb,
      }));
    }
    this._fieldCandidateStore = createFieldCandidateStore({
      db: this.db,
      category: this.category,
      stmts: {
        _upsertFieldCandidate: this._upsertFieldCandidate,
        _getFieldCandidate: this._getFieldCandidate,
        _getFieldCandidatesByProductAndField: this._getFieldCandidatesByProductAndField,
        _getAllFieldCandidatesByProduct: this._getAllFieldCandidatesByProduct,
        _deleteFieldCandidatesByProduct: this._deleteFieldCandidatesByProduct,
        _deleteFieldCandidatesByProductAndField: this._deleteFieldCandidatesByProductAndField,
        _getFieldCandidatesPaginated: this._getFieldCandidatesPaginated,
        _countFieldCandidates: this._countFieldCandidates,
        _getFieldCandidatesStats: this._getFieldCandidatesStats,
        _insertFieldCandidate: this._insertFieldCandidate,
        _getFieldCandidateBySourceId: this._getFieldCandidateBySourceId,
        _getFieldCandidateBySourceIdAndVariant: this._getFieldCandidateBySourceIdAndVariant,
        _deleteFieldCandidateBySourceId: this._deleteFieldCandidateBySourceId,
        _deleteFieldCandidatesBySourceType: this._deleteFieldCandidatesBySourceType,
        _getFieldCandidatesByValue: this._getFieldCandidatesByValue,
        _countFieldCandidatesBySourceId: this._countFieldCandidatesBySourceId,
      },
    });
    this._fieldCandidateEvidenceStore = createFieldCandidateEvidenceStore({
      db: this.db,
      category: this.category,
      stmts: {
        _insertFieldCandidateEvidence: this._insertFieldCandidateEvidence,
        _deleteFieldCandidateEvidenceByCandidateId: this._deleteFieldCandidateEvidenceByCandidateId,
        _listFieldCandidateEvidenceByCandidateId: this._listFieldCandidateEvidenceByCandidateId,
        _listFieldCandidateEvidenceByTier: this._listFieldCandidateEvidenceByTier,
        _countFieldCandidateEvidenceByCandidateId: this._countFieldCandidateEvidenceByCandidateId,
        _countFieldCandidateSubstantiveEvidenceByCandidateId: this._countFieldCandidateSubstantiveEvidenceByCandidateId,
        _countFieldCandidateEvidenceSplitByCandidateId: this._countFieldCandidateEvidenceSplitByCandidateId,
      },
    });
    this._variantStore = createVariantStore({
      db: this.db,
      category: this.category,
      stmts: {
        _upsertVariant: this._upsertVariant,
        _getVariant: this._getVariant,
        _listVariantsByProduct: this._listVariantsByProduct,
        _listActiveVariantsByProduct: this._listActiveVariantsByProduct,
        _deleteVariant: this._deleteVariant,
        _deleteVariantsByProduct: this._deleteVariantsByProduct,
      },
    });
    this._pifVariantProgressStore = createPifVariantProgressStore({
      category: this.category,
      stmts: {
        _upsertPifVariantProgress: this._upsertPifVariantProgress,
        _listPifVariantProgressByProduct: this._listPifVariantProgressByProduct,
        _deletePifVariantProgressByProduct: this._deletePifVariantProgressByProduct,
        _deletePifVariantProgressByVariant: this._deletePifVariantProgressByVariant,
      },
    });
  }

  get variants() { return this._variantStore; }

  // --- PIF variant progress (materialized carousel progress per variant) ---

  upsertPifVariantProgress(row) { this._pifVariantProgressStore.upsert(row); }
  listPifVariantProgressByProduct(pid) { return this._pifVariantProgressStore.listByProduct(pid); }
  deletePifVariantProgressByProduct(pid) { this._pifVariantProgressStore.removeByProduct(pid); }
  deletePifVariantProgressByVariant(pid, vid) { this._pifVariantProgressStore.removeByVariant(pid, vid); }

  assertStrictIdentitySlotIntegrity() {
    _assertIntegrity(this.db);
  }

  close() {
    this.db.close();
    if (this._ownsGlobalDb && this._globalDb) {
      try { this._globalDb.close(); } catch { /* best-effort */ }
    }
  }

  getSpecDbSyncState(category = this.category) {
    const normalizedCategory = String(category || this.category || '').trim().toLowerCase();
    if (!normalizedCategory) {
      return {
        category: '',
        specdb_sync_version: 0,
        last_sync_status: 'unknown',
        last_sync_at: null,
        last_sync_meta: {},
      };
    }
    const row = this._getDataAuthoritySync.get(normalizedCategory);
    if (!row) {
      return {
        category: normalizedCategory,
        specdb_sync_version: 0,
        last_sync_status: 'unknown',
        last_sync_at: null,
        last_sync_meta: {},
      };
    }
    let lastSyncMeta = {};
    try {
      lastSyncMeta = JSON.parse(String(row.last_sync_meta || '{}'));
    } catch {
      lastSyncMeta = {};
    }
    return {
      category: normalizedCategory,
      specdb_sync_version: Number.parseInt(String(row.specdb_sync_version ?? 0), 10) || 0,
      last_sync_status: String(row.last_sync_status || 'unknown'),
      last_sync_at: row.last_sync_at ? String(row.last_sync_at) : null,
      last_sync_meta: lastSyncMeta,
    };
  }

  recordSpecDbSync({
    category = this.category,
    status = 'ok',
    meta = {},
    at = null,
    version = null,
  } = {}) {
    const normalizedCategory = String(category || this.category || '').trim().toLowerCase();
    if (!normalizedCategory) {
      throw new Error('specdb_sync_category_required');
    }
    const current = this.getSpecDbSyncState(normalizedCategory);
    const requestedVersion = Number.parseInt(String(version ?? ''), 10);
    const nextVersion = Number.isFinite(requestedVersion) && requestedVersion >= 0
      ? requestedVersion
      : (Math.max(0, Number(current.specdb_sync_version || 0)) + 1);
    const statusToken = String(status || 'ok').trim() || 'ok';
    const rawAt = String(at || '').trim();
    const parsedAt = rawAt ? Date.parse(rawAt) : Date.now();
    const syncAt = Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : new Date().toISOString();
    const payload = meta && typeof meta === 'object' ? meta : {};

    this._upsertDataAuthoritySync.run({
      category: normalizedCategory,
      specdb_sync_version: nextVersion,
      last_sync_status: statusToken,
      last_sync_at: syncAt,
      last_sync_meta: JSON.stringify(payload),
    });

    return this.getSpecDbSyncState(normalizedCategory);
  }

  // WHY: Per-file hash storage for targeted rebuild. Each JSON source file gets
  // its own hash so the seed pipeline can detect which specific file changed and
  // wipe + re-import only that file's tables. Stored in data_authority_sync.last_sync_meta.file_hashes.
  getFileSeedHash(fileKey, category = this.category) {
    const state = this.getSpecDbSyncState(category);
    return state.last_sync_meta?.file_hashes?.[fileKey] || null;
  }

  setFileSeedHash(fileKey, hash, category = this.category) {
    const state = this.getSpecDbSyncState(category);
    const meta = { ...state.last_sync_meta };
    meta.file_hashes = { ...(meta.file_hashes || {}), [fileKey]: hash };
    this.recordSpecDbSync({
      category,
      status: state.last_sync_status || 'ok',
      meta,
      version: state.specdb_sync_version,
    });
  }

  // --- Source Strategy / Spec Seeds ---

  getSourceStrategyDocument(category = this.category) {
    return this._sourceStrategyStore.getSourceStrategyDocument(category);
  }

  hasSourceStrategyDocument(category = this.category) {
    return this._sourceStrategyStore.hasSourceStrategyDocument(category);
  }

  replaceSourceStrategyDocument(doc, category = this.category) {
    return this._sourceStrategyStore.replaceSourceStrategyDocument(doc, category);
  }

  hasSpecSeedTemplates(category = this.category) {
    return this._specSeedStore.hasSpecSeedTemplates(category);
  }

  listSpecSeedTemplates(category = this.category) {
    return this._specSeedStore.listSpecSeedTemplates(category);
  }

  replaceSpecSeedTemplates(seeds, category = this.category) {
    return this._specSeedStore.replaceSpecSeedTemplates(seeds, category);
  }

  // --- Candidates (stubbed — tables removed in Phase 7a, callers removed in 7b-7d) ---

  insertCandidate() {}
  insertCandidatesBatch() {}
  getCandidatesForField() { return []; }
  getCandidatesForProduct() { return {}; }
  getCandidateById() { return null; }
  upsertReview() {}
  getReviewsForCandidate() { return []; }
  getReviewsForContext() { return []; }

  // --- Components ---
  upsertComponentIdentity(opts) { return this._componentStore.upsertComponentIdentity(opts); }
  insertAlias(componentId, alias, source) { this._componentStore.insertAlias(componentId, alias, source); }
  upsertComponentValue(opts) { this._componentStore.upsertComponentValue(opts); }
  getComponentValues(t, n) { return this._componentStore.getComponentValues(t, n); }
  getAllComponentIdentities(t) { return this._componentStore.getAllComponentIdentities(t); }
  getComponentIdentity(t, n, m) { return this._componentStore.getComponentIdentity(t, n, m); }
  getComponentIdentityById(id) { return this._componentStore.getComponentIdentityById(id); }
  findComponentByAlias(t, a) { return this._componentStore.findComponentByAlias(t, a); }
  backfillComponentIdentityIds() { this._componentStore.backfillComponentIdentityIds(); }

  backfillEnumListIds() { this._enumListStore.backfillEnumListIds(); }
  hardenListValueOwnership() { this._enumListStore.hardenListValueOwnership(); }

  ensureEnumList(fk, s) { return this._enumListStore.ensureEnumList(fk, s); }
  getEnumList(fk) { return this._enumListStore.getEnumList(fk); }
  getEnumListById(id) { return this._enumListStore.getEnumListById(id); }
  getAllEnumLists() { return this._enumListStore.getAllEnumLists(); }
  upsertListValue(opts) { this._enumListStore.upsertListValue(opts); }
  getListValues(fk) { return this._enumListStore.getListValues(fk); }
  getListValueByFieldAndValue(fk, v) { return this._enumListStore.getListValueByFieldAndValue(fk, v); }
  getListValueById(id) { return this._enumListStore.getListValueById(id); }

  // --- Item links ---

  upsertItemComponentLink(opts) { this._itemStateStore.upsertItemComponentLink(opts); }
  upsertItemListLink(opts) { this._itemStateStore.upsertItemListLink(opts); }
  removeItemListLinksForField(productId, fieldKey) { this._itemStateStore.removeItemListLinksForField(productId, fieldKey); }
  syncItemListLinkForFieldValue(opts) { return this._itemStateStore.syncItemListLinkForFieldValue(opts); }
  getItemComponentLinks(productId) { return this._itemStateStore.getItemComponentLinks(productId); }
  getItemListLinks(productId) { return this._itemStateStore.getItemListLinks(productId); }
  // --- Reverse-Lookup Queries (component/enum review) ---

  getProductsForComponent(t, n, m) { return this._itemStateStore.getProductsForComponent(t, n, m); }
  getCandidatesForComponentProperty() { return []; }
  getProductsByListValueId(id) { return this._itemStateStore.getProductsByListValueId(id); }
  getProductsForListValue(fk, v) { return this._itemStateStore.getProductsForListValue(fk, v); }
  getCandidatesByListValue() { return []; }
  getCandidatesForFieldValue() { return []; }

  getComponentTypeList() { return this._componentStore.getComponentTypeList(); }
  getPropertyColumnsForType(t) { return this._componentStore.getPropertyColumnsForType(t); }
  getAllComponentsForType(t) { return this._componentStore.getAllComponentsForType(t); }
  getComponentValuesWithMaker(t, n, m) { return this._componentStore.getComponentValuesWithMaker(t, n, m); }
  getComponentValueById(id) { return this._componentStore.getComponentValueById(id); }
  getAllEnumFields() { return this._enumListStore.getAllEnumFields(); }
  updateComponentReviewStatus(t, n, m, s) { this._componentStore.updateComponentReviewStatus(t, n, m, s); }
  updateAliasesOverridden(t, n, m, o) { this._componentStore.updateAliasesOverridden(t, n, m, o); }
  mergeComponentIdentities(opts) { this._componentStore.mergeComponentIdentities(opts); }
  getDistinctMakersForComponentName(t, n) { return this._componentStore.getDistinctMakersForComponentName(t, n); }
  getComponentIdentityCollision(t, n, m, ex) { return this._componentStore.getComponentIdentityCollision(t, n, m, ex); }
  updateComponentIdentityFields(id, opts) { this._componentStore.updateComponentIdentityFields(id, opts); }
  updateComponentValuesByIdentity(t, on, om, nn, nm) { this._componentStore.updateComponentValuesByIdentity(t, on, om, nn, nm); }
  clearComponentValueAcceptedCandidate(id) { this._componentStore.clearComponentValueAcceptedCandidate(id); }
  deleteComponentAliasesBySource(cid, src) { this._componentStore.deleteComponentAliasesBySource(cid, src); }
  updateComponentLinks(id, links) { this._componentStore.updateComponentLinks(id, links); }
  updateComponentReviewStatusById(id, s) { this._componentStore.updateComponentReviewStatusById(id, s); }
  updateComponentValueNeedsReview(id, nr) { this._componentStore.updateComponentValueNeedsReview(id, nr); }

  purgeCategoryState(category) { return this._purgeStore.purgeCategoryState(category); }
  purgeProductReviewState(category, productId) { return this._purgeStore.purgeProductReviewState(category, productId); }

  deleteListValue(fieldKey, value) { return this._enumListStore.deleteListValue(fieldKey, value); }
  deleteListValueById(listValueId) { return this._enumListStore.deleteListValueById(listValueId); }
  renameListValue(fieldKey, oldValue, newValue, timestamp) { return this._enumListStore.renameListValue(fieldKey, oldValue, newValue, timestamp); }
  renameListValueById(listValueId, newValue, timestamp) { return this._enumListStore.renameListValueById(listValueId, newValue, timestamp); }

  removeListLinks(fk, v) { this._itemStateStore.removeListLinks(fk, v); }
  updateItemComponentLinksByIdentity(t, on, om, nn, nm) { this._itemStateStore.updateItemComponentLinksByIdentity(t, on, om, nn, nm); }

  // --- Component cascade helpers ---

  pushAuthoritativeValueToLinkedProducts(componentType, componentName, componentMaker, propertyKey, newValue) {
    return [];
  }

  evaluateAndFlagLinkedProducts(componentType, componentName, componentMaker, propertyKey, newComponentValue, variancePolicy) {
    return { violations: [], compliant: [] };
  }

  evaluateConstraintsForLinkedProducts(componentType, componentName, componentMaker, propertyKey, constraints) {
    return { violations: [], compliant: [] };
  }

  // --- Product / Curation / Component Review ---

  upsertProduct(row) { this._queueProductStore.upsertProduct(row); }
  getProduct(pid) { return this._queueProductStore.getProduct(pid); }
  getAllProducts(sf) { return this._queueProductStore.getAllProducts(sf); }
  deleteProduct(pid) { return this._queueProductStore.deleteProduct(pid); }

  counts() {
    const tables = [
      'component_values', 'component_identity',
      'component_aliases', 'enum_lists', 'list_values', 'item_component_links',
      'item_list_links', 'products',
      'color_edition_finder',
      'color_edition_finder_runs'
    ];
    const result = {};
    for (const table of tables) {
      try {
        const row = this.db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get();
        result[table] = row.c;
      } catch { result[table] = 0; }
    }
    return result;
  }

  /** Check if the DB has been seeded with any meaningful data */
  isSeeded() {
    const ci = this.db.prepare('SELECT COUNT(*) as c FROM component_identity WHERE category = ?').get(this.category);
    if (ci.c > 0) return true;
    const lv = this.db.prepare('SELECT COUNT(*) as c FROM list_values WHERE category = ?').get(this.category);
    if (lv.c > 0) return true;
    try {
      const prod = this.db.prepare('SELECT COUNT(*) as c FROM products WHERE category = ?').get(this.category);
      if (prod.c > 0) return true;
    } catch { /* Phase 2 table may not exist yet */ }
    return false;
  }

  // --- Telemetry Indexes ---
  insertKnobSnapshot(row) { this._telemetryIndexStore.insertKnobSnapshot(row); }
  getKnobSnapshots(cat, limit) { return this._telemetryIndexStore.getKnobSnapshots(cat, limit); }
  insertQueryIndexEntry(row) { this._telemetryIndexStore.insertQueryIndexEntry(row); }
  getQueryIndexByCategory(cat, limit) { return this._telemetryIndexStore.getQueryIndexByCategory(cat, limit); }
  insertUrlIndexEntry(row) { this._telemetryIndexStore.insertUrlIndexEntry(row); }
  getUrlIndexByCategory(cat, limit) { return this._telemetryIndexStore.getUrlIndexByCategory(cat, limit); }
  insertPromptIndexEntry(row) { this._telemetryIndexStore.insertPromptIndexEntry(row); }
  getPromptIndexByCategory(cat, limit) { return this._telemetryIndexStore.getPromptIndexByCategory(cat, limit); }

  // --- Crawl Ledger ---
  upsertUrlCrawlEntry(row) { this._crawlLedgerStore.upsertUrlCrawlEntry(row); }
  getUrlCrawlEntry(url, pid) { return this._crawlLedgerStore.getUrlCrawlEntry(url, pid); }
  getUrlCrawlEntriesByProduct(pid) { return this._crawlLedgerStore.getUrlCrawlEntriesByProduct(pid); }
  aggregateDomainStats(domains, pid) { return this._crawlLedgerStore.aggregateDomainStats(domains, pid); }
  upsertQueryCooldown(row) { this._crawlLedgerStore.upsertQueryCooldown(row); }
  getQueryCooldown(hash, pid) { return this._crawlLedgerStore.getQueryCooldown(hash, pid); }
  getQueryCooldownsByProduct(pid) { return this._crawlLedgerStore.getQueryCooldownsByProduct(pid); }
  buildQueryExecutionHistory(pid) { return this._crawlLedgerStore.buildQueryExecutionHistory(pid); }
  purgeExpiredCooldowns() { return this._crawlLedgerStore.purgeExpiredCooldowns(); }

  // --- Generic Finder Store Accessor ---
  // WHY: O(1) access to any registered finder's SQL store.
  // New modules use this directly; legacy CEF methods below for backward compat.
  getFinderStore(moduleId) { return this._finderStores.get(moduleId); }

  // --- Color & Edition Finder (backward-compat — delegates to generic store) ---
  upsertColorEditionFinder(row) { this.getFinderStore('colorEditionFinder').upsert(row); }
  getColorEditionFinder(pid) { return this.getFinderStore('colorEditionFinder').get(pid); }
  listColorEditionFinderByCategory(cat) { return this.getFinderStore('colorEditionFinder').listByCategory(cat); }
  getColorEditionFinderIfOnCooldown(pid) { return this.getFinderStore('colorEditionFinder').getIfOnCooldown(pid); }
  deleteColorEditionFinder(pid) { return this.getFinderStore('colorEditionFinder').remove(pid); }

  // --- Color & Edition Finder Runs (backward-compat) ---
  insertColorEditionFinderRun(row) { this.getFinderStore('colorEditionFinder').insertRun(row); }
  listColorEditionFinderRuns(pid) { return this.getFinderStore('colorEditionFinder').listRuns(pid); }
  getLatestColorEditionFinderRun(pid) { return this.getFinderStore('colorEditionFinder').getLatestRun(pid); }
  deleteColorEditionFinderRunByNumber(pid, runNum) { return this.getFinderStore('colorEditionFinder').removeRun(pid, runNum); }
  deleteAllColorEditionFinderRuns(pid) { return this.getFinderStore('colorEditionFinder').removeAllRuns(pid); }

  // --- Runtime Events ---

  // --- Bridge Events (transformed runtime events for GUI readers) ---

  insertBridgeEvent(e) { this._sourceIntelStore.insertBridgeEvent(e); }
  getBridgeEventsByRunId(runId, limit) { return this._sourceIntelStore.getBridgeEventsByRunId(runId, limit); }
  purgeBridgeEventsForRun(runId) { return this._sourceIntelStore.purgeBridgeEventsForRun(runId); }

  // --- Run Metadata (mid-run state, replaces run.json overwrites) ---

  upsertRun(row) { this._runMetaStore.upsertRun(row); }
  getRunByRunId(runId) { return this._runMetaStore.getRunByRunId(runId); }
  getRunsByCategory(category, limit) { return this._runMetaStore.getRunsByCategory(category, limit); }
  sweepOrphanRuns(opts) { return this._runMetaStore.sweepOrphanRuns(opts); }

  // --- Run Artifacts (needset, search_profile, brand_resolution payloads) ---

  upsertRunArtifact(row) { this._runArtifactStore.upsertRunArtifact(row); }
  getRunArtifact(runId, type) { return this._runArtifactStore.getRunArtifact(runId, type); }
  getRunArtifactsByRunId(runId) { return this._runArtifactStore.getRunArtifactsByRunId(runId); }

  // --- Artifact Store (crawl_sources, source_screenshots, source_videos) ---

  insertCrawlSource(row) { return this._artifactStore.insertCrawlSource(row); }
  insertScreenshot(row) { return this._artifactStore.insertScreenshot(row); }
  insertVideo(row) { return this._artifactStore.insertVideo(row); }
  getCrawlSourcesByProduct(pid) { return this._artifactStore.getCrawlSourcesByProduct(pid); }
  getScreenshotsByProduct(pid) { return this._artifactStore.getScreenshotsByProduct(pid); }
  getVideosByProduct(pid) { return this._artifactStore.getVideosByProduct(pid); }
  getCrawlSourceByHash(hash, pid) { return this._artifactStore.getCrawlSourceByHash(hash, pid); }

  // --- Field Studio Map (per-category control-plane config) ---

  getFieldStudioMap() { return this._fieldStudioMapStore.getFieldStudioMap(); }
  upsertFieldStudioMap(mapJson, mapHash) { return this._fieldStudioMapStore.upsertFieldStudioMap(mapJson, mapHash); }

  // --- Field Key Order (instant order persistence) ---

  getFieldKeyOrder(category) { return this._fieldKeyOrderStore.getFieldKeyOrder(category); }
  setFieldKeyOrder(category, orderJson) { return this._fieldKeyOrderStore.setFieldKeyOrder(category, orderJson); }
  deleteFieldKeyOrder(category) { return this._fieldKeyOrderStore.deleteFieldKeyOrder(category); }

  // --- Compiled Rules + Boot Config (SSOT for all field-rules consumers) ---

  getCompiledRules() { return this._fieldStudioMapStore.getCompiledRules(); }
  getBootConfig() { return this._fieldStudioMapStore.getBootConfig(); }
  upsertCompiledRules(compiledRulesJson, bootConfigJson) { return this._fieldStudioMapStore.upsertCompiledRules(compiledRulesJson, bootConfigJson); }

  // --- Field Candidates ---

  upsertFieldCandidate(opts) { this._fieldCandidateStore.upsert(opts); }
  getFieldCandidate(pid, fk, val) { return this._fieldCandidateStore.get(pid, fk, val); }
  getFieldCandidatesByProductAndField(pid, fk, variantId) { return this._fieldCandidateStore.getByProductAndField(pid, fk, variantId); }
  getAllFieldCandidatesByProduct(pid) { return this._fieldCandidateStore.getAllByProduct(pid); }
  getAllFieldCandidatesByCategory() { return this._fieldCandidateStore.getAllByCategory(); }
  deleteFieldCandidatesByProduct(pid) { this._fieldCandidateStore.deleteByProduct(pid); }
  deleteFieldCandidatesByProductAndField(pid, fk) { this._fieldCandidateStore.deleteByProductAndField(pid, fk); }
  deleteFieldCandidateByValue(pid, fk, val) { this._fieldCandidateStore.deleteByProductFieldValue(pid, fk, val); }
  getFieldCandidatesPaginated(opts) { return this._fieldCandidateStore.getPaginated(opts); }
  countFieldCandidates() { return this._fieldCandidateStore.count(); }
  getFieldCandidatesStats() { return this._fieldCandidateStore.stats(); }
  markFieldCandidateResolved(pid, fk, val, variantId) { this._fieldCandidateStore.markResolved(pid, fk, val, variantId); }
  demoteResolvedCandidates(pid, fk, variantId) { this._fieldCandidateStore.demoteResolved(pid, fk, variantId); }
  getResolvedFieldCandidate(pid, fk) { return this._fieldCandidateStore.getResolved(pid, fk); }
  getTopFieldCandidate(pid, fk) { return this._fieldCandidateStore.getTopCandidate(pid, fk); }
  getDistinctCandidateProducts() { return this._fieldCandidateStore.getDistinctProducts(); }
  backfillValueFingerprints() { return backfillValueFingerprints(this.db); }

  // WHY: Deterministic publisher — pooled evidence count for a value bucket.
  // fingerprint keys the bucket; minConfidence is the per-ref threshold on the
  // 0-1 scale (caller normalizes publishConfidenceThreshold). NULL evidence
  // confidence counts as qualifying (legacy tolerance).
  countPooledQualifyingEvidenceByFingerprint({ productId, fieldKey, fingerprint, variantId, minConfidence }) {
    const row = this._countPooledQualifyingEvidenceByFingerprint.get(
      this.category,
      String(productId || ''),
      String(fieldKey || ''),
      String(fingerprint ?? ''),
      variantId ?? null,
      Number(minConfidence ?? 0),
    );
    return Number(row?.total || 0);
  }

  // WHY: Bucket evaluator input — one row per distinct value (via
  // value_fingerprint). Caller uses member_ids to cascade resolve marks.
  listFieldBuckets({ productId, fieldKey, variantId }) {
    const rows = this._listFieldBuckets.all(
      this.category,
      String(productId || ''),
      String(fieldKey || ''),
      variantId ?? null,
    );
    return rows.map(r => ({
      value_fingerprint: r.value_fingerprint,
      top_confidence: Number(r.top_confidence || 0),
      member_count: Number(r.member_count || 0),
      member_ids: String(r.member_ids_csv || '')
        .split(',')
        .filter(Boolean)
        .map(n => Number(n)),
      value: r.value,
    }));
  }

  // WHY: keyFinderLoop satisfaction check — cheaper than getResolvedFieldCandidate
  // (no row hydration, no JSON parse); returns boolean "any resolved?"
  hasPublishedValue(productId, fieldKey) {
    const row = this._hasPublishedValue.get(
      this.category,
      String(productId || ''),
      String(fieldKey || ''),
    );
    return Boolean(row);
  }

  // --- Source-centric field candidate methods ---
  insertFieldCandidate(opts) { this._fieldCandidateStore.insert(opts); }
  getFieldCandidateBySourceId(pid, fk, sid) { return this._fieldCandidateStore.getBySourceId(pid, fk, sid); }
  getFieldCandidateBySourceIdAndVariant(pid, fk, sid, vid) { return this._fieldCandidateStore.getBySourceIdAndVariant(pid, fk, sid, vid); }
  deleteFieldCandidateBySourceId(pid, fk, sid) { this._fieldCandidateStore.deleteBySourceId(pid, fk, sid); }
  deleteFieldCandidatesBySourceType(pid, fk, st) { this._fieldCandidateStore.deleteBySourceType(pid, fk, st); }
  getFieldCandidatesByValue(pid, fk, val) { return this._fieldCandidateStore.getByValue(pid, fk, val); }
  markFieldCandidateResolvedByValue(pid, fk, val) { this._fieldCandidateStore.markResolvedByValue(pid, fk, val); }
  countFieldCandidatesBySourceId(pid, sid) { return this._fieldCandidateStore.countBySourceId(pid, sid); }
  updateFieldCandidateValue(pid, fk, sid, val) { this._fieldCandidateStore.updateValue(pid, fk, sid, val); }
  deleteFieldCandidatesByVariantId(pid, vid) { this._fieldCandidateStore.deleteByVariantId(pid, vid); }
  deleteFieldCandidatesByProductFieldVariant(pid, fk, vid) { this._fieldCandidateStore.deleteByProductFieldVariant(pid, fk, vid); }
  resetFieldCandidateConfidence(id) { this._fieldCandidateStore.resetConfidence(id); }
  updateFieldCandidateMetadata(id, metadataJson) { this._fieldCandidateStore.updateMetadata(id, metadataJson); }

  // ── Field candidate evidence (relational projection) ─────────────
  insertFieldCandidateEvidence(opts) { this._fieldCandidateEvidenceStore.insert(opts); }
  insertFieldCandidateEvidenceMany(candidateId, refs) { return this._fieldCandidateEvidenceStore.insertMany(candidateId, refs); }
  deleteFieldCandidateEvidenceByCandidateId(candidateId) { this._fieldCandidateEvidenceStore.deleteByCandidateId(candidateId); }
  listFieldCandidateEvidenceByCandidateId(candidateId) { return this._fieldCandidateEvidenceStore.listByCandidateId(candidateId); }
  listFieldCandidateEvidenceByTier(tier) { return this._fieldCandidateEvidenceStore.listByTier(tier); }
  countFieldCandidateEvidenceByCandidateId(candidateId) { return this._fieldCandidateEvidenceStore.countByCandidateId(candidateId); }
  countFieldCandidateSubstantiveEvidenceByCandidateId(candidateId) { return this._fieldCandidateEvidenceStore.countSubstantiveByCandidateId(candidateId); }
  countFieldCandidateEvidenceSplitByCandidateId(candidateId) { return this._fieldCandidateEvidenceStore.countSplitByCandidateId(candidateId); }
  replaceFieldCandidateEvidence(candidateId, refs) { return this._fieldCandidateEvidenceStore.replaceForCandidate(candidateId, refs); }

}
