import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createInfraOperationsRoutes } from '../infra/operationsRoutes.js';
import {
  _resetForTest,
  appendLlmCall,
  registerOperation,
} from '../../../../core/operations/operationsRegistry.js';

function createHarness() {
  const replies = [];
  const jsonRes = (_res, code, body) => {
    replies.push({ code, body });
    return true;
  };
  const handler = createInfraOperationsRoutes({ jsonRes });
  return { handler, replies };
}

function latestReply(replies) {
  assert.ok(replies.length > 0, 'expected route to write a JSON response');
  return replies[replies.length - 1];
}

function createOperationWithCall() {
  const { id } = registerOperation({
    type: 'pif',
    category: 'mouse',
    productId: 'mouse-1',
    productLabel: 'Mouse One',
    stages: ['Start', 'LLM', 'Done'],
  });
  appendLlmCall({
    id,
    call: {
      callId: 'call-1',
      prompt: { system: 'full system prompt', user: 'full user prompt' },
      response: null,
      model: 'gpt-5.4',
      lane: 'hero',
      label: 'Hero',
    },
  });
  return id;
}

describe('operations routes', () => {
  beforeEach(() => _resetForTest());

  it('GET /operations returns lightweight summaries without full llmCalls', () => {
    createOperationWithCall();
    const { handler, replies } = createHarness();

    const handled = handler(['operations'], {}, 'GET', {}, {});

    assert.equal(handled, true);
    const { code, body } = latestReply(replies);
    assert.equal(code, 200);
    assert.equal(body.length, 1);
    assert.equal(body[0].llmCalls, undefined);
    assert.equal(body[0].llmCallCount, 1);
    assert.equal(body[0].activeLlmCallCount, 1);
    assert.deepEqual(body[0].activeLlmCalls, [{
      callIndex: 0,
      callId: 'call-1',
      timestamp: body[0].activeLlmCalls[0].timestamp,
      model: 'gpt-5.4',
      lane: 'hero',
      label: 'Hero',
      responseStatus: 'pending',
    }]);
    assert.equal(body[0].activeLlmCalls[0].prompt, undefined);
    assert.equal(body[0].activeLlmCalls[0].response, undefined);
  });

  it('GET /operations/:id returns full operation detail with prompts and responses', () => {
    const id = createOperationWithCall();
    const { handler, replies } = createHarness();

    const handled = handler(['operations', id], {}, 'GET', {}, {});

    assert.equal(handled, true);
    const { code, body } = latestReply(replies);
    assert.equal(code, 200);
    assert.equal(body.id, id);
    assert.equal(body.llmCalls.length, 1);
    assert.deepEqual(body.llmCalls[0].prompt, {
      system: 'full system prompt',
      user: 'full user prompt',
    });
    assert.equal(body.llmCalls[0].response, null);
  });

  it('GET /operations/:id returns 404 for unknown operation id', () => {
    const { handler, replies } = createHarness();

    const handled = handler(['operations', 'missing-id'], {}, 'GET', {}, {});

    assert.equal(handled, true);
    const { code, body } = latestReply(replies);
    assert.equal(code, 404);
    assert.deepEqual(body, { error: 'operation_not_found' });
  });
});
