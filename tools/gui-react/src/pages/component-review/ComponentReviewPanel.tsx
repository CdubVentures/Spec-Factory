import { usePersistedToggle } from '../../stores/collapseStore';
import { useQuery, useMutation, type QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ActionTooltip } from '../../shared/ui/feedback/ActionTooltip';
import type {
  ComponentReviewFlaggedItem,
  ComponentReviewDocument,
  ComponentReviewBatchResult,
} from '../../types/componentReview';

interface ComponentReviewPanelProps {
  category: string;
  queryClient: QueryClient;
  componentType?: string;
}

function statusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'pending_ai':
      return { label: 'Pending AI', className: 'sf-chip-accent' };
    case 'accepted_alias':
      return { label: 'Alias Added', className: 'sf-chip-success' };
    case 'pending_human':
      return { label: 'Needs Review', className: 'sf-chip-warning' };
    case 'approved_new':
      return { label: 'Approved', className: 'sf-chip-info' };
    case 'rejected_ai':
      return { label: 'Rejected', className: 'sf-chip-danger' };
    case 'dismissed':
      return { label: 'Dismissed', className: 'sf-chip-neutral' };
    default:
      return { label: status, className: 'sf-chip-neutral' };
  }
}

function ScoreBar({ score, label }: { score: number; label: string }) {
  const pct = Math.round(score * 100);
  const color = pct >= 90 ? 'sf-meter-fill-success' : pct >= 70 ? 'sf-meter-fill-warning' : 'sf-meter-fill-danger';

  return (
    <div className="flex items-center gap-1.5">
      <span className="sf-text-nano sf-text-muted w-14 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 sf-meter-track rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="sf-text-nano sf-text-subtle w-8 text-right">{pct}%</span>
    </div>
  );
}

