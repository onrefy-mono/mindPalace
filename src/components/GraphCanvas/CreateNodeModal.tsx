import { useEffect, useState } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { typeIcon } from '../../lib/d3Graph';
import { getDefaultNewNodeConnection } from '../../lib/nodeConnection';
import {
  EDGE_TYPE_COLORS,
  EDGE_TYPE_LABELS,
  EDGE_TYPES,
  NODE_TYPE_META,
  NODE_TYPES,
  type CreateNodeContext,
  type EdgeType,
  type NodeType,
} from '../../types';

interface CreateNodeModalProps {
  open: boolean;
  onClose: () => void;
  context?: CreateNodeContext | null;
}

export function CreateNodeModal({ open, onClose, context }: CreateNodeModalProps) {
  const addNode = useGraphStore((s) => s.addNode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const nodes = useGraphStore((s) => s.nodes);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<NodeType>('concept');
  const [content, setContent] = useState('');
  const [connectToCurrent, setConnectToCurrent] = useState(true);
  const [connectEdgeType, setConnectEdgeType] = useState<EdgeType>('relates_to');
  const connectToId = context?.connectToId ?? selectedNodeId;
  const connectToNode = nodes.find((node) => node.id === connectToId);
  const defaultConnection = getDefaultNewNodeConnection(connectToNode);
  const connectionSourceLabel = connectEdgeType === 'part_of' ? '新节点' : connectToNode?.label;
  const connectionTargetLabel = connectEdgeType === 'part_of' ? connectToNode?.label : '新节点';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setLabel('');
      setType('concept');
      setContent('');
      setConnectToCurrent(!!connectToId);
      setConnectEdgeType(context?.connectEdgeType ?? getDefaultNewNodeConnection(connectToNode).edgeType);
    }
  }, [connectToId, connectToNode, context?.connectEdgeType, open]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    addNode({
      label: label.trim(),
      type,
      content: content.trim() || undefined,
      connectToId: connectToCurrent ? connectToId : null,
      connectEdgeType: connectToCurrent ? connectEdgeType : undefined,
      x: context?.x,
      y: context?.y,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8 pt-24 backdrop-blur-sm">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
      >
        <div className="mb-4">
          <div className="text-xs uppercase tracking-widest text-slate-500">创建节点</div>
          <h3 className="text-xl font-semibold text-white">加入思维网络</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs text-slate-400">节点名称</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例如：渲染管线优化"
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-blue-400/50"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-slate-400">思维分类</label>
            <div className="grid grid-cols-2 gap-2">
              {NODE_TYPES.map((t) => {
                const meta = NODE_TYPE_META[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                      active
                        ? 'border-blue-400/40 bg-blue-500/10'
                        : 'border-white/8 hover:border-white/15 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/8 text-base text-slate-100">
                      {typeIcon(t)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-white">{meta.label}</span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {meta.psychology}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-slate-400">说明（可选）</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="上下文、来源、想法..."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            />
          </div>

          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={connectToCurrent}
                disabled={!connectToId}
                onChange={(e) => setConnectToCurrent(e.target.checked)}
                className="rounded"
              />
              {context?.connectToId ? '连接到拖出节点' : '连接到当前选中节点'}
              {connectToNode && (
                <span className="max-w-[12rem] truncate text-xs text-slate-500">
                  {connectToNode.label}
                </span>
              )}
              {!connectToId && (
                <span className="text-xs text-slate-500">（需先选中一个节点）</span>
              )}
            </label>

            {connectToId && connectToCurrent && (
              <div className="mt-3 space-y-2 border-t border-white/8 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-400">连线类型</div>
                  <div className="text-[10px] text-slate-600">
                    默认：{EDGE_TYPE_LABELS[defaultConnection.edgeType]}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {EDGE_TYPES.map((edgeType) => {
                    const active = connectEdgeType === edgeType;
                    return (
                      <button
                        key={edgeType}
                        type="button"
                        onClick={() => setConnectEdgeType(edgeType)}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
                          active
                            ? 'border-blue-400/40 bg-blue-500/10 text-blue-100'
                            : 'border-white/8 text-slate-400 hover:bg-white/5 hover:text-slate-200'
                        }`}
                      >
                        <span
                          className="h-0.5 w-5 shrink-0 rounded-full"
                          style={{ backgroundColor: EDGE_TYPE_COLORS[edgeType] }}
                        />
                        <span>{EDGE_TYPE_LABELS[edgeType]}</span>
                      </button>
                    );
                  })}
                </div>
                {connectionSourceLabel && connectionTargetLabel && (
                  <div className="truncate rounded-lg border border-white/8 bg-black/15 px-2.5 py-1.5 text-[11px] text-slate-500">
                    <span className="text-slate-300">{connectionSourceLabel}</span>
                    <span className="mx-1.5 text-slate-600">→</span>
                    <span className="text-slate-300">{connectionTargetLabel}</span>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            创建
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5"
          >
            取消
          </button>
        </div>
      </form>
    </div>
  );
}
