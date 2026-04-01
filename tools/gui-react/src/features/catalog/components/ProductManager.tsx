import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { useUiStore } from '../../../stores/uiStore.ts';
import { useProductStore } from '../state/productStore.ts';
import { usePersistedToggle } from '../../../stores/collapseStore.ts';
import { usePersistedTab } from '../../../stores/tabStore.ts';
import { DataTable } from '../../../shared/ui/data-display/DataTable.tsx';
import { Spinner } from '../../../shared/ui/feedback/Spinner.tsx';
import BulkPasteGrid, { type BulkGridRow } from '../../../shared/ui/forms/BulkPasteGrid.tsx';
import { invalidateFieldRulesQueries } from '../../studio/index.ts';

import { btnPrimary, btnSecondary, btnDanger, sectionCls } from '../../../shared/ui/buttonClasses.ts';
const inputCls = 'px-2 py-1.5 text-sm border sf-border-soft sf-border-soft rounded bg-white sf-bg-surface-soft-strong sf-text-subtle dark:placeholder:sf-text-muted placeholder:italic';
const labelCls = 'text-xs font-medium sf-text-muted sf-text-subtle mb-1 block';
const selectCls = 'px-2 py-1.5 text-sm border sf-border-soft sf-border-soft rounded bg-white sf-bg-surface-soft-strong';

// ── Types ──────────────────────────────────────────────────────────
import type { CatalogProduct, Brand } from '../../../types/product.ts';
import type { MutationResult, BulkPreviewStatus, BulkPreviewRow, BulkImportResultRow, BulkImportResult } from './productManagerTypes.ts';
import { PRODUCT_STATUS_VALUES, cleanVariantToken, isFabricatedVariantToken, isHeaderRow, relativeTime } from './productHelpers.ts';
import { PRODUCT_TABLE_COLUMNS } from './productTableColumns.tsx';

