import { memo, useMemo } from 'react';
import type { LlmProviderEntry, LlmProviderModel } from '../types/llmProviderRegistryTypes';
import { ModelRoleBadge } from '../components/ModelRoleBadge';

interface FlatModel extends LlmProviderModel {
  providerName: string;
  providerEnabled: boolean;
}

function flattenModels(registry: LlmProviderEntry[]): FlatModel[] {
  const rows: FlatModel[] = [];
  for (const provider of registry) {
    for (const model of provider.models) {
      rows.push({
        ...model,
        providerName: provider.name,
        providerEnabled: provider.enabled,
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
    <div className="sf-table-wrap">
      <table className="sf-table">
        <thead>
          <tr>
            <th className="sf-table-th">Provider</th>
            <th className="sf-table-th">Model ID</th>
            <th className="sf-table-th">Role</th>
            <th className="sf-table-th">In $/1M</th>
            <th className="sf-table-th">Out $/1M</th>
            <th className="sf-table-th">Cache $/1M</th>
            <th className="sf-table-th">Max Context</th>
            <th className="sf-table-th">Max Output</th>
          </tr>
        </thead>
        <tbody>
          {allModels.map((m) => {
            return (
              <tr
                key={`${m.providerName}-${m.id}`}
                style={{ opacity: m.providerEnabled ? 1 : 0.45 }}
              >
                <td className="sf-table-cell">
                  <span className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
                    {m.providerName || '—'}
                  </span>
                </td>
                <td className="sf-table-cell">
                  <span className="sf-text-label font-medium">{m.modelId}</span>
                </td>
                <td className="sf-table-cell">
                  <ModelRoleBadge role={m.role} />
                </td>
                <td className="sf-table-cell sf-text-caption">{formatCost(m.costInputPer1M)}</td>
                <td className="sf-table-cell sf-text-caption">{formatCost(m.costOutputPer1M)}</td>
                <td className="sf-table-cell sf-text-caption">{formatCost(m.costCachedPer1M)}</td>
                <td className="sf-table-cell sf-text-caption">{formatTokens(m.maxContextTokens)}</td>
                <td className="sf-table-cell sf-text-caption">{formatTokens(m.maxOutputTokens)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
