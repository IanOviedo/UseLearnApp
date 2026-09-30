"use client";

import { IconoCheck } from "@/components/ui/Iconos";

// Fase C2 — stepper del flujo completo: Sondeo → Plan → Enseñar y practicar → Cerrar.
// Se muestra en el plan y en la fase de enseñanza para que siempre se vea dónde se está.

const PASOS = ["Sondeo", "Plan", "Enseñar y practicar", "Cerrar"] as const;

interface StepperProps {
  /** Índice de la fase activa: 0 sondeo, 1 plan, 2 enseñar, 3 cerrar. */
  actual: number;
  className?: string;
}

export default function Stepper({ actual, className = "" }: StepperProps) {
  return (
    <ol className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      {PASOS.map((paso, indice) => {
        const activo = indice === actual;
        const hecho = indice < actual;
        return (
          <li key={paso} className="flex items-center gap-2">
            <span className="flex items-center gap-1.5">
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] tabular-nums transition-colors ${
                  activo
                    ? "border-neutral-200 bg-neutral-100 text-neutral-900"
                    : hecho
                      ? "border-neutral-600 bg-neutral-800 text-neutral-300"
                      : "border-neutral-800 bg-neutral-950/60 text-neutral-600"
                }`}
              >
                {hecho ? <IconoCheck className="h-3 w-3" /> : indice + 1}
              </span>
              <span
                className={`text-xs ${
                  activo ? "text-neutral-200" : hecho ? "text-neutral-500" : "text-neutral-600"
                }`}
              >
                {paso}
              </span>
            </span>
            {indice < PASOS.length - 1 && <span className="h-px w-5 bg-neutral-800" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
