import { memo, useState, useCallback } from 'react';
import type {
  LlmProviderEntry,
  LlmProviderModel,
  LlmModelRole,
} from '../types/llmProviderRegistryTypes.ts';
import { createDefaultProvider, createDefaultModel } from '../state/llmProviderRegistryBridge.ts';
import { ROLE_BADGE_STYLE, MODEL_ROLE_OPTIONS, ACCESS_MODE_BADGE_STYLE, CAPABILITY_BADGE_STYLE } from '../state/llmRoleBadgeStyles.ts';
import { isDefaultProvider } from '../state/llmDefaultProviderRegistry.ts';
import { LlmProviderIcon } from '../../../shared/ui/icons/LlmProviderIcon.tsx';

/* ── Model row ─────────────────────────────────────────── */

interface LlmProviderRegistrySectionProps {
  registry: LlmProviderEntry[];
  onRegistryChange: (registry: LlmProviderEntry[]) => void;
}

function ProviderModelRow({
  model,
  onModelChange,
  onRemove,
  identityLocked,
}: {
  model: LlmProviderModel;
  onModelChange: (updated: LlmProviderModel) => void;
  onRemove: () => void;
  identityLocked: boolean;
}) {
  const roleStyle = ROLE_BADGE_STYLE[model.role];
  return (
    <tr className="sf-table-row">
      <td style={{ padding: 'var(--sf-space-0-5) var(--sf-space-1)' }}>
        <div className="flex items-center gap-1">
          {identityLocked ? (
            <span className="sf-text-caption" style={{ color: 'var(--sf-text)' }}>{model.modelId}</span>
          ) : (
            <input
              className="sf-input sf-text-caption"
              value={model.modelId}
              placeholder="e.g. gpt-4o"
              onChange={(e) => onModelChange({ ...model, modelId: e.target.value })}
            />
          )}
          {model.accessMode && (
            <span
              className="sf-custom-select-badge"
              style={{ color: ACCESS_MODE_BADGE_STYLE[model.accessMode].fg, backgroundColor: ACCESS_MODE_BADGE_STYLE[model.accessMode].bg }}
            >
              {ACCESS_MODE_BADGE_STYLE[model.accessMode].label}
            </span>
          )}
          {model.capabilities?.thinking && (
            <span className="sf-custom-select-badge" style={{ color: CAPABILITY_BADGE_STYLE.thinking.fg, backgroundColor: CAPABILITY_BADGE_STYLE.thinking.bg }}>T</span>
          )}
          {model.capabilities?.web && (
            <span className="sf-custom-select-badge" style={{ color: CAPABILITY_BADGE_STYLE.web.fg, backgroundColor: CAPABILITY_BADGE_STYLE.web.bg }}>W</span>
          )}
        </div>
      </td>
      <td style={{ padding: 'var(--sf-space-0-5) var(--sf-space-1)' }}>
        <div className="relative inline-flex">
          <select
            className="sf-text-caption font-medium cursor-pointer"
            style={{
              backgroundColor: roleStyle.bg,
              color: roleStyle.fg,
              border: 'none',
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
              borderRadius: 'var(--sf-radius-chip)',
              padding: 'var(--sf-space-0-5) var(--sf-space-3) var(--sf-space-0-5) var(--sf-space-1-5)',
            }}
            value={model.role}
            onChange={(e) => onModelChange({ ...model, role: e.target.value as LlmModelRole })}
          >
            {MODEL_ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span
            className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: roleStyle.fg, fontSize: 'var(--sf-token-font-size-micro)', lineHeight: 1 }}
          >
            ▾
          </span>
        </div>
      </td>
      <td style={{ padding: 'var(--sf-space-0-5) var(--sf-space-1)' }}>
        <input
          className="sf-input sf-text-caption"
          type="number"
          min={0}
          step={0.01}
          value={model.costInputPer1M}
          onChange={(e) => onModelChange({ ...model, costInputPer1M: Number(e.target.value) || 0 })}
        />
      </td>
      <td style={{ padding: 'var(--sf-space-0-5) var(--sf-space-1)' }}>
        <input
          className="sf-input sf-text-caption"
          type="number"
          min={0}
          step={0.01}
          value={model.costOutputPer1M}
          onChange={(e) => onModelChange({ ...model, costOutputPer1M: Number(e.target.value) || 0 })}
        />
      </td>
      <td style={{ padding: 'var(--sf-space-0-5) var(--sf-space-1)' }}>
        <input
          className="sf-input sf-text-caption"
          type="number"
          min={0}
          step={0.01}
          value={model.costCachedPer1M}
          onChange={(e) => onModelChange({ ...model, costCachedPer1M: Number(e.target.value) || 0 })}
        />
      </td>
      <td style={{ padding: 'var(--sf-space-0-5) var(--sf-space-1)' }}>
        <input
          className="sf-input sf-text-caption"
          type="number"
          min={0}
          step={1}
          value={model.maxContextTokens ?? ''}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value;
            onModelChange({ ...model, maxContextTokens: raw === '' ? null : (Number(raw) || 0) });
          }}
        />
      </td>
      <td style={{ padding: 'var(--sf-space-0-5) var(--sf-space-1)' }}>
        <input
          className="sf-input sf-text-caption"
          type="number"
          min={0}
          step={1}
          value={model.maxOutputTokens ?? ''}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value;
            onModelChange({ ...model, maxOutputTokens: raw === '' ? null : (Number(raw) || 0) });
          }}
        />
      </td>
      <td style={{ padding: 'var(--sf-space-0-5) var(--sf-space-1)', textAlign: 'center' }}>
        <button
          className="sf-icon-button sf-text-caption"
          style={{ padding: 'var(--sf-space-0-5) var(--sf-space-1)' }}
          onClick={() => {
            if (window.confirm(`Remove ${model.modelId || 'this model'}?`)) onRemove();
          }}
          title="Remove model"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

