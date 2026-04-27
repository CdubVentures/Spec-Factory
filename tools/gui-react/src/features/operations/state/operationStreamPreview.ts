import type { LlmCallStreamText } from './operationsStore.ts';

interface OperationPreviewStreamState {
  readonly streamTexts: ReadonlyMap<string, string>;
  readonly callStreamTexts: ReadonlyMap<string, ReadonlyMap<string, LlmCallStreamText>>;
}

export function selectOperationPreviewStreamText({
  streamText,
  callStreams,
}: {
  readonly streamText: string;
  readonly callStreams?: ReadonlyMap<string, LlmCallStreamText>;
}): string {
  const trimmedStream = streamText.trim();
  if (trimmedStream) return streamText;
  if (!callStreams || callStreams.size === 0) return '';

  return [...callStreams.values()]
    .map((stream) => {
      const text = stream.contentText || stream.reasoningText || stream.text || '';
      if (!text.trim()) return '';
      const label = stream.label || stream.lane || stream.callId;
      return label ? `[${label}]\n${text}` : text;
    })
    .filter(Boolean)
    .join('\n\n');
}

export function createOperationPreviewStreamSelector(operationId: string) {
  let lastStreamText: string | undefined;
  let lastCallStreams: ReadonlyMap<string, LlmCallStreamText> | undefined;
  let lastPreview = '';

  return (state: OperationPreviewStreamState): string => {
    const streamText = state.streamTexts.get(operationId) ?? '';
    const callStreams = state.callStreamTexts.get(operationId);
    if (streamText === lastStreamText && callStreams === lastCallStreams) {
      return lastPreview;
    }
    lastStreamText = streamText;
    lastCallStreams = callStreams;
    lastPreview = selectOperationPreviewStreamText({ streamText, callStreams });
    return lastPreview;
  };
}
