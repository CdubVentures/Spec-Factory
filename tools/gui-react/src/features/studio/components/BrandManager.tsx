import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../../api/client.ts";
import { useUiCategoryStore } from "../../../stores/uiCategoryStore.ts";
import { usePersistedToggle } from "../../../stores/collapseStore.ts";
import { usePersistedTab, usePersistedExpandMap } from "../../../stores/tabStore.ts";
import { DataTable } from "../../../shared/ui/data-display/DataTable.tsx";
import { Spinner } from "../../../shared/ui/feedback/Spinner.tsx";
import { inputCls, labelCls } from "./studioConstants.ts";
import { invalidateFieldRulesQueries } from "../state/invalidateFieldRulesQueries.ts";
import { patchCachedBrand, removeCachedBrand } from "./brandCacheOptimism.ts";
import type { ColumnDef } from "@tanstack/react-table";
import type { BrandImpactAnalysis, Brand, BrandMutationResult } from "../../../types/product.ts";

import { btnPrimary, btnSecondary, btnDangerSolid as btnDanger } from '../../../shared/ui/buttonClasses.ts';
const borderPanelCls = "sf-border-default";
const textMutedCls = "sf-text-subtle";
const textSubtleCls = "sf-text-subtle";
const textDangerStrongCls = "sf-status-text-danger";
const textWarningStrongCls = "sf-status-text-warning";
const sectionCls = `sf-surface-card rounded border ${borderPanelCls} p-4`;
const chipCls =
  "inline-block px-2 py-0.5 text-xs rounded-full sf-chip-info mr-1 mb-1";
const redConfirmPanelCls = "sf-callout sf-callout-danger rounded p-3 space-y-2";
const amberConfirmPanelCls =
  "sf-callout sf-callout-warning rounded p-3 space-y-2";
const redConfirmInputCls =
  "w-full sf-input px-2 py-1.5 text-sm font-mono sf-border-danger-soft focus:outline-none";
const amberConfirmInputCls =
  "w-full sf-input px-2 py-1.5 text-sm font-mono focus:outline-none";
const redConfirmButtonCls =
  "px-3 py-1.5 text-xs sf-danger-button-solid disabled:opacity-40 disabled:cursor-not-allowed";
const amberConfirmButtonCls =
  "px-3 py-1.5 text-xs sf-confirm-button-solid disabled:opacity-40 disabled:cursor-not-allowed";

type BrandBulkPreviewStatus =
  | "ready"
  | "already_exists"
  | "duplicate_in_paste"
  | "invalid";

interface BrandBulkPreviewRow {
  rowNumber: number;
  raw: string;
  name: string;
  slug: string;
  status: BrandBulkPreviewStatus;
  reason: string;
}

interface BrandBulkImportResultRow {
  index: number;
  name: string;
  slug: string;
  status:
    | "created"
    | "skipped_existing"
    | "skipped_duplicate"
    | "invalid"
    | "failed";
  reason?: string;
}

interface BrandBulkImportResult {
  ok: boolean;
  error?: string;
  total?: number;
  created?: number;
  skipped_existing?: number;
  skipped_duplicate?: number;
  invalid?: number;
  failed?: number;
  total_brands?: number;
  results?: BrandBulkImportResultRow[];
}

interface BrandCacheMutationContext {
  readonly previousBrands?: Brand[];
}

function slugify(str: string): string {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-_]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseBulkBrandLine(rawLine: string): string {
  const line = String(rawLine || "")
    .replace(/^\uFEFF/, "")
    .replace(/^\s*[-*•]\s*/, "")
    .replace(/^\s*\d+[.)]\s*/, "")
    .trim();
  if (!line) return "";
  if (line.includes("\t")) {
    return String(line.split("\t")[0] || "").trim();
  }
  return line;
}

function isBrandHeaderRow(name: string): boolean {
  const token = String(name || "")
    .trim()
    .toLowerCase();
  return (
    token === "brand" ||
    token === "brands" ||
    token === "brand name" ||
    token === "name"
  );
}

