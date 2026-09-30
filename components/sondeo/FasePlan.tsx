"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IconoAlerta, IconoCheck, IconoFlecha, IconoGrafo, IconoObjetivo, IconoPlay } from "@/components/ui/Iconos";
import Stepper from "@/components/ui/Stepper";
import { tieneRutasDeEnsenanza } from "@/lib/practica";
import type { BloqueRuta, RutaSubtema } from "@/lib/tipos";

const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js";

/** Copy y color por ruta (Fase C2): es lo que el usuario entiende como "qué voy a hacer". */
const ETIQUETA_RUTA: Record<RutaSubtema, { etiqueta: string; clase: string }> = {
  reforzar: { etiqueta: "Enseñar y practicar", clase: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  asegurar: { etiqueta: "Repaso breve + práctica", clase: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  practicar: { etiqueta: "Solo práctica", clase: "border-green-500/30 bg-green-500/10 text-green-300" },
  sin_evaluar: { etiqueta: "Enseñar desde cero", clase: "border-neutral-600/40 bg-neutral-800/40 text-neutral-300" },
};

interface FasePlanProps {
  sesionId: number;
  feedback: string;
  subtemasDebiles: string[];
  /** Sub-temas sin dominar (`cubierto = 0`): el sondeo no llegó a cubrirlos. */
  subtemasSinDominar: string[];
  /** Ruta por sub-tema calculada en el servidor (Fase C2). */
  rutas: BloqueRuta[];
  /** Persiste la fase "ensenar" y deja la sesión lista para la fase de práctica. */
  onEmpezar: () => Promise<void>;
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

function construirGrafo(subtemasDebiles: string[]): string {
  const lineas = ["graph TD", '  PLAN["Plan de refuerzo"]'];
  subtemasDebiles.forEach((subtema, indice) => {
    lineas.push(`  N${indice}["${escaparEtiqueta(etiquetaSubtema(subtema))}"]`);
    lineas.push(`  PLAN --> N${indice}`);
  });
  return lineas.join("\n");
}

export default function FasePlan({
  sesionId,
  feedback,
  subtemasDebiles,
  subtemasSinDominar,
  rutas,
  onEmpezar,
  onVolver,
}: FasePlanProps) {
  const contenedorGrafoRef = useRef<HTMLDivElement>(null);
  const [errorMapa, setErrorMapa] = useState<string | null>(null);
  // Transición a la fase de práctica: el click persiste la fase en el servidor antes de
  // avanzar (si falla, el plan sigue acá con el error visible, sin perder el estado).
  const [empezando, setEmpezando] = useState(false);
  const [errorEmpezar, setErrorEmpezar] = useState<string | null>(null);

  // ¿Hay algo que enseñar? Si no, el CTA cambia a "Practicar igual" (Fase C2: el plan
  // deja de ser un callejón sin salida cuando no hay sub-temas débiles).
  const hayQueEnsenar = useMemo(() => tieneRutasDeEnsenanza(rutas), [rutas]);

  async function empezar() {
    setEmpezando(true);
    setErrorEmpezar(null);
    try {
      await onEmpezar();
    } catch (error) {
      setErrorEmpezar(error instanceof Error ? error.message : "No se pudo avanzar de fase.");
    } finally {
      setEmpezando(false);
    }
  }

  const grafo = useMemo(() => construirGrafo(subtemasDebiles), [subtemasDebiles]);
  // Los sub-temas sin dominar que NO tienen errores ya no se listan arriba: acá quedan los
  // que el sondeo dejó a medias (nunca evaluados o evaluados sin llegar a dominarse), que
  // antes no aparecían en ninguna parte y hacían que el plan diera por sabido todo el tema.
  const sinDominarPendientes = useMemo(
    () => subtemasSinDominar.filter((subtema) => !subtemasDebiles.includes(subtema)),
    [subtemasSinDominar, subtemasDebiles]
  );
  const idGrafo = `mapa-conceptual-${sesionId}`;

  useEffect(() => {
    if (subtemasDebiles.length === 0) return;
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
  }, [subtemasDebiles, grafo]);

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100 px-8 py-12 overflow-hidden">
      {/* Fondo uniforme y estático */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_100%)]" />

      <div className="relative max-w-xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Plan</p>
          {subtemasDebiles.length > 0 && (
            <span className="text-xs tabular-nums text-neutral-600">
              {subtemasDebiles.length} {subtemasDebiles.length === 1 ? "subtema" : "subtemas"} a reforzar
            </span>
          )}
        </div>

        <Stepper actual={1} />

        <div className="animate-fade-in-up flex flex-col items-center gap-5 rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-8 text-center shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-green-600/40 bg-green-500/10 text-green-400">
            <IconoCheck className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">¡Sondeo completo!</h1>
          <p className="whitespace-pre-wrap leading-relaxed text-neutral-400">{feedback}</p>
        </div>

        {/* Fase C2 — la ruta por sub-tema: qué se enseña, qué se repasa y qué solo practica. */}
        <div className="animate-fade-in-up rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/60 text-neutral-400">
              <IconoPlay className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold tracking-tight text-neutral-100">Tu ruta de práctica</h2>
          </div>
          <p className="mb-4 text-xs text-neutral-500">
            {hayQueEnsenar
              ? "Según cómo te fue en el sondeo, cada sub-tema sale con una ruta propia."
              : "Todo parece estar en orden: no fallaste ningún sub-tema. Igual podés practicar antes de cerrar."}
          </p>
          <ul className="flex flex-col gap-2">
            {rutas.map((bloque) => {
              const meta = ETIQUETA_RUTA[bloque.ruta];
              return (
                <li
                  key={bloque.subtemaId}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-neutral-800/60 bg-neutral-950/40 px-4 py-3"
                >
                  <span className="text-sm text-neutral-200">{bloque.nombre}</span>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${meta.clase}`}
                  >
                    {meta.etiqueta}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="animate-fade-in-up rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/60 text-neutral-400">
              <IconoObjetivo className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold tracking-tight text-neutral-100">Subtemas a reforzar</h2>
          </div>
          {subtemasDebiles.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {sinDominarPendientes.length === 0
                ? "Dominaste todos los subtemas. ¡Buen trabajo!"
                : "No fallaste ninguno de los subtemas que se evaluaron."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {subtemasDebiles.map((subtema) => (
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

        {sinDominarPendientes.length > 0 && (
          <div className="animate-fade-in-up rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/60 text-neutral-400">
                <IconoFlecha className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-semibold tracking-tight text-neutral-100">Quedaron sin dominar</h2>
            </div>
            <p className="mb-3 text-xs text-neutral-500">
              El sondeo se cerró antes de cubrirlos, así que todavía no podés darlos por sabidos.
            </p>
            <ul className="flex flex-col gap-2">
              {sinDominarPendientes.map((subtema) => (
                <li
                  key={subtema}
                  className="flex items-center gap-3 rounded-xl border border-neutral-800/60 bg-neutral-950/40 px-4 py-3"
                >
                  <IconoFlecha className="h-4 w-4 shrink-0 text-neutral-500" />
                  <span className="text-sm text-neutral-300">{etiquetaSubtema(subtema)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {subtemasDebiles.length > 0 && (
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

        <div className="flex flex-col gap-3">
          {/* Fase C2 — la salida del plan ahora persiste la fase "ensenar" en el server. */}
          <button
            onClick={empezar}
            disabled={empezando}
            className="animate-fade-in-up w-full rounded-full bg-neutral-100 px-5 py-3 text-sm font-medium text-neutral-900 transition-all duration-300 hover:bg-white hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            {empezando
              ? "Preparando..."
              : hayQueEnsenar
                ? "Empezar a enseñar y practicar"
                : "Practicar igual"}
          </button>
          {errorEmpezar && (
            <p className="flex items-start gap-1.5 text-xs text-red-400">
              <IconoAlerta className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{errorEmpezar}</span>
            </p>
          )}
          <button
            onClick={onVolver}
            className="w-full rounded-full border border-neutral-800 px-5 py-3 text-sm text-neutral-400 transition-colors duration-300 hover:border-neutral-700 hover:bg-neutral-900/60 hover:text-neutral-200"
          >
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  );
}

