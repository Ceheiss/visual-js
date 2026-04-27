import { motion, AnimatePresence } from 'framer-motion';
import type { EventQueueItem } from '../../interpreter/types';
import styles from './EventLoopPanel.module.css';

interface Props {
  callbackQueue: EventQueueItem[];
  microtaskQueue: EventQueueItem[];
  phase: string;
}

export function EventLoopPanel({ callbackQueue, microtaskQueue, phase }: Props) {
  const hasItems = callbackQueue.length > 0 || microtaskQueue.length > 0;
  const isActive = phase !== 'execution';

  return (
    <div className={`${styles.container} ${isActive ? styles.active : ''}`}>
      <div className={styles.header}>
        <span className={styles.title}>Event Loop</span>
        {isActive && <span className={styles.activeBadge}>active</span>}
      </div>
      <div className={styles.content}>
        <div className={styles.queue}>
          <div className={styles.queueLabel}>Microtask Queue</div>
          <div className={styles.queueItems}>
            <AnimatePresence mode="popLayout">
              {microtaskQueue.map((item) => (
                <motion.div
                  key={item.id}
                  className={`${styles.queueItem} ${styles.microtask}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {item.label}
                </motion.div>
              ))}
            </AnimatePresence>
            {microtaskQueue.length === 0 && (
              <span className={styles.emptyQueue}>empty</span>
            )}
          </div>
        </div>
        <div className={styles.queue}>
          <div className={styles.queueLabel}>Callback Queue</div>
          <div className={styles.queueItems}>
            <AnimatePresence mode="popLayout">
              {callbackQueue.map((item) => (
                <motion.div
                  key={item.id}
                  className={`${styles.queueItem} ${styles.callback}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {item.label}
                </motion.div>
              ))}
            </AnimatePresence>
            {callbackQueue.length === 0 && (
              <span className={styles.emptyQueue}>empty</span>
            )}
          </div>
        </div>
        {!hasItems && !isActive && (
          <div className={styles.dormant}>No async tasks</div>
        )}
      </div>
    </div>
  );
}
