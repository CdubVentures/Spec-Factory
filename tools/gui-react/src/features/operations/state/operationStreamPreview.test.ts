import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
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
