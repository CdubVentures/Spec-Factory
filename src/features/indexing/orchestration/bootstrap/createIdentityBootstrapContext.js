function validateFunctionArg(name, value) {
  if (typeof value !== 'function') {
    throw new TypeError(`createIdentityBootstrapContext requires ${name}`);
  }
}

function asPlainObject(value) {
  if (!value || typeof value !== 'object') {
    return {};
  }
  return { ...value };
}

export async function createIdentityBootstrapContext({
  job = {},
  config = {},
  category = '',
  productId = '',
  resolveIdentityAmbiguitySnapshotFn,
  normalizeAmbiguityLevelFn,
  buildRunIdentityFingerprintFn,
  resolveIdentityLockStatusFn,
} = {}) {
  validateFunctionArg('resolveIdentityAmbiguitySnapshotFn', resolveIdentityAmbiguitySnapshotFn);
  validateFunctionArg('normalizeAmbiguityLevelFn', normalizeAmbiguityLevelFn);
  validateFunctionArg('buildRunIdentityFingerprintFn', buildRunIdentityFingerprintFn);
  validateFunctionArg('resolveIdentityLockStatusFn', resolveIdentityLockStatusFn);

  const baseIdentityLock = asPlainObject(job.identityLock);
  const identityAmbiguity = await resolveIdentityAmbiguitySnapshotFn({
    config,
    category,
    identityLock: baseIdentityLock,
  });
  const identityLock = {
    ...baseIdentityLock,
    family_model_count: identityAmbiguity?.family_model_count,
    ambiguity_level: normalizeAmbiguityLevelFn(identityAmbiguity?.ambiguity_level),
  };
  if (job && typeof job === 'object') {
    job.identityLock = identityLock;
  }

  const identityFingerprint = buildRunIdentityFingerprintFn({
    category,
    productId,
    identityLock,
  });
  const identityLockStatus = resolveIdentityLockStatusFn(identityLock);

  return {
    identityLock,
    identityFingerprint,
    identityLockStatus,
  };
}

