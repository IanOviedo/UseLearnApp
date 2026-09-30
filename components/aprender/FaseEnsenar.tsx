"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { IconoAlerta, IconoCargador, IconoCheck, IconoFlecha, IconoObjetivo } from "@/components/ui/Iconos";
import Stepper from "@/components/ui/Stepper";
import { leerConfigLocal } from "@/lib/config-cliente";
import EjercicioCodigo from "./EjercicioCodigo";
import EjercicioQuiz from "./EjercicioQuiz";
import type {
  Ejercicio,
  EstadoSesion,
  Explicacion,
  IntentoEjercicio,
  RutaSubtema,
} from "@/lib/tipos";

// Fase D — pantalla de Enseñar/Practicar: sidebar de sub-temas con su ruta y, a la
// derecha, el micro-loop de la fase: explicaciones (según la ruta) → ejercicios.
// El material se pide con POST /api/aprender/bloque (genera si falta, cachea si existe).

const ETIQUETA_RUTA: Record<RutaSubtema, { etiqueta: string; punto: string }> = {
  reforzar: { etiqueta: "Enseñar + practicar", punto: "bg-amber-400" },
  asegurar: { etiqueta: "Repaso + práctica", punto: "bg-sky-400" },
  practicar: { etiqueta: "Práctica", punto: "bg-green-400" },
  sin_evaluar: { etiqueta: "Desde cero", punto: "bg-neutral-500" },
};

const ETIQUETA_TIPO: Record<string, string> = {
  que_es: "Qué es",
  como_se_usa: "Cómo se usa en la práctica",
  variaciones: "Variaciones y errores típicos",
  mas_texto: "Profundización",
};

interface BloqueAprendizaje {
  ruta: RutaSubtema;
  explicaciones: Explicacion[];
  ejercicios: Ejercicio[];
  ultimosIntentos: Record<number, IntentoEjercicio | null>;
}

interface FaseEnsenarProps {
  sesionId: number;
  estado: EstadoSesion;
  /** Persiste la fase "cerrar" en el server. El padre cambia de pantalla al resolver. */
  onCerrar: () => Promise<void>;
}

