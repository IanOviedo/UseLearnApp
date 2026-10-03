"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconoAlerta, IconoChevron, IconoHistorial } from "@/components/ui/Iconos";
import type { ConceptoEstado } from "@/lib/tipos";

interface RespuestaProgreso {
  total: number;
  vencidos: number;
  conceptos: ConceptoEstado[];
  error?: string;
}

/** Fecha SQLite (UTC) → texto corto local. */
function formatearFecha(sqlite: string | null): string {
  if (!sqlite) return "sin programar";
  const iso = sqlite.includes("T") ? sqlite : `${sqlite.replace(" ", "T")}Z`;
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return sqlite;
  return fecha.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
}

const ETIQUETA_CAJA: Record<number, string> = {
  1: "Repaso a 1 día",
  2: "Repaso a 3 días",
  3: "Repaso a 7 días",
};

/** Barra de 3 cajas Leitner: llena = caja alcanzada. */
function Cajas({ caja }: { caja: number }) {
  return (
    <span className="flex items-center gap-1" title={ETIQUETA_CAJA[caja] ?? "Caja 1"}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-4 rounded-full ${n <= caja ? "bg-sky-400/80" : "bg-neutral-800"}`}
        />
      ))}
    </span>
  );
}

export default function ProgresoPage() {
  const router = useRouter();
  const [data, setData] = useState<RespuestaProgreso | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/progreso");
        const json = (await res.json()) as RespuestaProgreso;
        if (cancelado) return;
        if (json.error) {
          setError(json.error);
          return;
        }
        setData(json);
      } catch {
        if (!cancelado) setError("No se pudo conectar con el servidor.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 px-6 py-12 text-neutral-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_100%)]" />
      <main className="relative mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Tu progreso</p>
          <button
            onClick={() => router.push("/")}
            className="text-xs text-neutral-500 transition-colors hover:text-neutral-300"
          >
            Volver al inicio
          </button>
        </div>

        {cargando && (
          <div className="flex items-center justify-center gap-3 py-16 text-neutral-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
            <span className="text-sm">Cargando tu progreso...</span>
          </div>
        )}

        {!cargando && error && (
          <p className="flex items-start gap-2 rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-5 py-4 text-sm text-red-400">
            <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        {!cargando && !error && data && data.conceptos.length === 0 && (
          <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-8 text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950/60 text-neutral-500">
              <IconoHistorial className="h-5 w-5" />
            </span>
            <p className="text-sm text-neutral-300">Todavía no hay conceptos guardados.</p>
            <p className="mt-1 text-xs text-neutral-500">
              Completá una sesión y acá vas a ver qué sabés y cuándo toca repasarlo.
            </p>
          </div>
        )}

        {!cargando && !error && data && data.conceptos.length > 0 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-5">
                <p className="text-3xl font-semibold tabular-nums text-neutral-100">{data.total}</p>
                <p className="mt-1 text-xs text-neutral-500">conceptos en tu memoria</p>
              </div>
              <div className="rounded-2xl border border-sky-500/25 bg-sky-500/[0.06] p-5">
                <p className="text-3xl font-semibold tabular-nums text-sky-300">{data.vencidos}</p>
                <p className="mt-1 text-xs text-neutral-400">te tocan hoy</p>
              </div>
            </div>

            <ul className="flex flex-col gap-2">
              {data.conceptos.map((concepto) => {
                const intentos = concepto.vecesAcierto + concepto.vecesFallo;
                const dominio = intentos > 0 ? Math.round((concepto.vecesAcierto / intentos) * 100) : 0;
                return (
                  <li
                    key={concepto.id}
                    className="flex flex-col gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-neutral-200">{concepto.nombre}</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {concepto.vecesVisto} {concepto.vecesVisto === 1 ? "sesión" : "sesiones"} ·{" "}
                        {concepto.vecesAcierto} aciertos · {concepto.vecesFallo} fallos
                      </p>
                    </div>
                    <div className="flex items-center gap-5">
                      <div className="text-right">
                        <p className="text-sm tabular-nums text-neutral-300">{dominio}%</p>
                        <p className="text-[11px] text-neutral-600">dominio</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Cajas caja={concepto.caja} />
                        <p className="text-[11px] text-neutral-600">
                          Repaso {formatearFecha(concepto.proximoRepaso)}
                        </p>
                      </div>
                      <IconoChevron className="hidden h-4 w-4 text-neutral-700 sm:block" />
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}
