import { useState, useMemo, useCallback, useEffect, Fragment } from 'react';
import { Link } from 'react-router-dom';
import { parse } from 'acorn';
import { motion, AnimatePresence } from 'framer-motion';
import { CodeEditor } from '../../components/CodeEditor';
import styles from './PrototypeChain.module.css';

// ── Types ──────────────────────────────────────────────────

interface OwnProperty {
  name: string;
  value: string;
}

interface ObjectNode {
  id: string;
  name: string;
  ownProperties: OwnProperty[];
  protoId: string | null;
}

interface LookupRecord {
  expression: string;
  property: string;
  objectId: string;
  resolvedInId: string | null;
  found: boolean;
}

interface CtorInfo {
  params: string[];
  thisAssignments: { prop: string; paramName: string | null; literal: string | null }[];
  parentCtor: string | null;
  superArgParamNames: string[];
}

// ── Examples ───────────────────────────────────────────────

const EXAMPLES = [
  {
    name: 'Object.create',
    code: `var animal = {
  speak: function() {
    return this.sound;
  }
};

var dog = Object.create(animal);
dog.sound = "Woof";
dog.speak();

var cat = Object.create(animal);
cat.sound = "Meow";
cat.speak();`,
  },
  {
    name: 'Constructors',
    code: `function Person(name) {
  this.name = name;
}
Person.prototype.greet = function() {
  return "Hi, I'm " + this.name;
};

var kyle = new Person("Kyle");
kyle.greet();

var suzy = new Person("Suzy");
suzy.greet();`,
  },
  {
    name: 'Chain Lookup',
    code: `var base = { x: 10 };
var middle = Object.create(base);
middle.y = 20;
var top = Object.create(middle);
top.z = 30;

top.z;
top.y;
top.x;
top.w;`,
  },
  {
    name: 'Class Syntax',
    code: `class Vehicle {
  constructor(make) {
    this.make = make;
  }
  start() {
    return this.make + " starting";
  }
}

class Car extends Vehicle {
  constructor(make, model) {
    super(make);
    this.model = model;
  }
  describe() {
    return this.make + " " + this.model;
  }
}

var myCar = new Car("Toyota", "Camry");
myCar.describe();
myCar.start();`,
  },
];

// ── Analyzer ───────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

const SKIP_OBJECTS = new Set(['console', 'Object', 'Array', 'Math', 'JSON', 'String', 'Number', 'Boolean']);