// ── Component ──────────────────────────────────────────────────────
export function ProductManager() {
  const category = useUiStore((s) => s.category);
  const queryClient = useQueryClient();
  const selectedProductId = useProductStore((s) => s.selectedProductId);
  const setSelectedProduct = useProductStore((s) => s.setSelectedProduct);

  // Drawer state
  const [drawerOpen, , setDrawerOpen] = usePersistedToggle(`catalog:products:drawerOpen:${category}`, false);
  const [persistedSelectedProduct, setPersistedSelectedProduct] = usePersistedTab<string>(
    `catalog:products:selectedProduct:${category}`,
    '',
  );
  const [editPid, setEditPid] = useState<string | null>(() => persistedSelectedProduct || null);
  const [addDraftBrand, setAddDraftBrand] = usePersistedTab<string>(
    `catalog:products:addDraft:brand:${category}`,
    '',
  );
  const [addDraftModel, setAddDraftModel] = usePersistedTab<string>(
    `catalog:products:addDraft:model:${category}`,
    '',
  );
  const [addDraftVariant, setAddDraftVariant] = usePersistedTab<string>(
    `catalog:products:addDraft:variant:${category}`,
    '',
  );
  const [addDraftSeedUrls, setAddDraftSeedUrls] = usePersistedTab<string>(
    `catalog:products:addDraft:seedUrls:${category}`,
    '',
  );
  const [addDraftStatus, setAddDraftStatus] = usePersistedTab<(typeof PRODUCT_STATUS_VALUES)[number]>(
    `catalog:products:addDraft:status:${category}`,
    'active',
    { validValues: PRODUCT_STATUS_VALUES },
  );
  const [formBrand, setFormBrand] = useState('');
  const [formModel, setFormModel] = useState('');
  const [formVariant, setFormVariant] = useState('');
  const [formSeedUrls, setFormSeedUrls] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  // Track original values for change detection
  const [origBrand, setOrigBrand] = useState('');
  const [origModel, setOrigModel] = useState('');
  const [origVariant, setOrigVariant] = useState('');
  const [origStatus, setOrigStatus] = useState('active');
  const [origSeedUrls, setOrigSeedUrls] = useState('');
  // Confirmation state (delete only — identity changes save directly)
  const [confirmAction, setConfirmAction] = useState<'delete' | null>(null);
  const [confirmInput, setConfirmInput] = useState('');
  // Bulk paste modal state
  const [bulkOpen, , setBulkOpen] = usePersistedToggle(`catalog:products:bulkOpen:${category}`, false);
  const [bulkBrand, setBulkBrand] = usePersistedTab<string>(`catalog:products:bulkBrand:${category}`, '');
  const [bulkGridRows, setBulkGridRows] = useState<BulkGridRow[]>([]);
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null);
  const hydratedEditPidRef = useRef('');

  // ── Queries ────────────────────────────────────────────────────
  const { data: products = [], isLoading } = useQuery<CatalogProduct[]>({
    queryKey: ['catalog-products', category],
    queryFn: () => api.get<CatalogProduct[]>(`/catalog/${category}/products`),
  });

  const { data: brands = [] } = useQuery<Brand[]>({
    queryKey: ['brands', category],
    queryFn: () => api.get<Brand[]>(`/brands?category=${category}`),
  });

  // ── Mutations ──────────────────────────────────────────────────
  const addMut = useMutation({
    mutationFn: (body: { brand: string; model: string; variant: string; seedUrls: string[] }) =>
      api.post<MutationResult>(`/catalog/${category}/products`, body),
    onSuccess: () => { invalidate(); closeDrawer(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ pid, patch }: { pid: string; patch: Record<string, unknown> }) =>
      api.put<MutationResult>(`/catalog/${category}/products/${pid}`, patch),
    onSuccess: () => {
      invalidate();
      closeDrawer();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (pid: string) => api.del<MutationResult>(`/catalog/${category}/products/${pid}`),
    onSuccess: (_data, pid) => {
      invalidate();
      closeDrawer();
      if (pid === selectedProductId) setSelectedProduct('');
    },
  });

  const bulkMut = useMutation({
    mutationFn: (payload: { brand: string; rows: Array<{ model: string; variant: string }> }) =>
      api.post<BulkImportResult>(`/catalog/${category}/products/bulk`, payload),
    onSuccess: (data) => {
      invalidate();
      setBulkResult(data);
      if ((data?.created ?? 0) > 0) {
        setTimeout(() => setBulkResult(null), 10000);
      }
    },
  });

  function invalidate() {
    invalidateFieldRulesQueries(queryClient, category);
  }

  // ── Drawer helpers ─────────────────────────────────────────────
  function openAdd() {
    hydratedEditPidRef.current = '';
    setEditPid(null);
    setFormBrand(addDraftBrand || (brands.length > 0 ? brands[0].canonical_name : ''));
    setFormModel(addDraftModel);
    setFormVariant(addDraftVariant);
    setFormSeedUrls(addDraftSeedUrls);
    setFormStatus(addDraftStatus);
    setDrawerOpen(true);
  }

  function openEdit(product: CatalogProduct) {
    hydratedEditPidRef.current = product.productId;
    setEditPid(product.productId);
    setSelectedProduct(product.productId, product.brand, product.model, product.variant);
    setFormBrand(product.brand);
    setFormModel(product.model);
    setFormVariant(product.variant || '');
    setOrigBrand(product.brand);
    setOrigModel(product.model);
    setOrigVariant(product.variant || '');
    const urls = (product.seed_urls || []).join('\n');
    setFormSeedUrls(urls);
    setOrigSeedUrls(urls);
    setFormStatus(product.status || 'active');
    setOrigStatus(product.status || 'active');
    setConfirmAction(null);
    setConfirmInput('');
    setDrawerOpen(true);
  }

  function closeDrawer() {
    hydratedEditPidRef.current = '';
    setDrawerOpen(false);
    setEditPid(null);
    setConfirmAction(null);
    setConfirmInput('');
  }

  useEffect(() => {
    const next = editPid || '';
    if (persistedSelectedProduct === next) return;
    setPersistedSelectedProduct(next);
  }, [editPid, persistedSelectedProduct, setPersistedSelectedProduct]);

  useEffect(() => {
    hydratedEditPidRef.current = '';
    setEditPid(persistedSelectedProduct || null);
  }, [category, persistedSelectedProduct]);

  useEffect(() => {
    if (!drawerOpen || !editPid) return;
    if (hydratedEditPidRef.current === editPid) return;
    const product = products.find((row) => row.productId === editPid);
    if (!product) return;
    hydratedEditPidRef.current = editPid;
    setFormBrand(product.brand);
    setFormModel(product.model);
    setFormVariant(product.variant || '');
    setOrigBrand(product.brand);
    setOrigModel(product.model);
    setOrigVariant(product.variant || '');
    const urls = (product.seed_urls || []).join('\n');
    setFormSeedUrls(urls);
    setOrigSeedUrls(urls);
    setFormStatus(product.status || 'active');
    setOrigStatus(product.status || 'active');
    setConfirmAction(null);
    setConfirmInput('');
  }, [drawerOpen, editPid, products]);

  useEffect(() => {
    if (!drawerOpen || editPid) return;
    setAddDraftBrand(formBrand);
    setAddDraftModel(formModel);
    setAddDraftVariant(formVariant);
    setAddDraftSeedUrls(formSeedUrls);
    setAddDraftStatus(formStatus === 'inactive' ? 'inactive' : 'active');
  }, [
    drawerOpen,
    editPid,
    formBrand,
    formModel,
    formVariant,
    formSeedUrls,
    formStatus,
    setAddDraftBrand,
    setAddDraftModel,
    setAddDraftVariant,
    setAddDraftSeedUrls,
    setAddDraftStatus,
  ]);

  // ── Change detection ──────────────────────────────────────────
  const hasIdentityChange = Boolean(editPid && (formBrand !== origBrand || formModel !== origModel || formVariant !== origVariant));
  const isStatusChange = Boolean(editPid && formStatus !== origStatus);
  const isSeedUrlChange = Boolean(editPid && formSeedUrls !== origSeedUrls);
  const hasAnyChange = hasIdentityChange || isStatusChange || isSeedUrlChange;

  // The confirmation phrase the user must type for delete
  const deleteConfirmPhrase = editPid || '';

  function handleSave() {
    // New product — no confirmation needed
    if (!editPid) {
      const seedUrls = formSeedUrls.split('\n').map((u) => u.trim()).filter(Boolean);
      addMut.mutate({ brand: formBrand, model: formModel, variant: formVariant, seedUrls });
      return;
    }
    const seedUrls = formSeedUrls.split('\n').map((u) => u.trim()).filter(Boolean);
    updateMut.mutate({
      pid: editPid,
      patch: { brand: formBrand, model: formModel, variant: formVariant, seed_urls: seedUrls, status: formStatus },
    });
  }

  function handleDelete() {
    if (confirmAction !== 'delete') {
      setConfirmAction('delete');
      setConfirmInput('');
      return;
    }
    if (editPid) {
      deleteMut.mutate(editPid);
    }
  }

  const isFormValid = formBrand.trim().length > 0 && formModel.trim().length > 0;
  const isSaving = addMut.isPending || updateMut.isPending;
  const saveError = addMut.error || updateMut.error;

  // Compute next available numeric ID from existing products
  const nextId = useMemo(() => {
    const usedIds = new Set<number>();
    for (const p of products) {
      if (p.id) usedIds.add(Number(p.id));
    }
    for (let i = 1; ; i++) {
      if (!usedIds.has(i)) return i;
    }
  }, [products]);

  // Brand names for the dropdown
  const brandNames = useMemo(() => {
    const set = new Set<string>();
    brands.forEach((b) => set.add(b.canonical_name));
    products.forEach((p) => set.add(p.brand));
    return [...set].sort();
  }, [brands, products]);

  const existingIdentityKeys = useMemo(() => {
    return new Set(products.map((p) =>
      `${(p.brand || '').toLowerCase()}||${(p.model || '').toLowerCase()}||${(p.variant || '').toLowerCase()}`
    ));
  }, [products]);

  const bulkPreviewRows = useMemo<BulkPreviewRow[]>(() => {
    const brand = String(bulkBrand || '').trim();
    const rows: BulkPreviewRow[] = [];
    const seenInPaste = new Set<string>();
    const gridEntries = bulkGridRows.filter((r) => r.col1.trim() || r.col2.trim());

    for (let i = 0; i < gridEntries.length; i += 1) {
      const entry = gridEntries[i];
      const raw = `${entry.col1}\t${entry.col2}`.trim();
      const model = String(entry.col1 || '').trim();
      const variant = String(entry.col2 || '').trim();

      if (isHeaderRow(model, variant)) {
        rows.push({
          rowNumber: i + 1,
          raw,
          brand: '',
          model,
          variant,
          status: 'invalid',
          reason: 'Header row',
          productId: ''
        });
        continue;
      }

      if (!brand) {
        rows.push({
          rowNumber: i + 1,
          raw,
          brand: '',
          model,
          variant,
          status: 'invalid',
          reason: 'Select a brand',
          productId: ''
        });
        continue;
      }

      if (!model) {
        rows.push({
          rowNumber: i + 1,
          raw,
          brand,
          model: '',
          variant,
          status: 'invalid',
          reason: 'Model is required',
          productId: ''
        });
        continue;
      }

      const normalizedVariant = isFabricatedVariantToken(model, variant)
        ? ''
        : cleanVariantToken(variant);
      const identityKey = `${brand.toLowerCase()}||${model.toLowerCase()}||${normalizedVariant.toLowerCase()}`;

      if (seenInPaste.has(identityKey)) {
        rows.push({
          rowNumber: i + 1,
          raw,
          brand,
          model,
          variant: normalizedVariant,
          status: 'duplicate_in_paste',
          reason: 'Duplicate within pasted list',
          productId: ''
        });
        continue;
      }
      seenInPaste.add(identityKey);

      if (existingIdentityKeys.has(identityKey)) {
        rows.push({
          rowNumber: i + 1,
          raw,
          brand,
          model,
          variant: normalizedVariant,
          status: 'already_exists',
          reason: 'Already in catalog',
          productId: ''
        });
        continue;
      }

      rows.push({
        rowNumber: i + 1,
        raw,
        brand,
        model,
        variant: normalizedVariant,
        status: 'ready',
        reason: 'Ready',
        productId: ''
      });
    }

    return rows;
  }, [bulkBrand, bulkGridRows, existingIdentityKeys]);

  const bulkCounts = useMemo(() => {
    const counts = { ready: 0, existing: 0, duplicate: 0, invalid: 0 };
    for (const row of bulkPreviewRows) {
      if (row.status === 'ready') counts.ready += 1;
      else if (row.status === 'already_exists') counts.existing += 1;
      else if (row.status === 'duplicate_in_paste') counts.duplicate += 1;
      else counts.invalid += 1;
    }
    return counts;
  }, [bulkPreviewRows]);

  const bulkRowsToSubmit = useMemo(() => {
    return bulkPreviewRows
      .filter((row) => row.status === 'ready')
      .map((row) => ({ model: row.model, variant: row.variant }));
  }, [bulkPreviewRows]);

  const openBulkModal = useCallback(() => {
    if (!bulkBrand) {
      setBulkBrand(brandNames[0] || '');
    }
    setBulkGridRows([]);
    setBulkOpen(true);
  }, [bulkBrand, brandNames, setBulkBrand, setBulkOpen]);

  const closeBulkModal = useCallback(() => {
    if (bulkMut.isPending) return;
    setBulkOpen(false);
  }, [bulkMut.isPending]);

  const runBulkImport = useCallback(() => {
    const brand = String(bulkBrand || '').trim();
    if (!brand || bulkRowsToSubmit.length === 0) return;
    bulkMut.mutate({ brand, rows: bulkRowsToSubmit });
  }, [bulkBrand, bulkRowsToSubmit, bulkMut]);

  // ── Render ─────────────────────────────────────────────────────
  if (isLoading) return <Spinner />;

  return (
    <>
      <div className={`grid ${drawerOpen ? 'grid-cols-[1fr,380px]' : 'grid-cols-1'} gap-3`}>
      {/* Main panel */}
      <div className="space-y-3">
        {/* Header bar */}
        <div className={`${sectionCls} flex items-center justify-between`}>
          <div>
            <h3 className="text-sm font-semibold">Product Catalog — {category}</h3>
            <p className="text-xs sf-text-muted mt-0.5">
              {products.length} product{products.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={openBulkModal}
              disabled={category === 'all'}
              title={category === 'all' ? 'Select a specific category for bulk import' : undefined}
              className={btnSecondary}
            >
              Bulk Paste
            </button>
            <button onClick={openAdd} className={btnPrimary}>+ Add Product</button>
          </div>
        </div>

        {/* Bulk import result banner */}
        {bulkResult && (
          <div className={`px-4 py-2 text-sm rounded ${
            (bulkResult.failed ?? 0) > 0 || !bulkResult.ok
              ? 'sf-bg-surface-soft sf-bg-surface-soft border sf-border-default sf-border-default'
              : 'sf-bg-surface-soft sf-bg-surface-soft border sf-border-default sf-border-default'
          }`}>
            Bulk import: added <strong>{bulkResult.created ?? 0}</strong>
            {', '}existing <strong>{bulkResult.skipped_existing ?? 0}</strong>
            {', '}duplicates <strong>{bulkResult.skipped_duplicate ?? 0}</strong>
            {', '}invalid <strong>{bulkResult.invalid ?? 0}</strong>
            {', '}failed <strong>{bulkResult.failed ?? 0}</strong>.
            {' '}Catalog total: <strong>{bulkResult.total_catalog ?? products.length}</strong>.
          </div>
        )}

        {/* Product table */}
        <div className={sectionCls}>
          <DataTable
            data={products}
            columns={PRODUCT_TABLE_COLUMNS}
            searchable
            persistKey={`catalog:products:table:${category}`}
            onRowClick={openEdit}
            maxHeight="max-h-[calc(100vh-280px)]"
          />
        </div>
      </div>

      {/* Drawer panel */}
      {drawerOpen && (
        <div className={`${sectionCls} space-y-4 self-start sticky top-4`}>
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold">{editPid ? 'Edit Product' : 'Add Product'}</h4>
            <button onClick={closeDrawer} className="sf-text-subtle sf-text-muted text-lg leading-none">&times;</button>
          </div>

          {/* Brand */}
          <div>
            <label className={labelCls}>Brand *</label>
            {brandNames.length > 0 ? (
              <select
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
                className={`${selectCls} w-full`}
              >
                <option value="">Select brand...</option>
                {brandNames.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={formBrand}
                onChange={(e) => setFormBrand(e.target.value)}
                placeholder="e.g. Razer"
                className={`${inputCls} w-full`}
              />
            )}
          </div>

          {/* Model */}
          <div>
            <label className={labelCls}>Model *</label>
            <input
              type="text"
              value={formModel}
              onChange={(e) => setFormModel(e.target.value)}
              placeholder="e.g. Viper V3 Pro"
              className={`${inputCls} w-full`}
            />
          </div>

          {/* Variant */}
          <div>
            <label className={labelCls}>Variant</label>
            <input
              type="text"
              value={formVariant}
              onChange={(e) => setFormVariant(e.target.value)}
              placeholder="e.g. Wireless (leave blank for base model)"
              className={`${inputCls} w-full`}
            />
          </div>

          {/* Status (edit only) */}
          {editPid && (
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={formStatus}
                onChange={(e) => setFormStatus(e.target.value)}
                className={`${selectCls} w-full`}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          {/* Seed URLs */}
          <div>
            <label className={labelCls}>Seed URLs (one per line)</label>
            <textarea
              value={formSeedUrls}
              onChange={(e) => setFormSeedUrls(e.target.value)}
              placeholder={"https://example.com/product-page\nhttps://..."}
              rows={3}
              className={`${inputCls} w-full resize-y`}
            />
          </div>

          {/* Identity Preview */}
          <div className="sf-bg-surface-soft sf-bg-surface-soft rounded p-2.5 border sf-border-default sf-border-default space-y-1.5">
            <div className="text-[10px] font-medium sf-text-muted uppercase tracking-wide">Identity Preview</div>
            {editPid ? (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="sf-text-subtle w-16">Product ID</span>
                  <span className="font-mono sf-text-muted sf-text-subtle truncate">{editPid}</span>
                  <span className="text-[10px] sf-text-subtle">(immutable)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="sf-text-subtle w-16">ID#</span>
                  <span className="font-mono sf-text-muted sf-text-subtle">
                    {products.find(p => p.productId === editPid)?.id || '—'}
                  </span>
                  <span className="text-[10px] sf-text-subtle">(immutable)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="sf-text-subtle w-16">Identifier</span>
                  <span className="font-mono sf-text-muted sf-text-subtle">
                    {products.find(p => p.productId === editPid)?.identifier || '—'}
                  </span>
                  <span className="text-[10px] sf-text-subtle">(immutable)</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="sf-text-subtle w-16">Product ID</span>
                  <span className="font-mono sf-text-muted sf-text-subtle truncate">
                    (assigned on creation)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="sf-text-subtle w-16">ID#</span>
                  <span className="font-mono sf-text-muted sf-text-muted font-semibold">{nextId}</span>
                  <span className="text-[10px] sf-text-subtle">(auto)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="sf-text-subtle w-16">Identifier</span>
                  <span className="font-mono sf-text-muted sf-text-muted">generated on save</span>
                  <span className="text-[10px] sf-text-subtle">(8-char hex)</span>
                </div>
              </>
            )}
          </div>

          {/* ── Downstream Dependencies Panel ────────────────────────── */}
          {editPid && (
            <div className={`rounded border text-xs ${
              hasAnyChange
                ? 'sf-bg-surface-soft sf-bg-surface-soft sf-border-soft sf-border-default'
                : 'sf-bg-surface-soft sf-bg-surface-soft sf-border-default sf-border-default'
            }`}>
              {/* Header bar */}
              <div className={`px-3 py-2 border-b flex items-center justify-between sf-border-default sf-border-default`}>
                <span className={`text-[10px] font-bold uppercase tracking-wide ${
                  hasAnyChange ? 'sf-status-text-warning sf-status-text-warning'
                    : 'sf-text-muted sf-text-subtle'
                }`}>
                  {hasAnyChange ? 'Downstream Impact' : 'Downstream Dependencies'}
                </span>
                <span className={`font-semibold tabular-nums ${
                  hasAnyChange ? 'sf-status-text-warning sf-status-text-warning'
                    : 'sf-text-muted sf-text-subtle'
                }`}>
                  5 linked files
                </span>
              </div>

              <div className="px-3 py-2 space-y-2">
                {/* Change summary */}
                {hasAnyChange && (
                  <div className="space-y-0.5 sf-status-text-warning sf-status-text-warning text-[11px]">
                    {hasIdentityChange && (
                      <p>Identity metadata updated (brand/model/variant). Slug and artifact paths are unchanged.</p>
                    )}
                    {isStatusChange && (
                      <div>
                        <p>Status: <span className="font-mono line-through sf-status-text-danger">{origStatus}</span> &rarr; <span className="font-mono sf-status-text-success">{formStatus}</span></p>
                        {formStatus === 'inactive' && <p className="text-[10px] mt-0.5">Inactive products excluded from queue processing and pipeline runs.</p>}
                      </div>
                    )}
                    {isSeedUrlChange && (
                      <p>Seed URLs changed — next pipeline run uses updated URLs.</p>
                    )}
                  </div>
                )}

                {/* Expandable: affected files */}
                <details className="group">
                  <summary className="cursor-pointer select-none text-[11px] font-medium hover:opacity-80 sf-text-muted sf-text-subtle">
                    Affected files
                  </summary>
                  <div className="mt-1 font-mono text-[10px] rounded p-1.5 space-y-0.5 overflow-x-auto bg-white/60 sf-bg-surface-soft/60">
                    <div>specs/inputs/{category}/products/<span className="font-semibold">{editPid}</span>.json</div>
                    <div>*/latest/, */runs/, */review/ under <span className="font-semibold">{editPid}</span></div>
                    <div>*/published/<span className="font-semibold">{editPid}</span>/*</div>
                    <div>category_authority/{category}/_overrides/<span className="font-semibold">{editPid}</span>.overrides.json</div>
                    <div>_queue/{category}/state.json &rarr; products[<span className="font-semibold">{editPid}</span>]</div>
                  </div>
                </details>

                {/* Hint when no changes */}
                {!hasAnyChange && (
                  <p className="text-[10px] sf-text-subtle pt-0.5">Changing <strong>status</strong> or <strong>seed URLs</strong> takes effect on next pipeline run. Identity changes (brand/model/variant) update metadata only — the product ID is immutable.</p>
                )}
              </div>
            </div>
          )}

          {/* Product identifier */}
          {editPid && (() => {
            const editProduct = products.find(p => p.productId === editPid);
            if (!editProduct?.identifier) return null;
            return (
              <div className="text-[10px] sf-text-subtle">
                <span className="font-medium sf-text-muted">ID:</span>{' '}
                <span className="font-mono">{editPid}</span>
                {editProduct.identifier && (
                  <span className="ml-2 font-mono">({editProduct.identifier})</span>
                )}
              </div>
            );
          })()}

          {/* Delete type-to-confirm (GitHub-style) */}
          {confirmAction === 'delete' && (
            <div className="sf-bg-surface-soft sf-bg-surface-soft border-2 sf-border-soft sf-border-default rounded p-3 space-y-2">
              <div className="text-sm font-bold sf-status-text-danger sf-status-text-danger">Confirm deletion</div>
              <div className="text-xs sf-status-text-danger sf-status-text-danger space-y-1">
                <p>This will <strong>permanently delete</strong> this product from the catalog:</p>
                <ul className="list-disc ml-3 space-y-0.5">
                  <li>Catalog entry will be removed</li>
                  <li>Input file will be deleted</li>
                  <li>Queue entry will be removed</li>
                  <li>Output artifacts will remain on disk but become unlinked</li>
                </ul>
              </div>
              <p className="text-xs sf-status-text-danger sf-status-text-danger mt-1">
                To confirm, type the product ID below:
              </p>
              <div className="font-mono text-xs sf-bg-surface-soft-strong sf-bg-surface-soft rounded px-2 py-1 sf-status-text-danger sf-status-text-danger select-all">
                {deleteConfirmPhrase}
              </div>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder="Type the product ID to confirm"
                className="w-full px-2 py-1.5 text-sm font-mono border-2 sf-border-soft sf-border-default rounded bg-white sf-bg-surface-soft sf-border-default focus:outline-none"
                autoFocus
              />
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { if (editPid) deleteMut.mutate(editPid); }}
                  disabled={confirmInput !== deleteConfirmPhrase || deleteMut.isPending}
                  className="px-3 py-1.5 text-xs font-semibold sf-bg-surface-soft-strong text-white rounded sf-hover-bg-surface-soft-strong disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deleteMut.isPending ? 'Deleting...' : 'I understand, delete this product'}
                </button>
                <button
                  onClick={() => { setConfirmAction(null); setConfirmInput(''); }}
                  className="px-3 py-1.5 text-xs border sf-border-soft sf-border-soft rounded sf-hover-bg-surface-soft-strong sf-hover-bg-surface-soft-strong"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {saveError && (
            <p className="text-xs sf-status-text-danger">{(saveError as Error).message}</p>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t sf-border-default sf-border-default">
            {!confirmAction && (
              <>
                <button
                  onClick={handleSave}
                  disabled={!isFormValid || isSaving || (editPid ? !hasAnyChange : false)}
                  className={btnPrimary}
                  title={editPid && !hasAnyChange ? 'No changes to save' : undefined}
                >
                  {isSaving ? 'Saving...' : editPid ? 'Save Changes' : 'Add Product'}
                </button>
                {editPid && (
                  <button
                    onClick={handleDelete}
                    disabled={deleteMut.isPending}
                    className={btnDanger}
                  >
                    {deleteMut.isPending ? 'Deleting...' : 'Delete'}
                  </button>
                )}
              </>
            )}
            <button onClick={closeDrawer} className={btnSecondary}>Cancel</button>
          </div>
        </div>
      )}
      </div>
      {bulkOpen && (
        <div className="fixed inset-0 z-40 bg-black/45 p-4 flex items-start md:items-center justify-center">
          <div className="w-full max-w-5xl max-h-[92vh] overflow-hidden bg-white sf-bg-surface-soft rounded border sf-border-default sf-border-default shadow-2xl flex flex-col">
            <div className="px-4 py-3 border-b sf-border-default sf-border-default flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold">Bulk Paste Models + Variants</h4>
                <p className="text-xs sf-text-muted mt-0.5">Type or paste <strong>Model</strong> and <strong>Variant</strong> columns (supports tab-separated paste from your spreadsheet tool).</p>
              </div>
              <button
                onClick={closeBulkModal}
                disabled={bulkMut.isPending}
                className="sf-text-subtle sf-text-muted text-lg leading-none disabled:opacity-40"
                aria-label="Close bulk import modal"
              >
                &times;
              </button>
            </div>

            <div className="p-4 space-y-3 overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] gap-3 items-end">
                <div>
                  <label className={labelCls}>Brand *</label>
                  <select
                    value={bulkBrand}
                    onChange={(e) => setBulkBrand(e.target.value)}
                    className={`${selectCls} w-full`}
                    disabled={bulkMut.isPending}
                  >
                    <option value="">Select brand...</option>
                    {brandNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
                <div className="text-xs sf-text-muted">
                  Type or paste from a spreadsheet. Variant can be blank.
                </div>
              </div>

              <div>
                <label className={labelCls}>Paste Rows</label>
                <BulkPasteGrid
                  col1Header="Model"
                  col2Header="Variant"
                  col1Placeholder="e.g. Viper V3 Pro"
                  col2Placeholder="e.g. White"
                  rows={bulkGridRows}
                  onChange={setBulkGridRows}
                  disabled={bulkMut.isPending}
                />
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded sf-bg-surface-soft-strong sf-bg-surface-soft sf-status-text-success sf-status-text-success">Ready: {bulkCounts.ready}</span>
                <span className="px-2 py-1 rounded sf-bg-surface-soft-strong sf-bg-surface-soft sf-text-muted sf-text-muted">Existing: {bulkCounts.existing}</span>
                <span className="px-2 py-1 rounded sf-bg-surface-soft-strong sf-bg-surface-soft sf-status-text-warning sf-status-text-warning">Duplicates: {bulkCounts.duplicate}</span>
                <span className="px-2 py-1 rounded sf-bg-surface-soft-strong sf-bg-surface-soft sf-status-text-danger sf-status-text-danger">Invalid: {bulkCounts.invalid}</span>
                <span className="px-2 py-1 rounded sf-bg-surface-soft-strong sf-bg-surface-soft-strong sf-text-muted sf-dk-fg-100">Rows: {bulkPreviewRows.length}</span>
              </div>

              {bulkPreviewRows.length > 0 && (
              <div className="border sf-border-default sf-border-default rounded overflow-auto max-h-[24vh]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 sf-bg-surface-soft sf-dk-surface-900a70 border-b sf-border-default sf-border-default">
                    <tr>
                      <th className="text-left px-2 py-1.5 w-12">#</th>
                      <th className="text-left px-2 py-1.5">Model</th>
                      <th className="text-left px-2 py-1.5">Variant</th>
                      <th className="text-left px-2 py-1.5">Product ID</th>
                      <th className="text-left px-2 py-1.5 w-36">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkPreviewRows.map((row) => {
                      const statusCls = row.status === 'ready'
                        ? 'sf-bg-surface-soft-strong sf-bg-surface-soft sf-status-text-success sf-status-text-success'
                        : row.status === 'already_exists'
                          ? 'sf-bg-surface-soft-strong sf-bg-surface-soft sf-text-muted sf-text-muted'
                          : row.status === 'duplicate_in_paste'
                            ? 'sf-bg-surface-soft-strong sf-bg-surface-soft sf-status-text-warning sf-status-text-warning'
                            : 'sf-bg-surface-soft-strong sf-bg-surface-soft sf-status-text-danger sf-status-text-danger';
                      return (
                        <tr key={`${row.rowNumber}-${row.productId}-${row.raw}`} className="border-b sf-border-default/50">
                          <td className="px-2 py-1.5 sf-text-muted">{row.rowNumber}</td>
                          <td className="px-2 py-1.5">{row.model || <span className="italic sf-text-subtle">â€”</span>}</td>
                          <td className="px-2 py-1.5">{row.variant || <span className="italic sf-text-subtle">â€”</span>}</td>
                          <td className="px-2 py-1.5 font-mono text-[11px] sf-text-muted sf-text-subtle">{row.productId || <span className="italic sf-text-subtle">â€”</span>}</td>
                          <td className="px-2 py-1.5">
                            <span className={`inline-block px-2 py-0.5 rounded-full ${statusCls}`}>{row.reason}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}

              {bulkMut.error && (
                <div className="px-3 py-2 text-xs rounded sf-bg-surface-soft sf-bg-surface-soft border sf-border-default sf-border-default sf-status-text-danger sf-status-text-danger">
                  Bulk import failed: {(bulkMut.error as Error).message}
                </div>
              )}

              {bulkMut.data?.results && bulkMut.data.results.length > 0 && (
                <details className="text-xs border sf-border-default sf-border-default rounded">
                  <summary className="cursor-pointer px-3 py-2 sf-bg-surface-soft sf-dk-surface-900a50 font-medium">
                    Last run details ({bulkMut.data.results.length} rows)
                  </summary>
                  <div className="max-h-40 overflow-auto p-2 space-y-1">
                    {bulkMut.data.results.slice(0, 50).map((row, idx) => (
                      <div key={`${idx}-${row.index}-${row.productId || ''}`} className="font-mono text-[11px] sf-text-muted sf-text-subtle">
                        {`[${row.index + 1}] ${row.model}${row.variant ? ` | ${row.variant}` : ''} -> ${row.status}${row.reason ? ` (${row.reason})` : ''}`}
                      </div>
                    ))}
                    {bulkMut.data.results.length > 50 && (
                      <div className="sf-text-muted">Showing first 50 rows.</div>
                    )}
                  </div>
                </details>
              )}
            </div>

            <div className="px-4 py-3 border-t sf-border-default sf-border-default flex items-center justify-between gap-2">
              <div className="text-xs sf-text-muted">
                Ready rows will be added as new products for <strong>{bulkBrand || 'selected brand'}</strong>.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={closeBulkModal}
                  disabled={bulkMut.isPending}
                  className={btnSecondary}
                >
                  Close
                </button>
                <button
                  onClick={runBulkImport}
                  disabled={bulkMut.isPending || !bulkBrand.trim() || bulkRowsToSubmit.length === 0}
                  className={btnPrimary}
                >
                  {bulkMut.isPending ? 'Importing...' : `Import ${bulkRowsToSubmit.length} Ready Row${bulkRowsToSubmit.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

