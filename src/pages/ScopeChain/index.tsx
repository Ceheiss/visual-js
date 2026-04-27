import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { parse } from 'acorn';
import { motion } from 'framer-motion';
import { CodeEditor } from '../../components/CodeEditor';
import styles from './ScopeChain.module.css';

// ── Types ──────────────────────────────────────────────────

interface ScopeVariable {
  name: string;
  declarationType: 'var' | 'let' | 'const' | 'function' | 'param';
  line: number;
}

interface Scope {
  id: string;
  name: string;
  type: 'global' | 'function' | 'block';
  parentId: string | null;
  variables: ScopeVariable[];
  children: Scope[];
  depth: number;
  range: [number, number];
}

interface VariableLookup {
  name: string;
  line: number;
  fromScopeId: string;
  resolvedScopeId: string | null;
  resolvedScopeName: string | null;
}

interface AnalysisResult {
  scopeTree: Scope;
  lookups: VariableLookup[];
}

// ── Scope Color Palette ────────────────────────────────────

const PALETTE = {
  global: {
    border: 'rgba(92,156,245,0.45)',
    bg: 'rgba(92,156,245,0.06)',
    text: '#5c9cf5',
    marble: '#5c9cf5',
  },
  function: [
    { border: 'rgba(107,201,119,0.45)', bg: 'rgba(107,201,119,0.06)', text: '#6bc977', marble: '#6bc977' },
    { border: 'rgba(209,154,102,0.45)', bg: 'rgba(209,154,102,0.06)', text: '#d19a66', marble: '#d19a66' },
    { border: 'rgba(198,120,221,0.45)', bg: 'rgba(198,120,221,0.06)', text: '#c678dd', marble: '#c678dd' },
  ],
  block: [
    { border: 'rgba(86,182,194,0.35)', bg: 'rgba(86,182,194,0.05)', text: '#56b6c2', marble: '#56b6c2' },
    { border: 'rgba(229,192,123,0.35)', bg: 'rgba(229,192,123,0.05)', text: '#e5c07b', marble: '#e5c07b' },
    { border: 'rgba(224,108,117,0.35)', bg: 'rgba(224,108,117,0.05)', text: '#e06c75', marble: '#e06c75' },
  ],
};

function getScopeColor(scope: Scope) {
  if (scope.type === 'global') return PALETTE.global;
  const list = scope.type === 'function' ? PALETTE.function : PALETTE.block;
  return list[(scope.depth - 1) % list.length];
}

// ── Examples ───────────────────────────────────────────────

const EXAMPLES = [
  {
    name: 'Basic Scope',
    code: `var teacher = "Kyle";

function otherClass() {
  var teacher = "Suzy";
  console.log(teacher);
}

function ask() {
  var question = "Why?";
  console.log(question);
}

otherClass();
ask();`,
  },
  {
    name: 'Shadowing',
    code: `var x = 10;

function outer() {
  var x = 20;
  function inner() {
    var x = 30;
    console.log(x);
  }
  inner();
}

outer();
console.log(x);`,
  },
  {
    name: 'Block Scope',
    code: `var teacher = "Kyle";

{
  let teacher = "Suzy";
  console.log(teacher);
}

console.log(teacher);`,
  },
  {
    name: 'Closure',
    code: `function makeCounter() {
  var count = 0;
  function increment() {
    count = count + 1;
    return count;
  }
  return increment;
}

var counter = makeCounter();
counter();
counter();`,
  },
];

// ── Scope Analyzer ─────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

let _sid = 0;

function mkScope(
  name: string,
  type: Scope['type'],
  parentId: string | null,
  depth: number,
  range: [number, number],
): Scope {
  return { id: `s${_sid++}`, name, type, parentId, variables: [], children: [], depth, range };
}

