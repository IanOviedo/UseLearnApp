"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, highlightActiveLine, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";

// Fase D2a — editor de los ejercicios de código. Se importa con next/dynamic (ssr:false)
// desde EjercicioCodigo: CodeMirror necesita `document` al construirse.
// Cmd/Ctrl+Enter dispara onRun (el botón "Ejecutar"), como en los editores de siempre.

interface EditorCodigoProps {
  valor: string;
  onChange: (valor: string) => void;
  /** Se ejecuta con Cmd/Ctrl+Enter. */
  onRun?: () => void;
}

/** Tema oscuro propio: evita sumar una dependencia de tema y respeta la paleta neutral. */
const temaOscuro = EditorView.theme({
  "&": { backgroundColor: "#0a0a0a", color: "#e5e5e5", fontSize: "13px", height: "240px" },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    lineHeight: "1.6",
  },
  ".cm-content": { caretColor: "#fafafa", padding: "8px 0" },
  ".cm-gutters": { backgroundColor: "#0a0a0a", color: "#525252", border: "none" },
  ".cm-activeLineGutter": { backgroundColor: "rgba(63, 63, 70, 0.4)", color: "#a1a1aa" },
  ".cm-activeLine": { backgroundColor: "rgba(63, 63, 70, 0.25)" },
  "&.cm-focused": { outline: "none" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: "#3f3f46",
  },
  ".cm-cursor": { borderLeftColor: "#fafafa" },
  ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
    backgroundColor: "rgba(82, 82, 91, 0.6)",
    outline: "none",
  },
});

export default function EditorCodigo({ valor, onChange, onRun }: EditorCodigoProps) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const vistaRef = useRef<EditorView | null>(null);
  // Callbacks en refs: los keymaps y updateListener se registran una sola vez y con
  // closures viejos si no se refrescan (el clásico "onRun stale").
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);

  useEffect(() => {
    onChangeRef.current = onChange;
    onRunRef.current = onRun;
  }, [onChange, onRun]);

  useEffect(() => {
    if (!contenedorRef.current) return;

    const vista = new EditorView({
      state: EditorState.create({
        doc: valor,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          history(),
          javascript(),
          EditorView.lineWrapping,
          keymap.of([
            indentWithTab,
            { key: "Mod-Enter", run: () => (onRunRef.current?.(), true) },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((actualizacion) => {
            if (actualizacion.docChanged) {
              onChangeRef.current(actualizacion.state.doc.toString());
            }
          }),
          temaOscuro,
        ],
      }),
      parent: contenedorRef.current,
    });

    vistaRef.current = vista;
    return () => {
      vista.destroy();
      vistaRef.current = null;
    };
    // Se crea una sola vez: los cambios externos de `valor` (resetear a plantilla,
    // cargar solución) se aplican con el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sincroniza cambios que no vienen del editor (plantilla inicial, "ver solución").
  useEffect(() => {
    const vista = vistaRef.current;
    if (!vista) return;
    const actual = vista.state.doc.toString();
    if (actual !== valor) {
      vista.dispatch({ changes: { from: 0, to: actual.length, insert: valor } });
    }
  }, [valor]);

  return (
    <div
      ref={contenedorRef}
      className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950"
    />
  );
}
