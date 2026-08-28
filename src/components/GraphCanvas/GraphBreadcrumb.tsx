import { useGraphStore } from '../../stores/graphStore';
import { canEnterSubnet, getBreadcrumbPath } from '../../lib/graphContext';

export function GraphBreadcrumb() {
  const nodes = useGraphStore((s) => s.nodes);
  const viewParentId = useGraphStore((s) => s.viewParentId);
  const navigateToGraph = useGraphStore((s) => s.navigateToGraph);

  const crumbs = getBreadcrumbPath(nodes, viewParentId);

  return (
    <div className="flex items-center gap-1 border-b border-white/10 bg-slate-950/90 px-3 py-2 text-xs backdrop-blur">
      {crumbs.map((crumb, index) => (
        <span key={crumb.id ?? 'root'} className="flex items-center gap-1">
          {index > 0 && <span className="text-slate-600">/</span>}
          <button
            type="button"
            onClick={() => {
              if (crumb.id === null) {
                navigateToGraph(null);
                return;
              }
              const node = nodes.find((n) => n.id === crumb.id);
              navigateToGraph(node && canEnterSubnet(node) ? crumb.id : null);
            }}
            className={`rounded px-2 py-1 transition-colors ${
              index === crumbs.length - 1
                ? 'bg-white/10 font-medium text-white'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            {crumb.label}
          </button>
        </span>
      ))}
      {viewParentId && (
        <span className="ml-2 text-slate-600">· 双击项目节点可进入子图</span>
      )}
    </div>
  );
}
