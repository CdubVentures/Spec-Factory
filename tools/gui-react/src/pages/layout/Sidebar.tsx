import { useUiStore } from '../../stores/uiStore.ts';
import { useRuntimeStore } from '../../stores/runtimeStore.ts';
import { OperationsTracker } from '../../features/operations/index.ts';

const selectCls = 'w-full px-2 py-1.5 text-sm border rounded sf-sidebar-control sf-text-primary';

export function Sidebar() {
  const category = useUiStore((s) => s.category);
  const categories = useUiStore((s) => s.categories);
  const setCategory = useUiStore((s) => s.setCategory);
  const processStatus = useRuntimeStore((s) => s.processStatus);

  return (
    <aside className="sf-sidebar w-64 flex-shrink-0 p-4 space-y-4 overflow-y-auto">
      {/* Category */}
      <div>
        <h2 className="text-xs font-semibold uppercase sf-status-text-muted mb-1">Category</h2>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={selectCls}
        >
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <OperationsTracker />

      <div className="border-t border-sf-border-default pt-3 mt-auto">
        {processStatus.running && (
          <p className="mt-2 text-xs sf-text-muted">PID {processStatus.pid} running</p>
        )}
        {processStatus.command && !processStatus.running && (
          <p className="mt-1 text-xs sf-status-text-muted truncate" title={processStatus.command}>
            Last: {processStatus.command}
          </p>
        )}
      </div>
    </aside>
  );
}
