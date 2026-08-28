interface PerfEntry {
  name: string;
  startTime: number;
  duration?: number;
  detail?: unknown;
}

interface MindPalacePerf {
  enabled: boolean;
  marks: PerfEntry[];
  measures: PerfEntry[];
  counters: Record<string, number>;
  events: PerfEntry[];
  longTasks: PerfEntry[];
}

declare global {
  interface Window {
    __mindPalacePerf?: MindPalacePerf;
  }
}

function isPerfEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.get('perf') === '1' || window.localStorage.getItem('mind-palace-perf') === '1';
}

function ensurePerf(): MindPalacePerf | null {
  if (typeof window === 'undefined' || !isPerfEnabled()) return null;
  if (!window.__mindPalacePerf) {
    window.__mindPalacePerf = {
      enabled: true,
      marks: [],
      measures: [],
      counters: {},
      events: [],
      longTasks: [],
    };

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__mindPalacePerf?.longTasks.push({
            name: entry.name,
            startTime: entry.startTime,
            duration: entry.duration,
          });
        }
      });
      observer.observe({ entryTypes: ['longtask'] });
    } catch {
      // Long Task API is not available in every browser context.
    }
  }
  return window.__mindPalacePerf;
}

export function perfMark(name: string, detail?: unknown): void {
  const perf = ensurePerf();
  if (!perf) return;
  const entry = { name, startTime: performance.now(), detail };
  perf.marks.push(entry);
  performance.mark(name);
}

export function perfMeasure(name: string, startMark: string, endMark?: string, detail?: unknown): void {
  const perf = ensurePerf();
  if (!perf) return;
  try {
    if (endMark) {
      performance.measure(name, startMark, endMark);
    } else {
      performance.measure(name, startMark);
    }
    const entry = performance.getEntriesByName(name).at(-1);
    perf.measures.push({
      name,
      startTime: entry?.startTime ?? performance.now(),
      duration: entry?.duration,
      detail,
    });
  } catch {
    perf.events.push({ name: `${name}:measure-failed`, startTime: performance.now(), detail });
  }
}

export function perfEvent(name: string, detail?: unknown): void {
  const perf = ensurePerf();
  if (!perf) return;
  perf.events.push({ name, startTime: performance.now(), detail });
}

export function perfCount(name: string, amount = 1): void {
  const perf = ensurePerf();
  if (!perf) return;
  perf.counters[name] = (perf.counters[name] ?? 0) + amount;
}

export function perfTime<T>(name: string, fn: () => T, detail?: unknown): T {
  const perf = ensurePerf();
  if (!perf) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    perf.measures.push({
      name,
      startTime: start,
      duration: performance.now() - start,
      detail,
    });
  }
}
