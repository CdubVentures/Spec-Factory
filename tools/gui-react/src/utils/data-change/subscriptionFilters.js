import { collectDataChangeCategories } from './categoryScope.js';
import {
  normalizeDataChangeToken,
  collectDataChangeDomains,
} from './domainScope.js';

export function resolveDataChangeEventName(message) {
  const msg = message && typeof message === 'object' ? message : {};
  const explicitEvent = normalizeDataChangeToken(msg.event);
  if (explicitEvent) return explicitEvent;
  const legacyType = normalizeDataChangeToken(msg.type);
  if (legacyType && legacyType !== 'data-change') {
    return legacyType;
  }
  return '';
}

function normalizedCategoryList(message) {
  const msg = message && typeof message === 'object' ? message : {};
  const categories = [];
  if (Array.isArray(msg.categories)) {
    categories.push(...msg.categories);
  }
  if (msg.category) {
    categories.push(msg.category);
  }
  return collectDataChangeCategories({ categories });
}

export function dataChangeAffectsCategory(message, category) {
  const target = normalizeDataChangeToken(category).toLowerCase();
  if (!target || target === 'all') return true;
  const scoped = normalizedCategoryList(message);
  if (scoped.length === 0) return true;
  return scoped.includes(target);
}

export function dataChangeAffectsDomains(message, domains) {
  const filters = collectDataChangeDomains(domains);
  if (filters.length === 0) return true;

  const msg = message && typeof message === 'object' ? message : {};
  const msgDomains = collectDataChangeDomains(msg.domains);
  if (msgDomains.length === 0) return true;
  return msgDomains.some((domain) => filters.includes(domain));
}

export function shouldHandleDataChangeMessage({
  message,
  category,
  domains = [],
}) {
  if (!resolveDataChangeEventName(message)) return false;
  if (!dataChangeAffectsCategory(message, category)) return false;
  if (!dataChangeAffectsDomains(message, domains)) return false;
  return true;
}
