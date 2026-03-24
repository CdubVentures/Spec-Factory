import {
  parseRuntimeInt,
  type RuntimeSettingsNumericBaseline,
} from '../../pipeline-settings';
import type { RuntimeResumeMode } from '../../../stores/settingsManifest';

interface DeriveRunControlPayloadInput {
  runtimeSettingsBaseline: RuntimeSettingsNumericBaseline;
  resumeMode: RuntimeResumeMode;
  values: Record<string, unknown>;
}

export function deriveRunControlPayload(input: DeriveRunControlPayloadInput) {
  const { runtimeSettingsBaseline, resumeMode } = input;
  const {
    resumeWindowHours,
  } = input.values;
  const parsedResumeWindowHours = parseRuntimeInt(resumeWindowHours, runtimeSettingsBaseline.resumeWindowHours);
  return {
    resumeMode,
    resumeWindowHours: Number.isFinite(parsedResumeWindowHours) && parsedResumeWindowHours >= 0
      ? parsedResumeWindowHours
      : runtimeSettingsBaseline.resumeWindowHours,
  };
}
