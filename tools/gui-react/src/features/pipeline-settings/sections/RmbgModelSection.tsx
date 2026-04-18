// RMBG Model section — renders the hfToken field and indicates whether the
// model weights are already on disk (one-time bootstrap credential).

import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';
import { GenericSectionPanel } from '../components/GenericSectionPanel.tsx';
import type { SettingsCategoryId } from '../state/SettingsCategoryRegistry.ts';
import type { NumberBound } from '../../../shared/registryDerivedSettingsMaps.ts';

interface RmbgStatusResponse {
  readonly ready: boolean;
  readonly path: string;
}

export interface RmbgModelSectionProps {
  categoryId: SettingsCategoryId;
  sectionId: string;
  runtimeDraft: Record<string, unknown>;
  onBoolChange: (key: string, next: boolean) => void;
  onNumberChange: (key: string, eventValue: string, bounds: NumberBound) => void;
  onStringChange: (key: string, value: string) => void;
  disabled?: boolean;
}

export function RmbgModelSection({
  categoryId,
  sectionId,
  runtimeDraft,
  onBoolChange,
  onNumberChange,
  onStringChange,
  disabled = false,
}: RmbgModelSectionProps) {
  const { data } = useQuery<RmbgStatusResponse>({
    queryKey: ['product-image-finder', 'rmbg', 'status'],
    queryFn: () => api.get<RmbgStatusResponse>('/product-image-finder/rmbg/status'),
    staleTime: 60_000,
  });

  return (
    <>
      {data?.ready ? (
        <p className="sf-text-caption" style={{ color: 'var(--sf-muted)' }}>
          Model already seeded — weights are present at <code>{data.path}</code>. This token is no longer required unless the file is deleted.
        </p>
      ) : null}
      <GenericSectionPanel
        categoryId={categoryId}
        sectionId={sectionId}
        runtimeDraft={runtimeDraft}
        onBoolChange={onBoolChange}
        onNumberChange={onNumberChange}
        onStringChange={onStringChange}
        disabled={disabled}
      />
    </>
  );
}

export default RmbgModelSection;
