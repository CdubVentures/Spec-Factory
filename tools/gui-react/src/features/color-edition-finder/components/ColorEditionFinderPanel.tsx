import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { useRuntimeSettingsValueStore } from '../../../stores/runtimeSettingsValueStore.ts';
import { resolvePhaseModel } from '../../llm-config/state/llmPhaseOverridesBridge.generated.ts';
import type { GlobalDraftSlice } from '../../llm-config/state/llmPhaseOverridesBridge.generated.ts';
import type { LlmPhaseOverrides } from '../../llm-config/types/llmPhaseOverrideTypes.generated.ts';
import { assembleLlmPolicyFromFlat } from '../../llm-config/state/llmPolicyAdapter.generated.ts';
import { useColorEditionFinderQuery, useColorEditionFinderRunMutation } from '../api/colorEditionFinderQueries.ts';
import {
  deriveFinderKpiCards,
  deriveCooldownState,
  deriveColorTableRows,
  deriveEditionTableRows,
  deriveFinderStatusChip,
} from '../selectors/colorEditionFinderSelectors.ts';
import type { ColorRegistryEntry } from '../types.ts';

interface ColorEditionFinderPanelProps {
  readonly productId: string;
  readonly category: string;
}

function useResolvedFinderModel() {
  const storeValues = useRuntimeSettingsValueStore((s) => s.values);
  return useMemo(() => {
    if (!storeValues) return null;
    const policy = assembleLlmPolicyFromFlat(storeValues as Record<string, unknown>);
    const globalDraft: GlobalDraftSlice = {
      llmModelPlan: policy.models?.plan ?? '',
      llmModelReasoning: policy.models?.reasoning ?? '',
      llmPlanUseReasoning: policy.reasoning?.enabled ?? false,
      llmMaxOutputTokensPlan: policy.tokens?.plan ?? 0,
      llmMaxOutputTokensTriage: policy.tokens?.triage ?? 0,
      llmTimeoutMs: policy.timeoutMs ?? 0,
      llmMaxTokens: policy.tokens?.maxTokens ?? 0,
    };
    const overrides: LlmPhaseOverrides = (policy.phaseOverrides ?? {}) as LlmPhaseOverrides;
    return resolvePhaseModel(overrides, 'colorFinder', globalDraft);
  }, [storeValues]);
}

