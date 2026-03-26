/**
 * Shared model name formatting and chip class helpers for LLM dashboard views.
 * Handles Claude, Gemini, DeepSeek, and GPT model families.
 */

export function shortModel(model: string): string {
  const m = model.toLowerCase();
  // Claude: "claude-sonnet-4-20250514" → "Sonnet 4.20250514"
  const cm = m.match(/claude[- ](sonnet|haiku|opus)[- ](\d+)[- ](\d+)/);
  if (cm) return `${cm[1].charAt(0).toUpperCase() + cm[1].slice(1)} ${cm[2]}.${cm[3]}`;
  if (m.includes('sonnet')) return 'Sonnet';
  if (m.includes('haiku')) return 'Haiku';
  if (m.includes('opus')) return 'Opus';
  // Gemini: "gemini-2.5-flash-lite" → "Flash-Lite 2.5"
  const gm = m.match(/gemini[- ](\d+(?:\.\d+)?)[- ](.+)/);
  if (gm) {
    const variant = gm[2].split(/[- ]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('-');
    return `${variant} ${gm[1]}`;
  }
  if (m.includes('gemini')) return 'Gemini';
  // DeepSeek: "deepseek-chat" → "DS Chat"
  const ds = m.match(/deepseek[- ](\w+)/);
  if (ds) return `DS ${ds[1].charAt(0).toUpperCase() + ds[1].slice(1)}`;
  // GPT: "gpt-5-medium" → "GPT-5 Medium", "gpt-4o-mini" → "GPT-4o Mini"
  const gpt = m.match(/gpt[- ](.+)/);
  if (gpt) {
    const parts = gpt[1].split(/[- ]/);
    return `GPT-${parts.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')}`;
  }
  return model;
}

export function accessBadgeClass(isLab: boolean): string {
  return isLab ? 'sf-chip-accent' : 'sf-chip-neutral';
}

export function accessBadgeLabel(isLab: boolean): string {
  return isLab ? 'LAB' : 'API';
}

export function modelChipClass(model: string): string {
  const m = model.toLowerCase();
  if (m.includes('haiku')) return 'sf-chip-success';
  if (m.includes('sonnet')) return 'sf-chip-info';
  if (m.includes('opus')) return 'sf-chip-accent';
  if (m.includes('flash-lite') || m.includes('flash_lite')) return 'sf-chip-teal-strong';
  if (m.includes('flash') || m.includes('gemini')) return 'sf-chip-sky-strong';
  if (m.includes('deepseek')) return 'sf-chip-purple';
  if (m.includes('gpt')) return 'sf-chip-warning';
  return 'sf-chip-neutral';
}
