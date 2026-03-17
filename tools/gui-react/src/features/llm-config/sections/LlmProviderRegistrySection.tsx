import { memo, useState, useCallback } from 'react';
import type {
  LlmProviderEntry,
  LlmProviderModel,
  LlmProviderType,
  LlmModelRole,
} from '../types/llmProviderRegistryTypes';
import { createDefaultProvider, createDefaultModel, DEFAULT_BASE_URLS } from '../state/llmProviderRegistryBridge';

const PROVIDER_TYPE_OPTIONS: readonly { value: LlmProviderType; label: string }[] = [
  { value: 'openai-compatible', label: 'OpenAI-Compatible' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'cortex', label: 'Cortex' },
];

const MODEL_ROLE_OPTIONS: readonly { value: LlmModelRole; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'fast', label: 'Fast' },
  { value: 'embedding', label: 'Embedding' },
];

const ROLE_BADGE_STYLE: Record<LlmModelRole, { color: string; bg: string }> = {
  base: { color: '#888780', bg: '#F1EFE8' },
  reasoning: { color: '#534AB7', bg: '#EEEDFE' },
  fast: { color: '#185FA5', bg: '#E6F1FB' },
  embedding: { color: '#0F6E56', bg: '#E1F5EE' },
};

function getProviderStatus(provider: LlmProviderEntry): { label: string; color: string; bg: string } {
  if (!provider.enabled) return { label: 'Disabled', color: '#A32D2D', bg: '#FCEBEB' };
  if (!provider.apiKey && provider.type !== 'ollama' && provider.type !== 'cortex')
    return { label: 'No key', color: '#5F5E5A', bg: '#F1EFE8' };
  if (provider.models.length === 0) return { label: 'No models', color: '#854F0B', bg: '#FAEEDA' };
  return { label: 'Active', color: '#0F6E56', bg: '#E1F5EE' };
}

interface LlmProviderRegistrySectionProps {
  registry: LlmProviderEntry[];
  onRegistryChange: (registry: LlmProviderEntry[]) => void;
}

