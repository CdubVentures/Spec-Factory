export function toneToValueClass(tone: string): string {
  if (tone === 'success') return 'sf-status-text-success';
  if (tone === 'warning') return 'sf-status-text-warning';
  if (tone === 'danger') return 'sf-status-text-danger';
  if (tone === 'info') return 'sf-status-text-info';
  if (tone === 'teal') return 'sf-status-text-success';
  return 'text-[var(--sf-token-accent-strong)]';
}
