import type { JSValue, Snapshot, ExecutionContext, MemoryEntry, ClosureEntry } from './types';
import { parse } from './parser';

/* eslint-disable @typescript-eslint/no-explicit-any */
type ASTNode = any;

interface FnObj {
  __isFn: true;
  name: string;
  params: string[];
  body: ASTNode;
  closureEnv: Env;
}

interface PromiseObj {
  __isPromise: true;
  status: 'pending' | 'resolved' | 'rejected';
  resolvedValue: any;
}

interface QueuedTask {
  fn: FnObj;
  args: any[];
  label: string;
  queueType: 'callback' | 'microtask';
}

interface ReturnSignal {
  __isReturn: true;
  value: any;
}

function isFn(v: any): v is FnObj {
  return v !== null && typeof v === 'object' && v.__isFn === true;
}

function isPromise(v: any): v is PromiseObj {
  return v !== null && typeof v === 'object' && v.__isPromise === true;
}

class Env {
  private vars = new Map<string, any>();
  readonly name: string;
  readonly id: string;
  readonly parent: Env | null;

  constructor(name: string, id: string, parent: Env | null = null) {
    this.name = name;
    this.id = id;
    this.parent = parent;
  }

  define(name: string, value: any): void {
    this.vars.set(name, value);
  }

  get(name: string): any {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    return undefined;
  }

  set(name: string, value: any): boolean {
    if (this.vars.has(name)) { this.vars.set(name, value); return true; }
    if (this.parent) return this.parent.set(name, value);
    return false;
  }

  ownEntries(): [string, any][] {
    return Array.from(this.vars.entries());
  }
}

let idSeq = 0;
function nextId(): string { return `ctx_${++idSeq}`; }

