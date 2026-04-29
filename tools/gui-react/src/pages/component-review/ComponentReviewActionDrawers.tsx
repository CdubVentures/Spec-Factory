import { PromptDrawerChevron } from '../../shared/ui/finder/PromptDrawerChevron.tsx';
import { ACTION_BUTTON_WIDTH } from '../../shared/ui/actionButton/index.ts';
import type { ComponentReviewItem } from '../../types/componentReview.ts';

interface ComponentReviewRowActionDrawerProps {
  item: ComponentReviewItem;
  componentType: string;
  onRequestDelete: (item: ComponentReviewItem) => void;
  deletePending?: boolean;
}

interface ComponentReviewHeaderActionDrawerProps {
  componentType: string;
  rowCount: number;
  onRequestDeleteAll: () => void;
  deletePending?: boolean;
}

function toPositiveId(value: unknown): number | undefined {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const id = Math.trunc(n);
  return id > 0 ? id : undefined;
}

function actionStorageToken(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'component';
}

export function ComponentReviewRowActionDrawer({
  item,
  componentType,
  onRequestDelete,
  deletePending = false,
}: ComponentReviewRowActionDrawerProps) {
  const componentIdentityId = toPositiveId(item.component_identity_id);
  const canDelete = Boolean(componentIdentityId);
  const label = `${item.name}${item.maker ? ` | ${item.maker}` : ''}`;

  return (
    <PromptDrawerChevron
      storageKey={`component-review:row-drawer:${actionStorageToken(componentType)}:${componentIdentityId ?? actionStorageToken(label)}`}
      openWidthClass="w-32"
      ariaLabel={`Actions for ${label || componentType}`}
      closedTitle={`Show actions for "${label || componentType}"`}
      openedTitle={`Hide actions for "${label || componentType}"`}
      actions={[
        {
          label: 'Delete',
          onClick: () => onRequestDelete(item),
          disabled: deletePending || !canDelete,
          intent: deletePending || !canDelete ? 'locked' : 'delete',
          width: ACTION_BUTTON_WIDTH.keyRow,
          title: canDelete
            ? 'Delete this component row and unpublish its linked component, brand, and link fields.'
            : 'This component row cannot be deleted because it has no identity id.',
        },
      ]}
    />
  );
}

export function ComponentReviewHeaderActionDrawer({
  componentType,
  rowCount,
  onRequestDeleteAll,
  deletePending = false,
}: ComponentReviewHeaderActionDrawerProps) {
  const hasRows = rowCount > 0;

  return (
    <PromptDrawerChevron
      storageKey={`component-review:header-drawer:${actionStorageToken(componentType)}`}
      openWidthClass="w-32"
      ariaLabel={`Actions for all ${componentType} component rows`}
      closedTitle={`Show actions for all "${componentType}" rows`}
      openedTitle={`Hide actions for all "${componentType}" rows`}
      actions={[
        {
          label: 'Delete All',
          onClick: onRequestDeleteAll,
          disabled: deletePending || !hasRows,
          intent: deletePending || !hasRows ? 'locked' : 'delete',
          width: ACTION_BUTTON_WIDTH.keyRow,
          title: hasRows
            ? `Delete all ${rowCount} ${componentType} component row(s).`
            : 'Nothing to delete.',
        },
      ]}
    />
  );
}
