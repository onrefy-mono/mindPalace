import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { NODE_TYPE_META } from '../../types';

interface GraphCommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function GraphCommandPalette({ open, onClose }: GraphCommandPaletteProps) {
  const nodes = useGraphStore((s) => s.nodes);
  const viewParentId = useGraphStore((s) => s.viewParentId);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const navigateToGraph = useGraphStore((s) => s.navigateToGraph);

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const jumpOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return nodes.filter((n) => !q || n.label.toLowerCase().includes(q)).slice(0, 20);
  }, [nodes, query]);

  const optionCount = jumpOptions.length;

  const handlePick = useCallback(
    (index: number) => {
      const node = jumpOptions[index];
      if (!node) return;
      if ((node.parent_id ?? null) !== viewParentId) {
        navigateToGraph(node.parent_id ?? null);
      }
      setSelectedNode(node.id);
      onClose();
    },
    [jumpOptions, onClose, navigateToGraph, setSelectedNode, viewParentId],
  );

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (optionCount ? (i + 1) % optionCount : 0));
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (optionCount ? (i - 1 + optionCount) % optionCount : 0));
      }
      if (e.key === 'Enter' && optionCount > 0) {
        e.preventDefault();
        handlePick(activeIndex);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, optionCount, activeIndex, handlePick, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-8 pt-[18vh] backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="border-b border-white/10 px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest text-slate-500">Ctrl+F · 跳转节点</div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索节点名称…"
            className="mt-2 w-full bg-transparent text-lg text-white outline-none placeholder:text-slate-600"
          />
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {jumpOptions.map((node, index) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => handlePick(index)}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left ${
                  index === activeIndex ? 'bg-blue-500/15 text-white' : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <span>{node.label}</span>
                <span className="text-xs text-slate-500">{NODE_TYPE_META[node.type].label}</span>
              </button>
            </li>
          ))}
          {jumpOptions.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-slate-500">无匹配结果</li>
          )}
        </ul>
      </div>
    </div>
  );
}
