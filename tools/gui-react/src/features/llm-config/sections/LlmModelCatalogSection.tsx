import { memo, useMemo } from 'react';
import type { LlmProviderEntry } from '../types/llmProviderRegistryTypes';
import { buildModelCatalogEntries } from '../state/llmModelCatalog';
import type { ModelPricingEntry, ModelTokenProfileEntry } from '../state/llmModelCatalog';
import { ModelRoleBadge } from '../components/ModelRoleBadge';

const tokenFormatter = new Intl.NumberFormat('en-US');

function formatTokens(value: number | null): string {
  if (value == null) return '--';
  return tokenFormatter.format(value);
}

function formatCost(value: number): string {
  return `$${value.toFixed(2)}`;
}

interface LlmModelCatalogSectionProps {
  registry: LlmProviderEntry[];
  flatModelOptions: readonly string[];
  modelPricing?: ModelPricingEntry[];
  modelTokenProfiles?: ModelTokenProfileEntry[];
}

export const LlmModelCatalogSection = memo(function LlmModelCatalogSection({
  registry,
  flatModelOptions,
  modelPricing,
  modelTokenProfiles,
}: LlmModelCatalogSectionProps) {
  const entries = useMemo(
    () => buildModelCatalogEntries({ registry, flatModelOptions, modelPricing, modelTokenProfiles }),
    [registry, flatModelOptions, modelPricing, modelTokenProfiles],
  );

  return (
    <section className="sf-section">
      <div className="sf-section-header">
        <h3 className="sf-section-title">Model Catalog</h3>
      </div>

      {entries.length === 0 ? (
        <div
          className="sf-surface-card text-center"
          style={{ padding: 'var(--sf-space-8)', color: 'var(--sf-muted)' }}
        >
          <p className="sf-text-label">No models registered across any provider.</p>
        </div>
      ) : (
        <div className="sf-table-shell" style={{ overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead className="sf-table-head">
              <tr>
                <th className="sf-table-head-cell">Provider</th>
                <th className="sf-table-head-cell">Model ID</th>
                <th className="sf-table-head-cell">Role</th>
                <th className="sf-table-head-cell">Ctx Tokens</th>
                <th className="sf-table-head-cell">Out Tokens</th>
                <th className="sf-table-head-cell">In $/1M</th>
                <th className="sf-table-head-cell">Out $/1M</th>
                <th className="sf-table-head-cell">Cache $/1M</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => {
                return (
                  <tr key={`${entry.providerId}-${entry.modelId}-${idx}`} className="sf-table-row">
                    <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{entry.providerName || '--'}</td>
                    <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>
                      <span className="font-medium">{entry.modelId}</span>
                    </td>
                    <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>
                      <ModelRoleBadge role={entry.role} />
                    </td>
                    <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{formatTokens(entry.maxContextTokens)}</td>
                    <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{formatTokens(entry.maxOutputTokens)}</td>
                    <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{formatCost(entry.costInputPer1M)}</td>
                    <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{formatCost(entry.costOutputPer1M)}</td>
                    <td style={{ padding: 'var(--sf-space-1-5) var(--sf-space-2)' }}>{formatCost(entry.costCachedPer1M)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});
