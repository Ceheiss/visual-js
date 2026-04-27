# JS Visualizer — The Hard Parts

(This is all Claude, it is a learning tool, I just prompted)

Interactive tools for understanding JavaScript from the inside out. Step through code visually the way Will Sentance, Kyle Simpson, and Philip Roberts teach it.

## Tools

| Route | Tool | Inspired By |
|---|---|---|
| `/execution` | **Execution Context Visualizer** | Will Sentance |
| `/scope` | **Scope Chain Visualizer** | Kyle Simpson |
| `/this` | **`this` Binding Visualizer** | Kyle Simpson |
| `/prototype` | **Prototype Chain Visualizer** | Kyle Simpson |
| `/recursion` | **Recursion Tree Visualizer** | Classic CS |
| `/event-loop` | **Event Loop Simulator** | Philip Roberts |
| `/ui-hard-parts` | **UI Hard Parts** | Will Sentance |
| `/server` | **Server Hard Parts** | Will Sentance |

### Execution Context Visualizer

Step through JavaScript line by line. See the global and local execution contexts with their memory (variable environment), the call stack, closures with `[[scope]]` backpacks, and the event loop draining callback and microtask queues.

### Scope Chain Visualizer

Kyle Simpson's marble & bucket metaphor. Nested colored scope bubbles show which variables belong to which scope. Toggle between the compilation pass (marbles dropped into buckets) and execution pass (marbles looked up in buckets). Handles `var` hoisting, `let`/`const` block scope, and shadowing.

### `this` Binding Visualizer

Finds every call site in your code and determines which of Kyle Simpson's 4 rules applies, in priority order: **new** > **explicit** (`call`/`apply`/`bind`) > **implicit** (`obj.fn()`) > **default** (`fn()`). Each call site shows a color-coded decision tree.

### Prototype Chain Visualizer

Trace `__proto__` links and delegation chains. See how `Object.create`, constructor functions with `new`, and ES6 classes create prototype relationships. Click a property lookup to watch the chain walk animate from object to object.

### Recursion Tree Visualizer

Watch recursive calls branch into a tree. Step through execution and see the call stack grow as the tree expands, then unwind as base cases return. Supports fibonacci, factorial, and custom recursive functions.

### Event Loop Simulator

Philip Roberts' Loupe-style 5-column layout: source code, call stack, Web APIs, microtask queue, and callback queue. Watch tasks flow between columns following the event loop rules — microtasks drain before the next callback.

### UI Hard Parts

See the JS/C++ boundary in the browser. When JavaScript calls `document.querySelector` or sets `el.style.color`, the visualization shows the call crossing from the V8 engine into the browser's C++ DOM, CSSOM, and render pipeline (render tree, layout, paint). Pre-authored examples cover DOM access, styling, event listeners, and DOM manipulation.

### Server Hard Parts

Visualize the Node.js three-layer architecture: V8 (JavaScript) on top, C++ / libuv in the middle, and the OS kernel at the bottom. Step through `fs.readFile`, `http.createServer`, and `setTimeout` to see how each call flows from JS through libuv's thread pool down to the operating system, and how callbacks flow back up through the event loop phases.

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) to see the home page with links to all tools.

## Tech Stack

- React 18 + TypeScript + Vite
- [acorn](https://github.com/acornjs/acorn) for JavaScript parsing
- [CodeMirror 6](https://codemirror.net/) for syntax-highlighted code editing
- [Framer Motion](https://www.framer.com/motion/) for animations
- CSS Modules for scoped styling

## Architecture

Most visualizers follow this pattern:

1. **Parser** — `acorn` parses the user's code into an AST
2. **Analyzer / Interpreter** — walks the AST and produces a data structure specific to the concept (snapshots for execution, scope trees, call site lists, prototype graphs, recursion trees, event loop states)
3. **Visualization** — React components render the data with animations
4. **Step controls** — pre-computed snapshots let you scrub forward and backward through execution

The UI Hard Parts and Server Hard Parts pages use a different approach: **pre-authored step sequences** (animated architecture diagrams) rather than dynamic code analysis, since they visualize browser/OS internals that can't be inferred from JavaScript ASTs alone.

All pages are lazy-loaded for fast initial page load.
