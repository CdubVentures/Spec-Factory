import { useQuery } from '@tanstack/react-query';
import { api } from '../../../api/client.ts';

export interface PerKeyDocParagraphBlock {
  readonly kind: 'paragraph';
  readonly text: string;
}

export interface PerKeyDocBulletListBlock {
  readonly kind: 'bulletList';
  readonly items: readonly string[];
}

export interface PerKeyDocTableBlock {
  readonly kind: 'table';
  readonly headers: readonly string[];
  readonly rows: readonly (readonly unknown[])[];
}

export interface PerKeyDocCodeBlock {
  readonly kind: 'codeBlock';
  readonly text: string;
}

export interface PerKeyDocDetailsBlock {
  readonly kind: 'details';
  readonly summary: string;
  readonly blocks: readonly PerKeyDocBlock[];
}

export interface PerKeyDocSubheadingBlock {
  readonly kind: 'subheading';
  readonly level: number;
  readonly text: string;
}

export type PerKeyDocNoteTone = 'info' | 'warn' | 'err' | 'good';

export interface PerKeyDocNoteBlock {
  readonly kind: 'note';
  readonly tone?: PerKeyDocNoteTone;
  readonly text: string;
}

export type PerKeyDocBlock =
  | PerKeyDocParagraphBlock
  | PerKeyDocBulletListBlock
  | PerKeyDocTableBlock
  | PerKeyDocCodeBlock
  | PerKeyDocDetailsBlock
  | PerKeyDocSubheadingBlock
  | PerKeyDocNoteBlock;

export interface PerKeyDocSection {
  readonly id: string;
  readonly title: string;
  readonly level?: number;
  readonly blocks?: readonly PerKeyDocBlock[];
  readonly children?: readonly PerKeyDocSection[];
}

export interface PerKeyDocStructureMeta {
  readonly fieldKey: string;
  readonly displayName: string;
  readonly group: string;
  readonly category: string;
  readonly generatedAt: string;
  readonly reserved: boolean;
  readonly navigatorOrdinal?: string;
}

export interface PerKeyDocStructure {
  readonly meta: PerKeyDocStructureMeta;
  readonly sections: readonly PerKeyDocSection[];
}

export interface PerKeyDocResponse {
  readonly category: string;
  readonly fieldKey: string;
  readonly generatedAt: string;
  readonly structure: PerKeyDocStructure;
}

export function perKeyDocQueryKey(category: string, fieldKey: string) {
  return ['per-key-doc', category, fieldKey] as const;
}

export function fetchPerKeyDoc(category: string, fieldKey: string): Promise<PerKeyDocResponse> {
  const path = `/category-audit/${encodeURIComponent(category)}/per-key-doc/${encodeURIComponent(fieldKey)}`;
  return api.get<PerKeyDocResponse>(path);
}

export interface UsePerKeyDocOptions {
  readonly category: string;
  readonly fieldKey: string;
}

export function usePerKeyDoc({ category, fieldKey }: UsePerKeyDocOptions) {
  return useQuery({
    queryKey: perKeyDocQueryKey(category, fieldKey),
    queryFn: () => fetchPerKeyDoc(category, fieldKey),
    enabled: Boolean(category) && Boolean(fieldKey),
    staleTime: 30_000,
  });
}
