import { useState } from 'react';
import { useFocusStore } from '../../stores/focusStore';
import { useGraphStore } from '../../stores/graphStore';
import {
  DOMAIN_LABELS,
  focusColor,
  type Domain,
  type FocusItem,
} from '../../types';

interface FocusPanelProps {
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

function FocusCard({
  item,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  item: FocusItem;
  draggable?: boolean;
  onDragStart?: (id: string) => void;
  onDragOver?: (id: string) => void;
  onDrop?: (id: string) => void;
}) {
  const activeId = useFocusStore((s) => s.activeId);
  const selectedId = useFocusStore((s) => s.selectedId);
  const setActive = useFocusStore((s) => s.setActive);
  const setSelected = useFocusStore((s) => s.setSelected);
  const setStatus = useFocusStore((s) => s.setStatus);
  const removeFocus = useFocusStore((s) => s.remove);
  const nodes = useGraphStore((s) => s.nodes);

  const isActive = activeId === item.id;
  const isSelected = selectedId === item.id;
  const color = focusColor(item);
  const linkedLabels = item.linked_node_ids
    .map((id) => nodes.find((n) => n.id === id)?.label)
    .filter(Boolean);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.(item.id);
      }}
      onDragOver={(e) => {
        if (!draggable) return;
        e.preventDefault();
        onDragOver?.(item.id);
      }}
      onDrop={(e) => {
        if (!draggable) return;
        e.preventDefault();
        onDrop?.(item.id);
      }}
      onClick={() => setSelected(item.id)}
      onDoubleClick={() => setActive(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setSelected(item.id);
        }
      }}
      className={`w-full cursor-pointer rounded-xl border p-3 text-left transition-all ${
        isSelected
          ? 'border-white/30 bg-white/10 shadow-lg shadow-black/20'
          : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
      } ${isActive ? 'ring-2' : ''}`}
      style={isActive ? { boxShadow: `0 0 0 1px ${color}88, 0 8px 24px rgba(0,0,0,0.25)` } : undefined}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate font-medium text-white">{item.title}</span>
            {isActive && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{ backgroundColor: `${color}22`, color }}
              >
                工作中
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>{DOMAIN_LABELS[item.domain]}</span>
            {draggable && <span>· 可拖动排序</span>}
            {item.status !== 'active' && (
              <>
                <span>·</span>
                <span>{item.status === 'paused' ? '暂停' : '完成'}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {item.status === 'active' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStatus(item.id, 'done');
              }}
              className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:text-emerald-300"
              title="标记完成"
            >
              ✓
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`确定删除关注点「${item.title}」？`)) {
                removeFocus(item.id);
              }
            }}
            className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:text-red-300"
            title="删除关注点"
            aria-label={`删除关注点 ${item.title}`}
          >
            ×
          </button>
        </div>
      </div>

      {item.note && <p className="mb-2 line-clamp-2 text-xs text-slate-400">{item.note}</p>}

      {linkedLabels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {linkedLabels.map((label) => (
            <span
              key={label}
              className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-slate-300"
            >
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function FocusPanel({ collapsed, onCollapsedChange }: FocusPanelProps) {
  const getOrdered = useFocusStore((s) => s.getOrdered);
  const reorder = useFocusStore((s) => s.reorder);
  const add = useFocusStore((s) => s.add);
  const addNode = useGraphStore((s) => s.addNode);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState<Domain>('work');
  const [note, setNote] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const items = getOrdered();
  const activeItems = items.filter((i) => i.status === 'active');
  const doneItems = items.filter((i) => i.status === 'done');

  if (collapsed) {
    return (
      <aside className="flex h-full w-full shrink-0 flex-col items-center border-r border-white/10 bg-slate-950/80 backdrop-blur">
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          className="flex h-9 w-full items-center justify-center border-b border-white/10 text-sm text-slate-300 hover:bg-white/5"
          title="展开关注区"
          aria-label="展开关注区"
        >
          &gt;
        </button>
        <div className="mt-3 text-[11px] font-medium tracking-widest text-slate-500 [writing-mode:vertical-rl]">
          关注区
        </div>
      </aside>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const node = addNode({
      label: title.trim(),
      type: 'project',
      content: note.trim() || undefined,
      tags: ['focus'],
      connectToId: null,
      skipFocusLink: true,
    });
    add({
      title: title.trim(),
      domain,
      note: note.trim() || undefined,
      linked_node_ids: [node.id],
    });
    setTitle('');
    setNote('');
    setShowForm(false);
  };

  return (
    <aside className="flex h-full w-full shrink-0 flex-col border-r border-white/10 bg-slate-950/80 backdrop-blur">
      <div className="border-b border-white/10 p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-widest text-slate-500">工作记忆</div>
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            className="rounded border border-white/10 px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
            title="折叠关注区"
            aria-label="折叠关注区"
          >
            &lt;
          </button>
        </div>
        <h2 className="text-lg font-semibold text-white">关注区</h2>
        <p className="mt-1 text-xs text-slate-400">
          单击查看 · 双击激活 · 激活后新建的节点自动归属
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {activeItems.map((item) => (
          <FocusCard
            key={item.id}
            item={item}
            draggable
            onDragStart={setDragId}
            onDrop={(targetId) => {
              if (dragId) reorder(dragId, targetId);
              setDragId(null);
            }}
          />
        ))}

        {doneItems.length > 0 && (
          <div className="pt-2">
            <div className="mb-2 text-xs text-slate-500">已完成</div>
            {doneItems.map((item) => (
              <FocusCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-white/10 p-4">
        {showForm ? (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="新的关注点..."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-400/50"
              autoFocus
            />
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value as Domain)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="research">研究</option>
              <option value="work">工作</option>
              <option value="personal">个人</option>
            </select>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="简短备注（可选）"
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500"
              >
                添加
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
              >
                取消
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="w-full rounded-lg border border-dashed border-white/15 px-3 py-2.5 text-sm text-slate-300 hover:border-white/25 hover:bg-white/5"
          >
            + 添加关注点
          </button>
        )}
      </div>
    </aside>
  );
}
