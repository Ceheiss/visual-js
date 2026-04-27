import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { parse } from 'acorn';
import { motion, AnimatePresence } from 'framer-motion';
import { CodeEditor } from '../../components/CodeEditor';
import styles from './Recursion.module.css';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Types ──────────────────────────────────────────────────

interface TreeNode {
  id: string;
  fnName: string;
  args: string[];
  parentId: string | null;
  children: TreeNode[];
  status: 'pending' | 'active' | 'returned';
  returnValue: any;
  isBaseCase: boolean;
  depth: number;
}

interface Snapshot {
  tree: TreeNode | null;
  activeNodeId: string | null;
  description: string;
  step: number;
}

// ── Examples ───────────────────────────────────────────────

const EXAMPLES = [
  {
    name: 'Fibonacci',
    code: `function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

fib(5);`,
  },
  {
    name: 'Factorial',
    code: `function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

factorial(5);`,
  },
  {
    name: 'Sum Array',
    code: `function sum(arr) {
  if (arr.length === 0) return 0;
  return arr[0] + sum(arr.slice(1));
}

sum([1, 2, 3, 4]);`,
  },
  {
    name: 'Power',
    code: `function power(base, exp) {
  if (exp === 0) return 1;
  return base * power(base, exp - 1);
}

power(2, 5);`,
  },
];

// ── Mini Interpreter ───────────────────────────────────────

function formatValue(val: any): string {
  if (val === undefined) return 'undefined';
  if (val === null) return 'null';
  if (Array.isArray(val)) return `[${val.map(formatValue).join(', ')}]`;
  if (typeof val === 'string') return `"${val}"`;
  return String(val);
}

let _nodeId = 0;

function createNode(
  fnName: string,
  args: any[],
  parentId: string | null,
  depth: number,
): TreeNode {
  return {
    id: `n${_nodeId++}`,
    fnName,
    args: args.map(formatValue),
    parentId,
    children: [],
    status: 'pending',
    returnValue: undefined,
    isBaseCase: true,
    depth,
  };
}

function deepCloneTree(node: TreeNode | null): TreeNode | null {
  if (!node) return null;
  return {
    ...node,
    args: [...node.args],
    children: node.children.map(c => deepCloneTree(c)!),
  };
}

