import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SpecDb } from '../../../../db/specDb.js';
import { purgeInconsistentCandidate } from '../purgeInconsistentCandidate.js';
import { keyFinderStore } from '../../../key/keyStore.js';
import { releaseDateFinderStore } from '../../../release-date/releaseDateStore.js';

describe('purgeInconsistentCandidate — run-scrub dispatch', () => {
  let db;
  let testDir;
  let productRoot;

  beforeEach(() => {
    try { db?.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'purge-scrub-'));
    productRoot = path.join(testDir, 'products');
    fs.mkdirSync(productRoot, { recursive: true });
    db = new SpecDb({ dbPath: path.join(testDir, 'spec.sqlite'), category: 'mouse' });
  });

  after(() => {
    try { db?.close(); } catch { /* */ }
    try { fs.rmSync(testDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('keyFinder primary: deletes the keyFinder run + its discovery_log', () => {
    const productId = 'p-kf-primary';
    const runNumber = 42;
    const sourceId = `key_finder-${productId}-${runNumber}`;

    db.insertFieldCandidate({
      productId, fieldKey: 'sensor_link',
      sourceId, sourceType: 'key_finder',
      value: 'PAW3395', unit: null, confidence: 50,
      model: '', validationJson: {}, metadataJson: {},
    });
    const row = db.getFieldCandidateBySourceId(productId, 'sensor_link', sourceId);

    keyFinderStore.write({
      productId, productRoot,
      data: {
        runs: [{
          run_number: runNumber,
          response: {
            primary_field_key: 'sensor_link',
            results: { sensor_link: { value: 'PAW3395', confidence: 50 } },
            discovery_log: {
              urls_checked: ['https://ex.com/a', 'https://ex.com/b'],
              queries_run: ['corsair m75 sensor'],
            },
          },
          selected: { keys: { sensor_link: { value: 'PAW3395' } } },
          ran_at: new Date().toISOString(),
        }],
        run_count: 1,
        selected: { keys: { sensor_link: { value: 'PAW3395' } } },
      },
    });

    const result = purgeInconsistentCandidate({
      specDb: db, productId, fieldKey: 'sensor_link',
      candidateId: row.id, sourceId, sourceType: 'key_finder', productRoot,
    });

    assert.equal(result.status, 'purged');
    assert.equal(result.runScrub?.scrubbed, true);
    assert.equal(result.runScrub?.deletedRun, runNumber);

    const doc = keyFinderStore.read({ productId, productRoot });
    assert.equal((doc?.runs || []).length, 0, 'primary keyFinder run must be deleted so discovery_log is gone');
  });

  it('keyFinder passenger: keeps the run intact (candidate-only purge)', () => {
    const productId = 'p-kf-passenger';
    const runNumber = 7;
    const sourceId = `key_finder-${productId}-${runNumber}`;

    db.insertFieldCandidate({
      productId, fieldKey: 'sensor_link',
      sourceId, sourceType: 'key_finder',
      value: 'HERO', unit: null, confidence: 50,
      model: '', validationJson: {}, metadataJson: {},
    });
    const row = db.getFieldCandidateBySourceId(productId, 'sensor_link', sourceId);

    keyFinderStore.write({
      productId, productRoot,
      data: {
        runs: [{
          run_number: runNumber,
          response: {
            primary_field_key: 'max_cpi',
            results: {
              max_cpi: { value: 26000, confidence: 92 },
              sensor_link: { value: 'HERO', confidence: 50 },
            },
            discovery_log: { urls_checked: ['https://ex.com/a'], queries_run: ['max cpi'] },
          },
          selected: { keys: { max_cpi: { value: 26000 } } },
          ran_at: new Date().toISOString(),
        }],
        run_count: 1,
        selected: { keys: { max_cpi: { value: 26000 } } },
      },
    });

    const result = purgeInconsistentCandidate({
      specDb: db, productId, fieldKey: 'sensor_link',
      candidateId: row.id, sourceId, sourceType: 'key_finder', productRoot,
    });

    assert.equal(result.status, 'purged');
    assert.equal(result.runScrub?.scrubbed, false);
    assert.equal(result.runScrub?.wasPassenger, true);

    const doc = keyFinderStore.read({ productId, productRoot });
    assert.equal((doc?.runs || []).length, 1, 'passenger run must survive — it belongs to max_cpi');
    assert.equal(doc.runs[0].run_number, runNumber);
    assert.ok(doc.runs[0].response.discovery_log, 'discovery_log preserved for the primary field');
  });

  it('release_date_finder: deletes the variant run + discovery_log', () => {
    const productId = 'p-rdf';
    const runNumber = 9;
    const sourceId = `release_date_finder-${productId}-${runNumber}`;

    db.insertFieldCandidate({
      productId, fieldKey: 'release_date',
      sourceId, sourceType: 'release_date_finder',
      value: '2024-06-01', unit: null, confidence: 55, variantId: 'v_black',
      model: '', validationJson: {}, metadataJson: {},
    });
    const row = db.getFieldCandidateBySourceIdAndVariant(productId, 'release_date', sourceId, 'v_black');

    releaseDateFinderStore.write({
      productId, productRoot,
      data: {
        runs: [{
          run_number: runNumber,
          response: {
            variant_id: 'v_black',
            discovery_log: { urls_checked: ['https://rdf.example/a'], queries_run: ['m75 release'] },
          },
          selected: {
            candidates: [{ variant_id: 'v_black', value: '2024-06-01', confidence: 55, run_number: runNumber }],
          },
          ran_at: new Date().toISOString(),
        }],
        run_count: 1,
        selected: {
          candidates: [{ variant_id: 'v_black', value: '2024-06-01', confidence: 55, run_number: runNumber }],
        },
      },
    });

    const result = purgeInconsistentCandidate({
      specDb: db, productId, fieldKey: 'release_date',
      candidateId: row.id, sourceId, sourceType: 'release_date_finder', productRoot,
    });

    assert.equal(result.status, 'purged');
    assert.equal(result.runScrub?.cleaned, true);
    assert.deepEqual(result.runScrub?.deletedRuns, [runNumber]);

    const doc = releaseDateFinderStore.read({ productId, productRoot });
    assert.equal((doc?.runs || []).length, 0, 'RDF run must be deleted so discovery_log is gone');
    assert.equal((doc?.selected?.candidates || []).length, 0, 'selected.candidates re-derived without the purged run');
  });

  it('review/manual source_id (timestamp tail, not a run): no finder scrub', () => {
    const productId = 'p-manual';
    const sourceId = `review-${productId}-1700000000000`;

    db.insertFieldCandidate({
      productId, fieldKey: 'sensor_link',
      sourceId, sourceType: 'review',
      value: 'HUH', unit: null, confidence: 50,
      model: '', validationJson: {}, metadataJson: {},
    });
    const row = db.getFieldCandidateBySourceId(productId, 'sensor_link', sourceId);

    const result = purgeInconsistentCandidate({
      specDb: db, productId, fieldKey: 'sensor_link',
      candidateId: row.id, sourceId, sourceType: 'review', productRoot,
    });

    assert.equal(result.status, 'purged');
    assert.equal(result.runScrub, undefined, 'non-finder source has nothing to scrub');
  });

  it('layer-2 cascade: demotes variant_fields published value when last qualifying member is purged', () => {
    const productId = 'p-rdf-demote';
    const runNumber = 11;
    const sourceId = `release_date_finder-${productId}-${runNumber}`;
    const productDir = path.join(productRoot, productId);
    fs.mkdirSync(productDir, { recursive: true });
    const productPath = path.join(productDir, 'product.json');
    const publishedAt = new Date().toISOString();
    fs.writeFileSync(productPath, JSON.stringify({
      schema_version: 2, checkpoint_type: 'product',
      product_id: productId, category: 'mouse',
      identity: { brand: 'Test', model: 'Test' },
      sources: [], fields: {}, candidates: {},
      variant_fields: {
        v_black: {
          release_date: {
            value: '2024-06-01',
            confidence: 55,
            source: 'pipeline',
            resolved_at: publishedAt,
            sources: [{ source: 'release_date_finder', source_id: sourceId, confidence: 55 }],
            linked_candidates: [],
          },
        },
      },
      created_at: publishedAt,
      updated_at: publishedAt,
    }, null, 2));

    db.insertFieldCandidate({
      productId, fieldKey: 'release_date',
      sourceId, sourceType: 'release_date_finder',
      value: '2024-06-01', unit: null, confidence: 55, variantId: 'v_black',
      model: '', validationJson: {}, metadataJson: {},
      status: 'resolved',
    });
    const row = db.getFieldCandidateBySourceIdAndVariant(productId, 'release_date', sourceId, 'v_black');
    db.db.prepare(`UPDATE field_candidates SET status = 'resolved' WHERE id = ?`).run(row.id);

    releaseDateFinderStore.write({
      productId, productRoot,
      data: {
        runs: [{
          run_number: runNumber,
          response: { variant_id: 'v_black', discovery_log: { urls_checked: [], queries_run: [] } },
          selected: { candidates: [{ variant_id: 'v_black', value: '2024-06-01', confidence: 55, run_number: runNumber }] },
          ran_at: publishedAt,
        }],
        run_count: 1,
        selected: { candidates: [{ variant_id: 'v_black', value: '2024-06-01', confidence: 55, run_number: runNumber }] },
      },
    });

    const result = purgeInconsistentCandidate({
      specDb: db, productId, fieldKey: 'release_date',
      candidateId: row.id, sourceId, sourceType: 'release_date_finder',
      productRoot,
      config: { publishConfidenceThreshold: 0.7 },
    });

    assert.equal(result.status, 'purged');
    assert.equal(result.republish?.status, 'unpublished', 'layer-2 cascade must demote');

    const pj = JSON.parse(fs.readFileSync(productPath, 'utf8'));
    assert.equal(pj.variant_fields?.v_black?.release_date, undefined, 'variant_fields[v_black][release_date] must be gone');
  });

  it('unknown sourceType: candidate-only purge, no run scrub', () => {
    const productId = 'p-unknown';
    const sourceId = `weird_finder-${productId}-3`;

    db.insertFieldCandidate({
      productId, fieldKey: 'sensor_link',
      sourceId, sourceType: 'weird_finder',
      value: 'Q', unit: null, confidence: 50,
      model: '', validationJson: {}, metadataJson: {},
    });
    const row = db.getFieldCandidateBySourceId(productId, 'sensor_link', sourceId);

    const result = purgeInconsistentCandidate({
      specDb: db, productId, fieldKey: 'sensor_link',
      candidateId: row.id, sourceId, sourceType: 'weird_finder', productRoot,
    });

    assert.equal(result.status, 'purged');
    assert.equal(result.runScrub, undefined);
  });
});