export default function FaseEnsenar({ sesionId, estado, onCerrar }: FaseEnsenarProps) {
  const rutas = useMemo(
    () => new Map(estado.rutas.map((bloque) => [bloque.subtemaId, bloque.ruta])),
    [estado.rutas]
  );
  const conteos = useMemo(
    () => new Map(estado.aprendizaje.map((conteo) => [conteo.subtemaId, conteo])),
    [estado.aprendizaje]
  );

  // Arranca por el primer sub-tema que necesita enseñanza (la ruta más pesada).
  const [subtemaActivo, setSubtemaActivo] = useState<number>(() => {
    const prioritario = estado.rutas.find(
      (bloque) => bloque.ruta === "reforzar" || bloque.ruta === "sin_evaluar"
    );
    return (prioritario ?? estado.rutas[0])?.subtemaId ?? 0;
  });

  const [bloque, setBloque] = useState<BloqueAprendizaje | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [indiceExplicacion, setIndiceExplicacion] = useState(0);
  const [aprobados, setAprobados] = useState<Set<number>>(new Set());
  const [cerrando, setCerrando] = useState(false);
  const [errorCerrar, setErrorCerrar] = useState<string | null>(null);

  const cargarBloque = useCallback(
    async (subtemaId: number) => {
      setCargando(true);
      setError(null);
      setBloque(null);
      setAprobados(new Set());
      setIndiceExplicacion(0);
      try {
        // Los modelos salen de Ajustes (localStorage): el servidor no puede leerlos y,
        // sin esto, el material se generaba siempre con el default del servidor.
        const config = leerConfigLocal();
        const res = await fetch("/api/aprender/bloque", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sesionId,
            subtemaId,
            modeloPrincipal: config.modeloPrincipal,
            proveedor: config.proveedorPrincipal,
          }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }
        setBloque({
          ruta: data.ruta,
          explicaciones: Array.isArray(data.explicaciones) ? data.explicaciones : [],
          ejercicios: Array.isArray(data.ejercicios) ? data.ejercicios : [],
          ultimosIntentos: data.ultimosIntentos ?? {},
        });
      } catch {
        setError("No se pudo conectar con el servidor.");
      } finally {
        setCargando(false);
      }
    },
    [sesionId]
  );

  useEffect(() => {
    if (subtemaActivo <= 0) return;
    let cancelado = false;
    // Diferido vía callback: el lint de React castiga el setState síncrono dentro del
    // effect (mismo patrón que la landing usa para hidratar modelos y proveedores).
    void Promise.resolve().then(() => {
      if (!cancelado) void cargarBloque(subtemaActivo);
    });
    return () => {
      cancelado = true;
    };
  }, [subtemaActivo, cargarBloque]);

  function marcarAprobado(ejercicioId: number) {
    setAprobados((previos) => new Set(previos).add(ejercicioId));
  }

  async function cerrar() {
    setCerrando(true);
    setErrorCerrar(null);
    try {
      await onCerrar();
    } catch (errorCierre) {
      setErrorCerrar(
        errorCierre instanceof Error ? errorCierre.message : "No se pudo cerrar la sesión."
      );
    } finally {
      setCerrando(false);
    }
  }

  const subtemaActual = estado.subtemas.find((subtema) => subtema.id === subtemaActivo);
  const rutaActual = rutas.get(subtemaActivo) ?? "sin_evaluar";
  const enFaseLectura = !!bloque && indiceExplicacion < bloque.explicaciones.length;
  const todosAprobados =
    !!bloque &&
    bloque.ejercicios.length > 0 &&
    bloque.ejercicios.every(
      (ejercicio) =>
        aprobados.has(ejercicio.id) || bloque.ultimosIntentos[ejercicio.id]?.aprobado === true
    );
  const indiceActual = estado.subtemas.findIndex((subtema) => subtema.id === subtemaActivo);
  const siguienteSubtema = estado.subtemas[indiceActual + 1];

  /** Progreso del sidebar: el sub-tema activo en vivo, los demás con la base. */
  function resumenSubtema(subtemaId: number): string {
    if (subtemaId === subtemaActivo && bloque) {
      const lecturas = `${Math.min(indiceExplicacion, bloque.explicaciones.length)}/${bloque.explicaciones.length} lecturas`;
      const practicas = `${bloque.ejercicios.filter(
        (ejercicio) => aprobados.has(ejercicio.id) || bloque.ultimosIntentos[ejercicio.id]?.aprobado
      ).length}/${bloque.ejercicios.length} prácticas`;
      return [bloque.explicaciones.length > 0 ? lecturas : null, practicas]
        .filter(Boolean)
        .join(" · ");
    }
    const conteo = conteos.get(subtemaId);
    if (!conteo || conteo.ejercicios === 0) return "pendiente";
    return `${conteo.ejerciciosAprobados}/${conteo.ejercicios} prácticas`;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-neutral-950 text-neutral-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_100%)]" />

      <div className="relative mx-auto max-w-6xl px-8 py-10">
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">
              Enseñar y practicar
            </p>
            <button
              onClick={() => void cerrar()}
              disabled={cerrando}
              className="rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-500 transition-colors hover:border-neutral-700 hover:text-neutral-200 disabled:opacity-50"
            >
              {cerrando ? "Cerrando..." : "Cerrar la sesión"}
            </button>
          </div>
          <Stepper actual={2} />
          {errorCerrar && <p className="text-xs text-red-400">{errorCerrar}</p>}
        </div>

        <div className="grid grid-cols-[280px_1fr] gap-6">
          {/* Sidebar: sub-temas con su ruta y progreso */}
          <aside className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-4 self-start">
            <p className="mb-3 text-xs uppercase tracking-wider text-neutral-500">Sub-temas</p>
            <ul className="flex flex-col gap-1.5">
              {estado.subtemas.map((subtema) => {
                const activo = subtema.id === subtemaActivo;
                const ruta = rutas.get(subtema.id) ?? "sin_evaluar";
                const meta = ETIQUETA_RUTA[ruta];
                return (
                  <li key={subtema.id}>
                    <button
                      onClick={() => setSubtemaActivo(subtema.id)}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 ${
                        activo
                          ? "border-neutral-700 bg-neutral-900"
                          : "border-transparent hover:bg-neutral-900/60"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.punto}`} />
                        <span className={`text-sm ${activo ? "text-neutral-100" : "text-neutral-400"}`}>
                          {subtema.nombre}
                        </span>
                      </span>
                      <span className="mt-1 flex items-center justify-between gap-2 pl-4">
                        <span className="text-[11px] text-neutral-600">{meta.etiqueta}</span>
                        <span className="text-[11px] tabular-nums text-neutral-500">
                          {resumenSubtema(subtema.id)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <main className="flex min-w-0 flex-col gap-4">
            {/* Cabecera del sub-tema activo */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/50 px-5 py-4">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/60 text-neutral-400">
                  <IconoObjetivo className="h-4 w-4" />
                </span>
                <div>
                  <h1 className="text-base font-semibold tracking-tight text-neutral-100">
                    {subtemaActual?.nombre ?? "Sub-tema"}
                  </h1>
                  <span className="text-xs text-neutral-500">
                    {ETIQUETA_RUTA[rutaActual].etiqueta}
                  </span>
                </div>
              </div>
              {siguienteSubtema && (
                <button
                  onClick={() => setSubtemaActivo(siguienteSubtema.id)}
                  className="flex items-center gap-1.5 rounded-full border border-neutral-800 px-3.5 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
                >
                  Saltar al siguiente
                  <IconoFlecha className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {cargando && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/50 px-6 py-12 text-center">
                <IconoCargador className="h-5 w-5 text-neutral-400" />
                <p className="text-sm text-neutral-400">
                  Preparando explicaciones y ejercicios con el modelo...
                </p>
                <p className="text-xs text-neutral-600">
                  La primera vez de cada sub-tema puede tardar unos segundos.
                </p>
              </div>
            )}

            {!cargando && error && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-6 py-8 text-center">
                <p className="flex items-start gap-2 text-sm text-red-300">
                  <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </p>
                <button
                  onClick={() => void cargarBloque(subtemaActivo)}
                  className="rounded-full bg-neutral-100 px-5 py-2 text-sm font-medium text-neutral-900 transition-colors hover:bg-white"
                >
                  Reintentar
                </button>
              </div>
            )}

            {/* Fase lectura: una explicación por pantalla (la ruta decide cuántas hay). */}
            {!cargando && !error && bloque && enFaseLectura && (
              <div className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="rounded-full border border-neutral-700/60 bg-neutral-800/60 px-2.5 py-0.5 text-xs text-neutral-300">
                    {ETIQUETA_TIPO[bloque.explicaciones[indiceExplicacion].tipo] ?? "Explicación"}
                  </span>
                  <span className="text-xs tabular-nums text-neutral-600">
                    {indiceExplicacion + 1}/{bloque.explicaciones.length}
                  </span>
                </div>

                <h2 className="mb-2 text-lg font-semibold tracking-tight text-neutral-100">
                  {bloque.explicaciones[indiceExplicacion].titulo}
                </h2>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
                  {bloque.explicaciones[indiceExplicacion].contenido}
                </p>

                {bloque.explicaciones[indiceExplicacion].ejemplo && (
                  <p className="mt-4 rounded-xl border border-neutral-800/70 bg-neutral-950/50 p-3 text-sm leading-relaxed text-neutral-400">
                    <span className="mb-1 block text-xs uppercase tracking-wider text-neutral-600">
                      Ejemplo
                    </span>
                    {bloque.explicaciones[indiceExplicacion].ejemplo}
                  </p>
                )}

                <div className="mt-5 flex items-center justify-between gap-3">
                  {indiceExplicacion > 0 ? (
                    <button
                      onClick={() => setIndiceExplicacion((i) => i - 1)}
                      className="rounded-full border border-neutral-800 px-4 py-2 text-xs text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
                    >
                      ← Anterior
                    </button>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => setIndiceExplicacion((i) => i + 1)}
                    className="flex items-center gap-2 rounded-full bg-neutral-100 px-5 py-2 text-sm font-medium text-neutral-900 transition-all duration-200 hover:bg-white hover:shadow-md"
                  >
                    {indiceExplicacion + 1 === bloque.explicaciones.length
                      ? "Ir a los ejercicios"
                      : "Siguiente"}
                    <IconoFlecha className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Fase práctica: quiz + par de código (js/jsx) cuando ya no hay lectura. */}
            {!cargando && !error && bloque && !enFaseLectura && (
              <>
                <p className="text-xs uppercase tracking-wider text-neutral-500">
                  Práctica ({bloque.ejercicios.length})
                </p>

                {bloque.ejercicios.map((ejercicio) =>
                  ejercicio.tipo === "quiz" ? (
                    <EjercicioQuiz
                      key={ejercicio.id}
                      ejercicio={ejercicio}
                      ultimoIntento={bloque.ultimosIntentos[ejercicio.id] ?? null}
                      onAprobado={marcarAprobado}
                    />
                  ) : (
                    <EjercicioCodigo
                      key={ejercicio.id}
                      ejercicio={ejercicio}
                      ultimoIntento={bloque.ultimosIntentos[ejercicio.id] ?? null}
                      onAprobado={marcarAprobado}
                    />
                  )
                )}

                {todosAprobados && (
                  <div className="animate-fade-in-up flex flex-col items-center gap-3 rounded-2xl border border-green-500/25 bg-green-500/[0.06] p-6 text-center">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-green-600/40 bg-green-500/10 text-green-400">
                      <IconoCheck className="h-5 w-5" />
                    </span>
                    <p className="text-sm text-green-200">
                      ¡Sub-tema practicado! Todas las condiciones pasan.
                    </p>
                    {siguienteSubtema ? (
                      <button
                        onClick={() => setSubtemaActivo(siguienteSubtema.id)}
                        className="flex items-center gap-2 rounded-full bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-900 transition-all duration-200 hover:bg-white hover:shadow-md"
                      >
                        Siguiente: {siguienteSubtema.nombre}
                        <IconoFlecha className="h-4 w-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => void cerrar()}
                        disabled={cerrando}
                        className="rounded-full bg-neutral-100 px-5 py-2.5 text-sm font-medium text-neutral-900 transition-all duration-200 hover:bg-white hover:shadow-md disabled:opacity-50"
                      >
                        {cerrando ? "Cerrando..." : "Cerrar la sesión"}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}