import { memo } from 'react';
import type { ReactNode } from 'react';
import type {
  RuntimeDraft,
  NumberBound,
} from '../types/settingPrimitiveTypes';
import { AdvancedSettingsBlock, MasterSwitchRow, SettingGroupBlock, SettingNumberInput, SettingRow, SettingToggle } from '../components/RuntimeFlowPrimitives';

const BROWSER_PHASE_TIP =
  'Phase coverage: 08 Fetch and Parse Entry before Stage 09 Fetch To Extraction.';

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
        <MasterSwitchRow label="Dynamic Crawlee Enabled" tip={`${BROWSER_PHASE_TIP}\nLives in: fetch mode escalation when HTTP retrieval is not enough.\nWhat this controls: whether the runtime can switch into a browser-backed Crawlee lane for dynamic pages.`} hint="Controls headless mode, timeouts, and dynamic fetch policy below">
          <SettingToggle
            checked={runtimeDraft.dynamicCrawleeEnabled}
            onChange={(next) => updateDraft('dynamicCrawleeEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Crawlee Headless" tip={`${BROWSER_PHASE_TIP}\nLives in: browser-launch configuration.\nWhat this controls: whether the browser fallback runs without a visible window.`} disabled={dynamicFetchControlsLocked}>
          <SettingToggle
            checked={runtimeDraft.crawleeHeadless}
            onChange={(next) => updateDraft('crawleeHeadless', next)}
            disabled={!runtimeSettingsReady || dynamicFetchControlsLocked}
          />
        </SettingRow>
        <SettingRow
          label="Crawlee Request Timeout (sec)"
          tip={`${BROWSER_PHASE_TIP}\nLives in: dynamic request handling inside the Crawlee lane.\nWhat this controls: the maximum time a single dynamic request handler is allowed to run before timing out.`}
          disabled={dynamicFetchControlsLocked}
        >
          <SettingNumberInput draftKey="crawleeRequestHandlerTimeoutSecs" value={runtimeDraft.crawleeRequestHandlerTimeoutSecs} bounds={getNumberBounds('crawleeRequestHandlerTimeoutSecs')} step={1} disabled={!runtimeSettingsReady || dynamicFetchControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Dynamic Retry Budget" tip={`${BROWSER_PHASE_TIP}\nLives in: dynamic fetch retry policy.\nWhat this controls: how many retry attempts a browser-backed fetch may consume before the runtime gives up on the dynamic lane.`} disabled={dynamicFetchControlsLocked}>
          <SettingNumberInput draftKey="dynamicFetchRetryBudget" value={runtimeDraft.dynamicFetchRetryBudget} bounds={getNumberBounds('dynamicFetchRetryBudget')} step={1} disabled={!runtimeSettingsReady || dynamicFetchControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Dynamic Fetch Policy" count={2}>
          <SettingRow label="Dynamic Retry Backoff (ms)" tip={`${BROWSER_PHASE_TIP}\nLives in: dynamic retry timing.\nWhat this controls: the delay inserted between browser-backed retry attempts.`} disabled={dynamicFetchControlsLocked}>
            <SettingNumberInput draftKey="dynamicFetchRetryBackoffMs" value={runtimeDraft.dynamicFetchRetryBackoffMs} bounds={getNumberBounds('dynamicFetchRetryBackoffMs')} step={100} disabled={!runtimeSettingsReady || dynamicFetchControlsLocked} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow
            label="Dynamic Fetch Policy Map (JSON)"
            tip={`${BROWSER_PHASE_TIP}\nLives in: host-specific browser escalation rules.\nWhat this controls: an optional JSON map for per-host dynamic fetch behavior such as retry and lane selection overrides.`}
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
        <SettingRow label="Auto Scroll Enabled" tip={`${BROWSER_PHASE_TIP}\nLives in: rendered-page preparation just before extraction reads the page.\nWhat this controls: whether the browser should scroll dynamic pages to reveal lazy-loaded content before parsing starts.`}>
          <SettingToggle
            checked={runtimeDraft.autoScrollEnabled}
            onChange={(next) => updateDraft('autoScrollEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <SettingRow label="Auto Scroll Passes" tip={`${BROWSER_PHASE_TIP}\nLives in: auto-scroll execution loop.\nWhat this controls: how many scroll passes the browser performs when auto-scroll is enabled.`} disabled={!runtimeDraft.autoScrollEnabled}>
          <SettingNumberInput draftKey="autoScrollPasses" value={runtimeDraft.autoScrollPasses} bounds={getNumberBounds('autoScrollPasses')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.autoScrollEnabled} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <SettingRow label="Robots.txt Compliant" tip={`${BROWSER_PHASE_TIP}\nLives in: fetch admission and browser scheduling.\nWhat this controls: whether robots.txt allow and deny rules must be respected before visiting a page.`}>
          <SettingToggle
            checked={runtimeDraft.robotsTxtCompliant}
            onChange={(next) => updateDraft('robotsTxtCompliant', next)}
            disabled={!runtimeSettingsReady}
          />
        </SettingRow>
        <AdvancedSettingsBlock title="Scroll Internals" count={2}>
          <SettingRow label="Auto Scroll Delay (ms)" tip={`${BROWSER_PHASE_TIP}\nLives in: auto-scroll pacing.\nWhat this controls: the wait inserted between successive scroll passes.`} disabled={!runtimeDraft.autoScrollEnabled}>
            <SettingNumberInput draftKey="autoScrollDelayMs" value={runtimeDraft.autoScrollDelayMs} bounds={getNumberBounds('autoScrollDelayMs')} step={50} disabled={!runtimeSettingsReady || !runtimeDraft.autoScrollEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Robots.txt Timeout (ms)" tip={`${BROWSER_PHASE_TIP}\nLives in: robots.txt verification requests.\nWhat this controls: how long the runtime waits for robots.txt checks before treating them as timed out.`} disabled={!runtimeDraft.robotsTxtCompliant}>
            <SettingNumberInput draftKey="robotsTxtTimeoutMs" value={runtimeDraft.robotsTxtTimeoutMs} bounds={getNumberBounds('robotsTxtTimeoutMs')} step={100} disabled={!runtimeSettingsReady || !runtimeDraft.robotsTxtCompliant} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

      <div id={runtimeSubStepDomId('browser-rendering-screenshots')} className="scroll-mt-24" />
      <SettingGroupBlock title="Screenshots">
        <MasterSwitchRow label="Capture Page Screenshot Enabled" tip={`${BROWSER_PHASE_TIP}\nLives in: fetch artifact capture after a page is loaded.\nWhat this controls: whether the runtime stores screenshot artifacts that later support Runtime Ops review and extraction debugging.`} hint="Controls screenshot format, quality, and selector settings below">
          <SettingToggle
            checked={runtimeDraft.capturePageScreenshotEnabled}
            onChange={(next) => updateDraft('capturePageScreenshotEnabled', next)}
            disabled={!runtimeSettingsReady}
          />
        </MasterSwitchRow>
        <SettingRow label="Capture Screenshot Format" tip={`${BROWSER_PHASE_TIP}\nLives in: screenshot encoder selection.\nWhat this controls: the image format used when page screenshots are captured.`} disabled={!runtimeDraft.capturePageScreenshotEnabled}>
          <input
            type="text"
            value={runtimeDraft.capturePageScreenshotFormat}
            onChange={(event) => updateDraft('capturePageScreenshotFormat', event.target.value)}
            disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled}
            className={inputCls}
          />
        </SettingRow>
        <SettingRow label="Capture Screenshot Quality" tip={`${BROWSER_PHASE_TIP}\nLives in: screenshot encoding.\nWhat this controls: the quality setting used by screenshot encoders that support lossy compression.`} disabled={!runtimeDraft.capturePageScreenshotEnabled}>
          <SettingNumberInput draftKey="capturePageScreenshotQuality" value={runtimeDraft.capturePageScreenshotQuality} bounds={getNumberBounds('capturePageScreenshotQuality')} step={1} disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled} className={inputCls} onNumberChange={onNumberChange} />
        </SettingRow>
        <AdvancedSettingsBlock title="Screenshot Limits & Selectors" count={2}>
          <SettingRow label="Capture Screenshot Max Bytes" tip={`${BROWSER_PHASE_TIP}\nLives in: screenshot artifact size guard.\nWhat this controls: the largest screenshot payload the runtime will keep before truncation or rejection applies.`} disabled={!runtimeDraft.capturePageScreenshotEnabled}>
            <SettingNumberInput draftKey="capturePageScreenshotMaxBytes" value={runtimeDraft.capturePageScreenshotMaxBytes} bounds={getNumberBounds('capturePageScreenshotMaxBytes')} step={1024} disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled} className={inputCls} onNumberChange={onNumberChange} />
          </SettingRow>
          <SettingRow label="Capture Screenshot Selectors" tip={`${BROWSER_PHASE_TIP}\nLives in: screenshot focus and crop targeting.\nWhat this controls: the CSS selectors used to bias screenshot capture toward spec-relevant regions of the page.`} disabled={!runtimeDraft.capturePageScreenshotEnabled}>
            <input
              type="text"
              value={runtimeDraft.capturePageScreenshotSelectors}
              onChange={(event) => updateDraft('capturePageScreenshotSelectors', event.target.value)}
              disabled={!runtimeSettingsReady || !runtimeDraft.capturePageScreenshotEnabled}
              className={inputCls}
            />
          </SettingRow>
        </AdvancedSettingsBlock>
      </SettingGroupBlock>

    </>
  );
});