export function ColorEditionFinderPanel({ productId, category }: ColorEditionFinderPanelProps) {
  const [collapsed, toggleCollapsed] = usePersistedToggle(`indexing:finder:collapsed:${productId}`, false);

  const { data: result = null } = useColorEditionFinderQuery(category, productId);
  const runMut = useColorEditionFinderRunMutation(category, productId);
  const resolvedModel = useResolvedFinderModel();

  const { data: colorRegistry = [] } = useQuery<ColorRegistryEntry[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<ColorRegistryEntry[]>('/colors'),
  });

  if (!productId || !category) return null;

  const statusChip = deriveFinderStatusChip(result);
  const kpiCards = deriveFinderKpiCards(result);
  const cooldown = deriveCooldownState(result);
  const colorRows = deriveColorTableRows(result, colorRegistry);
  const editionRows = deriveEditionTableRows(result);

  const modelDisplay = resolvedModel?.effectiveModel || 'not configured';
  const webSearchEnabled = resolvedModel?.webSearch ?? false;

  // Mutation status for header display
  const runStatus = runMut.isPending ? 'running'
    : runMut.isError ? 'error'
    : runMut.isSuccess ? 'success'
    : 'idle';

  return (
    <div className="sf-surface-elevated sf-border-soft" style={{ borderRadius: 6, marginBottom: 16, border: '1px solid var(--sf-border-soft, #243a65)' }}>
      {/* Header */}
      <div
        onClick={toggleCollapsed}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 20px', cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--sf-border-soft, #243a65)',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--sf-text-dim, #6b7fa0)', transition: 'transform 0.2s', transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
          &#9654;
        </span>
        <span style={{ fontSize: 13, fontWeight: 700 }}>Color & Edition Finder</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Status chip */}
          {runStatus === 'running' ? (
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', padding: '3px 10px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(216,180,254,0.12)', color: 'var(--sf-purple, #d8b4fe)', animation: 'pulse 1.5s infinite' }}>
              &#9679; Running
            </span>
          ) : runStatus === 'error' ? (
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', padding: '3px 10px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em', background: 'rgba(248,113,113,0.12)', color: 'var(--sf-danger, #f87171)' }}>
              &#9679; Failed
            </span>
          ) : (
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'monospace', padding: '3px 10px', borderRadius: 4, textTransform: 'uppercase', letterSpacing: '0.06em', background: statusChip.tone === 'success' ? 'rgba(134,239,172,0.12)' : 'rgba(107,127,160,0.12)', color: statusChip.tone === 'success' ? 'var(--sf-success, #86efac)' : 'var(--sf-text-subtle, #94a3b8)' }}>
              &#9679; {statusChip.label}
            </span>
          )}

          {/* Model badge */}
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--sf-purple, #d8b4fe)' }}>
            {modelDisplay}
          </span>

          {/* Web search badge */}
          {webSearchEnabled && (
            <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace', padding: '2px 7px', borderRadius: 3, textTransform: 'uppercase', letterSpacing: '0.04em', background: 'rgba(94,234,212,0.12)', color: 'var(--sf-teal, #5eead4)' }}>
              Web
            </span>
          )}

          {/* Run button */}
          <button
            onClick={(e) => { e.stopPropagation(); runMut.mutate(); }}
            disabled={runMut.isPending}
            style={{
              fontSize: 10, fontWeight: 700, fontFamily: 'monospace',
              padding: '5px 12px', borderRadius: 6, border: '1px solid var(--sf-accent, #6366f1)',
              background: runMut.isPending ? 'rgba(99,102,241,0.3)' : 'var(--sf-accent, #6366f1)', color: '#fff',
              cursor: runMut.isPending ? 'wait' : 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em',
            }}
          >
            {runMut.isPending ? 'Running...' : 'Run Now'}
          </button>
        </span>
      </div>

      {/* Body */}
      {!collapsed && (
        <div style={{ padding: 20 }}>
          {!result ? (
            <div style={{ textAlign: 'center', padding: '32px 20px', color: 'var(--sf-text-dim, #6b7fa0)', fontSize: 12, fontStyle: 'italic' }}>
              No color or edition data yet. Click <strong>Run Now</strong> to discover variants.
            </div>
          ) : (
            <>
              {/* KPI Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 16 }}>
                {kpiCards.map(card => (
                  <div key={card.label} style={{
                    background: 'var(--sf-surface-panel, #0d1834)', border: '1px solid var(--sf-border-soft, #243a65)',
                    borderRadius: 6, padding: '12px 14px', borderTop: `3px solid var(--sf-${card.tone}, #6366f1)`,
                  }}>
                    <div style={{ fontSize: card.label === 'Cooldown' ? 15 : 26, fontWeight: 700, fontFamily: 'monospace', fontVariantNumeric: 'tabular-nums', color: `var(--sf-${card.tone}, #6366f1)` }}>
                      {card.value}
                    </div>
                    <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--sf-text-muted, #adc2eb)', marginTop: 2 }}>
                      {card.label}
                    </div>
                  </div>
                ))}
              </div>

              {/* Cooldown Strip */}
              {result.run_count > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', marginBottom: 16,
                  background: 'var(--sf-surface-panel, #0d1834)', border: '1px solid var(--sf-border-soft, #243a65)', borderRadius: 4,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sf-text-dim, #6b7fa0)', whiteSpace: 'nowrap' }}>Cooldown</span>
                  <div style={{ flex: 1, height: 5, background: 'rgba(107,127,160,0.12)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, width: `${cooldown.progressPct}%`, background: cooldown.onCooldown ? 'var(--sf-warning, #fcd34d)' : 'var(--sf-success, #86efac)' }} />
                  </div>
                  {cooldown.onCooldown && (
                    <>
                      <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace', color: 'var(--sf-warning, #fcd34d)' }}>
                        {cooldown.daysRemaining}d
                      </span>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--sf-text-subtle, #94a3b8)', whiteSpace: 'nowrap' }}>
                        Eligible: {cooldown.eligibleDate}
                      </span>
                    </>
                  )}
                  {!cooldown.onCooldown && result.run_count > 0 && (
                    <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'monospace', color: 'var(--sf-success, #86efac)' }}>
                      Ready
                    </span>
                  )}
                </div>
              )}

              {/* Colors Table */}
              {colorRows.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(36,58,101,0.5)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Colors</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--sf-text-subtle, #94a3b8)' }}>{colorRows.length} variants</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['Color', 'Hex', 'Run', 'Discovered', 'Model'].map(h => (
                          <th key={h} style={{ textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sf-text-dim, #6b7fa0)', padding: '7px 14px', background: 'var(--sf-surface-panel, #0d1834)', borderBottom: '1px solid var(--sf-border-soft, #243a65)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {colorRows.map(row => (
                        <tr key={row.name} style={{ borderBottom: '1px solid rgba(36,58,101,0.3)' }}>
                          <td style={{ padding: '9px 14px', color: 'var(--sf-text-muted, #adc2eb)' }}>
                            {row.hex && <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 3, border: '1px solid rgba(255,255,255,0.12)', verticalAlign: 'middle', marginRight: 8, backgroundColor: row.hex }} />}
                            <span style={{ fontWeight: 600, color: 'var(--sf-text-primary, #ecf1ff)', fontSize: 12 }}>{row.name}</span>
                            {row.isDefault && <span style={{ fontSize: 8, fontWeight: 700, background: 'rgba(99,102,241,0.15)', color: 'var(--sf-accent-strong, #818cf8)', padding: '1px 5px', borderRadius: 3, marginLeft: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Default</span>}
                          </td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 10, color: 'var(--sf-text-subtle, #94a3b8)' }}>{row.hex}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 10, fontWeight: 600, color: 'var(--sf-accent-strong, #818cf8)' }}>{row.foundRun}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 10, color: 'var(--sf-text-subtle, #94a3b8)' }}>{row.foundAt}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 10, color: 'var(--sf-purple, #d8b4fe)' }}>{row.model}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Editions Table */}
              {editionRows.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid rgba(36,58,101,0.5)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>Editions</span>
                    <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--sf-text-subtle, #94a3b8)' }}>{editionRows.length} edition{editionRows.length !== 1 ? 's' : ''}</span>
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['Edition', 'Run', 'Discovered', 'Model'].map(h => (
                          <th key={h} style={{ textAlign: 'left', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--sf-text-dim, #6b7fa0)', padding: '7px 14px', background: 'var(--sf-surface-panel, #0d1834)', borderBottom: '1px solid var(--sf-border-soft, #243a65)' }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {editionRows.map(row => (
                        <tr key={row.slug} style={{ borderBottom: '1px solid rgba(36,58,101,0.3)' }}>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontWeight: 600, color: 'var(--sf-text-primary, #ecf1ff)', fontSize: 12 }}>{row.slug}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 10, fontWeight: 600, color: 'var(--sf-accent-strong, #818cf8)' }}>{row.foundRun}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 10, color: 'var(--sf-text-subtle, #94a3b8)' }}>{row.foundAt}</td>
                          <td style={{ padding: '9px 14px', fontFamily: 'monospace', fontSize: 10, color: 'var(--sf-purple, #d8b4fe)' }}>{row.model}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer */}
              <div style={{ display: 'flex', gap: 12, paddingTop: 12, borderTop: '1px solid rgba(36,58,101,0.4)', fontSize: 10, color: 'var(--sf-text-dim, #6b7fa0)', alignItems: 'center' }}>
                <span>Last run: <strong style={{ color: 'var(--sf-text-subtle, #94a3b8)' }}>{result.last_ran_at?.split('T')[0] ?? '--'}</strong></span>
                <span>&middot;</span>
                <span>Model: <strong style={{ color: 'var(--sf-purple, #d8b4fe)' }}>{modelDisplay}</strong></span>
                <span>&middot;</span>
                <span>Runs: <strong style={{ color: 'var(--sf-text-subtle, #94a3b8)' }}>{result.run_count}</strong></span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
