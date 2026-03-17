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
          className="sf-card text-center py-8"
          style={{ color: 'var(--sf-muted)' }}
        >
          <p className="sf-text-label">No models registered across any provider.</p>
        </div>
      ) : (
        <div className="sf-table-wrap">
          <table className="sf-table">
            <thead>
              <tr>
                <th className="sf-table-th">Provider</th>
                <th className="sf-table-th">Model ID</th>
                <th className="sf-table-th">Role</th>
                <th className="sf-table-th">Ctx Tokens</th>
                <th className="sf-table-th">Out Tokens</th>
                <th className="sf-table-th">In $/1M</th>
                <th className="sf-table-th">Out $/1M</th>
                <th className="sf-table-th">Cache $/1M</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => {
                return (
                  <tr key={`${entry.providerId}-${entry.modelId}-${idx}`}>
                    <td className="sf-table-cell">{entry.providerName || '--'}</td>
                    <td className="sf-table-cell">
                      <span className="font-medium">{entry.modelId}</span>
                    </td>
                    <td className="sf-table-cell">
                      <ModelRoleBadge role={entry.role} />
                    </td>
                    <td className="sf-table-cell">{formatTokens(entry.maxContextTokens)}</td>
                    <td className="sf-table-cell">{formatTokens(entry.maxOutputTokens)}</td>
                    <td className="sf-table-cell">{formatCost(entry.costInputPer1M)}</td>
                    <td className="sf-table-cell">{formatCost(entry.costOutputPer1M)}</td>
                    <td className="sf-table-cell">{formatCost(entry.costCachedPer1M)}</td>
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
