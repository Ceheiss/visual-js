import { motion, AnimatePresence } from 'framer-motion';
import type { ExecutionContext as ExecCtx, MemoryEntry, ClosureEntry } from '../../interpreter/types';
import { formatValue } from '../../interpreter/types';
import styles from './ExecutionContextPanel.module.css';

interface Props {
  contexts: ExecCtx[];
  highlightContextId?: string;
}

export function ExecutionContextPanel({ contexts, highlightContextId }: Props) {
  const global = contexts.find(c => c.type === 'global');
  const locals = contexts.filter(c => c.type === 'function');

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Execution Contexts</span>
      </div>
      <div className={styles.content}>
        {global && (
          <div className={`${styles.globalContext} ${highlightContextId === global.id ? styles.highlighted : ''}`}>
            <div className={styles.contextHeader}>
              <div className={styles.contextLabel}>Global Execution Context</div>
            </div>
            <div className={styles.contextBody}>
              <div className={styles.memorySection}>
                <div className={styles.memorySectionLabel}>Memory</div>
                <MemoryList entries={global.memory} />
              </div>
              <AnimatePresence mode="popLayout">
                {locals.map((ctx) => (
                  <motion.div
                    key={ctx.id}
                    className={`${styles.localContext} ${highlightContextId === ctx.id ? styles.highlighted : ''}`}
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: -10 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <div className={styles.localContextHeader}>
                      <div className={styles.contextLabel}>{ctx.name}</div>
                    </div>
                    <div className={styles.localContextBody}>
                      <div className={styles.memorySection}>
                        <div className={styles.memorySectionLabel}>Local Memory</div>
                        <MemoryList entries={ctx.memory} />
                      </div>
                      {ctx.closureScope && ctx.closureScope.length > 0 && (
                        <ClosureDisplay entries={ctx.closureScope} />
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoryList({ entries }: { entries: MemoryEntry[] }) {
  if (entries.length === 0) {
    return <div className={styles.emptyMemory}>—</div>;
  }

  return (
    <div className={styles.memoryList}>
      <AnimatePresence mode="popLayout">
        {entries.map((entry) => (
          <motion.div
            key={entry.name}
            className={`${styles.memoryEntry} ${entry.isNew ? styles.isNew : ''} ${entry.isChanged ? styles.isChanged : ''}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            layout
          >
            <span className={styles.memoryName}>{entry.name}</span>
            <span className={styles.memorySeparator}>:</span>
            <span className={`${styles.memoryValue} ${getValueClass(entry.value.type)}`}>
              {formatValue(entry.value)}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ClosureDisplay({ entries }: { entries: ClosureEntry[] }) {
  return (
    <motion.div
      className={styles.closureSection}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.2 }}
    >
      <div className={styles.closureLabel}>
        <span className={styles.closureIcon}>🎒</span>
        <span>[[Scope]] — Closure</span>
      </div>
      <div className={styles.closureEntries}>
        {entries.map((entry) => (
          <div key={`${entry.fromContext}-${entry.name}`} className={styles.closureEntry}>
            <span className={styles.memoryName}>{entry.name}</span>
            <span className={styles.memorySeparator}>:</span>
            <span className={styles.memoryValue}>{formatValue(entry.value)}</span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function getValueClass(type: string): string {
  switch (type) {
    case 'number': return styles.valueNumber;
    case 'string': return styles.valueString;
    case 'boolean': return styles.valueBoolean;
    case 'function': return styles.valueFunction;
    case 'undefined': return styles.valueUndefined;
    default: return '';
  }
}
