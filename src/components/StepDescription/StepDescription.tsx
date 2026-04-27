import { motion, AnimatePresence } from 'framer-motion';
import styles from './StepDescription.module.css';

interface Props {
  description: string;
  phase: string;
}

export function StepDescription({ description, phase }: Props) {
  const phaseLabel = (() => {
    switch (phase) {
      case 'event-loop-check': return 'Event Loop';
      case 'dequeue-callback': return 'Callback Queue';
      case 'dequeue-microtask': return 'Microtask Queue';
      default: return 'Thread of Execution';
    }
  })();

  const phaseClass = (() => {
    switch (phase) {
      case 'event-loop-check': return styles.phaseEventLoop;
      case 'dequeue-callback': return styles.phaseCallback;
      case 'dequeue-microtask': return styles.phaseMicrotask;
      default: return styles.phaseExecution;
    }
  })();

  return (
    <div className={styles.container}>
      <span className={`${styles.phaseBadge} ${phaseClass}`}>{phaseLabel}</span>
      <AnimatePresence mode="wait">
        <motion.span
          key={description}
          className={styles.text}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          {description}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
