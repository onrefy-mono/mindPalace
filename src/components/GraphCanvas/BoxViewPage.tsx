import { memo, type DragEvent, useCallback, useMemo, useState } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { typeIcon } from '../../lib/d3Graph';
import { NODE_INTERFACE_LIST_VIEW_ID } from '../../lib/networkBox';
import { NODE_TYPE_META, type BoxView, type BoxViewType, type MindNode } from '../../types';

const BOX_VIEW_LABELS: Record<BoxViewType, string> = {
  graph: '图谱',
  list: '列表',
  table: '表格',
  board: '看板',
};

const BOX_VIEW_ICONS: Record<BoxViewType, string> = {
  graph: '🕸️',
  list: '☰',
  table: '▦',
  board: '▤',
};

interface BoxViewPageProps {
  groupId: string;
  viewId: string;
}

function sortMembersForView(members: MindNode[], view?: BoxView) {
  const orderIndex = new Map((view?.node_order ?? []).map((id, index) => [id, index]));
  return [...members].sort((a, b) => {
    const aOrder = orderIndex.get(a.id);
    const bOrder = orderIndex.get(b.id);
    if (aOrder != null && bOrder != null) return aOrder - bOrder;
    if (aOrder != null) return -1;
    if (bOrder != null) return 1;
    return (a.y ?? 0) - (b.y ?? 0);
  });
}

function EmptyState() {
  return (
    <div className="flex min-h-72 items-center justify-center rounded-lg border border-dashed border-white/10 text-sm text-slate-600">
      当前 Box 暂无节点
    </div>
  );
}

