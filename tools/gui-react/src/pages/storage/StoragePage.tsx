import { StorageManagerPanel } from '../../features/storage-manager/index.ts';

export function StoragePage() {
  return (
    <div className="flex flex-col h-full gap-4">
      <StorageManagerPanel />
    </div>
  );
}
