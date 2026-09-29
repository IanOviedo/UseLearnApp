"use client";

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  IconoAlerta,
  IconoCargador,
  IconoCheck,
  IconoEquis,
  IconoFlecha,
} from "@/components/ui/Iconos";
import { proveedorDeModelo, type ProveedorNube } from "@/lib/proveedores";
import type { ItemHistorial, LoteItem, Pregunta, ProgresoSondeo } from "@/lib/tipos";

interface SiguientePreguntaResponse {
  completo: boolean;
  subtemaId?: number;
  subtemaNombre?: string;
  preguntaId?: number;
  pregunta?: Pregunta;
  /** Fase B.10 — el lote completo ya guardado: el cliente cachea el resto. */
  lote?: LoteItem[];
  feedback?: string;
  subtemasDebiles?: string[];
  error?: string;
  respondidas?: number;
  totalServibles?: number;
  subtemasTotal?: number;
  subtemasCubiertos?: number;
}

interface ResponderResponse {
  ok?: boolean;
  correcta?: boolean;
  subtemaId?: number;
  yaRespondida?: boolean;
  error?: string;
  /** Fase B.10 — merge: llega cuando se mandó `siguiente: true` y no había nada cacheado. */
  siguiente?: SiguientePreguntaResponse;
  siguienteError?: string;
}

interface PreguntaEnCurso {
  subtemaId: number;
  subtemaNombre: string;
  preguntaId: number;
  pregunta: Pregunta;
  opcionElegida: string | null;
}

/** Pregunta del lote que todavía no se mostró: vive en memoria, no en la base. */
interface ItemCache {
  subtemaId: number;
  subtemaNombre: string;
  preguntaId: number;
  pregunta: Pregunta;
}

interface FaseSondeoProps {
  sesionId: number;
  /** Respuestas ya registradas en el servidor, para reanudar al recargar la página. */
  historialInicial?: ItemHistorial[];
  onSondeoCompleto: (feedback: string, subtemasDebiles: string[]) => void;
}

const PROGRESO_INICIAL: ProgresoSondeo = {
  respondidas: 0,
  totalServibles: 0,
  subtemasTotal: 0,
  subtemasCubiertos: 0,
};

function barajar<T>(array: T[]): T[] {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function barajarPregunta(pregunta: Pregunta): Pregunta {
  const opcionesConFlag = pregunta.opciones.map((texto, i) => ({
    texto,
    esCorrecta: i === pregunta.indiceCorrecta,
  }));
  const barajadas = barajar(opcionesConFlag);
  const nuevoIndice = barajadas.findIndex((o) => o.esCorrecta);

  return {
    ...pregunta,
    opciones: barajadas.map((o) => o.texto),
    indiceCorrecta: nuevoIndice,
  };
}

/** Convierte el historial guardado en el servidor en el estado local del componente. */
function historialLocalDe(historial: ItemHistorial[]): PreguntaEnCurso[] {
  return historial.map((item) => ({
    subtemaId: item.subtemaId,
    subtemaNombre: item.subtemaNombre,
    preguntaId: item.preguntaId,
    pregunta: item.pregunta,
    opcionElegida: item.opcionElegida,
  }));
}

/** La config del proveedor viaja en la query/body: el servidor no puede leer localStorage. */
function agregarProveedorAParams(
  params: URLSearchParams,
  prefijo: string,
  proveedor: ProveedorNube | null
): void {
  if (!proveedor) return;
  params.set(`${prefijo}Nombre`, proveedor.nombre);
  params.set(`${prefijo}BaseUrl`, proveedor.baseUrl);
  params.set(`${prefijo}ApiKey`, proveedor.apiKey);
  params.set(`${prefijo}Formato`, proveedor.formato);
  if (proveedor.modelo) params.set(`${prefijo}Modelo`, proveedor.modelo);
}

/** Lee toda la config del localStorage en un solo lugar. */
function leerConfigLocal() {
  const modeloPreguntas = localStorage.getItem("uselearn:modeloPreguntas") ?? "";
  const modeloPrincipal = localStorage.getItem("uselearn:modeloPrincipal") ?? "";
  let proveedores: ProveedorNube[] = [];
  try {
    proveedores = JSON.parse(localStorage.getItem("proveedoresNube") ?? "[]") as ProveedorNube[];
  } catch {
    proveedores = [];
  }
  return {
    modeloPreguntas,
    modeloPrincipal,
    proveedorPreguntas: proveedorDeModelo(proveedores, modeloPreguntas),
    proveedorPrincipal: proveedorDeModelo(proveedores, modeloPrincipal),
    // Fase B.11 — el usuario puede apagar la pre-generación desde Ajustes.
    pregen: localStorage.getItem("uselearn:pregen") !== "0",
  };
}

/**
 * Fase B.12 — las respondidas se colapsan a una fila compacta (memoizada): el DOM
 * solo muestra completa la pregunta activa, así el costo de re-render por pregunta
 * nueva es mínimo aunque el historial crezca.
 */
const FilaRespondida = memo(function FilaRespondida({
  item,
  numero,
}: {
  item: PreguntaEnCurso;
  numero: number;
}) {
  const correcta = item.pregunta.opciones[item.pregunta.indiceCorrecta];
  const acerto = item.opcionElegida === correcta;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-neutral-800/40 bg-neutral-900/30 px-4 py-2.5">
      {acerto ? (
        <IconoCheck className="h-3.5 w-3.5 shrink-0 text-green-500" />
      ) : (
        <IconoEquis className="h-3.5 w-3.5 shrink-0 text-red-500" />
      )}
      <span className="text-xs tabular-nums text-neutral-600">{numero}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-neutral-500">
        {item.pregunta.pregunta}
      </span>
      {!acerto && (
        <span
          className="hidden max-w-[38%] shrink-0 truncate text-right text-xs text-green-700 sm:block"
          title={correcta}
        >
          {correcta}
        </span>
      )}
    </div>
  );
});

