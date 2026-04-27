export type JSValue =
  | { type: 'undefined'; value: undefined }
  | { type: 'null'; value: null }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'function'; name: string; params: string[]; closureId: string | null }
  | { type: 'array'; items: JSValue[] }
  | { type: 'object'; entries: [string, JSValue][] }
  | { type: 'promise'; status: 'pending' | 'resolved' | 'rejected'; value?: JSValue };

export interface MemoryEntry {
  name: string;
  value: JSValue;
  isNew: boolean;
  isChanged: boolean;
}

export interface ExecutionContext {
  id: string;
  name: string;
  type: 'global' | 'function';
  memory: MemoryEntry[];
  closureScope: ClosureEntry[] | null;
  parentId: string | null;
}

export interface ClosureEntry {
  name: string;
  value: JSValue;
  fromContext: string;
}

export interface CallStackFrame {
  id: string;
  label: string;
}

export interface EventQueueItem {
  id: string;
  label: string;
  type: 'callback' | 'microtask';
}

export interface Snapshot {
  step: number;
  line: number;
  description: string;
  executionContexts: ExecutionContext[];
  callStack: CallStackFrame[];
  callbackQueue: EventQueueItem[];
  microtaskQueue: EventQueueItem[];
  returnValue?: JSValue;
  highlightContextId?: string;
  phase: 'execution' | 'event-loop-check' | 'dequeue-callback' | 'dequeue-microtask';
}

export function formatValue(val: JSValue): string {
  switch (val.type) {
    case 'undefined': return 'undefined';
    case 'null': return 'null';
    case 'number': return String(val.value);
    case 'string': return `"${val.value}"`;
    case 'boolean': return String(val.value);
    case 'function': return `fn: ${val.name || 'anonymous'}`;
    case 'array': return `[${val.items.map(formatValue).join(', ')}]`;
    case 'object': return `{${val.entries.map(([k, v]) => `${k}: ${formatValue(v)}`).join(', ')}}`;
    case 'promise': return `Promise {<${val.status}>}`;
  }
}