function analyzePrototypes(code: string): { objects: ObjectNode[]; lookups: LookupRecord[] } {
  const ast = parse(code, { ecmaVersion: 2020, locations: true, sourceType: 'script' }) as any;

  const objectsMap = new Map<string, ObjectNode>();
  const varToObjId = new Map<string, string>();
  const ctors = new Map<string, CtorInfo>();
  const lookups: LookupRecord[] = [];

  objectsMap.set('Object.prototype', {
    id: 'Object.prototype',
    name: 'Object.prototype',
    ownProperties: [
      { name: 'hasOwnProperty', value: 'fn()' },
      { name: 'toString', value: 'fn()' },
    ],
    protoId: null,
  });

  function src(node: any): string {
    return code.slice(node.start, node.end);
  }

  function valStr(node: any): string {
    if (!node) return '?';
    if (node.type === 'Literal') return JSON.stringify(node.value);
    if (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') return 'fn()';
    return src(node);
  }

  function extractObjProps(node: any): OwnProperty[] {
    return (node.properties || [])
      .filter((p: any) => p.key?.type === 'Identifier')
      .map((p: any) => ({ name: p.key.name, value: valStr(p.value) }));
  }

  function extractThisAssigns(body: any[], params: string[]): CtorInfo['thisAssignments'] {
    const out: CtorInfo['thisAssignments'] = [];
    for (const s of body) {
      if (
        s.type === 'ExpressionStatement' &&
        s.expression?.type === 'AssignmentExpression' &&
        s.expression.left?.type === 'MemberExpression' &&
        s.expression.left.object?.type === 'ThisExpression' &&
        s.expression.left.property?.type === 'Identifier'
      ) {
        const prop = s.expression.left.property.name;
        const right = s.expression.right;
        if (right.type === 'Identifier' && params.includes(right.name)) {
          out.push({ prop, paramName: right.name, literal: null });
        } else {
          out.push({ prop, paramName: null, literal: valStr(right) });
        }
      }
    }
    return out;
  }

  function findSuperArgs(body: any[]): string[] {
    for (const s of body) {
      if (
        s.type === 'ExpressionStatement' &&
        s.expression?.type === 'CallExpression' &&
        s.expression.callee?.type === 'Super'
      ) {
        return s.expression.arguments.map((a: any) =>
          a.type === 'Identifier' ? a.name : '',
        );
      }
    }
    return [];
  }

  function resolveNewProps(ctorName: string, args: any[]): OwnProperty[] {
    const info = ctors.get(ctorName);
    if (!info) return [];

    const paramValues = new Map<string, string>();
    info.params.forEach((p, i) => {
      if (args[i]) paramValues.set(p, valStr(args[i]));
    });

    const props: OwnProperty[] = [];

    if (info.parentCtor) {
      const parent = ctors.get(info.parentCtor);
      if (parent) {
        const superVals = info.superArgParamNames.map(n => paramValues.get(n) ?? n);
        for (const a of parent.thisAssignments) {
          if (a.paramName) {
            const idx = parent.params.indexOf(a.paramName);
            props.push({ name: a.prop, value: idx >= 0 && idx < superVals.length ? superVals[idx] : a.paramName });
          } else {
            props.push({ name: a.prop, value: a.literal ?? '?' });
          }
        }
      }
    }

    for (const a of info.thisAssignments) {
      if (a.paramName && paramValues.has(a.paramName)) {
        props.push({ name: a.prop, value: paramValues.get(a.paramName)! });
      } else if (a.literal) {
        props.push({ name: a.prop, value: a.literal });
      }
    }

    return props;
  }

  function lookupProp(startId: string, prop: string): string | null {
    let cur: string | null = startId;
    while (cur) {
      const obj = objectsMap.get(cur);
      if (!obj) return null;
      if (obj.ownProperties.some(p => p.name === prop)) return cur;
      cur = obj.protoId;
    }
    return null;
  }

  for (const stmt of ast.body) {
    if (stmt.type === 'FunctionDeclaration' && stmt.id?.type === 'Identifier') {
      const name = stmt.id.name;
      const params = stmt.params.map((p: any) => p.name ?? '');
      ctors.set(name, {
        params,
        thisAssignments: extractThisAssigns(stmt.body.body, params),
        parentCtor: null,
        superArgParamNames: [],
      });
      continue;
    }

    if (stmt.type === 'ClassDeclaration' && stmt.id?.type === 'Identifier') {
      const className = stmt.id.name;
      const protoId = `${className}.prototype`;
      const parentName = stmt.superClass?.type === 'Identifier' ? stmt.superClass.name : null;
      const parentProtoId = parentName ? `${parentName}.prototype` : 'Object.prototype';

      const methods: OwnProperty[] = [];
      let ctorParams: string[] = [];
      let ctorThisAssigns: CtorInfo['thisAssignments'] = [];
      let superArgs: string[] = [];

      for (const member of stmt.body.body) {
        if (member.type === 'MethodDefinition') {
          if (member.kind === 'constructor' && member.value) {
            ctorParams = member.value.params.map((p: any) => p.name ?? '');
            ctorThisAssigns = extractThisAssigns(member.value.body.body, ctorParams);
            superArgs = findSuperArgs(member.value.body.body);
          } else if (member.kind === 'method' && member.key?.type === 'Identifier') {
            methods.push({ name: member.key.name, value: 'fn()' });
          }
        }
      }

      objectsMap.set(protoId, {
        id: protoId,
        name: protoId,
        ownProperties: methods,
        protoId: parentProtoId,
      });

      ctors.set(className, {
        params: ctorParams,
        thisAssignments: ctorThisAssigns,
        parentCtor: parentName,
        superArgParamNames: superArgs,
      });
      continue;
    }

    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        if (decl.id?.type !== 'Identifier' || !decl.init) continue;
        const vn = decl.id.name;
        const init = decl.init;

        if (init.type === 'ObjectExpression') {
          objectsMap.set(vn, {
            id: vn, name: vn,
            ownProperties: extractObjProps(init),
            protoId: 'Object.prototype',
          });
          varToObjId.set(vn, vn);
        } else if (
          init.type === 'CallExpression' &&
          init.callee?.type === 'MemberExpression' &&
          init.callee.object?.name === 'Object' &&
          init.callee.property?.name === 'create'
        ) {
          const arg = init.arguments?.[0];
          let pid: string | null = null;
          if (arg?.type === 'Identifier') pid = varToObjId.get(arg.name) ?? arg.name;
          else if (arg?.type === 'Literal' && arg.value === null) pid = null;

          objectsMap.set(vn, { id: vn, name: vn, ownProperties: [], protoId: pid });
          varToObjId.set(vn, vn);
        } else if (init.type === 'NewExpression' && init.callee?.type === 'Identifier') {
          const cn = init.callee.name;
          const pid = `${cn}.prototype`;

          if (!objectsMap.has(pid)) {
            objectsMap.set(pid, { id: pid, name: pid, ownProperties: [], protoId: 'Object.prototype' });
          }

          objectsMap.set(vn, {
            id: vn, name: vn,
            ownProperties: resolveNewProps(cn, init.arguments),
            protoId: pid,
          });
          varToObjId.set(vn, vn);
        }
      }
      continue;
    }

    if (stmt.type === 'ExpressionStatement') {
      const expr = stmt.expression;

      if (expr?.type === 'AssignmentExpression' && expr.left?.type === 'MemberExpression') {
        const left = expr.left;

        if (
          left.object?.type === 'MemberExpression' &&
          left.object.object?.type === 'Identifier' &&
          left.object.property?.name === 'prototype' &&
          left.property?.type === 'Identifier'
        ) {
          const cn = left.object.object.name;
          const pid = `${cn}.prototype`;
          if (!objectsMap.has(pid)) {
            objectsMap.set(pid, { id: pid, name: pid, ownProperties: [], protoId: 'Object.prototype' });
          }
          objectsMap.get(pid)!.ownProperties.push({ name: left.property.name, value: valStr(expr.right) });
          continue;
        }

        if (left.object?.type === 'Identifier' && left.property?.type === 'Identifier') {
          const oid = varToObjId.get(left.object.name);
          if (oid && objectsMap.has(oid)) {
            objectsMap.get(oid)!.ownProperties.push({ name: left.property.name, value: valStr(expr.right) });
          }
          continue;
        }
      }

      if (
        expr?.type === 'MemberExpression' &&
        expr.object?.type === 'Identifier' &&
        expr.property?.type === 'Identifier' &&
        !SKIP_OBJECTS.has(expr.object.name)
      ) {
        const objId = varToObjId.get(expr.object.name);
        if (objId) {
          const resolved = lookupProp(objId, expr.property.name);
          lookups.push({
            expression: `${expr.object.name}.${expr.property.name}`,
            property: expr.property.name,
            objectId: objId,
            resolvedInId: resolved,
            found: resolved !== null,
          });
        }
        continue;
      }

      if (
        expr?.type === 'CallExpression' &&
        expr.callee?.type === 'MemberExpression' &&
        expr.callee.object?.type === 'Identifier' &&
        expr.callee.property?.type === 'Identifier' &&
        !SKIP_OBJECTS.has(expr.callee.object.name)
      ) {
        const objId = varToObjId.get(expr.callee.object.name);
        if (objId) {
          const resolved = lookupProp(objId, expr.callee.property.name);
          lookups.push({
            expression: `${expr.callee.object.name}.${expr.callee.property.name}()`,
            property: expr.callee.property.name,
            objectId: objId,
            resolvedInId: resolved,
            found: resolved !== null,
          });
        }
        continue;
      }
    }
  }

  const hasRef = Array.from(objectsMap.values()).some(
    o => o.protoId === 'Object.prototype' && o.id !== 'Object.prototype',
  );
  if (!hasRef) objectsMap.delete('Object.prototype');

  return { objects: Array.from(objectsMap.values()), lookups };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Layout Helpers ─────────────────────────────────────────

