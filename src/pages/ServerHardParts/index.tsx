import { useState, useCallback, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CodeEditor } from '../../components/CodeEditor/CodeEditor';
import styles from './ServerHardParts.module.css';

// ── Types ───────────────────────────────────────────────────

interface ServerStep {
  line: number;
  description: string;
  callStack: string[];
  memory: { name: string; value: string; isNew?: boolean }[];
  activeModule: 'fs' | 'http' | 'timers' | null;
  threadPool: ('idle' | 'busy' | 'done')[];
  threadPoolLabels: string[];
  eventLoopPhase: 'timers' | 'io' | 'idle' | 'poll' | 'check' | 'close' | null;
  osActivity: { area: 'fs' | 'network'; label: string }[];
  callbackQueue: string[];
  arrow?: { from: 'js' | 'cpp' | 'os'; to: 'js' | 'cpp' | 'os'; label: string } | null;
}

interface Example {
  name: string;
  code: string;
  steps: ServerStep[];
}

// ── Step Data ───────────────────────────────────────────────

const EXAMPLES: Example[] = [
  {
    name: 'fs.readFile',
    code: `function onData(err, data) {
  const parsed = data.toString();
  console.log(parsed);
}

fs.readFile('/file.txt', onData);

console.log('I happen first!');`,
    steps: [
      {
        line: 1,
        description: 'Global execution context created. Function onData is declared and stored in memory.',
        callStack: ['global()'],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)', isNew: true }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 6,
        description: 'fs.readFile(\'/file.txt\', onData) is called. This is a Node facade — it looks like JS but will cross into C++.',
        callStack: ['global()', 'fs.readFile()'],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)' }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
        arrow: { from: 'js', to: 'cpp', label: 'Calling Node C++ fs module' },
      },
      {
        line: 6,
        description: 'The C++ fs module receives the request. It activates and prepares to delegate the work to the thread pool.',
        callStack: ['global()', 'fs.readFile()'],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)' }],
        activeModule: 'fs',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 6,
        description: 'libuv assigns a thread from the pool. Thread 1 begins reading the file.',
        callStack: ['global()', 'fs.readFile()'],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)' }],
        activeModule: 'fs',
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /file.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 6,
        description: 'The thread delegates the actual I/O to the operating system\'s file system.',
        callStack: ['global()', 'fs.readFile()'],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)' }],
        activeModule: 'fs',
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /file.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [{ area: 'fs', label: 'Reading /file.txt...' }],
        callbackQueue: [],
        arrow: { from: 'cpp', to: 'os', label: 'Thread delegates to OS file system' },
      },
      {
        line: 8,
        description: 'fs.readFile returns immediately (non-blocking!). JS doesn\'t wait. console.log(\'I happen first!\') runs.',
        callStack: ['global()', 'console.log()'],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)' }],
        activeModule: 'fs',
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /file.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [{ area: 'fs', label: 'Reading /file.txt...' }],
        callbackQueue: [],
      },
      {
        line: 8,
        description: 'Console prints "I happen first!" — synchronous code always runs before async callbacks. Global code finishes.',
        callStack: [],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)' }],
        activeModule: 'fs',
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /file.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [{ area: 'fs', label: 'Reading /file.txt...' }],
        callbackQueue: [],
      },
      {
        line: 8,
        description: 'OS completes the file read. Data flows back up to libuv.',
        callStack: [],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)' }],
        activeModule: 'fs',
        threadPool: ['done', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /file.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
        arrow: { from: 'os', to: 'cpp', label: 'Read complete, data returned' },
      },
      {
        line: 8,
        description: 'Thread 1 is done. The onData callback is placed on the callback queue, waiting for the event loop.',
        callStack: [],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)' }],
        activeModule: 'fs',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: ['onData'],
      },
      {
        line: 8,
        description: 'Event loop enters the I/O Callbacks phase. It finds onData in the queue.',
        callStack: [],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)' }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: 'io',
        osActivity: [],
        callbackQueue: ['onData'],
      },
      {
        line: 1,
        description: 'Event loop delivers the callback to JavaScript. onData is pushed onto the call stack.',
        callStack: ['onData(err, data)'],
        memory: [
          { name: 'onData', value: 'ƒ onData(err, data)' },
          { name: 'err', value: 'null', isNew: true },
          { name: 'data', value: '<Buffer ...>', isNew: true },
        ],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: 'io',
        osActivity: [],
        callbackQueue: [],
        arrow: { from: 'cpp', to: 'js', label: 'Callback delivered to JS' },
      },
      {
        line: 2,
        description: 'Inside onData: parsed = data.toString(). The file content is converted to a string.',
        callStack: ['onData(err, data)'],
        memory: [
          { name: 'onData', value: 'ƒ onData(err, data)' },
          { name: 'err', value: 'null' },
          { name: 'data', value: '<Buffer ...>' },
          { name: 'parsed', value: '"file contents"', isNew: true },
        ],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 3,
        description: 'console.log(parsed) outputs the file contents. onData completes and pops off the stack.',
        callStack: [],
        memory: [{ name: 'onData', value: 'ƒ onData(err, data)' }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
    ],
  },
  {
    name: 'http.createServer',
    code: `function handleReq(req, res) {
  res.end('Hello!');
}

const server = http.createServer(handleReq);

server.listen(80);

// ... incoming request arrives ...`,
    steps: [
      {
        line: 1,
        description: 'Global context. handleReq function declared in memory.',
        callStack: ['global()'],
        memory: [{ name: 'handleReq', value: 'ƒ handleReq(req, res)', isNew: true }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 5,
        description: 'http.createServer(handleReq) is called. This sets up a TCP socket in the C++ http/net module.',
        callStack: ['global()', 'http.createServer()'],
        memory: [{ name: 'handleReq', value: 'ƒ handleReq(req, res)' }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
        arrow: { from: 'js', to: 'cpp', label: 'Setting up HTTP server in C++' },
      },
      {
        line: 5,
        description: 'C++ http/net module activates. A TCP socket is created and handleReq is registered as the callback.',
        callStack: ['global()'],
        memory: [
          { name: 'handleReq', value: 'ƒ handleReq(req, res)' },
          { name: 'server', value: 'Server { ... }', isNew: true },
        ],
        activeModule: 'http',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 7,
        description: 'server.listen(80) tells the OS kernel to start accepting connections on port 80.',
        callStack: ['global()', 'server.listen()'],
        memory: [
          { name: 'handleReq', value: 'ƒ handleReq(req, res)' },
          { name: 'server', value: 'Server { ... }' },
        ],
        activeModule: 'http',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
        arrow: { from: 'cpp', to: 'os', label: 'Bind to port 80, start listening' },
      },
      {
        line: 7,
        description: 'OS network layer is now listening on port 80. JS call stack is empty — Node waits via the event loop.',
        callStack: [],
        memory: [
          { name: 'handleReq', value: 'ƒ handleReq(req, res)' },
          { name: 'server', value: 'Server { ... }' },
        ],
        activeModule: 'http',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: 'poll',
        osActivity: [{ area: 'network', label: 'Listening on :80' }],
        callbackQueue: [],
      },
      {
        line: 9,
        description: 'An HTTP request arrives at the OS! This is "auto-run" — JavaScript did NOT trigger this. The OS sends it up.',
        callStack: [],
        memory: [
          { name: 'handleReq', value: 'ƒ handleReq(req, res)' },
          { name: 'server', value: 'Server { ... }' },
        ],
        activeModule: 'http',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: 'poll',
        osActivity: [
          { area: 'network', label: 'Listening on :80' },
          { area: 'network', label: 'Incoming request! GET /' },
        ],
        callbackQueue: [],
        arrow: { from: 'os', to: 'cpp', label: 'Incoming connection data' },
      },
      {
        line: 9,
        description: 'libuv receives the connection in the Poll phase. It wraps the data in req/res objects and queues the callback.',
        callStack: [],
        memory: [
          { name: 'handleReq', value: 'ƒ handleReq(req, res)' },
          { name: 'server', value: 'Server { ... }' },
        ],
        activeModule: 'http',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: 'poll',
        osActivity: [{ area: 'network', label: 'Listening on :80' }],
        callbackQueue: ['handleReq'],
      },
      {
        line: 1,
        description: 'Event loop delivers handleReq to the JS call stack with req and res objects.',
        callStack: ['handleReq(req, res)'],
        memory: [
          { name: 'handleReq', value: 'ƒ handleReq(req, res)' },
          { name: 'server', value: 'Server { ... }' },
          { name: 'req', value: 'IncomingMessage { ... }', isNew: true },
          { name: 'res', value: 'ServerResponse { ... }', isNew: true },
        ],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [{ area: 'network', label: 'Listening on :80' }],
        callbackQueue: [],
        arrow: { from: 'cpp', to: 'js', label: 'Callback delivered to JS' },
      },
      {
        line: 2,
        description: 'res.end(\'Hello!\') sends the response back through C++ to the OS network layer. handleReq completes.',
        callStack: ['handleReq(req, res)', 'res.end()'],
        memory: [
          { name: 'handleReq', value: 'ƒ handleReq(req, res)' },
          { name: 'server', value: 'Server { ... }' },
        ],
        activeModule: 'http',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [{ area: 'network', label: 'Listening on :80' }],
        callbackQueue: [],
        arrow: { from: 'js', to: 'os', label: 'Sending "Hello!" response' },
      },
      {
        line: 9,
        description: 'Response sent. Call stack empty. Server continues listening — event loop keeps running in poll phase.',
        callStack: [],
        memory: [
          { name: 'handleReq', value: 'ƒ handleReq(req, res)' },
          { name: 'server', value: 'Server { ... }' },
        ],
        activeModule: 'http',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: 'poll',
        osActivity: [{ area: 'network', label: 'Listening on :80' }],
        callbackQueue: [],
      },
    ],
  },
  {
    name: 'setTimeout',
    code: `function sayHi() {
  console.log('Hi!');
}

setTimeout(sayHi, 1000);

console.log('Waiting...');

// ... 1000ms later ...`,
    steps: [
      {
        line: 1,
        description: 'Global context. sayHi function declared in memory.',
        callStack: ['global()'],
        memory: [{ name: 'sayHi', value: 'ƒ sayHi()', isNew: true }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 5,
        description: 'setTimeout(sayHi, 1000) is called. This is NOT a JS feature — it\'s a Node/C++ timer binding.',
        callStack: ['global()', 'setTimeout()'],
        memory: [{ name: 'sayHi', value: 'ƒ sayHi()' }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
        arrow: { from: 'js', to: 'cpp', label: 'Register timer in C++ timers module' },
      },
      {
        line: 5,
        description: 'C++ timers module activates. A timer is set for 1000ms with sayHi as the callback.',
        callStack: ['global()'],
        memory: [{ name: 'sayHi', value: 'ƒ sayHi()' }],
        activeModule: 'timers',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 7,
        description: 'setTimeout returns immediately. console.log(\'Waiting...\') runs synchronously.',
        callStack: ['global()', 'console.log()'],
        memory: [{ name: 'sayHi', value: 'ƒ sayHi()' }],
        activeModule: 'timers',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 7,
        description: '"Waiting..." printed. Global code done. Call stack empty. JS waits while C++ timer counts down.',
        callStack: [],
        memory: [{ name: 'sayHi', value: 'ƒ sayHi()' }],
        activeModule: 'timers',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 9,
        description: '1000ms passes. C++ timer expires. sayHi callback is placed on the callback queue.',
        callStack: [],
        memory: [{ name: 'sayHi', value: 'ƒ sayHi()' }],
        activeModule: 'timers',
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: ['sayHi'],
      },
      {
        line: 9,
        description: 'Event loop enters the Timers phase. It finds sayHi ready to fire.',
        callStack: [],
        memory: [{ name: 'sayHi', value: 'ƒ sayHi()' }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: 'timers',
        osActivity: [],
        callbackQueue: ['sayHi'],
      },
      {
        line: 1,
        description: 'Event loop delivers sayHi to JavaScript. It\'s pushed onto the call stack.',
        callStack: ['sayHi()'],
        memory: [{ name: 'sayHi', value: 'ƒ sayHi()' }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: 'timers',
        osActivity: [],
        callbackQueue: [],
        arrow: { from: 'cpp', to: 'js', label: 'Timer callback delivered' },
      },
      {
        line: 2,
        description: 'console.log(\'Hi!\') runs inside sayHi. "Hi!" is printed. sayHi completes.',
        callStack: ['sayHi()', 'console.log()'],
        memory: [{ name: 'sayHi', value: 'ƒ sayHi()' }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 9,
        description: 'Call stack empty. No more timers, no I/O, no listeners — Node process exits.',
        callStack: [],
        memory: [{ name: 'sayHi', value: 'ƒ sayHi()' }],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
    ],
  },
  {
    name: 'Multiple Async',
    code: `function onFile(err, data) {
  console.log('File:', data.toString());
}

function onTimer() {
  console.log('Timer!');
}

fs.readFile('/data.txt', onFile);
setTimeout(onTimer, 0);

console.log('Sync done');

// ... event loop processes ...`,
    steps: [
      {
        line: 1,
        description: 'Global context. onFile and onTimer functions declared in memory.',
        callStack: ['global()'],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)', isNew: true },
          { name: 'onTimer', value: 'ƒ onTimer()', isNew: true },
        ],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
      {
        line: 9,
        description: 'fs.readFile(\'/data.txt\', onFile) — crosses into C++ fs module.',
        callStack: ['global()', 'fs.readFile()'],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
        arrow: { from: 'js', to: 'cpp', label: 'Calling Node C++ fs module' },
      },
      {
        line: 9,
        description: 'C++ fs module activates. Thread 1 assigned to read /data.txt. Delegated to OS.',
        callStack: ['global()'],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: 'fs',
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /data.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [{ area: 'fs', label: 'Reading /data.txt...' }],
        callbackQueue: [],
      },
      {
        line: 10,
        description: 'setTimeout(onTimer, 0) — crosses into C++ timers module. 0ms delay, but still async!',
        callStack: ['global()', 'setTimeout()'],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: null,
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /data.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [{ area: 'fs', label: 'Reading /data.txt...' }],
        callbackQueue: [],
        arrow: { from: 'js', to: 'cpp', label: 'Register timer in C++ timers' },
      },
      {
        line: 10,
        description: 'C++ timers module activates. Timer set for 0ms — it expires immediately but callback waits for event loop.',
        callStack: ['global()'],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: 'timers',
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /data.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [{ area: 'fs', label: 'Reading /data.txt...' }],
        callbackQueue: [],
      },
      {
        line: 12,
        description: 'console.log(\'Sync done\') runs. Synchronous code always completes first!',
        callStack: ['global()', 'console.log()'],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: 'timers',
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /data.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [{ area: 'fs', label: 'Reading /data.txt...' }],
        callbackQueue: [],
      },
      {
        line: 12,
        description: '"Sync done" printed. Call stack empty. Event loop begins. Timer already expired, file still reading.',
        callStack: [],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: 'timers',
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /data.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [{ area: 'fs', label: 'Reading /data.txt...' }],
        callbackQueue: ['onTimer'],
      },
      {
        line: 14,
        description: 'Event loop: Timers phase first! onTimer (setTimeout 0) is ready. Timers phase always runs before I/O.',
        callStack: [],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: null,
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /data.txt', '', '', ''],
        eventLoopPhase: 'timers',
        osActivity: [{ area: 'fs', label: 'Reading /data.txt...' }],
        callbackQueue: ['onTimer'],
      },
      {
        line: 5,
        description: 'onTimer delivered to JS call stack. console.log(\'Timer!\') runs. "Timer!" printed.',
        callStack: ['onTimer()', 'console.log()'],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: null,
        threadPool: ['busy', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /data.txt', '', '', ''],
        eventLoopPhase: 'timers',
        osActivity: [{ area: 'fs', label: 'Reading /data.txt...' }],
        callbackQueue: [],
        arrow: { from: 'cpp', to: 'js', label: 'Timer callback delivered' },
      },
      {
        line: 14,
        description: 'onTimer done. File read completes in OS. Data flows back through libuv.',
        callStack: [],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: 'fs',
        threadPool: ['done', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['read /data.txt', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: ['onFile'],
        arrow: { from: 'os', to: 'cpp', label: 'File read complete' },
      },
      {
        line: 14,
        description: 'Event loop: I/O Callbacks phase. onFile callback is ready.',
        callStack: [],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: 'io',
        osActivity: [],
        callbackQueue: ['onFile'],
      },
      {
        line: 1,
        description: 'onFile delivered to JS. data.toString() runs. "File: ..." is printed.',
        callStack: ['onFile(err, data)', 'console.log()'],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
          { name: 'data', value: '<Buffer ...>', isNew: true },
        ],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: 'io',
        osActivity: [],
        callbackQueue: [],
        arrow: { from: 'cpp', to: 'js', label: 'I/O callback delivered' },
      },
      {
        line: 14,
        description: 'All done. Both async operations complete. Order: "Sync done" → "Timer!" → "File: ..." — event loop phase ordering matters!',
        callStack: [],
        memory: [
          { name: 'onFile', value: 'ƒ onFile(err, data)' },
          { name: 'onTimer', value: 'ƒ onTimer()' },
        ],
        activeModule: null,
        threadPool: ['idle', 'idle', 'idle', 'idle'],
        threadPoolLabels: ['', '', '', ''],
        eventLoopPhase: null,
        osActivity: [],
        callbackQueue: [],
      },
    ],
  },
];

const EVENT_LOOP_PHASES = [
  { id: 'timers', label: 'Timers' },
  { id: 'io', label: 'I/O Callbacks' },
  { id: 'idle', label: 'Idle' },
  { id: 'poll', label: 'Poll' },
  { id: 'check', label: 'Check' },
  { id: 'close', label: 'Close' },
];

// ── Arrow Overlay ───────────────────────────────────────────

function ArrowOverlay({ arrow }: { arrow: NonNullable<ServerStep['arrow']> }) {
  const layerY: Record<string, number> = { js: 0, cpp: 1, os: 2 };
  const fromY = layerY[arrow.from];
  const toY = layerY[arrow.to];
  const goingDown = toY > fromY;

  const y1 = goingDown ? '12%' : '88%';
  const y2 = goingDown ? '88%' : '12%';

  const topPercent = Math.min(fromY, toY);
  const layerTop = topPercent === 0 ? '0%' : topPercent === 1 ? '40%' : '75%';
  const layerHeight = Math.abs(toY - fromY) === 2 ? '100%' : Math.abs(toY - fromY) === 1 ? (topPercent === 0 ? '55%' : '60%') : '30%';

  return (
    <motion.div
      className={styles.arrowOverlay}
      style={{ top: layerTop, height: layerHeight }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <svg width="100%" height="100%" className={styles.arrowSvg}>
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="var(--accent-yellow)" />
          </marker>
        </defs>
        <motion.line
          x1="50%"
          y1={y1}
          x2="50%"
          y2={y2}
          stroke="var(--accent-yellow)"
          strokeWidth="2"
          strokeDasharray="8 4"
          markerEnd="url(#arrowhead)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.6, ease: 'easeInOut' }}
        />
      </svg>
      <motion.div
        className={styles.arrowLabel}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.3, duration: 0.3 }}
      >
        {arrow.label}
      </motion.div>
    </motion.div>
  );
}

// ── Main Component ──────────────────────────────────────────

export default function ServerHardParts() {
  const [exampleIdx, setExampleIdx] = useState(0);
  const [stepIdx, setStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1500);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const example = EXAMPLES[exampleIdx];
  const step = example.steps[stepIdx];
  const goTo = useCallback((i: number) => {
    setStepIdx(Math.max(0, Math.min(i, EXAMPLES[exampleIdx].steps.length - 1)));
  }, [exampleIdx]);

  const next = useCallback(() => {
    setStepIdx((s) => {
      const max = EXAMPLES[exampleIdx].steps.length - 1;
      if (s >= max) {
        setPlaying(false);
        return max;
      }
      return s + 1;
    });
  }, [exampleIdx]);

  const prev = useCallback(() => {
    setStepIdx((s) => Math.max(0, s - 1));
  }, []);

  const switchExample = useCallback((i: number) => {
    setExampleIdx(i);
    setStepIdx(0);
    setPlaying(false);
  }, []);

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(next, speed);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, speed, next]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
      if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  return (
    <div className={styles.page}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <Link to="/" className={styles.backLink}>← Home</Link>
        <div className={styles.brand}>
          <span className={styles.title}>Server Hard Parts</span>
          <span className={styles.subtitle}>Will Sentance Style</span>
        </div>
        <div className={styles.examples}>
          {EXAMPLES.map((ex, i) => (
            <button
              key={ex.name}
              className={`${styles.exBtn} ${i === exampleIdx ? styles.exBtnActive : ''}`}
              onClick={() => switchExample(i)}
            >
              {ex.name}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content — Three Layers */}
      <div className={styles.layers}>
        {/* Arrow overlay */}
        <AnimatePresence mode="wait">
          {step.arrow && (
            <ArrowOverlay key={`${stepIdx}-${step.arrow.label}`} arrow={step.arrow} />
          )}
        </AnimatePresence>

        {/* ── JS / V8 Layer ── */}
        <div className={styles.jsLayer}>
          <div className={styles.layerHeader}>
            <span className={styles.layerIcon}>⚙</span>
            JavaScript Engine (V8)
          </div>
          <div className={styles.jsContent}>
            {/* Code Panel */}
            <div className={styles.codePanel}>
              <CodeEditor
                code={example.code}
                highlightLine={step.line}
                readOnly
              />
            </div>

            {/* Call Stack */}
            <div className={styles.callStackPanel}>
              <div className={styles.panelTitle}>Call Stack</div>
              <div className={styles.stackContainer}>
                <AnimatePresence mode="popLayout">
                  {step.callStack.length === 0 ? (
                    <motion.div
                      key="empty"
                      className={styles.stackEmpty}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      exit={{ opacity: 0 }}
                    >
                      empty
                    </motion.div>
                  ) : (
                    [...step.callStack].reverse().map((frame, i) => (
                      <motion.div
                        key={frame + i}
                        className={`${styles.stackFrame} ${i === 0 ? styles.stackFrameTop : ''}`}
                        initial={{ opacity: 0, y: -20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -20, scale: 0.9 }}
                        transition={{ duration: 0.25 }}
                      >
                        {frame}
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Memory */}
            <div className={styles.memoryPanel}>
              <div className={styles.panelTitle}>Memory</div>
              <div className={styles.memoryList}>
                <AnimatePresence>
                  {step.memory.map((m) => (
                    <motion.div
                      key={m.name}
                      className={`${styles.memoryItem} ${m.isNew ? styles.memoryNew : ''}`}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <span className={styles.memName}>{m.name}</span>
                      <span className={styles.memValue}>{m.value}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* ── C++ / libuv Layer ── */}
        <div className={styles.cppLayer}>
          <div className={styles.layerHeader}>
            <span className={styles.layerIcon}>⛓</span>
            Node C++ / libuv
          </div>
          <div className={styles.cppContent}>
            {/* Module boxes */}
            <div className={styles.modulesSection}>
              <div className={styles.panelTitle}>Modules</div>
              <div className={styles.moduleBoxes}>
                {(['fs', 'http', 'timers'] as const).map((mod) => (
                  <motion.div
                    key={mod}
                    className={`${styles.moduleBox} ${step.activeModule === mod ? styles.moduleActive : ''}`}
                    animate={{
                      scale: step.activeModule === mod ? 1.05 : 1,
                      borderColor: step.activeModule === mod ? 'var(--accent-orange)' : 'var(--border-color)',
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    {mod === 'http' ? 'http/net' : mod}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Thread Pool */}
            <div className={styles.threadPoolSection}>
              <div className={styles.panelTitle}>Thread Pool</div>
              <div className={styles.threadSlots}>
                {step.threadPool.map((status, i) => (
                  <motion.div
                    key={i}
                    className={`${styles.threadSlot} ${styles[`thread_${status}`]}`}
                    animate={{
                      scale: status === 'busy' ? [1, 1.03, 1] : 1,
                    }}
                    transition={{
                      duration: 1,
                      repeat: status === 'busy' ? Infinity : 0,
                      ease: 'easeInOut',
                    }}
                  >
                    <span className={styles.threadNum}>T{i + 1}</span>
                    <span className={styles.threadStatus}>{status}</span>
                    {step.threadPoolLabels[i] && (
                      <span className={styles.threadLabel}>{step.threadPoolLabels[i]}</span>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Event Loop */}
            <div className={styles.eventLoopSection}>
              <div className={styles.panelTitle}>Event Loop</div>
              <div className={styles.eventLoopPhases}>
                {EVENT_LOOP_PHASES.map((phase) => (
                  <motion.div
                    key={phase.id}
                    className={`${styles.phaseBox} ${step.eventLoopPhase === phase.id ? styles.phaseActive : ''}`}
                    animate={{
                      scale: step.eventLoopPhase === phase.id ? 1.08 : 1,
                    }}
                    transition={{ duration: 0.3 }}
                  >
                    {phase.label}
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Callback Queue */}
            <div className={styles.callbackQueueSection}>
              <div className={styles.panelTitle}>Callback Queue</div>
              <div className={styles.callbackQueue}>
                <AnimatePresence>
                  {step.callbackQueue.length === 0 ? (
                    <motion.span
                      key="empty-q"
                      className={styles.queueEmpty}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.5 }}
                      exit={{ opacity: 0 }}
                    >
                      empty
                    </motion.span>
                  ) : (
                    step.callbackQueue.map((cb, i) => (
                      <motion.div
                        key={cb + i}
                        className={styles.queueItem}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.25 }}
                      >
                        {cb}
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>

        {/* ── OS Layer ── */}
        <div className={styles.osLayer}>
          <div className={styles.layerHeader}>
            <span className={styles.layerIcon}>🖥</span>
            Operating System
          </div>
          <div className={styles.osContent}>
            <div className={styles.osArea}>
              <div className={styles.osAreaTitle}>File System</div>
              <div className={styles.osAreaBody}>
                <AnimatePresence>
                  {step.osActivity.filter((a) => a.area === 'fs').map((a, i) => (
                    <motion.div
                      key={a.label + i}
                      className={styles.osActivityItem}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                    >
                      {a.label}
                    </motion.div>
                  ))}
                  {step.osActivity.filter((a) => a.area === 'fs').length === 0 && (
                    <motion.span key="idle-fs" className={styles.osIdle} initial={{ opacity: 0 }} animate={{ opacity: 0.4 }}>
                      idle
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <div className={styles.osArea}>
              <div className={styles.osAreaTitle}>Network</div>
              <div className={styles.osAreaBody}>
                <AnimatePresence>
                  {step.osActivity.filter((a) => a.area === 'network').map((a, i) => (
                    <motion.div
                      key={a.label + i}
                      className={styles.osActivityItem}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                    >
                      {a.label}
                    </motion.div>
                  ))}
                  {step.osActivity.filter((a) => a.area === 'network').length === 0 && (
                    <motion.span key="idle-net" className={styles.osIdle} initial={{ opacity: 0 }} animate={{ opacity: 0.4 }}>
                      idle
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Controls */}
      <div className={styles.footer}>
        <div className={styles.stepDescription}>
          <span className={styles.stepBadge}>Step {stepIdx + 1} / {example.steps.length}</span>
          <span className={styles.stepText}>{step.description}</span>
        </div>
        <div className={styles.controls}>
          <button className={styles.ctrlBtn} onClick={prev} disabled={stepIdx === 0}>◀</button>
          <button className={`${styles.ctrlBtn} ${styles.playBtn}`} onClick={() => setPlaying((p) => !p)}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className={styles.ctrlBtn} onClick={next} disabled={stepIdx === example.steps.length - 1}>▶</button>
          <input
            type="range"
            className={styles.timeline}
            min={0}
            max={example.steps.length - 1}
            value={stepIdx}
            onChange={(e) => goTo(Number(e.target.value))}
          />
          <div className={styles.speedControl}>
            <label className={styles.speedLabel}>Speed</label>
            <select
              className={styles.speedSelect}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={3000}>0.5×</option>
              <option value={1500}>1×</option>
              <option value={800}>2×</option>
              <option value={400}>4×</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
