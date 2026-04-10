import { useState, useMemo, useCallback } from 'react';
import { useUnitRegistryQuery, useUpsertUnitMutation, useDeleteUnitMutation } from './unitRegistryQueries.ts';
import type { UnitRegistryEntry, UnitConversion } from './unitRegistryTypes.ts';
import { btnPrimary } from '../../shared/ui/buttonClasses.ts';
import { inputCls } from '../../utils/studioConstants.ts';

// ── Unit grouping (presentation-only, fallback = "Other") ────────────

const GROUP_ORDER = [
  'Mass', 'Length', 'Area', 'Volume',
  'Frequency', 'Time',
  'Electrical', 'Data',
  'Display', 'Input', 'Audio',
  'Thermal', 'Airflow',
  'Compute', 'Durability',
  'Angle', 'Ratio',
  'Currency', 'Connectivity', 'Other',
] as const;

type UnitGroup = typeof GROUP_ORDER[number];

const UNIT_GROUP_MAP: Record<string, UnitGroup> = {
  // Mass
  g: 'Mass', gf: 'Mass', kg: 'Mass', lb: 'Mass', oz: 'Mass',
  // Length
  nm: 'Length', mm: 'Length', cm: 'Length', m: 'Length', in: 'Length', ft: 'Length',
  // Area
  mm2: 'Area', cm2: 'Area', in2: 'Area',
  // Volume
  L: 'Volume',
  // Frequency
  Hz: 'Frequency', kHz: 'Frequency', MHz: 'Frequency', GHz: 'Frequency',
  // Time
  ns: 'Time', us: 'Time', ms: 'Time', s: 'Time', min: 'Time', h: 'Time',
  // Electrical (voltage, current, power, resistance, energy)
  V: 'Electrical', mV: 'Electrical', A: 'Electrical', mA: 'Electrical',
  W: 'Electrical', mW: 'Electrical', kW: 'Electrical',
  ohm: 'Electrical', mAh: 'Electrical', Ah: 'Electrical', Wh: 'Electrical',
  // Data (storage + transfer rates)
  bit: 'Data', B: 'Data', KB: 'Data', MB: 'Data', GB: 'Data', TB: 'Data',
  Mbps: 'Data', Gbps: 'Data',
  'MB/s': 'Data', 'GB/s': 'Data', 'TB/s': 'Data',
  'GT/s': 'Data', 'MT/s': 'Data',
  // Display
  nits: 'Display', ppi: 'Display', dpi: 'Display', px: 'Display', MP: 'Display',
  // Input / tracking
  ips: 'Input', G: 'Input', cpi: 'Input',
  // Audio
  dB: 'Audio', dBA: 'Audio', 'dB SPL': 'Audio', dBm: 'Audio', 'mV/Pa': 'Audio',
  // Thermal
  C: 'Thermal', F: 'Thermal',
  // Airflow
  CFM: 'Airflow', mmH2O: 'Airflow', Pa: 'Airflow', RPM: 'Airflow',
  // Compute
  TFLOPS: 'Compute', GFLOPS: 'Compute', TOPS: 'Compute',
  // Durability
  'million keystrokes': 'Durability', 'million clicks': 'Durability', 'million scroll steps': 'Durability',
  // Angle
  deg: 'Angle',
  // Ratio
  '%': 'Ratio',
  // Currency
  usd: 'Currency', eur: 'Currency', gbp: 'Currency',
  // Connectivity
  AWG: 'Connectivity',
};

function getUnitGroup(canonical: string): UnitGroup {
  return UNIT_GROUP_MAP[canonical] ?? 'Other';
}

interface GroupedSection { group: UnitGroup; units: UnitRegistryEntry[] }

function groupUnits(units: UnitRegistryEntry[]): GroupedSection[] {
  const buckets = new Map<UnitGroup, UnitRegistryEntry[]>();
  for (const u of units) {
    const g = getUnitGroup(u.canonical);
    if (!buckets.has(g)) buckets.set(g, []);
    buckets.get(g)!.push(u);
  }
  return GROUP_ORDER
    .filter(g => buckets.has(g))
    .map(g => ({ group: g, units: buckets.get(g)! }));
}

// ── Inline edit drawer ──────────────────────────────────────────────

interface EditDrawerProps {
  entry: UnitRegistryEntry | null;
  onSave: (e: UnitRegistryEntry) => void;
  onCancel: () => void;
  onDelete?: (canonical: string) => void;
}

