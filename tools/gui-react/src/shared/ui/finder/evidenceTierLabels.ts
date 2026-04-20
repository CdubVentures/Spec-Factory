// WHY: Single source of truth for evidence-ref tier display labels. Every
// surface that shows a tier chip (finder evidence row, review drawer
// published + candidates blocks, evidence-kind popover) imports from here
// so the wording stays consistent. Adding a new tier = edit one file.
//
// Mapping derived from globalPromptRegistry.js evidenceContract template:
//   tier1 manufacturer / brand-official / press release   → T1-Mfr
//   tier2 professional testing lab / review lab           → T2-Lab
//   tier3 authorized retailer / marketplace               → T3-Retail
//   tier4 community / forum / blog / user-generated       → T4-Comm
//   tier5 specs aggregator / product database             → T5-DB
//   other anything else                                   → Other

export const EVIDENCE_TIER_LABELS: Record<string, string> = {
  tier1: 'T1-Mfr',
  tier2: 'T2-Lab',
  tier3: 'T3-Retail',
  tier4: 'T4-Comm',
  tier5: 'T5-DB',
  other: 'Other',
};

export function formatEvidenceTier(tier: string | null | undefined): string {
  if (!tier) return '';
  return EVIDENCE_TIER_LABELS[tier] || tier;
}
