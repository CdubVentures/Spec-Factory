import type { QueryClient, QueryKey } from '@tanstack/react-query';
import type {
  ComponentReviewDocument,
  ComponentReviewPayload,
  ComponentReviewStatus,
  LinkedProduct,
} from '../../types/componentReview.ts';
import type { FieldState, ProductsIndexResponse } from '../../types/review.ts';

export interface LinkedReviewProductFieldTarget {
  readonly category: string;
  readonly field: string;
  readonly linkedProducts: readonly LinkedProduct[];
}

export interface LinkedReviewProductFieldUpdateTarget extends LinkedReviewProductFieldTarget {
  readonly value: unknown;
  readonly source: string;
  readonly timestamp: string;
  readonly acceptedCandidateId?: string | null;
  readonly overridden?: boolean;
}

export interface LinkedReviewProductFieldSnapshot {
  readonly queryKey: QueryKey;
  readonly data: ProductsIndexResponse | undefined;
}

export interface ComponentReviewGridFieldTarget {
  readonly componentType: string;
  readonly property: string;
  readonly linkedProducts: readonly LinkedProduct[];
}

export interface ComponentReviewDocumentActionTarget {
  readonly category: string;
  readonly reviewId: string;
  readonly action: string;
  readonly mergeTarget?: string | null;
}

export interface ComponentReviewDocumentSnapshot {
  readonly queryKey: QueryKey;
  readonly data: ComponentReviewDocument | undefined;
}

export interface ComponentReviewPayloadRowTarget {
  readonly category: string;
  readonly componentType: string;
  readonly componentIdentityId?: number | null;
  readonly name: string;
  readonly maker: string;
}

export interface ComponentReviewPayloadSnapshot {
  readonly queryKey: QueryKey;
  readonly data: ComponentReviewPayload | undefined;
}

function buildReviewProductsIndexQueryKey(category: string) {
  return ['reviewProductsIndex', category] as const;
}

function buildComponentReviewDocumentQueryKey(category: string) {
  return ['componentReview', category] as const;
}

function buildComponentReviewDataQueryKey(category: string, componentType: string) {
  return ['componentReviewData', category, componentType] as const;
}

function restoreQueryData<TData>(
  queryClient: QueryClient,
  queryKey: QueryKey,
  data: TData | undefined,
) {
  if (data === undefined) {
    queryClient.removeQueries({ queryKey, exact: true });
    return;
  }
  queryClient.setQueryData<TData>(queryKey, data);
}

function buildLinkedProductFieldMap(
  target: LinkedReviewProductFieldTarget,
): ReadonlyMap<string, ReadonlySet<string>> {
  const output = new Map<string, Set<string>>();
  for (const linkedProduct of target.linkedProducts) {
    const productId = String(linkedProduct?.product_id || '').trim();
    if (!productId) continue;
    const linkedField = String(linkedProduct?.field_key || target.field || '').trim();
    if (!linkedField) continue;
    const fields = output.get(productId) ?? new Set<string>();
    fields.add(linkedField);
    output.set(productId, fields);
  }
  return output;
}

export function resolveComponentReviewGridField({
  componentType,
  property,
}: Pick<ComponentReviewGridFieldTarget, 'componentType' | 'property'>): string | null {
  const propertyKey = String(property || '').trim();
  const componentKey = String(componentType || '').trim();
  if (!propertyKey) return null;
  if (propertyKey === '__name') return componentKey || null;
  if (propertyKey === '__maker') return componentKey ? `${componentKey}_brand` : null;
  if (propertyKey.startsWith('__')) return null;
  return propertyKey;
}

function resolveLinkedProductReviewGridFieldKey({
  componentType,
  fallbackField,
  linkedField,
  propertyKey,
}: {
  readonly componentType: string;
  readonly fallbackField: string;
  readonly linkedField: string;
  readonly propertyKey: string;
}): string {
  if (propertyKey === '__name') return linkedField || fallbackField;
  if (propertyKey === '__maker') return `${linkedField || componentType}_brand`;
  return fallbackField;
}