function ProviderModelRow({
  model,
  onModelChange,
  onRemove,
}: {
  model: LlmProviderModel;
  onModelChange: (updated: LlmProviderModel) => void;
  onRemove: () => void;
}) {
  const roleStyle = ROLE_BADGE_STYLE[model.role];
  return (
    <tr>
      <td className="sf-table-cell">
        <input
          className="sf-input sf-input--sm"
          value={model.modelId}
          placeholder="e.g. gpt-4o"
          onChange={(e) => onModelChange({ ...model, modelId: e.target.value })}
        />
      </td>
      <td className="sf-table-cell">
        <span
          className="inline-flex items-center rounded px-1.5 py-0.5 sf-text-caption font-medium"
          style={{ backgroundColor: roleStyle.bg, color: roleStyle.color }}
        >
          <select
            className="appearance-none bg-transparent border-none p-0 font-medium cursor-pointer outline-none sf-text-caption"
            style={{ color: 'inherit' }}
            value={model.role}
            onChange={(e) => onModelChange({ ...model, role: e.target.value as LlmModelRole })}
          >
            {MODEL_ROLE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </span>
      </td>
      <td className="sf-table-cell">
        <input
          className="sf-input sf-input--sm sf-input--number"
          type="number"
          min={0}
          step={0.01}
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
          value={model.maxOutputTokens ?? ''}
          placeholder="—"
          onChange={(e) => {
            const raw = e.target.value;
            onModelChange({ ...model, maxOutputTokens: raw === '' ? null : (Number(raw) || 0) });
          }}
        />
      </td>
      <td className="sf-table-cell">
        <button
          className="sf-text-caption cursor-pointer"
          style={{ color: 'var(--sf-muted)' }}
          onClick={onRemove}
          title="Remove model"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

function ProviderCard({
  provider,
  onProviderChange,
  onRemove,
}: {
  provider: LlmProviderEntry;
  onProviderChange: (updated: LlmProviderEntry) => void;
  onRemove: () => void;
}) {
  const [showKey, setShowKey] = useState(false);

  const updateField = useCallback(<K extends keyof LlmProviderEntry>(key: K, value: LlmProviderEntry[K]) => {
    onProviderChange({ ...provider, [key]: value });
  }, [provider, onProviderChange]);

  const updateModel = useCallback((modelId: string, updated: LlmProviderModel) => {
    const nextModels = provider.models.map((m) => (m.id === modelId ? updated : m));
    onProviderChange({ ...provider, models: nextModels });
  }, [provider, onProviderChange]);

  const removeModel = useCallback((modelId: string) => {
    onProviderChange({ ...provider, models: provider.models.filter((m) => m.id !== modelId) });
  }, [provider, onProviderChange]);

  const addModel = useCallback(() => {
    onProviderChange({ ...provider, models: [...provider.models, createDefaultModel()] });
  }, [provider, onProviderChange]);

  const status = getProviderStatus(provider);
  const initials = (provider.name || '??').slice(0, 2).toUpperCase();
  const hideKey = provider.type === 'ollama';

  return (
    <div className={`sf-card${provider.enabled ? '' : ' sf-card--disabled'}`}>
      {/* Header row */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full sf-text-caption font-semibold"
            style={{
              backgroundColor: provider.enabled ? '#E6F1FB' : '#F1EFE8',
              color: provider.enabled ? '#185FA5' : '#888780',
            }}
          >
            {initials}
          </div>
          <span className="sf-text-label font-medium" style={{ color: 'var(--sf-text)' }}>
            {provider.name || 'Untitled'}
          </span>
          <span
            className="sf-text-caption px-2 py-0.5 rounded-md font-medium whitespace-nowrap"
            style={{ backgroundColor: status.bg, color: status.color }}
          >
            {status.label}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="sf-toggle-label flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              className="sf-toggle"
              checked={provider.enabled}
              onChange={(e) => updateField('enabled', e.target.checked)}
            />
          </label>
          <button
            className="sf-text-caption cursor-pointer select-none"
            style={{ color: 'var(--sf-muted)' }}
            onClick={() => updateField('expanded', !provider.expanded)}
            type="button"
          >
            {provider.expanded ? '\u25BE collapse' : '\u25B8 expand'}
          </button>
          <button
            className="sf-text-label cursor-pointer leading-none"
            style={{ color: '#A32D2D' }}
            onClick={() => {
              if (window.confirm(`Delete ${provider.name || 'this provider'}? This removes all its models.`))
                onRemove();
            }}
            title="Delete provider"
            type="button"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Expanded body */}
      {provider.expanded && (
        <div className="px-3 pb-3">
          {/* Connection fields — 2-col grid */}
          <div className="grid grid-cols-2 gap-x-3.5 gap-y-2 mb-4">
            <div className="flex flex-col gap-1">
              <label className="sf-text-xs" style={{ color: 'var(--sf-muted)' }}>Provider name</label>
              <input
                className="sf-input sf-input--sm"
                value={provider.name}
                placeholder="My Provider"
                onChange={(e) => updateField('name', e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="sf-text-xs" style={{ color: 'var(--sf-muted)' }}>Provider type</label>
              <select
                className="sf-select sf-select--sm"
                value={provider.type}
                onChange={(e) => {
                  const nextType = e.target.value as LlmProviderType;
                  const defaultUrls = Object.values(DEFAULT_BASE_URLS);
                  const shouldAutoFill = !provider.baseUrl || defaultUrls.includes(provider.baseUrl);
                  onProviderChange({
                    ...provider,
                    type: nextType,
                    baseUrl: shouldAutoFill ? (DEFAULT_BASE_URLS[nextType] ?? '') : provider.baseUrl,
                  });
                }}
              >
                {PROVIDER_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className={`flex flex-col gap-1${hideKey ? ' col-span-2' : ''}`}>
              <label className="sf-text-xs" style={{ color: 'var(--sf-muted)' }}>Base URL</label>
              <input
                className="sf-input sf-input--sm"
                value={provider.baseUrl}
                placeholder="https://api.example.com/v1"
                onChange={(e) => updateField('baseUrl', e.target.value)}
              />
            </div>
            {!hideKey && (
              <div className="flex flex-col gap-1">
                <label className="sf-text-xs" style={{ color: 'var(--sf-muted)' }}>API key</label>
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
                    style={{ color: 'var(--sf-muted)' }}
                    onClick={() => setShowKey(!showKey)}
                    type="button"
                  >
                    {showKey ? 'hide' : 'show'}
                  </button>
                </div>
              </div>
            )}
          </div>
          {provider.type === 'cortex' && (
            <p className="sf-text-caption mb-3" style={{ color: 'var(--sf-muted)' }}>
              Replaces the old Cortex/LLM Lab connection toggle.
            </p>
          )}

          {/* Models table */}
          <div className="sf-text-label font-medium mb-2" style={{ color: 'var(--sf-muted)' }}>Models</div>
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
                    <th className="sf-table-th">Ctx ovr.</th>
                    <th className="sf-table-th">Out ovr.</th>
                    <th className="sf-table-th" />
                  </tr>
                </thead>
                <tbody>
                  {provider.models.map((model) => (
                    <ProviderModelRow
                      key={model.id}
                      model={model}
                      onModelChange={(updated) => updateModel(model.id, updated)}
                      onRemove={() => removeModel(model.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button
            className="sf-text-caption font-medium cursor-pointer mt-1.5"
            style={{ color: 'rgb(var(--sf-color-accent-strong-rgb))' }}
            onClick={addModel}
            type="button"
          >
            + Add model
          </button>
        </div>
      )}
    </div>
  );
}

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
    <section className="sf-section">
      <div className="sf-section-header">
        <h3 className="sf-section-title">Provider Registry</h3>
      </div>

      {registry.length === 0 ? (
        <div
          className="sf-card text-center py-8"
          style={{ color: 'var(--sf-muted)' }}
        >
          <p className="sf-text-label mb-2">No providers configured.</p>
          <p className="sf-text-caption">Add a provider to define custom LLM endpoints and models.</p>
        </div>
      ) : (
        <div className="sf-section-list">
          {registry.map((provider) => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onProviderChange={(updated) => updateProvider(provider.id, updated)}
              onRemove={() => removeProvider(provider.id)}
            />
          ))}
        </div>
      )}

      <button
        className="w-full py-3 sf-text-label font-medium cursor-pointer rounded-lg mt-2"
        style={{
          border: '2px dashed var(--sf-border)',
          background: 'transparent',
          color: 'rgb(var(--sf-color-accent-strong-rgb))',
        }}
        onClick={addProvider}
        type="button"
      >
        + Add provider
      </button>
    </section>
  );
});
