import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { parse } from 'acorn';
import { motion, AnimatePresence } from 'framer-motion';
import { CodeEditor } from '../../components/CodeEditor';
import styles from './ThisBinding.module.css';

// ── Types ──────────────────────────────────────────────────

type BindingRule = 'new' | 'explicit' | 'implicit' | 'default';

interface CallSite {
  line: number;
  code: string;
  rule: BindingRule;
  explanation: string;
  thisValue: string;
}

// ── Examples ───────────────────────────────────────────────

const EXAMPLES = [
  {
    name: 'The 4 Rules',
    code: `function greet() {
  console.log(this.name);
}

var obj = { name: "Kyle", greet: greet };

greet();
obj.greet();
greet.call({ name: "Suzy" });
var bound = greet.bind({ name: "Frank" });
bound();
new greet();`,
  },
  {
    name: 'Implicit Lost',
    code: `var obj = {
  name: "Kyle",
  greet: function() {
    console.log(this.name);
  }
};

obj.greet();
var fn = obj.greet;
fn();
setTimeout(obj.greet, 100);`,
  },
  {
    name: 'Explicit Binding',
    code: `function ask(question) {
  console.log(this.teacher, question);
}

var workshop1 = { teacher: "Kyle" };
var workshop2 = { teacher: "Suzy" };

ask.call(workshop1, "How?");
ask.apply(workshop2, ["Why?"]);
var kylesAsk = ask.bind(workshop1);
kylesAsk("What?");`,
  },
  {
    name: 'new Binding',
    code: `function Workshop(teacher) {
  this.teacher = teacher;
}

var kyle = new Workshop("Kyle");
var suzy = new Workshop("Suzy");
console.log(kyle.teacher);
console.log(suzy.teacher);`,
  },
];

// ── Rule Metadata ──────────────────────────────────────────

const RULE_META: Record<BindingRule, { label: string; badgeClass: string; iconClass: string; resultClass: string; matchClass: string }> = {
  new:      { label: 'new',      badgeClass: styles.badgeNew,      iconClass: styles.stepIconNew,      resultClass: styles.stepResultNew,      matchClass: styles.stepMatchedNew },
  explicit: { label: 'explicit', badgeClass: styles.badgeExplicit, iconClass: styles.stepIconExplicit, resultClass: styles.stepResultExplicit, matchClass: styles.stepMatchedExplicit },
  implicit: { label: 'implicit', badgeClass: styles.badgeImplicit, iconClass: styles.stepIconImplicit, resultClass: styles.stepResultImplicit, matchClass: styles.stepMatchedImplicit },
  default:  { label: 'default',  badgeClass: styles.badgeDefault,  iconClass: styles.stepIconDefault,  resultClass: styles.stepResultDefault,  matchClass: styles.stepMatchedDefault },
};

const DECISION_ORDER: BindingRule[] = ['new', 'explicit', 'implicit', 'default'];

const DECISION_QUESTION: Record<BindingRule, string> = {
  new: 'Called with new?',
  explicit: 'Called with call / apply / bind?',
  implicit: 'Called as obj.method()?',
  default: 'Plain function call?',
};

// ── Analyzer ───────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function extractSource(code: string, node: any): string {
  return code.slice(node.start, node.end);
}

function analyzeThisBindings(code: string): CallSite[] {
  const ast = parse(code, { ecmaVersion: 2020, locations: true, sourceType: 'script' });
  const results: CallSite[] = [];
  const bindIdentifiers = new Set<string>();

  // First pass: find identifiers assigned via .bind()
  collectBindNames(ast, code, bindIdentifiers);

  // Second pass: find all call sites
  walkForCalls(ast, code, bindIdentifiers, results);

  results.sort((a, b) => a.line - b.line);
  return results;
}

