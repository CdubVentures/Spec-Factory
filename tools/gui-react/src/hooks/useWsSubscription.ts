import { useEffect, useMemo } from 'react';
import { wsManager } from '../api/ws.ts';

type WsChannel = 'events' | 'process' | 'process-status' | 'data-change' | 'test-import-progress' | 'test-run-progress' | 'test-repair-progress' | 'indexlab-event' | 'operations' | 'llm-stream' | 'heartbeat';
type WsMessageHandler = (channel: WsChannel, data: unknown) => void;

interface UseWsSubscriptionOptions {
  channels: WsChannel[];
  category?: string;
  productId?: string;
  onMessage: WsMessageHandler;
}

export function useWsSubscription({
  channels,
  category,
  productId,
  onMessage,
}: UseWsSubscriptionOptions) {
  const channelsToken = useMemo(() => [...channels].sort().join('|'), [channels]);

  useEffect(() => {
    wsManager.connect();
    wsManager.subscribe(channels, category, productId);
    const unsub = wsManager.onMessage(onMessage);
    return () => {
      unsub();
    };
  }, [channelsToken, category, productId, onMessage]);
}

