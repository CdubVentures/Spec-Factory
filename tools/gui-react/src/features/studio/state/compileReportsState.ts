export interface CompileReportsViewStateOptions {
  processCommand?: string | null;
  processRunning?: boolean;
  processExitCode?: number | null;
  processStartedAt?: string | null;
  compilePending: boolean;
  compileIsError: boolean;
  compileErrorMessage?: string;
  validatePending: boolean;
  validateIsError: boolean;
  validateErrorMessage?: string;
  artifacts: Array<{ updated?: string | null }>;
  progressTick: number;
  nowMs: number;
}

export interface CompileReportsViewState {
  compileProcessRunning: boolean;
  validateProcessRunning: boolean;
  anyProcessRunning: boolean;
  progressActive: boolean;
  compileBadgeLabel: string;
  compileBadgeClass: string;
  validateBadgeLabel: string;
  validateBadgeClass: string;
  artifactProgressLabel: string;
  artifactProgressPercent: number;
}

const IDLE_BADGE_CLASS =
  'sf-border-default sf-bg-surface-soft sf-text-muted dark:sf-border-default sf-dk-surface-900a30 dark:sf-text-subtle';

export function deriveCompileReportsViewState({
  processCommand,
  processRunning = false,
  processExitCode,
  processStartedAt,
  compilePending,
  compileIsError,
  compileErrorMessage,
  validatePending,
  validateIsError,
  validateErrorMessage,
  artifacts,
  progressTick,
  nowMs,
}: CompileReportsViewStateOptions): CompileReportsViewState {
  const processCommandToken = String(processCommand || '').toLowerCase();
  const compileProcessCommand =
    processCommandToken.includes('compile-rules') ||
    processCommandToken.includes('category-compile');
  const validateProcessCommand =
    processCommandToken.includes('validate-rules');
  const compileProcessRunning = Boolean(processRunning) && compileProcessCommand;
  const validateProcessRunning =
    Boolean(processRunning) && validateProcessCommand;
  const compileProcessFinished =
    !processRunning && compileProcessCommand;
  const validateProcessFinished =
    !processRunning && validateProcessCommand;
  const compileProcessFailed =
    compileProcessFinished &&
    processExitCode !== null &&
    processExitCode !== undefined &&
    Number(processExitCode) !== 0;
  const validateProcessFailed =
    validateProcessFinished &&
    processExitCode !== null &&
    processExitCode !== undefined &&
    Number(processExitCode) !== 0;
  const anyProcessRunning = Boolean(processRunning);
  const progressActive =
    compileProcessRunning ||
    validateProcessRunning ||
    compilePending ||
    validatePending;

  const activeArtifactGoal = compileProcessCommand
    ? processCommandToken.includes('compile-rules')
      ? 10
      : 6
    : 10;
  const idleArtifactGoal = 10;
  const compileStartedAtMs = Date.parse(String(processStartedAt || ''));
  const artifactUpdatedThisRunCount = Number.isFinite(compileStartedAtMs)
    ? artifacts.filter((artifact) => {
        const updatedMs = Date.parse(String(artifact?.updated || ''));
        return Number.isFinite(updatedMs) && updatedMs >= compileStartedAtMs - 1000;
      }).length
    : 0;
  const runningArtifactCount = Math.min(
    Math.max(0, artifactUpdatedThisRunCount),
    activeArtifactGoal,
  );
  const elapsedMs = Number.isFinite(compileStartedAtMs)
    ? Math.max(0, nowMs - compileStartedAtMs)
    : progressTick * 500;
  const fallbackRunningCount = progressActive
    ? Math.min(
        Math.max(1, Math.floor(elapsedMs / 1500)),
        Math.max(1, activeArtifactGoal - 1),
      )
    : 0;
  const artifactProgressCount = progressActive
    ? Math.max(runningArtifactCount, fallbackRunningCount)
    : 0;
  const artifactProgressGoal = progressActive
    ? activeArtifactGoal
    : idleArtifactGoal;
  const artifactProgressPercent = progressActive
    ? artifactProgressGoal > 0
      ? Math.round((artifactProgressCount / artifactProgressGoal) * 100)
      : 0
    : 0;
  const artifactProgressLabel = progressActive
    ? `Artifacts ${artifactProgressCount} of ${artifactProgressGoal}`
    : `Artifacts 0 of ${idleArtifactGoal}`;

  const compileBadge = compileProcessRunning
    ? {
        label: 'Compile running',
        className: 'sf-callout sf-callout-info',
      }
    : compilePending
      ? {
          label: 'Compile starting',
          className: 'sf-callout sf-callout-info',
        }
      : compileIsError
        ? {
            label: compileErrorMessage || 'Compile failed',
            className: 'sf-callout sf-callout-danger',
          }
        : compileProcessFailed
          ? {
              label:
                processExitCode !== null && processExitCode !== undefined
                  ? `Compile failed (${processExitCode})`
                  : 'Compile failed',
              className: 'sf-callout sf-callout-danger',
            }
          : null;

  const validateBadge = validateProcessRunning
    ? {
        label: 'Validation running',
        className: 'sf-callout sf-callout-info',
      }
    : validatePending
      ? {
          label: 'Validation starting',
          className: 'sf-callout sf-callout-info',
        }
      : validateIsError
        ? {
            label: validateErrorMessage || 'Validation failed',
            className: 'sf-callout sf-callout-danger',
          }
        : validateProcessFailed
          ? {
              label:
                processExitCode !== null && processExitCode !== undefined
                  ? `Validation failed (${processExitCode})`
                  : 'Validation failed',
              className: 'sf-callout sf-callout-danger',
            }
          : validateProcessFinished
            ? {
                label: 'Validation complete',
                className: 'sf-callout sf-callout-success',
              }
            : null;

  return {
    compileProcessRunning,
    validateProcessRunning,
    anyProcessRunning,
    progressActive,
    compileBadgeLabel: compileBadge?.label || 'Compile idle',
    compileBadgeClass: compileBadge?.className || IDLE_BADGE_CLASS,
    validateBadgeLabel: validateBadge?.label || 'Validation idle',
    validateBadgeClass: validateBadge?.className || IDLE_BADGE_CLASS,
    artifactProgressLabel,
    artifactProgressPercent,
  };
}
