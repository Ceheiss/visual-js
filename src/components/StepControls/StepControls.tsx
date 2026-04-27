import { useEffect, useRef, useCallback } from 'react';
import styles from './StepControls.module.css';

interface Props {
  currentStep: number;
  totalSteps: number;
  isPlaying: boolean;
  speed: number;
  onStepForward: () => void;
  onStepBackward: () => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  onGoToStep: (step: number) => void;
  onTogglePlay: () => void;
  onSpeedChange: (speed: number) => void;
}

export function StepControls({
  currentStep,
  totalSteps,
  isPlaying,
  speed,
  onStepForward,
  onStepBackward,
  onGoToStart,
  onGoToEnd,
  onGoToStep,
  onTogglePlay,
  onSpeedChange,
}: Props) {
  const intervalRef = useRef<number | null>(null);

  const clearPlayInterval = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isPlaying) {
      clearPlayInterval();
      const ms = Math.max(200, 2000 / speed);
      intervalRef.current = window.setInterval(() => {
        onStepForward();
      }, ms);
    } else {
      clearPlayInterval();
    }
    return clearPlayInterval;
  }, [isPlaying, speed, onStepForward, clearPlayInterval]);

  useEffect(() => {
    if (isPlaying && currentStep >= totalSteps - 1) {
      onTogglePlay();
    }
  }, [currentStep, totalSteps, isPlaying, onTogglePlay]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;
      if ((e.target as HTMLElement)?.closest('.cm-editor')) return;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          onStepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          onStepBackward();
          break;
        case ' ':
          e.preventDefault();
          onTogglePlay();
          break;
        case 'Home':
          e.preventDefault();
          onGoToStart();
          break;
        case 'End':
          e.preventDefault();
          onGoToEnd();
          break;
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStepForward, onStepBackward, onTogglePlay, onGoToStart, onGoToEnd]);

  return (
    <div className={styles.container}>
      <div className={styles.controls}>
        <button className={styles.btn} onClick={onGoToStart} title="Go to start (Home)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="11 17 6 12 11 7" /><polyline points="18 17 13 12 18 7" />
          </svg>
        </button>
        <button className={styles.btn} onClick={onStepBackward} title="Step back (←)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <button className={`${styles.btn} ${styles.playBtn}`} onClick={onTogglePlay} title="Play/Pause (Space)">
          {isPlaying ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>
        <button className={styles.btn} onClick={onStepForward} title="Step forward (→)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
        <button className={styles.btn} onClick={onGoToEnd} title="Go to end (End)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
          </svg>
        </button>
      </div>

      <div className={styles.progressSection}>
        <input
          type="range"
          min={0}
          max={totalSteps - 1}
          value={currentStep}
          onChange={(e) => onGoToStep(parseInt(e.target.value))}
          className={styles.timeline}
        />
        <span className={styles.stepCounter}>
          Step {currentStep + 1} / {totalSteps}
        </span>
      </div>

      <div className={styles.speedSection}>
        <label className={styles.speedLabel}>Speed</label>
        <input
          type="range"
          min="0.5"
          max="5"
          step="0.5"
          value={speed}
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          className={styles.speedSlider}
        />
        <span className={styles.speedValue}>{speed}x</span>
      </div>
    </div>
  );
}
