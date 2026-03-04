import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useUiStore } from '../../stores/uiStore';
import { coerceCategories } from '../../components/layout/categoryStoreSync.js';

const sectionCls = 'sf-surface-card rounded p-4';
const chipCls = 'inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm';
const btnPrimary = 'px-4 py-2 text-sm sf-primary-button transition-colors disabled:opacity-50';
const inputCls = 'sf-input px-3 py-1.5 text-sm';

interface CreateCategoryResult {
  ok: boolean;
  error?: string;
  slug?: string;
  categories?: string[];
}

export function CategoryManager() {
  const categories = useUiStore((s) => s.categories);
  const setCategories = useUiStore((s) => s.setCategories);
  const activeCategory = useUiStore((s) => s.category);
  const setCategory = useUiStore((s) => s.setCategory);
  const queryClient = useQueryClient();

  const [newName, setNewName] = useState('');

  const addMut = useMutation({
    mutationFn: (name: string) => api.post<CreateCategoryResult>('/categories', { name }),
    onSuccess: (data) => {
      if (Array.isArray(data.categories)) {
        setCategories(coerceCategories(data.categories));
      }
      queryClient.invalidateQueries({ queryKey: ['categories'] });
      setNewName('');
    },
  });

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    addMut.mutate(name);
  }

  return (
    <div className="space-y-3">
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold">Categories</h3>
            <p className="mt-0.5 text-xs sf-text-subtle">
              {categories.length} categor{categories.length !== 1 ? 'ies' : 'y'}. Select one to set it as the active working category.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
              placeholder="New category name"
              className={`${inputCls} w-48`}
            />
            <button
              onClick={handleAdd}
              disabled={!newName.trim() || addMut.isPending}
              className={btnPrimary}
            >
              {addMut.isPending ? 'Adding...' : '+ Add'}
            </button>
          </div>
        </div>

        {addMut.error && (
          <p className="mb-2 text-xs sf-status-text-danger">{(addMut.error as Error).message}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`${chipCls} transition-colors ${
                activeCategory === cat
                  ? 'bg-accent text-white border-accent'
                  : 'sf-nav-item-muted hover:border-accent'
              }`}
            >
              <span className="font-medium">{cat}</span>
              {activeCategory === cat && (
                <span className="text-xs opacity-75">(active)</span>
              )}
            </button>
          ))}
        </div>

        {categories.length === 0 && (
          <p className="mt-2 text-sm italic sf-text-subtle">No categories found. Add one above to get started.</p>
        )}
      </div>
    </div>
  );
}
