import { memo } from 'react';
import type { ReactNode } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

interface RuntimeFlowBrowserRenderingSectionProps {
  runtimeDraft: RuntimeDraft;
  runtimeSettingsReady: boolean;
  dynamicFetchControlsLocked: boolean;
  inputCls: string;
  runtimeSubStepDomId: (id: string) => string;
  updateDraft: <K extends keyof RuntimeDraft>(key: K, value: RuntimeDraft[K]) => void;
  onNumberChange: <K extends keyof RuntimeDraft>(key: K, eventValue: string, bounds: NumberBound) => void;
  getNumberBounds: <K extends keyof RuntimeDraft>(key: K) => NumberBound;
  renderDisabledHint: (message: string) => ReactNode;
}

export const RuntimeFlowBrowserRenderingSection = memo(function RuntimeFlowBrowserRenderingSection({
  runtimeDraft,
  runtimeSettingsReady,
  dynamicFetchControlsLocked,
  inputCls,
  runtimeSubStepDomId,
  updateDraft,
  onNumberChange,
  getNumberBounds,
  renderDisabledHint,
}: RuntimeFlowBrowserRenderingSectionProps) {
  return (
    <>
      <div id={runtimeSubStepDomId('browser-rendering-core')} className="scroll-mt-24" />
      <SettingGroupBlock title="Browser Core">
        <MasterSwitchRow label="Dynamic Crawlee Enabled" tip="Master toggle for browser-based dynamic fetch fallback.">
          <SettingToggle
            checked={runtimeDraft.dynamicCrawleeEnabled}
            onChange={(next) => updateDraft('dynamicCrawleeEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Crawlee Headless" tip="Run browser fallback in headless mode." disabled={dynamicFetchControlsLocked}>
          <SettingToggle
            checked={runtimeDraft.crawleeHeadless}
            onChange={(next) => updateDraft('crawleeHeadless', next)}
            disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
          />
        </SettingRow>
        <SettingRow
          label="Crawlee Request Timeout (sec)"
          tip="Per-request timeout for dynamic request handlers."
          disabled={dynamicFetchControlsLocked}
        >
          <SettingNumberInput draftKey="crawleeRequestHandlerTimeoutSecs" value={runtimeDraft.crawleeRequestHandlerTimeoutSecs} bounds={getNumberBounds('crawleeRequestHandlerTimeoutSecs')} step={1} disabled={!runtimeSettingsReady || dynamicFetchControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Dynamic Retry Budget" tip="Maximum retry attempts for dynamic fetch policy." disabled={dynamicFetchControlsLocked}>
          <SettingNumberInput draftKey="dynamicFetchRetryBudget" value={runtimeDraft.dynamicFetchRetryBudget} bounds={getNumberBounds('dynamicFetchRetryBudget')} step={1} disabled={!runtimeSettingsReady || dynamicFetchControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Dynamic Fetch Policy" count={2}>
          <SettingRow label="Dynamic Retry Backoff (ms)" tip="Backoff delay between dynamic retry attempts." disabled={dynamicFetchControlsLocked}>
            <SettingNumberInput draftKey="dynamicFetchRetryBackoffMs" value={runtimeDraft.dynamicFetchRetryBackoffMs} bounds={getNumberBounds('dynamicFetchRetryBackoffMs')} step={100} disabled={!runtimeSettingsReady || dynamicFetchControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow
            label="Dynamic Fetch Policy Map (JSON)"
            tip="Optional JSON policy map for host-specific dynamic fetch behavior."
            disabled={dynamicFetchControlsLocked}
          >
            <textarea
              value={runtimeDraft.dynamicFetchPolicyMapJson}
              onChange={(event) => updateDraft('dynamicFetchPolicyMapJson', event.target.value)}
              disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
              className={`${inputCls} min-h-[88px] font-mono sf-text-label`}
              spellCheck={false}
            />
          </SettingRow>
        </AdvancedSettingsBlock>
        {dynamicFetchControlsLocked ? renderDisabledHint('Dynamic fetch controls are disabled because Dynamic Crawlee is OFF.') : null}
      </SettingGroupBlock>

      <div id={runtimeSubStepDomId('browser-rendering-scroll')} className="scroll-mt-24" />
      <SettingGroupBlock title="Scroll and Replay">
        <SettingRow label="Auto Scroll Enabled" tip="Enable browser auto-scroll before extraction on dynamic pages.">
          <SettingToggle
            checked={runtimeDraft.autoScrollEnabled}
            onChange={(next) => updateDraft('autoScrollEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Auto Scroll Passes" tip="Number of auto-scroll passes when auto-scroll is enabled." disabled={!runtimeDraft.autoScrollEnabled}>
          <SettingNumberInput draftKey="autoScrollPasses" value={runtimeDraft.autoScrollPasses} bounds={getNumberBounds('autoScrollPasses')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.autoScrollEnabled} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="GraphQL Replay Enabled" tip="Allow GraphQL response replay capture during fetch/render.">
          <SettingToggle
            checked={runtimeDraft.graphqlReplayEnabled}
            onChange={(next) => updateDraft('graphqlReplayEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Robots.txt Compliant" tip="Respect robots.txt allow/deny rules during fetch scheduling.">
          <SettingToggle
            checked={runtimeDraft.robotsTxtCompliant}
            onChange={(next) => updateDraft('robotsTxtCompliant', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <AdvancedSettingsBlock title="Scroll & Replay Internals" count={4}>
          <SettingRow label="Auto Scroll Delay (ms)" tip="Delay between auto-scroll passes." disabled={!runtimeDraft.autoScrollEnabled}>
            <SettingNumberInput draftKey="autoScrollDelayMs" value={runtimeDraft.autoScrollDelayMs} bounds={getNumberBounds('autoScrollDelayMs')} step={50} disabled={!runtimeSettingsReady || !runtimeDraft.autoScrollEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Max GraphQL Replays" tip="Maximum GraphQL replay attempts per page when replay is enabled." disabled={!runtimeDraft.graphqlReplayEnabled}>
            <SettingNumberInput draftKey="maxGraphqlReplays" value={runtimeDraft.maxGraphqlReplays} bounds={getNumberBounds('maxGraphqlReplays')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.graphqlReplayEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Max Network Responses / Page" tip="Hard cap for captured network responses per page.">
            <SettingNumberInput draftKey="maxNetworkResponsesPerPage" value={runtimeDraft.maxNetworkResponsesPerPage} bounds={getNumberBounds('maxNetworkResponsesPerPage')} step={10} disabled={!runtimeSettingsReady} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Robots.txt Timeout (ms)" tip="Timeout for robots.txt fetch checks." disabled={!runtimeDraft.robotsTxtCompliant}>
            <SettingNumberInput draftKey="robotsTxtTimeoutMs" value={runtimeDraft.robotsTxtTimeoutMs} bounds={getNumberBounds('robotsTxtTimeoutMs')} step={100} disabled={!runtimeSettingsReady || !runtimeDraft.robotsTxtCompliant} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      <div id={runtimeSubStepDomId('browser-rendering-screenshots')} className="scroll-mt-24" />
      <SettingGroupBlock title="Screenshots">
        <MasterSwitchRow label="Capture Page Screenshot Enabled" tip="Enable screenshot capture in fetch pipeline.">
          <SettingToggle
            checked={runtimeDraft.capturePageScreenshotEnabled}
            onChange={(next) => updateDraft('capturePageScreenshotEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Capture Screenshot Format" tip="Screenshot format (jpeg/png/webp)." disabled={!runtimeDraft.capturePageScreenshotEnabled}>
          <input
            type="text"
            value={runtimeDraft.capturePageScreenshotFormat}
            onChange={(event) => updateDraft('capturePageScreenshotFormat', event.target.value)}
            disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Capture Screenshot Quality" tip="Quality for screenshot encoder when supported." disabled={!runtimeDraft.capturePageScreenshotEnabled}>
          <SettingNumberInput draftKey="capturePageScreenshotQuality" value={runtimeDraft.capturePageScreenshotQuality} bounds={getNumberBounds('capturePageScreenshotQuality')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Runtime Capture Screenshots" tip="Emit runtime screenshot events while process is running.">
          <SettingToggle
            checked={runtimeDraft.runtimeCaptureScreenshots}
            onChange={(next) => updateDraft('runtimeCaptureScreenshots', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <AdvancedSettingsBlock title="Screenshot Limits & Selectors" count={3}>
          <SettingRow label="Capture Screenshot Max Bytes" tip="Max screenshot payload bytes before truncation/rejection." disabled={!runtimeDraft.capturePageScreenshotEnabled}>
            <SettingNumberInput draftKey="capturePageScreenshotMaxBytes" value={runtimeDraft.capturePageScreenshotMaxBytes} bounds={getNumberBounds('capturePageScreenshotMaxBytes')} step={1024} disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Capture Screenshot Selectors" tip="CSS selectors used to focus screenshot capture on spec regions." disabled={!runtimeDraft.capturePageScreenshotEnabled}>
            <input
              type="text"
              value={runtimeDraft.capturePageScreenshotSelectors}
              onChange={(event) => updateDraft('capturePageScreenshotSelectors', event.target.value)}
              disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled}
              className={inputCls}
            />
          </SettingRow>
          <SettingRow label="Runtime Screenshot Mode" tip="Runtime screenshot persistence mode (last_only/all)." disabled={!runtimeDraft.runtimeCaptureScreenshots}>
            <input
              type="text"
              value={runtimeDraft.runtimeScreenshotMode}
              onChange={(event) => updateDraft('runtimeScreenshotMode', event.target.value)}
              disabled={!runtimeSettingsReady || !runtimeDraft.runtimeCaptureScreenshots}
              className={inputCls}
            />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

    </>
  );
});
