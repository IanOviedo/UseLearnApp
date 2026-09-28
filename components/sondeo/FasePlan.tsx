"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconoAlerta, IconoCheck, IconoGrafo, IconoObjetivo } from "@/components/ui/Iconos";

const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js";

interface FasePlanProps {
  sesionId: number;
  feedback: string;
  subtemasFallados: string[];
  onVolver: () => void;
}

interface MermaidApi {
  initialize: (config: Record<string, unknown>) => void;
  run: (options?: { nodes?: Element[] }) => Promise<void>;
}

declare global {
  interface Window {
    mermaid?: MermaidApi;
  }
}

function etiquetaSubtema(subtema: string): string {
  return /^\d+$/.test(subtema) ? `Subtema ${subtema}` : subtema;
}

function escaparEtiqueta(texto: string): string {
  return texto.replace(/"/g, "'");
}

function construirGrafo(subtemasFallados: string[]): string {
  const lineas = ["graph TD", '  PLAN["Plan de refuerzo"]'];
  subtemasFallados.forEach((subtema, indice) => {
    lineas.push(`  N${indice}["${escaparEtiqueta(etiquetaSubtema(subtema))}"]`);
    lineas.push(`  PLAN --> N${indice}`);
  });
  return lineas.join("\n");
}

export default function FasePlan({ sesionId, feedback, subtemasFallados, onVolver }: FasePlanProps) {
  const contenedorGrafoRef = useRef<HTMLDivElement>(null);
  const [errorMapa, setErrorMapa] = useState<string | null>(null);

  const grafo = useMemo(() => construirGrafo(subtemasFallados), [subtemasFallados]);
  const idGrafo = `mapa-conceptual-${sesionId}`;

  useEffect(() => {
    if (subtemasFallados.length === 0) return;
    let cancelado = false;

    const renderizar = () => {
      if (cancelado) return;
      const contenedor = contenedorGrafoRef.current;
      const mermaid = window.mermaid;
      if (!contenedor || !mermaid) return;
      try {
        // Tema oscuro explícito: sobre el fondo gris del canvas, las líneas por
        // defecto casi no se veían (solo se distinguían las cajas claras).
        mermaid.initialize({
          startOnLoad: false,
          theme: "base",
          themeVariables: {
            darkMode: true,
            background: "transparent",
            fontFamily: "inherit",
            fontSize: "14px",
            primaryColor: "#171717",
            primaryTextColor: "#e5e5e5",
            primaryBorderColor: "#525252",
            secondaryColor: "#262626",
            tertiaryColor: "#1f1f1f",
            lineColor: "#a3a3a3",
            arrowheadColor: "#a3a3a3",
            textColor: "#d4d4d4",
            nodeBorder: "#525252",
          },
        });
        contenedor.textContent = grafo;
        mermaid
          .run({ nodes: [contenedor] })
          .then(() => {
            if (!cancelado) setErrorMapa(null);
          })
          .catch(() => {
            if (!cancelado) setErrorMapa("No se pudo renderizar el mapa conceptual.");
          });
      } catch {
        setErrorMapa("No se pudo renderizar el mapa conceptual.");
      }
    };

    if (window.mermaid) {
      renderizar();
      return () => {
        cancelado = true;
      };
    }

    const scriptExistente = document.querySelector<HTMLScriptElement>('script[src*="mermaid"]');
    if (scriptExistente) {
      scriptExistente.addEventListener("load", renderizar);
      return () => {
        cancelado = true;
        scriptExistente.removeEventListener("load", renderizar);
      };
    }

    const script = document.createElement("script");
    script.src = MERMAID_CDN;
    script.async = true;
    script.addEventListener("load", renderizar);
    script.addEventListener("error", () => {
      if (!cancelado) setErrorMapa("No se pudo cargar Mermaid desde el CDN.");
    });
    document.body.appendChild(script);

    return () => {
      cancelado = true;
      script.removeEventListener("load", renderizar);
    };
  }, [subtemasFallados, grafo]);

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100 px-8 py-12 overflow-hidden">
      {/* Fondo uniforme y estático */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_100%)]" />

      <div className="relative max-w-xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Plan</p>
          {subtemasFallados.length > 0 && (
            <span className="text-xs tabular-nums text-neutral-600">
              {subtemasFallados.length} {subtemasFallados.length === 1 ? "subtema" : "subtemas"} a reforzar
            </span>
          )}
        </div>

        <div className="animate-fade-in-up flex flex-col items-center gap-5 rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-8 text-center shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-green-600/40 bg-green-500/10 text-green-400">
            <IconoCheck className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">¡Sondeo completo!</h1>
          <p className="whitespace-pre-wrap leading-relaxed text-neutral-400">{feedback}</p>
        </div>

        <div className="animate-fade-in-up rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/60 text-neutral-400">
              <IconoObjetivo className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold tracking-tight text-neutral-100">Subtemas a reforzar</h2>
          </div>
          {subtemasFallados.length === 0 ? (
            <p className="text-sm text-neutral-500">No fallaste ningún subtema. ¡Buen trabajo!</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {subtemasFallados.map((subtema) => (
                <li
                  key={subtema}
                  className="flex items-center gap-3 rounded-xl border border-neutral-800/60 bg-neutral-950/40 px-4 py-3"
                >
                  <IconoAlerta className="h-4 w-4 shrink-0 text-red-400" />
                  <span className="text-sm text-neutral-200">{etiquetaSubtema(subtema)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {subtemasFallados.length > 0 && (
          <div className="animate-fade-in-up rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/60 text-neutral-400">
                <IconoGrafo className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold tracking-tight text-neutral-100">Mapa conceptual</h2>
            </div>
            {errorMapa && (
              <p className="mb-3 flex items-start gap-1.5 text-sm text-red-400">
                <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{errorMapa}</span>
              </p>
            )}
            <div className="rounded-xl border border-neutral-800/60 bg-neutral-950/60 p-4">
              <div
                id={idGrafo}
                ref={contenedorGrafoRef}
                className="mermaid overflow-x-auto text-sm text-neutral-400"
              />
            </div>
          </div>
        )}

        <button
          onClick={onVolver}
          className="animate-fade-in-up w-full rounded-full bg-neutral-100 px-5 py-3 text-sm font-medium text-neutral-900 transition-all duration-300 hover:bg-white hover:shadow-lg"
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}

