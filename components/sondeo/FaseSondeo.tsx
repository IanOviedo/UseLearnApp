"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  IconoAlerta,
  IconoCargador,
  IconoCheck,
  IconoEquis,
  IconoFlecha,
} from "@/components/ui/Iconos";

interface Pregunta {
  pregunta: string;
  opciones: string[];
  indiceCorrecta: number;
}

interface SiguientePreguntaResponse {
  completo: boolean;
  subtemaId?: number;
  subtemaNombre?: string;
  preguntaId?: number;
  pregunta?: Pregunta;
  feedback?: string;
  error?: string;
  respondidas?: number;
  total?: number;
}

interface PreguntaEnCurso {
  subtemaId: number;
  subtemaNombre: string;
  preguntaId: number;
  pregunta: Pregunta;
  opcionElegida: string | null;
}

interface FaseSondeoProps {
  sesionId: number;
  onSondeoCompleto: (feedback: string, subtemasFallados: string[]) => void;
}

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

// Deriva los subtemas débiles directamente del historial: nombres de subtema
// únicos donde el usuario respondió al menos una vez de forma incorrecta.
function calcularSubtemasFallados(historial: PreguntaEnCurso[]): string[] {
  const fallados = historial
    .filter(
      (item) =>
        item.opcionElegida !== null &&
        item.opcionElegida !== item.pregunta.opciones[item.pregunta.indiceCorrecta]
    )
    .map((item) => item.subtemaNombre)
    .filter((nombre) => nombre.trim() !== "");
  return Array.from(new Set(fallados));
}

export default function FaseSondeo({ sesionId, onSondeoCompleto }: FaseSondeoProps) {
  const router = useRouter();

  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [cargandoSiguiente, setCargandoSiguiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completo, setCompleto] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [historial, setHistorial] = useState<PreguntaEnCurso[]>([]);
  const [conteoPreguntas, setConteoPreguntas] = useState({ respondidas: 0, total: 0 });

  const finRef = useRef<HTMLDivElement>(null);
  const notificadoRef = useRef(false);

  const cargarSiguientePregunta = useCallback(async (estaCancelado?: () => boolean) => {
    setCargandoSiguiente(true);
    setError(null);
    try {
      const modeloPreguntas = localStorage.getItem("uselearn:modeloPreguntas") ?? "";
      const modeloPrincipal = localStorage.getItem("uselearn:modeloPrincipal") ?? "";
      const proveedores: import("@/lib/proveedores").ProveedorNube[] = JSON.parse(
        localStorage.getItem("proveedoresNube") ?? "[]"
      );
      const proveedorSeleccionado = proveedores.find((p) =>
        modeloPreguntas.toLowerCase().startsWith(p.nombre.toLowerCase())
      );
      const queryParams = new URLSearchParams({ sesionId: String(sesionId) });
      if (modeloPreguntas) queryParams.set("modeloPreguntas", modeloPreguntas);
      if (modeloPrincipal) queryParams.set("modeloPrincipal", modeloPrincipal);
      if (proveedorSeleccionado) {
        queryParams.set("proveedorNombre", proveedorSeleccionado.nombre);
        queryParams.set("proveedorBaseUrl", proveedorSeleccionado.baseUrl);
        queryParams.set("proveedorApiKey", proveedorSeleccionado.apiKey);
        queryParams.set("proveedorFormato", proveedorSeleccionado.formato);
      }

      const res = await fetch(`/api/sondeo/siguiente-pregunta?${queryParams.toString()}`);
      const data: SiguientePreguntaResponse = await res.json();

      if (estaCancelado?.()) return;

      if (typeof data.respondidas === "number" && typeof data.total === "number") {
        setConteoPreguntas({ respondidas: data.respondidas, total: data.total });
      }

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.completo) {
        setCompleto(true);
        setFeedback(data.feedback ?? "");
      } else if (data.pregunta && data.subtemaId) {
        const preguntaConOpcionesBarajadas = barajarPregunta(data.pregunta);
        setHistorial((prev) =>
          prev.some((p) => p.preguntaId === data.preguntaId)
            ? prev
            : [
                ...prev,
                { subtemaId: data.subtemaId!, subtemaNombre: data.subtemaNombre ?? "", preguntaId: data.preguntaId!, pregunta: preguntaConOpcionesBarajadas, opcionElegida: null },
              ]
        );
      }
    } catch {
      if (estaCancelado?.()) return;
      setError("No se pudo conectar con el servidor.");
    } finally {
      if (!estaCancelado?.()) {
        setCargandoInicial(false);
        setCargandoSiguiente(false);
      }
    }
  }, [sesionId]);

  useEffect(() => {
    if (!sesionId) return;
    let cancelado = false;
    cargarSiguientePregunta(() => cancelado);
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesionId]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [historial.length, completo]);

  useEffect(() => {
    if (!completo || notificadoRef.current) return;
    notificadoRef.current = true;
    onSondeoCompleto(feedback ?? "", calcularSubtemasFallados(historial));
  }, [completo, feedback, historial, onSondeoCompleto]);

  function elegirOpcion(index: number, opcion: string) {
    setHistorial((prev) =>
      prev.map((item, i) =>
        i === index && item.opcionElegida === null ? { ...item, opcionElegida: opcion } : item
      )
    );
  }

  async function responderYAvanzar(index: number) {
    const item = historial[index];
    if (!item.opcionElegida) return;
    const correcta = item.opcionElegida === item.pregunta.opciones[item.pregunta.indiceCorrecta];
    try {
      await fetch("/api/sondeo/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtemaId: item.subtemaId, correcta, preguntaId: item.preguntaId }),
      });
    } catch {
      // si falla el POST igual seguimos, no bloqueamos el flujo del usuario
    }
    cargarSiguientePregunta();
  }

  if (cargandoInicial) {
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

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100 px-8 py-12 overflow-hidden">
      {/* Fondo uniforme y estático */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_100%)]" />

      <div className="relative max-w-xl mx-auto flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.2em] text-neutral-600">Sondeo</p>
          {!completo && conteoPreguntas.total > 0 && (
            <span className="text-xs tabular-nums text-neutral-600">
              Pregunta {conteoPreguntas.respondidas + 1} de {conteoPreguntas.total}
            </span>
          )}
        </div>

        {historial.map((item, index) => {
          const respondida = item.opcionElegida !== null;
          const esUltimaActiva = index === historial.length - 1 && !completo;

          return (
            <div
              key={index}
              className="animate-fade-in-up rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-8 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]"
            >
              <h2 className="mb-6 text-lg font-semibold tracking-tight text-neutral-100">{item.pregunta.pregunta}</h2>

              <div className="flex flex-col gap-2.5">
                {item.pregunta.opciones.map((opcion, opcionIndex) => {
                  const esElegida = item.opcionElegida === opcion;
                  const esCorrecta = opcion === item.pregunta.opciones[item.pregunta.indiceCorrecta];
                  let estilos = "border-neutral-800 bg-neutral-950/40 text-neutral-200 hover:border-neutral-600 hover:bg-neutral-900/70";
                  let iconoEstado: ReactNode = null;

                  if (respondida) {
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
                      onClick={() => elegirOpcion(index, opcion)}
                      disabled={respondida}
                      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-colors duration-200 disabled:cursor-default ${estilos}`}
                    >
                      <span>{opcion}</span>
                      {iconoEstado}
                    </button>
                  );
                })}
              </div>

              {respondida && esUltimaActiva && (
                <button
                  onClick={() => responderYAvanzar(index)}
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
              )}
            </div>
          );
        })}

        <div ref={finRef} />
      </div>
    </div>
  );
}