export function BrandManager() {
  const categories = useUiCategoryStore((s) => s.categories);
  const selectedCategory = useUiCategoryStore((s) => s.category);
  const queryClient = useQueryClient();
  const [filterCategory, setFilterCategory] = usePersistedTab<string>(
    "catalog:brands:filterCategory",
    "all",
  );
  const [drawerOpen, , setDrawerOpen] = usePersistedToggle(
    "catalog:brands:drawerOpen",
    false,
  );
  const [persistedSelectedBrand, setPersistedSelectedBrand] =
    usePersistedTab<string>(
      "catalog:brands:selectedBrand",
      "",
    );
  const [editSlug, setEditSlug] = useState<string | null>(
    () => persistedSelectedBrand || null,
  );
  const [addDraftName, setAddDraftName] = usePersistedTab<string>(
    "catalog:brands:addDraft:name",
    "",
  );
  const [addDraftAliases, setAddDraftAliases] = usePersistedTab<string>(
    "catalog:brands:addDraft:aliases",
    "",
  );
  const [addDraftCategoriesCsv, setAddDraftCategoriesCsv] =
    usePersistedTab<string>(
      "catalog:brands:addDraft:categories",
      "",
    );
  const [addDraftWebsite, setAddDraftWebsite] = usePersistedTab<string>(
    "catalog:brands:addDraft:website",
    "",
  );
  const [editIdentifier, setEditIdentifier] = useState<string>("");
  const [formName, setFormName] = useState("");
  const [formAliases, setFormAliases] = useState("");
  const [formCategories, setFormCategories] = useState<string[]>([]);
  const [formWebsite, setFormWebsite] = useState("");
  const [origName, setOrigName] = useState("");
  const [origAliases, setOrigAliases] = useState("");
  const [origCategories, setOrigCategories] = useState<string[]>([]);
  const [origWebsite, setOrigWebsite] = useState("");
  const [confirmAction, setConfirmAction] = useState<
    "rename" | "delete" | "save" | null
  >(null);
  const [confirmInput, setConfirmInput] = useState("");
  const [renameResult, setRenameResult] = useState<BrandMutationResult | null>(
    null,
  );
  const [bulkResult, setBulkResult] = useState<BrandBulkImportResult | null>(
    null,
  );
  const [bulkOpen, , setBulkOpen] = usePersistedToggle(
    "catalog:brands:bulkOpen",
    false,
  );
  const [bulkCategory, setBulkCategory] = usePersistedTab<string>(
    "catalog:brands:bulkCategory",
    "",
  );
  const [bulkText, setBulkText] = usePersistedTab<string>(
    "catalog:brands:bulkText",
    "",
  );
  const [impactCatExpand, toggleImpactCatExpand] = usePersistedExpandMap(
    "studio:brands:impact-categories",
  );
  const [bulkRunDetailsOpen, toggleBulkRunDetails] = usePersistedToggle(
    "studio:brands:bulk-run-details",
    false,
  );
  const hydratedEditSlugRef = useRef("");
  const brandsQueryKey = ["brands", "_all"] as const;
  const { data: brands = [], isLoading } = useQuery<Brand[]>({
    queryKey: brandsQueryKey,
    queryFn: () => api.get<Brand[]>("/brands"),
  });
  const { data: impactData } = useQuery<BrandImpactAnalysis>({
    queryKey: ["brand-impact", editSlug],
    queryFn: () => api.get<BrandImpactAnalysis>(`/brands/${editSlug}/impact`),
    enabled: !!editSlug,
  });
  const newSlugPreview = slugify(formName);
  const isRename = Boolean(editSlug && formName.trim() !== origName);
  const isSlugChange = Boolean(isRename && newSlugPreview !== editSlug);
  const isAliasChange = Boolean(editSlug && formAliases !== origAliases);
  const isCategoryChange = Boolean(
    editSlug &&
    JSON.stringify([...formCategories].sort()) !==
      JSON.stringify([...origCategories].sort()),
  );
  const isWebsiteChange = Boolean(editSlug && formWebsite !== origWebsite);
  const hasAnyChange =
    isRename || isAliasChange || isCategoryChange || isWebsiteChange;
  function invalidate(event: string) {
    queryClient.invalidateQueries({ queryKey: ["brands"] });
    invalidateFieldRulesQueries(queryClient, selectedCategory, { event });
  }
  const addMut = useMutation({
    mutationFn: (body: {
      name: string;
      aliases: string[];
      categories: string[];
      website: string;
    }) => api.post<BrandMutationResult>("/brands", body),
    onSuccess: () => {
      invalidate("brand-add");
      closeDrawer();
    },
  });
  const updateMut = useMutation({
    mutationFn: ({
      slug,
      patch,
    }: {
      slug: string;
      patch: Record<string, unknown>;
    }) => api.put<BrandMutationResult>(`/brands/${slug}`, patch),
    onMutate: async ({ slug, patch }): Promise<BrandCacheMutationContext> => {
      await queryClient.cancelQueries({ queryKey: brandsQueryKey });
      const previousBrands = queryClient.getQueryData<Brand[]>(brandsQueryKey);
      queryClient.setQueryData<Brand[]>(
        brandsQueryKey,
        (current) => patchCachedBrand(current, slug, patch),
      );
      return { previousBrands };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousBrands) {
        queryClient.setQueryData(brandsQueryKey, context.previousBrands);
      }
    },
    onSuccess: (data) => {
      invalidate(isRename ? "brand-rename" : "brand-update");
      closeDrawer();
      if (data?.cascaded_products !== undefined) {
        setRenameResult(data);
        setTimeout(() => setRenameResult(null), 10000);
      }
    },
  });
  const deleteMut = useMutation({
    mutationFn: (slug: string) =>
      api.del<BrandMutationResult>(`/brands/${slug}`),
    onMutate: async (slug): Promise<BrandCacheMutationContext> => {
      await queryClient.cancelQueries({ queryKey: brandsQueryKey });
      const previousBrands = queryClient.getQueryData<Brand[]>(brandsQueryKey);
      queryClient.setQueryData<Brand[]>(
        brandsQueryKey,
        (current) => removeCachedBrand(current, slug),
      );
      return { previousBrands };
    },
    onError: (_error, _slug, context) => {
      if (context?.previousBrands) {
        queryClient.setQueryData(brandsQueryKey, context.previousBrands);
      }
    },
    onSuccess: () => {
      invalidate("brand-delete");
      closeDrawer();
    },
  });
  const bulkMut = useMutation({
    mutationFn: (payload: { category: string; names: string[] }) =>
      api.post<BrandBulkImportResult>("/brands/bulk", payload),
    onSuccess: (data) => {
      invalidate("brand-bulk-add");
      setBulkResult(data);
      setTimeout(() => setBulkResult(null), 10000);
    },
  });
  function parseDraftCategories(value: string): string[] {
    return String(value || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  function openAdd() {
    hydratedEditSlugRef.current = "";
    setEditSlug(null);
    setEditIdentifier("");
    setFormName(addDraftName);
    setFormAliases(addDraftAliases);
    setFormCategories(parseDraftCategories(addDraftCategoriesCsv));
    setFormWebsite(addDraftWebsite);
    setOrigName("");
    setOrigAliases("");
    setOrigCategories([]);
    setOrigWebsite("");
    setConfirmAction(null);
    setConfirmInput("");
    setDrawerOpen(true);
  }
  function openEdit(brand: Brand) {
    hydratedEditSlugRef.current = brand.slug;
    setEditSlug(brand.slug);
    setEditIdentifier(brand.identifier || "");
    setFormName(brand.canonical_name);
    const aliasStr = brand.aliases.join(", ");
    setFormAliases(aliasStr);
    setFormCategories([...brand.categories]);
    setFormWebsite(brand.website || "");
    setOrigName(brand.canonical_name);
    setOrigAliases(aliasStr);
    setOrigCategories([...brand.categories]);
    setOrigWebsite(brand.website || "");
    setConfirmAction(null);
    setConfirmInput("");
    setDrawerOpen(true);
  }
  function closeDrawer() {
    hydratedEditSlugRef.current = "";
    setDrawerOpen(false);
    setEditSlug(null);
    setEditIdentifier("");
    setConfirmAction(null);
    setConfirmInput("");
  }
  useEffect(() => {
    const next = editSlug || "";
    if (persistedSelectedBrand === next) return;
    setPersistedSelectedBrand(next);
  }, [editSlug, persistedSelectedBrand, setPersistedSelectedBrand]);
  useEffect(() => {
    hydratedEditSlugRef.current = "";
    setEditSlug(persistedSelectedBrand || null);
  }, [persistedSelectedBrand]);
  useEffect(() => {
    if (!drawerOpen || !editSlug) return;
    if (hydratedEditSlugRef.current === editSlug) return;
    const brand = brands.find((row) => row.slug === editSlug);
    if (!brand) return;
    hydratedEditSlugRef.current = editSlug;
    const aliasStr = (brand.aliases || []).join(", ");
    setEditIdentifier(brand.identifier || "");
    setFormName(brand.canonical_name);
    setFormAliases(aliasStr);
    setFormCategories([...(brand.categories || [])]);
    setFormWebsite(brand.website || "");
    setOrigName(brand.canonical_name);
    setOrigAliases(aliasStr);
    setOrigCategories([...(brand.categories || [])]);
    setOrigWebsite(brand.website || "");
    setConfirmAction(null);
    setConfirmInput("");
  }, [drawerOpen, editSlug, brands]);
  useEffect(() => {
    if (!drawerOpen || editSlug) return;
    setAddDraftName(formName);
    setAddDraftAliases(formAliases);
    setAddDraftCategoriesCsv(formCategories.join(","));
    setAddDraftWebsite(formWebsite);
  }, [
    drawerOpen,
    editSlug,
    formName,
    formAliases,
    formCategories,
    formWebsite,
    setAddDraftName,
    setAddDraftAliases,
    setAddDraftCategoriesCsv,
    setAddDraftWebsite,
  ]);
  function resetConfirm() {
    setConfirmAction(null);
    setConfirmInput("");
  }
  function handleSave() {
    const aliases = formAliases
      .split(",")
      .map((a) => a.trim())
      .filter(Boolean);
    if (!editSlug) {
      addMut.mutate({
        name: formName,
        aliases,
        categories: formCategories,
        website: formWebsite,
      });
      return;
    }
    if (isRename && confirmAction !== "rename") {
      setConfirmAction("rename");
      setConfirmInput("");
      return;
    }
    if (!isRename && hasAnyChange && confirmAction !== "save") {
      setConfirmAction("save");
      setConfirmInput("");
      return;
    }
    resetConfirm();
    updateMut.mutate({
      slug: editSlug,
      patch: {
        name: formName,
        aliases,
        categories: formCategories,
        website: formWebsite,
      },
    });
  }
  function handleDelete() {
    if (!editSlug) return;
    if (confirmAction !== "delete") {
      setConfirmAction("delete");
      setConfirmInput("");
      return;
    }
    resetConfirm();
    deleteMut.mutate(editSlug);
  }
  function toggleCategory(cat: string) {
    setFormCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
    resetConfirm();
  }
  const isFormValid = formName.trim().length > 0 && formCategories.length > 0;
  const isSaving = addMut.isPending || updateMut.isPending;
  const saveError = addMut.error || updateMut.error;
  const renameConfirmPhrase = formName.trim();
  const deleteConfirmPhrase = editSlug || "";
  const saveConfirmPhrase = editSlug || "";
  const allCategories = useMemo(() => {
    const set = new Set<string>(categories);
    brands.forEach((b) => b.categories.forEach((c) => set.add(c)));
    return [...set].filter((cat) => cat && cat !== "all" && cat !== "tests").sort();
  }, [categories, brands]);
  const displayBrands = useMemo(() => {
    if (!filterCategory || filterCategory === "all") return brands;
    return brands.filter((b) => b.categories.includes(filterCategory));
  }, [brands, filterCategory]);
  const [categoryPopoverSlug, setCategoryPopoverSlug] = useState<string | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    if (!categoryPopoverSlug) return;
    const close = () => setCategoryPopoverSlug(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [categoryPopoverSlug]);
  const inlineCategoryMut = useMutation({
    mutationFn: ({ slug, categories: cats }: { slug: string; categories: string[] }) =>
      api.put<BrandMutationResult>(`/brands/${slug}`, { categories: cats }),
    onMutate: async ({ slug, categories: cats }): Promise<BrandCacheMutationContext> => {
      await queryClient.cancelQueries({ queryKey: brandsQueryKey });
      const previousBrands = queryClient.getQueryData<Brand[]>(brandsQueryKey);
      queryClient.setQueryData<Brand[]>(
        brandsQueryKey,
        (current) => patchCachedBrand(current, slug, { categories: cats }),
      );
      return { previousBrands };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousBrands) {
        queryClient.setQueryData(brandsQueryKey, context.previousBrands);
      }
    },
    onSuccess: () => invalidate("brand-update"),
  });
  const handleInlineCategoryAdd = useCallback((brand: Brand, cat: string) => {
    if (brand.categories.includes(cat)) return;
    inlineCategoryMut.mutate({ slug: brand.slug, categories: [...brand.categories, cat].sort() });
    setCategoryPopoverSlug(null);
  }, [inlineCategoryMut]);
  const handleInlineCategoryRemove = useCallback((brand: Brand, cat: string) => {
    if (brand.categories.length <= 1) return;
    inlineCategoryMut.mutate({ slug: brand.slug, categories: brand.categories.filter((c) => c !== cat) });
  }, [inlineCategoryMut]);
  const dynamicColumns = useMemo<ColumnDef<Brand, unknown>[]>(() => [
    {
      accessorKey: "canonical_name",
      header: "Brand Name",
      cell: ({ getValue }) => (
        <span className="font-medium">{getValue() as string}</span>
      ),
    },
    {
      accessorKey: "identifier",
      header: "ID",
      cell: ({ getValue }) => {
        const id = getValue() as string | undefined;
        if (!id) return <span className={`italic text-xs ${textMutedCls}`}>-</span>;
        return <span className={`font-mono text-xs ${textSubtleCls}`}>{id}</span>;
      },
    },
    {
      accessorKey: "aliases",
      header: "Aliases",
      cell: ({ getValue }) => {
        const aliases = getValue() as string[];
        if (!aliases?.length) return <span className={`italic text-xs ${textMutedCls}`}>none</span>;
        return (
          <div className="flex flex-wrap">
            {aliases.map((a) => (<span key={a} className={chipCls}>{a}</span>))}
          </div>
        );
      },
    },
    {
      accessorKey: "categories",
      header: "Categories",
      cell: ({ row }) => {
        const brand = row.original;
        const cats = brand.categories;
        const isOpen = categoryPopoverSlug === brand.slug;
        const missing = allCategories.filter((c) => !cats.includes(c));
        return (
          <div className="flex flex-wrap items-center relative" onClick={(e) => e.stopPropagation()}>
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                onClick={(e) => { e.stopPropagation(); handleInlineCategoryRemove(brand, c); }}
                disabled={cats.length <= 1}
                className={`${chipCls} cursor-pointer hover:line-through hover:opacity-70 transition-opacity disabled:cursor-default disabled:hover:no-underline disabled:hover:opacity-100`}
                title={cats.length > 1 ? `Remove ${c}` : "Cannot remove last category"}
              >
                {c}
              </button>
            ))}
            {missing.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (isOpen) { setCategoryPopoverSlug(null); return; }
                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setPopoverPos({ x: rect.left, y: rect.bottom + 4 });
                  setCategoryPopoverSlug(brand.slug);
                }}
                className="inline-flex items-center justify-center w-5 h-5 text-xs rounded-full sf-border-soft border sf-text-subtle hover:text-accent hover:border-accent transition-colors"
                title="Add category"
              >
                +
              </button>
            )}
            {isOpen && missing.length > 0 && (
              <div
                className="fixed z-50 sf-surface-panel border sf-border-default rounded shadow-lg py-1 min-w-[120px]"
                style={{ left: popoverPos.x, top: popoverPos.y }}
              >
                {missing.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleInlineCategoryAdd(brand, cat)}
                    className="block w-full text-left px-3 py-1.5 text-xs sf-text-primary hover:sf-surface-card transition-colors"
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "website",
      header: "Website",
      cell: ({ getValue }) => {
        const url = getValue() as string;
        if (!url) return <span className={`italic text-xs ${textMutedCls}`}>-</span>;
        return (
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="text-accent hover:underline text-xs truncate max-w-[200px] block">{url}</a>
        );
      },
    },
  ], [allCategories, categoryPopoverSlug, handleInlineCategoryAdd, handleInlineCategoryRemove]);
  const existingBrandSlugs = useMemo(() => {
    return new Set(
      brands.map((brand) => String(brand.slug || "").trim()).filter(Boolean),
    );
  }, [brands]);
  const bulkPreviewRows = useMemo<BrandBulkPreviewRow[]>(() => {
    const rows: BrandBulkPreviewRow[] = [];
    const seenInPaste = new Set<string>();
    const lines = String(bulkText || "").split(/\r?\n/g);
    for (let i = 0; i < lines.length; i += 1) {
      const raw = String(lines[i] || "").trim();
      if (!raw) continue;
      const name = parseBulkBrandLine(raw);
      if (!name) {
        rows.push({
          rowNumber: i + 1,
          raw,
          name: "",
          slug: "",
          status: "invalid",
          reason: "Brand name required",
        });
        continue;
      }
      if (isBrandHeaderRow(name)) {
        rows.push({
          rowNumber: i + 1,
          raw,
          name,
          slug: "",
          status: "invalid",
          reason: "Header row",
        });
        continue;
      }
      const slug = slugify(name);
      if (!slug) {
        rows.push({
          rowNumber: i + 1,
          raw,
          name,
          slug: "",
          status: "invalid",
          reason: "Invalid brand name",
        });
        continue;
      }
      if (seenInPaste.has(slug)) {
        rows.push({
          rowNumber: i + 1,
          raw,
          name,
          slug,
          status: "duplicate_in_paste",
          reason: "Duplicate in pasted list",
        });
        continue;
      }
      seenInPaste.add(slug);
      if (existingBrandSlugs.has(slug)) {
        rows.push({
          rowNumber: i + 1,
          raw,
          name,
          slug,
          status: "already_exists",
          reason: "Already in registry",
        });
        continue;
      }
      rows.push({
        rowNumber: i + 1,
        raw,
        name,
        slug,
        status: "ready",
        reason: "Ready",
      });
    }
    return rows;
  }, [bulkText, existingBrandSlugs]);
  const bulkCounts = useMemo(() => {
    const counts = { ready: 0, existing: 0, duplicate: 0, invalid: 0 };
    for (const row of bulkPreviewRows) {
      if (row.status === "ready") counts.ready += 1;
      else if (row.status === "already_exists") counts.existing += 1;
      else if (row.status === "duplicate_in_paste") counts.duplicate += 1;
      else counts.invalid += 1;
    }
    return counts;
  }, [bulkPreviewRows]);
  const bulkNamesToSubmit = useMemo(() => {
    return bulkPreviewRows
      .filter((row) => row.status === "ready")
      .map((row) => row.name);
  }, [bulkPreviewRows]);
  function openBulkModal() {
    const defaultCategory =
      selectedCategory && selectedCategory !== "all"
        ? selectedCategory
        : allCategories[0] || "";
    setBulkCategory(defaultCategory);
    setBulkText("");
    setBulkOpen(true);
  }
  function closeBulkModal() {
    if (bulkMut.isPending) return;
    setBulkOpen(false);
  }
  function runBulkImport() {
    const category = String(bulkCategory || "").trim();
    if (!category || bulkNamesToSubmit.length === 0) return;
    bulkMut.mutate({ category, names: bulkNamesToSubmit });
  }
  const totalProducts = impactData?.total_products ?? 0;
  const productsByCategory = impactData?.products_by_category ?? {};
  if (isLoading) return <Spinner className="h-8 w-8 mx-auto mt-12" />;
  return (
    <>
      {" "}
      <div
        className={`grid ${drawerOpen ? "grid-cols-[1fr,400px]" : "grid-cols-1"} gap-3`}
      >
        {" "}
        {/* Main panel */}{" "}
        <div className="space-y-3">
          {" "}
          {/* Header bar */}{" "}
          <div className={`${sectionCls} flex items-center justify-between`}>
            {" "}
            <div>
              {" "}
              <h3 className="text-sm font-semibold">Brand Registry</h3>{" "}
              <p className={`text-xs mt-0.5 ${textSubtleCls}`}>
                {brands.length} brand{brands.length !== 1 ? "s" : ""} across all
                categories
              </p>{" "}
            </div>{" "}
            <div className="flex gap-2">
              {" "}
              <button onClick={openBulkModal} className={btnSecondary}>
                Bulk Paste
              </button>{" "}
              <button onClick={openAdd} className={btnPrimary}>
                + Add Brand
              </button>{" "}
            </div>{" "}
          </div>{" "}
          {/* Rename result banner */}{" "}
          {renameResult && (
            <div
              className={`px-4 py-2 text-sm rounded ${renameResult.ok ? "sf-callout sf-callout-success" : "sf-callout sf-callout-warning"}`}
            >
              {" "}
              Brand renamed: <strong>{renameResult.oldName}</strong> &rarr;{" "}
              <strong>{renameResult.newName}</strong>. Brand updated on{" "}
              <strong>{renameResult.cascaded_products}</strong> product
              {renameResult.cascaded_products !== 1 ? "s" : ""}. Product IDs
              unchanged.{" "}
              {(renameResult.cascade_failures ?? 0) > 0 && (
                <span className={textWarningStrongCls}>
                  {" "}
                  ({renameResult.cascade_failures} failed)
                </span>
              )}{" "}
              Identifier{" "}
              <span className="font-mono text-xs">
                {renameResult.identifier}
              </span>{" "}
              unchanged.{" "}
            </div>
          )}{" "}
          {/* Bulk import result banner */}{" "}
          {bulkResult && (
            <div
              className={`px-4 py-2 text-sm rounded ${(bulkResult.failed ?? 0) > 0 || !bulkResult.ok ? "sf-callout sf-callout-warning" : "sf-callout sf-callout-success"}`}
            >
              {" "}
              Bulk brands: added <strong>{bulkResult.created ?? 0}</strong>{" "}
              {", "}existing <strong>{bulkResult.skipped_existing ?? 0}</strong>{" "}
              {", "}duplicates{" "}
              <strong>{bulkResult.skipped_duplicate ?? 0}</strong> {", "}invalid{" "}
              <strong>{bulkResult.invalid ?? 0}</strong> {", "}failed{" "}
              <strong>{bulkResult.failed ?? 0}</strong>. Total brands:{" "}
              <strong>{bulkResult.total_brands ?? brands.length}</strong>
              .{" "}
            </div>
          )}{" "}
          {/* Category filter strip */}{" "}
          <nav className="flex flex-wrap gap-1 px-1 py-1 sf-tab-strip rounded">
            {" "}
            <button
              type="button"
              onClick={() => setFilterCategory("all")}
              className={`px-3 h-[28px] inline-flex items-center text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer sf-tab-item${filterCategory === "all" ? " sf-tab-item-active" : ""}`}
            >
              All ({brands.length})
            </button>{" "}
            {allCategories.map((cat) => {
              const count = brands.filter((b) => b.categories.includes(cat)).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 h-[28px] inline-flex items-center text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer sf-tab-item${filterCategory === cat ? " sf-tab-item-active" : ""}`}
                >
                  {cat} ({count})
                </button>
              );
            })}{" "}
          </nav>{" "}
          {/* Brand table */}{" "}
          <div className={sectionCls}>
            {" "}
            <DataTable
              data={displayBrands}
              columns={dynamicColumns}
              searchable
              persistKey="catalog:brands:table"
              onRowClick={openEdit}
              maxHeight="max-h-[calc(100vh-280px)]"
            />{" "}
          </div>{" "}
        </div>{" "}
        {/* Drawer panel */}{" "}
        {drawerOpen && (
          <div className={`${sectionCls} space-y-4 self-start sticky top-4`}>
            {" "}
            <div className="flex items-center justify-between">
              {" "}
              <h4 className="text-sm font-semibold">
                {editSlug ? "Edit Brand" : "Add Brand"}
              </h4>{" "}
              <button
                onClick={closeDrawer}
                className={`${textMutedCls} hover:sf-text-muted text-lg leading-none`}
              >
                &times;
              </button>{" "}
            </div>{" "}
            {/* Name */}{" "}
            <div>
              {" "}
              <label className={labelCls}>Brand Name *</label>{" "}
              <input
                type="text"
                value={formName}
                onChange={(e) => {
                  setFormName(e.target.value);
                  resetConfirm();
                }}
                placeholder="e.g. SteelSeries"
                className={`${inputCls} w-full`}
              />{" "}
              {editSlug && (
                <div className="mt-1 space-y-0.5">
                  {" "}
                  <p className={`text-xs ${textMutedCls}`}>
                    {" "}
                    Slug:{" "}
                    <span className="font-mono">
                      {isSlugChange ? newSlugPreview : editSlug}
                    </span>{" "}
                    {isSlugChange && (
                      <span className={`${textWarningStrongCls} ml-1`}>
                        (was: {editSlug})
                      </span>
                    )}{" "}
                  </p>{" "}
                  {editIdentifier && (
                    <p className={`text-xs ${textMutedCls}`}>
                      {" "}
                      Identifier:{" "}
                      <span className="font-mono">{editIdentifier}</span>{" "}
                      <span className={`${textSubtleCls} ml-1`}>
                        (immutable)
                      </span>{" "}
                    </p>
                  )}{" "}
                </div>
              )}{" "}
            </div>{" "}
            {/* Aliases */}{" "}
            <div>
              {" "}
              <label className={labelCls}>Aliases (comma-separated)</label>{" "}
              <input
                type="text"
                value={formAliases}
                onChange={(e) => {
                  setFormAliases(e.target.value);
                  resetConfirm();
                }}
                placeholder="e.g. SS, SteelSeries GG"
                className={`${inputCls} w-full`}
              />{" "}
            </div>{" "}
            {/* Categories */}{" "}
            <div>
              {" "}
              <label className={labelCls}>Categories *</label>{" "}
              <div className="flex flex-wrap gap-1 mt-1">
                {" "}
                {allCategories.map((cat) => {
                  const isActive = formCategories.includes(cat);
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => {
                        if (editSlug) {
                          const brand = brands.find((b) => b.slug === editSlug);
                          if (!brand) return;
                          if (isActive) {
                            if (formCategories.length <= 1) return;
                            handleInlineCategoryRemove(brand, cat);
                            setFormCategories((prev) => prev.filter((c) => c !== cat));
                            setOrigCategories((prev) => prev.filter((c) => c !== cat));
                          } else {
                            handleInlineCategoryAdd(brand, cat);
                            setFormCategories((prev) => [...prev, cat].sort());
                            setOrigCategories((prev) => [...prev, cat].sort());
                          }
                        } else {
                          toggleCategory(cat);
                        }
                      }}
                      className={`px-3 h-[28px] inline-flex items-center text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer sf-tab-item${isActive ? " sf-tab-item-active" : ""}`}
                    >
                      {cat}
                    </button>
                  );
                })}{" "}
              </div>{" "}
            </div>{" "}
            {/* Website */}{" "}
            <div>
              {" "}
              <label className={labelCls}>Website</label>{" "}
              <input
                type="url"
                value={formWebsite}
                onChange={(e) => {
                  setFormWebsite(e.target.value);
                  resetConfirm();
                }}
                placeholder="https://..."
                className={`${inputCls} w-full`}
              />{" "}
            </div>{" "}
            {/* Downstream Dependencies Panel */}{" "}
            {editSlug && (
              <div
                className={`rounded border text-xs ${isRename ? "sf-callout sf-callout-danger" : hasAnyChange ? "sf-callout sf-callout-warning" : "sf-surface-card sf-border-default"}`}
              >
                {" "}
                <div
                  className={`px-3 py-2 border-b ${borderPanelCls} flex items-center justify-between`}
                >
                  {" "}
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide ${isRename ? textDangerStrongCls : hasAnyChange ? textWarningStrongCls : textMutedCls}`}
                  >
                    {" "}
                    {isRename
                      ? "Impact - Brand Rename"
                      : hasAnyChange
                        ? "Downstream Impact"
                        : "Downstream Dependencies"}{" "}
                  </span>{" "}
                  <span
                    className={`font-semibold tabular-nums ${isRename ? textDangerStrongCls : hasAnyChange ? textWarningStrongCls : textMutedCls}`}
                  >
                    {" "}
                    {totalProducts} product{totalProducts !== 1 ? "s" : ""} �{" "}
                    {Object.keys(productsByCategory).length} categor
                    {Object.keys(productsByCategory).length !== 1
                      ? "ies"
                      : "y"}{" "}
                  </span>{" "}
                </div>{" "}
                <div className="px-3 py-2 space-y-2">
                  {" "}
                  {Object.entries(productsByCategory).map(([cat, count]) => {
                    const details =
                      (impactData?.product_details ?? {})[cat] ?? [];
                    return (
                      <div key={cat} className="group">
                        {" "}
                        <button type="button" onClick={() => toggleImpactCatExpand(cat)} className="cursor-pointer select-none flex items-center gap-2 hover:opacity-80">
                          {" "}
                          <span
                            className={`font-medium ${isRename ? textDangerStrongCls : "sf-text-muted "}`}
                          >
                            {cat}
                          </span>{" "}
                          <span
                            className={`tabular-nums ${isRename ? "sf-status-text-danger dark:sf-status-text-danger" : textMutedCls}`}
                          >
                            ({count})
                          </span>{" "}
                        </button>{" "}
                        {impactCatExpand[cat] && (details.length > 0 ? (
                          <div className="mt-1 ml-1 font-mono text-[10px] sf-surface-card rounded p-1.5 max-h-[160px] overflow-y-auto space-y-px">
                            {" "}
                            {details.map((pid) => (
                              <div
                                key={pid}
                                className={
                                  isRename
                                    ? "sf-status-text-danger"
                                    : "sf-text-subtle dark:sf-text-subtle"
                                }
                              >
                                {" "}
                                {isRename && (
                                  <span className="sf-status-text-danger mr-1">
                                    ~
                                  </span>
                                )}{" "}
                                specs/inputs/{cat}/products/
                                <span className="font-semibold">{pid}</span>
                                .json{" "}
                              </div>
                            ))}{" "}
                          </div>
                        ) : (
                          <p
                            className={`mt-1 ml-1 text-[10px] ${textMutedCls} italic`}
                          >
                            Loading product list...
                          </p>
                        ))}{" "}
                      </div>
                    );
                  })}{" "}
                  {/* Hint when no changes */}{" "}
                  {!hasAnyChange && totalProducts > 0 && (
                    <p className={`text-[10px] ${textMutedCls} pt-0.5`}>
                      Renaming this brand will update the brand name on all
                      products above. Product IDs are unchanged.
                    </p>
                  )}{" "}
                </div>{" "}
              </div>
            )}{" "}
            {/* ── Rename Confirm Panel (red) ─────────────────────────── */}{" "}
            {confirmAction === "rename" && (
              <div className={redConfirmPanelCls}>
                {" "}
                <div className="text-sm font-bold sf-status-text-danger">
                  Confirm Brand Rename
                </div>{" "}
                <p className={`text-xs ${textDangerStrongCls}`}>
                  {" "}
                  This will rename <strong>{origName}</strong> to{" "}
                  <strong>{formName.trim()}</strong>, and update the brand name
                  on all products under this brand.{" "}
                  {totalProducts > 0 && (
                    <>
                      {" "}
                      <strong>{totalProducts}</strong> product
                      {totalProducts !== 1 ? "s" : ""} will be affected.
                    </>
                  )}{" "}
                </p>{" "}
                <p className={`text-xs ${textDangerStrongCls}`}>
                  To confirm, type the new brand name below:
                </p>{" "}
                <div className="font-mono text-xs sf-chip-danger rounded px-2 py-1 sf-status-text-danger select-all">
                  {" "}
                  {renameConfirmPhrase}{" "}
                </div>{" "}
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type the new name to confirm"
                  className={redConfirmInputCls}
                  autoFocus
                />{" "}
                <div className="flex gap-2 pt-1">
                  {" "}
                  <button
                    onClick={handleSave}
                    disabled={confirmInput !== renameConfirmPhrase || isSaving}
                    className={redConfirmButtonCls}
                  >
                    {" "}
                    {isSaving
                      ? "Renaming..."
                      : "I understand, rename this brand"}{" "}
                  </button>{" "}
                  <button onClick={resetConfirm} className={btnSecondary}>
                    Cancel
                  </button>{" "}
                </div>{" "}
              </div>
            )}{" "}
            {/* ── Save Confirm Panel (amber) ─────────────────────────── */}{" "}
            {confirmAction === "save" && (
              <div className={amberConfirmPanelCls}>
                {" "}
                <div className={`text-sm font-bold ${textWarningStrongCls}`}>
                  Confirm Changes
                </div>{" "}
                <p className={`text-xs ${textWarningStrongCls}`}>
                  {" "}
                  You are updating metadata for{" "}
                  <strong>{formName.trim()}</strong>.{" "}
                  {isAliasChange && " Alias list will change."}{" "}
                  {isCategoryChange && " Category assignments will change."}{" "}
                  {isWebsiteChange && " Website URL will change."}{" "}
                </p>{" "}
                <p className={`text-xs ${textWarningStrongCls}`}>
                  To confirm, type the brand slug below:
                </p>{" "}
                <div className="font-mono text-xs sf-chip-warning rounded px-2 py-1 select-all">
                  {" "}
                  {saveConfirmPhrase}{" "}
                </div>{" "}
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type the slug to confirm"
                  className={amberConfirmInputCls}
                  autoFocus
                />{" "}
                <div className="flex gap-2 pt-1">
                  {" "}
                  <button
                    onClick={handleSave}
                    disabled={confirmInput !== saveConfirmPhrase || isSaving}
                    className={amberConfirmButtonCls}
                  >
                    {" "}
                    {isSaving ? "Saving..." : "Confirm save"}{" "}
                  </button>{" "}
                  <button onClick={resetConfirm} className={btnSecondary}>
                    Cancel
                  </button>{" "}
                </div>{" "}
              </div>
            )}{" "}
            {/* ── Delete Confirm Panel (red) ─────────────────────────── */}{" "}
            {confirmAction === "delete" && (
              <div className={redConfirmPanelCls}>
                {" "}
                <div className="text-sm font-bold sf-status-text-danger">
                  Confirm Delete
                </div>{" "}
                <p className={`text-xs ${textDangerStrongCls}`}>
                  {" "}
                  Deleting <strong>{formName.trim()}</strong> will remove it
                  from the brand registry.{" "}
                  {totalProducts > 0 && (
                    <>
                      {" "}
                      <strong>{totalProducts}</strong> product
                      {totalProducts !== 1 ? "s" : ""} will become orphaned (
                      {Object.entries(productsByCategory)
                        .map(([cat, count]) => `${cat}: ${count}`)
                        .join(", ")}
                      ).
                    </>
                  )}{" "}
                </p>{" "}
                <p className={`text-xs ${textDangerStrongCls}`}>
                  To confirm, type the brand slug below:
                </p>{" "}
                <div className="font-mono text-xs sf-chip-danger rounded px-2 py-1 sf-status-text-danger select-all">
                  {" "}
                  {deleteConfirmPhrase}{" "}
                </div>{" "}
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="Type the slug to confirm"
                  className={redConfirmInputCls}
                  autoFocus
                />{" "}
                <div className="flex gap-2 pt-1">
                  {" "}
                  <button
                    onClick={() => {
                      resetConfirm();
                      if (editSlug) deleteMut.mutate(editSlug);
                    }}
                    disabled={
                      confirmInput !== deleteConfirmPhrase ||
                      deleteMut.isPending
                    }
                    className={redConfirmButtonCls}
                  >
                    {" "}
                    {deleteMut.isPending
                      ? "Deleting..."
                      : "I understand, delete this brand"}{" "}
                  </button>{" "}
                  <button onClick={resetConfirm} className={btnSecondary}>
                    Cancel
                  </button>{" "}
                </div>{" "}
              </div>
            )}{" "}
            {/* Error */}{" "}
            {saveError && (
              <p className={`text-xs ${textDangerStrongCls}`}>
                {(saveError as Error).message}
              </p>
            )}{" "}
            {/* Actions */}{" "}
            <div className={`flex gap-2 pt-2 border-t ${borderPanelCls}`}>
              {" "}
              {!confirmAction && (
                <>
                  {" "}
                  <button
                    onClick={handleSave}
                    disabled={
                      !isFormValid ||
                      isSaving ||
                      (editSlug ? !hasAnyChange : false)
                    }
                    className={isRename ? btnDanger : btnPrimary}
                  >
                    {" "}
                    {isSaving
                      ? "Saving..."
                      : editSlug
                        ? isRename
                          ? "Rename & Migrate"
                          : "Save Changes"
                        : "Add Brand"}{" "}
                  </button>{" "}
                  {editSlug && (
                    <button
                      onClick={handleDelete}
                      disabled={deleteMut.isPending}
                      className={btnDanger}
                    >
                      {" "}
                      {deleteMut.isPending ? "Deleting..." : "Delete"}{" "}
                    </button>
                  )}{" "}
                </>
              )}{" "}
              <button onClick={closeDrawer} className={btnSecondary}>
                Cancel
              </button>{" "}
            </div>{" "}
          </div>
        )}{" "}
      </div>{" "}
      {bulkOpen && (
        <div className="sf-overlay-muted fixed inset-0 z-40 p-4 flex items-start md:items-center justify-center">
          {" "}
          <div
            className={`w-full max-w-4xl max-h-[92vh] overflow-hidden sf-surface-card rounded border ${borderPanelCls} shadow-2xl flex flex-col`}
          >
            {" "}
            <div
              className={`px-4 py-3 border-b ${borderPanelCls} flex items-center justify-between`}
            >
              {" "}
              <div>
                {" "}
                <h4 className="text-sm font-semibold">
                  Bulk Paste Brands
                </h4>{" "}
                <p className={`text-xs mt-0.5 ${textSubtleCls}`}>
                  Paste a single column of brand names, one per line.
                </p>{" "}
              </div>{" "}
              <button
                onClick={closeBulkModal}
                disabled={bulkMut.isPending}
                className={`${textMutedCls} hover:sf-text-muted text-lg leading-none disabled:opacity-40`}
                aria-label="Close bulk brand modal"
              >
                {" "}
                &times;{" "}
              </button>{" "}
            </div>{" "}
            <div className="p-4 space-y-3 overflow-auto">
              {" "}
              <div className="grid grid-cols-1 md:grid-cols-[220px,1fr] gap-3 items-end">
                {" "}
                <div>
                  {" "}
                  <label className={labelCls}>Category *</label>{" "}
                  <select
                    value={bulkCategory}
                    onChange={(e) => setBulkCategory(e.target.value)}
                    disabled={bulkMut.isPending}
                    className={`${inputCls} w-full`}
                  >
                    {" "}
                    <option value="">Select category...</option>{" "}
                    {allCategories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}{" "}
                  </select>{" "}
                </div>{" "}
                <div className={`text-xs ${textSubtleCls}`}>
                  {" "}
                  Existing brands are skipped and category membership is merged
                  when needed.{" "}
                </div>{" "}
              </div>{" "}
              <div>
                {" "}
                <label className={labelCls}>
                  Brand Names (Single Column)
                </label>{" "}
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={"Razer\nLogitech\nSteelSeries"}
                  rows={10}
                  disabled={bulkMut.isPending}
                  className={`${inputCls} w-full resize-y font-mono text-xs leading-5`}
                />{" "}
              </div>{" "}
              <div className="flex flex-wrap gap-2 text-xs">
                {" "}
                <span className="px-2 py-1 rounded sf-chip-success">
                  Ready: {bulkCounts.ready}
                </span>{" "}
                <span className="px-2 py-1 rounded sf-chip-info">
                  Existing: {bulkCounts.existing}
                </span>{" "}
                <span
                  className="px-2 py-1 rounded sf-chip-warning"
                >
                  Duplicates: {bulkCounts.duplicate}
                </span>{" "}
                <span
                  className="px-2 py-1 rounded sf-chip-danger"
                >
                  Invalid: {bulkCounts.invalid}
                </span>{" "}
                <span className="px-2 py-1 rounded sf-chip-neutral">
                  Rows: {bulkPreviewRows.length}
                </span>{" "}
              </div>{" "}
              <div
                className={`border ${borderPanelCls} rounded overflow-auto max-h-[34vh]`}
              >
                {" "}
                <table className="w-full text-xs">
                  {" "}
                  <thead
                    className={`sticky top-0 sf-surface-card border-b ${borderPanelCls}`}
                  >
                    {" "}
                    <tr>
                      {" "}
                      <th className="text-left px-2 py-1.5 w-12">#</th>{" "}
                      <th className="text-left px-2 py-1.5">Brand</th>{" "}
                      <th className="text-left px-2 py-1.5">Slug</th>{" "}
                      <th className="text-left px-2 py-1.5 w-40">
                        Status
                      </th>{" "}
                    </tr>{" "}
                  </thead>{" "}
                  <tbody>
                    {" "}
                    {bulkPreviewRows.length === 0 && (
                      <tr>
                        {" "}
                        <td
                          colSpan={4}
                          className={`px-2 py-3 ${textSubtleCls} text-center`}
                        >
                          Paste brands to preview import results.
                        </td>{" "}
                      </tr>
                    )}{" "}
                    {bulkPreviewRows.map((row) => {
                      const statusCls =
                        row.status === "ready"
                          ? "sf-chip-success"
                          : row.status === "already_exists"
                            ? "sf-chip-info"
                            : row.status === "duplicate_in_paste"
                              ? "sf-chip-warning"
                              : "sf-chip-danger";
                      return (
                        <tr
                          key={`${row.rowNumber}-${row.slug}-${row.raw}`}
                          className="sf-divider-default"
                        >
                          {" "}
                          <td className={`px-2 py-1.5 ${textSubtleCls}`}>
                            {row.rowNumber}
                          </td>{" "}
                          <td className="px-2 py-1.5">
                            {row.name || (
                              <span className={`italic ${textMutedCls}`}>
                                -
                              </span>
                            )}
                          </td>{" "}
                          <td className="px-2 py-1.5 font-mono text-[11px] sf-text-muted ">
                            {row.slug || (
                              <span className={`italic ${textMutedCls}`}>
                                -
                              </span>
                            )}
                          </td>{" "}
                          <td className="px-2 py-1.5">
                            {" "}
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full ${statusCls}`}
                            >
                              {row.reason}
                            </span>{" "}
                          </td>{" "}
                        </tr>
                      );
                    })}{" "}
                  </tbody>{" "}
                </table>{" "}
              </div>{" "}
              {bulkMut.error && (
                <div
                  className={`px-3 py-2 text-xs rounded sf-callout sf-callout-danger ${textDangerStrongCls}`}
                >
                  {" "}
                  Bulk brand import failed:{" "}
                  {(bulkMut.error as Error).message}{" "}
                </div>
              )}{" "}
              {bulkMut.data?.results && bulkMut.data.results.length > 0 && (
                <div className={`text-xs border ${borderPanelCls} rounded`}>
                  {" "}
                  <button type="button" onClick={toggleBulkRunDetails} className="cursor-pointer px-3 py-2 sf-surface-card font-medium">
                    {" "}
                    Last run details ({bulkMut.data.results.length} rows){" "}
                  </button>{" "}
                  {bulkRunDetailsOpen && (
                  <div className="max-h-40 overflow-auto p-2 space-y-1">
                    {" "}
                    {bulkMut.data.results.slice(0, 50).map((row, idx) => (
                      <div
                        key={`${idx}-${row.index}-${row.slug || ""}`}
                        className="font-mono text-[11px] sf-text-muted "
                      >
                        {" "}
                        {`[${row.index + 1}] ${row.name} -> ${row.status}${row.reason ? ` (${row.reason})` : ""}`}{" "}
                      </div>
                    ))}{" "}
                    {bulkMut.data.results.length > 50 && (
                      <div className={textSubtleCls}>
                        Showing first 50 rows.
                      </div>
                    )}{" "}
                  </div>
                  )}{" "}
                </div>
              )}{" "}
            </div>{" "}
            <div
              className={`px-4 py-3 border-t ${borderPanelCls} flex items-center justify-between gap-2`}
            >
              {" "}
              <div className={`text-xs ${textSubtleCls}`}>
                {" "}
                Ready brands will be added under{" "}
                <strong>{bulkCategory || "selected category"}</strong>.{" "}
              </div>{" "}
              <div className="flex gap-2">
                {" "}
                <button
                  onClick={closeBulkModal}
                  disabled={bulkMut.isPending}
                  className={btnSecondary}
                >
                  {" "}
                  Close{" "}
                </button>{" "}
                <button
                  onClick={runBulkImport}
                  disabled={
                    bulkMut.isPending ||
                    !bulkCategory.trim() ||
                    bulkNamesToSubmit.length === 0
                  }
                  className={btnPrimary}
                >
                  {" "}
                  {bulkMut.isPending
                    ? "Importing..."
                    : `Import ${bulkNamesToSubmit.length} Ready Brand${bulkNamesToSubmit.length === 1 ? "" : "s"}`}{" "}
                </button>{" "}
              </div>{" "}
            </div>{" "}
          </div>{" "}
        </div>
      )}{" "}
    </>
  );
}