function GraphView({ members }: { members: MindNode[] }) {
  if (members.length === 0) return <EmptyState />;

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
      {members.map((node) => (
        <article
          key={node.id}
          className="rounded-lg border border-white/10 bg-slate-950/70 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-start gap-2 text-sm font-semibold text-white">
                <span className="shrink-0" aria-hidden="true">{typeIcon(node.type)}</span>
                <span className="min-w-0 break-words">{node.label}</span>
              </h2>
              <p className="mt-1 text-xs text-slate-500">{NODE_TYPE_META[node.type].label}</p>
            </div>
            <span className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-500">
              {node.layer}
            </span>
          </div>
          {node.content && (
            <p className="mt-3 break-words text-xs leading-5 text-slate-400">{node.content}</p>
          )}
          {node.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {node.tags.map((tag) => (
                <span key={tag} className="rounded bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-500">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function ListView({
  groupId,
  view,
  members,
}: {
  groupId: string;
  view: BoxView;
  members: MindNode[];
}) {
  const updateGroupViewNodeOrder = useGraphStore((s) => s.updateGroupViewNodeOrder);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const reorder = useCallback((draggedId: string, index: number) => {
    const current = members.map((node) => node.id);
    const from = current.indexOf(draggedId);
    if (from < 0) return;
    const clampedIndex = Math.max(0, Math.min(index, current.length - 1));
    const insertIndex = from < clampedIndex ? clampedIndex - 1 : clampedIndex;
    if (from === insertIndex) return;
    const next = [...current];
    const [moved] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(insertIndex, next.length)), 0, moved);
    updateGroupViewNodeOrder(groupId, view.id, next);
  }, [groupId, members, updateGroupViewNodeOrder, view.id]);

  const onDragStart = useCallback((event: DragEvent<HTMLElement>, nodeId: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
    setDraggingId(nodeId);
    setPreviewIndex(members.findIndex((node) => node.id === nodeId));
  }, [members]);

  const updatePreview = useCallback((event: DragEvent<HTMLElement>, index: number) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const nextIndex = event.clientY > rect.top + rect.height / 2 ? index + 1 : index;
    setPreviewIndex((current) => (current === nextIndex ? current : nextIndex));
  }, []);

  const onDrop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    const draggedId = event.dataTransfer.getData('text/plain');
    if (previewIndex != null) reorder(draggedId, previewIndex);
    setDraggingId(null);
    setPreviewIndex(null);
  }, [previewIndex, reorder]);

  const clearDrag = useCallback(() => {
    setDraggingId(null);
    setPreviewIndex(null);
  }, []);

  if (members.length === 0) return <EmptyState />;

  const visibleMembers = members;
  const clampedPreviewIndex = Math.max(0, Math.min(previewIndex ?? visibleMembers.length, visibleMembers.length));
  const draggingNode = draggingId ? members.find((node) => node.id === draggingId) : undefined;

  const renderPlaceholder = () => (
    <div className="border-y border-teal-400/40 bg-teal-500/10 px-4 py-3">
      <div className="h-10 rounded-md border border-dashed border-teal-300/50 bg-teal-400/10" />
    </div>
  );

  return (
    <div
      data-perf="box-view-list"
      className="divide-y divide-white/8 overflow-hidden rounded-lg border border-white/10 bg-slate-950/60"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPreviewIndex(null);
      }}
    >
      {visibleMembers.map((node, index) => (
        <div key={node.id} className="contents">
        {draggingId && clampedPreviewIndex === index && renderPlaceholder()}
        <ListRow
          index={index}
          isDragging={node.id === draggingId}
          node={node}
          onDragEnd={clearDrag}
          onDragStart={onDragStart}
          onPreview={updatePreview}
        />
        </div>
      ))}
      {draggingId && clampedPreviewIndex === visibleMembers.length && renderPlaceholder()}
      {draggingNode && (
        <div className="pointer-events-none border-t border-white/8 bg-white/[0.03] px-4 py-2 text-xs text-teal-200">
          正在移动：{draggingNode.label}
        </div>
      )}
    </div>
  );
}

const ListRow = memo(function ListRow({
  index,
  isDragging,
  node,
  onDragEnd,
  onDragStart,
  onPreview,
}: {
  index: number;
  isDragging: boolean;
  node: MindNode;
  onDragEnd: () => void;
  onDragStart: (event: DragEvent<HTMLElement>, nodeId: string) => void;
  onPreview: (event: DragEvent<HTMLElement>, index: number) => void;
}) {
  return (
    <article
      data-perf="box-view-list-row"
      data-node-id={node.id}
      draggable
      onDragStart={(event) => onDragStart(event, node.id)}
      onDragOver={(event) => onPreview(event, index)}
      onDragEnd={onDragEnd}
      className={`grid cursor-grab grid-cols-[1fr_auto] gap-4 px-4 py-3 transition-opacity active:cursor-grabbing ${
        isDragging ? 'opacity-35' : ''
      }`}
    >
      <div className="min-w-0">
        <h2 className="flex items-start gap-2 text-sm font-medium text-white">
          <span className="shrink-0" aria-hidden="true">{typeIcon(node.type)}</span>
          <span className="min-w-0 break-words">{node.label}</span>
        </h2>
        {node.content && <p className="mt-1 break-words text-xs text-slate-500">{node.content}</p>}
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>{NODE_TYPE_META[node.type].label}</span>
        <span>{node.status ?? 'active'}</span>
      </div>
    </article>
  );
});

function TableView({ members }: { members: MindNode[] }) {
  if (members.length === 0) return <EmptyState />;

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-slate-950/60">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-white/[0.04] text-xs text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">节点</th>
            <th className="w-28 px-4 py-3 font-medium">类型</th>
            <th className="w-24 px-4 py-3 font-medium">状态</th>
            <th className="w-40 px-4 py-3 font-medium">标签</th>
            <th className="w-40 px-4 py-3 font-medium">更新</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/8">
          {members.map((node) => (
            <tr key={node.id}>
              <td className="px-4 py-3">
                <div className="flex items-start gap-2 font-medium text-white">
                  <span className="shrink-0" aria-hidden="true">{typeIcon(node.type)}</span>
                  <span className="min-w-0 break-words">{node.label}</span>
                </div>
                {node.content && <div className="mt-1 break-words text-xs text-slate-500">{node.content}</div>}
              </td>
              <td className="px-4 py-3 text-slate-400">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true">{typeIcon(node.type)}</span>
                  {NODE_TYPE_META[node.type].label}
                </span>
              </td>
              <td className="px-4 py-3 text-slate-500">{node.status ?? '-'}</td>
              <td className="break-words px-4 py-3 text-slate-500">{node.tags.join(', ') || '-'}</td>
              <td className="px-4 py-3 text-slate-500">{node.updated_at.slice(0, 10)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BoardView({ members }: { members: MindNode[] }) {
  if (members.length === 0) return <EmptyState />;

  const grouped = members.reduce<Record<string, MindNode[]>>((acc, node) => {
    const label = NODE_TYPE_META[node.type].label;
    acc[label] = [...(acc[label] ?? []), node];
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
      {Object.entries(grouped).map(([label, items]) => (
        <section key={label} className="min-w-0 rounded-lg border border-white/10 bg-slate-950/60">
          <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
            <h2 className="flex items-center gap-2 text-sm font-medium text-slate-200">
              <span aria-hidden="true">{typeIcon(items[0].type)}</span>
              {label}
            </h2>
            <span className="text-xs text-slate-600">{items.length}</span>
          </div>
          <div className="space-y-2 p-2">
            {items.map((node) => (
              <article key={node.id} className="rounded-md border border-white/8 bg-white/[0.04] p-2">
                <div className="flex items-start gap-2 text-sm text-white">
                  <span className="shrink-0" aria-hidden="true">{typeIcon(node.type)}</span>
                  <span className="min-w-0 break-words">{node.label}</span>
                </div>
                {node.content && <p className="mt-1 break-words text-xs text-slate-500">{node.content}</p>}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function renderView(groupId: string, view: BoxView, members: MindNode[]) {
  if (view.type === 'list') return <ListView groupId={groupId} view={view} members={members} />;
  if (view.type === 'table') return <TableView members={members} />;
  if (view.type === 'board') return <BoardView members={members} />;
  return <GraphView members={members} />;
}

export function BoxViewPage({ groupId, viewId }: BoxViewPageProps) {
  const groups = useGraphStore((s) => s.groups);
  const nodes = useGraphStore((s) => s.nodes);
  const addGroupView = useGraphStore((s) => s.addGroupView);
  const updateGroupView = useGraphStore((s) => s.updateGroupView);
  const removeGroupView = useGraphStore((s) => s.removeGroupView);
  const setActiveGroupView = useGraphStore((s) => s.setActiveGroupView);

  const group = groups.find((item) => item.id === groupId);
  const view = group?.views?.find((item) => item.id === viewId) ?? group?.views?.[0];
  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  const members = useMemo(() => {
    if (!group) return [];
    const rawMembers = group.node_ids
      .map((id) => nodeById.get(id))
      .filter((node): node is MindNode => Boolean(node));
    return sortMembersForView(rawMembers, view);
  }, [group, nodeById, view]);

  if (!group || !view) {
    return (
      <main className="flex h-screen flex-col bg-slate-950 text-slate-100">
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <h1 className="text-lg font-semibold text-white">视图不存在</h1>
            <button
              type="button"
              onClick={() => { window.location.hash = ''; }}
              className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
            >
              返回图谱
            </button>
          </div>
        </div>
      </main>
    );
  }

  const openView = (nextViewId: string) => {
    setActiveGroupView(group.id, nextViewId);
    window.location.hash = `box-view/${group.id}/${nextViewId}`;
  };

  const createView = (type: Exclude<BoxViewType, 'graph'>) => {
    const nextViewId = addGroupView(group.id, type);
    if (nextViewId) {
      window.location.hash = `box-view/${group.id}/${nextViewId}`;
    }
  };

  const deleteCurrentView = () => {
    if (view.type === 'graph' || view.id === NODE_INTERFACE_LIST_VIEW_ID) return;
    const fallbackViewId = group.views?.find((item) => item.id !== view.id)?.id;
    removeGroupView(group.id, view.id);
    if (fallbackViewId) {
      window.location.hash = `box-view/${group.id}/${fallbackViewId}`;
    }
  };

  return (
    <main className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => { window.location.hash = ''; }}
            className="mb-2 text-xs text-slate-500 hover:text-slate-300"
          >
            返回图谱
          </button>
          <div className="flex items-center gap-3">
            <span
              className="h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: group.color }}
            />
            <h1 className="truncate text-xl font-semibold text-white">{group.name}</h1>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-xs text-slate-500">
              <span aria-hidden="true">{BOX_VIEW_ICONS[view.type]}</span>
              {BOX_VIEW_LABELS[view.type]}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-2">
          {group.views?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openView(item.id)}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                item.id === view.id
                  ? 'border-teal-400/40 bg-teal-500/10 text-teal-100'
                  : 'border-white/10 text-slate-400 hover:bg-white/5'
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>
      </header>
      <section className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="mx-auto max-w-6xl">
          <div className="mb-4 rounded-lg border border-white/10 bg-slate-950/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={view.name}
                readOnly={view.id === NODE_INTERFACE_LIST_VIEW_ID}
                onChange={(event) =>
                  updateGroupView(group.id, view.id, { name: event.target.value })
                }
                className="min-w-44 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none focus:border-teal-400/40 read-only:text-slate-400"
                aria-label="视图名称"
              />
              {(['list', 'table', 'board'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => createView(type)}
                  className="rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
                >
                  + {BOX_VIEW_ICONS[type]} {BOX_VIEW_LABELS[type]}
                </button>
              ))}
              {view.type !== 'graph' && view.id !== NODE_INTERFACE_LIST_VIEW_ID && (
                <button
                  type="button"
                  onClick={deleteCurrentView}
                  className="rounded-lg border border-red-500/25 px-3 py-2 text-sm text-red-300 hover:bg-red-500/10"
                >
                  删除视图
                </button>
              )}
            </div>
          </div>
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="text-sm text-slate-500">{members.length} 个节点</p>
            <p className="text-xs text-slate-600">Box View</p>
          </div>
          {renderView(group.id, view, members)}
        </div>
      </section>
    </main>
  );
}
