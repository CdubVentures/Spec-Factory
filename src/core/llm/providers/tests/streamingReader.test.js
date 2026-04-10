// WHY: readStreamingResponse must parse SSE chunks incrementally and fire
// onDelta callbacks as tokens arrive — the foundation for streaming LLM
// output to the Active Operations UI in real-time.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readStreamingResponse } from '../openaiCompatible.js';

// ── Helpers ──

function makeSSELine(delta, extra = {}) {
  const evt = { choices: [{ delta }], ...extra };
  return `data: ${JSON.stringify(evt)}\n`;
}

function makeResponsesAPILine(text) {
  return `data: ${JSON.stringify({ type: 'response.output_text.delta', delta: text })}\n`;
}

function fakeResponse(chunks) {
  const encoder = new TextEncoder();
  let idx = 0;
  const stream = new ReadableStream({
    pull(controller) {
      if (idx < chunks.length) {
        controller.enqueue(encoder.encode(chunks[idx]));
        idx++;
      } else {
        controller.close();
      }
    }
  });
  return { body: stream };
}

// ── Tests ──

describe('readStreamingResponse', () => {
  it('fires onDelta with content from delta.content', async () => {
    const deltas = [];
    const sseText = makeSSELine({ content: 'Hello' }) + makeSSELine({ content: ' world' }) + 'data: [DONE]\n';
    const response = fakeResponse([sseText]);

    const text = await readStreamingResponse(response, (d) => deltas.push(d));

    assert.equal(deltas.length, 2);
    assert.equal(deltas[0].content, 'Hello');
    assert.equal(deltas[1].content, ' world');
    assert.ok(text.includes('Hello'));
  });

  it('fires onDelta with reasoning from delta.reasoning_content', async () => {
    const deltas = [];
    const sseText = makeSSELine({ reasoning_content: 'thinking...' }) + makeSSELine({ content: 'answer' });
    const response = fakeResponse([sseText]);

    await readStreamingResponse(response, (d) => deltas.push(d));

    assert.equal(deltas.length, 2);
    assert.equal(deltas[0].reasoning, 'thinking...');
    assert.equal(deltas[0].content, '');
    assert.equal(deltas[1].content, 'answer');
  });

  it('handles LLM Lab Responses API format (response.output_text.delta)', async () => {
    const deltas = [];
    const sseText = makeResponsesAPILine('lab token');
    const response = fakeResponse([sseText]);

    await readStreamingResponse(response, (d) => deltas.push(d));

    assert.equal(deltas.length, 1);
    assert.equal(deltas[0].content, 'lab token');
  });

  it('handles partial SSE lines across chunk boundaries', async () => {
    const deltas = [];
    const full = makeSSELine({ content: 'split' });
    // Split the SSE line in the middle
    const mid = Math.floor(full.length / 2);
    const chunk1 = full.slice(0, mid);
    const chunk2 = full.slice(mid);
    const response = fakeResponse([chunk1, chunk2]);

    await readStreamingResponse(response, (d) => deltas.push(d));

    assert.equal(deltas.length, 1);
    assert.equal(deltas[0].content, 'split');
  });

  it('skips [DONE] marker and malformed lines without crashing', async () => {
    const deltas = [];
    const sseText = 'data: [DONE]\ndata: not-json\ndata: {"bad": true}\n' + makeSSELine({ content: 'ok' });
    const response = fakeResponse([sseText]);

    await readStreamingResponse(response, (d) => deltas.push(d));

    assert.equal(deltas.length, 1);
    assert.equal(deltas[0].content, 'ok');
  });

  it('returns full accumulated text for backward-compatible assembly', async () => {
    const sseText = makeSSELine({ content: 'a' }) + makeSSELine({ content: 'b' });
    const response = fakeResponse([sseText]);

    const text = await readStreamingResponse(response, () => {});

    assert.ok(text.includes('"content":"a"'));
    assert.ok(text.includes('"content":"b"'));
  });

  it('handles plain JSON response (no SSE lines) without firing callback', async () => {
    const deltas = [];
    const json = JSON.stringify({ choices: [{ message: { content: 'plain' } }] });
    const response = fakeResponse([json]);

    const text = await readStreamingResponse(response, (d) => deltas.push(d));

    assert.equal(deltas.length, 0, 'no SSE lines means no deltas');
    assert.equal(text, json);
  });
});
