import { useEffect, useState } from 'react';
import { useFocusStore } from '../../stores/focusStore';
import { useGraphStore } from '../../stores/graphStore';
import { useDebouncedCallback } from '../../lib/useDebouncedCallback';
import {
  EDGE_TYPE_LABELS,
  EDGE_TYPES,
  NODE_TYPE_META,
  NODE_TYPES,
  type EdgeType,
} from '../../types';

export function NodeDetailPanel() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectedNodeIds = useGraphStore((s) => s.selectedNodeIds);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const groups = useGraphStore((s) => s.groups);
  const updateNode = useGraphStore((s) => s.updateNode);
  const removeNode = useGraphStore((s) => s.removeNode);
  const addEdge = useGraphStore((s) => s.addEdge);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const updateEdge = useGraphStore((s) => s.updateEdge);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const enterSubnet = useGraphStore((s) => s.enterSubnet);
  const loadFocus = useFocusStore((s) => s.load);
  const [copyNotice, setCopyNotice] = useState('');

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const multiCount = selectedNodeIds.length;

  useEffect(() => {
    setCopyNotice('');
  }, [selectedNodeId]);

  const debouncedUpdate = useDebouncedCallback(
    (id: string, patch: { label?: string; content?: string }) => {
      updateNode(id, patch);
    },
    400,
  );

  if (!selectedNode) {
    return (
      <div className="flex h-full flex-col bg-slate-950/60">
        <div className="border-b border-white/10 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-500">节点参数</div>
          <h2 className="mt-1 text-sm font-medium text-slate-400">选择图谱中的节点</h2>
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-xs text-slate-600">
          <p>单击节点编辑属性 · 单击连线编辑关系 · Shift 框选多选</p>
          <p className="text-slate-700">双击空白创建 · Ctrl+F 跳转 · 双击项目进入子图</p>
        </div>
      </div>
    );
  }

  if (multiCount > 1) {
    return (
      <div className="flex h-full flex-col bg-slate-950/60">
        <div className="border-b border-white/10 p-4">
          <div className="text-xs uppercase tracking-widest text-slate-500">节点参数</div>
          <h2 className="mt-2 text-lg font-semibold text-white">已选 {multiCount} 个节点</h2>
          <p className="mt-1 text-sm text-slate-400">单击单个节点编辑详情</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1.5">
            {selectedNodeIds.slice(0, 12).map((id) => {
              const node = nodes.find((n) => n.id === id);
              if (!node) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedNode(id)}
                  className="block w-full truncate rounded-lg border border-white/8 px-2.5 py-1.5 text-left text-slate-300 hover:bg-white/5 hover:text-white"
                >
                  {node.label}
                </button>
              );
            })}
            {multiCount > 12 && (
              <p className="text-xs text-slate-600">还有 {multiCount - 12} 个节点…</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const meta = NODE_TYPE_META[selectedNode.type];
  const supportsStatus = selectedNode.type === 'goal' || selectedNode.type === 'task';
  const nodeStatus = selectedNode.status ?? 'active';
  const visibleNodeEdges = edges.filter(
    (edge) =>
      (edge.source_kind ?? 'node') === 'node' &&
      (edge.target_kind ?? 'node') === 'node',
  );
  const incoming = visibleNodeEdges.filter((e) => e.target === selectedNode.id);
  const outgoing = visibleNodeEdges.filter((e) => e.source === selectedNode.id);
  const otherNodes = nodes.filter((n) => n.id !== selectedNode.id);

  const handleDelete = () => {
    removeNode(selectedNode.id);
    loadFocus();
  };

  const handleCopyNodeName = async () => {
    await navigator.clipboard.writeText(selectedNode.label);
    setCopyNotice('已复制');
    window.setTimeout(() => setCopyNotice(''), 1200);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-slate-950/60">
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs uppercase tracking-widest text-slate-500">节点参数</div>
          <div className="flex items-center gap-2">
            {copyNotice && <span className="text-[11px] text-emerald-300">{copyNotice}</span>}
            <button
              type="button"
              onClick={handleCopyNodeName}
              className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5 hover:text-slate-200"
              title="复制当前节点名"
              aria-label="复制当前节点名"
            >
              复制
            </button>
          </div>
        </div>
        <NodeFieldInput
          nodeId={selectedNode.id}
          savedValue={selectedNode.label}
          field="label"
          onSave={(value) => debouncedUpdate(selectedNode.id, { label: value })}
          className="mt-2 w-full rounded-lg border border-transparent bg-transparent px-0 text-lg font-semibold text-white outline-none focus:border-white/10 focus:bg-white/5 focus:px-2"
        />
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-white/8 px-2 py-0.5 text-slate-300">{meta.label}</span>
          <span className="text-slate-500">{meta.psychology}</span>
        </div>
        {selectedNode.type === 'project' && (
          <button
            type="button"
            onClick={() => enterSubnet(selectedNode.id)}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300"
          >
            进入子图 →
          </button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <section>
          <div className="mb-2 text-xs text-slate-500">思维分类</div>
          <div className="grid grid-cols-2 gap-1.5">
            {NODE_TYPES.map((type) => {
              const m = NODE_TYPE_META[type];
              const active = selectedNode.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() =>
                    updateNode(selectedNode.id, {
                      type,
                      layer: type === 'experience' ? 'episodic' : 'semantic',
                      status: type === 'goal' || type === 'task' ? 'active' : undefined,
                    })
                  }
                  className={`rounded-lg border px-2 py-1.5 text-left text-xs ${
                    active
                      ? 'border-blue-400/40 bg-blue-500/10 text-blue-200'
                      : 'border-white/8 text-slate-400 hover:bg-white/5'
                  }`}
                >
                  <div className="font-medium">{m.label}</div>
                </button>
              );
            })}
          </div>
        </section>

        {supportsStatus && (
          <section>
            <div className="mb-2 text-xs text-slate-500">状态</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { value: 'active', label: '进行中' },
                { value: 'done', label: '已完成' },
              ].map((option) => {
                const active = nodeStatus === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      updateNode(selectedNode.id, {
                        status: option.value as 'active' | 'done',
                      })
                    }
                    className={`rounded-lg border px-2 py-1.5 text-left text-xs ${
                      active
                        ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-200'
                        : 'border-white/8 text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <div className="mb-2 text-xs text-slate-500">内容</div>
          <NodeFieldTextarea
            nodeId={selectedNode.id}
            savedValue={selectedNode.content ?? ''}
            field="content"
            onSave={(value) => debouncedUpdate(selectedNode.id, { content: value || undefined })}
            rows={4}
            placeholder="节点说明、上下文..."
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-blue-400/40"
          />
        </section>

        <WireSection
          title="输入连接 ↑"
          edges={incoming}
          nodes={nodes}
          groups={groups}
          isOutgoing={false}
          onJump={setSelectedNode}
          onRemove={removeEdge}
          onTypeChange={(id, type) => updateEdge(id, { type })}
        />
        <WireSection
          title="输出连接 ↓"
          edges={outgoing}
          nodes={nodes}
          groups={groups}
          isOutgoing
          onJump={setSelectedNode}
          onRemove={removeEdge}
          onTypeChange={(id, type) => updateEdge(id, { type })}
        />

        <section>
          <div className="mb-2 text-xs text-slate-500">新建输出连接</div>
          <ConnectRow
            nodes={otherNodes}
            onConnect={(targetId) =>
              addEdge({ source: selectedNode.id, target: targetId, type: 'relates_to' })
            }
          />
          <p className="mt-1.5 text-[10px] text-slate-600">
            或贴近节点边缘拖线到另一节点（先拖出为输出）
          </p>
        </section>
      </div>

      <div className="border-t border-white/10 p-4">
        <button
          type="button"
          onClick={handleDelete}
          className="w-full rounded-lg border border-red-500/20 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10"
        >
          删除节点
        </button>
      </div>
    </div>
  );
}

function NodeFieldInput({
  nodeId,
  savedValue,
  field,
  onSave,
  className,
}: {
  nodeId: string;
  savedValue: string;
  field: string;
  onSave: (value: string) => void;
  className?: string;
}) {
  const [draft, setDraft] = useState(savedValue);

  useEffect(() => {
    setDraft(savedValue);
  }, [nodeId]);

  useEffect(() => {
    const active = document.activeElement;
    if (active?.getAttribute('data-node-field') === field) return;
    setDraft(savedValue);
  }, [savedValue, field]);

  return (
    <input
      data-node-field={field}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onSave(e.target.value);
      }}
      className={className}
    />
  );
}

function NodeFieldTextarea({
  nodeId,
  savedValue,
  field,
  onSave,
  rows,
  placeholder,
  className,
}: {
  nodeId: string;
  savedValue: string;
  field: string;
  onSave: (value: string) => void;
  rows: number;
  placeholder?: string;
  className?: string;
}) {
  const [draft, setDraft] = useState(savedValue);

  useEffect(() => {
    setDraft(savedValue);
  }, [nodeId]);

  useEffect(() => {
    const active = document.activeElement;
    if (active?.getAttribute('data-node-field') === field) return;
    setDraft(savedValue);
  }, [savedValue, field]);

  return (
    <textarea
      data-node-field={field}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        onSave(e.target.value);
      }}
      rows={rows}
      placeholder={placeholder}
      className={className}
    />
  );
}

function WireSection({
  title,
  edges,
  nodes,
  groups,
  isOutgoing,
  onJump,
  onRemove,
  onTypeChange,
}: {
  title: string;
  edges: {
    id: string;
    source: string;
    target: string;
    type: EdgeType;
    hidden?: boolean;
    derived_from_group_id?: string;
    derived_from_edge_id?: string;
  }[];
  nodes: { id: string; label: string }[];
  groups: { id: string; name: string }[];
  isOutgoing: boolean;
  onJump: (id: string) => void;
  onRemove: (id: string) => void;
  onTypeChange: (id: string, type: EdgeType) => void;
}) {
  if (edges.length === 0) return null;
  return (
    <section>
      <div className="mb-2 text-xs text-slate-500">
        {title} ({edges.length})
      </div>
      <div className="space-y-2">
        {edges.map((edge) => {
          const peerId = isOutgoing ? edge.target : edge.source;
          const peer = nodes.find((n) => n.id === peerId);
          const derivedGroup = edge.derived_from_group_id
            ? groups.find((group) => group.id === edge.derived_from_group_id)
            : undefined;
          return (
            <div
              key={edge.id}
              className="rounded-lg border border-white/8 bg-white/3 p-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onJump(peerId)}
                  className="font-medium text-slate-200 hover:text-white"
                >
                  {peer?.label ?? peerId}
                </button>
                {derivedGroup && (
                  <span className="shrink-0 rounded border border-cyan-400/20 bg-cyan-400/10 px-1.5 py-0.5 text-[10px] text-cyan-200">
                    来自 {derivedGroup.name}
                  </span>
                )}
              </div>
              {derivedGroup && edge.hidden && (
                <div className="mt-1 text-[10px] text-slate-500">节点仍在 Box 内，画布连线已隐藏</div>
              )}
              <div className="mt-1.5 flex gap-2">
                <select
                  value={edge.type}
                  onChange={(e) => onTypeChange(edge.id, e.target.value as EdgeType)}
                  disabled={Boolean(derivedGroup)}
                  className="min-w-0 flex-1 rounded border border-white/10 bg-slate-900 px-1.5 py-1 text-slate-300"
                >
                  {EDGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {EDGE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onRemove(edge.id)}
                  disabled={Boolean(derivedGroup && edge.hidden)}
                  className="shrink-0 rounded border border-red-500/20 px-2 py-1 text-red-300 hover:bg-red-500/10"
                >
                  断开
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ConnectRow({
  nodes,
  onConnect,
}: {
  nodes: { id: string; label: string }[];
  onConnect: (targetId: string) => void;
}) {
  const [targetId, setTargetId] = useState('');
  return (
    <div className="flex gap-2">
      <select
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white outline-none"
      >
        <option value="">选择目标节点…</option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>
            {n.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!targetId}
        onClick={() => {
          onConnect(targetId);
          setTargetId('');
        }}
        className="shrink-0 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40"
      >
        连接
      </button>
    </div>
  );
}
