import type { FinderSettingWidgetProps } from './widgetRegistry.ts';

// WHY: Claude vision tiles images into 512x512 blocks (~170 tokens each).
// Surfacing the cost jump at tile boundaries (512 -> 1024 -> 1536) keeps the
// thumbnail-size knob honest about token spend.
const TILE_SIZE = 512;
const TOKENS_PER_TILE = 170;

export function EvalTokenEstimate({ entry, value, isSaving, onSave }: FinderSettingWidgetProps) {
  const raw = parseInt(value, 10);
  const size = Number.isFinite(raw) ? raw : Number(entry.default) || 768;
  const clamped = Math.max(entry.min ?? 256, Math.min(entry.max ?? 2048, size));
  const tilesPerSide = Math.ceil(clamped / TILE_SIZE);
  const tiles = tilesPerSide * tilesPerSide;
  const tokensPerImage = tiles * TOKENS_PER_TILE;
  const ceiling = tilesPerSide * TILE_SIZE;

  return (
    <div className="sf-surface-elevated sf-border-soft rounded p-3 space-y-2">
      <div className="flex items-center gap-3">
        <input
          type="number"
          className="sf-input w-24 text-center font-mono"
          defaultValue={value}
          min={entry.min}
          max={entry.max}
          step={128}
          disabled={isSaving}
          onBlur={(e) => { if (e.target.value !== value) onSave(entry.key, e.target.value); }}
        />
        <span className="sf-text-caption sf-text-muted">
          px ({entry.min ?? 256}–{entry.max ?? 2048}, step 128)
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] pt-1 border-t sf-border-soft">
        <span className="sf-text-muted">Thumbnail</span>
        <span className="sf-text-primary font-medium text-right">{clamped}×{clamped} px</span>
        <span className="sf-text-muted">Tiles ({TILE_SIZE}px each)</span>
        <span className="sf-text-primary font-medium text-right">{tiles} ({tilesPerSide}×{tilesPerSide})</span>
        <span className="sf-text-muted">~Tokens / image</span>
        <span className="sf-text-primary font-semibold text-right">{tokensPerImage.toLocaleString()}</span>
        <span className="sf-text-muted">~Tokens / 4 candidates</span>
        <span className="sf-text-primary font-semibold text-right">{(tokensPerImage * 4).toLocaleString()}</span>
      </div>
      {clamped < ceiling && (
        <p className="text-[10px] sf-text-muted leading-snug italic">
          Same cost up to {ceiling}px — {ceiling} uses the same {tiles}-tile grid.
        </p>
      )}
    </div>
  );
}
