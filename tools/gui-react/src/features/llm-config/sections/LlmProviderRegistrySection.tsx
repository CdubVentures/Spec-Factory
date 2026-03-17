import { memo, useState, useCallback } from 'react';
import type {
  LlmProviderEntry,
  LlmProviderModel,
  LlmModelRole,
} from '../types/llmProviderRegistryTypes';
import { createDefaultProvider, createDefaultModel } from '../state/llmProviderRegistryBridge';
import { ROLE_BADGE_STYLE, MODEL_ROLE_OPTIONS } from '../state/llmRoleBadgeStyles';
import { isDefaultProvider } from '../state/llmDefaultProviderRegistry';
import { ModelRoleBadge } from '../components/ModelRoleBadge';

/* ── Provider SVG icons (20x20) ────────────────────────── */

function GeminiIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C12.5 7 17 11.5 22 12C17 12.5 12.5 17 12 22C11.5 17 7 12.5 2 12C7 11.5 11.5 7 12 2Z" fill="#4285F4" />
    </svg>
  );
}

function DeepSeekIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#0066FF" />
      <path d="M7 13C9 9 15 9 17 13" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="9" cy="10" r="1.5" fill="#fff" />
      <circle cx="15" cy="10" r="1.5" fill="#fff" />
    </svg>
  );
}

function AnthropicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <rect x="2" y="2" width="20" height="20" rx="4" fill="#D4A27F" />
      <path d="M12 6L17 18H14.5L12 12.5L9.5 18H7L12 6Z" fill="#fff" />
    </svg>
  );
}

function OpenAIIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#10A37F" />
      <path d="M12 6V12L16 14M12 12L8 14M12 12V18" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function OllamaIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1A1A1A" />
      <ellipse cx="12" cy="13" rx="5" ry="4" fill="#fff" />
      <circle cx="10" cy="12" r="1" fill="#1A1A1A" />
      <circle cx="14" cy="12" r="1" fill="#1A1A1A" />
      <ellipse cx="12" cy="8" rx="3" ry="2" fill="#fff" />
    </svg>
  );
}

function CortexIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#6366F1" />
      <circle cx="12" cy="10" r="3" stroke="#fff" strokeWidth="1.5" fill="none" />
      <path d="M9 14L7 18M15 14L17 18M12 13V18" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ProviderIcon({ name }: { name: string }) {
  const key = name.toLowerCase();
  switch (key) {
    case 'gemini': return <GeminiIcon />;
    case 'deepseek': return <DeepSeekIcon />;
    case 'anthropic': return <AnthropicIcon />;
    case 'openai': return <OpenAIIcon />;
    case 'ollama': return <OllamaIcon />;
    case 'cortex': return <CortexIcon />;
    default: return null;
  }
}

/* ── Model row ─────────────────────────────────────────── */

interface LlmProviderRegistrySectionProps {
  registry: LlmProviderEntry[];
  onRegistryChange: (registry: LlmProviderEntry[]) => void;
}

