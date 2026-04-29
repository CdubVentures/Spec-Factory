import type { ReactElement } from 'react';
import { OverviewPageSkeleton } from '../pages/overview/OverviewPageSkeleton.tsx';
import { BrandManagerSkeleton } from '../features/studio/components/BrandManagerSkeleton.tsx';
import { ColorRegistryPageSkeleton } from '../features/color-registry/components/ColorRegistryPageSkeleton.tsx';
import { UnitRegistryPageSkeleton } from '../pages/unit-registry/UnitRegistryPageSkeleton.tsx';
import { StudioPageSkeleton } from '../features/studio/components/StudioPageSkeleton.tsx';
import { RuntimeOpsLoadingSkeleton } from '../features/runtime-ops/components/RuntimeOpsLoadingSkeleton.tsx';
import { ReviewPageSkeleton } from '../features/review/components/ReviewPageSkeleton.tsx';
import { ComponentReviewPageSkeleton } from '../pages/component-review/ComponentReviewPageSkeleton.tsx';
import {
  StorageOverviewSkeleton,
  StorageProductTableSkeleton,
} from '../features/storage-manager/components/StorageLoadingSkeleton.tsx';
import { ProductManagerSkeleton } from '../features/catalog/components/ProductManagerSkeleton.tsx';
import { PublisherTableSkeleton } from '../pages/publisher/PublisherTableSkeleton.tsx';
import { CategoryManagerSkeleton } from '../features/catalog/components/CategoryManagerSkeleton.tsx';
import { PickerLoadingSkeleton } from '../features/indexing/panels/PickerLoadingSkeleton.tsx';
import { LlmConfigPageSkeleton } from '../features/llm-config/components/LlmConfigPageSkeleton.tsx';
import { PipelineSettingsPageSkeleton } from '../features/pipeline-settings/components/PipelineSettingsPageSkeleton.tsx';
import { BillingPageSkeleton } from '../pages/billing/BillingPageSkeleton.tsx';

// WHY: Per-route Suspense fallback for lazy page chunks. Without this, every
// lazy route shows the generic AppShellLoadingSkeleton during chunk load and
// then a different page-internal skeleton once the page mounts — a visible
// "two-skeleton" flash. Mapping each path to its page-level skeleton makes
// the chunk-load → data-load → real-content transition a single coherent
// shape. Routes without a registered page-level skeleton fall back to
// AppShellLoadingSkeleton (the caller is responsible for that fallback).
export function getRouteFallbackSkeleton(path: string): ReactElement | null {
  switch (path) {
    case '/':                  return <OverviewPageSkeleton category="" />;
    case '/brands':            return <BrandManagerSkeleton drawerOpen={false} />;
    case '/colors':            return <ColorRegistryPageSkeleton />;
    case '/units':             return <UnitRegistryPageSkeleton />;
    case '/studio':            return <StudioPageSkeleton category="" activeTab="mapping" />;
    case '/runtime-ops':       return <RuntimeOpsLoadingSkeleton />;
    case '/review':            return <ReviewPageSkeleton drawerOpen={false} />;
    case '/review-components': return <ComponentReviewPageSkeleton category="" />;
    case '/catalog':           return <ProductManagerSkeleton category="" drawerOpen={false} />;
    case '/publisher':         return <PublisherTableSkeleton />;
    case '/categories':        return <CategoryManagerSkeleton />;
    case '/indexing':          return <PickerLoadingSkeleton />;
    case '/llm-config':        return <LlmConfigPageSkeleton />;
    case '/pipeline-settings': return <PipelineSettingsPageSkeleton />;
    case '/billing':           return <BillingPageSkeleton />;
    case '/storage':
      return (
        <div className="space-y-4">
          <StorageOverviewSkeleton />
          <StorageProductTableSkeleton />
        </div>
      );
    default:
      return null;
  }
}
