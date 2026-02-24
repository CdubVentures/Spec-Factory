import { useEffect, useMemo } from 'react';
import { wsManager } from '../api/ws';
import {
  resolveDataChangeEventName,
  dataChangeAffectsCategory,
  dataChangeAffectsDomains,
  shouldHandleDataChangeMessage,
} from './dataChangeSubscriptionHelpers.js';

function normalizedToken(value) {
  return String(value || '').trim();
}

function normalizedLowerToken(value) {
  return normalizedToken(value).toLowerCase();
}

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
    () => (Array.isArray(domains) ? domains.map((domain) => normalizedLowerToken(domain)).filter(Boolean) : []),
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
