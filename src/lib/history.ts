import type { MindPalaceData } from '../types';
import { loadData, saveData } from './storage';
import { perfTime } from './perf';

const MAX_HISTORY = 50;

let undoStack: MindPalaceData[] = [];
let redoStack: MindPalaceData[] = [];

function cloneData(data: MindPalaceData): MindPalaceData {
  return structuredClone(data);
}

export function captureHistorySnapshot(): void {
  perfTime('history:capture-snapshot', () => {
    undoStack.push(cloneData(loadData()));
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
  }, {
    undoDepth: undoStack.length,
  });
}

export function canUndo(): boolean {
  return undoStack.length > 0;
}

export function canRedo(): boolean {
  return redoStack.length > 0;
}

export function undo(): boolean {
  if (!canUndo()) return false;
  redoStack.push(cloneData(loadData()));
  const previous = undoStack.pop();
  if (!previous) return false;
  saveData(previous);
  return true;
}

export function redo(): boolean {
  if (!canRedo()) return false;
  undoStack.push(cloneData(loadData()));
  const next = redoStack.pop();
  if (!next) return false;
  saveData(next);
  return true;
}

export function clearHistory(): void {
  undoStack = [];
  redoStack = [];
}
