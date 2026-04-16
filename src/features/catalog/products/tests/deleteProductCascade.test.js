import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deleteProductCascade } from '../deleteProductCascade.js';

// ── Mock factories ──────────────────────────────────────────────────

function createMockSpecDb({ finderStores = {} } = {}) {
  const calls = [];

  const mockFinderStore = (id) => ({
    removeAllRuns(pid) { calls.push({ method: `${id}.removeAllRuns`, pid }); },
    remove(pid) { calls.push({ method: `${id}.remove`, pid }); },
  });

  return {
    calls,
    db: { prepare: () => ({ run: () => ({}) }) },
    category: 'mouse',
    variants: {
      removeByProduct(pid) { calls.push({ method: 'variants.removeByProduct', pid }); },
    },
    deleteFieldCandidatesByProduct(pid) { calls.push({ method: 'deleteFieldCandidatesByProduct', pid }); },
    getFinderStore(id) {
      if (finderStores[id] === null) return null;
      return finderStores[id] || mockFinderStore(id);
    },
  };
}

const PID = 'test-product-001';

// ── Tests ───────────────────────────────────────────────────────────

describe('deleteProductCascade', () => {

  it('returns error when specDb is null', () => {
    const result = deleteProductCascade({ specDb: null, productId: PID, category: 'mouse' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'specDb_required');
  });

  it('returns error when productId is empty', () => {
    const specDb = createMockSpecDb();
    const result = deleteProductCascade({ specDb, productId: '', category: 'mouse' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'product_id_required');
  });

  it('cascades to all finder stores (runs then summary)', () => {
    const specDb = createMockSpecDb();
    const result = deleteProductCascade({ specDb, productId: PID, category: 'mouse' });

    assert.equal(result.ok, true);
    assert.equal(result.product_id, PID);

    // Both CEF and PIF finder stores should be cleaned
    const cefRunsCall = specDb.calls.find(c => c.method === 'colorEditionFinder.removeAllRuns');
    const cefRemoveCall = specDb.calls.find(c => c.method === 'colorEditionFinder.remove');
    const pifRunsCall = specDb.calls.find(c => c.method === 'productImageFinder.removeAllRuns');
    const pifRemoveCall = specDb.calls.find(c => c.method === 'productImageFinder.remove');

    assert.ok(cefRunsCall, 'CEF runs deleted');
    assert.ok(cefRemoveCall, 'CEF summary deleted');
    assert.ok(pifRunsCall, 'PIF runs deleted');
    assert.ok(pifRemoveCall, 'PIF summary deleted');

    // Runs deleted BEFORE summary (check ordering)
    const cefRunsIdx = specDb.calls.indexOf(cefRunsCall);
    const cefRemoveIdx = specDb.calls.indexOf(cefRemoveCall);
    assert.ok(cefRunsIdx < cefRemoveIdx, 'runs deleted before summary for CEF');
  });

  it('cascades to variants.removeByProduct', () => {
    const specDb = createMockSpecDb();
    deleteProductCascade({ specDb, productId: PID, category: 'mouse' });

    const call = specDb.calls.find(c => c.method === 'variants.removeByProduct');
    assert.ok(call, 'variants.removeByProduct called');
    assert.equal(call.pid, PID);
  });

  it('cascades to deleteFieldCandidatesByProduct', () => {
    const specDb = createMockSpecDb();
    deleteProductCascade({ specDb, productId: PID, category: 'mouse' });

    const call = specDb.calls.find(c => c.method === 'deleteFieldCandidatesByProduct');
    assert.ok(call, 'deleteFieldCandidatesByProduct called');
    assert.equal(call.pid, PID);
  });

  it('survives when a finder store returns null', () => {
    const specDb = createMockSpecDb({
      finderStores: { colorEditionFinder: null },
    });
    const result = deleteProductCascade({ specDb, productId: PID, category: 'mouse' });

    assert.equal(result.ok, true);
    // PIF should still be cleaned even if CEF store is null
    const pifCall = specDb.calls.find(c => c.method === 'productImageFinder.removeAllRuns');
    assert.ok(pifCall, 'PIF still cleaned when CEF store is null');
  });

  it('survives when variants store is undefined', () => {
    const specDb = createMockSpecDb();
    specDb.variants = undefined;
    const result = deleteProductCascade({ specDb, productId: PID, category: 'mouse' });

    assert.equal(result.ok, true);
    // Field candidates should still be cleaned
    const call = specDb.calls.find(c => c.method === 'deleteFieldCandidatesByProduct');
    assert.ok(call, 'candidates still cleaned when variants is undefined');
  });

  it('survives when deleteFieldCandidatesByProduct throws', () => {
    const specDb = createMockSpecDb();
    specDb.deleteFieldCandidatesByProduct = () => { throw new Error('boom'); };
    const result = deleteProductCascade({ specDb, productId: PID, category: 'mouse' });

    assert.equal(result.ok, true);
    // Should still report cascade attempted
    assert.equal(result.cascade.field_candidates_deleted, false);
  });

  it('deletes product folder when productRoot provided', () => {
    const specDb = createMockSpecDb();
    // Use a non-existent path — rmSync with force:true won't throw
    const result = deleteProductCascade({
      specDb, productId: PID, category: 'mouse',
      productRoot: '/tmp/nonexistent-spec-factory-test',
    });
    assert.equal(result.ok, true);
    // product_dir_deleted is false because path doesn't exist, but no error
    assert.equal(result.cascade.product_dir_deleted, false);
  });

  it('calls deleteProductHistory when createDeletionStore provided', () => {
    const specDb = createMockSpecDb();
    let historyCalled = false;
    const mockCreateDs = () => ({
      deleteProductHistory({ productId }) {
        historyCalled = true;
        return { ok: true, product_id: productId };
      },
    });

    const result = deleteProductCascade({
      specDb, productId: PID, category: 'mouse',
      createDeletionStore: mockCreateDs,
    });

    assert.equal(result.ok, true);
    assert.ok(historyCalled, 'deleteProductHistory called');
    assert.ok(result.cascade.pipeline_result, 'pipeline result returned');
  });

  it('skips pipeline step when createDeletionStore not provided', () => {
    const specDb = createMockSpecDb();
    const result = deleteProductCascade({ specDb, productId: PID, category: 'mouse' });

    assert.equal(result.ok, true);
    assert.equal(result.cascade.pipeline_result, null, 'pipeline skipped when no factory');
  });

  it('cascade order: finders → variants → candidates', () => {
    const specDb = createMockSpecDb();
    deleteProductCascade({ specDb, productId: PID, category: 'mouse' });

    const methods = specDb.calls.map(c => c.method);
    const finderIdx = methods.findIndex(m => m.includes('.removeAllRuns'));
    const variantIdx = methods.findIndex(m => m === 'variants.removeByProduct');
    const candidateIdx = methods.findIndex(m => m === 'deleteFieldCandidatesByProduct');

    assert.ok(finderIdx < variantIdx, 'finders cleaned before variants');
    assert.ok(variantIdx < candidateIdx, 'variants cleaned before candidates');
  });
});
