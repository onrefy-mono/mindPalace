import type { DragEvent, MouseEvent } from 'react';
import { useState } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { getGroupsInGraph, NODE_INTERFACE_LIST_VIEW_ID } from '../../lib/networkBox';
import {
  GROUP_COLORS,
  NODE_TYPE_META,
  type BoxView,
  type BoxViewType,
  type MindNode,
} from '../../types';

const NETWORK_BOX_COLOR_PRESETS = [
  ...GROUP_COLORS,
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
];

const BOX_VIEW_LABELS: Record<BoxViewType, string> = {
  graph: '图谱',
  list: '列表',
  table: '表格',
  board: '看板',
};

interface NodeGroupsPanelProps {
  onJumpNode: (id: string) => void;
}

export function NodeGroupsPanel({ onJumpNode }: NodeGroupsPanelProps) {
  const groups = useGraphStore((s) => s.groups);
  const nodes = useGraphStore((s) => s.nodes);
  const viewParentId = useGraphStore((s) => s.viewParentId);
  const selectedGroupId = useGraphStore((s) => s.selectedGroupId);
  const setSelectedGroup = useGraphStore((s) => s.setSelectedGroup);
  const updateGroup = useGraphStore((s) => s.updateGroup);
  const removeGroup = useGraphStore((s) => s.removeGroup);
  const addGroupView = useGraphStore((s) => s.addGroupView);
  const setActiveGroupView = useGraphStore((s) => s.setActiveGroupView);
  const updateGroupView = useGraphStore((s) => s.updateGroupView);
  const removeGroupView = useGraphStore((s) => s.removeGroupView);
  const updateGroupViewNodeOrder = useGraphStore((s) => s.updateGroupViewNodeOrder);
  const removeNodeFromGroup = useGraphStore((s) => s.removeNodeFromGroup);
  const fitGroupToNodes = useGraphStore((s) => s.fitGroupToNodes);
  const [listDrag, setListDrag] = useState<{
    groupId: string;
    viewId: string;
    nodeId: string;
    previewIndex: number;
  } | null>(null);

  const visibleGroups = getGroupsInGraph(groups, viewParentId);

  const resolveMembers = (nodeIds: string[]): MindNode[] =>
    nodeIds
      .map((id) => nodes.find((node) => node.id === id))
      .filter((node): node is MindNode => Boolean(node));

  const sortMembersForView = (members: MindNode[], view?: BoxView) => {
    const orderIndex = new Map((view?.node_order ?? []).map((id, index) => [id, index]));
    return [...members].sort((a, b) => {
      const aOrder = orderIndex.get(a.id);
      const bOrder = orderIndex.get(b.id);
      if (aOrder != null && bOrder != null) return aOrder - bOrder;
      if (aOrder != null) return -1;
      if (bOrder != null) return 1;
      return (a.y ?? 0) - (b.y ?? 0);
    });
  };

  const boxViewUrl = (groupId: string, viewId: string) =>
    `${window.location.origin}${window.location.pathname}#/box-view/${encodeURIComponent(groupId)}/${encodeURIComponent(viewId)}`;

  const openViewPage = (
    groupId: string,
    viewId: string,
    event?: MouseEvent<HTMLButtonElement>,
  ) => {
    event?.stopPropagation();
    setActiveGroupView(groupId, viewId);
    const url = boxViewUrl(groupId, viewId);
    if (event?.ctrlKey || event?.metaKey) {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    window.location.href = url;
  };

  const renderGraphView = (groupId: string, members: MindNode[]) => (
    <div className="flex flex-wrap gap-1.5">
      {members.length === 0 ? (
        <span className="text-[11px] text-slate-600">框内暂无节点</span>
      ) : (
        members.map((node) => (
          <span
            key={node.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md border border-white/10 bg-slate-950/70 pl-2 pr-1 text-[11px] text-slate-200"
          >
            <button
              type="button"
              onClick={() => onJumpNode(node.id)}
              className="break-words text-left hover:text-white"
              title={NODE_TYPE_META[node.type].label}
            >
              {node.label}
            </button>
            <button
              type="button"
              onClick={() => removeNodeFromGroup(groupId, node.id)}
              className="rounded px-1 text-slate-500 hover:bg-white/10 hover:text-red-300"
              aria-label={`从 Box 中移除 ${node.label}`}
            >
              ×
            </button>
          </span>
        ))
      )}
    </div>
  );

  const renderListView = (groupId: string, view: BoxView, members: MindNode[]) => {
    const reorder = (draggedId: string, index: number) => {
      const current = members.map((node) => node.id);
      const from = current.indexOf(draggedId);
      if (from < 0) return;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(Math.max(0, Math.min(index, next.length)), 0, moved);
      updateGroupViewNodeOrder(groupId, view.id, next);
    };

    const onDragStart = (event: DragEvent<HTMLButtonElement>, nodeId: string) => {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', nodeId);
      setListDrag({ groupId, viewId: view.id, nodeId, previewIndex: members.findIndex((node) => node.id === nodeId) });
    };

    const updatePreview = (event: DragEvent<HTMLButtonElement>, index: number) => {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      setListDrag((current) =>
        current && current.groupId === groupId && current.viewId === view.id
          ? { ...current, previewIndex: event.clientY > rect.top + rect.height / 2 ? index + 1 : index }
          : current,
      );
    };

    const onDrop = (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const draggedId = event.dataTransfer.getData('text/plain');
      const activeDrag = listDrag?.groupId === groupId && listDrag.viewId === view.id ? listDrag : null;
      if (activeDrag) reorder(draggedId, activeDrag.previewIndex);
      setListDrag(null);
    };

    const activeDrag = listDrag?.groupId === groupId && listDrag.viewId === view.id ? listDrag : null;
    const visibleMembers = activeDrag ? members.filter((node) => node.id !== activeDrag.nodeId) : members;
    const previewIndex = activeDrag
      ? Math.max(0, Math.min(activeDrag.previewIndex, visibleMembers.length))
      : -1;
    const renderPlaceholder = () => (
      <div className="rounded-lg border border-dashed border-teal-300/45 bg-teal-400/10 px-2 py-3" />
    );

    return (
    <div
      className="space-y-1.5"
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      {visibleMembers.map((node, index) => (
        <div key={node.id} className="space-y-1.5">
        {activeDrag && previewIndex === index && renderPlaceholder()}
        <button
          type="button"
          draggable
          onDragStart={(event) => onDragStart(event, node.id)}
          onDragOver={(event) => updatePreview(event, index)}
          onDragEnd={() => setListDrag(null)}
          onClick={() => onJumpNode(node.id)}
          className="flex w-full cursor-grab items-center justify-between gap-2 rounded-lg border border-white/8 bg-slate-950/50 px-2 py-1.5 text-left hover:border-white/15 active:cursor-grabbing"
        >
          <span className="min-w-0 break-words text-[12px] text-slate-100">{node.label}</span>
          <span className="shrink-0 text-[10px] text-slate-500">{NODE_TYPE_META[node.type].label}</span>
        </button>
        </div>
      ))}
      {activeDrag && previewIndex === visibleMembers.length && renderPlaceholder()}
    </div>
    );
  };

  const renderTableView = (members: MindNode[]) => (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <table className="w-full table-fixed text-left text-[11px]">
        <thead className="bg-white/[0.04] text-slate-500">
          <tr>
            <th className="px-2 py-1.5 font-medium">节点</th>
            <th className="w-14 px-2 py-1.5 font-medium">类型</th>
            <th className="w-14 px-2 py-1.5 font-medium">状态</th>
          </tr>
        </thead>
        <tbody>
          {members.map((node) => (
            <tr key={node.id} className="border-t border-white/8">
              <td className="px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => onJumpNode(node.id)}
                  className="max-w-full break-words text-left text-slate-100 hover:text-white"
                >
                  {node.label}
                </button>
              </td>
              <td className="px-2 py-1.5 text-slate-500">{NODE_TYPE_META[node.type].label}</td>
              <td className="px-2 py-1.5 text-slate-500">{node.status ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const renderBoardView = (members: MindNode[]) => {
    const grouped = members.reduce<Record<string, MindNode[]>>((acc, node) => {
      const label = NODE_TYPE_META[node.type].label;
      acc[label] = [...(acc[label] ?? []), node];
      return acc;
    }, {});

    return (
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(grouped).map(([label, items]) => (
          <div key={label} className="min-w-0 rounded-lg border border-white/10 bg-slate-950/50">
            <div className="border-b border-white/8 px-2 py-1 text-[10px] text-slate-500">
              {label} · {items.length}
            </div>
            <div className="space-y-1 p-1.5">
              {items.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onJumpNode(node.id)}
                  className="block w-full break-words rounded-md bg-white/[0.04] px-2 py-1 text-left text-[11px] text-slate-200 hover:bg-white/[0.08]"
                >
                  {node.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderViewContent = (groupId: string, view: BoxView, members: MindNode[]) => {
    if (members.length === 0) return <span className="text-[11px] text-slate-600">框内暂无节点</span>;
    if (view.type === 'list') return renderListView(groupId, view, members);
    if (view.type === 'table') return renderTableView(members);
    if (view.type === 'board') return renderBoardView(members);
    return renderGraphView(groupId, members);
  };

  const selectedGroup = selectedGroupId
    ? groups.find((group) => group.id === selectedGroupId) ?? null
    : null;
  const selectedGroupViews = selectedGroup?.views ?? [];
  const selectedActiveView = selectedGroup
    ? selectedGroupViews.find((view) => view.id === selectedGroup.active_view_id) ?? selectedGroupViews[0]
    : undefined;
  const selectedMembers = selectedGroup
    ? sortMembersForView(resolveMembers(selectedGroup.node_ids), selectedActiveView)
    : [];

  const renderGroupDetail = () => {
    if (!selectedGroup) return null;

    return (
      <div className="space-y-3">
        <div className="rounded-xl border border-teal-400/30 bg-teal-500/10 p-3">
          <div className="flex items-start gap-2">
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-sm"
              style={{ backgroundColor: selectedGroup.color }}
            />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest text-teal-200/70">
                已选中 Network Box
              </div>
              <input
                value={selectedGroup.name}
                onChange={(e) => updateGroup(selectedGroup.id, { name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-transparent bg-transparent px-0 text-base font-semibold text-white outline-none focus:border-white/10 focus:bg-white/5 focus:px-2"
                aria-label="Box 名称"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-lg border border-white/10 bg-black/15 px-2 py-1.5">
              <div className="text-slate-500">节点</div>
              <div className="mt-0.5 font-medium text-slate-100">{selectedMembers.length}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/15 px-2 py-1.5">
              <div className="text-slate-500">视图</div>
              <div className="mt-0.5 font-medium text-slate-100">{selectedGroupViews.length}</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/15 px-2 py-1.5">
              <div className="text-slate-500">尺寸</div>
              <div className="mt-0.5 font-medium text-slate-100">
                {Math.round(selectedGroup.width ?? 0)}×{Math.round(selectedGroup.height ?? 0)}
              </div>
            </div>
          </div>
        </div>

        <section>
          <div className="mb-2 text-xs text-slate-500">颜色</div>
          <div className="grid grid-cols-8 gap-1.5">
            {NETWORK_BOX_COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                title={color}
                aria-label={`设置 Box 颜色 ${color}`}
                onClick={() => updateGroup(selectedGroup.id, { color })}
                className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-105 ${
                  selectedGroup.color.toLowerCase() === color.toLowerCase()
                    ? 'border-white'
                    : 'border-white/10'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </section>

        {selectedActiveView && (
          <section className="space-y-2 rounded-xl border border-white/10 bg-black/10 p-2.5">
            <div className="flex flex-wrap gap-1">
              {selectedGroupViews.map((view) => (
                <button
                  key={view.id}
                  type="button"
                  onClick={() => setActiveGroupView(selectedGroup.id, view.id)}
                  className={`rounded-md border px-2 py-1 text-[10px] ${
                    selectedActiveView.id === view.id
                      ? 'border-teal-400/40 bg-teal-500/10 text-teal-100'
                      : 'border-white/10 text-slate-400 hover:bg-white/5'
                  }`}
                  title={BOX_VIEW_LABELS[view.type]}
                >
                  {view.name}
                </button>
              ))}
            </div>

            <div className="flex gap-1">
              {(['list', 'table', 'board'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addGroupView(selectedGroup.id, type)}
                  className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:bg-white/5"
                >
                  + {BOX_VIEW_LABELS[type]}
                </button>
              ))}
            </div>

            <div className="flex gap-1">
              <input
                value={selectedActiveView.name}
                readOnly={selectedActiveView.id === NODE_INTERFACE_LIST_VIEW_ID}
                onChange={(e) =>
                  updateGroupView(selectedGroup.id, selectedActiveView.id, { name: e.target.value })
                }
                className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white outline-none focus:border-teal-400/40 read-only:text-slate-400"
                aria-label="视图名称"
              />
              <button
                type="button"
                onClick={(event) => openViewPage(selectedGroup.id, selectedActiveView.id, event)}
                className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-300 hover:border-teal-400/30 hover:bg-teal-500/10 hover:text-teal-100"
                title="打开视图页面，Ctrl/Cmd 点击新标签页"
              >
                打开
              </button>
              {selectedActiveView.type !== 'graph' && selectedActiveView.id !== NODE_INTERFACE_LIST_VIEW_ID && (
                <button
                  type="button"
                  onClick={() => removeGroupView(selectedGroup.id, selectedActiveView.id)}
                  className="rounded-md border border-red-500/20 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
                >
                  删除
                </button>
              )}
            </div>

            {renderViewContent(selectedGroup.id, selectedActiveView, selectedMembers)}
          </section>
        )}

        <section className="grid grid-cols-2 gap-2 text-[11px] text-slate-500">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
            <div>位置</div>
            <div className="mt-0.5 text-slate-300">
              {Math.round(selectedGroup.x ?? 0)}, {Math.round(selectedGroup.y ?? 0)}
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
            <div>创建时间</div>
            <div className="mt-0.5 truncate text-slate-300">
              {new Date(selectedGroup.created_at).toLocaleDateString()}
            </div>
          </div>
        </section>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => fitGroupToNodes(selectedGroup.id)}
            className="flex-1 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-slate-300 hover:bg-white/5"
          >
            贴合节点
          </button>
          <button
            type="button"
            onClick={() => removeGroup(selectedGroup.id)}
            className="rounded-lg border border-red-500/20 px-2 py-1.5 text-[11px] text-red-300 hover:bg-red-500/10"
          >
            删除 Box
          </button>
        </div>
      </div>
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-950/80">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-500">Network Box</div>
            <p className="mt-0.5 text-[11px] text-slate-600">
              {selectedGroup ? '正在显示选中 Box 的详情' : 'Shift+P 在画布创建 · 拖节点入框'}
            </p>
          </div>
          <span className="text-[10px] text-slate-600">{visibleGroups.length} 个</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {selectedGroup ? (
          renderGroupDetail()
        ) : visibleGroups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-3 py-8 text-center text-xs text-slate-600">
            当前子图暂无 Network Box
          </div>
        ) : (
          <div className="space-y-2">
            {visibleGroups.map((group) => {
              const selected = selectedGroupId === group.id;
              const views = group.views ?? [];
              const activeView = views.find((view) => view.id === group.active_view_id) ?? views[0];
              const members = sortMembersForView(resolveMembers(group.node_ids), activeView);

              return (
                <div
                  key={group.id}
                  className={`rounded-xl border px-3 py-2.5 transition-colors ${
                    selected
                      ? 'border-teal-400/40 bg-teal-500/10'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/15'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedGroup(group.id)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: group.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{group.name}</span>
                        <span className="text-[10px] text-slate-500">{members.length} 个节点</span>
                      </span>
                    </button>
                    {activeView && (
                      <button
                        type="button"
                        onClick={(event) => openViewPage(group.id, activeView.id, event)}
                        className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-[10px] text-slate-400 hover:border-teal-400/30 hover:bg-teal-500/10 hover:text-teal-100"
                        title="打开视图页面，Ctrl/Cmd 点击新标签页"
                        aria-label={`打开 ${group.name} 的 ${activeView.name} 视图页面`}
                      >
                        打开
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
