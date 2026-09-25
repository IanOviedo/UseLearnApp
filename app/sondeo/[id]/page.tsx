"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";

interface Pregunta {
  pregunta: string;
  opciones: string[];
  respuestaCorrecta: string;
}

interface SiguientePreguntaResponse {
  completo: boolean;
  subtemaId?: number;
  pregunta?: Pregunta;
  feedback?: string;
  error?: string;
}

interface PreguntaEnCurso {
  subtemaId: number;
  pregunta: Pregunta;
  opcionElegida: string | null;
}

function barajar<T>(array: T[]): T[] {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

export default function SondeoPage() {
  const params = useParams();
  const router = useRouter();
  const sesionId = Number(params.id);

  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [cargandoSiguiente, setCargandoSiguiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completo, setCompleto] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [historial, setHistorial] = useState<PreguntaEnCurso[]>([]);

  const finRef = useRef<HTMLDivElement>(null);

  const cargarSiguientePregunta = useCallback(async () => {
    setCargandoSiguiente(true);
    setError(null);
    try {
      const modeloPreguntas = localStorage.getItem("uselearn:modeloPreguntas") ?? "";
      const modeloPrincipal = localStorage.getItem("uselearn:modeloPrincipal") ?? "";
      const params = new URLSearchParams({ sesionId: String(sesionId) });
      if (modeloPreguntas) params.set("modeloPreguntas", modeloPreguntas);
      if (modeloPrincipal) params.set("modeloPrincipal", modeloPrincipal);

      const res = await fetch(`/api/sondeo/siguiente-pregunta?${params.toString()}`);
      const data: SiguientePreguntaResponse = await res.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.completo) {
        setCompleto(true);
        setFeedback(data.feedback ?? "");
            } else if (data.pregunta && data.subtemaId) {
        const preguntaConOpcionesBarajadas: Pregunta = {
          ...data.pregunta,
          opciones: barajar(data.pregunta.opciones),
        };
        setHistorial((prev) => [
          ...prev,
          { subtemaId: data.subtemaId!, pregunta: preguntaConOpcionesBarajadas, opcionElegida: null },
        ]);
      }
      
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setCargandoInicial(false);
      setCargandoSiguiente(false);
    }
  }, [sesionId]);

  useEffect(() => {
    if (sesionId) cargarSiguientePregunta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sesionId]);

  // Auto-scroll cada vez que se agrega una pregunta nueva o se llega al feedback final
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [historial.length, completo]);

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
    const correcta = item.opcionElegida === item.pregunta.respuestaCorrecta;
    try {
      await fetch("/api/sondeo/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtemaId: item.subtemaId, correcta }),
      });
    } catch {
      // si falla el POST igual seguimos, no bloqueamos el flujo del usuario
    }
    cargarSiguientePregunta();
  }

  if (cargandoInicial) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center">
        <p className="text-neutral-400">Cargando pregunta...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center gap-4">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => router.push("/")}
          className="rounded-full bg-neutral-100 text-neutral-900 px-5 py-2 font-medium"
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-8 py-12">
      <div className="max-w-xl mx-auto flex flex-col gap-8">
        <p className="text-sm text-neutral-500">Sondeo</p>

        {historial.map((item, index) => {
          const respondida = item.opcionElegida !== null;
          const esUltimaActiva = index === historial.length - 1 && !completo;

          return (
            <div
              key={index}
              className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8"
            >
              <h2 className="text-xl font-semibold mb-6">{item.pregunta.pregunta}</h2>

              <div className="flex flex-col gap-3">
                {item.pregunta.opciones.map((opcion) => {
                  const esElegida = item.opcionElegida === opcion;
                  const esCorrecta = opcion === item.pregunta.respuestaCorrecta;
                  let estilos = "border-neutral-700 hover:border-neutral-500";

                  if (respondida) {
                    if (esCorrecta) {
                      estilos = "border-green-500 bg-green-500/10 text-green-400";
                    } else if (esElegida) {
                      estilos = "border-red-500 bg-red-500/10 text-red-400";
                    } else {
                      estilos = "border-neutral-800 opacity-50";
                    }
                  }

                  return (
                    <button
                      key={opcion}
                      onClick={() => elegirOpcion(index, opcion)}
                      disabled={respondida}
                      className={`text-left rounded-lg border px-4 py-3 transition-colors ${estilos}`}
                    >
                      {opcion}
                    </button>
                  );
                })}
              </div>

              {respondida && esUltimaActiva && (
                <button
                  onClick={() => responderYAvanzar(index)}
                  disabled={cargandoSiguiente}
                  className="mt-6 w-full rounded-full bg-neutral-100 text-neutral-900 px-5 py-3 font-medium disabled:opacity-50"
                >
                  {cargandoSiguiente ? "Cargando..." : "Siguiente →"}
                </button>
              )}
            </div>
          );
        })}

        {completo && (
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-8 text-center flex flex-col items-center gap-6">
            <h1 className="text-2xl font-bold">¡Sondeo completo!</h1>
            <p className="text-neutral-400 whitespace-pre-wrap">{feedback}</p>
            <button
              onClick={() => router.push("/")}
              className="rounded-full bg-neutral-100 text-neutral-900 px-5 py-2 font-medium"
            >
              Volver al inicio
            </button>
          </div>
        )}

        <div ref={finRef} />
      </div>
    </div>
  );
}