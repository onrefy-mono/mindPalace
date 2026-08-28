import { useFocusStore } from '../../stores/focusStore';
import { useGraphStore } from '../../stores/graphStore';
import { usePersistentState } from '../../hooks/usePersistentState';
import { DOMAIN_LABELS, focusColor } from '../../types';

const FOCUS_COLOR_PRESETS = [
  '#60a5fa',
  '#38bdf8',
  '#22d3ee',
  '#2dd4bf',
  '#34d399',
  '#a3e635',
  '#facc15',
  '#fb923c',
  '#f87171',
  '#fb7185',
  '#f472b6',
  '#c084fc',
  '#a78bfa',
  '#818cf8',
  '#94a3b8',
  '#f8fafc',
];

export function FocusDetailPanel() {
  const [collapsed, setCollapsed] = usePersistentState(
    'mind-palace-ui-focus-detail-collapsed',
    false,
  );
  const selectedId = useFocusStore((s) => s.selectedId);
  const activeId = useFocusStore((s) => s.activeId);
  const focusItems = useFocusStore((s) => s.items);
  const updateFocus = useFocusStore((s) => s.update);
  const removeFocus = useFocusStore((s) => s.remove);
  const setActive = useFocusStore((s) => s.setActive);
  const nodes = useGraphStore((s) => s.nodes);

  const selectedFocus = focusItems.find((f) => f.id === selectedId);

  if (collapsed) {
    return (
      <aside className="flex h-full w-9 shrink-0 flex-col items-center border-r border-white/10 bg-slate-950/60">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex h-9 w-full items-center justify-center border-b border-white/10 text-sm text-slate-300 hover:bg-white/5"
          title="展开关注详情"
          aria-label="展开关注详情"
        >
          &gt;
        </button>
        <div className="mt-3 text-[11px] font-medium tracking-widest text-slate-500 [writing-mode:vertical-rl]">
          关注详情
        </div>
      </aside>
    );
  }

  if (!selectedFocus) {
    return (
      <aside className="flex h-full w-72 shrink-0 flex-col border-r border-white/10 bg-slate-950/60">
        <div className="border-b border-white/10 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-widest text-slate-500">关注详情</div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              className="rounded border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
              title="折叠关注详情"
              aria-label="折叠关注详情"
            >
              &lt;
            </button>
          </div>
          <h2 className="mt-1 text-sm font-medium text-slate-400">选择左侧关注点</h2>
        </div>
        <div className="flex flex-1 items-center justify-center p-6 text-center text-xs text-slate-600">
          单击查看详情 · 双击激活工作区
        </div>
      </aside>
    );
  }

  const color = focusColor(selectedFocus);
  const isActive = activeId === selectedFocus.id;
  const linkedNodes = selectedFocus.linked_node_ids
    .map((id) => nodes.find((n) => n.id === id))
    .filter(Boolean);

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r border-white/10 bg-slate-950/60">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-widest text-slate-500">关注详情</div>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="rounded border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
            title="折叠关注详情"
            aria-label="折叠关注详情"
          >
            &lt;
          </button>
        </div>
        <h2 className="mt-1 line-clamp-2 text-lg font-semibold text-white">{selectedFocus.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span
            className="rounded-full px-2 py-0.5"
            style={{
              backgroundColor: `${color}22`,
              color,
            }}
          >
            {DOMAIN_LABELS[selectedFocus.domain]}
          </span>
          {isActive ? (
            <span className="text-emerald-400">已激活 · 新建节点归属此关注</span>
          ) : (
            <span className="text-slate-500">双击卡片以激活</span>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <section>
          <div className="mb-2 text-xs text-slate-500">自定义颜色</div>
          <div className="grid grid-cols-8 gap-2">
            {FOCUS_COLOR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                title={preset}
                aria-label={`设置关注颜色 ${preset}`}
                onClick={() => updateFocus(selectedFocus.id, { color: preset })}
                className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-105 ${
                  color.toLowerCase() === preset.toLowerCase()
                    ? 'border-white'
                    : 'border-white/10'
                }`}
                style={{ backgroundColor: preset }}
              />
            ))}
          </div>
        </section>

        {selectedFocus.note && (
          <section>
            <div className="mb-2 text-xs text-slate-500">备注</div>
            <p className="text-sm leading-relaxed text-slate-300">{selectedFocus.note}</p>
          </section>
        )}

        <section>
          <div className="mb-2 text-xs text-slate-500">关联节点 ({linkedNodes.length})</div>
          {linkedNodes.length === 0 ? (
            <p className="text-xs text-slate-500">激活后在此关注下创建的节点会自动出现在这里</p>
          ) : (
            <div className="space-y-1">
              {linkedNodes.map((node) => (
                <div
                  key={node!.id}
                  className="rounded-lg border border-white/8 bg-white/5 px-3 py-2 text-sm text-slate-300"
                >
                  {node!.label}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="flex flex-col gap-2 border-t border-white/10 p-4">
        {!isActive && selectedFocus.status === 'active' && (
          <button
            type="button"
            onClick={() => setActive(selectedFocus.id)}
            className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-500/15"
          >
            激活此关注
          </button>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              const note = prompt('更新备注', selectedFocus.note ?? '');
              if (note !== null) updateFocus(selectedFocus.id, { note: note || undefined });
            }}
            className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
          >
            编辑备注
          </button>
          <button
            type="button"
            onClick={() => removeFocus(selectedFocus.id)}
            className="rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
          >
            删除
          </button>
        </div>
      </div>
    </aside>
  );
}
