import { useEffect, useState } from "react";
import { JsonViewer } from "../../../shared/ui/data-display/JsonViewer.tsx";
import { Tip } from "../../../shared/ui/feedback/Tip.tsx";
import { deriveCompileReportsViewState } from "../state/compileReportsState.ts";
import { STUDIO_TIPS } from "../components/studioConstants.ts";
import type { StudioPageActivePanelReportsProps as CompileReportsTabProps } from "../components/studioPagePanelContracts.ts";
import { useFormatDateTime } from '../../../utils/dateTime.ts';

import { btnPrimary, sectionCls } from '../../../shared/ui/buttonClasses.ts';

export function CompileReportsTab({
  artifacts,
  compileErrors,
  compileWarnings,
  guardrails,
  compilePending,
  compileIsError,
  compileErrorMessage,
  validatePending,
  validateIsError,
  validateErrorMessage,
  compileRunning,
  validateRunning,
  compileError,
  validateError,
  onRunCompile,
  onRunValidate,
}: CompileReportsTabProps) {
  const [progressTick, setProgressTick] = useState(0);
  const formatDateTime = useFormatDateTime();
  const compileReportsViewState = deriveCompileReportsViewState({
    compileRunning,
    validateRunning,
    compileError,
    validateError,
    compilePending,
    compileIsError,
    compileErrorMessage,
    validatePending,
    validateIsError,
    validateErrorMessage,
    artifacts,
    progressTick,
    nowMs: Date.now(),
  });
  const compileProcessRunning = compileReportsViewState.compileProcessRunning;
  const validateProcessRunning = compileReportsViewState.validateProcessRunning;
  const anyProcessRunning = compileReportsViewState.anyProcessRunning;
  const progressActive = compileReportsViewState.progressActive;

  useEffect(() => {
    if (!progressActive) {
      setProgressTick(0);
      return;
    }
    const timer = setInterval(() => {
      setProgressTick((value) => value + 1);
    }, 500);
    return () => clearInterval(timer);
  }, [progressActive]);

  const compileBadgeLabel = compileReportsViewState.compileBadgeLabel;
  const compileBadgeClass = compileReportsViewState.compileBadgeClass;
  const validateBadgeLabel = compileReportsViewState.validateBadgeLabel;
  const validateBadgeClass = compileReportsViewState.validateBadgeClass;
  const artifactProgressLabel = compileReportsViewState.artifactProgressLabel;
  const artifactProgressPercent =
    compileReportsViewState.artifactProgressPercent;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 overflow-x-auto pb-1">
        <button
          onClick={onRunCompile}
          disabled={compilePending || anyProcessRunning}
          className={`${btnPrimary} h-10 min-h-10 w-52 inline-flex items-center justify-center whitespace-nowrap shrink-0`}
          title={STUDIO_TIPS.run_compile}
        >
          {compileProcessRunning
            ? "Compiling..."
            : compilePending
              ? "Starting..."
              : anyProcessRunning
                ? "Process Running..."
                : "Run Category Compile"}
        </button>
        <button
          onClick={onRunValidate}
          disabled={validatePending || anyProcessRunning}
          className="h-10 min-h-10 w-52 inline-flex items-center justify-center whitespace-nowrap shrink-0 px-4 text-sm sf-confirm-button-solid transition-colors disabled:opacity-50"
          title="Validate generated rule artifacts and schema contracts."
        >
          {validateProcessRunning
            ? "Validating..."
            : validatePending
              ? "Starting..."
              : anyProcessRunning
                ? "Process Running..."
                : "Validate Rules"}
        </button>
        <span
          className={`h-10 min-h-10 w-52 inline-flex items-center justify-center rounded border px-3 text-sm font-medium truncate shrink-0 ${compileBadgeClass}`}
          title={compileBadgeLabel}
        >
          {compileBadgeLabel}
        </span>
        <span
          className={`h-10 min-h-10 w-52 inline-flex items-center justify-center rounded border px-3 text-sm font-medium truncate shrink-0 ${validateBadgeClass}`}
          title={validateBadgeLabel}
        >
          {validateBadgeLabel}
        </span>
        <div
          className={`h-10 min-h-10 w-80 inline-flex items-center gap-2 rounded border px-3 shrink-0 ${
            progressActive
              ? "sf-progress-active-shell"
              : "sf-border-default sf-bg-surface-soft dark:sf-border-default sf-dk-surface-900a30"
          }`}
          title={`${artifactProgressLabel} (${artifactProgressPercent}%)`}
        >
          <div className="h-2 flex-1 rounded sf-progress-track-soft sf-dk-surface-700 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${progressActive ? "bg-accent" : "sf-progress-fill-idle sf-dk-surface-500"}`}
              style={{ width: `${artifactProgressPercent}%` }}
            />
          </div>
          <span className="w-28 text-xs sf-text-muted sf-dk-fg-200 truncate">
            {artifactProgressLabel}
          </span>
          <span className="w-10 text-right text-xs font-semibold sf-text-muted sf-dk-fg-200">
            {artifactProgressPercent}%
          </span>
        </div>
      </div>

      {compileErrors.length > 0 ? (
        <div className={`${sectionCls} sf-border-danger-soft`}>
          <h4 className="text-sm font-semibold sf-danger-text mb-2">
            Compile Errors ({compileErrors.length})
            <Tip
              style={{ position: "relative", left: "-3px", top: "-4px" }}
              text={STUDIO_TIPS.compile_errors}
            />
          </h4>
          <ul className="text-sm space-y-1">
            {compileErrors.map((error, index) => (
              <li key={index} className="sf-danger-text">
                {error}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {compileWarnings.length > 0 ? (
        <div className={`${sectionCls} sf-border-warning-soft`}>
          <h4 className="text-sm font-semibold sf-status-text-warning mb-2">
            Compile Warnings ({compileWarnings.length})
            <Tip
              style={{ position: "relative", left: "-3px", top: "-4px" }}
              text={STUDIO_TIPS.compile_warnings}
            />
          </h4>
          <ul className="text-sm space-y-1">
            {compileWarnings.map((warning, index) => (
              <li key={index} className="sf-status-text-warning">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {artifacts.length > 0 ? (
        <div className={sectionCls}>
          <h4 className="text-sm font-semibold mb-2">
            Generated Artifacts ({artifacts.length} files)
            <Tip
              style={{ position: "relative", left: "-3px", top: "-4px" }}
              text={STUDIO_TIPS.generated_artifacts}
            />
          </h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b sf-border-default">
                <th className="text-left py-1 px-2">File</th>
                <th className="text-right py-1 px-2">Size</th>
                <th className="text-right py-1 px-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.map((artifact) => (
                <tr key={artifact.name} className="sf-divider-default">
                  <td className="py-1 px-2 font-mono text-xs">
                    {artifact.name}
                  </td>
                  <td className="py-1 px-2 text-right sf-text-muted">
                    {(artifact.size / 1024).toFixed(1)} KB
                  </td>
                  <td className="py-1 px-2 text-right sf-text-subtle text-xs">
                    {artifact.updated ? formatDateTime(artifact.updated) || '-' : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {guardrails && Object.keys(guardrails).length > 0 ? (
        <div className={sectionCls}>
          <h4 className="text-sm font-semibold mb-2">
            Guardrails Report
            <Tip
              style={{ position: "relative", left: "-3px", top: "-4px" }}
              text={STUDIO_TIPS.guardrails_report}
            />
          </h4>
          <JsonViewer data={guardrails} />
        </div>
      ) : null}
    </div>
  );
}
