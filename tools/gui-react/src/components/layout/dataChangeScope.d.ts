export interface DataChangeScopeMessage {
  category?: string;
  categories?: string[];
}

export function resolveDataChangeScopedCategories(
  message: DataChangeScopeMessage | null | undefined,
  fallbackCategory: string,
): string[];

export function applyDataChangeInvalidation(args: {
  message: DataChangeScopeMessage | null | undefined;
  fallbackCategory: string;
  invalidateForCategory: (category: string) => void;
}): string[];
