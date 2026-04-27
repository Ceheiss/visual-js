import { useEffect, useRef, useCallback } from 'react';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightSpecialChars, Decoration, type DecorationSet } from '@codemirror/view';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark } from '@codemirror/theme-one-dark';
import { defaultKeymap } from '@codemirror/commands';
import styles from './CodeEditor.module.css';

const setHighlightLine = StateEffect.define<number>();

const highlightLineField = StateField.define<DecorationSet>({
  create() { return Decoration.none; },
  update(deco, tr) {
    for (const e of tr.effects) {
      if (e.is(setHighlightLine)) {
        const lineNum = e.value;
        if (lineNum <= 0 || lineNum > tr.state.doc.lines) return Decoration.none;
        const line = tr.state.doc.line(lineNum);
        return Decoration.set([
          Decoration.line({ class: 'cm-highlight-line' }).range(line.from),
        ]);
      }
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const highlightLineTheme = EditorView.baseTheme({
  '.cm-highlight-line': {
    backgroundColor: 'rgba(229, 192, 123, 0.12) !important',
    borderLeft: '3px solid #e5c07b',
    paddingLeft: '13px !important',
  },
});

interface CodeEditorProps {
  code: string;
  onCodeChange: (code: string) => void;
  highlightLine: number;
}

export function CodeEditor({ code, onCodeChange, highlightLine }: CodeEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const codeRef = useRef(code);

  const handleChange = useCallback((update: { state: EditorState; docChanged: boolean }) => {
    if (update.docChanged) {
      const newCode = update.state.doc.toString();
      codeRef.current = newCode;
      onCodeChange(newCode);
    }
  }, [onCodeChange]);

  useEffect(() => {
    if (!editorRef.current) return;

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        javascript(),
        oneDark,
        highlightLineField,
        highlightLineTheme,
        keymap.of(defaultKeymap),
        EditorView.updateListener.of((update) => {
          handleChange({ state: update.state, docChanged: update.docChanged });
        }),
        EditorView.theme({
          '&': { height: '100%', fontSize: '14px' },
          '.cm-scroller': { fontFamily: 'var(--font-mono)', overflow: 'auto' },
          '.cm-content': { padding: '12px 0' },
          '.cm-line': { padding: '0 16px' },
          '.cm-gutters': { background: 'var(--bg-secondary)', border: 'none', color: 'var(--text-muted)' },
          '.cm-activeLineGutter': { background: 'var(--bg-tertiary)' },
        }),
        EditorView.editable.of(true),
      ],
    });

    const view = new EditorView({ state, parent: editorRef.current });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (codeRef.current !== code) {
      codeRef.current = code;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: code } });
    }
  }, [code]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setHighlightLine.of(highlightLine) });
    if (highlightLine > 0 && highlightLine <= view.state.doc.lines) {
      const line = view.state.doc.line(highlightLine);
      view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
    }
  }, [highlightLine]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className={styles.title}>Code</span>
        {highlightLine > 0 && (
          <span className={styles.lineIndicator}>Line {highlightLine}</span>
        )}
      </div>
      <div className={styles.editor} ref={editorRef} />
    </div>
  );
}
