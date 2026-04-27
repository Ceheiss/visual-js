import { useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CodeEditor } from '../../components/CodeEditor';
import { ExecutionContextPanel } from '../../components/ExecutionContextPanel';
import { CallStack } from '../../components/CallStack';
import { EventLoopPanel } from '../../components/EventLoopPanel';
import { StepControls } from '../../components/StepControls';
import { StepDescription } from '../../components/StepDescription';
import { ExampleSelector } from '../../components/ExampleSelector';
import { interpret } from '../../interpreter/interpreter';
import { examples } from '../../examples';
import styles from './Execution.module.css';

export default function ExecutionPage() {
  const [selectedExample, setSelectedExample] = useState(0);
  const [code, setCode] = useState(examples[0].code);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const snapshots = useMemo(() => {
    try {
      setError(null);
      return interpret(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Parse error');
      return [];
    }
  }, [code]);

  const snapshot = snapshots[currentStep] || null;

  const handleExampleSelect = useCallback((index: number) => {
    setSelectedExample(index);
    setCode(examples[index].code);
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  const handleCodeChange = useCallback((newCode: string) => {
    setCode(newCode);
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  const handleStepForward = useCallback(() => {
    setCurrentStep(prev => Math.min(prev + 1, snapshots.length - 1));
  }, [snapshots.length]);

  const handleStepBackward = useCallback(() => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  }, []);

  const handleGoToStart = useCallback(() => {
    setCurrentStep(0);
    setIsPlaying(false);
  }, []);

  const handleGoToEnd = useCallback(() => {
    setCurrentStep(snapshots.length - 1);
    setIsPlaying(false);
  }, [snapshots.length]);

  const handleTogglePlay = useCallback(() => {
    setIsPlaying(prev => !prev);
  }, []);

  const handleGoToStep = useCallback((step: number) => {
    setCurrentStep(step);
    setIsPlaying(false);
  }, []);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    setSpeed(newSpeed);
  }, []);

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <Link to="/" className={styles.backLink}>← Home</Link>
        <div className={styles.brand}>
          <h1 className={styles.title}>Execution Context Visualizer</h1>
          <span className={styles.subtitle}>Will Sentance Style</span>
        </div>
        <ExampleSelector selectedIndex={selectedExample} onSelect={handleExampleSelect} />
        <div className={styles.actions}>
          <button className={styles.runBtn} onClick={() => { setCurrentStep(0); setIsPlaying(false); }}>Reset</button>
          <span className={styles.hint}>Arrow keys to step, Space to play</span>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.leftPanel}>
          <CodeEditor code={code} onCodeChange={handleCodeChange} highlightLine={snapshot?.line ?? 0} />
        </div>
        <div className={styles.centerPanel}>
          {error ? (
            <div className={styles.errorPanel}>
              <div className={styles.errorTitle}>Parse Error</div>
              <pre className={styles.errorMessage}>{error}</pre>
            </div>
          ) : snapshot ? (
            <ExecutionContextPanel contexts={snapshot.executionContexts} highlightContextId={snapshot.highlightContextId} />
          ) : (
            <div className={styles.emptyState}>Write some JavaScript and step through it</div>
          )}
        </div>
        <div className={styles.rightPanel}>
          <CallStack frames={snapshot?.callStack ?? []} />
          <EventLoopPanel callbackQueue={snapshot?.callbackQueue ?? []} microtaskQueue={snapshot?.microtaskQueue ?? []} phase={snapshot?.phase ?? 'execution'} />
        </div>
      </main>

      <footer className={styles.footer}>
        {snapshot && <StepDescription description={snapshot.description} phase={snapshot.phase} />}
        {snapshots.length > 0 && (
          <StepControls
            currentStep={currentStep} totalSteps={snapshots.length} isPlaying={isPlaying} speed={speed}
            onStepForward={handleStepForward} onStepBackward={handleStepBackward}
            onGoToStart={handleGoToStart} onGoToEnd={handleGoToEnd} onGoToStep={handleGoToStep}
            onTogglePlay={handleTogglePlay} onSpeedChange={handleSpeedChange}
          />
        )}
      </footer>
    </div>
  );
}