function findNode(root: TreeNode | null, id: string): TreeNode | null {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function buildSnapshots(code: string): Snapshot[] {
  _nodeId = 0;
  const ast = parse(code, { ecmaVersion: 2020, sourceType: 'script' }) as any;

  const functions: Record<string, any> = {};
  let topLevelCall: any = null;

  for (const stmt of ast.body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id) {
      functions[stmt.id.name] = stmt;
    } else if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression') {
      topLevelCall = stmt.expression;
    }
  }

  if (!topLevelCall) {
    throw new Error('No top-level function call found');
  }

  const snapshots: Snapshot[] = [];
  let root: TreeNode | null = null;

  function snap(activeId: string | null, desc: string) {
    snapshots.push({
      tree: deepCloneTree(root),
      activeNodeId: activeId,
      description: desc,
      step: snapshots.length,
    });
  }

  function evalExpr(node: any, env: Record<string, any>, parentNodeId: string | null, depth: number): any {
    switch (node.type) {
      case 'Literal':
        return node.value;

      case 'Identifier':
        if (node.name in env) return env[node.name];
        throw new Error(`Undefined variable: ${node.name}`);

      case 'ArrayExpression':
        return node.elements.map((el: any) => evalExpr(el, env, parentNodeId, depth));

      case 'BinaryExpression':
        return evalBinary(
          node.operator,
          evalExpr(node.left, env, parentNodeId, depth),
          evalExpr(node.right, env, parentNodeId, depth),
        );

      case 'UnaryExpression':
        return evalUnary(node.operator, evalExpr(node.argument, env, parentNodeId, depth));

      case 'LogicalExpression': {
        const left = evalExpr(node.left, env, parentNodeId, depth);
        if (node.operator === '&&') return left ? evalExpr(node.right, env, parentNodeId, depth) : left;
        if (node.operator === '||') return left ? left : evalExpr(node.right, env, parentNodeId, depth);
        return left;
      }

      case 'ConditionalExpression': {
        const test = evalExpr(node.test, env, parentNodeId, depth);
        return test
          ? evalExpr(node.consequent, env, parentNodeId, depth)
          : evalExpr(node.alternate, env, parentNodeId, depth);
      }

      case 'MemberExpression': {
        const obj = evalExpr(node.object, env, parentNodeId, depth);
        if (node.computed) {
          const prop = evalExpr(node.property, env, parentNodeId, depth);
          return obj[prop];
        }
        return obj[node.property.name];
      }

      case 'CallExpression': {
        if (
          node.callee.type === 'MemberExpression' &&
          !node.callee.computed
        ) {
          const obj = evalExpr(node.callee.object, env, parentNodeId, depth);
          const method = node.callee.property.name;
          const args = node.arguments.map((a: any) => evalExpr(a, env, parentNodeId, depth));
          if (method === 'slice') return obj.slice(...args);
          if (method === 'concat') return obj.concat(...args);
          if (method === 'push') { obj.push(...args); return obj.length; }
          throw new Error(`Unsupported method: ${method}`);
        }

        const fnName = node.callee.type === 'Identifier' ? node.callee.name : '?';
        const fnDef = functions[fnName];
        if (!fnDef) throw new Error(`Unknown function: ${fnName}`);

        const args = node.arguments.map((a: any) => evalExpr(a, env, parentNodeId, depth));

        const treeNode = createNode(fnName, args, parentNodeId, depth);
        if (!root) {
          root = treeNode;
        } else {
          const parent = findNode(root, parentNodeId!);
          if (parent) {
            parent.children.push(treeNode);
            parent.isBaseCase = false;
          }
        }

        treeNode.status = 'active';
        snap(treeNode.id, `Calling ${fnName}(${treeNode.args.join(', ')})`);

        const localEnv: Record<string, any> = {};
        fnDef.params.forEach((p: any, i: number) => {
          localEnv[p.name] = args[i];
        });

        const result = execBlock(fnDef.body.body, localEnv, treeNode.id, depth + 1);

        const liveNode = findNode(root, treeNode.id)!;
        liveNode.returnValue = result;
        liveNode.status = 'returned';

        if (liveNode.isBaseCase) {
          snap(treeNode.id, `Base case: ${fnName}(${treeNode.args.join(', ')}) = ${formatValue(result)}`);
        } else {
          const childParts = liveNode.children
            .map(c => `${c.fnName}(${c.args.join(', ')}) = ${formatValue(c.returnValue)}`)
            .join(', ');
          snap(treeNode.id, `${fnName}(${treeNode.args.join(', ')}) = ${formatValue(result)}  ← ${childParts}`);
        }

        return result;
      }

      default:
        throw new Error(`Unsupported expression: ${node.type}`);
    }
  }

  function evalBinary(op: string, left: any, right: any): any {
    switch (op) {
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return left / right;
      case '%': return left % right;
      case '===': return left === right;
      case '!==': return left !== right;
      case '==': return left == right;
      case '!=': return left != right;
      case '<': return left < right;
      case '>': return left > right;
      case '<=': return left <= right;
      case '>=': return left >= right;
      default: throw new Error(`Unsupported operator: ${op}`);
    }
  }

  function evalUnary(op: string, arg: any): any {
    switch (op) {
      case '-': return -arg;
      case '!': return !arg;
      case '+': return +arg;
      default: throw new Error(`Unsupported unary operator: ${op}`);
    }
  }

  const RETURN_SIGNAL = Symbol('return');

  function execBlock(
    body: any[],
    env: Record<string, any>,
    parentNodeId: string | null,
    depth: number,
  ): any {
    for (const stmt of body) {
      const result = execStmt(stmt, env, parentNodeId, depth);
      if (result && typeof result === 'object' && result.__signal === RETURN_SIGNAL) {
        return result.value;
      }
    }
    return undefined;
  }

  function execStmt(
    stmt: any,
    env: Record<string, any>,
    parentNodeId: string | null,
    depth: number,
  ): any {
    switch (stmt.type) {
      case 'ReturnStatement':
        return {
          __signal: RETURN_SIGNAL,
          value: stmt.argument ? evalExpr(stmt.argument, env, parentNodeId, depth) : undefined,
        };

      case 'IfStatement': {
        const test = evalExpr(stmt.test, env, parentNodeId, depth);
        if (test) {
          return execStmt(stmt.consequent, env, parentNodeId, depth);
        } else if (stmt.alternate) {
          return execStmt(stmt.alternate, env, parentNodeId, depth);
        }
        return undefined;
      }

      case 'BlockStatement':
        for (const s of stmt.body) {
          const r = execStmt(s, env, parentNodeId, depth);
          if (r && typeof r === 'object' && r.__signal === RETURN_SIGNAL) return r;
        }
        return undefined;

      case 'VariableDeclaration':
        for (const decl of stmt.declarations) {
          if (decl.id.type === 'Identifier') {
            env[decl.id.name] = decl.init ? evalExpr(decl.init, env, parentNodeId, depth) : undefined;
          }
        }
        return undefined;

      case 'ExpressionStatement':
        evalExpr(stmt.expression, env, parentNodeId, depth);
        return undefined;

      default:
        return undefined;
    }
  }

  const topFnName = topLevelCall.callee.type === 'Identifier' ? topLevelCall.callee.name : '?';
  const topArgs = topLevelCall.arguments.map((a: any) => evalExpr(a, {}, null, 0));

  root = null;
  _nodeId = 0;

  const topNode = createNode(topFnName, topArgs, null, 0);
  root = topNode;
  topNode.status = 'active';
  snap(topNode.id, `Calling ${topFnName}(${topNode.args.join(', ')})`);

  const fnDef = functions[topFnName];
  const topEnv: Record<string, any> = {};
  fnDef.params.forEach((p: any, i: number) => {
    topEnv[p.name] = topArgs[i];
  });
  const finalResult = execBlock(fnDef.body.body, topEnv, topNode.id, 1);

  const liveTop = findNode(root, topNode.id)!;
  liveTop.returnValue = finalResult;
  liveTop.status = 'returned';

  if (liveTop.isBaseCase) {
    snap(topNode.id, `Base case: ${topFnName}(${topNode.args.join(', ')}) = ${formatValue(finalResult)}`);
  } else {
    snap(topNode.id, `Done! ${topFnName}(${topNode.args.join(', ')}) = ${formatValue(finalResult)}`);
  }

  return snapshots;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Tree Node Component ────────────────────────────────────

