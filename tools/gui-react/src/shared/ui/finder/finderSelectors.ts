import type { StatusChipData } from './types.ts';

export function deriveFinderStatusChip(result: { run_count?: number } | null): StatusChipData {
  if (!result) return { label: 'Not Run', tone: 'neutral' };
  return { label: `Run ${result.run_count}`, tone: 'success' };
}

/** Titlecase a raw color atom/combo: `light-blue+dark-blue` → `Light Blue + Dark Blue` */
export function formatAtomLabel(atom: string): string {
  return atom.split('+').map(part =>
    part.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
  ).join(' + ');
}
