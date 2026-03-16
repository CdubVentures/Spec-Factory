import { renameContextKeys } from '../shared/contextUtils.js';

export function buildIdentityBootstrapContext(context = {}) {
  return renameContextKeys(context, {
  "resolveIdentityAmbiguitySnapshot": "resolveIdentityAmbiguitySnapshotFn",
  "normalizeAmbiguityLevel": "normalizeAmbiguityLevelFn",
  "buildRunIdentityFingerprint": "buildRunIdentityFingerprintFn",
  "resolveIdentityLockStatus": "resolveIdentityLockStatusFn"
});
}
