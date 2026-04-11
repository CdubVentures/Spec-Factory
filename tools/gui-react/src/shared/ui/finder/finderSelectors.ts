import type { CooldownState, StatusChipData } from './types.ts';

const COOLDOWN_DAYS = 30;

export function deriveCooldownState(result: { cooldown_until?: string; run_count?: number } | null): CooldownState {
  if (!result || !result.cooldown_until) {
    return { onCooldown: false, daysRemaining: 0, progressPct: 100, label: '', eligibleDate: '' };
  }

  const now = Date.now();
  const cooldownEnd = new Date(result.cooldown_until).getTime();

  if (Number.isNaN(cooldownEnd) || cooldownEnd <= now) {
    return { onCooldown: false, daysRemaining: 0, progressPct: 100, label: 'Ready', eligibleDate: '' };
  }

  const msRemaining = cooldownEnd - now;
  const daysRemaining = Math.ceil(msRemaining / 86400000);
  const totalMs = COOLDOWN_DAYS * 86400000;
  const elapsed = totalMs - msRemaining;
  const progressPct = Math.min(100, Math.max(0, (elapsed / totalMs) * 100));
  const eligibleDate = result.cooldown_until.split('T')[0] || '';

  return { onCooldown: true, daysRemaining, progressPct, label: `${daysRemaining}d remaining`, eligibleDate };
}

export function deriveFinderStatusChip(result: { run_count?: number } | null): StatusChipData {
  if (!result) return { label: 'Not Run', tone: 'neutral' };
  return { label: `Run ${result.run_count}`, tone: 'success' };
}
