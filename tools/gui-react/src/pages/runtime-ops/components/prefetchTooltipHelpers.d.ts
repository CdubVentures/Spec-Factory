export interface PrefetchTooltipTextParts {
  what: string;
  effect: string;
  setBy: string;
}

export function formatTooltip(parts: PrefetchTooltipTextParts): string;