function EditDrawer({ entry, onSave, onCancel, onDelete }: EditDrawerProps) {
  const isNew = !entry;
  const [canonical, setCanonical] = useState(entry?.canonical ?? '');
  const [label, setLabel] = useState(entry?.label ?? '');
  const [synonymsText, setSynonymsText] = useState((entry?.synonyms ?? []).join(', '));
  const [conversions, setConversions] = useState<UnitConversion[]>(entry?.conversions ?? []);

  function handleAddConversion() {
    setConversions(prev => [...prev, { from: '', factor: 1 }]);
  }

  function handleRemoveConversion(idx: number) {
    setConversions(prev => prev.filter((_, i) => i !== idx));
  }

  function handleConversionChange(idx: number, field: 'from' | 'factor', value: string) {
    setConversions(prev => prev.map((c, i) => {
      if (i !== idx) return c;
      return field === 'from' ? { ...c, from: value } : { ...c, factor: Number(value) || 0 };
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canonical.trim()) return;
    onSave({
      canonical: canonical.trim(),
      label: label.trim(),
      synonyms: synonymsText.split(',').map(s => s.trim()).filter(Boolean),
      conversions: conversions.filter(c => c.from.trim()),
    });
  }

  return (
    <div className="sf-surface-overlay rounded-lg p-5 shadow-lg sf-border-soft border mb-4">
      <h3 className="text-lg font-semibold sf-text-primary mb-4">{isNew ? 'Add Unit' : `Edit: ${entry?.canonical}`}</h3>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="sf-text-caption font-medium mb-1 block">Canonical Name</label>
            <input className={inputCls} value={canonical} onChange={e => setCanonical(e.target.value)}
              placeholder="e.g. Hz" disabled={!isNew} />
          </div>
          <div>
            <label className="sf-text-caption font-medium mb-1 block">Display Label</label>
            <input className={inputCls} value={label} onChange={e => setLabel(e.target.value)}
              placeholder="e.g. Hertz" />
          </div>
        </div>

        <div>
          <label className="sf-text-caption font-medium mb-1 block">Synonyms (comma-separated)</label>
          <input className={inputCls} value={synonymsText} onChange={e => setSynonymsText(e.target.value)}
            placeholder="e.g. hz, hertz" />
        </div>

        <div>
          <label className="sf-text-caption font-medium mb-2 block">Conversions</label>
          <div className="space-y-2">
            {conversions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs sf-text-muted w-16">1 {canonical || '?'} =</span>
                <input className={`${inputCls} w-24`} type="number" step="any" value={c.factor}
                  onChange={e => handleConversionChange(i, 'factor', e.target.value)} />
                <input className={`${inputCls} flex-1`} value={c.from}
                  onChange={e => handleConversionChange(i, 'from', e.target.value)}
                  placeholder="from unit (e.g. lb)" />
                <button type="button" onClick={() => handleRemoveConversion(i)}
                  className="text-xs sf-text-danger hover:underline">remove</button>
              </div>
            ))}
          </div>
          <button type="button" onClick={handleAddConversion}
            className="text-xs sf-text-accent hover:underline mt-1">+ add conversion</button>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <button type="submit" className={btnPrimary}>{isNew ? 'Add Unit' : 'Save'}</button>
            <button type="button" onClick={onCancel} className="text-xs sf-text-muted hover:underline">Cancel</button>
          </div>
          {!isNew && onDelete && (
            <button type="button" onClick={() => onDelete(entry.canonical)}
              className="text-xs sf-text-danger hover:underline">Delete unit</button>
          )}
        </div>
      </form>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────

export function UnitRegistryPage() {
  const { data, isLoading } = useUnitRegistryQuery();
  const upsertMut = useUpsertUnitMutation();
  const deleteMut = useDeleteUnitMutation();

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<UnitRegistryEntry | null | 'new'>(null);

  const units = useMemo(() => {
    const all = data?.units ?? [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter(u =>
      u.canonical.toLowerCase().includes(q)
      || u.label.toLowerCase().includes(q)
      || u.synonyms.some(s => s.toLowerCase().includes(q)),
    );
  }, [data, search]);

  const grouped = useMemo(() => groupUnits(units), [units]);
  const totalCount = (data?.units ?? []).length;

  const handleSave = useCallback((entry: UnitRegistryEntry) => {
    upsertMut.mutate(entry, { onSuccess: () => setEditing(null) });
  }, [upsertMut]);

  const handleDelete = useCallback((canonical: string) => {
    deleteMut.mutate(canonical, { onSuccess: () => setEditing(null) });
  }, [deleteMut]);

  if (isLoading) {
    return <div className="p-6 sf-text-muted">Loading unit registry...</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold sf-text-primary">Unit Registry</h1>
          <p className="text-xs sf-text-muted mt-0.5">
            {totalCount} unit{totalCount === 1 ? '' : 's'} across {grouped.length} categor{grouped.length === 1 ? 'y' : 'ies'}
          </p>
        </div>
        <div className="flex items-stretch gap-2">
          <input
            className="sf-input rounded border px-3 py-2 text-sm sf-text-label w-64"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search units..."
          />
          <button
            className={`${btnPrimary} whitespace-nowrap`}
            onClick={() => setEditing('new')}
          >
            + Add Unit
          </button>
        </div>
      </div>

      {/* ── Edit drawer ─────────────────────────────────────────── */}
      {editing && (
        <EditDrawer
          entry={editing === 'new' ? null : editing}
          onSave={handleSave}
          onCancel={() => setEditing(null)}
          onDelete={editing !== 'new' ? handleDelete : undefined}
        />
      )}

      {/* ── Grouped table ───────────────────────────────────────── */}
      {grouped.length > 0 && (
        <div className="sf-surface rounded-lg sf-border-soft border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="sf-surface-muted text-left">
                <th className="px-4 py-2.5 font-medium sf-text-caption w-28">Unit</th>
                <th className="px-4 py-2.5 font-medium sf-text-caption w-36">Label</th>
                <th className="px-4 py-2.5 font-medium sf-text-caption w-44">Synonyms</th>
                <th className="px-4 py-2.5 font-medium sf-text-caption">Formulas</th>
                <th className="px-4 py-2.5 font-medium sf-text-caption w-16" />
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ group, units: groupEntries }) => (
                <GroupSection
                  key={group}
                  group={group}
                  entries={groupEntries}
                  onEdit={setEditing}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────────── */}
      {grouped.length === 0 && (
        <div className="sf-surface rounded-lg sf-border-soft border p-10 text-center sf-text-muted">
          {search
            ? 'No units match your search.'
            : 'No units registered yet. Click "+ Add Unit" to get started.'}
        </div>
      )}

      {/* ── Footer ──────────────────────────────────────────────── */}
      <p className="text-xs sf-text-muted mt-4">
        The validator uses this registry for synonym resolution and unit conversion.
      </p>
    </div>
  );
}

// ── Group section (header row + unit rows) ───────────────────────────

interface GroupSectionProps {
  group: UnitGroup;
  entries: UnitRegistryEntry[];
  onEdit: (entry: UnitRegistryEntry) => void;
  onDelete: (canonical: string) => void;
}

function GroupSection({ group, entries, onEdit, onDelete }: GroupSectionProps) {
  return (
    <>
      <tr>
        <td colSpan={5} className="px-4 pt-4 pb-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider sf-text-muted">
              {group}
            </span>
            <span className="text-xs sf-text-muted">({entries.length})</span>
            <div className="flex-1 border-b sf-border-soft" />
          </div>
        </td>
      </tr>
      {entries.map(u => (
        <tr
          key={u.canonical}
          className="sf-border-soft border-t hover:sf-surface-hover cursor-pointer transition-colors"
          onClick={() => onEdit(u)}
        >
          {/* ── Canonical badge ── */}
          <td className="px-4 py-2.5">
            <span className="inline-block font-mono text-xs font-bold sf-text-accent sf-surface-muted px-2.5 py-1 rounded-md">
              {u.canonical}
            </span>
          </td>

          {/* ── Label ── */}
          <td className="px-4 py-2.5 sf-text-label font-medium text-sm">
            {u.label}
          </td>

          {/* ── Synonyms ── */}
          <td className="px-4 py-2.5">
            {u.synonyms.length > 0
              ? (
                <div className="flex flex-wrap gap-1">
                  {u.synonyms.map(s => (
                    <span key={s} className="inline-block text-xs sf-text-muted sf-surface-muted px-1.5 py-0.5 rounded">
                      {s}
                    </span>
                  ))}
                </div>
              )
              : <span className="text-xs sf-text-muted">&mdash;</span>
            }
          </td>

          {/* ── Formulas ── */}
          <td className="px-4 py-2.5">
            {u.conversions.length > 0
              ? (
                <div className="space-y-0.5">
                  {u.conversions.map((c, i) => (
                    <div key={i} className="text-xs font-mono sf-text-label leading-relaxed">
                      <span className="sf-text-muted">1</span>{' '}
                      <span className="font-semibold">{c.from}</span>{' '}
                      <span className="sf-text-muted">=</span>{' '}
                      <span className="font-semibold">{c.factor}</span>{' '}
                      <span className="sf-text-accent">{u.canonical}</span>
                    </div>
                  ))}
                </div>
              )
              : <span className="text-xs sf-text-muted">&mdash;</span>
            }
          </td>

          {/* ── Delete ── */}
          <td className="px-4 py-2.5 text-right">
            <button
              onClick={e => { e.stopPropagation(); onDelete(u.canonical); }}
              className="text-xs sf-text-danger hover:underline"
            >
              delete
            </button>
          </td>
        </tr>
      ))}
    </>
  );
}
