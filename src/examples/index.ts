export interface Example {
  name: string;
  description: string;
  code: string;
}

export const examples: Example[] = [
  {
    name: 'Variables & Functions',
    description: 'Basic declarations, function call, and return value',
    code: `const name = "Will";
const age = 35;

function greet(person) {
  const greeting = "Hello, " + person;
  return greeting;
}

const result = greet(name);`,
  },
  {
    name: 'Higher-Order Functions',
    description: 'Passing a function as an argument — the map pattern',
    code: `function copyArrayAndManipulate(array, instructions) {
  const output = [];
  for (let i = 0; i < array.length; i++) {
    output.push(instructions(array[i]));
  }
  return output;
}

function multiplyBy2(input) {
  return input * 2;
}

const result = copyArrayAndManipulate([1, 2, 3], multiplyBy2);`,
  },
  {
    name: 'Closures',
    description: 'Function factory — the counter pattern',
    code: `function createCounter(start) {
  let count = start;
  function increment() {
    count = count + 1;
    return count;
  }
  return increment;
}

const counter = createCounter(0);
const first = counter();
const second = counter();`,
  },
  {
    name: 'Closure Backpack (once)',
    description: 'The once() pattern — closure preserving state',
    code: `function once(fn) {
  let called = false;
  let result;
  function inner(x) {
    if (called === false) {
      result = fn(x);
      called = true;
    }
    return result;
  }
  return inner;
}

function double(n) {
  return n * 2;
}

const onceDouble = once(double);
const a = onceDouble(5);
const b = onceDouble(100);`,
  },
  {
    name: 'Callbacks & Event Loop',
    description: 'setTimeout and the callback queue',
    code: `function printHello() {
  const msg = "Hello!";
  return msg;
}

function blockFor300ms() {
  const x = 1 + 1;
  return x;
}

setTimeout(printHello, 0);

const result = blockFor300ms();

const final = "Done";`,
  },
  {
    name: 'Promises & Microtasks',
    description: '.then() and microtask queue priority over callback queue',
    code: `function display(data) {
  const formatted = "Got: " + data;
  return formatted;
}

function printHello() {
  const msg = "Hello!";
  return msg;
}

function blockForAWhile() {
  const x = 1 + 1;
  return x;
}

setTimeout(printHello, 0);

const futureData = new Promise(function executor(resolve) {
  resolve("Twitter data");
});

futureData.then(display);

const result = blockForAWhile();`,
  },
];
