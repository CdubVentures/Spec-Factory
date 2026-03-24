import { useMemo } from 'react';
import { SectionHeader } from '../../../../shared/ui/data-display/SectionHeader.tsx';
import type { PrefetchNeedSetData } from '../../types.ts';

/* ── Props ──────────────────────────────────────────────────────────── */

type ProfileInfluence = NonNullable<PrefetchNeedSetData['profile_influence']>;

const TIER_CATEGORIES = ['targeted_brand', 'targeted_specification', 'targeted_sources', 'targeted_groups', 'targeted_single'] as const;

export interface NeedSetProfileInfluenceProps {
  profileInfluence: ProfileInfluence;
  isLlmPending: boolean;
}

/* ── Component ──────────────────────────────────────────────────────── */

export function NeedSetProfileInfluence({ profileInfluence, isLlmPending }: NeedSetProfileInfluenceProps) {
  /* WHY: Always show all tier categories so the user sees the full picture
     even when a tier has 0 allocated (e.g. 0/5 sources on round 0). */
  const tierEntries = useMemo(() =>
    TIER_CATEGORIES.map((cat) => ({ category: cat, count: (profileInfluence[cat] as number) ?? 0 })),
  [profileInfluence]);

  const tierTotal = tierEntries.reduce((s, e) => s + e.count, 0);

  if (isLlmPending) {
    return (
      <div>
        <SectionHeader>profile influence</SectionHeader>
        <div className="flex items-center gap-2.5 py-3 px-4 rounded-sm sf-surface-elevated border sf-border-soft">
          <div className="w-20 h-1 rounded-sm overflow-hidden sf-bg-surface-soft-strong">
            <div className="h-full w-full rounded-sm bg-[var(--sf-token-accent)] animate-pulse" />
          </div>
          <span className="text-[10px] font-mono font-semibold tracking-[0.02em] sf-text-muted">
            search planner LLM in progress&hellip;
          </span>
        </div>
      </div>
    );
  }

  if (tierEntries.length === 0) return null;

  return (
    <div>
      <SectionHeader>profile influence</SectionHeader>
      <div className="space-y-3">
        {/* Segmented bar — tier distribution */}
        {tierTotal > 0 && (
          <div className="flex h-5 rounded-sm overflow-hidden border sf-border-soft">
            {tierEntries.map((e) => (
              <div
                key={e.category}
                className={`flex items-center justify-center text-[10px] font-bold ${
                  e.category === 'targeted_brand' ? 'bg-rose-600 text-white' :
                  e.category === 'targeted_specification' ? 'bg-blue-600 text-white' :
                  e.category === 'targeted_sources' ? 'bg-violet-600 text-white' :
                  e.category === 'targeted_groups' ? 'bg-amber-500 text-white' :
                  'bg-emerald-600 text-white'
                }`}
                style={{ width: `${(e.count / tierTotal) * 100}%` }}
                title={`${e.category.replace(/_/g, ' ')}: ${e.count}`}
              >
                {e.count}
              </div>
            ))}
          </div>
        )}
        {/* Legend — always shows all tiers with allocated / total */}
        <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs sf-text-muted">
          {tierEntries.map((e) => {
            const total =
              e.category === 'targeted_brand' ? 1 :
              e.category === 'targeted_specification' ? 1 :
              e.category === 'targeted_sources' ? (profileInfluence.total_sources ?? 0) :
              e.category === 'targeted_groups' ? (profileInfluence.total_groups ?? 0) :
              (profileInfluence.total_unresolved_keys ?? 0);
            return (
              <span key={e.category} className="flex items-center gap-2">
                <span className={`inline-block w-3 h-3 rounded-sm ${
                  e.category === 'targeted_brand' ? 'bg-rose-600' :
                  e.category === 'targeted_specification' ? 'bg-blue-600' :
                  e.category === 'targeted_sources' ? 'bg-violet-600' :
                  e.category === 'targeted_groups' ? 'bg-amber-500' :
                  'bg-emerald-600'
                }`} />
                <span className="font-semibold">{e.category.replace(/targeted_/g, '').replace(/_/g, ' ')}</span>
                <span className="font-mono font-bold sf-text-primary">{e.count}/{total}</span>
              </span>
            );
          })}
        </div>
        {/* Stats row */}
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-[10px] font-semibold uppercase tracking-[0.1em] sf-text-muted pt-2 border-t sf-border-soft">
          {profileInfluence.budget != null && (
            <span>budget <strong className="sf-text-primary">{profileInfluence.allocated ?? 0}/{profileInfluence.budget}</strong></span>
          )}
          <span>groups now <strong className="sf-text-primary">{profileInfluence.groups_now}</strong></span>
          <span>groups next <strong className="sf-text-primary">{profileInfluence.groups_next}</strong></span>
          <span>groups hold <strong className="sf-text-primary">{profileInfluence.groups_hold}</strong></span>
          <span>unresolved keys <strong className="sf-text-primary">{profileInfluence.total_unresolved_keys}</strong></span>
          <span>confidence <strong className="sf-text-primary">{(profileInfluence.planner_confidence ?? 0).toFixed(2)}</strong></span>
        </div>
      </div>
    </div>
  );
}
