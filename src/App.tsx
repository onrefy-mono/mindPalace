import { useEffect, useState } from 'react';
import { FocusPanel } from './components/FocusPanel/FocusPanel';
import { FocusDetailPanel } from './components/FocusPanel/FocusDetailPanel';
import { MindGraph } from './components/GraphCanvas/MindGraph';
import { GraphDetailPanel } from './components/GraphCanvas/GraphDetailPanel';
import { SelectionToolbar } from './components/GraphCanvas/SelectionToolbar';
import { CreateNodeModal } from './components/GraphCanvas/CreateNodeModal';
import { GraphBreadcrumb } from './components/GraphCanvas/GraphBreadcrumb';
import { GraphCommandPalette } from './components/GraphCanvas/GraphCommandPalette';
import { BoxViewPage } from './components/GraphCanvas/BoxViewPage';
import { AiBackgroundJobs } from './components/AI/AiBackgroundJobs';
import { HeaderBar, QuickCapture } from './components/QuickCapture/QuickCapture';
import { DocsPanel } from './components/Docs/DocsPanel';
import { SettingsModal } from './components/Settings/SettingsModal';
import { useFocusStore } from './stores/focusStore';
import { useGraphStore } from './stores/graphStore';
import { flushStorage, getStorageAccess, getStoragePath, initStorage } from './lib/storage';
import { redo, undo } from './lib/history';
import { perfMark, perfMeasure } from './lib/perf';
import type { CreateNodeContext } from './types';

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

interface BoxViewRoute {
  groupId: string;
  viewId: string;
}

function readBoxViewRoute(): BoxViewRoute | null {
  const hash = window.location.hash.replace(/^#\/?/, '');
  const [page, groupId, viewId] = hash.split('/');
  if (page !== 'box-view' || !groupId || !viewId) return null;
  return {
    groupId: decodeURIComponent(groupId),
    viewId: decodeURIComponent(viewId),
  };
}

function App() {
  const loadFocus = useFocusStore((s) => s.load);
  const loadGraph = useGraphStore((s) => s.load);
  const setSelectedNode = useGraphStore((s) => s.setSelectedNode);
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId);
  const selectedEdgeId = useGraphStore((s) => s.selectedEdgeId);
  const removeNode = useGraphStore((s) => s.removeNode);
  const removeEdge = useGraphStore((s) => s.removeEdge);
  const activeFocusId = useFocusStore((s) => s.activeId);
  const focusItems = useFocusStore((s) => s.items);
  const loadFocusItems = useFocusStore((s) => s.load);

  const [captureOpen, setCaptureOpen] = useState(false);
  const [createNodeOpen, setCreateNodeOpen] = useState(false);
  const [createNodeContext, setCreateNodeContext] = useState<CreateNodeContext | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [boxViewRoute, setBoxViewRoute] = useState<BoxViewRoute | null>(() => readBoxViewRoute());

  const openCreateNode = (context?: CreateNodeContext) => {
    if (readOnly) return;
    setCreateNodeContext(context ?? null);
    setCreateNodeOpen(true);
  };

  const closeCreateNode = () => {
    setCreateNodeOpen(false);
    setCreateNodeContext(null);
  };

  useEffect(() => {
    let cancelled = false;

    perfMark('app:init:start');
    initStorage()
      .then(async () => {
        if (cancelled) return;
        loadFocus();
        loadGraph();
        const access = await getStorageAccess();
        const path = await getStoragePath();
        if (!cancelled) {
          setReadOnly(access.readOnly);
          setStoragePath(path);
          setReady(true);
          perfMark('app:ready', { readOnly: access.readOnly });
          perfMeasure('app:init', 'app:init:start', 'app:ready');
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setBootError(error instanceof Error ? error.message : '无法加载本地数据');
      });

    return () => {
      cancelled = true;
    };
  }, [loadFocus, loadGraph]);

  useEffect(() => {
    const onBeforeUnload = () => {
      void flushStorage();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  useEffect(() => {
    const onHashChange = () => setBoxViewRoute(readBoxViewRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (readOnly) return;
        setCaptureOpen(true);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        if (readOnly) return;
        const pointer = useGraphStore.getState().createPointer;
        openCreateNode(pointer ? { x: pointer.x, y: pointer.y } : undefined);
        return;
      }

      if (e.key.toLowerCase() === 'p' && e.shiftKey) {
        e.preventDefault();
        if (readOnly) return;
        useGraphStore.getState().createGroup();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (readOnly) return;
        if (undo()) {
          loadFocusItems();
          loadGraph();
        }
        return;
      }

      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))
      ) {
        e.preventDefault();
        if (readOnly) return;
        if (redo()) {
          loadFocusItems();
          loadGraph();
        }
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (readOnly) return;
        if (selectedEdgeId) {
          e.preventDefault();
          removeEdge(selectedEdgeId);
          return;
        }
        if (selectedNodeId && e.key === 'Delete') {
          e.preventDefault();
          removeNode(selectedNodeId);
          loadFocusItems();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEdgeId, selectedNodeId, removeEdge, removeNode, loadFocusItems, loadGraph, readOnly]);

  useEffect(() => {
    const focus = focusItems.find((f) => f.id === activeFocusId);
    if (focus?.linked_node_ids[0]) {
      setSelectedNode(focus.linked_node_ids[0]);
    }
  }, [activeFocusId, focusItems, setSelectedNode]);

  if (bootError) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-200">
        <h1 className="text-xl font-semibold text-white">无法连接本地存储</h1>
        <p className="mt-3 max-w-lg text-sm text-slate-400">{bootError}</p>
        <p className="mt-2 max-w-lg text-xs text-slate-500">
          请通过 <code className="text-slate-300">npm run dev</code> 启动开发服务，数据将保存在用户目录下的
          <code className="text-slate-300"> .mindpalace/data.json</code>。
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-300">
        正在加载本地数据…
      </div>
    );
  }

  if (boxViewRoute) {
    return <BoxViewPage groupId={boxViewRoute.groupId} viewId={boxViewRoute.viewId} />;
  }

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <HeaderBar
        onCapture={() => {
          if (!readOnly) setCaptureOpen(true);
        }}
        onOpenDocs={() => setDocsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        storagePath={storagePath}
        readOnly={readOnly}
      />
      <div className="flex min-h-0 flex-1">
        <FocusPanel />
        <FocusDetailPanel />
        <main className="relative flex min-w-0 flex-1 flex-col">
          <GraphBreadcrumb />
          <div className="relative min-h-0 flex-1">
            <MindGraph onOpenCreateNode={openCreateNode} />
            <SelectionToolbar />
          </div>
        </main>
        <GraphDetailPanel />
      </div>
      <QuickCapture open={!readOnly && captureOpen} onClose={() => setCaptureOpen(false)} />
      <CreateNodeModal
        open={!readOnly && createNodeOpen}
        onClose={closeCreateNode}
        context={createNodeContext}
      />
      <GraphCommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <DocsPanel open={docsOpen} onClose={() => setDocsOpen(false)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <AiBackgroundJobs />
    </div>
  );
}

export default App;