export function buildComponentReviewGridLinkedProducts({
  componentType,
  property,
  linkedProducts,
}: ComponentReviewGridFieldTarget): readonly LinkedProduct[] {
  const fallbackField = resolveComponentReviewGridField({ componentType, property });
  if (!fallbackField) return [];
  const propertyKey = String(property || '').trim();
  return linkedProducts.flatMap((linkedProduct): LinkedProduct[] => {
    const linkedProductId = String(linkedProduct?.product_id || '').trim();
    if (!linkedProductId) return [];
    const baseLinkedField = String(linkedProduct?.field_key || componentType || '').trim();
    const fieldKey = resolveLinkedProductReviewGridFieldKey({
      componentType,
      fallbackField,
      linkedField: baseLinkedField,
      propertyKey,
    });
    if (!fieldKey) return [];
    return [{
      ...linkedProduct,
      product_id: linkedProductId,
      field_key: fieldKey,
    }];
  });
}

function buildEmptyFieldState(): FieldState {
  return {
    selected: {
      value: null,
      confidence: 0,
      status: 'ok',
      color: 'gray',
    },
    candidate_count: 0,
    candidates: [],
  };
}

function updateFieldState(
  fieldState: FieldState | undefined,
  target: LinkedReviewProductFieldUpdateTarget,
): FieldState {
  const existing = fieldState ?? buildEmptyFieldState();
  return {
    ...existing,
    selected: {
      value: target.value,
      confidence: 1,
      status: 'ok',
      color: 'green',
    },
    source: target.source,
    source_timestamp: target.timestamp,
    ...(target.acceptedCandidateId !== undefined
      ? { accepted_candidate_id: target.acceptedCandidateId }
      : {}),
    ...(target.overridden !== undefined ? { overridden: target.overridden } : {}),
  };
}

function clearFieldState(fieldState: FieldState | undefined): FieldState | undefined {
  if (!fieldState) return fieldState;
  const {
    source: _source,
    source_timestamp: _sourceTimestamp,
    method: _method,
    tier: _tier,
    evidence_url: _evidenceUrl,
    evidence_quote: _evidenceQuote,
    accepted_candidate_id: _acceptedCandidateId,
    selected_candidate_id: _selectedCandidateId,
    overridden: _overridden,
    ...rest
  } = fieldState;
  return {
    ...rest,
    selected: {
      value: null,
      ...(fieldState.selected.unit !== undefined ? { unit: fieldState.selected.unit } : {}),
      confidence: 0,
      status: 'ok',
      color: 'gray',
    },
  };
}

function patchLinkedReviewProductFields(
  data: ProductsIndexResponse | undefined,
  target: LinkedReviewProductFieldTarget,
  patchField: (fieldState: FieldState | undefined) => FieldState | undefined,
): ProductsIndexResponse | undefined {
  if (!data) return data;
  const linkedFieldsByProduct = buildLinkedProductFieldMap(target);
  if (linkedFieldsByProduct.size === 0) return data;
  return {
    ...data,
    products: data.products.map((product) => {
      const fieldKeys = linkedFieldsByProduct.get(product.product_id);
      if (!fieldKeys || fieldKeys.size === 0) return product;
      const fields = { ...product.fields };
      for (const fieldKey of fieldKeys) {
        const nextField = patchField(fields[fieldKey]);
        if (nextField) fields[fieldKey] = nextField;
      }
      return { ...product, fields };
    }),
  };
}

function readSnapshot(
  queryClient: QueryClient,
  category: string,
): LinkedReviewProductFieldSnapshot {
  const queryKey = buildReviewProductsIndexQueryKey(category);
  return {
    queryKey,
    data: queryClient.getQueryData<ProductsIndexResponse>(queryKey),
  };
}

function readComponentReviewDocumentSnapshot(
  queryClient: QueryClient,
  category: string,
): ComponentReviewDocumentSnapshot {
  const queryKey = buildComponentReviewDocumentQueryKey(category);
  return {
    queryKey,
    data: queryClient.getQueryData<ComponentReviewDocument>(queryKey),
  };
}

function readComponentReviewPayloadSnapshot(
  queryClient: QueryClient,
  target: Pick<ComponentReviewPayloadRowTarget, 'category' | 'componentType'>,
): ComponentReviewPayloadSnapshot {
  const queryKey = buildComponentReviewDataQueryKey(target.category, target.componentType);
  return {
    queryKey,
    data: queryClient.getQueryData<ComponentReviewPayload>(queryKey),
  };
}

function resolveComponentReviewActionStatus(action: string): ComponentReviewStatus | null {
  const token = String(action || '').trim();
  if (token === 'approve_new') return 'approved_new';
  if (token === 'merge_alias') return 'accepted_alias';
  if (token === 'dismiss') return 'dismissed';
  return null;
}

