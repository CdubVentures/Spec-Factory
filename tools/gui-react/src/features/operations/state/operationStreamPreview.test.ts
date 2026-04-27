import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createOperationPreviewStreamSelector,
  selectOperationPreviewStreamText,
} from './operationStreamPreview.ts';
import type { LlmCallStreamText } from './operationsStore.ts';

describe('selectOperationPreviewStreamText', () => {
  it('uses operation-level stream text when present', () => {
    const callStreams = new Map<string, LlmCallStreamText>([
      ['call-1', { callId: 'call-1', text: 'call text', contentText: 'call content' }],
    ]);

    assert.equal(
      selectOperationPreviewStreamText({ streamText: 'legacy text', callStreams }),
      'legacy text',
    );
  });

  it('falls back to call-scoped content so parallel calls render in the operation card', () => {
    const callStreams = new Map<string, LlmCallStreamText>([
      ['view-top-1', { callId: 'view-top-1', label: 'View Top', text: 'raw', contentText: 'visible content' }],
      ['hero-1', { callId: 'hero-1', lane: 'hero', text: 'hero raw', reasoningText: 'hero thinking' }],
    ]);

    assert.equal(
      selectOperationPreviewStreamText({ streamText: '', callStreams }),
      '[View Top]\nvisible content\n\n[hero]\nhero thinking',
    );
  });

  it('returns empty text when no stream source has content', () => {
    const callStreams = new Map<string, LlmCallStreamText>([
      ['call-1', { callId: 'call-1', text: '' }],
    ]);

    assert.equal(
      selectOperationPreviewStreamText({ streamText: '', callStreams }),
      '',
    );
  });
});

describe('createOperationPreviewStreamSelector', () => {
  it('selects preview text for one operation id from store-shaped state', () => {
    const selector = createOperationPreviewStreamSelector('op-1');
    const state = {
      streamTexts: new Map<string, string>([
        ['op-1', 'legacy stream'],
        ['op-2', 'other stream'],
      ]),
      callStreamTexts: new Map<string, ReadonlyMap<string, LlmCallStreamText>>(),
    };

    assert.equal(selector(state), 'legacy stream');
  });

  it('falls back to the selected operation call-scoped streams', () => {
    const selector = createOperationPreviewStreamSelector('op-1');
    const callStreams = new Map<string, LlmCallStreamText>([
      ['call-1', { callId: 'call-1', label: 'Discovery', text: 'raw', contentText: 'visible' }],
    ]);
    const state = {
      streamTexts: new Map<string, string>(),
      callStreamTexts: new Map<string, ReadonlyMap<string, LlmCallStreamText>>([
        ['op-1', callStreams],
        ['op-2', new Map([['call-2', { callId: 'call-2', text: 'other' }]])],
      ]),
    };

    assert.equal(selector(state), '[Discovery]\nvisible');
  });

  it('returns the cached preview when unrelated operation streams change', () => {
    const selector = createOperationPreviewStreamSelector('op-1');
    const callStreams = new Map<string, LlmCallStreamText>([
      ['call-1', { callId: 'call-1', label: 'Discovery', text: 'raw', contentText: 'visible' }],
    ]);
    const first = selector({
      streamTexts: new Map<string, string>(),
      callStreamTexts: new Map<string, ReadonlyMap<string, LlmCallStreamText>>([
        ['op-1', callStreams],
      ]),
    });
    const second = selector({
      streamTexts: new Map<string, string>([['op-2', 'new unrelated text']]),
      callStreamTexts: new Map<string, ReadonlyMap<string, LlmCallStreamText>>([
        ['op-1', callStreams],
      ]),
    });

    assert.equal(second, first);
  });
});
