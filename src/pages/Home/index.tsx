import { Link } from 'react-router-dom';
import styles from './Home.module.css';

const tools = [
  {
    path: '/execution',
    title: 'Execution Context',
    author: 'Will Sentance',
    description: 'Step through code line by line. See the call stack, execution contexts with memory, closures with [[scope]], and the event loop.',
    color: 'var(--accent-blue)',
    tags: ['Memory', 'Call Stack', 'Closures', 'Event Loop'],
  },
  {
    path: '/scope',
    title: 'Scope Chain',
    author: 'Kyle Simpson',
    description: 'Visualize lexical scope with the marble & bucket metaphor. See the two-pass compilation model — scope creation then execution.',
    color: 'var(--accent-green)',
    tags: ['Lexical Scope', 'Buckets', 'Marbles', 'Shadowing'],
  },
  {
    path: '/this',
    title: 'this Binding',
    author: 'Kyle Simpson',
    description: 'Determine which this rule applies at every call site. Walk through the 4-rule priority: new, explicit, implicit, default.',
    color: 'var(--accent-yellow)',
    tags: ['new', 'call/apply/bind', 'Implicit', 'Default'],
  },
  {
    path: '/prototype',
    title: 'Prototype Chain',
    author: 'Kyle Simpson',
    description: 'Trace __proto__ links and delegation chains. See how property lookup walks the prototype chain.',
    color: 'var(--accent-orange)',
    tags: ['__proto__', 'Object.create', 'Delegation', 'Lookup'],
  },
  {
    path: '/recursion',
    title: 'Recursion Tree',
    author: 'Classic CS',
    description: 'Watch recursive calls branch into a tree. See the call stack grow and unwind as each frame returns.',
    color: 'var(--accent-purple)',
    tags: ['Call Tree', 'Base Case', 'Stack Frames', 'Memoization'],
  },
  {
    path: '/event-loop',
    title: 'Event Loop',
    author: 'Philip Roberts',
    description: 'Full event loop simulation with Web APIs, callback queue, microtask queue, and render steps. Watch tasks flow between columns.',
    color: 'var(--accent-cyan)',
    tags: ['Web APIs', 'Callback Queue', 'Microtasks', 'Render'],
  },
  {
    path: '/ui-hard-parts',
    title: 'UI Hard Parts',
    author: 'Will Sentance',
    description: 'Visualize the JS/C++ boundary. See how facade functions cross into the browser engine for DOM, CSSOM, and rendering.',
    color: 'var(--accent-orange)',
    tags: ['DOM', 'CSSOM', 'Render Pipeline', 'Facade Functions'],
  },
  {
    path: '/server',
    title: 'Server Hard Parts',
    author: 'Will Sentance',
    description: 'Visualize the two-pronged model: JS facade + C++ implementation. See how fs, http, and timers cross from V8 through libuv to the OS.',
    color: 'var(--accent-red)',
    tags: ['Node.js', 'libuv', 'Thread Pool', 'Event Loop Phases'],
  },
];

export default function HomePage() {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>JS Visualizer</h1>
        <p className={styles.subtitle}>The Hard Parts — Interactive tools for visual learners</p>
      </header>
      <main className={styles.grid}>
        {tools.map((tool) => (
          <Link to={tool.path} key={tool.path} className={styles.card} style={{ '--card-accent': tool.color } as React.CSSProperties}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>{tool.title}</h2>
              <span className={styles.cardAuthor}>{tool.author}</span>
            </div>
            <p className={styles.cardDesc}>{tool.description}</p>
            <div className={styles.tags}>
              {tool.tags.map((tag) => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
            </div>
          </Link>
        ))}
      </main>
      <footer className={styles.footer}>
        <span>Built for understanding JavaScript from the inside out</span>
      </footer>
    </div>
  );
}
