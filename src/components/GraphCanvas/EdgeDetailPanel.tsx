import { useEffect, useState } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import {
  EDGE_TYPE_COLORS,
  EDGE_TYPE_LABELS,
  EDGE_TYPES,
  edgeTypeHasDirection,
} from '../../types';

export function EdgeDetailPanel() {
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const nodes = useGraphStore((s) => s.nodes);
  const groups = useGraphStore((s) => s.groups);
  const edges = useGraphStore((s) => s.edges);
  const updateEdge = useGraphStore((s) => s.updateEdge);
  const reverseEdge = useGraphStore((s) => s.reverseEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const setSelectedEdge = useGraphStore((s) => s.setSelectedEdge);

  const rawSelectedEdge = edges.find((e) => e.id === selectedEdgeId);
  const selectedEdge = rawSelectedEdge?.derived_from_edge_id
    ? edges.find((e) => e.id === rawSelectedEdge.derived_from_edge_id)
    : rawSelectedEdge;
  const sourceEndpoint = selectedEdge
    ? (selectedEdge.source_kind ?? 'node') === 'group'
      ? groups.find((group) => group.id === selectedEdge.source)
      : nodes.find((n) => n.id === selectedEdge.source)
    : undefined;
  const targetEndpoint = selectedEdge
    ? (selectedEdge.target_kind ?? 'node') === 'group'
      ? groups.find((group) => group.id === selectedEdge.target)
      : nodes.find((n) => n.id === selectedEdge.target)
    : undefined;
  const sourceLabel = sourceEndpoint && 'name' in sourceEndpoint ? sourceEndpoint.name : sourceEndpoint?.label;
  const targetLabel = targetEndpoint && 'name' in targetEndpoint ? targetEndpoint.name : targetEndpoint?.label;
  const sourceIsNode = selectedEdge ? (selectedEdge.source_kind ?? 'node') === 'node' : false;
  const targetIsNode = selectedEdge ? (selectedEdge.target_kind ?? 'node') === 'node' : false;
  const hasDirection = selectedEdge ? edgeTypeHasDirection(selectedEdge.type) : false;
  const hasGroupEndpoint = selectedEdge
    ? (selectedEdge.source_kind ?? 'node') === 'group' || (selectedEdge.target_kind ?? 'node') === 'group'
    : false;
  const derivedCount = selectedEdge
    ? edges.filter((edge) => edge.derived_from_edge_id === selectedEdge.id).length
    : 0;

  const [labelDraft, setLabelDraft] = useState(selectedEdge?.label ?? '');

  useEffect(() => {
    setLabelDraft(selectedEdge?.label ?? '');
  }, [selectedEdgeId, selectedEdge?.label]);

  if (!selectedEdge || !sourceEndpoint || !targetEndpoint || !sourceLabel || !targetLabel) {
    return (
      <div className="flex h-full flex-col bg-slate-950/60">
        <div className="border-b border-white/10 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-500">连线参数</div>
          <h2 className="mt-1 text-sm font-medium text-slate-400">选择图谱中的连线</h2>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-xs text-slate-600">
          <p>单击连线编辑关系 · 右键可反转方向或改类型</p>
          <p className="text-slate-700">拖线建边时会弹出类型选择</p>
        </div>
      </div>
    );
  }

  const handleLabelBlur = () => {
    const next = labelDraft.trim();
    if (next !== (selectedEdge.label ?? '')) {
      updateEdge(selectedEdge.id, { label: next || undefined });
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950/60">
      <div className="border-b border-white/10 p-4">
        <div className="text-xs uppercase tracking-widest text-slate-500">连线参数</div>
        <h2 className="mt-2 text-lg font-semibold text-white">
          {EDGE_TYPE_LABELS[selectedEdge.type]}
        </h2>
        <div
          className="mt-2 h-1 w-12 rounded-full"
          style={{ backgroundColor: EDGE_TYPE_COLORS[selectedEdge.type] }}
        />
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <section>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">{hasDirection ? '方向' : '两端节点'}</span>
            {hasDirection && (
              <button
                type="button"
                onClick={() => reverseEdge(selectedEdge.id)}
                className="rounded border border-white/10 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-white/5 hover:text-white"
                title="交换输出与输入端"
              >
                反转方向
              </button>
            )}
          </div>
          <div className="rounded-lg border border-white/8 bg-white/3 p-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-600">
              {hasDirection ? '输出' : '端点 A'}
            </div>
            <button
              type="button"
              onClick={() => {
                if (sourceIsNode) setSelectedNode(selectedEdge.source);
              }}
              className="mt-1 block w-full text-left text-sm font-medium text-slate-200 hover:text-white"
            >
              {sourceLabel}
            </button>
            <div className="my-2 flex items-center gap-2 text-xs text-slate-500">
              <span className="h-px flex-1 bg-white/10" />
              <span>{hasDirection ? '→' : '—'}</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-600">
              {hasDirection ? '输入' : '端点 B'}
            </div>
            <button
              type="button"
              onClick={() => {
                if (targetIsNode) setSelectedNode(selectedEdge.target);
              }}
              className="mt-1 block w-full text-left text-sm font-medium text-slate-200 hover:text-white"
            >
              {targetLabel}
            </button>
          </div>
        </section>

        {hasGroupEndpoint && (
          <section>
            <div className="mb-2 text-xs text-slate-500">Box 子节点连接</div>
            <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-slate-400">
              已自动派生 {derivedCount} 条隐藏连接
            </div>
          </section>
        )}

        <section>
          <div className="mb-2 text-xs text-slate-500">关系类型</div>
          <div className="grid grid-cols-2 gap-1.5">
            {EDGE_TYPES.map((type) => {
              const active = selectedEdge.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => updateEdge(selectedEdge.id, { type })}
                  className={`rounded-lg border px-2 py-1.5 text-left text-xs ${
                    active
                      ? 'border-amber-400/40 bg-amber-500/10 text-amber-200'
                      : 'border-white/8 text-slate-400 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-0.5 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: EDGE_TYPE_COLORS[type] }}
                    />
                    <span className="font-medium">{EDGE_TYPE_LABELS[type]}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-2 text-xs text-slate-500">备注（可选）</div>
          <input
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={handleLabelBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleLabelBlur();
              }
            }}
            placeholder="关系说明..."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-amber-400/40"
          />
        </section>
      </div>

      <div className="border-t border-white/10 p-4">
        <button
          type="button"
          onClick={() => {
            removeEdge(selectedEdge.id);
            setSelectedEdge(null);
          }}
          className="w-full rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
        >
          断开连接
        </button>
      </div>
    </div>
  );
}