export function interpret(code: string): Snapshot[] {
  idSeq = 0;
  const ast = parse(code);
  const snapshots: Snapshot[] = [];
  const globalEnv = new Env('Global', nextId());
  const callStack: { id: string; label: string }[] = [{ id: globalEnv.id, label: 'global()' }];
  const envStack: Env[] = [globalEnv];
  const callbackQueue: QueuedTask[] = [];
  const microtaskQueue: QueuedTask[] = [];
  const prevMem = new Map<string, Map<string, string>>();

  function toJSValue(v: any): JSValue {
    if (v === undefined) return { type: 'undefined', value: undefined };
    if (v === null) return { type: 'null', value: null };
    if (typeof v === 'number') return { type: 'number', value: v };
    if (typeof v === 'string') return { type: 'string', value: v };
    if (typeof v === 'boolean') return { type: 'boolean', value: v };
    if (isFn(v)) return { type: 'function', name: v.name, params: v.params, closureId: v.closureEnv.id !== globalEnv.id ? v.closureEnv.id : null };
    if (isPromise(v)) return { type: 'promise', status: v.status, value: v.resolvedValue !== undefined ? toJSValue(v.resolvedValue) : undefined };
    if (Array.isArray(v)) return { type: 'array', items: v.map(toJSValue) };
    if (typeof v === 'object') return { type: 'object', entries: Object.entries(v).map(([k, val]) => [k, toJSValue(val)] as [string, JSValue]) };
    return { type: 'undefined', value: undefined };
  }

  function buildContexts(): ExecutionContext[] {
    return envStack.map((env, i) => {
      const prev = prevMem.get(env.id) || new Map<string, string>();
      const entries = env.ownEntries();
      const memory: MemoryEntry[] = entries.map(([name, val]) => {
        const jsv = toJSValue(val);
        const key = JSON.stringify(jsv);
        return {
          name,
          value: jsv,
          isNew: !prev.has(name),
          isChanged: prev.has(name) && prev.get(name) !== key,
        };
      });
      const newPrev = new Map<string, string>();
      entries.forEach(([name, val]) => newPrev.set(name, JSON.stringify(toJSValue(val))));
      prevMem.set(env.id, newPrev);

      let closureScope: ClosureEntry[] | null = null;
      if (i > 0 && env.parent && env.parent !== globalEnv) {
        const closures: ClosureEntry[] = [];
        let p: Env | null = env.parent;
        while (p && p !== globalEnv) {
          for (const [n, v] of p.ownEntries()) {
            closures.push({ name: n, value: toJSValue(v), fromContext: p.name });
          }
          p = p.parent;
        }
        if (closures.length > 0) closureScope = closures;
      }

      return {
        id: env.id,
        name: env.name,
        type: i === 0 ? 'global' as const : 'function' as const,
        memory,
        closureScope,
        parentId: i === 0 ? null : envStack[0].id,
      };
    });
  }

  function snap(line: number, description: string, hlCtx?: string, phase: Snapshot['phase'] = 'execution') {
    snapshots.push({
      step: snapshots.length,
      line,
      description,
      executionContexts: buildContexts(),
      callStack: callStack.map(f => ({ ...f })),
      callbackQueue: callbackQueue.map((t, i) => ({ id: `cb_${i}`, label: t.label, type: t.queueType })),
      microtaskQueue: microtaskQueue.map((t, i) => ({ id: `mt_${i}`, label: t.label, type: t.queueType })),
      highlightContextId: hlCtx,
      phase,
    });
  }

  function display(v: any): string {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (isFn(v)) return `function ${v.name}`;
    if (isPromise(v)) return `Promise {<${v.status}>}`;
    if (typeof v === 'string') return `"${v}"`;
    return JSON.stringify(v);
  }

  function evalExpr(node: ASTNode, env: Env): any {
    if (!node) return undefined;
    switch (node.type) {
      case 'Literal': return node.value;
      case 'Identifier': return env.get(node.name);
      case 'BinaryExpression':
      case 'LogicalExpression': return binOp(node.operator, evalExpr(node.left, env), evalExpr(node.right, env));
      case 'UnaryExpression': return unOp(node.operator, evalExpr(node.argument, env));
      case 'ConditionalExpression': return evalExpr(node.test, env) ? evalExpr(node.consequent, env) : evalExpr(node.alternate, env);
      case 'AssignmentExpression': {
        const val = evalExpr(node.right, env);
        if (node.left.type === 'Identifier') env.set(node.left.name, val);
        return val;
      }
      case 'UpdateExpression': {
        if (node.argument.type === 'Identifier') {
          const cur = env.get(node.argument.name);
          const nxt = node.operator === '++' ? cur + 1 : cur - 1;
          env.set(node.argument.name, nxt);
          return node.prefix ? nxt : cur;
        }
        return undefined;
      }
      case 'ArrayExpression': return (node.elements || []).map((e: ASTNode) => evalExpr(e, env));
      case 'ObjectExpression': {
        const obj: Record<string, any> = {};
        for (const p of node.properties) {
          obj[p.key.name || p.key.value] = evalExpr(p.value, env);
        }
        return obj;
      }
      case 'MemberExpression': {
        const obj = evalExpr(node.object, env);
        const prop = node.computed ? evalExpr(node.property, env) : node.property.name;
        if (isPromise(obj) && prop === 'then') return { __isMethod: true, object: obj, method: 'then' };
        if (Array.isArray(obj)) {
          if (prop === 'length') return obj.length;
          if (typeof prop === 'number') return obj[prop];
          if (['push', 'map', 'filter', 'forEach'].includes(prop)) return { __isMethod: true, object: obj, method: prop };
        }
        if (obj && typeof obj === 'object' && !isFn(obj) && !isPromise(obj)) return obj[prop];
        return undefined;
      }
      case 'CallExpression': return evalCall(node, env);
      case 'ArrowFunctionExpression':
      case 'FunctionExpression': {
        const fn: FnObj = { __isFn: true, name: node.id?.name || 'anonymous', params: node.params.map((p: ASTNode) => p.name), body: node.body, closureEnv: env };
        return fn;
      }
      case 'TemplateLiteral': {
        let r = '';
        for (let i = 0; i < node.quasis.length; i++) {
          r += node.quasis[i].value.cooked;
          if (i < node.expressions.length) r += String(evalExpr(node.expressions[i], env));
        }
        return r;
      }
      default: return undefined;
    }
  }

  function evalCall(node: ASTNode, env: Env): any {
    const line = node.loc?.start.line ?? 0;

    // console.log
    if (node.callee.type === 'MemberExpression' && node.callee.object.type === 'Identifier' && node.callee.object.name === 'console') {
      const args = node.arguments.map((a: ASTNode) => evalExpr(a, env));
      snap(line, `console.log(${args.map(display).join(', ')})`, envStack[envStack.length - 1].id);
      return undefined;
    }

    // Method calls (.then, .map, etc)
    if (node.callee.type === 'MemberExpression') {
      const member = evalExpr(node.callee, env);
      if (member && member.__isMethod) {
        const args = node.arguments.map((a: ASTNode) => evalExpr(a, env));
        return handleMethod(member.object, member.method, args, line, env);
      }
    }

    // setTimeout
    if (node.callee.type === 'Identifier' && node.callee.name === 'setTimeout') {
      const args = node.arguments.map((a: ASTNode) => evalExpr(a, env));
      const cb = args[0];
      if (isFn(cb)) {
        callbackQueue.push({ fn: cb, args: [], label: `setTimeout(${cb.name})`, queueType: 'callback' });
        snap(line, `setTimeout called — ${cb.name} added to Callback Queue`);
      }
      return undefined;
    }

    const callee = evalExpr(node.callee, env);
    if (!isFn(callee)) return undefined;

    const args = node.arguments.map((a: ASTNode) => evalExpr(a, env));
    return callFn(callee, args, line);
  }

  function handleMethod(obj: any, method: string, args: any[], line: number, _env: Env): any {
    if (isPromise(obj) && method === 'then') {
      const cb = args[0];
      if (isFn(cb)) {
        if (obj.status === 'resolved') {
          microtaskQueue.push({ fn: cb, args: [obj.resolvedValue], label: `.then(${cb.name})`, queueType: 'microtask' });
          snap(line, `Promise resolved — .then(${cb.name}) added to Microtask Queue`);
        }
      }
      return { __isPromise: true, status: 'pending', resolvedValue: undefined } as PromiseObj;
    }
    if (Array.isArray(obj)) {
      if (method === 'push') { obj.push(...args); return obj.length; }
      if (method === 'map' && isFn(args[0])) {
        const fn = args[0];
        return obj.map((el: any, i: number) => callFn(fn, [el, i], line));
      }
      if (method === 'filter' && isFn(args[0])) {
        const fn = args[0];
        return obj.filter((el: any, i: number) => callFn(fn, [el, i], line));
      }
      if (method === 'forEach' && isFn(args[0])) {
        const fn = args[0];
        obj.forEach((el: any, i: number) => callFn(fn, [el, i], line));
        return undefined;
      }
    }
    return undefined;
  }

  function callFn(fn: FnObj, args: any[], line: number): any {
    const fnEnv = new Env(`${fn.name}()`, nextId(), fn.closureEnv);
    fn.params.forEach((p, i) => fnEnv.define(p, args[i] !== undefined ? args[i] : undefined));

    envStack.push(fnEnv);
    callStack.push({ id: fnEnv.id, label: `${fn.name}()` });
    snap(line, `Calling ${fn.name}() — new execution context created`, fnEnv.id);

    let result: any;
    if (fn.body.type === 'BlockStatement') {
      result = execBlock(fn.body.body, fnEnv);
    } else {
      result = evalExpr(fn.body, fnEnv);
    }

    envStack.pop();
    callStack.pop();
    snap(line, `${fn.name}() finished — returning ${display(result)}`);
    return result;
  }

  function execBlock(stmts: ASTNode[], env: Env): any {
    for (const stmt of stmts) {
      const val = execStmt(stmt, env);
      if (val && (val as ReturnSignal).__isReturn) return (val as ReturnSignal).value;
    }
    return undefined;
  }

  function execStmt(node: ASTNode, env: Env): any {
    if (!node) return undefined;
    const line = node.loc?.start.line ?? 0;

    switch (node.type) {
      case 'VariableDeclaration': {
        for (const decl of node.declarations) {
          const name = decl.id.name;
          if (decl.init && decl.init.type === 'NewExpression' && decl.init.callee?.name === 'Promise') {
            const promiseObj = handleNewPromise(decl.init, env, line);
            env.define(name, promiseObj);
            snap(line, `Declaring ${name} — storing Promise`, env.id);
            continue;
          }
          const val = decl.init ? evalExpr(decl.init, env) : undefined;
          env.define(name, val);
          snap(line, isFn(val) ? `Declaring ${name} — storing function` : `Declaring ${name} = ${display(val)}`, env.id);
        }
        return undefined;
      }

      case 'FunctionDeclaration': {
        const name = node.id.name;
        const fn: FnObj = { __isFn: true, name, params: node.params.map((p: ASTNode) => p.name), body: node.body, closureEnv: env };
        env.define(name, fn);
        snap(line, `Declaring function ${name}`, env.id);
        return undefined;
      }

      case 'ExpressionStatement': {
        const expr = node.expression;
        if (expr.type === 'CallExpression') {
          evalCall(expr, env);
        } else if (expr.type === 'AssignmentExpression') {
          const val = evalExpr(expr, env);
          const name = expr.left.name || '?';
          snap(line, `Assigning ${name} = ${display(val)}`, env.id);
        } else {
          evalExpr(expr, env);
        }
        return undefined;
      }

      case 'ReturnStatement': {
        const val = evalExpr(node.argument, env);
        snap(line, `Returning ${display(val)}`, env.id);
        return { __isReturn: true, value: val } as ReturnSignal;
      }

      case 'IfStatement': {
        const test = evalExpr(node.test, env);
        snap(line, `Checking condition — ${test ? 'true' : 'false'}`, env.id);
        if (test) {
          return node.consequent.type === 'BlockStatement' ? execBlock(node.consequent.body, env) : execStmt(node.consequent, env);
        } else if (node.alternate) {
          return node.alternate.type === 'BlockStatement' ? execBlock(node.alternate.body, env) : execStmt(node.alternate, env);
        }
        return undefined;
      }

      case 'ForStatement': {
        if (node.init) execStmt(node.init, env);
        for (let i = 0; i < 100; i++) {
          if (node.test && !evalExpr(node.test, env)) {
            snap(line, `For loop ended`, env.id);
            break;
          }
          snap(line, `For loop — iteration ${i + 1}`, env.id);
          const res = node.body.type === 'BlockStatement' ? execBlock(node.body.body, env) : execStmt(node.body, env);
          if (res && (res as ReturnSignal).__isReturn) return res;
          if (node.update) evalExpr(node.update, env);
        }
        return undefined;
      }

      case 'WhileStatement': {
        for (let i = 0; i < 100; i++) {
          if (!evalExpr(node.test, env)) { snap(line, `While loop ended`, env.id); break; }
          snap(line, `While loop — iteration ${i + 1}`, env.id);
          const res = node.body.type === 'BlockStatement' ? execBlock(node.body.body, env) : execStmt(node.body, env);
          if (res && (res as ReturnSignal).__isReturn) return res;
        }
        return undefined;
      }

      case 'BlockStatement': return execBlock(node.body, env);

      default: return undefined;
    }
  }

  function handleNewPromise(node: ASTNode, env: Env, line: number): PromiseObj {
    const promiseObj: PromiseObj = { __isPromise: true, status: 'pending', resolvedValue: undefined };
    const executorArg = node.arguments[0];
    if (!executorArg) return promiseObj;

    const executor = evalExpr(executorArg, env);
    if (!isFn(executor)) return promiseObj;

    const resolveFn: FnObj = {
      __isFn: true,
      name: 'resolve',
      params: ['value'],
      body: { type: 'BlockStatement', body: [] },
      closureEnv: env,
    };
    (resolveFn as any).__resolveTarget = promiseObj;

    snap(line, 'Creating new Promise — running executor');

    const executorEnv = new Env(`${executor.name}()`, nextId(), executor.closureEnv);
    executorEnv.define(executor.params[0], resolveFn);

    envStack.push(executorEnv);
    callStack.push({ id: executorEnv.id, label: `${executor.name}()` });
    snap(line, `Calling ${executor.name}() — executor function`, executorEnv.id);

    if (executor.body.type === 'BlockStatement') {
      for (const stmt of executor.body.body) {
        if (stmt.type === 'ExpressionStatement' && stmt.expression.type === 'CallExpression') {
          const callee = stmt.expression.callee;
          if (callee.type === 'Identifier') {
            const fn = executorEnv.get(callee.name);
            if (isFn(fn) && (fn as any).__resolveTarget) {
              const args = stmt.expression.arguments.map((a: ASTNode) => evalExpr(a, executorEnv));
              const target = (fn as any).__resolveTarget as PromiseObj;
              target.status = 'resolved';
              target.resolvedValue = args[0];
              snap(stmt.loc?.start.line ?? line, `resolve(${display(args[0])}) — Promise fulfilled`, executorEnv.id);
              continue;
            }
          }
        }
        execStmt(stmt, executorEnv);
      }
    }

    envStack.pop();
    callStack.pop();
    snap(line, `${executor.name}() finished`);
    return promiseObj;
  }

  // === Main execution ===
  snap(1, 'Starting execution — Global Execution Context created', globalEnv.id);

  const program = ast as any;
  if (program.body) {
    for (const stmt of program.body) {
      execStmt(stmt, globalEnv);
    }
  }

  // Event loop drain
  if (microtaskQueue.length > 0 || callbackQueue.length > 0) {
    snap(0, 'All synchronous code complete — checking Event Loop', undefined, 'event-loop-check');

    while (microtaskQueue.length > 0) {
      const task = microtaskQueue.shift()!;
      snap(0, `Dequeuing microtask: ${task.label}`, undefined, 'dequeue-microtask');
      callFn(task.fn, task.args, 0);
    }

    while (callbackQueue.length > 0) {
      const task = callbackQueue.shift()!;
      snap(0, `Dequeuing callback: ${task.label}`, undefined, 'dequeue-callback');
      callFn(task.fn, task.args, 0);

      while (microtaskQueue.length > 0) {
        const mt = microtaskQueue.shift()!;
        snap(0, `Dequeuing microtask: ${mt.label}`, undefined, 'dequeue-microtask');
        callFn(mt.fn, mt.args, 0);
      }
    }
  }

  snap(0, 'Execution complete');
  return snapshots;
}

function binOp(op: string, l: any, r: any): any {
  switch (op) {
    case '+': return l + r; case '-': return l - r; case '*': return l * r;
    case '/': return l / r; case '%': return l % r; case '**': return l ** r;
    case '===': return l === r; case '!==': return l !== r;
    case '==': return l == r; case '!=': return l != r;
    case '<': return l < r; case '>': return l > r;
    case '<=': return l <= r; case '>=': return l >= r;
    case '&&': return l && r; case '||': return l || r; case '??': return l ?? r;
    default: return undefined;
  }
}

function unOp(op: string, a: any): any {
  switch (op) {
    case '-': return -a; case '+': return +a; case '!': return !a;
    case 'typeof': return typeof a;
    default: return undefined;
  }
}
