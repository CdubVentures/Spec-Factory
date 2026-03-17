import { memo } from 'react';

type AlertSeverity = 'warning' | 'info' | 'error';

interface AlertBannerProps {
  severity: AlertSeverity;
  title: string;
  message: string;
  onDismiss?: () => void;
}

const SEVERITY_STYLES: Record<AlertSeverity, { border: string; bg: string; icon: string }> = {
  warning: { border: 'var(--sf-warning, #d97706)', bg: 'var(--sf-warning-bg, rgba(217,119,6,0.08))', icon: '\u26A0' },
  info: { border: 'var(--sf-info, #2563eb)', bg: 'var(--sf-info-bg, rgba(37,99,235,0.08))', icon: '\u2139' },
  error: { border: 'var(--sf-error, #dc2626)', bg: 'var(--sf-error-bg, rgba(220,38,38,0.08))', icon: '\u2715' },
};

export const AlertBanner = memo(function AlertBanner({ severity, title, message, onDismiss }: AlertBannerProps) {
  const styles = SEVERITY_STYLES[severity];
  return (
    <div
      className="flex items-start gap-2 rounded px-3 py-2"
      style={{
        borderLeft: `3px solid ${styles.border}`,
        backgroundColor: styles.bg,
      }}
    >
      <span className="sf-text-label flex-shrink-0" style={{ color: styles.border }}>{styles.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="sf-text-label font-medium" style={{ color: styles.border }}>{title}</div>
        <div className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>{message}</div>
      </div>
      {onDismiss && (
        <button
          className="sf-text-caption flex-shrink-0 opacity-60 hover:opacity-100"
          style={{ color: 'var(--sf-muted)' }}
          onClick={onDismiss}
          type="button"
        >
          &#x2715;
        </button>
      )}
    </div>
  );
});
