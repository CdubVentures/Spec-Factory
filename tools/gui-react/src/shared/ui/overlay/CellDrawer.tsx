import type { ReactNode } from 'react';
import { pct } from '../../../utils/formatting.ts';
import { hasKnownValue } from '../../../utils/fieldNormalize.ts';
import { pullFormatDate } from '../../../utils/dateTime.ts';
import { Spinner } from '../feedback/Spinner.tsx';
import { ActionTooltip } from '../feedback/ActionTooltip.tsx';
import {
  DrawerShell,
  DrawerSection,
  DrawerCard,
  DrawerValueRow,
  DrawerBadges,
  DrawerManualOverride,
  DrawerActionStack,
} from './DrawerShell.tsx';
import type { ReviewCandidate } from '../../../types/review.ts';

// ── Shared sub-components ───────────────────────────────────────────

function extractHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${k}:${stableSerialize(v)}`).join(',')}}`;
  }
  return String(value ?? '');
}

function normalizeComparable(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).trim().toLowerCase();
  return stableSerialize(value).trim().toLowerCase();
}

function compactId(value: string, max = 28): string {
  const token = String(value || '').trim();
  if (!token) return '';
  if (token.length <= max) return token;
  const head = token.slice(0, Math.max(8, Math.floor((max - 3) / 2)));
  const tail = token.slice(-Math.max(6, Math.floor((max - 3) / 2)));
  return `${head}...${tail}`;
}

function isMeaningfulValue(value: unknown): boolean {
  return hasKnownValue(value);
}

function isActionableCandidate(candidate: ReviewCandidate | null | undefined): boolean {
  if (!candidate || candidate.is_synthetic_selected) return false;
  const candidateId = String(candidate.candidate_id || '').trim();
  return Boolean(candidateId) && isMeaningfulValue(candidate.value);
}

function SourceBadge({ candidate }: { candidate: ReviewCandidate }) {
  const tier = candidate.tier;
  const tierLabel = tier != null ? `T${tier}` : '';
  const tierColor = tier === 1
    ? 'sf-chip-success'
    : tier === 2
      ? 'sf-chip-info'
      : 'sf-chip-neutral';

  return (
    <div className="flex gap-1 items-center flex-wrap">
      {tierLabel && (
        <span className={`px-1.5 py-0 sf-text-nano rounded ${tierColor}`}>{tierLabel}</span>
      )}
      {candidate.source && (
        <span className="sf-text-nano sf-text-subtle">{candidate.source}</span>
      )}
      {candidate.method && (
        <span className="sf-text-nano sf-text-subtle">via {candidate.method}</span>
      )}
    </div>
  );
}

function EvidenceSnippet({ candidate }: { candidate: ReviewCandidate }) {
  const evidence = candidate.evidence;
  if (!evidence) return null;

  const snippetText = evidence.snippet_text || '';
  const quote = evidence.quote || '';
  const span = evidence.quote_span;
  const host = evidence.url ? extractHost(evidence.url) : '';

  let highlighted: ReactNode = snippetText;
  if (span && span.length === 2 && snippetText) {
    const [start, end] = span;
    const before = snippetText.slice(0, start);
    const match = snippetText.slice(start, end);
    const after = snippetText.slice(end);
    highlighted = (
      <>
        <span className="sf-evidence-context-text">{before}</span>
        <mark className="sf-evidence-highlight px-0.5 rounded">{match}</mark>
        <span className="sf-evidence-context-text">{after}</span>
      </>
    );
  } else if (quote && snippetText) {
    const index = snippetText.indexOf(quote);
    if (index >= 0) {
      const before = snippetText.slice(0, index);
      const after = snippetText.slice(index + quote.length);
      highlighted = (
        <>
          <span className="sf-evidence-context-text">{before}</span>
          <mark className="sf-evidence-highlight px-0.5 rounded">{quote}</mark>
          <span className="sf-evidence-context-text">{after}</span>
        </>
      );
    }
  }

  return (
    <div className="space-y-1.5 rounded p-2 sf-review-evidence-card">
      {evidence.url && (
        <div className="flex items-center gap-1.5">
          {host && <span className="sf-text-micro sf-evidence-context-text shrink-0">{host}</span>}
          <a
            href={evidence.url}
            target="_blank"
            rel="noreferrer"
            className="sf-review-link-accent hover:underline sf-text-caption truncate"
            title={evidence.url}
          >
            {evidence.url}
          </a>
        </div>
      )}
      {snippetText && (
        <div className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
          {highlighted}
        </div>
      )}
      {!snippetText && quote && (
        <div className="sf-text-caption leading-relaxed italic sf-review-evidence-quote">
          &ldquo;{quote}&rdquo;
        </div>
      )}
      <div className="flex gap-3 sf-text-nano sf-review-evidence-meta">
        {evidence.snippet_id && <span>snippet: {evidence.snippet_id.slice(0, 8)}</span>}
        {evidence.retrieved_at && <span>{pullFormatDate(evidence.retrieved_at)}</span>}
      </div>
    </div>
  );
}

