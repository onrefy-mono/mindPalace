import { create } from 'zustand';
import { getAiAction, type AiActionId } from '../lib/ai/actions';
import { generateChatText } from '../lib/ai/client';
import { readAiConfig } from '../lib/ai/config';
import type { AiSelectionContext } from '../lib/ai/selectionContext';

export type AiJobStatus = 'running' | 'done' | 'error';

export interface AiJob {
  id: string;
  actionId: AiActionId;
  actionLabel: string;
  outputLabel: string;
  status: AiJobStatus;
  selectionLabel: string;
  createdAt: number;
  finishedAt?: number;
  result?: string;
  error?: string;
}

interface AiJobState {
  jobs: AiJob[];
  activeJobId: string | null;
  panelOpen: boolean;
  panelMinimized: boolean;
  startJob: (actionId: AiActionId, context: AiSelectionContext) => string;
  setActiveJob: (id: string | null) => void;
  openPanel: () => void;
  minimizePanel: () => void;
  closePanel: () => void;
  removeJob: (id: string) => void;
}

function scheduleBackgroundWork(task: () => void) {
  const idle = globalThis.requestIdleCallback as
    | undefined
    | ((callback: () => void, options?: { timeout: number }) => number);
  if (idle) {
    idle(task, { timeout: 500 });
    return;
  }
  globalThis.setTimeout(task, 0);
}

function createSelectionLabel(context: AiSelectionContext) {
  const nodeCount = context.graphScope.selectedNodeCount;
  const groupCount = context.graphScope.selectedGroupCount;
  return `已选 ${nodeCount} 个节点${groupCount > 0 ? ` · ${groupCount} 个 Box` : ''}`;
}

export const useAiJobStore = create<AiJobState>((set) => ({
  jobs: [],
  activeJobId: null,
  panelOpen: false,
  panelMinimized: false,
  startJob: (actionId, context) => {
    const action = getAiAction(actionId);
    const id = `ai-job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const job: AiJob = {
      id,
      actionId,
      actionLabel: action.label,
      outputLabel: action.outputLabel,
      status: 'running',
      selectionLabel: createSelectionLabel(context),
      createdAt: Date.now(),
    };

    set((state) => ({
      jobs: [job, ...state.jobs],
      activeJobId: id,
      panelOpen: true,
      panelMinimized: false,
    }));

    scheduleBackgroundWork(() => {
      void (async () => {
        try {
          const config = readAiConfig();
          const text = await generateChatText(config, action.buildMessages(context));
          set((state) => ({
            jobs: state.jobs.map((item) =>
              item.id === id
                ? { ...item, status: 'done', result: text, finishedAt: Date.now() }
                : item,
            ),
            activeJobId: id,
            panelOpen: true,
          }));
        } catch (caught) {
          set((state) => ({
            jobs: state.jobs.map((item) =>
              item.id === id
                ? {
                    ...item,
                    status: 'error',
                    error: caught instanceof Error ? caught.message : `${action.label}失败`,
                    finishedAt: Date.now(),
                  }
                : item,
            ),
            activeJobId: id,
            panelOpen: true,
          }));
        }
      })();
    });

    return id;
  },
  setActiveJob: (id) => set({ activeJobId: id }),
  openPanel: () => set({ panelOpen: true, panelMinimized: false }),
  minimizePanel: () => set({ panelOpen: true, panelMinimized: true }),
  closePanel: () => set({ panelOpen: false, panelMinimized: false }),
  removeJob: (id) =>
    set((state) => ({
      jobs: state.jobs.filter((job) => job.id !== id),
      activeJobId: state.activeJobId === id ? null : state.activeJobId,
    })),
}));