const SCALAR_KEYS = new Set([
  'type', 'start', 'end', 'loc', 'raw', 'value', 'name',
  'operator', 'prefix', 'sourceType', 'kind', 'computed',
  'method', 'shorthand', 'async', 'generator', 'expression',
  'delegate', 'optional', 'regex', 'bigint',
]);

function addParams(node: any, scope: Scope) {
  for (const p of node.params) {
    if (p.type === 'Identifier') {
      scope.variables.push({ name: p.name, declarationType: 'param', line: p.loc.start.line });
    }
  }
}

function walkNode(node: any, scope: Scope, fnScope: Scope): void {
  if (!node || typeof node !== 'object') return;

  switch (node.type) {
    case 'VariableDeclaration': {
      const kind = node.kind as ScopeVariable['declarationType'];
      const target = kind === 'var' ? fnScope : scope;
      for (const d of node.declarations) {
        if (d.id?.type === 'Identifier') {
          target.variables.push({ name: d.id.name, declarationType: kind, line: d.id.loc.start.line });
        }
        if (d.init) walkNode(d.init, scope, fnScope);
      }
      return;
    }

    case 'FunctionDeclaration': {
      if (node.id) {
        fnScope.variables.push({ name: node.id.name, declarationType: 'function', line: node.id.loc.start.line });
      }
      const child = mkScope(node.id?.name ?? 'anonymous', 'function', scope.id, scope.depth + 1, [node.start, node.end]);
      addParams(node, child);
      scope.children.push(child);
      for (const s of node.body.body) walkNode(s, child, child);
      return;
    }

    case 'FunctionExpression': {
      const child = mkScope(node.id?.name ?? 'anonymous', 'function', scope.id, scope.depth + 1, [node.start, node.end]);
      addParams(node, child);
      scope.children.push(child);
      for (const s of node.body.body) walkNode(s, child, child);
      return;
    }

    case 'ArrowFunctionExpression': {
      const child = mkScope('arrow', 'function', scope.id, scope.depth + 1, [node.start, node.end]);
      addParams(node, child);
      scope.children.push(child);
      if (node.body.type === 'BlockStatement') {
        for (const s of node.body.body) walkNode(s, child, child);
      } else {
        walkNode(node.body, child, child);
      }
      return;
    }

    case 'BlockStatement': {
      const block = mkScope('block', 'block', scope.id, scope.depth + 1, [node.start, node.end]);
      for (const s of node.body) walkNode(s, block, fnScope);
      if (block.variables.length > 0 || block.children.length > 0) {
        scope.children.push(block);
      }
      return;
    }

    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement': {
      const loop = mkScope('for', 'block', scope.id, scope.depth + 1, [node.start, node.end]);
      if (node.init) walkNode(node.init, loop, fnScope);
      if (node.left) walkNode(node.left, loop, fnScope);
      if (node.test) walkNode(node.test, loop, fnScope);
      if (node.update) walkNode(node.update, loop, fnScope);
      if (node.body) walkNode(node.body, loop, fnScope);
      if (loop.variables.length > 0 || loop.children.length > 0) {
        scope.children.push(loop);
      }
      return;
    }

    default: {
      for (const key of Object.keys(node)) {
        if (SCALAR_KEYS.has(key)) continue;
        const val = node[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            if (item && typeof item === 'object' && item.type) walkNode(item, scope, fnScope);
          }
        } else if (val && typeof val === 'object' && val.type) {
          walkNode(val, scope, fnScope);
        }
      }
    }
  }
}

// ── Lookup Collection ──────────────────────────────────────

function findScopeById(root: Scope, id: string): Scope | null {
  if (root.id === id) return root;
  for (const c of root.children) {
    const hit = findScopeById(c, id);
    if (hit) return hit;
  }
  return null;
}

function innermostScope(pos: number, scope: Scope): Scope {
  for (const c of scope.children) {
    if (pos >= c.range[0] && pos < c.range[1]) return innermostScope(pos, c);
  }
  return scope;
}

