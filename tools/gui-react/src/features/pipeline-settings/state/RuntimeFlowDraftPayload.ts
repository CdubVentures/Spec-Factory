// WHY: O(1) Feature Scaling — draft payload passes the draft directly to the
// registry-driven serializer. Adding a new setting requires zero changes here.

import {
  collectRuntimeSettingsPayload,
  type RuntimeModelTokenDefaultsResolver,
} from './runtimeSettingsDomain';
import { type RuntimeDraft } from './RuntimeFlowDraftContracts';

interface CollectRuntimeFlowDraftPayloadParams {
  nextRuntimeDraft: RuntimeDraft;
  runtimeManifestDefaults: RuntimeDraft;
  resolveModelTokenDefaults: RuntimeModelTokenDefaultsResolver;
}

export function collectRuntimeFlowDraftPayload({
  nextRuntimeDraft,
  runtimeManifestDefaults,
  resolveModelTokenDefaults,
}: CollectRuntimeFlowDraftPayloadParams) {
  return collectRuntimeSettingsPayload({
    ...nextRuntimeDraft,
    runtimeSettingsFallbackBaseline: runtimeManifestDefaults,
    resolveModelTokenDefaults,
  });
}
