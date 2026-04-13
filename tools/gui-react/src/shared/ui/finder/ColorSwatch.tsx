import React from 'react';

/* ── Color circle (mirrors site's getCircleStyle gradient logic) ──── */

interface ColorSwatchProps {
  readonly hexParts: readonly string[];
  readonly size?: 'sm' | 'md';
}

export function colorCircleStyle(hexParts: readonly string[]): React.CSSProperties {
  const colors = hexParts.filter(Boolean);
  if (colors.length === 0) return { backgroundColor: 'var(--sf-text-muted)' };
  if (colors.length === 1) return { backgroundColor: colors[0] };
  if (colors.length === 2) {
    return { background: `linear-gradient(45deg, ${colors[0]} 50%, ${colors[1]} 50%)` };
  }
  const angle = 360 / colors.length;
  const stops = colors.map((c, i) => `${c} ${i * angle}deg ${(i + 1) * angle}deg`);
  const from = colors.length === 3 ? 240 : (270 - angle / 2);
  return { background: `conic-gradient(from ${from}deg, ${stops.join(', ')})` };
}

export function ColorSwatch({ hexParts, size = 'sm' }: ColorSwatchProps) {
  const sizeClass = size === 'sm' ? 'w-3 h-3' : 'w-4 h-4';
  return (
    <span
      className={`inline-block ${sizeClass} rounded-sm border sf-border-soft shadow-[0_0_0_0.5px_rgba(0,0,0,0.15)] shrink-0`}
      style={colorCircleStyle(hexParts)}
    />
  );
}
