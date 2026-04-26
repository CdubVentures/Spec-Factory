import type { LlmCallStreamText } from './operationsStore.ts';

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
