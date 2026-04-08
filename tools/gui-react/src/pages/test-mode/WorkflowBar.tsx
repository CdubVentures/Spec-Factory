import { Spinner } from '../../shared/ui/feedback/Spinner.tsx';
import { btnPrimary, btnSecondary, btnDangerSolid as btnDanger } from '../../shared/ui/buttonClasses.ts';
import type { ImportProgress, RunProgress } from './types.ts';

// ── Types ────────────────────────────────────────────────────────────

interface WorkflowBarProps {
  testCategory: string;
  step1Done: boolean;
  step2Done: boolean;
  step3Done: boolean;
  step4Done: boolean;
  scenarioCount: number;
  isRunning: boolean;
  aiReview: boolean;
  onAiToggle: () => void;
  onCreate: () => void;
  onGenerate: () => void;
  onRunAll: () => void;
  onValidate: () => void;
  onWipeAll: () => void;
  createPending: boolean;
  generatePending: boolean;
  runPending: boolean;
  validatePending: boolean;
  runProgress: RunProgress | null;
  importSteps: ImportProgress[];
  validationSummary: { passed: number; failed: number; total: number } | null;
}

// ── Pill classes ─────────────────────────────────────────────────────

const stepDoneCls = 'sf-chip-success';
const stepActiveCls = 'sf-chip-info';
const stepIdleCls = 'sf-chip-neutral';

// ── Component ────────────────────────────────────────────────────────

