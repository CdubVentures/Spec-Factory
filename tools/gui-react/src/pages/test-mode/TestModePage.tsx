import { useState, useEffect, useCallback, useRef } from 'react';
import { useCollapseStore } from '../../stores/collapseStore.ts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client.ts';
import { wsManager } from '../../api/ws.ts';
import { useUiStore } from '../../stores/uiStore.ts';

import type {
  TestCase,
  GenerateResult,
  ContractSummary,
  ContractResponse,
  RunResultItem,
  ValidationResult,
  ImportProgress,
  RunProgress,
  RepairProgress,
} from './types.ts';

import { WorkflowBar } from './WorkflowBar.tsx';
import { SummaryStrip } from './SummaryStrip.tsx';
import { CoverageMatrices } from './CoverageMatrices.tsx';
import { RepairLifecycleProof } from './RepairLifecycleProof.tsx';
import { DimensionMatrix } from './DimensionMatrix.tsx';
import { ScenarioCard } from './ScenarioCard.tsx';

// ── Session storage key ──────────────────────────────────────────────

const LS_KEY = 'test-mode-state';

function loadSaved(): Record<string, unknown> {
  try { return JSON.parse(sessionStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

// ── Section badge class ──────────────────────────────────────────────

function sectionBadgeClass(passCount: number, total: number): string {
  if (total === 0) return 'sf-chip-neutral';
  if (passCount === total) return 'sf-chip-success';
  if (passCount === 0) return 'sf-chip-danger';
  return 'sf-chip-warning';
}

// ── Main Component ───────────────────────────────────────────────────

export function TestModePage() {
  const saved = loadSaved();

  // WHY: sourceCategory is the real category (e.g. "mouse"). Derived from sidebar global state on mount.
  const globalCategory = useUiStore((s) => s.category);
  const setGlobalCategory = useUiStore((s) => s.setCategory);
  const sourceCategory = globalCategory.startsWith('_test_')
    ? globalCategory.replace(/^_test_/, '')
    : globalCategory;

  const [testCategory, setTestCategory] = useState<string>((saved.testCategory as string) || '');
  const [generatedProducts, setGeneratedProducts] = useState<TestCase[]>((saved.generatedProducts as TestCase[]) || []);
  const [runResults, setRunResults] = useState<RunResultItem[]>((saved.runResults as RunResultItem[]) || []);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>((saved.validationResult as ValidationResult) || null);
  const [importSteps, setImportSteps] = useState<ImportProgress[]>([]);
  const [runProgress, setRunProgress] = useState<RunProgress | null>(null);
  const [aiReview, setAiReview] = useState(Boolean(saved.aiReview));
  const [statusLoaded, setStatusLoaded] = useState(false);
  const importStepsRef = useRef<ImportProgress[]>([]);
  // WHY: Per-product repair progress — shows live LLM calls during AI review
  const [repairProgressMap, setRepairProgressMap] = useState<Record<string, RepairProgress>>({});
  // WHY: Track which productId is currently running so cards show running state
  const [activeProductId, setActiveProductId] = useState<string | null>(null);

  // Matrix collapse state
  const matrixCollapseValues = useCollapseStore((s) => s.values);
  const matrixCollapseToggle = useCollapseStore((s) => s.toggle);
  const matrixCollapsed = {
    fieldRules: matrixCollapseValues['testMode:matrix:fieldRules'] ?? true,
    components: matrixCollapseValues['testMode:matrix:components'] ?? true,
    listsEnums: matrixCollapseValues['testMode:matrix:listsEnums'] ?? true,
  };
  const toggleMatrix = useCallback((key: string) => {
    matrixCollapseToggle(`testMode:matrix:${key}`, true);
  }, [matrixCollapseToggle]);

  // ── Persist to sessionStorage ──────────────────────────────────────

  useEffect(() => {
    try {
      sessionStorage.setItem(LS_KEY, JSON.stringify({
        testCategory,
        generatedProducts,
        runResults,
        validationResult,
        aiReview,
      }));
    } catch { /* sessionStorage full or disabled */ }
  }, [testCategory, generatedProducts, runResults, validationResult, aiReview]);

  // ── Load status from backend on mount ──────────────────────────────

  useEffect(() => {
    if (statusLoaded) return;
    const cat = (saved.sourceCategory as string) || sourceCategory;
    api.get<{ ok: boolean; exists: boolean; testCategory: string; testCases: TestCase[]; runResults: RunResultItem[] }>(
      `/test-mode/status?sourceCategory=${cat}`,
    ).then((data) => {
      if (data.exists && data.testCategory) {
        setTestCategory(data.testCategory);
        setGlobalCategory(data.testCategory);
        if (data.testCases.length > 0) setGeneratedProducts(data.testCases);
        if (data.runResults.length > 0) setRunResults(data.runResults);
      } else if (saved.testCategory) {
        setTestCategory('');
        setGeneratedProducts([]);
        setRunResults([]);
        setValidationResult(null);
      }
      setStatusLoaded(true);
    }).catch(() => setStatusLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Contract summary query ─────────────────────────────────────────

  const { data: contractData } = useQuery({
    queryKey: ['contract-summary', testCategory],
    queryFn: () => api.get<ContractResponse>(`/test-mode/contract-summary?category=${testCategory}`),
    enabled: Boolean(testCategory),
  });

  // ── WebSocket: import + run progress ───────────────────────────────

  useEffect(() => {
    wsManager.connect();
    const unsub = wsManager.onMessage((channel, data) => {
      if (channel === 'test-import-progress') {
        const progress = data as ImportProgress;
        const existing = importStepsRef.current;
        const idx = existing.findIndex(s => s.step === progress.step);
        if (idx >= 0) {
          existing[idx] = progress;
          importStepsRef.current = [...existing];
        } else {
          importStepsRef.current = [...existing, progress];
        }
        setImportSteps([...importStepsRef.current]);
      }
      if (channel === 'test-run-progress') {
        const progress = data as RunProgress;
        setRunProgress(progress);
        // WHY: Track which product is actively running so the correct card shows live state
        if (progress.status === 'running') {
          setActiveProductId(progress.productId);
          // Clear repair progress for this product — new scenario starting
          setRepairProgressMap(prev => { const next = { ...prev }; delete next[progress.productId]; return next; });
        }
        if (progress.status === 'complete' || progress.status === 'error') {
          setActiveProductId(null);
          setRepairProgressMap(prev => { const next = { ...prev }; delete next[progress.productId]; return next; });
        }
        if ((progress.status === 'complete' || progress.status === 'error') && progress.result) {
          setRunResults(prev => {
            const updated = [...prev];
            const idx = updated.findIndex(r => r.productId === progress.productId);
            if (idx >= 0) updated[idx] = progress.result!;
            else updated.push(progress.result!);
            return updated;
          });
        }
      }
      // WHY: Per-field repair progress — each LLM call updates the card live
      if (channel === 'test-repair-progress') {
        const progress = data as RepairProgress;
        setRepairProgressMap(prev => ({ ...prev, [progress.productId]: progress }));
      }
    });
    return unsub;
  }, []);

  // ── Mutations ──────────────────────────────────────────────────────

  const queryClient = useQueryClient();

  const createMut = useMutation({
    mutationFn: () => {
      importStepsRef.current = [];
      setImportSteps([]);
      return api.post<{ ok: boolean; category: string; contractSummary?: ContractSummary }>('/test-mode/create', { sourceCategory });
    },
    onSuccess: (data) => {
      setTestCategory(data.category);
      setGeneratedProducts([]);
      setRunResults([]);
      setValidationResult(null);
      queryClient.invalidateQueries({ queryKey: ['contract-summary'] });
      setGlobalCategory(data.category);
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories-real'] });
    },
  });

  const generateMut = useMutation({
    mutationFn: () => api.post<GenerateResult>('/test-mode/generate-products', { category: testCategory }),
    onSuccess: (data) => {
      setGeneratedProducts(data.testCases || []);
      setRunResults([]);
      setValidationResult(null);
    },
  });

  const runAllMut = useMutation({
    mutationFn: () => {
      setRunProgress(null);
      return api.post<{ ok: boolean; results: RunResultItem[] }>('/test-mode/run', {
        category: testCategory,
        aiReview,
      });
    },
    onSuccess: (data) => {
      setRunResults(data.results || []);
      setRunProgress(null);
    },
    onError: () => setRunProgress(null),
  });

  const runOneMut = useMutation({
    mutationFn: (productId: string) =>
      api.post<{ ok: boolean; results: RunResultItem[] }>('/test-mode/run', {
        category: testCategory,
        productId,
        aiReview,
      }),
    onSuccess: (data) => {
      const newResults = data.results || [];
      setRunResults((prev) => {
        const updated = [...prev];
        for (const r of newResults) {
          const idx = updated.findIndex((u) => u.productId === r.productId);
          if (idx >= 0) updated[idx] = r;
          else updated.push(r);
        }
        return updated;
      });
    },
  });

  const validateMut = useMutation({
    mutationFn: () => api.post<ValidationResult>('/test-mode/validate', { category: testCategory }),
    onSuccess: (data) => setValidationResult(data),
  });

  const deleteMut = useMutation({
    mutationFn: () => api.del<{ ok: boolean }>(`/test-mode/${testCategory}`),
    onSuccess: () => {
      setGlobalCategory(sourceCategory);
      setTestCategory('');
      setGeneratedProducts([]);
      setRunResults([]);
      setValidationResult(null);
      setImportSteps([]);
      importStepsRef.current = [];
      useCollapseStore.getState().setBatch({
        'testMode:matrix:fieldRules': true,
        'testMode:matrix:components': true,
        'testMode:matrix:listsEnums': true,
      });
      try { sessionStorage.removeItem(LS_KEY); } catch { /* ignore */ }
      queryClient.invalidateQueries({ queryKey: ['contract-summary'] });
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      queryClient.invalidateQueries({ queryKey: ['categories-real'] });
    },
  });

  const isRunning = createMut.isPending || generateMut.isPending || runAllMut.isPending || runOneMut.isPending || validateMut.isPending;

  // ── Derived state ──────────────────────────────────────────────────

  const step1Done = Boolean(testCategory);
  const step2Done = generatedProducts.length > 0;
  const step3Done = runResults.length > 0;
  const step4Done = Boolean(validationResult);

  const groupedProducts = generatedProducts.reduce<Record<string, TestCase[]>>((acc, tc) => {
    const cat = tc.category || 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(tc);
    return acc;
  }, {});

  function getRunResult(testCaseId: number): RunResultItem | undefined {
    return runResults.find((r) => r.testCase?.id === testCaseId);
  }

  function getScenarioChecks(testCaseId: number): import('./types.ts').ValidationCheck[] {
    return validationResult?.results.filter(r => r.testCaseId === testCaseId) || [];
  }

  // Section pass counts
  function sectionStats(tests: TestCase[]): { pass: number; total: number } {
    let pass = 0;
    let total = 0;
    for (const tc of tests) {
      const checks = getScenarioChecks(tc.id);
      if (checks.length === 0) continue;
      total += checks.length;
      pass += checks.filter(c => c.pass).length;
    }
    return { pass, total };
  }

  // ── Error display ──────────────────────────────────────────────────

  const error = createMut.error || generateMut.error || runAllMut.error || validateMut.error || deleteMut.error;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-5 max-w-[1440px] mx-auto">
      {/* Workflow Bar */}
      <WorkflowBar
        testCategory={testCategory}
        step1Done={step1Done}
        step2Done={step2Done}
        step3Done={step3Done}
        step4Done={step4Done}
        scenarioCount={generatedProducts.length}
        isRunning={isRunning}
        aiReview={aiReview}
        onAiToggle={() => setAiReview(prev => !prev)}
        onCreate={() => createMut.mutate()}
        onGenerate={() => generateMut.mutate()}
        onRunAll={() => runAllMut.mutate()}
        onValidate={() => validateMut.mutate()}
        onWipeAll={() => {
          if (confirm(`Wipe all test data for ${testCategory}? This deletes all artifacts and resets to step 1.`)) {
            deleteMut.mutate();
          }
        }}
        createPending={createMut.isPending}
        generatePending={generateMut.isPending}
        runPending={runAllMut.isPending}
        validatePending={validateMut.isPending}
        runProgress={runProgress}
        importSteps={importSteps}
        validationSummary={validationResult?.summary ?? null}
      />

      {/* Error */}
      {error && (
        <div className="sf-status sf-status-danger text-sm">{error.message}</div>
      )}

      {/* Summary Strip */}
      {step3Done && (
        <SummaryStrip
          validationResult={validationResult}
          contractSummary={contractData?.summary ?? null}
          runResults={runResults}
          scenarioCount={generatedProducts.length}
        />
      )}

      {/* Coverage Matrices */}
      {contractData?.matrices && (
        <CoverageMatrices
          matrices={contractData.matrices}
          validationResult={validationResult}
          collapsed={matrixCollapsed}
          onToggle={toggleMatrix}
          summaryLine={contractData.summary
            ? `${contractData.summary.fieldCount} fields, ${contractData.summary.componentTypes?.length || 0} component types, ${contractData.summary.knownValuesCatalogs?.length || 0} enum catalogs`
            : undefined}
        />
      )}

      {/* Repair Lifecycle Proof */}
      {step3Done && <RepairLifecycleProof runResults={runResults} />}

      {/* Validation Dimension Matrix */}
      {contractData?.scenarioDefs && (
        <DimensionMatrix
          scenarioDefs={contractData.scenarioDefs}
          validationResult={validationResult}
        />
      )}

      {/* Scenario Sections */}
      {generatedProducts.length > 0 && Object.entries(groupedProducts).map(([cat, tests]) => {
        const stats = sectionStats(tests);
        return (
          <div key={cat}>
            {/* Section header */}
            <div className="flex items-center gap-2.5 mb-3 pb-2.5 border-b sf-border-default">
              <h2 className="text-[15px] font-semibold sf-text-primary">{cat}</h2>
              {stats.total > 0 && (
                <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold ${sectionBadgeClass(stats.pass, stats.total)}`}>
                  {stats.pass}/{stats.total} checks
                </span>
              )}
            </div>

            {/* Scenario cards */}
            <div className="space-y-3">
              {tests.map(tc => (
                <ScenarioCard
                  key={tc.id}
                  testCase={tc}
                  runResult={getRunResult(tc.id)}
                  checks={getScenarioChecks(tc.id)}
                  testCategory={testCategory}
                  isRunning={isRunning}
                  activeProductId={activeProductId}
                  repairProgress={repairProgressMap[getRunResult(tc.id)?.productId ?? tc.productId ?? ''] ?? null}
                  onRunOne={(pid) => runOneMut.mutate(pid)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
