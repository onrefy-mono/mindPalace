import { clearHistory } from './history';
import type { MindPalaceData } from '../types';
import { perfMark, perfMeasure, perfTime } from './perf';

const API_BASE = '/api';
const SAVE_DEBOUNCE_MS = 300;

let cache: MindPalaceData | null = null;
let saveQueue: Promise<void> = Promise.resolve();
let lastSaveError: Error | null = null;
let canWrite = true;
let pendingSaveData: MindPalaceData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export interface StorageAccess {
  canWrite: boolean;
  readOnly: boolean;
}

async function fetchAccess(): Promise<StorageAccess> {
  perfMark('storage:access:start');
  const res = await fetch(`${API_BASE}/access`);
  if (!res.ok) return { canWrite: false, readOnly: true };
  const body = (await res.json()) as Partial<StorageAccess>;
  const access = {
    canWrite: body.canWrite === true,
    readOnly: body.readOnly === true || body.canWrite !== true,
  };
  perfMark('storage:access:end', access);
  perfMeasure('storage:access', 'storage:access:start', 'storage:access:end', access);
  return access;
}

export function canWriteData(): boolean {
  return canWrite;
}

export function isReadOnlyAccess(): boolean {
  return !canWrite;
}

export function assertWritable(): void {
  if (!canWrite) {
    throw new Error('当前为只读访问，请从本机 http://127.0.0.1:4173 打开后编辑');
  }
}

async function fetchData(): Promise<MindPalaceData> {
  perfMark('storage:fetch:start');
  const res = await fetch(`${API_BASE}/data`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `加载数据失败 (${res.status})`);
  }
  const data = (await res.json()) as MindPalaceData;
  perfMark('storage:fetch:end', {
    nodes: data.nodes.length,
    edges: data.edges.length,
    groups: data.groups?.length ?? 0,
    focus: data.focus.length,
  });
  perfMeasure('storage:fetch', 'storage:fetch:start', 'storage:fetch:end');
  return data;
}

async function persistData(data: MindPalaceData): Promise<void> {
  perfMark('storage:save:start');
  const res = await fetch(`${API_BASE}/data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: perfTime('storage:stringify', () => JSON.stringify(data, null, 2), {
      nodes: data.nodes.length,
      edges: data.edges.length,
      groups: data.groups?.length ?? 0,
    }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `保存数据失败 (${res.status})`);
  }
  perfMark('storage:save:end');
  perfMeasure('storage:save', 'storage:save:start', 'storage:save:end');
}

function enqueuePersist(data: MindPalaceData): void {
  saveQueue = saveQueue
    .then(() => persistData(data))
    .then(() => {
      lastSaveError = null;
    })
    .catch((error: unknown) => {
      lastSaveError = error instanceof Error ? error : new Error(String(error));
      console.error('[mind-palace] save failed:', lastSaveError);
    });
}

function schedulePendingSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const data = pendingSaveData;
    pendingSaveData = null;
    if (data) enqueuePersist(data);
  }, SAVE_DEBOUNCE_MS);
}

function flushPendingSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  const data = pendingSaveData;
  pendingSaveData = null;
  if (data) enqueuePersist(data);
}

export async function initStorage(): Promise<MindPalaceData> {
  perfMark('storage:init:start');
  const access = await fetchAccess();
  canWrite = access.canWrite;
  cache = await fetchData();
  clearHistory();
  perfMark('storage:init:end');
  perfMeasure('storage:init', 'storage:init:start', 'storage:init:end');
  return cache;
}

export function isStorageReady(): boolean {
  return cache !== null;
}

export function loadData(): MindPalaceData {
  if (!cache) {
    throw new Error('存储尚未初始化，请先调用 initStorage()');
  }
  return cache;
}

export function saveData(data: MindPalaceData): void {
  assertWritable();
  cache = data;
  pendingSaveData = data;
  schedulePendingSave();
}

export async function flushStorage(): Promise<void> {
  flushPendingSave();
  await saveQueue;
  if (lastSaveError) {
    throw lastSaveError;
  }
}

export function exportData(data: MindPalaceData): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `mind-palace-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function resetData(): Promise<MindPalaceData> {
  assertWritable();
  const res = await fetch(`${API_BASE}/data/reset`, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `重置数据失败 (${res.status})`);
  }
  cache = (await res.json()) as MindPalaceData;
  clearHistory();
  return cache;
}

export async function getStoragePath(): Promise<string> {
  const res = await fetch(`${API_BASE}/storage/info`);
  if (!res.ok) return '';
  const body = (await res.json()) as { path?: string };
  return body.path ?? '';
}

export async function getStorageAccess(): Promise<StorageAccess> {
  const access = await fetchAccess();
  canWrite = access.canWrite;
  return access;
}
