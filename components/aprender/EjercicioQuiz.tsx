"use client";

import { useState } from "react";
import { IconoCheck, IconoDestello, IconoEquis, IconoObjetivo } from "@/components/ui/Iconos";
import type { Ejercicio, IntentoEjercicio } from "@/lib/tipos";

// Fase D — ejercicio conceptual. La corrección SIEMPRE la hace el server contra
// `opciones[indiceCorrecta]`: el cliente solo manda la opción elegida.

interface EjercicioQuizProps {
  ejercicio: Ejercicio;
  ultimoIntento: IntentoEjercicio | null;
  onAprobado: (ejercicioId: number) => void;
}

export default function EjercicioQuiz({ ejercicio, ultimoIntento, onAprobado }: EjercicioQuizProps) {
  const [respuesta, setRespuesta] = useState<string | null>(null);
  const [evaluada, setEvaluada] = useState(false);
  const [correcta, setCorrecta] = useState(false);
  const [mostrarPista, setMostrarPista] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yaAprobada = ultimoIntento?.aprobado ?? false;

  async function responder(opcion: string) {
    if (evaluada) return;
    setRespuesta(opcion);
    setError(null);
    try {
      const res = await fetch("/api/aprender/intento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ejercicioId: ejercicio.id, respuesta: opcion }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setRespuesta(null);
        return;
      }
      setCorrecta(data.aprobado === true);
      setEvaluada(true);
      if (data.aprobado) onAprobado(ejercicio.id);
    } catch {
      setError("No se pudo conectar con el servidor.");
      setRespuesta(null);
    }
  }

  const opciones = ejercicio.opciones ?? [];

  return (
    <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-5 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 rounded-full border border-neutral-700/60 bg-neutral-800/60 px-2.5 py-0.5 text-xs text-neutral-300">
          <IconoObjetivo className="h-3.5 w-3.5" />
          Concepto
        </span>
        {yaAprobada && !evaluada && (
          <span className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-xs text-green-300">
            <IconoCheck className="h-3.5 w-3.5" />
            Aprobado antes
          </span>
        )}
      </div>

      <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
        {ejercicio.enunciado}
      </p>

      <div className="flex flex-col gap-2">
        {opciones.map((opcion, indice) => {
          const esCorrecta = evaluada && indice === ejercicio.indiceCorrecta;
          const esElegida = evaluada && respuesta === opcion;
          const clase = !evaluada
            ? "border-neutral-800 bg-neutral-950/40 hover:border-neutral-600 hover:bg-neutral-900"
            : esCorrecta
              ? "border-green-500/40 bg-green-500/[0.08] text-green-200"
              : esElegida
                ? "border-red-500/40 bg-red-500/[0.08] text-red-300"
                : "border-neutral-800/60 bg-neutral-950/30 text-neutral-600";
          return (
            <button
              key={opcion}
              onClick={() => responder(opcion)}
              disabled={evaluada}
              className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150 disabled:cursor-default ${clase}`}
            >
              <span className="text-xs tabular-nums text-neutral-600">
                {String.fromCharCode(65 + indice)}.
              </span>
              <span>{opcion}</span>
              {esCorrecta && <IconoCheck className="ml-auto h-4 w-4 shrink-0" />}
              {esElegida && !esCorrecta && <IconoEquis className="ml-auto h-4 w-4 shrink-0" />}
            </button>
          );
        })}
      </div>

      {evaluada && (
        <div className="mt-4 rounded-xl border border-neutral-800/70 bg-neutral-950/50 p-3">
          <p className={`mb-1 text-sm font-medium ${correcta ? "text-green-400" : "text-amber-300"}`}>
            {correcta ? "¡Correcto!" : `No: la respuesta correcta es "${opciones[ejercicio.indiceCorrecta ?? 0]}".`}
          </p>
          {ejercicio.solucion && (
            <p className="text-xs leading-relaxed text-neutral-400">{ejercicio.solucion}</p>
          )}
        </div>
      )}

      {!evaluada && (
        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => setMostrarPista((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
          >
            <IconoDestello className="h-3.5 w-3.5" />
            Pista
          </button>
          {mostrarPista && ejercicio.pista && (
            <span className="text-xs text-neutral-500">{ejercicio.pista}</span>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
