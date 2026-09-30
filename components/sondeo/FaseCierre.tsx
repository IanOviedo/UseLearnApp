"use client";

import { IconoCheck } from "@/components/ui/Iconos";
import Stepper from "@/components/ui/Stepper";

// Fase E (pantalla mínima por ahora) — cierre de la sesión: stepper, resumen y salida.
// El export a Obsidian y el repaso espaciado se agregan acá más adelante.

interface FaseCierreProps {
  tema: string;
  feedback: string | null;
  onVolver: () => void;
}

export default function FaseCierre({ tema, feedback, onVolver }: FaseCierreProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 px-8 py-12 text-neutral-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_100%)]" />

      <div className="relative mx-auto flex max-w-xl flex-col gap-8">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Cierre</p>
        </div>

        <Stepper actual={3} />

        <div className="animate-fade-in-up flex flex-col items-center gap-5 rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-8 text-center shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-green-600/40 bg-green-500/10 text-green-400">
            <IconoCheck className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Sesión cerrada</h1>
          <p className="text-sm text-neutral-400">{tema}</p>
          {feedback && (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-500">{feedback}</p>
          )}
        </div>

        <button
          onClick={onVolver}
          className="w-full rounded-full bg-neutral-100 px-5 py-3 text-sm font-medium text-neutral-900 transition-all duration-300 hover:bg-white hover:shadow-lg"
        >
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