function computeLevels(objects: ObjectNode[]): ObjectNode[][] {
  const objMap = new Map(objects.map(o => [o.id, o]));
  const depths = new Map<string, number>();

  function depth(id: string, visited: Set<string> = new Set()): number {
    if (depths.has(id)) return depths.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);
    const obj = objMap.get(id);
    if (!obj?.protoId || !objMap.has(obj.protoId)) {
      depths.set(id, 0);
      return 0;
    }
    const d = depth(obj.protoId, visited) + 1;
    depths.set(id, d);
    return d;
  }

  objects.forEach(o => depth(o.id));
  const maxD = Math.max(0, ...Array.from(depths.values()));

  const levels: ObjectNode[][] = [];
  for (let d = maxD; d >= 0; d--) {
    const level = objects.filter(o => depths.get(o.id) === d);
    if (level.length > 0) levels.push(level);
  }

  return levels;
}

function getChainPath(startId: string, property: string, objMap: Map<string, ObjectNode>): string[] {
  const path: string[] = [];
  let cur: string | null = startId;
  while (cur && objMap.has(cur)) {
    path.push(cur);
    const curObj: ObjectNode = objMap.get(cur)!;
    if (curObj.ownProperties.some((p: OwnProperty) => p.name === property)) break;
    cur = curObj.protoId;
  }
  return path;
}