function resolveVar(name: string, from: Scope, root: Scope): { id: string; name: string } | null {
  let cur: Scope | null = from;
  while (cur) {
    if (cur.variables.some(v => v.name === name)) return { id: cur.id, name: cur.name };
    cur = cur.parentId ? findScopeById(root, cur.parentId) : null;
  }
  return null;
}

const BUILTINS = new Set([
  'console', 'undefined', 'NaN', 'Infinity', 'parseInt', 'parseFloat',
  'isNaN', 'isFinite', 'Math', 'JSON', 'Array', 'Object', 'String',
  'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'Promise',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
]);

function collectLookups(ast: any, root: Scope): VariableLookup[] {
  const out: VariableLookup[] = [];
  const seen = new Set<string>();

  function walk(node: any, parent: any, pKey: string | null): void {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'Identifier' && parent) {
      const skip =
        (parent.type === 'VariableDeclarator' && pKey === 'id') ||
        ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression') && pKey === 'id') ||
        (['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(parent.type) && pKey === 'params') ||
        (parent.type === 'MemberExpression' && pKey === 'property' && !parent.computed) ||
        (parent.type === 'Property' && pKey === 'key');
      if (skip || BUILTINS.has(node.name)) return;

      const dedupKey = `${node.name}:${node.loc.start.line}`;
      if (seen.has(dedupKey)) return;
      seen.add(dedupKey);

      const from = innermostScope(node.start, root);
      const resolved = resolveVar(node.name, from, root);
      out.push({
        name: node.name,
        line: node.loc.start.line,
        fromScopeId: from.id,
        resolvedScopeId: resolved?.id ?? null,
        resolvedScopeName: resolved?.name ?? null,
      });
      return;
    }

    for (const k of Object.keys(node)) {
      if (SCALAR_KEYS.has(k)) continue;
      const val = node[k];
      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object' && item.type) walk(item, node, k);
        }
      } else if (val && typeof val === 'object' && val.type) {
        walk(val, node, k);
      }
    }
  }

  walk(ast, null, null);
  return out;
}