function collectBindNames(node: any, code: string, out: Set<string>): void {
  if (!node || typeof node !== 'object') return;

  if (
    node.type === 'VariableDeclarator' &&
    node.id?.type === 'Identifier' &&
    node.init?.type === 'CallExpression' &&
    node.init.callee?.type === 'MemberExpression' &&
    node.init.callee.property?.name === 'bind'
  ) {
    out.add(node.id.name);
  }

  for (const key of Object.keys(node)) {
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && item.type) collectBindNames(item, code, out);
      }
    } else if (val && typeof val === 'object' && val.type) {
      collectBindNames(val, code, out);
    }
  }
}

function walkForCalls(node: any, code: string, bindIds: Set<string>, results: CallSite[]): void {
  if (!node || typeof node !== 'object') return;

  if (node.type === 'NewExpression') {
    const snippet = extractSource(code, node);
    const calleeName = node.callee?.type === 'Identifier' ? node.callee.name : extractSource(code, node.callee);
    results.push({
      line: node.loc.start.line,
      code: snippet,
      rule: 'new',
      explanation: `Called with new ${calleeName}() → this = newly created object`,
      thisValue: `new {} (${calleeName} instance)`,
    });
  }

  if (node.type === 'CallExpression') {
    const callee = node.callee;
    const snippet = extractSource(code, node);

    if (
      callee.type === 'MemberExpression' &&
      callee.property?.type === 'Identifier' &&
      (callee.property.name === 'call' || callee.property.name === 'apply')
    ) {
      const method = callee.property.name;
      const fnName = callee.object?.type === 'Identifier'
        ? callee.object.name
        : extractSource(code, callee.object);
      const argNode = node.arguments?.[0];
      const argSnippet = argNode ? extractSource(code, argNode) : 'undefined';
      results.push({
        line: node.loc.start.line,
        code: snippet,
        rule: 'explicit',
        explanation: `Called as ${fnName}.${method}(${argSnippet}) → this = ${argSnippet}`,
        thisValue: argSnippet,
      });
    } else if (
      callee.type === 'MemberExpression' &&
      callee.property?.type === 'Identifier' &&
      callee.property.name === 'bind'
    ) {
      // .bind() itself isn't a call site that invokes the function — skip
    } else if (
      callee.type === 'Identifier' &&
      bindIds.has(callee.name)
    ) {
      results.push({
        line: node.loc.start.line,
        code: snippet,
        rule: 'explicit',
        explanation: `${callee.name} was created via .bind() → this = bound object`,
        thisValue: 'bound object',
      });
    } else if (callee.type === 'MemberExpression') {
      const objName = callee.object?.type === 'Identifier'
        ? callee.object.name
        : extractSource(code, callee.object);
      const propName = callee.property?.type === 'Identifier'
        ? callee.property.name
        : extractSource(code, callee.property);

      // Skip console.log, setTimeout, etc.
      if (objName === 'console' || propName === 'log' || propName === 'warn' || propName === 'error') {
        // not a meaningful `this` call site
      } else {
        results.push({
          line: node.loc.start.line,
          code: snippet,
          rule: 'implicit',
          explanation: `Called as ${objName}.${propName}() → this = ${objName}`,
          thisValue: objName,
        });
      }
    } else if (callee.type === 'Identifier') {
      const fnName = callee.name;
      if (fnName === 'setTimeout' || fnName === 'setInterval') {
        // Check if the first argument is a member expression (obj.method)
        const firstArg = node.arguments?.[0];
        if (firstArg?.type === 'MemberExpression') {
          const objName = firstArg.object?.type === 'Identifier'
            ? firstArg.object.name
            : extractSource(code, firstArg.object);
          const propName = firstArg.property?.type === 'Identifier'
            ? firstArg.property.name
            : extractSource(code, firstArg.property);
          results.push({
            line: node.loc.start.line,
            code: snippet,
            rule: 'default',
            explanation: `${objName}.${propName} passed as callback to ${fnName} — implicit binding lost → this = window`,
            thisValue: 'window / undefined',
          });
        }
      } else {
        results.push({
          line: node.loc.start.line,
          code: snippet,
          rule: 'default',
          explanation: `Plain call ${fnName}() with no context → this = window (sloppy) / undefined (strict)`,
          thisValue: 'window / undefined',
        });
      }
    }
  }

  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'raw' || key === 'value' || key === 'name') continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) {
        if (item && typeof item === 'object' && item.type) walkForCalls(item, code, bindIds, results);
      }
    } else if (val && typeof val === 'object' && val.type) {
      walkForCalls(val, code, bindIds, results);
    }
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Decision Tree Component ────────────────────────────────

