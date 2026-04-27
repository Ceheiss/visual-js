import { motion, AnimatePresence } from 'framer-motion';
import type { CallStackFrame } from '../../interpreter/types';
import styles from './CallStack.module.css';

interface Props {
  frames: CallStackFrame[];
}

export function CallStack({ frames }: Props) {
  const reversed = [...frames].reverse();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Call Stack</span>
      </div>
      <div className={styles.content}>
        <div className={styles.stack}>
          <AnimatePresence mode="popLayout">
            {reversed.map((frame, i) => (
              <motion.div
                key={frame.id}
                className={`${styles.frame} ${i === 0 ? styles.topFrame : ''}`}
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                layout
              >
                <span className={styles.frameLabel}>{frame.label}</span>
                {i === 0 && <span className={styles.runningBadge}>running</span>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {frames.length === 0 && (
          <div className={styles.empty}>Stack empty</div>
        )}
      </div>
    </div>
  );
}
