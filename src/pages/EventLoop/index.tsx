import { useState, useMemo, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { parse } from 'acorn';
import { motion, AnimatePresence } from 'framer-motion';
import { CodeEditor } from '../../components/CodeEditor';
import styles from './EventLoop.module.css';

// ── Types ───────────────────────────────────────────────────

interface QueueItem {
  id: string;
  label: string;
}

interface WebAPIItem extends QueueItem {
  type: 'timer' | 'fetch';
  remaining?: number;
}

interface Snapshot {
  callStack: QueueItem[];
  webAPIs: WebAPIItem[];
  microtaskQueue: QueueItem[];
  callbackQueue: QueueItem[];
  consoleOutput: string[];
  description: string;
  phase: 'sync' | 'webapi' | 'microtask-drain' | 'callback-dequeue' | 'complete';
}

interface PendingCallback {
  label: string;
  stmts: unknown[];
  params: string[];
  nextInChain?: PendingCallback;
  resolvedValue?: string;
}

// ── Examples ────────────────────────────────────────────────

const EXAMPLES = [
  {
    name: 'setTimeout Basics',
    code: `console.log("Start");

setTimeout(function timer() {
  console.log("Timer");
}, 0);

console.log("End");`,
  },
  {
    name: 'Promise vs setTimeout',
    code: `console.log("Start");

setTimeout(function timeout() {
  console.log("Timeout");
}, 0);

Promise.resolve().then(function microTask() {
  console.log("Promise");
});

console.log("End");`,
  },
  {
    name: 'Nested Callbacks',
    code: `console.log("First");

setTimeout(function outer() {
  console.log("Outer timer");
  setTimeout(function inner() {
    console.log("Inner timer");
  }, 0);
}, 0);

setTimeout(function second() {
  console.log("Second timer");
}, 0);

console.log("Last");`,
  },
  {
    name: 'Promise Chaining',
    code: `console.log("Start");

Promise.resolve("A")
  .then(function step1(val) {
    console.log(val);
    return "B";
  })
  .then(function step2(val) {
    console.log(val);
    return "C";
  })
  .then(function step3(val) {
    console.log(val);
  });

console.log("End");`,
  },
];

// ── Simulator ───────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function simulateEventLoop(code: string): Snapshot[] {
  let _uid = 0;
  const id = () => `el_${_uid++}`;

  const ast = parse(code, { ecmaVersion: 2020, locations: true, sourceType: 'script' });

  const snapshots: Snapshot[] = [];
  const callStack: QueueItem[] = [];
  const webAPIs: WebAPIItem[] = [];
  const microtaskQueueItems: QueueItem[] = [];
  const callbackQueueItems: QueueItem[] = [];
  const consoleOutput: string[] = [];

  const timerCallbacks = new Map<string, PendingCallback>();
  const microtaskCallbacks = new Map<string, PendingCallback>();
  const cbCallbacks = new Map<string, PendingCallback>();

  function snap(desc: string, phase: Snapshot['phase']) {
    snapshots.push({
      callStack: callStack.map(c => ({ ...c })),
      webAPIs: webAPIs.map(w => ({ ...w })),
      microtaskQueue: microtaskQueueItems.map(m => ({ ...m })),
      callbackQueue: callbackQueueItems.map(c => ({ ...c })),
      consoleOutput: [...consoleOutput],
      description: desc,
      phase,
    });
  }

  // ── AST helpers ──

  function resolveValue(node: any, bindings: Record<string, string>): string {
    if (!node) return '';
    if (node.type === 'Literal') return String(node.value);
    if (node.type === 'Identifier' && node.name in bindings) return bindings[node.name];
    if (node.type === 'Identifier') return node.name;
    return '\u2026';
  }

  function fnName(node: any): string {
    if (!node) return 'anonymous';
    if (node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration')
      return node.id?.name ?? 'anonymous';
    if (node.type === 'ArrowFunctionExpression') return 'arrow';
    if (node.type === 'Identifier') return node.name;
    return 'anonymous';
  }

  function fnBody(node: any): any[] {
    if (!node) return [];
    if (node.body?.type === 'BlockStatement') return node.body.body;
    if (node.body) return [{ type: 'ExpressionStatement', expression: node.body }];
    return [];
  }

  function fnParams(node: any): string[] {
    if (!node?.params) return [];
    return node.params.filter((p: any) => p.type === 'Identifier').map((p: any) => p.name);
  }

  function isConsoleLog(n: any): boolean {
    return n?.type === 'CallExpression' &&
      n.callee?.type === 'MemberExpression' &&
      n.callee.object?.type === 'Identifier' &&
      n.callee.object.name === 'console' &&
      n.callee.property?.name === 'log';
  }

  function isSetTimeout(n: any): boolean {
    return n?.type === 'CallExpression' &&
      n.callee?.type === 'Identifier' &&
      n.callee.name === 'setTimeout';
  }

  function extractPromiseChain(node: any): { fns: any[]; resolveArg?: any } | null {
    const fns: any[] = [];
    let cur = node;
    while (
      cur?.type === 'CallExpression' &&
      cur.callee?.type === 'MemberExpression' &&
      cur.callee.property?.name === 'then' &&
      cur.arguments?.[0]
    ) {
      fns.unshift(cur.arguments[0]);
      cur = cur.callee.object;
    }
    if (fns.length === 0) return null;
    if (
      cur?.type === 'CallExpression' &&
      cur.callee?.type === 'MemberExpression' &&
      cur.callee.object?.type === 'Identifier' &&
      cur.callee.object.name === 'Promise' &&
      cur.callee.property?.name === 'resolve'
    ) {
      return { fns, resolveArg: cur.arguments?.[0] };
    }
    return null;
  }

  // ── Processing ──

  function processExpr(expr: any, bindings: Record<string, string>, phase: Snapshot['phase']): void {
    if (isConsoleLog(expr)) {
      const args = expr.arguments.map((a: any) => resolveValue(a, bindings));
      const output = args.join(' ');
      const label = `console.log("${output}")`;
      callStack.push({ id: id(), label });
      consoleOutput.push(output);
      snap(`${label} \u2192 outputs "${output}"`, phase);
      callStack.pop();
      return;
    }

    if (isSetTimeout(expr)) {
      const fn = expr.arguments[0];
      const delay = expr.arguments[1]?.type === 'Literal' ? expr.arguments[1].value : 0;
      const name = fnName(fn);

      callStack.push({ id: id(), label: `setTimeout(${name}, ${delay})` });
      snap(`Call setTimeout \u2014 registers ${name} with Web APIs`, phase);
      callStack.pop();

      const webId = id();
      timerCallbacks.set(webId, {
        label: name,
        stmts: fnBody(fn),
        params: fnParams(fn),
      });
      webAPIs.push({ id: webId, label: name, type: 'timer', remaining: delay });
      snap(`${name} added to Web APIs \u2014 timer starts (${delay}ms)`, phase);
      return;
    }

    const chain = extractPromiseChain(expr);
    if (chain) {
      const { fns, resolveArg: rArg } = chain;
      const rVal = rArg ? resolveValue(rArg, {}) : undefined;

      const entries: PendingCallback[] = fns.map(f => ({
        label: fnName(f),
        stmts: fnBody(f),
        params: fnParams(f),
      }));
      for (let i = 0; i < entries.length - 1; i++) entries[i].nextInChain = entries[i + 1];
      entries[0].resolvedValue = rVal;

      const promiseStr = `Promise.resolve(${rVal !== undefined ? `"${rVal}"` : ''})`;
      const chainStr = entries.map(e => `.then(${e.label})`).join('');

      callStack.push({ id: id(), label: `${promiseStr}${chainStr}` });
      snap(`Execute ${promiseStr}${chainStr}`, phase);
      callStack.pop();

      const mtId = id();
      microtaskCallbacks.set(mtId, entries[0]);
      microtaskQueueItems.push({ id: mtId, label: entries[0].label });
      snap(`${entries[0].label} added to Microtask Queue`, phase);
      return;
    }
  }

  function processStmts(stmts: any[], bindings: Record<string, string>, phase: Snapshot['phase']): string | undefined {
    let returnVal: string | undefined;
    for (const stmt of stmts) {
      if (stmt.type === 'ExpressionStatement') {
        processExpr(stmt.expression, bindings, phase);
      } else if (stmt.type === 'VariableDeclaration') {
        for (const decl of stmt.declarations) {
          if (decl.init) processExpr(decl.init, bindings, phase);
        }
      } else if (stmt.type === 'ReturnStatement' && stmt.argument) {
        returnVal = resolveValue(stmt.argument, bindings);
      }
    }
    return returnVal;
  }

  // ── Event loop mechanics ──

  function fireTimers() {
    while (webAPIs.length > 0) {
      const api = webAPIs.shift()!;
      const cb = timerCallbacks.get(api.id);
      if (!cb) continue;
      timerCallbacks.delete(api.id);
      const cbId = id();
      cbCallbacks.set(cbId, cb);
      callbackQueueItems.push({ id: cbId, label: cb.label });
      snap(`Timer done \u2014 ${cb.label} moves to Callback Queue`, 'webapi');
    }
  }

  function drainMicrotasks() {
    while (microtaskQueueItems.length > 0) {
      const mtItem = microtaskQueueItems.shift()!;
      const mt = microtaskCallbacks.get(mtItem.id);
      if (!mt) continue;
      microtaskCallbacks.delete(mtItem.id);

      callStack.push({ id: id(), label: `${mt.label}()` });
      snap(`Microtask: ${mt.label} dequeued \u2192 Call Stack`, 'microtask-drain');

      const bindings: Record<string, string> = {};
      if (mt.resolvedValue !== undefined && mt.params.length > 0) {
        bindings[mt.params[0]] = mt.resolvedValue;
      }

      const returnVal = processStmts(mt.stmts, bindings, 'microtask-drain');

      if (mt.nextInChain) {
        const next = mt.nextInChain;
        next.resolvedValue = returnVal;
        const nextId = id();
        microtaskCallbacks.set(nextId, next);
        microtaskQueueItems.push({ id: nextId, label: next.label });
        snap(`${mt.label} returned "${returnVal ?? ''}" \u2014 ${next.label} queued`, 'microtask-drain');
      }

      callStack.pop();
      snap(`${mt.label} done \u2014 removed from Call Stack`, 'microtask-drain');
    }
  }

  // ── Run simulation ──

  callStack.push({ id: id(), label: 'global()' });
  snap('Program starts \u2014 global() pushed to Call Stack', 'sync');

  processStmts((ast as any).body, {}, 'sync');

  callStack.pop();
  snap('All synchronous code complete \u2014 Call Stack is empty', 'sync');

  fireTimers();
  drainMicrotasks();

  while (callbackQueueItems.length > 0) {
    const cbItem = callbackQueueItems.shift()!;
    const cb = cbCallbacks.get(cbItem.id);
    if (!cb) continue;
    cbCallbacks.delete(cbItem.id);

    callStack.push({ id: id(), label: `${cb.label}()` });
    snap(`Event Loop picks ${cb.label} from Callback Queue \u2192 Call Stack`, 'callback-dequeue');

    processStmts(cb.stmts, {}, 'callback-dequeue');

    callStack.pop();
    snap(`${cb.label} done \u2014 removed from Call Stack`, 'callback-dequeue');

    fireTimers();
    drainMicrotasks();
  }

  snap('All queues empty \u2014 event loop complete', 'complete');
  return snapshots;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Phase config ────────────────────────────────────────────

const PHASE_COLORS: Record<Snapshot['phase'], string> = {
  sync: 'var(--accent-blue)',
  webapi: 'var(--accent-orange)',
  'microtask-drain': 'var(--accent-purple)',
  'callback-dequeue': 'var(--accent-yellow)',
  complete: 'var(--accent-green)',
};

const PHASE_LABELS: Record<Snapshot['phase'], string> = {
  sync: 'Synchronous',
  webapi: 'Web API',
  'microtask-drain': 'Microtask Drain',
  'callback-dequeue': 'Callback Dequeue',
  complete: 'Complete',
};

// ── Animation config ────────────────────────────────────────

const cardSpring = { type: 'spring' as const, stiffness: 500, damping: 30 };

const cardVariants = {
  initial: { opacity: 0, y: -12, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.9, transition: { duration: 0.12 } },
};

// ── Column component ────────────────────────────────────────

function Column({
  title,
  color,
  items,
  cardClass,
  reversed,
  renderExtra,
  emptyText,
}: {
  title: string;
  color: string;
  items: (QueueItem | WebAPIItem)[];
  cardClass: string;
  reversed?: boolean;
  renderExtra?: (item: QueueItem | WebAPIItem) => React.ReactNode;
  emptyText?: string;
}) {
  const displayItems = reversed ? [...items].reverse() : items;
  return (
    <div className={styles.column}>
      <div className={styles.columnHeader} style={{ borderTopColor: color, color }}>
        {title}
        {items.length > 0 && <span className={styles.columnCount}>{items.length}</span>}
      </div>
      <div className={styles.columnBody}>
        <AnimatePresence mode="popLayout">
          {displayItems.map(item => (
            <motion.div
              key={item.id}
              className={`${styles.card} ${cardClass}`}
              variants={cardVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={cardSpring}
              layout
            >
              {item.label}
              {renderExtra?.(item)}
            </motion.div>
          ))}
        </AnimatePresence>
        {items.length === 0 && emptyText && (
          <div className={styles.emptyHint}>{emptyText}</div>
        )}
      </div>
    </div>
  );
}

// ── Page component ──────────────────────────────────────────

export default function EventLoopPage() {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [selectedExample, setSelectedExample] = useState(0);
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const { snapshots, error } = useMemo(() => {
    try {
      return { snapshots: simulateEventLoop(code), error: null };
    } catch (e) {
      return { snapshots: [] as Snapshot[], error: e instanceof Error ? e.message : 'Parse error' };
    }
  }, [code]);

  const snapshot = snapshots[step] ?? null;

  const handleExampleSelect = useCallback((i: number) => {
    setSelectedExample(i);
    setCode(EXAMPLES[i].code);
    setStep(0);
    setIsPlaying(false);
  }, []);

  // Auto-play
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setStep(prev => {
        if (prev >= snapshots.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(interval);
  }, [isPlaying, snapshots.length, speed]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') {
        setStep(s => Math.min(s + 1, snapshots.length - 1));
        setIsPlaying(false);
      } else if (e.key === 'ArrowLeft') {
        setStep(s => Math.max(s - 1, 0));
        setIsPlaying(false);
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(p => !p);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snapshots.length]);

  return (
    <div className={styles.page}>
      {/* ── Top Bar ── */}
      <header className={styles.topBar}>
        <Link to="/" className={styles.backLink}>&larr; Home</Link>
        <div className={styles.brand}>
          <h1 className={styles.title}>Event Loop Simulator</h1>
          <span className={styles.subtitle}>Philip Roberts Style</span>
        </div>
        <div className={styles.examples}>
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.name}
              className={`${styles.exBtn} ${i === selectedExample ? styles.exBtnActive : ''}`}
              onClick={() => handleExampleSelect(i)}
            >
              {ex.name}
            </button>
          ))}
        </div>
      </header>

      {/* ── Main Grid ── */}
      <main className={styles.main}>
        {/* Code */}
        <div className={styles.codeColumn}>
          <div className={styles.codeEditorWrap}>
            <CodeEditor
              code={code}
              onCodeChange={(val) => { setCode(val); setStep(0); setIsPlaying(false); }}
              highlightLine={0}
            />
          </div>
          <div className={styles.consolePanel}>
            <div className={styles.consoleHeader}>Console</div>
            <div className={styles.consoleBody}>
              <AnimatePresence>
                {snapshot?.consoleOutput.map((line, i) => (
                  <motion.div
                    key={`${i}-${line}`}
                    className={styles.consoleLine}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <span className={styles.consolePrompt}>&rsaquo;</span>
                    {line}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Call Stack */}
        <Column
          title="Call Stack"
          color="var(--accent-blue)"
          items={snapshot?.callStack ?? []}
          cardClass={styles.cardBlue}
          reversed
          emptyText="Empty"
        />

        {/* Web APIs */}
        <Column
          title="Web APIs"
          color="var(--accent-orange)"
          items={snapshot?.webAPIs ?? []}
          cardClass={styles.cardOrange}
          renderExtra={item =>
            'remaining' in item && item.remaining !== undefined ? (
              <span className={styles.timerBadge}>{(item as WebAPIItem).remaining}ms</span>
            ) : null
          }
          emptyText="No active APIs"
        />

        {/* Microtask Queue */}
        <Column
          title="Microtask Queue"
          color="var(--accent-purple)"
          items={snapshot?.microtaskQueue ?? []}
          cardClass={styles.cardPurple}
          emptyText="Empty"
        />

        {/* Callback Queue */}
        <Column
          title="Callback Queue"
          color="var(--accent-yellow)"
          items={snapshot?.callbackQueue ?? []}
          cardClass={styles.cardYellow}
          emptyText="Empty"
        />
      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        {error && (
          <div className={styles.errorBox}>
            <div className={styles.errorLabel}>Parse Error</div>
            <pre className={styles.errorMsg}>{error}</pre>
          </div>
        )}

        {snapshot && (
          <div className={styles.descriptionBar}>
            <span
              className={styles.phaseBadge}
              style={{ backgroundColor: PHASE_COLORS[snapshot.phase] }}
            >
              {PHASE_LABELS[snapshot.phase]}
            </span>
            <span className={styles.descriptionText}>{snapshot.description}</span>
          </div>
        )}

        {snapshots.length > 0 && (
          <div className={styles.controls}>
            <div className={styles.controlGroup}>
              <button
                className={styles.stepBtn}
                onClick={() => { setStep(0); setIsPlaying(false); }}
                disabled={step === 0}
              >
                ⏮
              </button>
              <button
                className={styles.stepBtn}
                onClick={() => { setStep(s => Math.max(0, s - 1)); setIsPlaying(false); }}
                disabled={step === 0}
              >
                ◀
              </button>
              <button
                className={`${styles.stepBtn} ${styles.playBtn}`}
                onClick={() => setIsPlaying(p => !p)}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
              <button
                className={styles.stepBtn}
                onClick={() => { setStep(s => Math.min(snapshots.length - 1, s + 1)); setIsPlaying(false); }}
                disabled={step >= snapshots.length - 1}
              >
                ▶
              </button>
              <button
                className={styles.stepBtn}
                onClick={() => { setStep(snapshots.length - 1); setIsPlaying(false); }}
                disabled={step >= snapshots.length - 1}
              >
                ⏭
              </button>
            </div>

            <span className={styles.stepInfo}>
              Step {step + 1} / {snapshots.length}
            </span>

            <div className={styles.speedGroup}>
              {[0.5, 1, 2].map(s => (
                <button
                  key={s}
                  className={`${styles.speedBtn} ${speed === s ? styles.speedBtnActive : ''}`}
                  onClick={() => setSpeed(s)}
                >
                  {s}x
                </button>
              ))}
            </div>

            <span className={styles.hint}>&larr; &rarr; to step, Space to play</span>
          </div>
        )}
      </footer>
    </div>
  );
}