export function WorkflowBar({
  testCategory,
  step1Done,
  step2Done,
  step3Done,
  step4Done,
  scenarioCount,
  isRunning,
  aiReview,
  onAiToggle,
  onCreate,
  onGenerate,
  onRunAll,
  onValidate,
  onWipeAll,
  createPending,
  generatePending,
  runPending,
  validatePending,
  runProgress,
  importSteps,
  validationSummary,
}: WorkflowBarProps) {
  return (
    <div className="sf-surface-card border sf-border-default rounded-lg p-4 space-y-3">
      {/* Title */}
      <div>
        <h1 className="text-lg font-bold sf-text-primary tracking-tight">Test Mode v2</h1>
        <p className="text-xs sf-text-muted">
          Contract-driven pipeline validation — scenarios auto-generated from the field rules contract (universal, any category).
        </p>
      </div>

      {/* Step pills */}
      <div className="flex items-center gap-1.5 text-[10px] font-semibold">
        <span className={`px-2.5 py-0.5 rounded-full ${step1Done ? stepDoneCls : stepActiveCls}`}>
          1. Create
        </span>
        <span className="sf-text-subtle">&rarr;</span>
        <span className={`px-2.5 py-0.5 rounded-full ${step2Done ? stepDoneCls : step1Done ? stepActiveCls : stepIdleCls}`}>
          2. Generate
        </span>
        <span className="sf-text-subtle">&rarr;</span>
        <span className={`px-2.5 py-0.5 rounded-full ${step3Done ? stepDoneCls : step2Done ? stepActiveCls : stepIdleCls}`}>
          3. Run
        </span>
        <span className="sf-text-subtle">&rarr;</span>
        <span className={`px-2.5 py-0.5 rounded-full ${step4Done ? stepDoneCls : step3Done ? stepActiveCls : stepIdleCls}`}>
          4. Validate
        </span>
        {testCategory && (
          <span className="ml-auto text-[11px] font-mono sf-text-subtle">{testCategory}</span>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={onCreate} disabled={isRunning} className={btnPrimary}>
          {createPending ? <Spinner className="h-4 w-4 inline mr-1" /> : null}
          1. Create
        </button>
        <button onClick={onGenerate} disabled={isRunning || !testCategory} className={btnPrimary}>
          {generatePending ? <Spinner className="h-4 w-4 inline mr-1" /> : null}
          2. Generate
        </button>
        <button onClick={onRunAll} disabled={isRunning || !testCategory || scenarioCount === 0} className={btnPrimary}>
          {runPending ? <Spinner className="h-4 w-4 inline mr-1" /> : null}
          3. Run All
        </button>
        <button
          type="button"
          onClick={onAiToggle}
          className={`px-3 py-1.5 text-sm rounded transition-colors font-semibold border ${
            aiReview
              ? 'sf-chip-success border-current'
              : 'sf-chip-neutral sf-border-default'
          }`}
        >
          AI Review {aiReview ? 'On' : 'Off'}
        </button>
        <button onClick={onValidate} disabled={isRunning || !testCategory || scenarioCount === 0} className={btnSecondary}>
          {validatePending ? <Spinner className="h-4 w-4 inline mr-1" /> : null}
          4. Validate
        </button>
        <div className="flex-1" />
        <button
          onClick={onWipeAll}
          disabled={isRunning || !testCategory}
          className={btnDanger}
        >
          Wipe All
        </button>
      </div>

      {/* Run progress */}
      {runProgress && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs sf-text-muted">
            <Spinner className="h-3 w-3" />
            <span className="font-mono">{runProgress.index + 1}/{runProgress.total}</span>
            <span className="truncate">{runProgress.scenarioName.replace(/_/g, ' ')}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              runProgress.status === 'running' ? 'sf-chip-info' :
              runProgress.status === 'complete' ? 'sf-chip-success' :
              'sf-chip-danger'
            }`}>{runProgress.status}</span>
            {runProgress.aiReview && (
              <span className="text-[10px] sf-chip-warning px-1 py-0.5 rounded">AI</span>
            )}
          </div>
          <div className="relative h-1.5 rounded-full sf-surface-elevated overflow-hidden">
            <progress
              className="sr-only"
              value={runProgress.index + (runProgress.status === 'running' ? 0 : 1)}
              max={runProgress.total}
            />
            <div className="absolute inset-0 flex">
              {Array.from({ length: runProgress.total }, (_, i) => (
                <div
                  key={i}
                  className={`flex-1 ${
                    i < runProgress.index ? 'sf-metric-fill-success' :
                    i === runProgress.index && runProgress.status === 'running' ? 'sf-metric-fill-info animate-pulse' :
                    i === runProgress.index && runProgress.status === 'error' ? 'sf-metric-fill-danger' :
                    i === runProgress.index ? 'sf-metric-fill-success' :
                    ''
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Import progress */}
      {importSteps.length > 0 && (
        <ImportProgressInline steps={importSteps} />
      )}

      {/* Validation summary line */}
      {validationSummary && (
        <div className="text-[11px] sf-text-muted">
          Validation complete:{' '}
          <span className="sf-status-text-success font-semibold">{validationSummary.passed} passed</span>
          {', '}
          <span className="sf-status-text-danger font-semibold">{validationSummary.failed} failed</span>
          {' out of '}
          {validationSummary.total} checks across all field keys.
        </div>
      )}
    </div>
  );
}

// ── Import Progress (inline) ─────────────────────────────────────────

function ImportProgressInline({ steps }: { steps: ImportProgress[] }) {
  const complete = steps.find(s => s.step === 'complete');
  return (
    <div className="text-xs sf-text-muted space-y-1">
      <div className="font-semibold sf-text-primary">
        {complete ? 'Import Complete' : 'Importing Field Rules Studio Contract...'}
      </div>
      {steps.filter(s => s.step !== 'complete').map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          {s.status === 'done' ? (
            <span className="inline-block h-2.5 w-2.5 rounded-full sf-metric-fill-success" />
          ) : s.status === 'error' ? (
            <span className="inline-block h-2.5 w-2.5 rounded-full sf-metric-fill-danger" />
          ) : (
            <Spinner className="h-3 w-3" />
          )}
          <span className="font-mono">{s.step}</span>
          {s.detail && <span className="sf-text-subtle">({s.detail})</span>}
        </div>
      ))}
      {complete?.summary && (
        <div className="pt-1 border-t sf-border-default sf-text-muted">
          {complete.summary.fields} fields, {complete.summary.components} component DBs ({complete.summary.componentItems} items), {complete.summary.enums} enum catalogs, {complete.summary.rules} cross-validation rules
        </div>
      )}
    </div>
  );
}
