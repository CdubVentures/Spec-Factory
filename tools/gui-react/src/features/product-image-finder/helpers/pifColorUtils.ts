import type React from 'react';

/** Convert hex (#rrggbb) to rgba at given opacity. */
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Check if a hex color is very light (luminance > 0.85). */
export function isLightColor(hex: string): boolean {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) / 255;
  const g = parseInt(h.substring(2, 4), 16) / 255;
  const b = parseInt(h.substring(4, 6), 16) / 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 0.85;
}

/** Per-color border stop: light colors get a theme-aware shadow tint so they stay visible. */
export function borderStopColor(hex: string): string {
  return isLightColor(hex) ? 'rgb(var(--sf-token-shadow-color-rgb) / 0.2)' : hexToRgba(hex, 0.45);
}

/**
 * Build a light-tinted background + color-matched border style from hex parts.
 *
 * Exception to ZERO-DRIFT inline-style ban: runtime hex colors from LLM data
 * require JS computation for multi-color gradients (unknown count of color atoms).
 * This is a pure, testable function centralized in one file.
 */
export function variantBadgeBgStyle(hexParts: readonly string[]): React.CSSProperties {
  const colors = hexParts.filter(Boolean);
  if (colors.length === 0) return {};

  if (colors.length === 1) {
    return { backgroundColor: hexToRgba(colors[0], 0.15), border: `1px solid ${borderStopColor(colors[0])}` };
  }

  // Multi-color border via border-image — each stop checked individually
  const bgStops = colors.map((c) => hexToRgba(c, 0.15));
  const borderStops = colors.map(borderStopColor);
  const pct = 100 / colors.length;
  const bgCss = colors.map((_, i) => `${bgStops[i]} ${i * pct}% ${(i + 1) * pct}%`);
  const borderCss = borderStops.map((s, i) => `${s} ${i * pct}% ${(i + 1) * pct}%`);

  return {
    background: `linear-gradient(90deg, ${bgCss.join(', ')})`,
    border: '1px solid transparent',
    borderImage: `linear-gradient(90deg, ${borderCss.join(', ')}) 1`,
  };
}
