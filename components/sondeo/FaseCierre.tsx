"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconoAlerta, IconoCargador, IconoCheck, IconoDocumento, IconoHistorial } from "@/components/ui/Iconos";
import Stepper from "@/components/ui/Stepper";

// Fase Cerrar completa (sección 6, ítem 9): comparativa antes/después, recursos por
// sub-tema, export a Obsidian y repaso espaciado sobre los conceptos de la sesión.
// Todo se lee del servidor (`/cierre`), así que recargar no pierde la comparativa.

interface Recurso {
  titulo: string;
  url: string;
  tipo: string;
}

interface DetalleSubtema {
  id: number;
  nombre: string;
  cubierto: boolean;
  correctas: number;
  incorrectas: number;
  intentos: number;
  ejercicios: number;
  aprobados: number;
  recursos: Recurso[];
  busqueda: string;
}

interface ConceptoCierre {
  id: number;
  nombre: string;
  caja: number;
  proximoRepaso: string | null;
}

interface RespuestaCierre {
  tema: string;
  modo: string;
  feedback: string | null;
  resumen: {
    subtemas: number;
    cubiertos: number;
    aReforzar: number;
    sinDominar: number;
    ejercicios: number;
    aprobados: number;
  };
  subtemas: DetalleSubtema[];
  conceptos: ConceptoCierre[];
  error?: string;
}

interface FaseCierreProps {
  sesionId: number;
  tema: string;
  feedback: string | null;
  onVolver: () => void;
}

export default function FaseCierre({ sesionId, tema, feedback, onVolver }: FaseCierreProps) {
  const router = useRouter();
  const [data, setData] = useState<RespuestaCierre | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repasando, setRepasando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch(`/api/sesiones/${sesionId}/cierre`);
        const json = (await res.json()) as RespuestaCierre;
        if (cancelado) return;
        if (json.error) setError(json.error);
        else setData(json);
      } catch {
        if (!cancelado) setError("No se pudo cargar el cierre de la sesión.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [sesionId]);

  const repasar = useCallback(async () => {
    if (!data || data.conceptos.length === 0) return;
    setRepasando(true);
    setError(null);
    try {
      const res = await fetch("/api/repaso/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conceptos: data.conceptos.map((concepto) => concepto.id) }),
      });
      const json = (await res.json()) as { sesionId?: number; error?: string };
      if (json.error || !json.sesionId) throw new Error(json.error ?? "No se pudo empezar el repaso.");
      router.push(`/sondeo/${json.sesionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo empezar el repaso.");
      setRepasando(false);
    }
  }, [data, router]);

  const temaMostrado = data?.tema ?? tema;
  const feedbackMostrado = data?.feedback ?? feedback;
  const resumen = data?.resumen;

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 px-6 py-12 text-neutral-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_100%)]" />
      <div className="relative mx-auto flex max-w-2xl flex-col gap-6">
        <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Cierre</p>
        <Stepper actual={3} />

        <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-7 text-center shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-green-600/40 bg-green-500/10 text-green-400">
            <IconoCheck className="h-6 w-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-100">Sesión cerrada</h1>
          <p className="text-sm text-neutral-400">{temaMostrado}</p>
        </div>

        {cargando && (
          <div className="flex items-center justify-center gap-3 py-10 text-neutral-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
            <span className="text-sm">Cargando el cierre...</span>
          </div>
        )}

        {!cargando && error && (
          <p className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-5 py-4 text-sm text-red-400">
            <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {!cargando && data && resumen && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-5">
                <p className="text-xs text-neutral-500">Antes (diagnóstico)</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-neutral-100">
                  {resumen.cubiertos} / {resumen.subtemas}
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">sub-temas dominados</p>
              </div>
              <div className="rounded-2xl border border-green-500/25 bg-green-500/[0.06] p-5">
                <p className="text-xs text-neutral-500">Después (práctica)</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-green-300">
                  {resumen.aprobados} / {resumen.ejercicios}
                </p>
                <p className="mt-1 text-[11px] text-neutral-500">ejercicios aprobados</p>
              </div>
            </div>

            {(resumen.aReforzar > 0 || resumen.sinDominar > 0) && (
              <p className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] px-5 py-4 text-xs text-amber-300">
                Quedan {resumen.aReforzar} sub-temas a reforzar y {resumen.sinDominar} sin dominar. El
                repaso de abajo vuelve a tocar esos conceptos.
              </p>
            )}

            {feedbackMostrado && (
              <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6">
                <h2 className="mb-2 text-sm font-semibold text-neutral-100">Diagnóstico</h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-400">
                  {feedbackMostrado}
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6">
              <h2 className="mb-3 text-sm font-semibold text-neutral-100">Práctica y recursos</h2>
              <ul className="flex flex-col gap-3">
                {data.subtemas.map((subtema) => {
                  const total = subtema.correctas + subtema.incorrectas;
                  return (
                    <li
                      key={subtema.id}
                      className="rounded-xl border border-neutral-800/60 bg-neutral-950/40 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate text-sm text-neutral-300">
                          {subtema.nombre}
                        </span>
                        <span className="shrink-0 text-[11px] text-neutral-500">
                          {subtema.correctas}/{total} · {subtema.aprobados}/{subtema.ejercicios} ej.
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {subtema.recursos.map((recurso) => (
                          <a
                            key={recurso.url}
                            href={recurso.url}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-full border border-neutral-800 px-3 py-1 text-[11px] text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
                          >
                            {recurso.titulo}
                          </a>
                        ))}
                        <a
                          href={subtema.busqueda}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full border border-neutral-800 px-3 py-1 text-[11px] text-neutral-500 transition-colors hover:border-neutral-700 hover:text-neutral-300"
                        >
                          Buscar videos
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              {data.conceptos.length > 0 && (
                <button
                  onClick={repasar}
                  disabled={repasando}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-neutral-100 px-5 py-3 text-sm font-medium text-neutral-900 transition-all duration-300 hover:bg-white hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {repasando ? (
                    <IconoCargador className="h-4 w-4" />
                  ) : (
                    <IconoHistorial className="h-4 w-4" />
                  )}
                  {repasando
                    ? "Preparando repaso..."
                    : `Repasar estos ${data.conceptos.length} conceptos`}
                </button>
              )}
              <a
                href={`/api/sesiones/${sesionId}/export`}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-neutral-800 px-5 py-3 text-sm text-neutral-300 transition-colors hover:border-neutral-700 hover:bg-neutral-900/60"
              >
                <IconoDocumento className="h-4 w-4" />
                Descargar para Obsidian
              </a>
              <button
                onClick={onVolver}
                className="w-full rounded-full border border-neutral-800 px-5 py-3 text-sm text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-900/60 hover:text-neutral-200"
              >
                Volver al inicio
              </button>
            </div>
          </>
        )}

        {!cargando && !data && !error && (
          <button
            onClick={onVolver}
            className="w-full rounded-full border border-neutral-800 px-5 py-3 text-sm text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-900/60 hover:text-neutral-200"
          >
            Volver al inicio
          </button>
        )}
      </div>
    </div>
  );
}