function analyzeScopes(code: string): AnalysisResult {
  _sid = 0;
  const ast = parse(code, { ecmaVersion: 2020, locations: true, sourceType: 'script' });
  const root = mkScope('Global', 'global', null, 0, [ast.start, ast.end]);
  for (const stmt of (ast as any).body) walkNode(stmt, root, root);
  return { scopeTree: root, lookups: collectLookups(ast, root) };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Visualization Components ───────────────────────────────

function ScopeBubble({ scope, highlightId }: { scope: Scope; highlightId: string | null }) {
  const c = getScopeColor(scope);
  const lit = scope.id === highlightId;

  return (
    <motion.div
      className={styles.scopeBubble}
      style={{
        borderColor: lit ? c.text : c.border,
        backgroundColor: lit ? c.bg.replace('0.06', '0.18').replace('0.05', '0.15') : c.bg,
        boxShadow: lit
          ? `inset 0 0 30px ${c.bg.replace('0.06', '0.10').replace('0.05', '0.08')}, 0 0 12px ${c.bg.replace('0.06', '0.18').replace('0.05', '0.14')}`
          : 'none',
      }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
    >
      <div className={styles.scopeHeader}>
        <span className={styles.scopeTag} style={{ color: c.text, borderColor: c.border }}>
          {scope.type}
        </span>
        <span className={styles.scopeName} style={{ color: c.text }}>
          {scope.name}
        </span>
      </div>

      {scope.variables.length > 0 && (
        <div className={styles.marbles}>
          {scope.variables.map((v, i) => (
            <motion.div
              key={`${v.name}-${v.line}`}
              className={styles.marble}
              style={{ borderColor: `${c.marble}40` }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, type: 'spring', stiffness: 400, damping: 22 }}
            >
              <span className={styles.marbleDot} style={{ backgroundColor: c.marble }} />
              <span className={styles.marbleKind}>{v.declarationType}</span>
              <span className={styles.marbleName}>{v.name}</span>
              <span className={styles.marbleLine}>:{v.line}</span>
            </motion.div>
          ))}
        </div>
      )}

      {scope.children.length > 0 && (
        <div className={styles.scopeChildren}>
          {scope.children.map(child => (
            <ScopeBubble key={child.id} scope={child} highlightId={highlightId} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function LookupList({ lookups, onHighlight }: { lookups: VariableLookup[]; onHighlight: (id: string | null) => void }) {
  return (
    <div className={styles.lookups}>
      <h3 className={styles.lookupsTitle}>Variable Lookups</h3>
      <div className={styles.lookupGrid}>
        {lookups.map((l, i) => (
          <div
            key={i}
            className={styles.lookupRow}
            onMouseEnter={() => onHighlight(l.resolvedScopeId)}
            onMouseLeave={() => onHighlight(null)}
          >
            <span className={styles.lookupLine}>L{l.line}</span>
            <code className={styles.lookupVar}>{l.name}</code>
            <span className={styles.lookupArrow}>→</span>
            <span className={styles.lookupScope}>
              {l.resolvedScopeName ?? 'unresolved (global?)'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Page Component ─────────────────────────────────────────

export default function ScopeChainPage() {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [selectedExample, setSelectedExample] = useState(0);
  const [phase, setPhase] = useState<'compilation' | 'execution'>('compilation');
  const [highlightId, setHighlightId] = useState<string | null>(null);

  const result = useMemo(() => {
    try {
      return { data: analyzeScopes(code), error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : 'Parse error' };
    }
  }, [code]);

  const analysis = result.data;
  const error = result.error;

  const handleExample = useCallback((i: number) => {
    setSelectedExample(i);
    setCode(EXAMPLES[i].code);
    setHighlightId(null);
    setPhase('compilation');
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link to="/" className={styles.backLink}>← Home</Link>
        <div className={styles.brand}>
          <h1 className={styles.title}>Scope Chain Visualizer</h1>
          <span className={styles.subtitle}>Kyle Simpson Style</span>
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

      <main className={styles.main}>
        <section className={styles.codePanel}>
          <CodeEditor
            code={code}
            onCodeChange={(val) => { setCode(val); setHighlightId(null); }}
            highlightLine={0}
          />
        </section>

        <section className={styles.vizPanel}>
          <div className={styles.panelHead}>
            <span>Scope Bubbles</span>
            <div className={styles.phaseToggle}>
              <button
                className={`${styles.phaseBtn} ${phase === 'compilation' ? styles.phaseActive : ''}`}
                onClick={() => { setPhase('compilation'); setHighlightId(null); }}
              >
                Compilation
              </button>
              <button
                className={`${styles.phaseBtn} ${phase === 'execution' ? styles.phaseActive : ''}`}
                onClick={() => setPhase('execution')}
              >
                Execution
              </button>
            </div>
          </div>

          <div className={styles.vizScroll}>
            {error ? (
              <div className={styles.errorBox}>
                <div className={styles.errorLabel}>Parse Error</div>
                <pre className={styles.errorMsg}>{error}</pre>
              </div>
            ) : analysis ? (
              <>
                <p className={styles.phaseHint}>
                  {phase === 'compilation'
                    ? 'The engine scans the code and drops each variable (marble) into its scope (bucket).'
                    : 'The engine executes code and looks up variables through the scope chain. Hover a lookup to highlight its resolved scope.'}
                </p>
                <ScopeBubble scope={analysis.scopeTree} highlightId={highlightId} />
                {phase === 'execution' && analysis.lookups.length > 0 && (
                  <LookupList lookups={analysis.lookups} onHighlight={setHighlightId} />
                )}
              </>
            ) : (
              <div className={styles.emptyState}>Write some JavaScript to see scope analysis</div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
