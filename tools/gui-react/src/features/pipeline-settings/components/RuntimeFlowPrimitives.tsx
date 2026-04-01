import { memo, useState, type ReactNode } from 'react';
import type { NumberBound, RuntimeDraft } from '../types/settingPrimitiveTypes.ts';
import { Tip } from '../../../shared/ui/feedback/Tip.tsx';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';

function settingLabel(label: string, tip: string) {
  return (
    <span className="inline-flex items-center gap-1 sf-text-label font-semibold" style={{ color: 'var(--sf-text)' }}>
      {label}
      <Tip text={tip} />
    </span>
  );
}

export function SettingGroupBlock({
  title,
  children,
  collapsible = false,
  defaultCollapsed = false,
  storageKey,
}: {
  title: string;
  children: ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  storageKey?: string;
}) {
  const [collapsed, toggle] = usePersistedToggle(storageKey ?? `settingGroup:${title}`, defaultCollapsed);
  const isCollapsed = collapsible ? collapsed : false;

  return (
    <section
      className={`rounded border px-3 py-2.5 ${isCollapsed ? '' : 'space-y-2.5'}`}
      style={{
        borderColor: 'var(--sf-border)',
        backgroundColor: 'var(--sf-surface)',
      }}
    >
      <div
        className={`flex items-center gap-2 ${collapsible ? 'cursor-pointer select-none' : ''}`}
        onClick={collapsible ? toggle : undefined}
        role={collapsible ? 'button' : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={collapsible ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } : undefined}
      >
        {collapsible && (
          <svg
            viewBox="0 0 20 20"
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            fill="currentColor"
            style={{ color: 'var(--sf-muted)' }}
            aria-hidden="true"
          >
            <path d="M6.3 3.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L10.58 10 6.3 5.7a1 1 0 0 1 0-1.4Z" />
          </svg>
        )}
        <div className="sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
          {title}
        </div>
        <div className="h-px flex-1" style={{ backgroundColor: 'var(--sf-border)' }} />
      </div>
      {!isCollapsed && children}
    </section>
  );
}

export function SettingRow({
  label,
  tip,
  children,
  disabled = false,
  description,
}: {
  label: string;
  tip: string;
  children: ReactNode;
  disabled?: boolean;
  description?: string;
}) {
  return (
    <div className={`grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] md:items-center ${disabled ? 'opacity-55 pointer-events-none select-none' : ''}`}>
      <div>
        {settingLabel(label, tip)}
        {description ? (
          <div className="mt-0.5 sf-text-caption" style={{ color: 'var(--sf-muted)' }}>{description}</div>
        ) : null}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingToggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={checked ? 'enabled' : 'disabled'}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`inline-flex w-full items-center justify-between sf-switch px-2.5 py-1.5 sf-text-label font-semibold transition focus:outline-none focus:ring-2 focus:ring-accent/25 ${
        checked
          ? 'sf-switch-on'
          : 'sf-switch-off'
      } disabled:opacity-60`}
    >
      <span>{checked ? 'Enabled' : 'Disabled'}</span>
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full sf-switch-track transition ${
          checked
            ? 'sf-switch-track-on'
            : ''
        }`}
        aria-hidden="true"
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full sf-switch-thumb transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
}

export function MasterSwitchRow({
  label,
  tip,
  children,
  disabled = false,
  description,
  hint,
}: {
  label: string;
  tip: string;
  children: ReactNode;
  disabled?: boolean;
  description?: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded border-l-2 px-3 py-2.5 sf-callout sf-callout-info"
      style={{ borderLeftColor: 'var(--sf-accent)' }}
    >
      <div className={`grid grid-cols-1 gap-2.5 md:grid-cols-[minmax(0,1fr)_minmax(220px,300px)] md:items-center ${disabled ? 'opacity-55 pointer-events-none select-none' : ''}`}>
        <div>
          {settingLabel(label, tip)}
          {description ? (
            <div className="mt-0.5 sf-text-caption" style={{ color: 'var(--sf-muted)' }}>{description}</div>
          ) : null}
        </div>
        <div>{children}</div>
      </div>
      {hint ? (
        <div className="mt-1.5 sf-text-caption" style={{ color: 'var(--sf-muted)' }}>{hint}</div>
      ) : null}
    </div>
  );
}

export function AdvancedSettingsBlock({
  title,
  count,
  children,
  disabled = false,
}: {
  title: string;
  count: number;
  children: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section
      className={`rounded border px-3 py-2.5 ${disabled ? 'opacity-50 pointer-events-none select-none' : ''}`}
      style={{
        borderColor: 'var(--sf-border)',
        backgroundColor: 'var(--sf-surface)',
      }}
    >
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left focus:outline-none"
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          viewBox="0 0 20 20"
          className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="currentColor"
          style={{ color: 'var(--sf-muted)' }}
          aria-hidden="true"
        >
          <path d="M6.3 3.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L10.58 10 6.3 5.7a1 1 0 0 1 0-1.4Z" />
        </svg>
        <span className="sf-text-caption font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
          {title}
        </span>
        <span
          className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 sf-text-caption font-semibold"
          style={{ backgroundColor: 'var(--sf-border)', color: 'var(--sf-muted)' }}
        >
          {count}
        </span>
        <span className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
          ({open ? 'hide' : 'show'})
        </span>
        <div className="h-px flex-1" style={{ backgroundColor: 'var(--sf-border)' }} />
      </button>
      {open ? <div className="mt-2.5 space-y-2.5">{children}</div> : null}
    </section>
  );
}

export function FlowOptionPanel({
  title,
  subtitle,
  children,
  disabled = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <section
      className={`rounded sf-surface-elevated p-3.5 space-y-3 ${
        disabled ? 'opacity-55 pointer-events-none select-none' : ''
      }`}
    >
      <header className="space-y-0.5">
        <div className="sf-text-label font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-text)' }}>
          {title}
        </div>
        <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>{subtitle}</p>
      </header>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

export const SettingNumberInput = memo(function SettingNumberInput<K extends keyof RuntimeDraft>({
  draftKey,
  value,
  bounds,
  step,
  disabled = false,
  className = 'sf-input w-full rounded border px-2 py-1.5 sf-text-label',
  onNumberChange,
}: {
  draftKey: K;
  value: number;
  bounds: NumberBound;
  step?: number;
  disabled?: boolean;
  className?: string;
  onNumberChange: (key: K, eventValue: string, bounds: NumberBound) => void;
}) {
  const resolvedStep = step ?? (bounds.int !== false ? 1 : 0.01);
  return (
    <input
      type="number"
      min={bounds.min}
      max={bounds.max}
      step={resolvedStep}
      value={value}
      onChange={(event) => onNumberChange(draftKey, event.target.value, bounds)}
      disabled={disabled}
      className={className}
    />
  );
});