// ── CellDrawer Props ────────────────────────────────────────────────

export interface CellDrawerProps {
  title: string;
  subtitle: string;
  onClose: () => void;

  // Section 1: Current accepted value
  currentValueSectionTitle?: string;
  currentValue: {
    value: string;
    confidence: number;
    color: 'green' | 'yellow' | 'red' | 'gray' | 'purple';
    source?: string;
    sourceTimestamp?: string | null;
    overridden?: boolean;
    acceptedCandidateId?: string | null;
  };
  showCurrentConfidence?: boolean;
  badges: Array<{ label: string; className: string }>;
  isCurrentAccepted?: boolean;

  // Section 2: Manual override
  onManualOverride?: (value: string) => void;
  manualOverrideLabel?: string;
  manualOverridePlaceholder?: string;
  isPending: boolean;

  // Section 3: Candidates
  candidates: ReviewCandidate[];
  candidateSectionTitle?: string;
  emptyCandidatesText?: string;
  showEmptyCandidatesSection?: boolean;
  candidatesLoading?: boolean;
  onAcceptCandidate?: (candidateId: string, candidate: ReviewCandidate) => void;
  onRunAIReview?: () => void;
  aiReviewPending?: boolean;

  // Section 4: Surface-specific slots
  extraActions?: ReactNode;
  extraSections?: ReactNode;

  // Shared-lane pending AI
  pendingAIShared?: boolean;
  pendingSharedCandidateIds?: string[];
  onConfirmShared?: () => void;
  onConfirmSharedCandidate?: (candidateId: string, candidate: ReviewCandidate) => void;
  candidateUiContext?: 'grid' | 'shared';
  showCandidateDebugIds?: boolean;
}

