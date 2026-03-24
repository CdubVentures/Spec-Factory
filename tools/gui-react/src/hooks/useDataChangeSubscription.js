import { useEffect, useMemo } from 'react';
import { wsManager } from '../api/ws.ts';
import {
  collectDataChangeDomains,
  resolveDataChangeEventName,
  dataChangeAffectsCategory,
  dataChangeAffectsDomains,
  shouldHandleDataChangeMessage,
} from '../features/data-change/index.js';

export {
  resolveDataChangeEventName,
  dataChangeAffectsCategory,
  dataChangeAffectsDomains,
  shouldHandleDataChangeMessage,
};

export function useDataChangeSubscription({
  category,
  domains = [],
  enabled = true,
  onDataChange,
}) {
  const normalizedDomains = useMemo(
    () => collectDataChangeDomains(domains),
    [domains],
  );
  const domainsToken = normalizedDomains.join('|');

  useEffect(() => {
    if (!enabled || typeof onDataChange !== 'function') return undefined;
    const unsub = wsManager.onMessage((channel, data) => {
      if (channel !== 'data-change') return;
      if (!shouldHandleDataChangeMessage({
        message: data,
        category,
        domains: normalizedDomains,
      })) {
        return;
      }
      onDataChange(data);
    });
    return () => {
      unsub?.();
    };
  }, [enabled, category, domainsToken, onDataChange]);
}
