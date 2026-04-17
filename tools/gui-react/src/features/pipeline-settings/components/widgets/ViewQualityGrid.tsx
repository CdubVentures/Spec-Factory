import type { FinderSettingWidgetProps } from './widgetRegistry.ts';

interface ViewQualityEntry {
  minWidth: number;
  minHeight: number;
  minFileSize: number;
}

const CATEGORY_VIEW_QUALITY_DEFAULTS: Record<string, Record<string, ViewQualityEntry>> = {
  mouse: {
    top: { minWidth: 300, minHeight: 600, minFileSize: 30000 },
    bottom: { minWidth: 300, minHeight: 600, minFileSize: 30000 },
    left: { minWidth: 600, minHeight: 300, minFileSize: 30000 },
    right: { minWidth: 600, minHeight: 300, minFileSize: 30000 },
    front: { minWidth: 400, minHeight: 600, minFileSize: 30000 },
    rear: { minWidth: 400, minHeight: 600, minFileSize: 30000 },
    sangle: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    angle: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    hero: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
  },
  monitor: {
    front: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
    angle: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    rear: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
    left: { minWidth: 250, minHeight: 600, minFileSize: 30000 },
    right: { minWidth: 250, minHeight: 600, minFileSize: 30000 },
    top: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    bottom: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    sangle: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    hero: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
  },
  keyboard: {
    top: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    left: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    right: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    angle: { minWidth: 600, minHeight: 300, minFileSize: 30000 },
    sangle: { minWidth: 600, minHeight: 300, minFileSize: 30000 },
    bottom: { minWidth: 600, minHeight: 250, minFileSize: 30000 },
    front: { minWidth: 600, minHeight: 200, minFileSize: 30000 },
    rear: { minWidth: 600, minHeight: 200, minFileSize: 30000 },
    hero: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
  },
  mousepad: {
    top: { minWidth: 600, minHeight: 400, minFileSize: 30000 },
    angle: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    hero: { minWidth: 600, minHeight: 350, minFileSize: 30000 },
    bottom: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
    left: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
    right: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
    front: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
    rear: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
    sangle: { minWidth: 600, minHeight: 300, minFileSize: 25000 },
  },
};

const GENERIC_VQ_DEFAULT: ViewQualityEntry = { minWidth: 600, minHeight: 400, minFileSize: 30000 };

const VIEW_LABELS: Record<string, string> = {
  top: 'Top', bottom: 'Bottom', left: 'Left', right: 'Right',
  front: 'Front', rear: 'Rear', sangle: 'S-Angle', angle: 'Angle', hero: 'Hero',
};

const ALL_QUALITY_VIEWS = ['top', 'bottom', 'left', 'right', 'front', 'rear', 'sangle', 'angle', 'hero'];

export function ViewQualityGrid({ entry, value, category, isSaving, onSave }: FinderSettingWidgetProps) {
  const catDefaults = CATEGORY_VIEW_QUALITY_DEFAULTS[category] || {};
  const isUsingDefaults = !value || !value.trim();

  let currentConfig: Record<string, Partial<ViewQualityEntry>>;
  try {
    const parsed = JSON.parse(value || '{}');
    currentConfig = typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    currentConfig = {};
  }

  const getVal = (view: string, field: keyof ViewQualityEntry): number => {
    const override = currentConfig[view]?.[field];
    if (override !== undefined && override !== null) return Number(override);
    return (catDefaults[view] ?? GENERIC_VQ_DEFAULT)[field];
  };

  const handleChange = (view: string, field: keyof ViewQualityEntry, next: string) => {
    const updated: Record<string, Partial<ViewQualityEntry>> = { ...currentConfig };
    if (!updated[view]) updated[view] = {};
    updated[view] = { ...updated[view], [field]: Number(next) };
    onSave(entry.key, JSON.stringify(updated));
  };

  const handleReset = () => onSave(entry.key, '');

  return (
    <div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="sf-text-muted">
            <th className="text-left py-2 pl-2 pr-2 font-semibold border sf-border-soft">View</th>
            <th className="text-left py-2 px-2 font-semibold border sf-border-soft">Min Width</th>
            <th className="text-left py-2 px-2 font-semibold border sf-border-soft">Min Height</th>
            <th className="text-left py-2 px-2 font-semibold border sf-border-soft">Min File Size</th>
          </tr>
        </thead>
        <tbody>
          {ALL_QUALITY_VIEWS.map((view) => (
            <tr key={view} className="sf-text-primary">
              <td className="py-1.5 pl-2 pr-2 font-medium border sf-border-soft">{VIEW_LABELS[view] ?? view}</td>
              <td className="py-1.5 px-2 border sf-border-soft">
                <input
                  type="number"
                  value={getVal(view, 'minWidth')}
                  onChange={(e) => handleChange(view, 'minWidth', e.target.value)}
                  disabled={isSaving}
                  className="w-full px-1 py-0.5 sf-text-label text-[11px] bg-transparent outline-none"
                  min="0"
                  max="4000"
                />
              </td>
              <td className="py-1.5 px-2 border sf-border-soft">
                <input
                  type="number"
                  value={getVal(view, 'minHeight')}
                  onChange={(e) => handleChange(view, 'minHeight', e.target.value)}
                  disabled={isSaving}
                  className="w-full px-1 py-0.5 sf-text-label text-[11px] bg-transparent outline-none"
                  min="0"
                  max="4000"
                />
              </td>
              <td className="py-1.5 px-2 border sf-border-soft">
                <input
                  type="number"
                  value={getVal(view, 'minFileSize')}
                  onChange={(e) => handleChange(view, 'minFileSize', e.target.value)}
                  disabled={isSaving}
                  className="w-full px-1 py-0.5 sf-text-label text-[11px] bg-transparent outline-none"
                  min="0"
                  max="10000000"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pt-2 mt-1">
        {isUsingDefaults ? (
          <span className="text-[10px] sf-text-muted">Using {category} defaults</span>
        ) : (
          <button
            onClick={handleReset}
            disabled={isSaving}
            className="text-[10px] px-1.5 py-0.5 rounded sf-btn-ghost sf-text-muted"
          >
            Reset to {category} defaults
          </button>
        )}
      </div>
    </div>
  );
}