export function CellDrawer({
  title,
  subtitle,
  onClose,
  currentValue,
  currentValueSectionTitle = 'Published Value',
  showCurrentConfidence = true,
  badges,
  isCurrentAccepted,
  onManualOverride,
  manualOverrideLabel,
  manualOverridePlaceholder,
  isPending,
  candidates,
  candidateSectionTitle = 'Candidates',
  emptyCandidatesText = 'No candidates available for this value yet.',
  showEmptyCandidatesSection = false,
  candidatesLoading,
  onAcceptCandidate,
  onRunAIReview,
  aiReviewPending,
  extraActions,
  extraSections,
  pendingAIShared,
  pendingSharedCandidateIds,
  onConfirmShared,
  onConfirmSharedCandidate,
  candidateUiContext = 'grid',
  showCandidateDebugIds = false,
}: CellDrawerProps) {
  const pendingSharedIdSet = new Set(
    (Array.isArray(pendingSharedCandidateIds) ? pendingSharedCandidateIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  const isGridContext = candidateUiContext === 'grid';
  const currentValueIsMeaningful = isMeaningfulValue(currentValue.value);

  const hasShared = pendingSharedIdSet.size > 0 ? true : Boolean(pendingAIShared);
  const hasAnyPending = hasShared;
  const hasCandidateRows = candidates.length > 0;
  const hasMeaningfulCandidates = candidates.some((candidate) => isMeaningfulValue(candidate?.value));
  const confirmSharedButtonClass = 'sf-shared-confirm-button';
  const confirmSharedBannerClass = 'sf-review-ai-pending-banner';
  const confirmSharedBadgeClass = 'sf-review-ai-pending-badge';
  const acceptButtonClass = candidateUiContext === 'grid'
    ? 'sf-item-accept-button'
    : 'sf-shared-accept-button';
  const acceptCandidateTitle = candidateUiContext === 'grid'
    ? 'Accept this candidate as the grid item value.'
    : 'Accept this candidate as the shared value (component/list/enum).';
  const confirmSharedTooltip = 'Confirm shared AI review without changing the selected value.';
  const runAiReviewTooltip = 'Run AI Review for this value and update candidate suggestions.';
  // Normalize current value for matching
  const selectedValueToken = currentValueIsMeaningful ? normalizeComparable(currentValue.value) : '';

  // The "active accepted" candidate: only ONE candidate has the "Accepted" badge.
  // Only set when NOT overridden (manual override deselects all).
  const acceptedCandidateId = (() => {
    if (currentValue.overridden) return null;  // manual override = no active accepted
    return currentValue.acceptedCandidateId || null;
  })();
  const acceptedCandidateIdToken = String(acceptedCandidateId || '').trim();
  const hasSharedTargetInCandidates = pendingSharedIdSet.size > 0
    && candidates.some((c) => isActionableCandidate(c) && pendingSharedIdSet.has(String(c?.candidate_id || '').trim()));
  const showSharedFallbackAction = !currentValue.overridden
    && !candidatesLoading
    && hasShared
    && currentValueIsMeaningful
    && Boolean(onConfirmShared)
    && (!hasCandidateRows || pendingSharedIdSet.size === 0 || !hasSharedTargetInCandidates);
  const currentSourceCandidateIndex = (() => {
    if (currentValue.overridden || !currentValueIsMeaningful) return -1;
    if (acceptedCandidateIdToken) {
      const acceptedIndex = candidates.findIndex((candidate) => String(candidate?.candidate_id || '').trim() === acceptedCandidateIdToken);
      if (acceptedIndex >= 0) return acceptedIndex;
    }
    if (!selectedValueToken) return -1;
    return candidates.findIndex((candidate) => {
      if (!isMeaningfulValue(candidate?.value)) return false;
      return normalizeComparable(candidate.value) === selectedValueToken;
    });
  })();

  return (
    <DrawerShell title={title} subtitle={subtitle} onClose={onClose}>
      {/* Section 1: Current value */}
      <DrawerSection title={currentValueSectionTitle}>
        <DrawerValueRow
          color={currentValue.color}
          value={currentValue.value}
          confidence={currentValue.confidence}
          source={currentValue.source}
          sourceTimestamp={currentValue.sourceTimestamp}
          showConfidence={showCurrentConfidence}
        />
        <DrawerBadges badges={badges} />
        {currentValue.overridden && (
          <div className="mt-1 px-2 py-1 text-center font-medium sf-status sf-status-info">
            Overridden (manual)
          </div>
        )}
        {/* Shared AI status banner */}
        {!currentValue.overridden && hasShared && (currentValueIsMeaningful || hasMeaningfulCandidates) && (
          <div className={`mt-1 px-2 py-1 text-[11px] font-medium border rounded ${confirmSharedBannerClass}`}>
            AI Pending
          </div>
        )}
        {showSharedFallbackAction && (
          <ActionTooltip text={confirmSharedTooltip}>
            <button
              onClick={onConfirmShared}
              disabled={isPending}
              className={`mt-1 w-full px-2 py-1.5 text-[11px] disabled:opacity-50 ${confirmSharedButtonClass}`}
            >
              Confirm Shared
            </button>
          </ActionTooltip>
        )}
      </DrawerSection>

      {/* Section 2: Manual Override */}
      {onManualOverride && (
        <DrawerManualOverride
          onApply={onManualOverride}
          isPending={isPending}
          label={manualOverrideLabel}
          placeholder={manualOverridePlaceholder}
        />
      )}

      {/* Section 3: Candidates */}
      {(candidates.length > 0 || candidatesLoading || onRunAIReview || showEmptyCandidatesSection) && (
        <DrawerSection title={`${candidateSectionTitle} (${candidatesLoading ? '...' : candidates.length})`}>
          {candidatesLoading ? (
            <div className="flex justify-center py-4">
              <Spinner className="h-5 w-5" />
            </div>
          ) : (
            <div className="space-y-2">
              {candidates.length === 0 && (
                <div className="sf-text-caption sf-text-subtle px-1 py-2">
                  {emptyCandidatesText}
                </div>
              )}
              {candidates.map((candidate, index) => {
                const candidateId = String(candidate.candidate_id || '').trim();
                const candidateValueIsMeaningful = isMeaningfulValue(candidate.value);
                const candidateIsActionable = isActionableCandidate(candidate);
                const isCurrentSourceCandidate = index === currentSourceCandidateIndex;
                const isActiveAccepted = Boolean(acceptedCandidateIdToken)
                  && candidateId === acceptedCandidateIdToken;
                const isSharedTarget = hasShared
                  && candidateIsActionable
                  && (pendingSharedIdSet.size > 0 ? pendingSharedIdSet.has(candidateId) : false);
                const showSharedBadge = isSharedTarget;
                const showSharedAction = !isGridContext
                  && hasShared
                  && candidateValueIsMeaningful
                  && pendingSharedIdSet.size > 0
                  && isSharedTarget;
                const showAcceptAction = candidateIsActionable && Boolean(onAcceptCandidate);
                const acceptThisCandidateDisabled = isPending;
                const acceptThisCandidateTitle = acceptCandidateTitle;

                const handleConfirmShared = () => {
                  if (onConfirmSharedCandidate) {
                    onConfirmSharedCandidate(candidate.candidate_id, candidate);
                    return;
                  }
                  if (onConfirmShared) {
                    onConfirmShared();
                  }
                };

                // Candidate visuals are strictly ID-scoped.
                // Accepting one candidate must not visually accept peer rows that share the same value.
                const pendingTintClass = isSharedTarget
                  ? 'sf-review-candidate-pending'
                  : undefined;
                const cardClass = isActiveAccepted
                  ? 'border sf-review-candidate-accepted'
                  : pendingTintClass;

                const valueClass = isActiveAccepted
                  ? 'sf-review-candidate-value-accepted font-bold'
                  : isSharedTarget
                    ? 'sf-review-candidate-value-pending'
                    : '';

                return (
                  <DrawerCard key={candidateId ? `${candidateId}::${index}` : `candidate::${index}`} className={cardClass}>
                    <div className="flex items-center gap-2">
                      <span
                        className={`sf-text-micro rounded px-1.5 py-0.5 font-mono ${isCurrentSourceCandidate ? 'sf-review-candidate-index-current' : 'sf-review-candidate-index'}`}
                        title={isCurrentSourceCandidate ? 'Source for the current value shown at top.' : undefined}
                      >
                        {index + 1}{isCurrentSourceCandidate ? '*' : ''}
                      </span>
                      <span className={`font-mono text-sm flex-1 truncate ${valueClass}`} title={String(candidate.value)}>
                        {String(candidate.value)}
                      </span>
                      {showCandidateDebugIds && (
                        <span
                          className="px-1.5 py-0.5 rounded sf-text-nano font-mono sf-review-candidate-debug-id max-w-[220px] truncate"
                          title={`candidate_id: ${candidateId}`}
                        >
                          id:{compactId(candidateId)}
                        </span>
                      )}
                      <span className="text-xs sf-text-subtle">{pct(candidate.score)}</span>
                      {isActiveAccepted && (
                        <span className="px-1.5 py-0.5 rounded sf-text-nano font-bold sf-chip-success">
                          Published
                        </span>
                      )}
                      {showSharedBadge && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${confirmSharedBadgeClass}`}>
                          AI Pending
                        </span>
                      )}
                    </div>

                    <SourceBadge candidate={candidate} />
                    {(candidate.llm_extract_model || candidate.llm_validate_model) && (
                      <div className="flex gap-1 items-center flex-wrap mt-0.5">
                        {candidate.llm_extract_model && (
                          <span className="px-1 py-0 sf-text-micro rounded sf-review-model-badge">
                            src: {candidate.llm_extract_model}
                          </span>
                        )}
                        {candidate.llm_validate_model && (
                          <span className="px-1 py-0 sf-text-micro rounded sf-review-model-badge">
                            rev: {candidate.llm_validate_model}
                          </span>
                        )}
                      </div>
                    )}
                    <EvidenceSnippet candidate={candidate} />

                    {(() => {
                      const actionCount =
                        (showAcceptAction ? 1 : 0)
                        + (showSharedAction ? 1 : 0);
                      if (actionCount === 0) return null;
                      const widthClass = actionCount === 1
                        ? 'w-full'
                        : 'w-1/2';

                      return (
                        <div className="flex gap-1.5 mt-1">
                          {showAcceptAction && (
                            <ActionTooltip text={acceptThisCandidateTitle}>
                              <button
                                onClick={() => onAcceptCandidate!(candidate.candidate_id, candidate)}
                                disabled={acceptThisCandidateDisabled}
                                aria-pressed={isActiveAccepted}
                                data-candidate-id={candidateId || undefined}
                                data-review-action="accept"
                                className={`${widthClass} px-2 py-1 text-[11px] rounded disabled:opacity-50 ${isActiveAccepted ? 'sf-review-accepted-button' : acceptButtonClass}`}
                              >
                                {isActiveAccepted ? 'Published' : 'Override'}
                              </button>
                            </ActionTooltip>
                          )}
                          {showSharedAction && (
                            <ActionTooltip text={confirmSharedTooltip}>
                              <button
                                onClick={handleConfirmShared}
                                disabled={isPending}
                                data-candidate-id={candidateId || undefined}
                                data-review-action="confirm-shared"
                                className={`${widthClass} px-2 py-1 text-[11px] rounded disabled:opacity-50 ${confirmSharedButtonClass}`}
                              >
                                Confirm
                              </button>
                            </ActionTooltip>
                          )}
                        </div>
                      );
                    })()}
                  </DrawerCard>
                );
              })}
            </div>
          )}
          {onRunAIReview && (
            <>
              <div className="my-1 h-px sf-border-subtle" />
              <ActionTooltip text={runAiReviewTooltip}>
                <button
                  onClick={onRunAIReview}
                  disabled={aiReviewPending}
                  className="w-full px-2 py-1.5 text-[11px] font-medium rounded sf-run-ai-button transition-colors disabled:opacity-50"
                >
                  {aiReviewPending ? 'Running AI Review...' : 'AI Review All Sources'}
                </button>
              </ActionTooltip>
            </>
          )}
          {hasCandidateRows && onAcceptCandidate && (
            <div className="sf-text-caption sf-text-subtle text-center py-1">
              Click any candidate to override the published value
            </div>
          )}
        </DrawerSection>
      )}

      {/* Section 4: Extra actions slot */}
      {extraActions && (
        <DrawerActionStack>{extraActions}</DrawerActionStack>
      )}

      {/* Section 5: Extra sections slot */}
      {extraSections}
    </DrawerShell>
  );
}
