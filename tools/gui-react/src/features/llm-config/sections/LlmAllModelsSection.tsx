import { memo, useMemo } from 'react';
import type { LlmProviderEntry, LlmProviderModel } from '../types/llmProviderRegistryTypes.ts';
import { ModelRoleBadge } from '../components/ModelRoleBadge.tsx';

interface FlatModel extends LlmProviderModel {
  providerName: string;
}

function flattenModels(registry: LlmProviderEntry[]): FlatModel[] {
  const rows: FlatModel[] = [];
  for (const provider of registry) {
    for (const model of provider.models) {
      rows.push({
        ...model,
        providerName: provider.name,
      });
    }
  }
  return rows;
}

function formatTokens(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('en-US');
}

function formatCost(value: number): string {
  return `$${value}`;
}

interface LlmAllModelsSectionProps {
  registry: LlmProviderEntry[];
}

export const LlmAllModelsSection = memo(function LlmAllModelsSection({
  registry,
}: LlmAllModelsSectionProps) {
  const allModels = useMemo(() => flattenModels(registry), [registry]);

  if (allModels.length === 0) {
    return (
      <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
        No models registered. Add models inside a provider above.
      </p>
    );
  }

  return (
    <div className="sf-table-shell" style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead className="sf-table-head">
          <tr>
            <th className="sf-table-head-cell">Provider</th>
            <th className="sf-table-head-cell">Model ID</th>
            <th className="sf-table-head-cell">Role</th>
            <th className="sf-table-head-cell">In $/1M</th>
            <th className="sf-table-head-cell">Out $/1M</th>
            <th className="sf-table-head-cell">Cache $/1M</th>
            <th className="sf-table-head-cell">Think</th>
            <th className="sf-table-head-cell">Effort</th>
            <th className="sf-table-head-cell">Web</th>
            <th className="sf-table-head-cell">Max Context</th>
            <th className="sf-table-head-cell">Max Output</th>
          </tr>
        </thead>
        <tbody>
          {allModels.map((m) => {
            return (
              <tr
                key={`${m.providerName}-${m.id}`}
                className="sf-table-row"
              >
                <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>
                  <span className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
                    {m.providerName || '—'}
                  </span>
                </td>
                <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>
                  <span className="sf-text-caption font-medium">{m.modelId}</span>
                </td>
                <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>
                  <ModelRoleBadge role={m.role} />
                </td>
                <td className="sf-text-caption" style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{formatCost(m.costInputPer1M)}</td>
                <td className="sf-text-caption" style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{formatCost(m.costOutputPer1M)}</td>
                <td className="sf-text-caption" style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{formatCost(m.costCachedPer1M)}</td>
                <td className="sf-text-caption" style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)', textAlign: 'center' }}>{m.thinking ? '\u2713' : '\u2014'}</td>
                <td className="sf-text-caption" style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)', textAlign: 'center', fontSize: 'var(--sf-token-font-size-micro)' }}>{m.thinkingEffortOptions?.join(', ') || '\u2014'}</td>
                <td className="sf-text-caption" style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)', textAlign: 'center' }}>{m.webSearch ? '\u2713' : '\u2014'}</td>
                <td className="sf-text-caption" style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{formatTokens(m.maxContextTokens)}</td>
                <td className="sf-text-caption" style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{formatTokens(m.maxOutputTokens)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