function RecursionNode({
  node,
  activeNodeId,
}: {
  node: TreeNode;
  activeNodeId: string | null;
}) {
  const isActive = node.id === activeNodeId;
  const isReturned = node.status === 'returned';
  const isPending = node.status === 'pending';

  let boxClass = styles.nodeBox;
  if (isActive) boxClass += ` ${styles.nodeActive}`;
  else if (isPending) boxClass += ` ${styles.nodePending}`;
  else if (isReturned && node.isBaseCase) boxClass += ` ${styles.nodeBaseReturned}`;
  else if (isReturned) boxClass += ` ${styles.nodeRecursiveReturned}`;

  let vertLineClass = styles.vertLine;
  if (isActive) vertLineClass += ` ${styles.vertLineActive}`;
  else if (isReturned && node.isBaseCase) vertLineClass += ` ${styles.vertLineBaseReturned}`;
  else if (isReturned) vertLineClass += ` ${styles.vertLineRecursiveReturned}`;

  const label = `${node.fnName}(${node.args.join(', ')})`;

  return (
    <div className={styles.nodeGroup}>
      <motion.div
        className={boxClass}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      >
        <div className={styles.nodeFnName}>{label}</div>
        <AnimatePresence>
          {isReturned && (
            <motion.div
              className={styles.nodeReturn}
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
            >
              = {formatValue(node.returnValue)}
            </motion.div>
          )}
        </AnimatePresence>
        {isReturned && (
          <span className={`${styles.nodeTag} ${node.isBaseCase ? styles.tagBase : styles.tagRecursive}`}>
            {node.isBaseCase ? 'base' : 'rec'}
          </span>
        )}
      </motion.div>

      {node.children.length > 0 && (
        <>
          <div className={vertLineClass} />
          <div className={styles.childrenRow}>
            {node.children.map(child => (
              <div key={child.id} className={styles.connector}>
                <div
                  className={
                    styles.vertLine +
                    (child.id === activeNodeId
                      ? ` ${styles.vertLineActive}`
                      : child.status === 'returned' && child.isBaseCase
                        ? ` ${styles.vertLineBaseReturned}`
                        : child.status === 'returned'
                          ? ` ${styles.vertLineRecursiveReturned}`
                          : '')
                  }
                />
                <RecursionNode node={child} activeNodeId={activeNodeId} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Page Component ─────────────────────────────────────────

export default function RecursionPage() {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [selectedExample, setSelectedExample] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const intervalRef = useRef<number | null>(null);

  const { snapshots, error } = useMemo(() => {
    try {
      return { snapshots: buildSnapshots(code), error: null };
    } catch (e) {
      return { snapshots: [] as Snapshot[], error: e instanceof Error ? e.message : 'Parse error' };
    }
  }, [code]);

  const snapshot = snapshots[currentStep] ?? null;

  const handleExample = useCallback((i: number) => {
    setSelectedExample(i);
    setCode(EXAMPLES[i].code);
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  const handleCodeChange = useCallback((val: string) => {
    setCode(val);
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  const stepForward = useCallback(() => {
    setCurrentStep(prev => Math.min(prev + 1, snapshots.length - 1));
  }, [snapshots.length]);

  const stepBackward = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const goToStart = useCallback(() => {
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  const goToEnd = useCallback(() => {
    setCurrentStep(snapshots.length - 1);
    setIsPlaying(false);
  }, [snapshots.length]);

  const togglePlay = useCallback(() => {
    setIsPlaying(p => !p);
  }, []);

  // Auto-play interval
  useEffect(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (isPlaying) {
      const ms = Math.max(200, 2000 / speed);
      intervalRef.current = window.setInterval(stepForward, ms);
    }
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current);
    };
  }, [isPlaying, speed, stepForward]);

  // Stop at end
  useEffect(() => {
    if (isPlaying && currentStep >= snapshots.length - 1) {
      setIsPlaying(false);
    }
  }, [currentStep, snapshots.length, isPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case 'ArrowRight': e.preventDefault(); stepForward(); break;
        case 'ArrowLeft': e.preventDefault(); stepBackward(); break;
        case ' ': e.preventDefault(); togglePlay(); break;
        case 'Home': e.preventDefault(); goToStart(); break;
        case 'End': e.preventDefault(); goToEnd(); break;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepForward, stepBackward, togglePlay, goToStart, goToEnd]);

  return (
    <div className={styles.page}>
      {/* ── Top Bar ── */}
      <header className={styles.topBar}>
        <Link to="/" className={styles.backLink}>← Home</Link>
        <div className={styles.brand}>
          <h1 className={styles.title}>Recursion Tree Visualizer</h1>
          <span className={styles.subtitle}>Call Tree Explorer</span>
        </div>
        <div className={styles.examples}>
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.name}
              className={`${styles.exBtn} ${i === selectedExample ? styles.exBtnActive : ''}`}
              onClick={() => handleExample(i)}
            >
              {ex.name}
            </button>
          ))}
        </div>
      </header>

      {/* ── Code Input ── */}
      <section className={styles.codeSection}>
        <div className={styles.panelHead}>
          <span>Source Code</span>
          <button
            className={styles.runBtn}
            onClick={() => { setCurrentStep(0); setIsPlaying(false); }}
          >
            Reset
          </button>
        </div>
        <div className={styles.codeEditorWrap}>
          <CodeEditor
            code={code}
            onCodeChange={handleCodeChange}
            highlightLine={0}
          />
        </div>
      </section>

      {/* ── Tree Visualization ── */}
      <div className={styles.treeArea}>
        {error ? (
          <div className={styles.errorBox}>
            <div className={styles.errorLabel}>Error</div>
            <pre className={styles.errorMsg}>{error}</pre>
          </div>
        ) : snapshot?.tree ? (
          <div className={styles.treeContainer}>
            <RecursionNode node={snapshot.tree} activeNodeId={snapshot.activeNodeId} />
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span>Write a recursive function and call it to see the tree</span>
            <span className={styles.emptyHint}>Arrow keys to step, Space to play</span>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        {snapshot && (
          <div className={styles.stepDescription}>{snapshot.description}</div>
        )}
        {snapshots.length > 0 && (
          <div className={styles.controls}>
            {/* Legend */}
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.dotActive}`} /> Active
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.dotBase}`} /> Base
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.dotRecursive}`} /> Recursive
              </span>
            </div>

            {/* Transport Controls */}
            <button className={styles.btn} onClick={goToStart} title="Go to start (Home)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
              </svg>
            </button>
            <button className={styles.btn} onClick={stepBackward} title="Step back (←)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <button className={`${styles.btn} ${styles.playBtn}`} onClick={togglePlay} title="Play/Pause (Space)">
              {isPlaying ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>
            <button className={styles.btn} onClick={stepForward} title="Step forward (→)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button className={styles.btn} onClick={goToEnd} title="Go to end (End)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
              </svg>
            </button>

            {/* Timeline */}
            <div className={styles.progressSection}>
              <input
                type="range"
                min={0}
                max={snapshots.length - 1}
                value={currentStep}
                onChange={e => { setCurrentStep(parseInt(e.target.value)); setIsPlaying(false); }}
                className={styles.timeline}
              />
              <span className={styles.stepCounter}>
                {currentStep + 1} / {snapshots.length}
              </span>
            </div>

            {/* Speed */}
            <div className={styles.speedSection}>
              <label className={styles.speedLabel}>Speed</label>
              <input
                type="range"
                min="0.5"
                max="5"
                step="0.5"
                value={speed}
                onChange={e => setSpeed(parseFloat(e.target.value))}
                className={styles.speedSlider}
              />
              <span className={styles.speedValue}>{speed}x</span>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
