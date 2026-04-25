import { usePersistedToggle } from '../../stores/collapseStore.ts';
import type { LinkedProduct } from '../../types/componentReview.ts';

interface CatalogEntry {
  productId: string;
  brand: string;
  base_model: string;
  model: string;
}

interface LinkedProductsListProps {
  /** Array of linked product entries from the API */
  products: LinkedProduct[];
  /** Header label context — displayed in the section header */
  headerLabel: string;
  /** Optional catalog for resolving brand/model from productId */
  catalog?: CatalogEntry[];
  /** Max height of the scrollable list in px (default: 200) */
  maxHeight?: number;
  /** Start in expanded state (default: false) */
  defaultExpanded?: boolean;
  /** Storage key for persisting expand state */
  storageKey?: string;
}

function resolveDisplay(
  productId: string,
  catalogMap: Map<string, CatalogEntry>,
): { brand: string; model: string } {
  const entry = catalogMap.get(productId);
  if (entry) return { brand: entry.brand, model: entry.base_model };
  return { brand: '', model: productId };
}

export function LinkedProductsList({ products, headerLabel, catalog, maxHeight = 200, defaultExpanded = false, storageKey }: LinkedProductsListProps) {
  const resolvedKey = storageKey || `componentReview:linkedProducts:${headerLabel}`;
  const [expanded, toggleExpanded] = usePersistedToggle(resolvedKey, defaultExpanded);

  if (!products || products.length === 0) return null;

  const catalogMap = new Map<string, CatalogEntry>();
  if (catalog) {
    for (const c of catalog) catalogMap.set(c.productId, c);
  }

  return (
    <div className="mt-2">
      <button
        onClick={toggleExpanded}
        className="sf-icon-button w-full flex items-center justify-between px-2 py-1.5 text-[11px] font-medium sf-text-muted border sf-border-default rounded transition-colors"
      >
        <span className="truncate">
          Linked Products{headerLabel ? ` by ${headerLabel}` : ''}{' '}
          <span className="sf-status-text-muted">({products.length})</span>
        </span>
        <span className="flex-shrink-0 ml-1 text-[10px] sf-status-text-muted">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && (
        <div
          className="mt-1 border sf-border-default rounded overflow-y-auto"
          style={{ maxHeight }}
        >
          <table className="w-full text-[10px]">
            <thead className="sf-table-head sticky top-0">
              <tr className="text-left sf-status-text-muted">
                <th className="px-2 py-1 font-medium">Brand</th>
                <th className="px-2 py-1 font-medium">Model</th>
                {products.some(p => p.match_type) && (
                  <th className="px-2 py-1 font-medium text-right">Match</th>
                )}
              </tr>
            </thead>
            <tbody>
              {products.map((p, i) => {
                const { brand, model } = resolveDisplay(p.product_id, catalogMap);
                return (
                  <tr
                    key={`${p.product_id}-${i}`}
                    className="sf-row-hoverable"
                  >
                    <td className="px-2 py-1 font-medium sf-text-primary whitespace-nowrap">
                      {brand || <span className="sf-status-text-muted italic">—</span>}
                    </td>
                    <td className="px-2 py-1 sf-text-muted truncate max-w-[160px]" title={model}>
                      {model}
                    </td>
                    {products.some(pp => pp.match_type) && (
                      <td className="px-2 py-1 text-right whitespace-nowrap">
                        {p.match_type && (
                          <span className={`inline-block px-1 py-0.5 rounded text-[9px] font-medium ${
                            p.match_type === 'exact'
                              ? 'sf-chip-success'
                              : p.match_type === 'alias'
                                ? 'sf-chip-info'
                                : 'sf-chip-warning'
                          }`}>
                            {p.match_type}
                            {p.match_score != null ? ` ${Math.round(p.match_score * 100)}%` : ''}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