export default function FaseSondeo({
  sesionId,
  historialInicial = [],
  onSondeoCompleto,
}: FaseSondeoProps) {
  const router = useRouter();

  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [cargandoSiguiente, setCargandoSiguiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completo, setCompleto] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  // Se arranca desde el historial guardado en el servidor: recargar la página ya no
  // borra todo lo que se había respondido.
  const [historial, setHistorial] = useState<PreguntaEnCurso[]>(() =>
    historialLocalDe(historialInicial)
  );
  const [progreso, setProgreso] = useState<ProgresoSondeo>(PROGRESO_INICIAL);
  const [subtemasDebiles, setSubtemasDebiles] = useState<string[]>([]);

  const finRef = useRef<HTMLDivElement>(null);
  const notificadoRef = useRef(false);
  const enviandoRef = useRef(false);

  // Fase B.10 — caché local del lote: cuando llega la primera pregunta de un
  // sub-tema, las otras 3 ya vienen en `lote`. Mientras haya ítems acá, avanzar no
  // toca la red (latencia cero entre preguntas del mismo lote).
  const cacheRef = useRef<ItemCache[]>([]);
  // Preguntas ya servidas/mostradas (incluye el historial restaurado): evita
  // duplicados cuando dos payloads traen el mismo lote.
  const vistasRef = useRef<Set<number>>(new Set(historialInicial.map((i) => i.preguntaId)));

  /** Saca la próxima pregunta de la caché. Devuelve false si la caché está vacía. */
  const mostrarDelCache = useCallback((): boolean => {
    const cache = cacheRef.current;
    while (cache.length > 0) {
      const item = cache.shift()!;
      setHistorial((prev) =>
        prev.some((p) => p.preguntaId === item.preguntaId)
          ? prev
          : [...prev, { ...item, pregunta: barajarPregunta(item.pregunta), opcionElegida: null }]
      );
      return true;
    }
    return false;
  }, []);

  /** Guarda el progreso/pregunta/lote que devuelve el servidor (GET o POST mergeado). */
  const procesarPayload = useCallback((data: SiguientePreguntaResponse) => {
    if (
      typeof data.respondidas === "number" &&
      typeof data.totalServibles === "number" &&
      typeof data.subtemasTotal === "number" &&
      typeof data.subtemasCubiertos === "number"
    ) {
      setProgreso({
        respondidas: data.respondidas,
        totalServibles: data.totalServibles,
        subtemasTotal: data.subtemasTotal,
        subtemasCubiertos: data.subtemasCubiertos,
      });
    }

    if (data.error) {
      setError(data.error);
      return;
    }

    if (data.completo) {
      setCompleto(true);
      setFeedback(data.feedback ?? "");
      // Llegan del servidor: calcularlos en el cliente hacía que al recargar la
      // página el plan terminara siempre vacío ("no fallaste ningún subtema").
      setSubtemasDebiles(data.subtemasDebiles ?? []);
      return;
    }

    if (data.pregunta && data.preguntaId != null && data.subtemaId != null) {
      // Se capturan en consts: el narrowing de `data.xxx` no sobrevive dentro del
      // callback de setHistorial.
      const pregunta = data.pregunta;
      const servida = data.preguntaId;
      const subtemaId = data.subtemaId;
      const subtemaNombre = data.subtemaNombre ?? "";
      const vistas = vistasRef.current;
      for (const itemLote of data.lote ?? []) {
        if (itemLote.preguntaId === servida || vistas.has(itemLote.preguntaId)) continue;
        vistas.add(itemLote.preguntaId);
        cacheRef.current.push({
          subtemaId,
          subtemaNombre,
          preguntaId: itemLote.preguntaId,
          pregunta: itemLote.pregunta,
        });
      }
      setHistorial((prev) =>
        prev.some((p) => p.preguntaId === servida)
          ? prev
          : [
              ...prev,
              {
                subtemaId,
                subtemaNombre,
                preguntaId: servida,
                pregunta: barajarPregunta(pregunta),
                opcionElegida: null,
              },
            ]
      );
    }
  }, []);

  const cargarSiguientePregunta = useCallback(
    async (estaCancelado?: () => boolean) => {
      // Fase B.10 — si el lote ya está en memoria, no se hace ningún request.
      if (mostrarDelCache()) {
        setCargandoInicial(false);
        setCargandoSiguiente(false);
        return;
      }

      setCargandoSiguiente(true);
      setError(null);
      try {
        const config = leerConfigLocal();
        const queryParams = new URLSearchParams({
          sesionId: String(sesionId),
          pregen: config.pregen ? "1" : "0",
        });
        if (config.modeloPreguntas) queryParams.set("modeloPreguntas", config.modeloPreguntas);
        if (config.modeloPrincipal) queryParams.set("modeloPrincipal", config.modeloPrincipal);
        // Se mandan los dos: el del modelo de preguntas y el del modelo principal
        // (el feedback final también puede salir de un proveedor de nube).
        agregarProveedorAParams(queryParams, "proveedorPreguntas", config.proveedorPreguntas);
        agregarProveedorAParams(queryParams, "proveedorPrincipal", config.proveedorPrincipal);

        const res = await fetch(`/api/sondeo/siguiente-pregunta?${queryParams.toString()}`);
        const data: SiguientePreguntaResponse = await res.json();

        if (estaCancelado?.()) return;
        procesarPayload(data);
      } catch {
        if (estaCancelado?.()) return;
        setError("No se pudo conectar con el servidor.");
      } finally {
        if (!estaCancelado?.()) {
          setCargandoInicial(false);
          setCargandoSiguiente(false);
        }
      }
    },
    [sesionId, mostrarDelCache, procesarPayload]
  );

  // Con historial restaurado ya hay algo para mostrar, así que la primera pregunta
  // puede venir de la caché/red sin tapar la pantalla.
  useEffect(() => {
    if (!sesionId) return;
    let cancelado = false;
    // El arranque se difiere un microtask: así el efecto no hace setState sincrono
    // (dispara renders en cascada) cuando la pregunta sale de la caché.
    void Promise.resolve().then(() => cargarSiguientePregunta(() => cancelado));
    return () => {
      cancelado = true;
    };
  }, [sesionId, cargarSiguientePregunta]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [historial.length, completo]);

  useEffect(() => {
    if (!completo || notificadoRef.current) return;
    notificadoRef.current = true;
    onSondeoCompleto(feedback ?? "", subtemasDebiles);
  }, [completo, feedback, subtemasDebiles, onSondeoCompleto]);


  function elegirOpcion(index: number, opcion: string) {
    setHistorial((prev) =>
      prev.map((item, i) =>
        i === index && item.opcionElegida === null ? { ...item, opcionElegida: opcion } : item
      )
    );
  }

  async function responderYAvanzar(index: number) {
    const item = historial[index];
    if (!item?.opcionElegida || enviandoRef.current) return;
    enviandoRef.current = true;
    setCargandoSiguiente(true);

    // Se manda el TEXTO de la opción elegida: el servidor recalcula si era correcta
    // y lo guarda, que es lo que alimenta el feedback y el plan.
    const config = leerConfigLocal();
    try {
      if (cacheRef.current.length > 0) {
        // Caché llena: el POST solo guarda la respuesta (SQLite local, pocos ms) y
        // la siguiente sale de memoria. Un request rápido en vez de dos.
        await fetch("/api/sondeo/responder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preguntaId: item.preguntaId,
            opcionElegida: item.opcionElegida,
          }),
        }).catch(() => {});
        mostrarDelCache();
      } else {
        // Caché vacía: se pide la siguiente EN EL MISMO POST (Fase B.10) — un solo
        // roundtrip aunque el modelo tenga que generar un lote nuevo.
        const res = await fetch("/api/sondeo/responder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            preguntaId: item.preguntaId,
            opcionElegida: item.opcionElegida,
            siguiente: true,
            sesionId,
            modeloPreguntas: config.modeloPreguntas,
            modeloPrincipal: config.modeloPrincipal,
            proveedorPreguntas: config.proveedorPreguntas,
            proveedorPrincipal: config.proveedorPrincipal,
            pregen: config.pregen,
          }),
        });
        const data: ResponderResponse = await res.json();
        if (data.siguiente && !data.siguienteError) {
          procesarPayload(data.siguiente);
        } else {
          // La respuesta quedó registrada igual; la siguiente se pide por el
          // camino normal (GET), que reintenta la generación si hizo falta.
          await cargarSiguientePregunta();
        }
      }
    } catch {
      // Si el merge falló se sigue como antes: se pide la siguiente normal.
      await cargarSiguientePregunta().catch(() => {});
    } finally {
      enviandoRef.current = false;
      setCargandoSiguiente(false);
    }
  }

  // Fase B.12 — atajos de teclado: 1–4 eligen opción, Enter avanza. El handler se
  // rearma con cada cambio de historial para leer la pregunta activa actual.
  const ultima = historial[historial.length - 1];
  useEffect(() => {
    if (completo) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const target = e.target as (HTMLElement & { isContentEditable?: boolean }) | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!ultima || cargandoSiguiente || enviandoRef.current) return;

      if (ultima.opcionElegida === null) {
        const numero = Number(e.key);
        if (numero >= 1 && numero <= ultima.pregunta.opciones.length) {
          e.preventDefault();
          elegirOpcion(historial.length - 1, ultima.pregunta.opciones[numero - 1]);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        responderYAvanzar(historial.length - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historial, completo, cargandoSiguiente]);


  // Con historial restaurado ya hay algo para mostrar, así que no se tapa la pantalla
  // con el spinner mientras el servidor prepara la pregunta siguiente.
  if (cargandoInicial && historial.length === 0) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <div className="h-6 w-6 rounded-full border-2 border-neutral-700 border-t-neutral-300 animate-spin" />
        <p className="text-sm text-neutral-500">Cargando pregunta...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-6 py-5">
          <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="rounded-full bg-neutral-100 text-neutral-900 px-5 py-2 font-medium transition-all duration-300 hover:bg-white hover:shadow-lg"
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  // Fase B.12 — una sola pregunta completa en pantalla: las respondidas son filas
  // compactas memoizadas arriba, así el DOM (y el re-render) no crece con el uso.
  const indiceActiva = completo ? -1 : historial.length - 1;
  const respondidas = indiceActiva >= 0 ? historial.slice(0, indiceActiva) : historial;
  const activa = indiceActiva >= 0 ? historial[indiceActiva] : null;
  const activaRespondida = activa?.opcionElegida !== null;

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100 px-8 py-12 overflow-hidden">
      {/* Fondo uniforme y estático */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_100%)]" />

      <div className="relative max-w-xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Sondeo</p>
            {!completo && progreso.totalServibles > 0 && (
              <span className="text-xs tabular-nums text-neutral-600">
                Pregunta {Math.min(progreso.respondidas + 1, progreso.totalServibles)}
              </span>
            )}
          </div>

          {/* El progreso se mide por sub-temas dominados: el total de preguntas crece a
              medida que se generan lotes, así que un "x de y" terminaba siempre mintiendo. */}
          {!completo && progreso.subtemasTotal > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="h-1 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-neutral-300 transition-all duration-500"
                  style={{
                    width: `${Math.round(
                      (progreso.subtemasCubiertos / progreso.subtemasTotal) * 100
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs tabular-nums text-neutral-600">
                {progreso.subtemasCubiertos} de {progreso.subtemasTotal} subtemas dominados
              </p>
            </div>
          )}
        </div>

        {respondidas.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {respondidas.map((item, i) => (
              <FilaRespondida key={item.preguntaId} item={item} numero={i + 1} />
            ))}
          </div>
        )}

        {activa && (
          <div className="animate-fade-in-up rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-8 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
            <h2 className="mb-1.5 text-lg font-semibold tracking-tight text-neutral-100">
              {activa.pregunta.pregunta}
            </h2>
            {activa.subtemaNombre && (
              <p className="truncate text-[11px] uppercase tracking-[0.18em] text-neutral-600">
                {activa.subtemaNombre}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2.5">
              {activa.pregunta.opciones.map((opcion, opcionIndex) => {
                const esElegida = activa.opcionElegida === opcion;
                const esCorrecta =
                  opcion === activa.pregunta.opciones[activa.pregunta.indiceCorrecta];
                let estilos =
                  "border-neutral-800 bg-neutral-950/40 text-neutral-200 hover:border-neutral-600 hover:bg-neutral-900/70";
                let iconoEstado: ReactNode = null;

                if (activaRespondida) {
                  if (esCorrecta) {
                    estilos = "border-green-600/60 bg-green-500/10 text-green-300";
                    iconoEstado = <IconoCheck className="h-4 w-4 shrink-0 text-green-400" />;
                  } else if (esElegida) {
                    estilos = "border-red-600/60 bg-red-500/10 text-red-300";
                    iconoEstado = <IconoEquis className="h-4 w-4 shrink-0 text-red-400" />;
                  } else {
                    estilos = "border-neutral-800/60 text-neutral-500 opacity-60";
                  }
                }

                return (
                  <button
                    key={opcionIndex}
                    onClick={() => elegirOpcion(indiceActiva, opcion)}
                    disabled={activaRespondida}
                    className={`group flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-colors duration-200 disabled:cursor-default ${estilos}`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[10px] tabular-nums ${
                          activaRespondida
                            ? "border-transparent text-transparent"
                            : "border-neutral-700 text-neutral-500 group-hover:border-neutral-500 group-hover:text-neutral-300"
                        }`}
                      >
                        {opcionIndex + 1}
                      </span>
                      <span className="min-w-0">{opcion}</span>
                    </span>
                    {iconoEstado}
                  </button>
                );
              })}
            </div>

            {activaRespondida ? (
              <button
                onClick={() => responderYAvanzar(indiceActiva)}
                disabled={cargandoSiguiente}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-neutral-100 px-5 py-3 text-sm font-medium text-neutral-900 transition-all duration-300 hover:bg-white hover:shadow-lg disabled:opacity-50"
              >
                {cargandoSiguiente ? (
                  <>
                    <IconoCargador className="h-4 w-4" />
                    Cargando...
                  </>
                ) : (
                  <>
                    Siguiente
                    <IconoFlecha className="h-4 w-4" />
                  </>
                )}
              </button>
            ) : (
              <p className="mt-5 text-center text-[11px] text-neutral-600">
                Atajo: apretá{" "}
                <kbd className="rounded border border-neutral-700 px-1 py-0.5 text-[10px] text-neutral-400">
                  1
                </kbd>
                –
                <kbd className="rounded border border-neutral-700 px-1 py-0.5 text-[10px] text-neutral-400">
                  {activa.pregunta.opciones.length}
                </kbd>{" "}
                para responder · Enter para seguir
              </p>
            )}
          </div>
        )}

        <div ref={finRef} />
      </div>
    </div>
  );
}
