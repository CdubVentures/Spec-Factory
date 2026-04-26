import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useDataChangeMutation } from '../../data-change/index.js';
import type { ColorEntry } from '../types.ts';
import { buildColorMatrix } from '../utils/buildColorMatrix.ts';
import { ColorMatrixView } from './ColorMatrixView.tsx';
import { AddColorForm } from './AddColorForm.tsx';
import { AddGroupForm } from './AddGroupForm.tsx';
import { btnPrimary } from '../../../shared/ui/buttonClasses.ts';
import { inputCls } from '../../../utils/studioConstants.ts';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';

export function ColorRegistryPage() {
  const [search, setSearch] = useState('');
  const [showAddColor, setShowAddColor] = useState(false);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [extraPrefixes, setExtraPrefixes] = useState<string[]>([]);

  const { data: colors = [], isLoading } = useQuery<ColorEntry[]>({
    queryKey: ['colors'],
    queryFn: () => api.get<ColorEntry[]>('/colors'),
  });

  const addMut = useDataChangeMutation<unknown, Error, { name: string; hex: string }>({
    event: 'color-add',
    mutationFn: (body: { name: string; hex: string }) => api.post('/colors', body),
  });

  const updateMut = useDataChangeMutation<unknown, Error, { name: string; hex: string }>({
    event: 'color-update',
    mutationFn: ({ name, hex }: { name: string; hex: string }) => api.put(`/colors/${name}`, { hex }),
  });

  const deleteMut = useDataChangeMutation<unknown, Error, string>({
    event: 'color-delete',
    mutationFn: (name: string) => api.del(`/colors/${name}`),
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return colors;
    const q = search.trim().toLowerCase();
    return colors.filter((c) => c.name.includes(q) || c.hex.includes(q));
  }, [colors, search]);

  const matrix = useMemo(
    () => buildColorMatrix(filtered, extraPrefixes),
    [filtered, extraPrefixes],
  );

  const existingNames = useMemo(() => new Set(colors.map((c) => c.name)), [colors]);

  const handleAddBaseColor = useCallback((name: string, hex: string) => {
    addMut.mutate({ name, hex });
  }, [addMut]);

  const handleAddVariant = useCallback((name: string, hex: string) => {
    addMut.mutate({ name, hex });
  }, [addMut]);

  const handleUpdateHex = useCallback((name: string, hex: string) => {
    updateMut.mutate({ name, hex });
  }, [updateMut]);

  const handleDelete = useCallback((name: string) => {
    deleteMut.mutate(name);
  }, [deleteMut]);

  const handleAddPrefix = useCallback((prefix: string) => {
    setExtraPrefixes((prev) => [...prev, prefix]);
    setShowAddGroup(false);
  }, []);

  if (isLoading) return <Spinner className="h-8 w-8 mx-auto mt-12" />;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-4">
        <h1 className="text-lg font-semibold sf-text-primary">Color Registry</h1>
        <span className="sf-text-subtle text-xs font-mono">
          {colors.length} colors
        </span>
        <div className="flex-1" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${inputCls} max-w-xs text-sm`}
          placeholder="Search colors..."
        />
        <button
          className={btnPrimary}
          onClick={() => { setShowAddColor(!showAddColor); setShowAddGroup(false); }}
        >
          {showAddColor ? 'Close' : '+ Base Color'}
        </button>
        <button
          className={btnPrimary}
          onClick={() => { setShowAddGroup(!showAddGroup); setShowAddColor(false); }}
        >
          {showAddGroup ? 'Close' : '+ Add Group'}
        </button>
      </div>

      {showAddColor && (
        <AddColorForm
          onAdd={handleAddBaseColor}
          onCancel={() => setShowAddColor(false)}
          existingNames={existingNames}
        />
      )}

      {showAddGroup && (
        <AddGroupForm
          onAdd={handleAddPrefix}
          onCancel={() => setShowAddGroup(false)}
          existingPrefixes={[...matrix.prefixes]}
        />
      )}

      {addMut.error && (
        <p className="mb-2 text-xs sf-status-text-danger">
          {(addMut.error as Error).message}
        </p>
      )}

      <ColorMatrixView
        matrix={matrix}
        onAddColor={handleAddVariant}
        onUpdateHex={handleUpdateHex}
        onDelete={handleDelete}
      />

      {matrix.rows.length === 0 && search.trim() && (
        <p className="text-center sf-text-subtle text-sm mt-8">
          No colors match &quot;{search}&quot;
        </p>
      )}
    </div>
  );
}