function getObjectType(obj: ObjectNode): 'instance' | 'prototype' | 'builtin' {
  if (obj.id === 'Object.prototype') return 'builtin';
  if (obj.id.endsWith('.prototype')) return 'prototype';
  return 'instance';
}

// ── Object Card Component ──────────────────────────────────

const TYPE_STYLES = {
  instance: { name: styles.nameInstance, tag: styles.tagInstance, label: 'instance' },
  prototype: { name: styles.namePrototype, tag: styles.tagPrototype, label: 'proto' },
  builtin: { name: styles.nameBuiltin, tag: styles.tagBuiltin, label: 'built-in' },
};

function ObjectCard({
  object,
  state,
  searchProp,
  delay,
}: {
  object: ObjectNode;
  state: 'idle' | 'searching' | 'found';
  searchProp: string | null;
  delay: number;
}) {
  const type = getObjectType(object);
  const ts = TYPE_STYLES[type];

  const stateClass =
    state === 'found' ? styles.objectFound
    : state === 'searching' ? styles.objectSearching
    : '';

  return (
    <motion.div
      className={`${styles.objectCard} ${stateClass} ${type === 'builtin' ? styles.objectProto : ''}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3, ease: 'easeOut' }}
    >
      <div className={styles.objectHeader}>
        <span className={`${styles.objectName} ${ts.name}`}>{object.name}</span>
        <span className={`${styles.objectTag} ${ts.tag}`}>{ts.label}</span>
      </div>
      {object.ownProperties.length > 0 ? (
        <div className={styles.propsTable}>
          {object.ownProperties.map((p, i) => {
            const isMatch = state === 'found' && searchProp === p.name;
            return (
              <div key={i} className={`${styles.propRow} ${isMatch ? styles.propHighlighted : ''}`}>
                <span className={styles.propName}>{p.name}</span>
                <span className={styles.propSep}>:</span>
                <span className={styles.propValue}>{p.value}</span>
              </div>
            );
          })}
        </div>
      ) : type !== 'builtin' ? (
        <div className={styles.noProps}>no own properties</div>
      ) : null}
    </motion.div>
  );
}

// ── Page Component ─────────────────────────────────────────

export default function PrototypeChainPage() {
  const [code, setCode] = useState(EXAMPLES[0].code);
  const [selectedExample, setSelectedExample] = useState(0);
  const [activeLookup, setActiveLookup] = useState<number | null>(null);
  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(new Set());
  const [foundNode, setFoundNode] = useState<string | null>(null);
  const [searchProp, setSearchProp] = useState<string | null>(null);

  const result = useMemo(() => {
    try {
      return { data: analyzePrototypes(code), error: null };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : 'Parse error' };
    }
  }, [code]);

  const analysis = result.data;
  const error = result.error;

  const objMap = useMemo(() => {
    if (!analysis) return new Map<string, ObjectNode>();
    return new Map(analysis.objects.map(o => [o.id, o]));
  }, [analysis]);

  const levels = useMemo(() => {
    if (!analysis) return [];
    return computeLevels(analysis.objects);
  }, [analysis]);

  useEffect(() => {
    if (activeLookup === null || !analysis) {
      setHighlightedNodes(new Set());
      setFoundNode(null);
      setSearchProp(null);
      return;
    }

    const lookup = analysis.lookups[activeLookup];
    const path = getChainPath(lookup.objectId, lookup.property, objMap);
    setSearchProp(lookup.property);
    setFoundNode(null);
    setHighlightedNodes(new Set([path[0]]));

    if (path.length === 1 && lookup.found) {
      setFoundNode(path[0]);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const nodes = new Set<string>([path[0]]);

    for (let i = 1; i < path.length; i++) {
      const id = path[i];
      const isLast = i === path.length - 1;
      timers.push(
        setTimeout(() => {
          nodes.add(id);
          setHighlightedNodes(new Set(nodes));
          if (isLast && lookup.found) setFoundNode(id);
        }, i * 400),
      );
    }

    return () => timers.forEach(clearTimeout);
  }, [activeLookup, analysis, objMap]);

  const handleExample = useCallback((i: number) => {
    setSelectedExample(i);
    setCode(EXAMPLES[i].code);
    setActiveLookup(null);
  }, []);

  const getNodeState = useCallback(
    (objId: string): 'idle' | 'searching' | 'found' => {
      if (!highlightedNodes.has(objId)) return 'idle';
      if (foundNode === objId) return 'found';
      return 'searching';
    },
    [highlightedNodes, foundNode],
  );

  const isArrowHighlighted = useCallback(
    (levelIdx: number): boolean => {
      if (highlightedNodes.size === 0) return false;
      const upper = levels[levelIdx];
      const lower = levels[levelIdx + 1];
      return upper.some(o => highlightedNodes.has(o.id)) && lower.some(o => highlightedNodes.has(o.id));
    },
    [highlightedNodes, levels],
  );

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link to="/" className={styles.backLink}>← Home</Link>
        <div className={styles.brand}>
          <h1 className={styles.title}>Prototype Chain Visualizer</h1>
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
            onCodeChange={(val) => { setCode(val); setActiveLookup(null); }}
            highlightLine={0}
          />
        </section>

        <section className={styles.vizPanel}>
          <div className={styles.panelHead}>
            <span>Prototype Chain</span>
            {analysis && (
              <span className={styles.objCount}>
                {analysis.objects.length} object{analysis.objects.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          <div className={styles.vizScroll}>
            {error ? (
              <div className={styles.errorBox}>
                <div className={styles.errorLabel}>Parse Error</div>
                <pre className={styles.errorMsg}>{error}</pre>
              </div>
            ) : analysis && analysis.objects.length > 0 ? (
              <AnimatePresence mode="wait">
                <motion.div
                  key={code}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <p className={styles.chainHint}>
                    <strong>OLOO</strong> — Objects Linked to Other Objects.
                    {analysis.lookups.length > 0 && ' Click a lookup below to trace the chain.'}
                  </p>

                  <div className={styles.chainContainer}>
                    {levels.map((level, li) => (
                      <Fragment key={li}>
                        <div className={styles.level}>
                          {level.map((obj, oi) => (
                            <ObjectCard
                              key={obj.id}
                              object={obj}
                              state={getNodeState(obj.id)}
                              searchProp={searchProp}
                              delay={li * 0.1 + oi * 0.05}
                            />
                          ))}
                        </div>
                        {li < levels.length - 1 && (
                          <div className={`${styles.arrowRow} ${isArrowHighlighted(li) ? styles.arrowHighlighted : ''}`}>
                            <div className={styles.arrowStem} />
                            <span className={styles.arrowLabel}>[[Prototype]]</span>
                            <div className={styles.arrowTip}>▼</div>
                          </div>
                        )}
                      </Fragment>
                    ))}
                  </div>

                  {analysis.lookups.length > 0 && (
                    <div className={styles.lookupSection}>
                      <h3 className={styles.lookupTitle}>Property Lookups</h3>
                      <div className={styles.lookupGrid}>
                        {analysis.lookups.map((l, i) => (
                          <div
                            key={i}
                            className={`${styles.lookupRow} ${activeLookup === i ? styles.lookupActive : ''}`}
                            onClick={() => setActiveLookup(activeLookup === i ? null : i)}
                          >
                            <code className={styles.lookupExpr}>{l.expression}</code>
                            <span className={styles.lookupArrow}>→</span>
                            <span className={l.found ? styles.lookupFound : styles.lookupNotFound}>
                              {l.found ? `found in ${l.resolvedInId}` : 'not found'}
                            </span>
                            <span className={`${styles.lookupBadge} ${l.found ? styles.badgeFound : styles.badgeNotFound}`}>
                              {l.found ? '✓' : '✗'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            ) : (
              <div className={styles.emptyState}>
                Write some JavaScript to see prototype chains
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
