import type * as d3 from 'd3';
import { useGraphStore } from '../../stores/graphStore';
import { typeIcon } from '../../lib/d3Graph';
import { EDGE_TYPE_COLORS, EDGE_TYPE_LABELS, NODE_TYPE_META } from '../../types';

interface AiNodeGroupPreviewProps {
  transform: d3.ZoomTransform;
}

export function AiNodeGroupPreview({ transform }: AiNodeGroupPreviewProps) {
  const preview = useGraphStore((state) => state.aiNodeGroupPreview);
  const approve = useGraphStore((state) => state.approveAiNodeGroupPreview);
  const reject = useGraphStore((state) => state.rejectAiNodeGroupPreview);

  if (!preview) return null;

  const scale = transform.k;
  const left = transform.x + preview.x * scale;
  const top = transform.y + preview.y * scale;
  const nodeByTempId = new Map(preview.nodes.map((node) => [node.tempId, node]));

  const pointFor = (id: string | 'connected') => {
    if (id === 'connected') return null;
    const node = nodeByTempId.get(id);
    return node ? { x: node.x - preview.x, y: node.y - preview.y } : null;
  };

  return (
    <div
      className="pointer-events-auto absolute z-20 rounded-xl border-2 border-dashed border-emerald-300/70 bg-slate-950/80 shadow-2xl shadow-emerald-950/30 backdrop-blur"
      style={{
        left,
        top,
        width: preview.width,
        height: preview.height,
        transform: `scale(${scale})`,
        transformOrigin: '0 0',
      }}
    >
      <div className="flex h-11 items-center justify-between gap-3 border-b border-emerald-300/20 px-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-emerald-300">AI 预览</div>
          <div className="truncate text-sm font-semibold text-white">{preview.boxName}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={approve}
            disabled={preview.status !== 'ready'}
            className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            批准
          </button>
          <button
            type="button"
            onClick={reject}
            className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-slate-300 hover:bg-white/5 hover:text-white"
          >
            否决
          </button>
        </div>
      </div>

      {preview.status === 'running' && (
        <div className="flex h-[calc(100%-2.75rem)] items-center justify-center px-5 text-center text-sm text-emerald-100">
          正在生成节点组预览...
        </div>
      )}

      {preview.status === 'error' && (
        <div className="flex h-[calc(100%-2.75rem)] flex-col items-center justify-center gap-3 px-5 text-center">
          <div className="text-sm font-medium text-red-200">生成失败</div>
          <div className="max-w-xs whitespace-pre-wrap text-xs leading-5 text-red-100/80">
            {preview.error}
          </div>
        </div>
      )}

      {preview.status === 'ready' && (
        <div className="relative h-[calc(100%-2.75rem)]">
          <svg className="pointer-events-none absolute inset-0 h-full w-full">
            {preview.edges.map((edge, index) => {
              const source = pointFor(edge.sourceTempId);
              const target = pointFor(edge.targetTempId);
              if (!source || !target) return null;
              return (
                <line
                  key={`${edge.sourceTempId}-${edge.targetTempId}-${index}`}
                  x1={source.x}
                  y1={source.y - 44}
                  x2={target.x}
                  y2={target.y - 44}
                  stroke={EDGE_TYPE_COLORS[edge.type]}
                  strokeWidth={2}
                  strokeDasharray="6 5"
                  opacity={0.8}
                />
              );
            })}
          </svg>
          {preview.nodes.map((node) => (
            <div
              key={node.tempId}
              className="absolute flex w-32 -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-lg border border-emerald-200/30 bg-slate-900/95 px-2.5 py-2 text-left shadow-lg"
              style={{ left: node.x - preview.x, top: node.y - preview.y - 44 }}
              title={node.content}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/8 text-sm text-white">
                {typeIcon(node.type)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-medium text-white">{node.label}</span>
                <span className="block truncate text-[10px] text-slate-500">
                  {NODE_TYPE_META[node.type].label}
                </span>
              </span>
            </div>
          ))}
          <div className="absolute bottom-2 left-3 right-3 truncate rounded-md border border-white/8 bg-black/20 px-2 py-1 text-[11px] text-slate-400">
            {preview.nodes.length} 个节点 · {preview.edges.length} 条关系 ·{' '}
            {preview.edges.slice(0, 3).map((edge) => EDGE_TYPE_LABELS[edge.type]).join(' / ')}
          </div>
        </div>
      )}
    </div>
  );
}
