import { memo } from 'react';
import type {
  RuntimeDraft,
} from '../types/settingPrimitiveTypes';
import { SettingGroupBlock, SettingRow } from '../components/RuntimeFlowPrimitives';

interface RuntimeFlowParsingSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  inputCls: string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
}

export const RuntimeFlowParsingSection = memo(function RuntimeFlowParsingSection({
  runtimeDraft,
  runtimeSettingsReady,
  inputCls,
  updateDraft,
}: RuntimeFlowParsingSectionProps) {
  return (
    <>
      <SettingGroupBlock title="Storage">
        <SettingRow label="Spec DB Dir" tip={`Phase coverage: 13 Validation To Output and durable storage.\nLives in: final artifact persistence rather than the extraction stage itself.\nWhat this controls: the root directory used for per-category spec SQLite databases.`}>
          <input
            type="text"
            value={runtimeDraft.specDbDir}
            onChange={(event) => updateDraft('specDbDir', event.target.value)}
            disabled={!runtimeSettingsReady}
            className={inputCls}
          />
        </SettingRow>
      </SettingGroupBlock>
    </>
  );
});
