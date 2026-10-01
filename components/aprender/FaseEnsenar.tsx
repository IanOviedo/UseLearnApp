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
  /**
   * Números del server para localizar en qué capa se pierde un ejercicio. El caso reportado era
   * "el sidebar dice 3 y solo se ven 2": la base tiene los 3, así que si acá `servidos` es 3 y
   * `pintados` es 2, el problema está en el render, y no hay forma de adivinarlo sin esto.
   */
  diagnostico?: {
    enBase: number;
    generados: number;
    servidos: number;
    ids: number[];
    tipos: string[];
    pedidosPrevios: number;
  };
  /** Cuántos ejercicios se pintaron de verdad. Contra `servidos` es el detector del bug. */
  pintados?: number;
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

  /**
   * Sub-temas saltados, en estado local para que el sidebar reaccione al instante. La fuente de
   * verdad es el servidor: `estado.subtemas[].saltado` al cargar, y el endpoint al saltar.
   */
  const [saltados, setSaltados] = useState<Set<number>>(
    () => new Set(estado.subtemas.filter((s) => s.saltado).map((s) => s.id))
  );

  /**
   * Salta al siguiente sub-tema dejando registro. El registro es lo que faltaba: antes solo se
   * cambiaba el `useState`, así que al recargar volvía a "pendiente" con un contador que no bajaba.
   * El avance no espera al POST: la UI responde al instante y si el registro falla, el error sale
   * aparte sin dejar al usuario trabado.
   */
  async function saltarA(siguienteId: number, actualId: number) {
    setSubtemaActivo(siguienteId);
    if (saltados.has(actualId)) return;
    setSaltados((previos) => new Set(previos).add(actualId));
    try {
      await fetch("/api/aprender/saltar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtemaId: actualId, saltado: true }),
      });
    } catch {
      // Sin conexión el registro se pierde, pero el avance ya pasó: no se bloquea al usuario.
      setSaltados((previos) => {
        const copia = new Set(previos);
        copia.delete(actualId);
        return copia;
      });
      setError("No se pudo registrar que saltaste este sub-tema.");
    }
  }

  /**
   * Detector del bug "el sidebar dice 3 y solo se ven 2": cuenta cuántos ejercicios están
   * REALMENTE en el DOM y lo compara con los que llegaron del servidor.
   *
   * Se cuenta desde el DOM y no desde un estado con un contador, porque el contador mentiría justo
   * en el caso que queremos detectar: si React no monta una card, ningún `setState` lo registra.
   * Con `querySelectorAll` la pregunta es directa: ¿están las tres en pantalla?
   *
   * `-1` = todavía no medido (evita un `setState` directo en el efecto, que el lint de React no
   * permite); el setPintados real ocurre dentro del `requestAnimationFrame`, ya diferido.
   */
  const [pintados, setPintados] = useState(-1);
  useEffect(() => {
    if (!bloque) return;
    // Un frame de margen: el efecto corre después del commit, pero el layout de las cards
    // anidadas (que las monta un efecto propio) necesita un tick más.
    const id = requestAnimationFrame(() => {
      setPintados(document.querySelectorAll("[data-ejercicio]").length);
    });
    return () => cancelAnimationFrame(id);
  }, [bloque]);

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
            // El preset también aplica acá: sin esto, el material se genera con los defaults del
            // server y no con los que el usuario eligió en Ajustes (mismo bug que tenía el sondeo).
            preset: config.preset,
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
          diagnostico: data.diagnostico,
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

  // Completar un sub-tema que se había saltado lo devuelve al estado normal: si no, el sidebar
  // seguiría diciendo "saltado" sobre un sub-tema que el usuario terminó, que es peor que mentiroso.
  // Se resuelve en `marcarAprobado` (evento) y no en un efecto: el lint de React no permite
  // setState sincrónico dentro de un efecto, y además acá el aprobado es el que dispara el cambio.
  function desSaltarSiSeCompleto(subtemaId: number, yaAprobados: Set<number>) {
    if (!todasPracticasAprobadas(yaAprobados)) return;
    setSaltados((previos) => {
      if (!previos.has(subtemaId)) return previos;
      const copia = new Set(previos);
      copia.delete(subtemaId);
      return copia;
    });
    void fetch("/api/aprender/saltar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subtemaId, saltado: false }),
    }).catch(() => {
      /* si falla el POST, el flag queda en "saltado": es cosmético y no bloquea nada */
    });
  }

  /** Todas las prácticas del sub-tema actual quedaron aprobadas (contando intentos previos). */
  function todasPracticasAprobadas(conAprobados: Set<number>): boolean {
    if (!bloque || bloque.ejercicios.length === 0) return false;
    return bloque.ejercicios.every(
      (ejercicio) => conAprobados.has(ejercicio.id) || bloque.ultimosIntentos[ejercicio.id]?.aprobado === true
    );
  }

  function marcarAprobado(ejercicioId: number) {
    const nuevos = new Set(aprobados).add(ejercicioId);
    setAprobados(nuevos);
    desSaltarSiSeCompleto(subtemaActivo, nuevos);
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
    // "Saltado" tiene que distinguirse de "pendiente": sin esto, el contador queda clavado en
    // 2/3 para siempre y la sesión parece rota aunque el usuario haya seguido adelante.
    if (saltados.has(subtemaId)) return "saltado";
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
                  onClick={() => void saltarA(siguienteSubtema.id, subtemaActivo)}
                  className="flex items-center gap-1.5 rounded-full border border-neutral-800 px-3.5 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
                >
                  {saltados.has(subtemaActivo) ? "Ir al siguiente" : "Saltar al siguiente"}
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

                {/* Aviso de desajuste: si llegaron N ejercicios y hay M en pantalla, el bug es de
                    render y esto lo dice en vez de dejarlo silencioso. Con N > M se muestra la
                    diferencia; con N < M el problema es del server y su console.warn lo avisa. */}
                {pintados >= 0 && pintados !== bloque.ejercicios.length && (
                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
                    <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/80" />
                    <div className="text-[12px] leading-relaxed text-amber-200/90">
                      <p>
                        Llegaron <strong>{bloque.ejercicios.length}</strong> ejercicios y se están
                        mostrando <strong>{pintados}</strong>. Te faltan{" "}
                        {bloque.ejercicios.length - pintados > 0
                          ? `${bloque.ejercicios.length - pintados} práctica(s).`
                          : "datos por corregir."}
                      </p>
                      <p className="mt-1 text-[11px] text-amber-200/60">
                        Diagnóstico: {bloque.diagnostico
                          ? `en base ${bloque.diagnostico.enBase}, generados ${bloque.diagnostico.generados}, servidos ${bloque.diagnostico.servidos} · ${bloque.diagnostico.tipos.join(", ")}`
                          : "el servidor no mandó diagnóstico"}
                      </p>
                    </div>
                  </div>
                )}

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