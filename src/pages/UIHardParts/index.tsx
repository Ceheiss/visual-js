import { useState, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CodeEditor } from '../../components/CodeEditor/CodeEditor';
import styles from './UIHardParts.module.css';

// ── Types ───────────────────────────────────────────────────

interface UIStep {
  line: number;
  description: string;
  callStack: string[];
  memory: { name: string; value: string; isNew?: boolean }[];
  domHighlight: string[];
  cssomHighlight: string[];
  renderPipeline: ('idle' | 'active' | 'done')[];
  webAPIs: { id: string; label: string }[];
  callbackQueue: string[];
  microtaskQueue: string[];
  crossingArrow?: 'js-to-cpp' | 'cpp-to-js' | null;
  crossingLabel?: string;
}

interface DOMNode {
  id: string;
  tag: string;
  text?: string;
  className?: string;
  nodeId?: string;
  depth: number;
  children?: DOMNode[];
}

interface CSSOMRule {
  id: string;
  selector: string;
  props: string;
}

interface Example {
  name: string;
  code: string;
  steps: UIStep[];
  dom: DOMNode[];
  cssom: CSSOMRule[];
}

// ── DOM tree data ───────────────────────────────────────────

const STANDARD_DOM: DOMNode[] = [
  { id: 'html', tag: 'html', depth: 0 },
  { id: 'head', tag: 'head', depth: 1 },
  { id: 'body', tag: 'body', depth: 1 },
  { id: 'h1', tag: 'h1', text: 'Title', depth: 2 },
  { id: 'div-box', tag: 'div', className: 'box', depth: 2 },
  { id: 'btn-submit', tag: 'button', nodeId: 'submit', text: 'Submit', depth: 2 },
  { id: 'ul', tag: 'ul', depth: 2 },
  { id: 'li-1', tag: 'li', text: 'Item 1', depth: 3 },
  { id: 'li-2', tag: 'li', text: 'Item 2', depth: 3 },
];

const STANDARD_CSSOM: CSSOMRule[] = [
  { id: 'rule-h1', selector: 'h1', props: 'font-size: 24px; color: #333' },
  { id: 'rule-box', selector: '.box', props: 'width: 100px; background: white' },
  { id: 'rule-submit', selector: '#submit', props: 'padding: 8px 16px' },
  { id: 'rule-ul', selector: 'ul', props: 'list-style: disc' },
];

// ── Example 1: DOM as C++ Object ────────────────────────────

const EX1_CODE = `const heading = document.querySelector('h1');
heading.textContent = 'Hello!';
console.log(heading.textContent);`;

