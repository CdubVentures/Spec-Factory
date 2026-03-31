/**
 * SpecDb — SQLite-backed spec candidate/review data store.
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
import { applyMigrations } from './specDbMigrations.js';
import { prepareStatements } from './specDbStatements.js';
import {
  cleanupLegacyIdentityFallbackRows as _cleanupLegacy,
  assertStrictIdentitySlotIntegrity as _assertIntegrity
} from './specDbIntegrity.js';
import { createCandidateStore } from './stores/candidateStore.js';
import { createItemStateStore } from './stores/itemStateStore.js';
import { createComponentStore } from './stores/componentStore.js';
import { createEnumListStore } from './stores/enumListStore.js';
import { createKeyReviewStore } from './stores/keyReviewStore.js';
import { createBillingStore } from './stores/billingStore.js';
import { createSourceIntelStore } from './stores/sourceIntelStore.js';
import { createQueueProductStore } from './stores/queueProductStore.js';
import { createLlmRouteSourceStore } from './stores/llmRouteSourceStore.js';
import { createFieldHistoryStore } from './stores/fieldHistoryStore.js';
import { createPurgeStore } from './stores/purgeStore.js';
import { createRunMetaStore } from './stores/runMetaStore.js';
import { createArtifactStore } from './stores/artifactStore.js';
import { createRunArtifactStore } from './stores/runArtifactStore.js';
import { createTelemetryIndexStore } from './stores/telemetryIndexStore.js';
import { createProvenanceStore } from './stores/provenanceStore.js';
import { createFieldStudioMapStore } from './stores/fieldStudioMapStore.js';
import { createCrawlLedgerStore } from './stores/crawlLedgerStore.js';

export class SpecDb {
  constructor({ dbPath, category }) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(SCHEMA);
    this.category = category;

    applyMigrations(this.db);
    this.cleanupLegacyIdentityFallbackRows();
    this.assertStrictIdentitySlotIntegrity();


    Object.assign(this, prepareStatements(this.db));

    this._candidateStore = createCandidateStore({
      db: this.db, category: this.category,
      stmts: { _insertCandidate: this._insertCandidate, _upsertReview: this._upsertReview }
    });
    this._componentStore = createComponentStore({
      db: this.db, category: this.category,
      stmts: { _upsertComponentIdentity: this._upsertComponentIdentity, _insertAlias: this._insertAlias, _upsertComponentValue: this._upsertComponentValue }
    });
    this._enumListStore = createEnumListStore({
      db: this.db, category: this.category,
      stmts: { _upsertEnumList: this._upsertEnumList, _upsertListValue: this._upsertListValue },
      deleteKeyReviewStateRowsByIds: (...args) => this._keyReviewStore.deleteKeyReviewStateRowsByIds(...args)
    });
    this._itemStateStore = createItemStateStore({
      db: this.db, category: this.category,
      stmts: { _upsertItemFieldState: this._upsertItemFieldState, _upsertItemComponentLink: this._upsertItemComponentLink, _upsertItemListLink: this._upsertItemListLink },
      expandListLinkValues,
      getListValueByFieldAndValue: (...args) => this._enumListStore.getListValueByFieldAndValue(...args)
    });
    this._keyReviewStore = createKeyReviewStore({
      db: this.db, category: this.category,
      stmts: { _insertKeyReviewState: this._insertKeyReviewState, _insertKeyReviewRun: this._insertKeyReviewRun, _insertKeyReviewRunSource: this._insertKeyReviewRunSource, _insertKeyReviewAudit: this._insertKeyReviewAudit }
    });
    this._billingStore = createBillingStore({
      db: this.db,
      stmts: { _insertBillingEntry: this._insertBillingEntry }
    });
    this._sourceIntelStore = createSourceIntelStore({
      db: this.db, category: this.category,
      stmts: {
        _getLlmCache: this._getLlmCache, _upsertLlmCache: this._upsertLlmCache, _evictExpiredCache: this._evictExpiredCache,
        _upsertLearningProfile: this._upsertLearningProfile, _upsertCategoryBrain: this._upsertCategoryBrain,
        _upsertSourceCorpus: this._upsertSourceCorpus, _insertRuntimeEvent: this._insertRuntimeEvent,
        _insertBridgeEvent: this._insertBridgeEvent, _getBridgeEventsByRunId: this._getBridgeEventsByRunId,
      }
    });
    this._queueProductStore = createQueueProductStore({
      db: this.db, category: this.category,
      stmts: {
        _upsertQueueProduct: this._upsertQueueProduct,
        _upsertProductRun: this._upsertProductRun,
        _upsertProduct: this._upsertProduct,
        _updateRunStorageLocation: this._updateRunStorageLocation,
        _getRunStorageLocation: this._getRunStorageLocation,
        _listRunsByStorageState: this._listRunsByStorageState,
        _countRunsByStorageState: this._countRunsByStorageState,
      }
    });
    this._llmRouteSourceStore = createLlmRouteSourceStore({
      db: this.db, category: this.category,
      stmts: {
        _upsertLlmRoute: this._upsertLlmRoute,
        _upsertSourceRegistry: this._upsertSourceRegistry, _insertSourceArtifact: this._insertSourceArtifact,
        _upsertSourceAssertion: this._upsertSourceAssertion, _insertSourceEvidenceRef: this._insertSourceEvidenceRef
      }
    });
    this._fieldHistoryStore = createFieldHistoryStore({
      category: this.category,
      stmts: { _upsertFieldHistory: this._upsertFieldHistory, _getFieldHistories: this._getFieldHistories, _deleteFieldHistories: this._deleteFieldHistories }
    });
    this._purgeStore = createPurgeStore({ db: this.db, category: this.category });
    this._runMetaStore = createRunMetaStore({
      db: this.db, category: this.category,
      stmts: { _upsertRun: this._upsertRun, _getRunByRunId: this._getRunByRunId, _getRunsByCategory: this._getRunsByCategory }
    });
    this._artifactStore = createArtifactStore({
      db: this.db, category: this.category,
      stmts: {
        _insertCrawlSource: this._insertCrawlSource, _insertScreenshot: this._insertScreenshot, _insertPdf: this._insertPdf, _insertVideo: this._insertVideo,
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
    this._provenanceStore = createProvenanceStore({
      category: this.category,
      stmts: { _getProvenanceForProduct: this._getProvenanceForProduct },
    });
    this._fieldStudioMapStore = createFieldStudioMapStore({
      stmts: { _getFieldStudioMap: this._getFieldStudioMap, _upsertFieldStudioMap: this._upsertFieldStudioMap },
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
  }

  cleanupLegacyIdentityFallbackRows() {
    return _cleanupLegacy(this.db);
  }

  assertStrictIdentitySlotIntegrity() {
    _assertIntegrity(this.db);
  }

  close() {
    this.db.close();
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

  // --- Brand Domains ---

  getBrandDomain(brand, category) {
    return this.db.prepare(
      'SELECT * FROM brand_domains WHERE brand = ? AND category = ?'
    ).get(brand, category) || null;
  }

  upsertBrandDomain(row) {
    this.db.prepare(`
      INSERT OR REPLACE INTO brand_domains (brand, category, official_domain, aliases, support_domain, confidence)
      VALUES (@brand, @category, @official_domain, @aliases, @support_domain, @confidence)
    `).run({
      brand: row.brand,
      category: row.category,
      official_domain: row.official_domain || null,
      aliases: row.aliases || '[]',
      support_domain: row.support_domain || null,
      confidence: row.confidence ?? 0.8
    });
  }

  // --- Source Strategy --- (removed: sources.json is now the SSOT via sourceFileService.js)

  // --- Candidates ---

  insertCandidate(row) { return this._candidateStore.insertCandidate(row); }
  insertCandidatesBatch(rows) { this._candidateStore.insertCandidatesBatch(rows); }
  getCandidatesForField(productId, fieldKey) { return this._candidateStore.getCandidatesForField(productId, fieldKey); }
  getCandidatesForProduct(productId) { return this._candidateStore.getCandidatesForProduct(productId); }
  getCandidateById(candidateId) { return this._candidateStore.getCandidateById(candidateId); }
  upsertReview(opts) { return this._candidateStore.upsertReview(opts); }
  getReviewsForCandidate(candidateId) { return this._candidateStore.getReviewsForCandidate(candidateId); }
  getReviewsForContext(contextType, contextId) { return this._candidateStore.getReviewsForContext(contextType, contextId); }

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

  backfillKeyReviewSlotIds() { return this._keyReviewStore.backfillKeyReviewSlotIds(); }

  ensureEnumList(fk, s) { return this._enumListStore.ensureEnumList(fk, s); }
  getEnumList(fk) { return this._enumListStore.getEnumList(fk); }
  getEnumListById(id) { return this._enumListStore.getEnumListById(id); }
  getAllEnumLists() { return this._enumListStore.getAllEnumLists(); }
  upsertListValue(opts) { this._enumListStore.upsertListValue(opts); }
  getListValues(fk) { return this._enumListStore.getListValues(fk); }
  getListValueByFieldAndValue(fk, v) { return this._enumListStore.getListValueByFieldAndValue(fk, v); }
  getListValueById(id) { return this._enumListStore.getListValueById(id); }

  // --- Item state ---

  upsertItemFieldState(opts) { this._itemStateStore.upsertItemFieldState(opts); }
  getItemFieldState(productId) { return this._itemStateStore.getItemFieldState(productId); }
  getItemFieldStateById(id) { return this._itemStateStore.getItemFieldStateById(id); }
  getItemFieldStateByProductAndField(pid, fk) { return this._itemStateStore.getItemFieldStateByProductAndField(pid, fk); }
  markItemFieldStateReviewComplete(pid, fk) { this._itemStateStore.markItemFieldStateReviewComplete(pid, fk); }
  upsertItemComponentLink(opts) { this._itemStateStore.upsertItemComponentLink(opts); }
  upsertItemListLink(opts) { this._itemStateStore.upsertItemListLink(opts); }
  removeItemListLinksForField(productId, fieldKey) { this._itemStateStore.removeItemListLinksForField(productId, fieldKey); }
  syncItemListLinkForFieldValue(opts) { return this._itemStateStore.syncItemListLinkForFieldValue(opts); }
  getItemComponentLinks(productId) { return this._itemStateStore.getItemComponentLinks(productId); }
  getItemListLinks(productId) { return this._itemStateStore.getItemListLinks(productId); }
  getProvenanceForProduct(cat, productId) { return this._provenanceStore.getProvenanceForProduct(cat ?? this.category, productId); }
  getNormalizedForProduct(productId) {
    const rows = this.getItemFieldState(productId);
    const product = this.getProduct(productId);
    return {
      identity: { brand: product?.brand ?? '', model: product?.model ?? '', variant: product?.variant ?? '' },
      fields: Object.fromEntries(rows.filter(r => r.value != null).map(r => [r.field_key, r.value])),
    };
  }
  getSummaryForProduct(productId) {
    const run = this.getLatestProductRun(productId);
    return run?.summary || null;
  }
  getTrafficLightForProduct(productId) {
    const run = this.getLatestProductRun(productId);
    return run?.summary?.traffic_light || null;
  }

  // --- Reverse-Lookup Queries (component/enum review) ---

  getProductsForComponent(t, n, m) { return this._itemStateStore.getProductsForComponent(t, n, m); }
  getCandidatesForComponentProperty(t, n, m, fk) { return this._candidateStore.getCandidatesForComponentProperty(t, n, m, fk); }
  getProductsByListValueId(id) { return this._itemStateStore.getProductsByListValueId(id); }
  getProductsForListValue(fk, v) { return this._itemStateStore.getProductsForListValue(fk, v); }
  getProductsForFieldValue(fk, v) { return this._itemStateStore.getProductsForFieldValue(fk, v); }
  getCandidatesByListValue(fk, id) { return this._candidateStore.getCandidatesByListValue(fk, id); }
  getCandidatesForFieldValue(fk, v) { return this._candidateStore.getCandidatesForFieldValue(fk, v); }
  getItemFieldStateForProducts(pids, fks) { return this._itemStateStore.getItemFieldStateForProducts(pids, fks); }
  getDistinctItemFieldValues(fk) { return this._itemStateStore.getDistinctItemFieldValues(fk); }

  // WHY: Phase E2 — product review state + override fields for SQL-based override reading
  upsertProductReviewState(opts) { this._itemStateStore.upsertProductReviewState(opts); }
  getProductReviewState(pid) { return this._itemStateStore.getProductReviewState(pid); }
  listApprovedProductIds() { return this._itemStateStore.listApprovedProductIds(); }
  getOverriddenFieldsForProduct(pid) { return this._itemStateStore.getOverriddenFieldsForProduct(pid); }

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

  deleteKeyReviewStateRowsByIds(stateIds) { return this._keyReviewStore.deleteKeyReviewStateRowsByIds(stateIds); }

  // ── Purge operations (test-mode cleanup) ──
  deleteKeyReviewStatesByTargetKinds(category, targetKinds) { return this._purgeStore.deleteKeyReviewStatesByTargetKinds(category, targetKinds); }
  purgeCategoryState(category) { return this._purgeStore.purgeCategoryState(category); }
  purgeProductReviewState(category, productId) { return this._purgeStore.purgeProductReviewState(category, productId); }

  deleteListValue(fieldKey, value) { return this._enumListStore.deleteListValue(fieldKey, value); }
  deleteListValueById(listValueId) { return this._enumListStore.deleteListValueById(listValueId); }
  renameListValue(fieldKey, oldValue, newValue, timestamp) { return this._enumListStore.renameListValue(fieldKey, oldValue, newValue, timestamp); }
  renameListValueById(listValueId, newValue, timestamp) { return this._enumListStore.renameListValueById(listValueId, newValue, timestamp); }

  /** Update item_field_state.value from oldValue to newValue for all matching products.
   *  Returns the list of affected product_ids. */
  renameFieldValueInItems(fk, oldV, newV) { return this._itemStateStore.renameFieldValueInItems(fk, oldV, newV); }
  removeFieldValueFromItems(fk, v) { return this._itemStateStore.removeFieldValueFromItems(fk, v); }
  removeListLinks(fk, v) { this._itemStateStore.removeListLinks(fk, v); }
  updateItemComponentLinksByIdentity(t, on, om, nn, nm) { this._itemStateStore.updateItemComponentLinksByIdentity(t, on, om, nn, nm); }
  getItemFieldStateIdByProductAndField(pid, fk) { return this._itemStateStore.getItemFieldStateIdByProductAndField(pid, fk); }
  setItemFieldNeedsAiReview(id) { this._itemStateStore.setItemFieldNeedsAiReview(id); }

  // --- Component cascade helpers ---

  /**
   * For an authoritative component property, push the new value into every
   * linked product's item_field_state row for that property key.
   * Returns the list of affected product_ids.
   */
  pushAuthoritativeValueToLinkedProducts(componentType, componentName, componentMaker, propertyKey, newValue) {
    const linkRows = this.getProductsForComponent(componentType, componentName, componentMaker || '');
    if (linkRows.length === 0) return [];
    const productIds = linkRows.map(r => r.product_id);
    const tx = this.db.transaction(() => {
      for (const pid of productIds) {
        this.db.prepare(`
          INSERT INTO item_field_state (
            category, product_id, field_key, value, confidence, source,
            accepted_candidate_id, overridden, needs_ai_review, ai_review_complete
          ) VALUES (?, ?, ?, ?, ?, 'component_db', NULL, 0, 0, 0)
          ON CONFLICT(category, product_id, field_key) DO UPDATE SET
            value = excluded.value,
            confidence = excluded.confidence,
            source = 'component_db',
            accepted_candidate_id = NULL,
            overridden = 0,
            needs_ai_review = 0,
            ai_review_complete = 0,
            updated_at = datetime('now')
        `).run(
          this.category,
          pid,
          propertyKey,
          newValue ?? null,
          1.0
        );
      }
    });
    tx();
    return productIds;
  }

  /**
   * For bound/range variance policies, evaluate each linked product's current
   * value and set or clear needs_ai_review accordingly.
   * Returns { violations: string[], compliant: string[] } (product_ids).
   */
  evaluateAndFlagLinkedProducts(componentType, componentName, componentMaker, propertyKey, newComponentValue, variancePolicy) {
    const linkRows = this.getProductsForComponent(componentType, componentName, componentMaker || '');
    if (linkRows.length === 0) return { violations: [], compliant: [] };
    const productIds = linkRows.map(r => r.product_id);
    const fieldStates = this.getItemFieldStateForProducts(productIds, [propertyKey]);
    // Build a lookup: product_id → current value
    const valueMap = new Map();
    for (const fs of fieldStates) {
      valueMap.set(fs.product_id, fs.value);
    }
    const violations = [];
    const compliant = [];
    // Inline quick variance check (mirrors varianceEvaluator logic, avoids circular import)
    const skipVals = new Set(['', 'unk', 'n/a', 'n-a', 'null', 'undefined', 'unknown', '-']);
    const parseNum = (v) => {
      if (v == null) return NaN;
      const s = String(v).trim().replace(/,/g, '').replace(/\s+/g, '');
      const c = s.replace(/[a-zA-Z%°]+$/, '');
      return c ? Number(c) : NaN;
    };
    const isSkip = (v) => v == null || skipVals.has(String(v).trim().toLowerCase());
    const dbStr = String(newComponentValue ?? '').trim();
    const dbNum = parseNum(dbStr);
    const tx = this.db.transaction(() => {
      for (const pid of productIds) {
        const prodVal = valueMap.get(pid);
        // Skip if either side is unknown/missing
        if (isSkip(newComponentValue) || isSkip(prodVal)) {
          compliant.push(pid);
          this.db.prepare(
            'UPDATE item_field_state SET needs_ai_review = 0, updated_at = datetime(\'now\') WHERE category = ? AND product_id = ? AND field_key = ?'
          ).run(this.category, pid, propertyKey);
          continue;
        }
        const prodStr = String(prodVal).trim();
        const prodNum = parseNum(prodStr);
        let isViolation = false;
        if (variancePolicy === 'upper_bound') {
          if (!Number.isNaN(dbNum) && !Number.isNaN(prodNum)) {
            isViolation = prodNum > dbNum;
          }
        } else if (variancePolicy === 'lower_bound') {
          if (!Number.isNaN(dbNum) && !Number.isNaN(prodNum)) {
            isViolation = prodNum < dbNum;
          }
        } else if (variancePolicy === 'range') {
          if (!Number.isNaN(dbNum) && !Number.isNaN(prodNum)) {
            const margin = Math.abs(dbNum) * 0.10;
            isViolation = prodNum < (dbNum - margin) || prodNum > (dbNum + margin);
          }
        }
        if (isViolation) {
          violations.push(pid);
          this.db.prepare(
            'UPDATE item_field_state SET needs_ai_review = 1, updated_at = datetime(\'now\') WHERE category = ? AND product_id = ? AND field_key = ?'
          ).run(this.category, pid, propertyKey);
        } else {
          compliant.push(pid);
          this.db.prepare(
            'UPDATE item_field_state SET needs_ai_review = 0, updated_at = datetime(\'now\') WHERE category = ? AND product_id = ? AND field_key = ?'
          ).run(this.category, pid, propertyKey);
        }
      }
    });
    tx();
    return { violations, compliant };
  }

  /**
   * Re-evaluate constraint expressions for linked products after a component
   * property changes. Flags products that violate any constraint with needs_ai_review=1.
   * Returns { violations: string[], compliant: string[] } (product_ids).
   */
  evaluateConstraintsForLinkedProducts(componentType, componentName, componentMaker, propertyKey, constraints) {
    if (!Array.isArray(constraints) || constraints.length === 0) return { violations: [], compliant: [] };
    const linkRows = this.getProductsForComponent(componentType, componentName, componentMaker || '');
    if (linkRows.length === 0) return { violations: [], compliant: [] };
    const productIds = linkRows.map(r => r.product_id);

    // Get current component properties as a map
    const compRows = this.getComponentValuesWithMaker(componentType, componentName, componentMaker || '');
    const componentProps = {};
    for (const row of compRows) {
      componentProps[row.property_key] = row.value;
    }

    // For each product, get all field state values and evaluate constraints
    const violations = [];
    const compliant = [];
    const tx = this.db.transaction(() => {
      for (const pid of productIds) {
        const fieldRows = this.db
          .prepare('SELECT field_key, value FROM item_field_state WHERE category = ? AND product_id = ?')
          .all(this.category, pid);
        const productValues = {};
        for (const fr of fieldRows) {
          productValues[fr.field_key] = fr.value;
        }

        // Evaluate each constraint expression
        let hasViolation = false;
        for (const expr of constraints) {
          if (!expr || typeof expr !== 'string') continue;
          const result = this._evaluateConstraintExpr(expr, componentProps, productValues);
          if (result !== null && !result) {
            hasViolation = true;
            break;
          }
        }

        if (hasViolation) {
          violations.push(pid);
          this.db.prepare(
            'UPDATE item_field_state SET needs_ai_review = 1, updated_at = datetime(\'now\') WHERE category = ? AND product_id = ? AND field_key = ?'
          ).run(this.category, pid, propertyKey);
        } else {
          compliant.push(pid);
          this.db.prepare(
            'UPDATE item_field_state SET needs_ai_review = 0, updated_at = datetime(\'now\') WHERE category = ? AND product_id = ? AND field_key = ?'
          ).run(this.category, pid, propertyKey);
        }
      }
    });
    tx();
    return { violations, compliant };
  }

  /**
   * Minimal inline constraint expression evaluator (avoids importing from engine/).
   * Returns true=pass, false=fail, null=skip (unresolvable or unknown values).
   */
  _evaluateConstraintExpr(expr, componentProps, productValues) {
    const ops = ['<=', '>=', '!=', '==', '<', '>'];
    const trimmed = (expr || '').trim();
    let parsed = null;
    for (const op of ops) {
      const idx = trimmed.indexOf(op);
      if (idx > 0) {
        const left = trimmed.slice(0, idx).trim();
        const right = trimmed.slice(idx + op.length).trim();
        if (left && right) { parsed = { left, op, right }; break; }
      }
    }
    if (!parsed) return null;

    const resolve = (name) => {
      if (/^-?\d+(\.\d+)?$/.test(name)) return Number(name);
      if (componentProps[name] !== undefined) return componentProps[name];
      const norm = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_');
      if (componentProps[norm] !== undefined) return componentProps[norm];
      if (productValues[name] !== undefined) return productValues[name];
      if (productValues[norm] !== undefined) return productValues[norm];
      return undefined;
    };

    const leftVal = resolve(parsed.left);
    const rightVal = resolve(parsed.right);
    if (leftVal === undefined || rightVal === undefined) return null;
    const skipSet = new Set(['unk', 'unknown', 'n/a', '']);
    if (skipSet.has(String(leftVal).toLowerCase().trim()) || skipSet.has(String(rightVal).toLowerCase().trim())) return null;

    const toNum = (v) => { const n = Number(String(v).trim().replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
    const ln = toNum(leftVal);
    const rn = toNum(rightVal);
    if (ln !== null && rn !== null) {
      switch (parsed.op) {
        case '<=': return ln <= rn; case '>=': return ln >= rn;
        case '<': return ln < rn; case '>': return ln > rn;
        case '==': return ln === rn; case '!=': return ln !== rn;
      }
    }
    const ls = String(leftVal).toLowerCase().trim();
    const rs = String(rightVal).toLowerCase().trim();
    switch (parsed.op) {
      case '<=': return ls <= rs; case '>=': return ls >= rs;
      case '<': return ls < rs; case '>': return ls > rs;
      case '==': return ls === rs; case '!=': return ls !== rs;
    }
    return null;
  }

  // --- Queue / Product / Run / Audit / Stale / Curation / Component Review ---

  upsertQueueProduct(row) { this._queueProductStore.upsertQueueProduct(row); }
  getQueueProduct(pid) { return this._queueProductStore.getQueueProduct(pid); }
  getAllQueueProducts(sf) { return this._queueProductStore.getAllQueueProducts(sf); }
  updateQueueStatus(pid, s, e) { this._queueProductStore.updateQueueStatus(pid, s, e); }
  clearQueueByStatus(s) { return this._queueProductStore.clearQueueByStatus(s); }
  deleteQueueProduct(pid) { return this._queueProductStore.deleteQueueProduct(pid); }
  getQueueStats() { return this._queueProductStore.getQueueStats(); }
  updateQueueProductPatch(pid, p) { return this._queueProductStore.updateQueueProductPatch(pid, p); }
  selectNextQueueProductSql() { return this._queueProductStore.selectNextQueueProductSql(); }

  upsertProductRun(row) { this._queueProductStore.upsertProductRun(row); }
  getLatestProductRun(pid) { return this._queueProductStore.getLatestProductRun(pid); }
  getProductRuns(pid) { return this._queueProductStore.getProductRuns(pid); }
  updateRunStorageLocation(opts) { this._queueProductStore.updateRunStorageLocation(opts); }
  getRunStorageLocation(opts) { return this._queueProductStore.getRunStorageLocation(opts); }
  listRunsByStorageState(state) { return this._queueProductStore.listRunsByStorageState(state); }
  countRunsByStorageState() { return this._queueProductStore.countRunsByStorageState(); }

  upsertProduct(row) { this._queueProductStore.upsertProduct(row); }
  getProduct(pid) { return this._queueProductStore.getProduct(pid); }
  getAllProducts(sf) { return this._queueProductStore.getAllProducts(sf); }
  deleteProduct(pid) { return this._queueProductStore.deleteProduct(pid); }

  insertAuditLog(entry) { this._queueProductStore.insertAuditLog(entry); }

  markProductsStale(pids, df) { this._queueProductStore.markProductsStale(pids, df); }
  markProductsStaleDetailed(pids, dfo) { this._queueProductStore.markProductsStaleDetailed(pids, dfo); }

  upsertCurationSuggestion(row) { this._queueProductStore.upsertCurationSuggestion(row); }
  getCurationSuggestions(st, sf) { return this._queueProductStore.getCurationSuggestions(st, sf); }
  updateCurationSuggestionStatus(st, fk, v, s, e) { this._queueProductStore.updateCurationSuggestionStatus(st, fk, v, s, e); }

  upsertComponentReviewItem(row) { this._queueProductStore.upsertComponentReviewItem(row); }
  getComponentReviewItems(ct, sf) { return this._queueProductStore.getComponentReviewItems(ct, sf); }
  updateComponentReviewQueueMatchedComponent(cat, rid, v) { this._queueProductStore.updateComponentReviewQueueMatchedComponent(cat, rid, v); }
  updateComponentReviewQueueMatchedComponentByName(cat, ct, old, v) { this._queueProductStore.updateComponentReviewQueueMatchedComponentByName(cat, ct, old, v); }

  getProductsByFieldValue(fk, v) { return this._itemStateStore.getProductsByFieldValue(fk, v); }

  // --- LLM Route Matrix ---

  ensureDefaultLlmRouteMatrix() { this._llmRouteSourceStore.ensureDefaultLlmRouteMatrix(); }
  getLlmRouteMatrix(scope) { return this._llmRouteSourceStore.getLlmRouteMatrix(scope); }
  saveLlmRouteMatrix(rows) { return this._llmRouteSourceStore.saveLlmRouteMatrix(rows); }
  resetLlmRouteMatrixToDefaults() { return this._llmRouteSourceStore.resetLlmRouteMatrixToDefaults(); }

  // --- Source Capture ---

  upsertSourceRegistry(opts) { this._llmRouteSourceStore.upsertSourceRegistry(opts); }
  insertSourceArtifact(opts) { this._llmRouteSourceStore.insertSourceArtifact(opts); }
  upsertSourceAssertion(opts) { this._llmRouteSourceStore.upsertSourceAssertion(opts); }
  insertSourceEvidenceRef(opts) { this._llmRouteSourceStore.insertSourceEvidenceRef(opts); }
  getSourcesForItem(id) { return this._llmRouteSourceStore.getSourcesForItem(id); }
  getAssertionsForSource(id) { return this._llmRouteSourceStore.getAssertionsForSource(id); }
  hasSourceEvidenceRef(assertionId) { return this._llmRouteSourceStore.hasSourceEvidenceRef(assertionId); }

  // --- Key Review Methods ---

  upsertKeyReviewState(row) { return this._keyReviewStore.upsertKeyReviewState(row); }
  getKeyReviewState(opts) { return this._keyReviewStore.getKeyReviewState(opts); }
  getKeyReviewStateById(id) { return this._keyReviewStore.getKeyReviewStateById(id); }
  updateKeyReviewSelectedCandidate(opts) { this._keyReviewStore.updateKeyReviewSelectedCandidate(opts); }
  getKeyReviewStatesForItem(id) { return this._keyReviewStore.getKeyReviewStatesForItem(id); }
  getKeyReviewStatesForField(fk, tk) { return this._keyReviewStore.getKeyReviewStatesForField(fk, tk); }
  getKeyReviewStatesForComponent(ci) { return this._keyReviewStore.getKeyReviewStatesForComponent(ci); }
  getKeyReviewStatesForEnum(fk) { return this._keyReviewStore.getKeyReviewStatesForEnum(fk); }
  updateKeyReviewAiConfirm(opts) { this._keyReviewStore.updateKeyReviewAiConfirm(opts); }
  updateKeyReviewUserAccept(opts) { this._keyReviewStore.updateKeyReviewUserAccept(opts); }
  updateKeyReviewOverrideAi(opts) { this._keyReviewStore.updateKeyReviewOverrideAi(opts); }
  insertKeyReviewRun(opts) { return this._keyReviewStore.insertKeyReviewRun(opts); }
  insertKeyReviewRunSource(opts) { this._keyReviewStore.insertKeyReviewRunSource(opts); }
  insertKeyReviewAudit(opts) { this._keyReviewStore.insertKeyReviewAudit(opts); }

  pruneOrphanCandidateReferences() { return this._keyReviewStore.pruneOrphanCandidateReferences(); }
  getKeyReviewStateForComponentValue(cvId) { return this._keyReviewStore.getKeyReviewStateForComponentValue(cvId); }
  updateKeyReviewComponentIdentifier(oldId, newId) { this._keyReviewStore.updateKeyReviewComponentIdentifier(oldId, newId); }

  counts() {
    const tables = [
      'candidates', 'candidate_reviews', 'component_values', 'component_identity',
      'component_aliases', 'enum_lists', 'list_values', 'item_field_state', 'item_component_links',
      'item_list_links', 'product_queue', 'product_runs', 'products', 'audit_log',
      'curation_suggestions', 'component_review_queue', 'llm_route_matrix',
      'source_registry', 'source_artifacts', 'source_assertions', 'source_evidence_refs',
      'key_review_state', 'key_review_runs', 'key_review_run_sources', 'key_review_audit',
      'billing_entries', 'llm_cache', 'learning_profiles', 'category_brain',
      'source_intel_domains', 'source_intel_field_rewards',
      'source_corpus', 'runtime_events'
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
    const ifs = this.db.prepare('SELECT COUNT(*) as c FROM item_field_state WHERE category = ?').get(this.category);
    if (ifs.c > 0) return true;
    try {
      const prod = this.db.prepare('SELECT COUNT(*) as c FROM products WHERE category = ?').get(this.category);
      if (prod.c > 0) return true;
    } catch { /* Phase 2 table may not exist yet */ }
    return false;
  }

  // --- Billing ---

  insertBillingEntry(e) { this._billingStore.insertBillingEntry(e); }
  insertBillingEntriesBatch(es) { this._billingStore.insertBillingEntriesBatch(es); }
  getBillingRollup(m, cat) { return this._billingStore.getBillingRollup(m, cat); }
  getBillingEntriesForMonth(m) { return this._billingStore.getBillingEntriesForMonth(m); }
  getBillingSnapshot(m, pid) { return this._billingStore.getBillingSnapshot(m, pid); }

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
  buildQueryExecutionHistory(pid) { return this._crawlLedgerStore.buildQueryExecutionHistory(pid); }
  purgeExpiredCooldowns() { return this._crawlLedgerStore.purgeExpiredCooldowns(); }

  // --- LLM Cache ---

  getLlmCacheEntry(k) { return this._sourceIntelStore.getLlmCacheEntry(k); }
  setLlmCacheEntry(k, r, ts, ttl) { this._sourceIntelStore.setLlmCacheEntry(k, r, ts, ttl); }
  evictExpiredCache(ms) { return this._sourceIntelStore.evictExpiredCache(ms); }

  // --- Learning Profiles ---

  upsertLearningProfile(p) { this._sourceIntelStore.upsertLearningProfile(p); }
  getLearningProfile(pid) { return this._sourceIntelStore.getLearningProfile(pid); }

  // --- Category Brain ---

  upsertCategoryBrainArtifact(c, n, p) { this._sourceIntelStore.upsertCategoryBrainArtifact(c, n, p); }
  getCategoryBrainArtifacts(c) { return this._sourceIntelStore.getCategoryBrainArtifacts(c); }
  getCategoryBrainArtifact(c, n) { return this._sourceIntelStore.getCategoryBrainArtifact(c, n); }

  // --- Source Corpus ---

  upsertSourceCorpusDoc(d) { this._sourceIntelStore.upsertSourceCorpusDoc(d); }
  upsertSourceCorpusBatch(ds) { this._sourceIntelStore.upsertSourceCorpusBatch(ds); }
  getSourceCorpusByCategory(c) { return this._sourceIntelStore.getSourceCorpusByCategory(c); }
  getSourceCorpusCount(c) { return this._sourceIntelStore.getSourceCorpusCount(c); }

  // --- Runtime Events ---

  insertRuntimeEvent(e) { this._sourceIntelStore.insertRuntimeEvent(e); }
  insertRuntimeEventsBatch(es) { this._sourceIntelStore.insertRuntimeEventsBatch(es); }

  // --- Bridge Events (transformed runtime events for GUI readers) ---

  insertBridgeEvent(e) { this._sourceIntelStore.insertBridgeEvent(e); }
  getBridgeEventsByRunId(runId, limit) { return this._sourceIntelStore.getBridgeEventsByRunId(runId, limit); }
  purgeBridgeEventsForRun(runId) { return this._sourceIntelStore.purgeBridgeEventsForRun(runId); }

  // --- Run Metadata (mid-run state, replaces run.json overwrites) ---

  upsertRun(row) { this._runMetaStore.upsertRun(row); }
  getRunByRunId(runId) { return this._runMetaStore.getRunByRunId(runId); }
  getRunsByCategory(category, limit) { return this._runMetaStore.getRunsByCategory(category, limit); }

  // --- Run Artifacts (needset, search_profile, brand_resolution payloads) ---

  upsertRunArtifact(row) { this._runArtifactStore.upsertRunArtifact(row); }
  getRunArtifact(runId, type) { return this._runArtifactStore.getRunArtifact(runId, type); }
  getRunArtifactsByRunId(runId) { return this._runArtifactStore.getRunArtifactsByRunId(runId); }

  // --- Artifact Store (crawl_sources, source_screenshots, source_pdfs) ---

  insertCrawlSource(row) { return this._artifactStore.insertCrawlSource(row); }
  insertScreenshot(row) { return this._artifactStore.insertScreenshot(row); }
  insertPdf(row) { return this._artifactStore.insertPdf(row); }
  insertVideo(row) { return this._artifactStore.insertVideo(row); }
  getCrawlSourcesByProduct(pid) { return this._artifactStore.getCrawlSourcesByProduct(pid); }
  getScreenshotsByProduct(pid) { return this._artifactStore.getScreenshotsByProduct(pid); }
  getVideosByProduct(pid) { return this._artifactStore.getVideosByProduct(pid); }
  getCrawlSourceByHash(hash, pid) { return this._artifactStore.getCrawlSourceByHash(hash, pid); }

  // --- Source Intelligence ---

  upsertSourceIntelDomain(e) { this._sourceIntelStore.upsertSourceIntelDomain(e); }
  upsertSourceIntelFieldReward(e) { this._sourceIntelStore.upsertSourceIntelFieldReward(e); }
  persistSourceIntelFull(c, d) { this._sourceIntelStore.persistSourceIntelFull(c, d); }
  loadSourceIntelDomains(c) { return this._sourceIntelStore.loadSourceIntelDomains(c); }

  // --- Field History (crash-recovery persistence for search progression) ---

  upsertFieldHistory(opts) { this._fieldHistoryStore.upsertFieldHistory(opts); }
  getFieldHistories(productId) { return this._fieldHistoryStore.getFieldHistories(productId); }
  deleteFieldHistories(productId) { this._fieldHistoryStore.deleteFieldHistories(productId); }

  // --- Field Studio Map (per-category control-plane config) ---

  getFieldStudioMap() { return this._fieldStudioMapStore.getFieldStudioMap(); }
  upsertFieldStudioMap(mapJson, mapHash) { return this._fieldStudioMapStore.upsertFieldStudioMap(mapJson, mapHash); }

}
