import {
  EDGE_TYPE_COLORS,
  EDGE_TYPE_LABELS,
  EDGE_TYPES,
  NODE_TYPE_META,
  NODE_TYPES,
  edgeTypeHasDirection,
} from '../../types';
import { typeIcon } from '../../lib/d3Graph';
import { usePersistentState } from '../../hooks/usePersistentState';
import type { EdgeType } from '../../types';

function edgeDash(type: EdgeType) {
  switch (type) {
    case 'blocks':
      return '5 4';
    case 'depends_on':
      return '9 4';
    case 'inspired_by':
      return '3 4';
    default:
      return undefined;
  }
}

export function GraphLegend() {
  const [collapsed, setCollapsed] = usePersistentState('mind-palace-ui-graph-legend-collapsed', false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute left-4 top-4 z-10 rounded-lg border border-white/10 bg-slate-900/90 px-3 py-2 text-xs text-slate-300 backdrop-blur hover:bg-slate-800"
        title="展开图例"
        aria-label="展开图例"
      >
        图例
      </button>
    );
  }

  return (
    <div className="absolute left-4 top-4 z-10 max-w-[210px] rounded-xl border border-white/10 bg-slate-900/90 p-3 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">思维分类</div>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/5 hover:text-slate-200"
          title="折叠图例"
          aria-label="折叠图例"
        >
          -
        </button>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {NODE_TYPES.map((type) => (
          <span
            key={type}
            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300"
          >
            <span className="text-slate-100">{typeIcon(type)}</span>
            {NODE_TYPE_META[type].label}
          </span>
        ))}
      </div>
      <div className="mb-2 text-[10px] uppercase tracking-widest text-slate-500">连线类型</div>
      <div className="space-y-1.5">
        {EDGE_TYPES.map((type) => (
          <div key={type} className="flex items-center gap-2">
            <svg className="h-4 w-9 shrink-0 overflow-visible" viewBox="0 0 36 16" aria-hidden="true">
              {edgeTypeHasDirection(type) && (
                <defs>
                  <marker
                    id={`legend-arrow-${type}`}
                    viewBox="0 -4 8 8"
                    refX="7"
                    refY="0"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto"
                  >
                    <path d="M 0 -3 L 8 0 L 0 3 z" fill={EDGE_TYPE_COLORS[type]} />
                  </marker>
                </defs>
              )}
              <line
                x1="2"
                y1="8"
                x2={edgeTypeHasDirection(type) ? '29' : '34'}
                y2="8"
                stroke={EDGE_TYPE_COLORS[type]}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={edgeDash(type)}
                markerEnd={edgeTypeHasDirection(type) ? `url(#legend-arrow-${type})` : undefined}
              />
              {type === 'blocks' && (
                <g stroke={EDGE_TYPE_COLORS[type]} strokeWidth="2" strokeLinecap="round">
                  <line x1="15" y1="5" x2="21" y2="11" />
                  <line x1="15" y1="11" x2="21" y2="5" />
                </g>
              )}
              {type === 'part_of' && (
                <rect
                  x="14"
                  y="4"
                  width="8"
                  height="8"
                  rx="1.5"
                  fill="rgba(15,23,42,0.92)"
                  stroke={EDGE_TYPE_COLORS[type]}
                  strokeWidth="2"
                />
              )}
              {type === 'depends_on' && (
                <path
                  d="M 18 3 L 23 8 L 18 13 L 13 8 Z"
                  fill="rgba(15,23,42,0.92)"
                  stroke={EDGE_TYPE_COLORS[type]}
                  strokeWidth="2"
                />
              )}
              {type === 'inspired_by' && (
                <text
                  x="18"
                  y="8"
                  fill={EDGE_TYPE_COLORS[type]}
                  fontSize="15"
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  ✦
                </text>
              )}
            </svg>
            <span className="text-[10px] text-slate-400">{EDGE_TYPE_LABELS[type]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