const EX1_STEPS: UIStep[] = [
  {
    line: 0, description: 'Global execution context created. The program is about to run.',
    callStack: ['global()'], memory: [], domHighlight: [], cssomHighlight: [],
    renderPipeline: ['idle', 'idle', 'idle'], webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 1, description: 'document.querySelector(\'h1\') is called. This is a facade function — JS has no DOM!',
    callStack: ['global()', 'document.querySelector()'], memory: [],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'querySelector',
  },
  {
    line: 1, description: 'Crossing into C++ DOM engine. The browser searches its internal C++ DOM tree for an <h1> element.',
    callStack: ['global()', 'document.querySelector()'], memory: [],
    domHighlight: ['h1'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'DOM lookup',
  },
  {
    line: 1, description: 'C++ found the <h1> node. It returns an accessor object — a JS link to the C++ DOM node.',
    callStack: ['global()'], memory: [],
    domHighlight: ['h1'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'cpp-to-js', crossingLabel: 'accessor obj',
  },
  {
    line: 1, description: '`heading` is stored in JS memory. Its value is an accessor — a live link to the C++ DOM <h1> node.',
    callStack: ['global()'],
    memory: [{ name: 'heading', value: 'accessor → DOM <h1>', isNew: true }],
    domHighlight: ['h1'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 2, description: 'heading.textContent = \'Hello!\' — this assignment crosses into C++ to mutate the DOM node.',
    callStack: ['global()', 'set textContent()'],
    memory: [{ name: 'heading', value: 'accessor → DOM <h1>' }],
    domHighlight: ['h1'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'set textContent',
  },
  {
    line: 2, description: 'The C++ DOM node\'s textContent is updated to "Hello!". This triggers the render pipeline.',
    callStack: ['global()'],
    memory: [{ name: 'heading', value: 'accessor → DOM <h1>' }],
    domHighlight: ['h1'], cssomHighlight: [], renderPipeline: ['active', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 2, description: 'Render pipeline: Render Tree built combining DOM + CSSOM, then Layout computes geometry.',
    callStack: ['global()'],
    memory: [{ name: 'heading', value: 'accessor → DOM <h1>' }],
    domHighlight: ['h1'], cssomHighlight: ['rule-h1'], renderPipeline: ['done', 'active', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 2, description: 'Paint: pixels are drawn to the screen. The user now sees "Hello!" in the heading.',
    callStack: ['global()'],
    memory: [{ name: 'heading', value: 'accessor → DOM <h1>' }],
    domHighlight: ['h1'], cssomHighlight: [], renderPipeline: ['done', 'done', 'active'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 3, description: 'console.log reads heading.textContent — crosses into C++ to get the current value.',
    callStack: ['global()', 'console.log()'],
    memory: [{ name: 'heading', value: 'accessor → DOM <h1>' }],
    domHighlight: ['h1'], cssomHighlight: [], renderPipeline: ['done', 'done', 'done'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'get textContent',
  },
  {
    line: 3, description: 'C++ returns "Hello!" → console.log outputs it. Program complete.',
    callStack: ['global()'],
    memory: [{ name: 'heading', value: 'accessor → DOM <h1>' }],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['done', 'done', 'done'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'cpp-to-js', crossingLabel: '"Hello!"',
  },
];

// ── Example 2: Styling and the Render Pipeline ──────────────

const EX2_CODE = `const box = document.querySelector('.box');
box.style.backgroundColor = 'coral';
box.style.width = '200px';
box.style.transform = 'rotate(45deg)';`;

const EX2_STEPS: UIStep[] = [
  {
    line: 0, description: 'Global execution context created.',
    callStack: ['global()'], memory: [], domHighlight: [], cssomHighlight: [],
    renderPipeline: ['idle', 'idle', 'idle'], webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 1, description: 'document.querySelector(\'.box\') — facade function crosses into C++ DOM.',
    callStack: ['global()', 'document.querySelector()'], memory: [],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'querySelector',
  },
  {
    line: 1, description: 'C++ DOM finds div.box and returns an accessor object to JS.',
    callStack: ['global()'],
    memory: [{ name: 'box', value: 'accessor → DOM div.box', isNew: true }],
    domHighlight: ['div-box'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'cpp-to-js', crossingLabel: 'accessor obj',
  },
  {
    line: 2, description: 'box.style.backgroundColor = \'coral\' — crosses into C++ CSSOM to update inline styles.',
    callStack: ['global()', 'set style.backgroundColor()'],
    memory: [{ name: 'box', value: 'accessor → DOM div.box' }],
    domHighlight: ['div-box'], cssomHighlight: ['rule-box'], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'CSSOM update',
  },
  {
    line: 2, description: 'CSSOM updated with backgroundColor: coral. Render pipeline triggers.',
    callStack: ['global()'],
    memory: [{ name: 'box', value: 'accessor → DOM div.box' }],
    domHighlight: ['div-box'], cssomHighlight: ['rule-box'], renderPipeline: ['active', 'active', 'active'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 3, description: 'box.style.width = \'200px\' — another CSSOM mutation via the C++ boundary.',
    callStack: ['global()', 'set style.width()'],
    memory: [{ name: 'box', value: 'accessor → DOM div.box' }],
    domHighlight: ['div-box'], cssomHighlight: ['rule-box'], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'CSSOM update',
  },
  {
    line: 3, description: 'Width changed affects geometry → full pipeline: Render Tree → Layout → Paint.',
    callStack: ['global()'],
    memory: [{ name: 'box', value: 'accessor → DOM div.box' }],
    domHighlight: ['div-box'], cssomHighlight: ['rule-box'], renderPipeline: ['done', 'active', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 3, description: 'Layout recomputed, Paint draws updated box. Width change is visible.',
    callStack: ['global()'],
    memory: [{ name: 'box', value: 'accessor → DOM div.box' }],
    domHighlight: ['div-box'], cssomHighlight: [], renderPipeline: ['done', 'done', 'active'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 4, description: 'box.style.transform = \'rotate(45deg)\' — crosses to C++ CSSOM.',
    callStack: ['global()', 'set style.transform()'],
    memory: [{ name: 'box', value: 'accessor → DOM div.box' }],
    domHighlight: ['div-box'], cssomHighlight: ['rule-box'], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'CSSOM update',
  },
  {
    line: 4, description: 'Transform is compositor-only — skips Layout! Render Tree → Paint directly. This is why transforms are performant.',
    callStack: ['global()'],
    memory: [{ name: 'box', value: 'accessor → DOM div.box' }],
    domHighlight: ['div-box'], cssomHighlight: ['rule-box'], renderPipeline: ['done', 'idle', 'active'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 0, description: 'All style mutations complete. The box is now coral, 200px wide, and rotated 45 degrees.',
    callStack: [], memory: [{ name: 'box', value: 'accessor → DOM div.box' }],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['done', 'done', 'done'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
];

// ── Example 3: Event Listeners ──────────────────────────────

const EX3_CODE = `const btn = document.querySelector('#submit');

function handleClick() {
  const msg = 'Clicked!';
  console.log(msg);
}

btn.addEventListener('click', handleClick);
// ... user clicks the button ...`;

const EX3_STEPS: UIStep[] = [
  {
    line: 0, description: 'Global execution context created.',
    callStack: ['global()'], memory: [], domHighlight: [], cssomHighlight: [],
    renderPipeline: ['idle', 'idle', 'idle'], webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 1, description: 'document.querySelector(\'#submit\') — facade function, crosses to C++.',
    callStack: ['global()', 'document.querySelector()'], memory: [],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'querySelector',
  },
  {
    line: 1, description: 'C++ DOM finds button#submit, returns accessor to JS.',
    callStack: ['global()'],
    memory: [{ name: 'btn', value: 'accessor → DOM button#submit', isNew: true }],
    domHighlight: ['btn-submit'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'cpp-to-js', crossingLabel: 'accessor obj',
  },
  {
    line: 3, description: 'Function handleClick is defined and stored in JS memory. It\'s just a function object — nothing runs yet.',
    callStack: ['global()'],
    memory: [
      { name: 'btn', value: 'accessor → DOM button#submit' },
      { name: 'handleClick', value: 'ƒ handleClick()', isNew: true },
    ],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 8, description: 'btn.addEventListener(\'click\', handleClick) — this is a facade function that crosses into C++ Web APIs.',
    callStack: ['global()', 'addEventListener()'],
    memory: [
      { name: 'btn', value: 'accessor → DOM button#submit' },
      { name: 'handleClick', value: 'ƒ handleClick()' },
    ],
    domHighlight: ['btn-submit'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'addEventListener',
  },
  {
    line: 8, description: 'C++ Web API shelf now holds: on "click" of #submit → call handleClick. The handler lives in C++ until triggered.',
    callStack: ['global()'],
    memory: [
      { name: 'btn', value: 'accessor → DOM button#submit' },
      { name: 'handleClick', value: 'ƒ handleClick()' },
    ],
    domHighlight: ['btn-submit'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [{ id: 'click-handler', label: 'click → handleClick' }],
    callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 0, description: 'Synchronous code complete. Call stack is empty. JS is idle — waiting for events.',
    callStack: [],
    memory: [
      { name: 'btn', value: 'accessor → DOM button#submit' },
      { name: 'handleClick', value: 'ƒ handleClick()' },
    ],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [{ id: 'click-handler', label: 'click → handleClick' }],
    callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 9, description: 'User clicks the button! This is a C++ browser event — nothing to do with JS yet.',
    callStack: [],
    memory: [
      { name: 'btn', value: 'accessor → DOM button#submit' },
      { name: 'handleClick', value: 'ƒ handleClick()' },
    ],
    domHighlight: ['btn-submit'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [{ id: 'click-handler', label: 'click → handleClick' }],
    callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 9, description: 'C++ Web API matches the click to the registered handler. handleClick is pushed to the Callback Queue.',
    callStack: [],
    memory: [
      { name: 'btn', value: 'accessor → DOM button#submit' },
      { name: 'handleClick', value: 'ƒ handleClick()' },
    ],
    domHighlight: ['btn-submit'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [{ id: 'click-handler', label: 'click → handleClick' }],
    callbackQueue: ['handleClick'], microtaskQueue: [],
    crossingArrow: 'cpp-to-js', crossingLabel: 'callback queued',
  },
  {
    line: 9, description: 'Event loop checks: call stack empty? Yes. Dequeues handleClick from Callback Queue → Call Stack.',
    callStack: ['handleClick()'],
    memory: [
      { name: 'btn', value: 'accessor → DOM button#submit' },
      { name: 'handleClick', value: 'ƒ handleClick()' },
    ],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [{ id: 'click-handler', label: 'click → handleClick' }],
    callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 4, description: 'Inside handleClick: const msg = \'Clicked!\' — stored in local memory.',
    callStack: ['handleClick()'],
    memory: [
      { name: 'btn', value: 'accessor → DOM button#submit' },
      { name: 'handleClick', value: 'ƒ handleClick()' },
      { name: 'msg', value: "'Clicked!'", isNew: true },
    ],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [{ id: 'click-handler', label: 'click → handleClick' }],
    callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 5, description: 'console.log(msg) outputs "Clicked!". handleClick completes and is popped off the stack.',
    callStack: ['handleClick()', 'console.log()'],
    memory: [
      { name: 'btn', value: 'accessor → DOM button#submit' },
      { name: 'handleClick', value: 'ƒ handleClick()' },
      { name: 'msg', value: "'Clicked!'" },
    ],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [{ id: 'click-handler', label: 'click → handleClick' }],
    callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 0, description: 'handleClick done. Call stack empty again. Event listener remains registered for future clicks.',
    callStack: [],
    memory: [
      { name: 'btn', value: 'accessor → DOM button#submit' },
      { name: 'handleClick', value: 'ƒ handleClick()' },
    ],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [{ id: 'click-handler', label: 'click → handleClick' }],
    callbackQueue: [], microtaskQueue: [],
  },
];

// ── Example 4: DOM Manipulation and Reflow ──────────────────

const EX4_CODE = `const list = document.querySelector('ul');
const item = document.createElement('li');
item.textContent = 'New item';
list.appendChild(item);`;

const EX4_DOM: DOMNode[] = [
  { id: 'html', tag: 'html', depth: 0 },
  { id: 'head', tag: 'head', depth: 1 },
  { id: 'body', tag: 'body', depth: 1 },
  { id: 'h1', tag: 'h1', text: 'Title', depth: 2 },
  { id: 'div-box', tag: 'div', className: 'box', depth: 2 },
  { id: 'btn-submit', tag: 'button', nodeId: 'submit', text: 'Submit', depth: 2 },
  { id: 'ul', tag: 'ul', depth: 2 },
  { id: 'li-1', tag: 'li', text: 'Item 1', depth: 3 },
  { id: 'li-2', tag: 'li', text: 'Item 2', depth: 3 },
];

const EX4_DOM_WITH_NEW: DOMNode[] = [
  ...EX4_DOM,
  { id: 'li-new', tag: 'li', text: 'New item', depth: 3 },
];

const EX4_STEPS: UIStep[] = [
  {
    line: 0, description: 'Global execution context created.',
    callStack: ['global()'], memory: [], domHighlight: [], cssomHighlight: [],
    renderPipeline: ['idle', 'idle', 'idle'], webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 1, description: 'document.querySelector(\'ul\') — facade function crosses into C++ DOM.',
    callStack: ['global()', 'document.querySelector()'], memory: [],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'querySelector',
  },
  {
    line: 1, description: 'C++ DOM returns accessor for <ul>.',
    callStack: ['global()'],
    memory: [{ name: 'list', value: 'accessor → DOM <ul>', isNew: true }],
    domHighlight: ['ul'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'cpp-to-js', crossingLabel: 'accessor obj',
  },
  {
    line: 2, description: 'document.createElement(\'li\') — another facade function. Creates a NEW node in C++ DOM memory.',
    callStack: ['global()', 'document.createElement()'],
    memory: [{ name: 'list', value: 'accessor → DOM <ul>' }],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'createElement',
  },
  {
    line: 2, description: 'C++ creates a detached <li> node (not in the tree yet!) and returns an accessor.',
    callStack: ['global()'],
    memory: [
      { name: 'list', value: 'accessor → DOM <ul>' },
      { name: 'item', value: 'accessor → DOM <li> (detached)', isNew: true },
    ],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'cpp-to-js', crossingLabel: 'accessor obj',
  },
  {
    line: 3, description: 'item.textContent = \'New item\' — sets text on the detached node in C++. No render since it\'s not in the tree!',
    callStack: ['global()', 'set textContent()'],
    memory: [
      { name: 'list', value: 'accessor → DOM <ul>' },
      { name: 'item', value: 'accessor → DOM <li> (detached)' },
    ],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'set textContent',
  },
  {
    line: 3, description: 'Detached node updated but NO render pipeline triggered — the node isn\'t part of the visible DOM tree yet.',
    callStack: ['global()'],
    memory: [
      { name: 'list', value: 'accessor → DOM <ul>' },
      { name: 'item', value: 'accessor → DOM <li> (detached)' },
    ],
    domHighlight: [], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 4, description: 'list.appendChild(item) — crosses into C++ to attach the <li> to the <ul> in the DOM tree.',
    callStack: ['global()', 'appendChild()'],
    memory: [
      { name: 'list', value: 'accessor → DOM <ul>' },
      { name: 'item', value: 'accessor → DOM <li> (detached)' },
    ],
    domHighlight: ['ul'], cssomHighlight: [], renderPipeline: ['idle', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
    crossingArrow: 'js-to-cpp', crossingLabel: 'appendChild',
  },
  {
    line: 4, description: 'The <li> is now attached to the DOM tree as a child of <ul>. This triggers a full reflow!',
    callStack: ['global()'],
    memory: [
      { name: 'list', value: 'accessor → DOM <ul>' },
      { name: 'item', value: 'accessor → DOM <li>', isNew: true },
    ],
    domHighlight: ['ul', 'li-new'], cssomHighlight: ['rule-ul'],
    renderPipeline: ['active', 'idle', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 4, description: 'Render Tree updated with new node. Layout must recalculate — a new element affects geometry.',
    callStack: ['global()'],
    memory: [
      { name: 'list', value: 'accessor → DOM <ul>' },
      { name: 'item', value: 'accessor → DOM <li>' },
    ],
    domHighlight: ['ul', 'li-new'], cssomHighlight: ['rule-ul'],
    renderPipeline: ['done', 'active', 'idle'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 4, description: 'Paint: "New item" is drawn on screen. Full render pipeline completed after appendChild.',
    callStack: ['global()'],
    memory: [
      { name: 'list', value: 'accessor → DOM <ul>' },
      { name: 'item', value: 'accessor → DOM <li>' },
    ],
    domHighlight: ['li-new'], cssomHighlight: [],
    renderPipeline: ['done', 'done', 'active'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
  {
    line: 0, description: 'Program complete. The <ul> now has 3 list items — the new one was created, configured, then attached.',
    callStack: [],
    memory: [
      { name: 'list', value: 'accessor → DOM <ul>' },
      { name: 'item', value: 'accessor → DOM <li>' },
    ],
    domHighlight: [], cssomHighlight: [],
    renderPipeline: ['done', 'done', 'done'],
    webAPIs: [], callbackQueue: [], microtaskQueue: [],
  },
];

// ── Examples array ──────────────────────────────────────────

const EXAMPLES: Example[] = [
  { name: 'DOM as C++ Object', code: EX1_CODE, steps: EX1_STEPS, dom: STANDARD_DOM, cssom: STANDARD_CSSOM },
  { name: 'Styling & Render Pipeline', code: EX2_CODE, steps: EX2_STEPS, dom: STANDARD_DOM, cssom: STANDARD_CSSOM },
  { name: 'Event Listeners', code: EX3_CODE, steps: EX3_STEPS, dom: STANDARD_DOM, cssom: STANDARD_CSSOM },
  { name: 'DOM Manipulation & Reflow', code: EX4_CODE, steps: EX4_STEPS, dom: EX4_DOM, cssom: STANDARD_CSSOM },
];

// ── Animation variants ──────────────────────────────────────

const fadeIn = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 6 },
};

const springConfig = { type: 'spring' as const, stiffness: 500, damping: 30 };

const arrowVariants = {
  initial: { opacity: 0, scale: 0.6 },
  animate: { opacity: 1, scale: 1, transition: { type: 'spring' as const, stiffness: 400, damping: 20 } },
  exit: { opacity: 0, scale: 0.6, transition: { duration: 0.15 } },
};

const PIPELINE_LABELS = ['Render Tree', 'Layout', 'Paint'];

// ── Page component ──────────────────────────────────────────

export default function UIHardPartsPage() {
  const [selectedExample, setSelectedExample] = useState(0);
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  const example = EXAMPLES[selectedExample];
  const currentStep = example.steps[step];
  const activeDom = selectedExample === 3 && step >= 8 ? EX4_DOM_WITH_NEW : example.dom;

  const handleExampleSelect = useCallback((i: number) => {
    setSelectedExample(i);
    setStep(0);
    setIsPlaying(false);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setStep(prev => {
        if (prev >= example.steps.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1200 / speed);
    return () => clearInterval(interval);
  }, [isPlaying, example.steps.length, speed]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight') {
        setStep(s => Math.min(s + 1, example.steps.length - 1));
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
  }, [example.steps.length]);

  return (
    <div className={styles.page}>
      {/* ── Top Bar ── */}
      <header className={styles.topBar}>
        <Link to="/" className={styles.backLink}>&larr; Home</Link>
        <div className={styles.brand}>
          <h1 className={styles.title}>UI Hard Parts</h1>
          <span className={styles.subtitle}>Will Sentance Style</span>
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

      {/* ── Main: Two Worlds ── */}
      <main className={styles.main}>
        {/* ── JS World ── */}
        <div className={styles.jsWorld}>
          <div className={`${styles.worldHeader} ${styles.jsWorldHeader}`}>
            <span className={styles.worldDot} style={{ background: 'var(--accent-blue)' }} />
            JavaScript Engine (V8)
          </div>
          <div className={styles.jsWorldContent}>
            {/* Code */}
            <div className={styles.codePanel}>
              <CodeEditor
                code={example.code}
                highlightLine={currentStep.line}
                readOnly
              />
            </div>

            {/* Call Stack */}
            <div className={styles.callStack}>
              <div className={styles.callStackHeader}>Call Stack</div>
              <div className={styles.callStackBody}>
                <AnimatePresence mode="popLayout">
                  {currentStep.callStack.map((frame, i) => (
                    <motion.div
                      key={`${frame}-${i}`}
                      className={`${styles.stackFrame} ${i === currentStep.callStack.length - 1 ? styles.stackFrameTop : ''}`}
                      variants={fadeIn}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={springConfig}
                      layout
                    >
                      {frame}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {currentStep.callStack.length === 0 && (
                  <div className={styles.emptyHint}>Empty</div>
                )}
              </div>
            </div>

            {/* Memory */}
            <div className={styles.memory}>
              <div className={styles.memoryHeader}>Memory</div>
              <div className={styles.memoryBody}>
                <AnimatePresence mode="popLayout">
                  {currentStep.memory.map((m) => (
                    <motion.div
                      key={m.name}
                      className={`${styles.memRow} ${m.isNew ? styles.memRowNew : ''}`}
                      variants={fadeIn}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={springConfig}
                      layout
                    >
                      <span className={styles.memName}>{m.name}</span>
                      <span className={styles.memColon}>:</span>
                      <span className={styles.memValue}>{m.value}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {currentStep.memory.length === 0 && (
                  <div className={styles.emptyHint}>No variables</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Boundary ── */}
        <div className={styles.boundary}>
          <div className={styles.boundaryLine} />
          <AnimatePresence mode="wait">
            {currentStep.crossingArrow && (
              <motion.div
                key={`${currentStep.crossingArrow}-${step}`}
                className={styles.crossingArrow}
                variants={arrowVariants}
                initial="initial"
                animate="animate"
                exit="exit"
              >
                <span className={styles.crossingLabel}>
                  {currentStep.crossingLabel}
                </span>
                <span
                  className={`${styles.arrowIcon} ${
                    currentStep.crossingArrow === 'js-to-cpp' ? styles.arrowJsToCpp : styles.arrowCppToJs
                  }`}
                >
                  {currentStep.crossingArrow === 'js-to-cpp' ? '→' : '←'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── C++ World ── */}
        <div className={styles.cppWorld}>
          <div className={`${styles.worldHeader} ${styles.cppWorldHeader}`}>
            <span className={styles.worldDot} style={{ background: 'var(--accent-orange)' }} />
            Browser Engine (C++)
          </div>
          <div className={styles.cppWorldContent}>
            {/* DOM */}
            <div className={styles.domSection}>
              <div className={styles.domHeader}>DOM Tree</div>
              <div className={styles.domTree}>
                {activeDom.map((node) => {
                  const highlighted = currentStep.domHighlight.includes(node.id);
                  return (
                    <div key={node.id} className={styles.domNode}>
                      <span className={styles.domIndent}>
                        {'  '.repeat(node.depth)}
                        {node.depth > 0 ? '├─ ' : ''}
                      </span>
                      <motion.span
                        className={`${styles.domTag} ${highlighted ? styles.domTagHighlight : ''}`}
                        animate={highlighted ? { scale: [1, 1.05, 1] } : { scale: 1 }}
                        transition={{ duration: 0.3 }}
                      >
                        {'<'}{node.tag}
                        {node.nodeId && <span className={styles.domId}>#{node.nodeId}</span>}
                        {node.className && <span className={styles.domClass}>.{node.className}</span>}
                        {'>'}
                      </motion.span>
                      {node.text && <span className={styles.domText}>"{node.text}"</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CSSOM */}
            <div className={styles.cssomSection}>
              <div className={styles.cssomHeader}>CSSOM</div>
              <div className={styles.cssomBody}>
                {example.cssom.map((rule) => {
                  const highlighted = currentStep.cssomHighlight.includes(rule.id);
                  return (
                    <motion.div
                      key={rule.id}
                      className={`${styles.cssomRule} ${highlighted ? styles.cssomRuleHighlight : ''}`}
                      animate={highlighted ? { scale: [1, 1.02, 1] } : { scale: 1 }}
                      transition={{ duration: 0.3 }}
                    >
                      <span className={styles.cssomSelector}>{rule.selector}</span>
                      <span className={styles.cssomProps}>{' { '}{rule.props}{' }'}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Render Pipeline */}
            <div className={styles.renderPipeline}>
              <div className={styles.renderHeader}>Render Pipeline</div>
              <div className={styles.pipelineRow}>
                {currentStep.renderPipeline.map((state, i) => (
                  <motion.div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                    {i > 0 && <span className={styles.pipelineArrow}>→</span>}
                    <motion.div
                      className={`${styles.pipelineStage} ${
                        state === 'active' ? styles.pipelineActive :
                        state === 'done' ? styles.pipelineDone : ''
                      }`}
                      animate={state === 'active' ? { scale: [1, 1.04, 1] } : { scale: 1 }}
                      transition={{ repeat: state === 'active' ? Infinity : 0, duration: 0.8 }}
                    >
                      {PIPELINE_LABELS[i]}
                    </motion.div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Web API Shelf */}
            <div className={styles.webApiSection}>
              <div className={styles.webApiHeader}>Web API Shelf</div>
              <div className={styles.webApiBody}>
                <AnimatePresence mode="popLayout">
                  {currentStep.webAPIs.map((api) => (
                    <motion.div
                      key={api.id}
                      className={styles.webApiItem}
                      variants={fadeIn}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      transition={springConfig}
                      layout
                    >
                      {api.label}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {currentStep.webAPIs.length === 0 && (
                  <div className={styles.emptyHint}>No registered handlers</div>
                )}
              </div>
            </div>

            {/* Queues */}
            <div className={styles.queuesRow}>
              <div className={styles.queueSection}>
                <div className={`${styles.queueHeader} ${styles.queueHeaderMicro}`}>Microtask Queue</div>
                <div className={styles.queueBody}>
                  <AnimatePresence mode="popLayout">
                    {currentStep.microtaskQueue.map((item, i) => (
                      <motion.span
                        key={`${item}-${i}`}
                        className={`${styles.queueItem} ${styles.queueItemMicro}`}
                        variants={fadeIn}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={springConfig}
                        layout
                      >
                        {item}
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  {currentStep.microtaskQueue.length === 0 && (
                    <div className={styles.emptyHint}>Empty</div>
                  )}
                </div>
              </div>
              <div className={`${styles.queueSection} ${styles.queueSectionCb}`}>
                <div className={`${styles.queueHeader} ${styles.queueHeaderCb}`}>Callback Queue</div>
                <div className={styles.queueBody}>
                  <AnimatePresence mode="popLayout">
                    {currentStep.callbackQueue.map((item, i) => (
                      <motion.span
                        key={`${item}-${i}`}
                        className={`${styles.queueItem} ${styles.queueItemCb}`}
                        variants={fadeIn}
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        transition={springConfig}
                        layout
                      >
                        {item}
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  {currentStep.callbackQueue.length === 0 && (
                    <div className={styles.emptyHint}>Empty</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.descriptionBar}>
          <span className={styles.stepBadge}>
            Step {step + 1}/{example.steps.length}
          </span>
          <span className={styles.descriptionText}>{currentStep.description}</span>
        </div>

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
              onClick={() => { setStep(s => Math.min(example.steps.length - 1, s + 1)); setIsPlaying(false); }}
              disabled={step >= example.steps.length - 1}
            >
              ▶
            </button>
            <button
              className={styles.stepBtn}
              onClick={() => { setStep(example.steps.length - 1); setIsPlaying(false); }}
              disabled={step >= example.steps.length - 1}
            >
              ⏭
            </button>
          </div>

          <input
            type="range"
            className={styles.timeline}
            min={0}
            max={example.steps.length - 1}
            value={step}
            onChange={(e) => { setStep(Number(e.target.value)); setIsPlaying(false); }}
          />

          <span className={styles.stepInfo}>
            {step + 1} / {example.steps.length}
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
      </footer>
    </div>
  );
}