/* ── Provider panel ────────────────────────────────────── */

function ProviderPanel({
  provider,
  onProviderChange,
  onRemove,
}: {
  provider: LlmProviderEntry;
  onProviderChange: (updated: LlmProviderEntry) => void;
  onRemove: () => void;
}) {
  const [showKey, setShowKey] = useState(false);
  const modelsStorageKey = `sf:llm-provider-models:${provider.id}`;
  const [modelsOpen, setModelsOpen] = useState(() => {
    try {
      const raw = sessionStorage.getItem(modelsStorageKey);
      if (raw === '1') return true;
      if (raw === '0') return false;
    } catch { /* noop */ }
    return false;
  });
  const toggleModels = useCallback(() => {
    setModelsOpen((prev) => {
      const next = !prev;
      try { sessionStorage.setItem(modelsStorageKey, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  }, [modelsStorageKey]);
  const isDefault = isDefaultProvider(provider.id);

  const updateField = useCallback(<K extends keyof LlmProviderEntry>(key: K, value: LlmProviderEntry[K]) => {
    onProviderChange({ ...provider, [key]: value });
  }, [provider, onProviderChange]);

  const updateModel = useCallback((modelId: string, updated: LlmProviderModel) => {
    onProviderChange({ ...provider, models: provider.models.map((m) => (m.id === modelId ? updated : m)) });
  }, [provider, onProviderChange]);

  const removeModel = useCallback((modelId: string) => {
    onProviderChange({ ...provider, models: provider.models.filter((m) => m.id !== modelId) });
  }, [provider, onProviderChange]);

  const addModel = useCallback(() => {
    onProviderChange({ ...provider, models: [...provider.models, createDefaultModel()] });
  }, [provider, onProviderChange]);

  const expanded = provider.expanded;

  return (
    <section
      className="sf-surface-card"
      style={{ padding: 'var(--sf-space-2) var(--sf-space-2-5)' }}
    >
      {/* Title row */}
      <div className="flex items-center gap-1.5">
        <LlmProviderIcon provider={provider.name} className="shrink-0" />
        <button
          type="button"
          className="sf-text-caption font-semibold cursor-pointer"
          style={{ color: 'var(--sf-text)', background: 'none', border: 'none', padding: 0 }}
          onClick={() => updateField('expanded', !expanded)}
        >
          {provider.name || 'Untitled Provider'}
        </button>
        {isDefault && (
          <span
            className="sf-text-caption font-medium"
            style={{
              color: 'rgb(var(--sf-color-accent-strong-rgb))',
              backgroundColor: 'rgb(var(--sf-color-accent-strong-rgb) / 0.08)',
              borderRadius: 'var(--sf-radius-chip)',
              padding: 'var(--sf-space-0-5) var(--sf-space-1-5)',
            }}
          >
            Built-in
          </span>
        )}
        <div className="h-px flex-1" style={{ backgroundColor: 'var(--sf-surface-border)' }} />
        <span className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
          {provider.models.length} {provider.models.length === 1 ? 'model' : 'models'}
        </span>
        <button
          type="button"
          className="sf-text-caption cursor-pointer select-none"
          style={{ color: 'var(--sf-muted)', background: 'none', border: 'none', padding: 0 }}
          onClick={() => updateField('expanded', !expanded)}
        >
          {expanded ? '\u25BE' : '\u25B8'}
        </button>
        {!isDefault && (
          <button
            type="button"
            className="sf-icon-button sf-text-caption"
            style={{ color: 'var(--sf-state-danger-fg)', padding: 'var(--sf-space-0-5) var(--sf-space-1)' }}
            onClick={() => {
              if (window.confirm(`Delete ${provider.name || 'this provider'}? This removes all its models.`))
                onRemove();
            }}
            title="Delete provider"
          >
            ✕
          </button>
        )}
      </div>

      {/* Body — visible when expanded */}
      {expanded && (
        <div className="flex flex-col" style={{ gap: 'var(--sf-space-2)', marginTop: 'var(--sf-space-2)' }}>
          {/* Connection fields */}
          <div className="grid grid-cols-2" style={{ gap: 'var(--sf-space-1-5) var(--sf-space-2-5)' }}>
            <div className="flex flex-col" style={{ gap: 'var(--sf-space-1)' }}>
              <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Provider name</label>
              <input
                className="sf-input sf-text-label"
                value={provider.name}
                placeholder="My Provider"
                onChange={(e) => updateField('name', e.target.value)}
              />
            </div>
            <div className="flex flex-col" style={{ gap: 'var(--sf-space-1)' }}>
              <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>API key</label>
              <div className="relative">
                <input
                  className="sf-input sf-text-label"
                  type={showKey ? 'text' : 'password'}
                  value={provider.apiKey}
                  placeholder="sk-..."
                  style={{ paddingRight: 'var(--sf-space-8)' }}
                  onChange={(e) => updateField('apiKey', e.target.value)}
                />
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 sf-text-caption cursor-pointer select-none"
                  style={{ color: 'var(--sf-muted)', background: 'none', border: 'none', padding: 0 }}
                  onClick={() => setShowKey(!showKey)}
                  type="button"
                >
                  {showKey ? 'hide' : 'show'}
                </button>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--sf-surface-border)' }} />

          {/* Models sub-section (collapsible) */}
          <button
            type="button"
            className="flex items-center gap-1.5 cursor-pointer select-none"
            style={{ background: 'none', border: 'none', padding: 0 }}
            onClick={toggleModels}
          >
            <svg
              viewBox="0 0 20 20"
              className={`h-3 w-3 shrink-0 transition-transform ${modelsOpen ? 'rotate-90' : ''}`}
              fill="currentColor"
              style={{ color: 'var(--sf-muted)' }}
              aria-hidden="true"
            >
              <path d="M6.3 3.7a1 1 0 0 1 1.4 0l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4-1.4L10.58 10 6.3 5.7a1 1 0 0 1 0-1.4Z" />
            </svg>
            <span className="sf-text-caption font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-muted)' }}>
              Models
            </span>
            <span className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
              ({provider.models.length})
            </span>
          </button>

          {modelsOpen && (
            <>
              {provider.models.length === 0 ? (
                <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>No models configured.</p>
              ) : (
                <div className="sf-table-shell" style={{ overflow: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead className="sf-table-head">
                      <tr>
                        <th className="sf-table-head-cell">Model ID</th>
                        <th className="sf-table-head-cell">Role</th>
                        <th className="sf-table-head-cell">In $/1M</th>
                        <th className="sf-table-head-cell">Out $/1M</th>
                        <th className="sf-table-head-cell">Cache $/1M</th>
                        <th className="sf-table-head-cell">Max Context</th>
                        <th className="sf-table-head-cell">Max Output</th>
                        <th className="sf-table-head-cell" style={{ width: 32 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {provider.models.map((model) => (
                        <ProviderModelRow
                          key={model.id}
                          model={model}
                          identityLocked={isDefault}
                          onModelChange={(updated) => updateModel(model.id, updated)}
                          onRemove={() => removeModel(model.id)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <button
                className="sf-action-button sf-text-caption font-medium"
                style={{ alignSelf: 'flex-start', padding: 'var(--sf-space-1) var(--sf-space-2)' }}
                onClick={addModel}
                type="button"
              >
                + Add model
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}

/* ── Section ───────────────────────────────────────────── */

export const LlmProviderRegistrySection = memo(function LlmProviderRegistrySection({
  registry,
  onRegistryChange,
}: LlmProviderRegistrySectionProps) {
  const addProvider = useCallback(() => {
    onRegistryChange([...registry, createDefaultProvider('openai-compatible')]);
  }, [registry, onRegistryChange]);

  const updateProvider = useCallback((providerId: string, updated: LlmProviderEntry) => {
    const next = registry.map((p) => (p.id === providerId ? updated : p));
    onRegistryChange(next);
  }, [registry, onRegistryChange]);

  const removeProvider = useCallback((providerId: string) => {
    onRegistryChange(registry.filter((p) => p.id !== providerId));
  }, [registry, onRegistryChange]);

  return (
    <div className="flex flex-col" style={{ gap: 'var(--sf-space-2)' }}>
      {registry.length === 0 ? (
        <div
          className="sf-surface-card text-center"
          style={{ padding: 'var(--sf-space-4) var(--sf-space-3)' }}
        >
          <p className="sf-text-caption font-medium" style={{ color: 'var(--sf-muted)', marginBottom: 'var(--sf-space-1)' }}>No providers configured.</p>
          <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
            Add a provider to define LLM endpoints and models.
          </p>
        </div>
      ) : (
        registry.map((provider) => (
          <ProviderPanel
            key={provider.id}
            provider={provider}
            onProviderChange={(updated) => updateProvider(provider.id, updated)}
            onRemove={() => removeProvider(provider.id)}
          />
        ))
      )}

      <button
        type="button"
        className="sf-action-button sf-text-caption font-medium"
        style={{
          width: '100%',
          padding: 'var(--sf-space-2)',
          borderStyle: 'dashed',
        }}
        onClick={addProvider}
      >
        + Add Provider
      </button>
    </div>
  );
});