function ProviderModelRow({
  model,
  onModelChange,
  onRemove,
  readOnly,
}: {
  model: LlmProviderModel;
  onModelChange: (updated: LlmProviderModel) => void;
  onRemove: () => void;
  readOnly: boolean;
}) {
  const roleStyle = ROLE_BADGE_STYLE[model.role];
  return (
    <tr>
      <td className="sf-table-cell">
        <input
          className="sf-input sf-input--sm"
          value={model.modelId}
          placeholder="e.g. gpt-4o"
          disabled={readOnly}
          onChange={(e) => onModelChange({ ...model, modelId: e.target.value })}
        />
      </td>
      <td className="sf-table-cell">
        {readOnly ? (
          <ModelRoleBadge role={model.role} />
        ) : (
          <div className="relative inline-flex">
            <select
              className="sf-text-caption font-medium cursor-pointer rounded-full pr-5 pl-2 py-0.5"
              style={{
                backgroundColor: roleStyle.bg,
                color: roleStyle.color,
                border: 'none',
                outline: 'none',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
              value={model.role}
              onChange={(e) => onModelChange({ ...model, role: e.target.value as LlmModelRole })}
            >
              {MODEL_ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <span
              className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none sf-text-caption"
              style={{ color: roleStyle.color, fontSize: 8, lineHeight: 1 }}
            >
              ▾
            </span>
          </div>
        )}
      </td>
      <td className="sf-table-cell">
        <input
          className="sf-input sf-input--sm sf-input--number"
          type="number"
          min={0}
          step={0.01}
          disabled={readOnly}
          value={model.costInputPer1M}
          onChange={(e) => onModelChange({ ...model, costInputPer1M: Number(e.target.value) || 0 })}
        />
      </td>
      <td className="sf-table-cell">
        <input
          className="sf-input sf-input--sm sf-input--number"
          type="number"
          min={0}
          step={0.01}
          disabled={readOnly}
          value={model.costOutputPer1M}
          onChange={(e) => onModelChange({ ...model, costOutputPer1M: Number(e.target.value) || 0 })}
        />
      </td>
      <td className="sf-table-cell">
        <input
          className="sf-input sf-input--sm sf-input--number"
          type="number"
          min={0}
          step={0.01}
          disabled={readOnly}
          value={model.costCachedPer1M}
          onChange={(e) => onModelChange({ ...model, costCachedPer1M: Number(e.target.value) || 0 })}
        />
      </td>
      <td className="sf-table-cell">
        <input
          className="sf-input sf-input--sm sf-input--number"
          type="number"
          min={0}
          step={1}
          disabled={readOnly}
          value={model.maxContextTokens ?? ''}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value;
            onModelChange({ ...model, maxContextTokens: raw === '' ? null : (Number(raw) || 0) });
          }}
        />
      </td>
      <td className="sf-table-cell">
        <input
          className="sf-input sf-input--sm sf-input--number"
          type="number"
          min={0}
          step={1}
          disabled={readOnly}
          value={model.maxOutputTokens ?? ''}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value;
            onModelChange({ ...model, maxOutputTokens: raw === '' ? null : (Number(raw) || 0) });
          }}
        />
      </td>
      <td className="sf-table-cell">
        {!readOnly && (
          <button
            className="sf-text-caption cursor-pointer"
            style={{ color: 'var(--sf-muted)' }}
            onClick={onRemove}
            title="Remove model"
          >
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}

/* ── Provider panel (SettingGroupBlock pattern) ─────────── */

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

  const icon = ProviderIcon({ name: provider.name });
  const expanded = provider.expanded;

  return (
    <section
      className="space-y-2.5 rounded border px-3 py-2.5"
      style={{ borderColor: 'var(--sf-border)', backgroundColor: 'var(--sf-surface)' }}
    >
      {/* Title row — matches SettingGroupBlock pattern */}
      <div className="flex items-center gap-2">
        {icon && <span className="shrink-0">{icon}</span>}
        <button
          type="button"
          className="sf-text-label font-semibold uppercase tracking-wide cursor-pointer"
          style={{ color: 'var(--sf-muted)', background: 'none', border: 'none', padding: 0 }}
          onClick={() => updateField('expanded', !expanded)}
        >
          {provider.name || 'Untitled Provider'}
        </button>
        {isDefault && (
          <span
            className="sf-text-caption font-medium rounded-full px-1.5 py-0.5"
            style={{ color: 'var(--sf-muted)', backgroundColor: 'rgb(var(--sf-color-accent-strong-rgb) / 0.08)' }}
          >
            Built-in
          </span>
        )}
        <div className="h-px flex-1" style={{ backgroundColor: 'var(--sf-border)' }} />
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
            className="sf-text-caption cursor-pointer"
            style={{ color: '#A32D2D', background: 'none', border: 'none', padding: 0 }}
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
        <>
          {/* Connection fields */}
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-2">
            <div className="flex flex-col gap-1">
              <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>Provider name</label>
              <input
                className="sf-input sf-input--sm"
                value={provider.name}
                placeholder="My Provider"
                onChange={(e) => updateField('name', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>API key</label>
              <div className="relative">
                <input
                  className="sf-input sf-input--sm w-full pr-10"
                  type={showKey ? 'text' : 'password'}
                  value={provider.apiKey}
                  placeholder="sk-..."
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
          <div className="border-t" style={{ borderColor: 'var(--sf-border)', margin: '4px 0' }} />

          {/* Models sub-section */}
          <div className="sf-text-label font-medium" style={{ color: 'var(--sf-muted)' }}>Models</div>

          {provider.models.length === 0 ? (
            <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>No models configured.</p>
          ) : (
            <div className="sf-table-wrap">
              <table className="sf-table">
                <thead>
                  <tr>
                    <th className="sf-table-th">Model ID</th>
                    <th className="sf-table-th">Role</th>
                    <th className="sf-table-th">In $/1M</th>
                    <th className="sf-table-th">Out $/1M</th>
                    <th className="sf-table-th">Cache $/1M</th>
                    <th className="sf-table-th">Max Context</th>
                    <th className="sf-table-th">Max Output</th>
                    <th className="sf-table-th" />
                  </tr>
                </thead>
                <tbody>
                  {provider.models.map((model) => (
                    <ProviderModelRow
                      key={model.id}
                      model={model}
                      readOnly={isDefault}
                      onModelChange={(updated) => updateModel(model.id, updated)}
                      onRemove={() => removeModel(model.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!isDefault && (
            <button
              className="sf-text-caption font-medium cursor-pointer"
              style={{ color: 'rgb(var(--sf-color-accent-strong-rgb))', background: 'none', border: 'none', padding: 0 }}
              onClick={addModel}
              type="button"
            >
              + Add model
            </button>
          )}
        </>
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
    <div className="flex flex-col gap-2.5">
      {registry.length === 0 ? (
        <section
          className="rounded border px-3 py-8 text-center"
          style={{ borderColor: 'var(--sf-border)', backgroundColor: 'var(--sf-surface)' }}
        >
          <p className="sf-text-label mb-1" style={{ color: 'var(--sf-muted)' }}>No providers configured.</p>
          <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
            Add a provider to define LLM endpoints and models.
          </p>
        </section>
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
        className="w-full rounded border-2 border-dashed py-2.5 sf-text-label font-semibold cursor-pointer transition"
        style={{
          borderColor: 'rgb(var(--sf-color-accent-strong-rgb) / 0.35)',
          backgroundColor: 'rgb(var(--sf-color-accent-strong-rgb) / 0.04)',
          color: 'rgb(var(--sf-color-accent-strong-rgb))',
        }}
        onClick={addProvider}
      >
        + Add Provider
      </button>
    </div>
  );
});
