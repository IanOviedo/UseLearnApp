"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconoAlerta, IconoCargador, IconoHistorial, IconoPlay } from "@/components/ui/Iconos";
import type { ConceptoEstado } from "@/lib/tipos";

// Memoria entre sesiones (sección 11 del ESTADO): "Te tocan N conceptos".
// Es el momento donde la app deja de esperar que la trabajes y empieza a dirigirla:
// muestra los conceptos cuyo repaso venció y arranca una sesión sobre ellos.

interface RespuestaRepaso {
  conceptos: ConceptoEstado[];
  totalVencidos: number;
  totalConceptos: number;
  error?: string;
}

export default function TarjetaRepaso() {
  const router = useRouter();
  const [data, setData] = useState<RespuestaRepaso | null>(null);
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/repaso");
        const json = (await res.json()) as RespuestaRepaso;
        if (!cancelado && !json.error && json.totalVencidos > 0) setData(json);
      } catch {
        // Silencioso: si todavía no hay memoria, la tarjeta simplemente no aparece.
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  const repasar = useCallback(async () => {
    setCreando(true);
    setError(null);
    try {
      const res = await fetch("/api/repaso/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = (await res.json()) as { sesionId?: number; error?: string };
      if (json.error || !json.sesionId) throw new Error(json.error ?? "No se pudo empezar el repaso.");
      router.push(`/sondeo/${json.sesionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo empezar el repaso.");
      setCreando(false);
    }
  }, [router]);

  if (!data) return null;

  const extra = data.totalVencidos - data.conceptos.length;

  return (
    <section className="animate-fade-in-up mt-6 rounded-2xl border border-sky-500/25 bg-sky-500/[0.06] p-5 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10 text-sky-300">
          <IconoHistorial className="h-4 w-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium text-neutral-100">
            Te tocan {data.totalVencidos} concepto{data.totalVencidos === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            Los estudiaste antes y hoy toca repasarlos para no olvidarlos.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {data.conceptos.map((concepto) => (
              <li
                key={concepto.id}
                className="rounded-full border border-neutral-800 bg-neutral-950/50 px-3 py-1 text-xs text-neutral-300"
              >
                {concepto.nombre}
              </li>
            ))}
            {extra > 0 && (
              <li className="rounded-full border border-neutral-800 bg-neutral-950/50 px-3 py-1 text-xs text-neutral-500">
                +{extra} más
              </li>
            )}
          </ul>
          <button
            onClick={repasar}
            disabled={creando}
            className="mt-4 flex items-center gap-2 rounded-full bg-neutral-100 px-4 py-2 text-xs font-medium text-neutral-900 transition-all duration-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creando ? <IconoCargador className="h-3.5 w-3.5" /> : <IconoPlay className="h-3.5 w-3.5" />}
            {creando ? "Preparando repaso..." : "Repasar ahora"}
          </button>
          {error && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-red-400">
              <IconoAlerta className="mt-px h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
