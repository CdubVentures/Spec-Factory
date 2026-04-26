import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveStudioOperationsState,
  selectStudioOperationsState,
} from '../studioOperationsSelectors.ts';
import type { Operation } from '../../../operations/state/operationsStore.ts';

function makeOp(overrides: Partial<Operation>): Operation {
  return {
    id: 'op-1',
    type: 'compile',
    category: 'mouse',
    productId: '',
    productLabel: '',
    stages: ['Compile', 'Sync'],
    currentStageIndex: 0,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: null,
    error: null,
    modelInfo: null,
    llmCalls: [],
    ...overrides,
  };
}

describe('deriveStudioOperationsState contract', () => {
  it('no operations: all false/null', () => {
    const result = deriveStudioOperationsState(new Map(), 'mouse');
    assert.strictEqual(result.compileRunning, false);
    assert.strictEqual(result.validateRunning, false);
    assert.strictEqual(result.compileError, null);
    assert.strictEqual(result.validateError, null);
    assert.strictEqual(result.anyStudioOpRunning, false);
  });

  it('compile running for current category', () => {
    const ops = new Map([['op-1', makeOp({ type: 'compile', category: 'mouse', status: 'running' })]]);
    const result = deriveStudioOperationsState(ops, 'mouse');
    assert.strictEqual(result.compileRunning, true);
    assert.strictEqual(result.anyStudioOpRunning, true);
  });

  it('compile running for different category: does not affect', () => {
    const ops = new Map([['op-1', makeOp({ type: 'compile', category: 'keyboard', status: 'running' })]]);
    const result = deriveStudioOperationsState(ops, 'mouse');
    assert.strictEqual(result.compileRunning, false);
    assert.strictEqual(result.anyStudioOpRunning, false);
  });

  it('validate running for current category', () => {
    const ops = new Map([['op-1', makeOp({ type: 'validate', category: 'mouse', status: 'running' })]]);
    const result = deriveStudioOperationsState(ops, 'mouse');
    assert.strictEqual(result.validateRunning, true);
    assert.strictEqual(result.anyStudioOpRunning, true);
  });

  it('pipeline running does not affect studio flags', () => {
    const ops = new Map([['op-1', makeOp({ type: 'pipeline', category: 'mouse', status: 'running' })]]);
    const result = deriveStudioOperationsState(ops, 'mouse');
    assert.strictEqual(result.compileRunning, false);
    assert.strictEqual(result.validateRunning, false);
    assert.strictEqual(result.anyStudioOpRunning, false);
  });

  it('compile error surfaces error message', () => {
    const ops = new Map([['op-1', makeOp({ type: 'compile', category: 'mouse', status: 'error', error: 'boom' })]]);
    const result = deriveStudioOperationsState(ops, 'mouse');
    assert.strictEqual(result.compileRunning, false);
    assert.strictEqual(result.compileError, 'boom');
  });

  it('validate error surfaces error message', () => {
    const ops = new Map([['op-1', makeOp({ type: 'validate', category: 'mouse', status: 'error', error: 'bad rules' })]]);
    const result = deriveStudioOperationsState(ops, 'mouse');
    assert.strictEqual(result.validateRunning, false);
    assert.strictEqual(result.validateError, 'bad rules');
  });

  it('multiple operations: correct derivation', () => {
    const ops = new Map([
      ['op-1', makeOp({ id: 'op-1', type: 'compile', category: 'mouse', status: 'running' })],
      ['op-2', makeOp({ id: 'op-2', type: 'validate', category: 'mouse', status: 'done' })],
      ['op-3', makeOp({ id: 'op-3', type: 'pipeline', category: 'mouse', status: 'running' })],
    ]);
    const result = deriveStudioOperationsState(ops, 'mouse');
    assert.strictEqual(result.compileRunning, true);
    assert.strictEqual(result.validateRunning, false);
    assert.strictEqual(result.anyStudioOpRunning, true);
  });

  it('store selector derives the same state without exposing the operations map', () => {
    const operations = new Map([
      ['op-1', makeOp({ id: 'op-1', type: 'compile', category: 'mouse', status: 'running' })],
      ['op-2', makeOp({ id: 'op-2', type: 'validate', category: 'keyboard', status: 'running' })],
    ]);
    const result = selectStudioOperationsState({ operations }, 'mouse');
    assert.deepStrictEqual(result, {
      compileRunning: true,
      validateRunning: false,
      compileError: null,
      validateError: null,
      anyStudioOpRunning: true,
    });
  });
});
