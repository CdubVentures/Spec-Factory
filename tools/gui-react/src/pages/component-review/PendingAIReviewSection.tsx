import type { QueryClient } from '@tanstack/react-query';
import { DrawerSection } from '../../shared/ui/overlay/DrawerShell.tsx';
import { useRunComponentReviewBatchMutation } from '../../hooks/useRunComponentReviewBatchMutation.ts';
import type { ComponentReviewFlaggedItem } from '../../types/componentReview.ts';

interface PendingAIReviewSectionProps {
  items: ComponentReviewFlaggedItem[];
  pendingCandidateCount?: number;
  category: string;
  queryClient: QueryClient;
}

export function PendingAIReviewSection({ items, pendingCandidateCount, category, queryClient }: PendingAIReviewSectionProps) {
  const batchMut = useRunComponentReviewBatchMutation({
    category,
    queryClient,
  });

  if (items.length === 0) return null;

  return (
    <DrawerSection title="Pending AI Review">
      <div
        className="px-3 py-2 rounded text-xs space-y-2"
        style={{
          background: 'var(--sf-token-state-timeout-bg)',
          border: '1px solid var(--sf-token-state-timeout-border)',
          color: 'var(--sf-token-state-timeout-fg)',
        }}
      >
        <div className="font-medium">
          {items.length} item{items.length !== 1 ? 's' : ''} awaiting AI confirmation
        </div>
        {Number.isFinite(Number(pendingCandidateCount)) && Number(pendingCandidateCount) > 0 && (
          <div className="text-[10px] opacity-80">
            {Number(pendingCandidateCount)} candidate{Number(pendingCandidateCount) !== 1 ? 's' : ''} currently require confirm actions
          </div>
        )}
        <div className="space-y-2">
          {items.slice(0, 8).map((item) => (
            <div
              key={item.review_id}
              className="space-y-0.5 pb-1 last:border-0"
              style={{ borderBottom: '1px solid var(--sf-token-state-timeout-border)' }}
            >
              <div className="flex items-center gap-2 text-[10px]">
                <span className="font-mono font-medium truncate">{item.raw_query}</span>
                <span
                  className="px-1 py-0.5 rounded"
                  style={{ background: 'var(--sf-token-state-timeout-border)' }}
                >
                  {item.match_type === 'fuzzy_flagged' ? `${Math.round(item.combined_score * 100)}%` : 'new'}
                </span>
                {item.matched_component && (
                  <span className="opacity-70 truncate">→ {item.matched_component}</span>
                )}
              </div>
              {item.product_id && (
                <div className="text-[9px] opacity-70">product: {item.product_id}</div>
              )}
              {item.alternatives && item.alternatives.length > 0 && (
                <div className="text-[9px] opacity-70">
                  alternatives: {item.alternatives.slice(0, 3).map((a) => `${a.canonical_name} (${Math.round(a.score * 100)}%)`).join(', ')}
                </div>
              )}
              {item.product_attributes && Object.keys(item.product_attributes).length > 0 && (
                <div className="text-[9px] opacity-70 truncate" title={JSON.stringify(item.product_attributes)}>
                  attrs: {Object.entries(item.product_attributes).slice(0, 4).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')}
                </div>
              )}
            </div>
          ))}
          {items.length > 8 && (
            <div className="text-[10px] opacity-70">+{items.length - 8} more</div>
          )}
        </div>
        <button
          onClick={() => batchMut.mutate()}
          disabled={batchMut.isPending}
          className="w-full px-2 py-1.5 text-[11px] font-medium rounded text-white hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--sf-token-state-timeout-fg)' }}
        >
          {batchMut.isPending ? 'Running AI Review...' : `Run AI Review (${items.length})`}
        </button>
      </div>
    </DrawerSection>
  );
}