function patchComponentReviewDocument(
  data: ComponentReviewDocument | undefined,
  target: ComponentReviewDocumentActionTarget,
): ComponentReviewDocument | undefined {
  if (!data) return data;
  const status = resolveComponentReviewActionStatus(target.action);
  if (!status) return data;
  const reviewId = String(target.reviewId || '').trim();
  if (!reviewId) return data;
  return {
    ...data,
    items: data.items.map((item) => {
      if (item.review_id !== reviewId) return item;
      return {
        ...item,
        status,
        ...(target.mergeTarget ? { matched_component: target.mergeTarget } : {}),
      };
    }),
  };
}

export async function cancelLinkedReviewProductFields(
  queryClient: QueryClient,
  category: string,
): Promise<void> {
  await queryClient.cancelQueries({
    queryKey: buildReviewProductsIndexQueryKey(category),
    exact: true,
  });
}

export function restoreLinkedReviewProductFields(
  queryClient: QueryClient,
  snapshot: LinkedReviewProductFieldSnapshot,
): void {
  restoreQueryData(queryClient, snapshot.queryKey, snapshot.data);
}

export function restoreComponentReviewDocument(
  queryClient: QueryClient,
  snapshot: ComponentReviewDocumentSnapshot,
): void {
  restoreQueryData(queryClient, snapshot.queryKey, snapshot.data);
}

export function restoreComponentReviewPayload(
  queryClient: QueryClient,
  snapshot: ComponentReviewPayloadSnapshot,
): void {
  restoreQueryData(queryClient, snapshot.queryKey, snapshot.data);
}

export function patchComponentReviewDocumentAction(
  queryClient: QueryClient,
  target: ComponentReviewDocumentActionTarget,
): ComponentReviewDocumentSnapshot {
  const snapshot = readComponentReviewDocumentSnapshot(queryClient, target.category);
  queryClient.setQueryData<ComponentReviewDocument | undefined>(
    buildComponentReviewDocumentQueryKey(target.category),
    (current) => patchComponentReviewDocument(current, target),
  );
  return snapshot;
}

export function removeComponentReviewRowFromCache(
  queryClient: QueryClient,
  target: ComponentReviewPayloadRowTarget,
): ComponentReviewPayloadSnapshot {
  const snapshot = readComponentReviewPayloadSnapshot(queryClient, target);
  const identityId = Number(target.componentIdentityId);
  const hasIdentityId = Number.isFinite(identityId) && identityId > 0;
  queryClient.setQueryData<ComponentReviewPayload | undefined>(
    buildComponentReviewDataQueryKey(target.category, target.componentType),
    (current) => {
      if (!current) return current;
      const nextItems = current.items.filter((item) => {
        if (hasIdentityId) return Number(item.component_identity_id) !== identityId;
        return item.name !== target.name || item.maker !== target.maker;
      });
      return {
        ...current,
        items: nextItems,
        metrics: {
          ...current.metrics,
          total: nextItems.length,
        },
      };
    },
  );
  return snapshot;
}

export function removeAllComponentReviewRowsFromCache(
  queryClient: QueryClient,
  target: Pick<ComponentReviewPayloadRowTarget, 'category' | 'componentType'>,
): ComponentReviewPayloadSnapshot {
  const snapshot = readComponentReviewPayloadSnapshot(queryClient, target);
  queryClient.setQueryData<ComponentReviewPayload | undefined>(
    buildComponentReviewDataQueryKey(target.category, target.componentType),
    (current) => {
      if (!current) return current;
      return {
        ...current,
        items: [],
        metrics: {
          ...current.metrics,
          total: 0,
        },
      };
    },
  );
  return snapshot;
}

export function updateLinkedReviewProductFields(
  queryClient: QueryClient,
  target: LinkedReviewProductFieldUpdateTarget,
): LinkedReviewProductFieldSnapshot {
  const snapshot = readSnapshot(queryClient, target.category);
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    buildReviewProductsIndexQueryKey(target.category),
    (current) => patchLinkedReviewProductFields(
      current,
      target,
      (fieldState) => updateFieldState(fieldState, target),
    ),
  );
  return snapshot;
}

export function clearLinkedReviewProductFields(
  queryClient: QueryClient,
  target: LinkedReviewProductFieldTarget,
): LinkedReviewProductFieldSnapshot {
  const snapshot = readSnapshot(queryClient, target.category);
  queryClient.setQueryData<ProductsIndexResponse | undefined>(
    buildReviewProductsIndexQueryKey(target.category),
    (current) => patchLinkedReviewProductFields(current, target, clearFieldState),
  );
  return snapshot;
}