function ReviewItemCard({
  item,
  onAction,
  isPending,
}: {
  item: ComponentReviewFlaggedItem;
  onAction: (reviewId: string, action: string, mergeTarget?: string) => void;
  isPending: boolean;
}) {
  const badge = statusBadge(item.status);

  return (
    <div className="sf-surface-elevated rounded p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{item.raw_query}</span>
          <span className={`px-1.5 py-0.5 rounded sf-text-nano font-medium ${badge.className}`}>
            {badge.label}
          </span>
          <span className="sf-text-nano sf-text-subtle">{item.component_type}</span>
        </div>
        {item.matched_component && (
          <span className="sf-text-nano sf-text-muted">
            Candidate: <span className="font-mono">{item.matched_component}</span>
          </span>
        )}
      </div>

      <div className="space-y-0.5">
        <ScoreBar score={item.name_score} label="Name" />
        <ScoreBar score={item.property_score} label="Props" />
        <ScoreBar score={item.combined_score} label="Combined" />
      </div>

      {item.alternatives && item.alternatives.length > 0 && (
        <div className="sf-text-nano sf-text-subtle">
          Alternatives: {item.alternatives.map((a) => `${a.canonical_name} (${Math.round(a.score * 100)}%)`).join(', ')}
        </div>
      )}

      {item.ai_decision && (
        <div className="sf-pre-block rounded p-2 text-xs space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">AI Decision:</span>
            <span className="font-mono">{item.ai_decision.decision}</span>
            <span className="sf-text-subtle">({Math.round(item.ai_decision.confidence * 100)}% confidence)</span>
          </div>
          {item.ai_decision.reasoning && <div className="sf-text-muted italic">{item.ai_decision.reasoning}</div>}
        </div>
      )}

      {item.status === 'pending_human' && (
        <div className="flex gap-2 pt-1">
          <ActionTooltip text="Approve this new component suggestion.">
            <button
              onClick={() => onAction(item.review_id, 'approve_new')}
              disabled={isPending}
              className="px-2 py-1 sf-text-nano font-medium rounded sf-primary-button disabled:opacity-50"
            >
              Approve New
            </button>
          </ActionTooltip>
          {item.matched_component && (
            <button
              onClick={() => onAction(item.review_id, 'merge_alias', item.matched_component!)}
              disabled={isPending}
              className="px-2 py-1 sf-text-nano font-medium rounded sf-action-button disabled:opacity-50"
            >
              Merge as Alias
            </button>
          )}
          <button
            onClick={() => onAction(item.review_id, 'dismiss')}
            disabled={isPending}
            className="px-2 py-1 sf-text-nano font-medium rounded sf-icon-button disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="sf-text-nano sf-text-subtle">
        Product: {item.product_id || 'unknown'} | Created: {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'unknown'}
      </div>
    </div>
  );
}

export function ComponentReviewPanel({ category, queryClient, componentType }: ComponentReviewPanelProps) {
  const [expanded, toggleExpanded] = usePersistedToggle('componentReview:panel:expanded', false);

  const reviewQuery = useQuery({
    queryKey: ['componentReview', category],
    queryFn: () => api.get<ComponentReviewDocument>(`/review-components/${category}/component-review`),
    staleTime: 30_000,
  });

  const actionMut = useMutation({
    mutationFn: (body: { review_id: string; action: string; merge_target?: string }) =>
      api.post(`/review-components/${category}/component-review-action`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReview', category] });
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category] });
    },
  });

  const batchMut = useMutation({
    mutationFn: () =>
      api.post<ComponentReviewBatchResult>(`/review-components/${category}/run-component-review-batch`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['componentReview', category] });
      queryClient.invalidateQueries({ queryKey: ['componentReviewData', category] });
    },
  });

  const allItems = reviewQuery.data?.items || [];
  const items = componentType ? allItems.filter((i) => i.component_type === componentType) : allItems;
  const pendingAI = items.filter((i) => i.status === 'pending_ai');
  const pendingHuman = items.filter((i) => i.status === 'pending_human');
  const acceptedAlias = items.filter((i) => i.status === 'accepted_alias');
  const rejected = items.filter((i) => i.status === 'rejected_ai' || i.status === 'dismissed');

  if (items.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="px-3 py-2 sf-surface-elevated flex items-center justify-between rounded">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">Component Review</span>
          {pendingAI.length > 0 && (
            <span className="px-2 py-0.5 rounded-full sf-text-nano font-medium sf-chip-accent">
              {pendingAI.length} pending AI
            </span>
          )}
          {pendingHuman.length > 0 && (
            <span className="px-2 py-0.5 rounded-full sf-text-nano font-medium sf-chip-warning">
              {pendingHuman.length} needs review
            </span>
          )}
          {acceptedAlias.length > 0 && (
            <span className="px-2 py-0.5 rounded-full sf-text-nano font-medium sf-chip-success">
              {acceptedAlias.length} auto-aliased
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pendingAI.length > 0 && (
            <ActionTooltip text="Run AI Review for all pending component matches in this panel.">
              <button
                onClick={() => batchMut.mutate()}
                disabled={batchMut.isPending}
                className="px-2 py-1 sf-text-nano font-medium rounded sf-run-ai-button disabled:opacity-50"
              >
                {batchMut.isPending ? 'Running...' : `Run AI Review All (${pendingAI.length})`}
              </button>
            </ActionTooltip>
          )}
          <button
            onClick={() => toggleExpanded()}
            className="px-2 py-1 sf-text-nano font-medium rounded sf-icon-button"
          >
            {expanded ? 'Hide Details' : 'Show Details'}
          </button>
        </div>
      </div>

      {batchMut.isSuccess && (
        <div className="px-3 py-1.5 sf-text-nano sf-callout sf-callout-success border-t-0 rounded-b">
          Batch complete: {(batchMut.data as ComponentReviewBatchResult)?.accepted_alias ?? 0} aliases added,{' '}
          {(batchMut.data as ComponentReviewBatchResult)?.pending_human ?? 0} need review,{' '}
          {(batchMut.data as ComponentReviewBatchResult)?.rejected ?? 0} rejected
        </div>
      )}

      {expanded && (
        <div className="p-3 space-y-3 max-h-[400px] overflow-y-auto border border-t-0 sf-border-default rounded-b">
          {pendingHuman.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold sf-status-text-warning">
                Needs Human Review ({pendingHuman.length})
              </div>
              {pendingHuman.map((item) => (
                <ReviewItemCard
                  key={item.review_id}
                  item={item}
                  onAction={(reviewId, action, mergeTarget) =>
                    actionMut.mutate({ review_id: reviewId, action, merge_target: mergeTarget })
                  }
                  isPending={actionMut.isPending}
                />
              ))}
            </div>
          )}

          {acceptedAlias.length > 0 && (
            <details>
              <summary className="text-xs font-semibold sf-status-text-success cursor-pointer">
                AI Added Aliases ({acceptedAlias.length})
              </summary>
              <div className="mt-2 space-y-1">
                {acceptedAlias.map((item) => (
                  <div key={item.review_id} className="sf-text-nano sf-text-muted flex items-center gap-2">
                    <span className="font-mono">{item.raw_query}</span>
                    <span className="sf-text-subtle">-&gt;</span>
                    <span className="font-mono">{item.matched_component}</span>
                    {item.ai_decision?.reasoning && (
                      <span className="italic sf-text-subtle truncate max-w-[300px]">{item.ai_decision.reasoning}</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {rejected.length > 0 && (
            <details>
              <summary className="text-xs font-semibold sf-text-subtle cursor-pointer">
                Rejected / Dismissed ({rejected.length})
              </summary>
              <div className="mt-2 space-y-1">
                {rejected.map((item) => (
                  <div key={item.review_id} className="sf-text-nano sf-text-subtle flex items-center gap-2">
                    <span className="font-mono">{item.raw_query}</span>
                    <span className={`px-1 py-0.5 rounded sf-text-nano ${statusBadge(item.status).className}`}>
                      {statusBadge(item.status).label}
                    </span>
                    {item.ai_decision?.reasoning && (
                      <span className="italic truncate max-w-[300px]">{item.ai_decision.reasoning}</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {pendingAI.length > 0 && pendingHuman.length === 0 && acceptedAlias.length === 0 && rejected.length === 0 && (
            <div className="sf-text-nano sf-text-subtle">
              {pendingAI.length} items waiting for AI review. Click &ldquo;Run AI Review All&rdquo; above to process.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
