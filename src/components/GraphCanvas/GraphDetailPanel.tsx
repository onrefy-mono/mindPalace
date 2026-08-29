import { useGraphStore } from '../../stores/graphStore';
import { EdgeDetailPanel } from './EdgeDetailPanel';
import { NodeDetailPanel } from './NodeDetailPanel';
import { NodeGroupsPanel } from './NodeGroupsPanel';

interface GraphDetailPanelProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

export function GraphDetailPanel({ collapsed, onCollapsedChange }: GraphDetailPanelProps) {
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);

  if (collapsed) {
    return (
      <aside className="flex h-full w-full shrink-0 flex-col items-center border-l border-white/10 bg-slate-950/60">
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          className="flex h-9 w-full items-center justify-center border-b border-white/10 text-sm text-slate-300 hover:bg-white/5"
          title="展开侧栏"
          aria-label="展开侧栏"
        >
          &lt;
        </button>
        <div className="mt-3 text-[11px] font-medium tracking-widest text-slate-500 [writing-mode:vertical-rl]">
          侧栏
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-l border-white/10 bg-slate-950/60">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-2.5">
        <div className="text-xs uppercase tracking-widest text-slate-500">侧栏</div>
        <button
          type="button"
          onClick={() => onCollapsedChange(true)}
          className="rounded border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
          title="折叠侧栏"
          aria-label="折叠侧栏"
        >
          &gt;
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-[3] overflow-hidden">
          {selectedEdgeId ? <EdgeDetailPanel /> : <NodeDetailPanel />}
        </div>
        <div className="min-h-0 flex-[2] border-t border-white/10">
          <NodeGroupsPanel onJumpNode={setSelectedNode} />
        </div>
      </div>
    </aside>
  );
}
