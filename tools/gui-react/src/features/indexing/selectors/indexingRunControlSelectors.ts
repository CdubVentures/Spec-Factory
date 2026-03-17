import {
  parseRuntimeInt,
  type RuntimeSettingsNumericBaseline,
} from '../../pipeline-settings';
import type { RuntimeResumeMode } from '../../../stores/settingsManifest';

interface DeriveRunControlPayloadInput {
  runtimeSettingsBaseline: RuntimeSettingsNumericBaseline;
  resumeMode: RuntimeResumeMode;
  reextractIndexed: boolean;
  values: Record<string, unknown>;
}

export function deriveRunControlPayload(input: DeriveRunControlPayloadInput) {
  const { runtimeSettingsBaseline, resumeMode, reextractIndexed } = input;
  const {
    resumeWindowHours,
    reextractAfterHours,
  } = input.values;
  const parsedResumeWindowHours = parseRuntimeInt(resumeWindowHours, runtimeSettingsBaseline.resumeWindowHours);
  const parsedReextractAfterHours = parseRuntimeInt(reextractAfterHours, runtimeSettingsBaseline.reextractAfterHours);
  return {
    resumeMode,
    resumeWindowHours: Number.isFinite(parsedResumeWindowHours) && parsedResumeWindowHours >= 0
      ? parsedResumeWindowHours
      : runtimeSettingsBaseline.resumeWindowHours,
    reextractAfterHours: Number.isFinite(parsedReextractAfterHours) && parsedReextractAfterHours >= 0
      ? parsedReextractAfterHours
      : runtimeSettingsBaseline.reextractAfterHours,
    reextractIndexed,
  };
}
