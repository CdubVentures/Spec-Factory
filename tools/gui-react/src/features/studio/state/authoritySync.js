function normalizeVersion(value) {
  return String(value || '').trim();
}

export function shouldOpenStudioAuthorityConflict({
  conflict,
  nextVersion,
  pendingVersion,
  ignoredVersion,
}) {
  if (!conflict) return false;
  const next = normalizeVersion(nextVersion);
  if (!next) return false;
  const pending = normalizeVersion(pendingVersion);
  if (pending && pending === next) return false;
  const ignored = normalizeVersion(ignoredVersion);
  if (ignored && ignored === next) return false;
  return true;
}

export function decideStudioAuthorityAction({
  category,
  previousCategory,
  initialized,
  hasServerRules,
  hasUnsavedEdits,
  previousVersion,
  nextVersion,
}) {
  const hasRules = Boolean(hasServerRules);
  const next = normalizeVersion(nextVersion);
  const previous = normalizeVersion(previousVersion);
  const changedCategory = Boolean(category) && Boolean(previousCategory) && category !== previousCategory;
  const versionChanged = Boolean(next) && next !== previous;

  if (changedCategory) {
    return {
      resetStore: true,
      hydrate: hasRules,
      rehydrate: false,
      conflict: false,
    };
  }

  if (!hasRules) {
    return {
      resetStore: false,
      hydrate: false,
      rehydrate: false,
      conflict: false,
    };
  }

  if (!initialized) {
    return {
      resetStore: false,
      hydrate: true,
      rehydrate: false,
      conflict: false,
    };
  }

  if (!versionChanged) {
    return {
      resetStore: false,
      hydrate: false,
      rehydrate: false,
      conflict: false,
    };
  }

  if (hasUnsavedEdits) {
    return {
      resetStore: false,
      hydrate: false,
      rehydrate: false,
      conflict: true,
    };
  }

  return {
    resetStore: false,
    hydrate: false,
    rehydrate: true,
    conflict: false,
  };
}
