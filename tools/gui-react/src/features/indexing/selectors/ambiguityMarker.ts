export type AmbiguityLevel = 'easy' | 'medium' | 'hard' | 'very_hard' | 'extra_hard' | 'unknown';

const MARKER_PCT: Record<AmbiguityLevel, number> = {
  easy: 10,
  medium: 30,
  hard: 50,
  very_hard: 70,
  extra_hard: 90,
  unknown: 0,
};

export function deriveAmbiguityMarkerPct(level: string): number {
  if (level in MARKER_PCT) return MARKER_PCT[level as AmbiguityLevel];
  return MARKER_PCT.unknown;
}