function DecisionTree({ matchedRule }: { matchedRule: BindingRule }) {
  const matchIdx = DECISION_ORDER.indexOf(matchedRule);

  return (
    <div className={styles.decisionTree}>
      {DECISION_ORDER.map((rule, i) => {
        const isMatch = rule === matchedRule;
        const isSkipped = i < matchIdx;
        const isPast = i > matchIdx;
        const meta = RULE_META[rule];

        return (
          <div
            key={rule}
            className={`${styles.decisionStep} ${isMatch ? meta.matchClass : ''} ${(isSkipped || isPast) ? styles.stepDimmed : ''}`}
          >
            <span
              className={`${styles.stepIcon} ${isMatch ? meta.iconClass : isSkipped ? styles.stepIconSkipped : styles.stepIconEmpty}`}
            >
              {isMatch ? '✓' : isSkipped ? '—' : (i + 1)}
            </span>
            <span className={`${styles.stepLabel} ${isMatch ? styles.stepLabelActive : ''}`}>
              {DECISION_QUESTION[rule]}
            </span>
            <span
              className={`${styles.stepResult} ${isMatch ? `${styles.stepResultActive} ${meta.resultClass}` : ''}`}
            >
              {isMatch ? 'YES → match' : isSkipped ? 'no' : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Call Site Card Component ───────────────────────────────

function CallSiteCard({ site, index }: { site: CallSite; index: number }) {
  const meta = RULE_META[site.rule];

  return (
    <motion.div
      className={styles.callSiteCard}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.25, ease: 'easeOut' }}
    >
      <div className={styles.cardHeader}>
        <span className={styles.cardLine}>L{site.line}</span>
        <code className={styles.cardCode}>{site.code}</code>
        <span className={`${styles.badge} ${meta.badgeClass}`}>{meta.label}</span>
      </div>
      <div className={styles.cardBody}>
        <div className={styles.explanation}>
          {site.explanation}
          {' → '}
          <span className={styles.explanationHighlight}>this = {site.thisValue}</span>
        </div>
        <DecisionTree matchedRule={site.rule} />
      </div>
    </motion.div>
  );
}

// ── Page Component ─────────────────────────────────────────

export default function ThisBindingPage() {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [selectedExample, setSelectedExample] = useState(0);

  const result = useMemo(() => {
    try {
      return { data: analyzeThisBindings(code), error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : 'Parse error' };
    }
  }, [code]);

  const callSites = result.data;
  const error = result.error;

  const handleExample = useCallback((i: number) => {
    setSelectedExample(i);
    setCode(EXAMPLES[i].code);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link to="/" className={styles.backLink}>← Home</Link>
        <div className={styles.brand}>
          <h1 className={styles.title}>this Binding Visualizer</h1>
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
            onCodeChange={setCode}
            highlightLine={0}
          />
        </section>

        <section className={styles.vizPanel}>
          <div className={styles.panelHead}>
            <span>Call Sites</span>
            {callSites && (
              <span className={styles.callSiteCount}>
                {callSites.length} call site{callSites.length !== 1 ? 's' : ''} found
              </span>
            )}
          </div>

          <div className={styles.vizScroll}>
            {error ? (
              <div className={styles.errorBox}>
                <div className={styles.errorLabel}>Parse Error</div>
                <pre className={styles.errorMsg}>{error}</pre>
              </div>
            ) : callSites && callSites.length > 0 ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={code}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                >
                  {callSites.map((site, i) => (
                    <CallSiteCard key={`${site.line}-${site.code}`} site={site} index={i} />
                  ))}
                </motion.div>
              </AnimatePresence>
            ) : (
              <div className={styles.emptyState}>
                {callSites ? 'No call sites found — write some function calls' : 'Write some JavaScript to analyze this bindings'}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
