"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";


type EstadoQuiz = "idle" | "generando" | "listo";

const COPY_POR_ESTADO: Record<EstadoQuiz, { titulo: string; subtitulo: string }> = {
  idle: {
    titulo: "Generá tu quiz",
    subtitulo: "Pegá o subí tu texto y generá el quiz.",
  },
  generando: {
    titulo: "Generando...",
    subtitulo: "La IA está armando las preguntas.",
  },
  listo: {
    titulo: "¡Quiz listo!",
    subtitulo: "Ya podés pasar al sondeo.",
  },
};

interface ModeloOllama {
  nombre: string;
  tamano: number;
}

export default function HomePage() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [estadoQuiz, setEstadoQuiz] = useState<EstadoQuiz>("idle");
  const [sesionId, setSesionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [ajustesModalAbierto, setAjustesModalAbierto] = useState(false);
  const [modelosDisponibles, setModelosDisponibles] = useState<ModeloOllama[]>([]);
  const [cargandoModelos, setCargandoModelos] = useState(false);
  const [modeloPrincipal, setModeloPrincipal] = useState("gemma4:26b");
  const [modeloPreguntas, setModeloPreguntas] = useState("gemma4:26b");


  const [sesionesAbiertas, setSesionesAbiertas] = useState(true);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);

  useEffect(() => {
    const guardadoPrincipal = localStorage.getItem("uselearn:modeloPrincipal");
    const guardadoPreguntas = localStorage.getItem("uselearn:modeloPreguntas");
    if (guardadoPrincipal) setModeloPrincipal(guardadoPrincipal);
    if (guardadoPreguntas) setModeloPreguntas(guardadoPreguntas);
  }, []);

  async function abrirAjustes() {
    setAjustesModalAbierto(true);
    setCargandoModelos(true);
    try {
      const res = await fetch("/api/modelos/listar");
      const data = await res.json();
      if (data.modelos) {
        setModelosDisponibles(data.modelos);
      }
    } catch {
      // silencioso: el modal muestra el estado vacío si falla
    } finally {
      setCargandoModelos(false);
    }
  }

  function guardarModeloPrincipal(nombre: string) {
    setModeloPrincipal(nombre);
    localStorage.setItem("uselearn:modeloPrincipal", nombre);
  }

  function guardarModeloPreguntas(nombre: string) {
    setModeloPreguntas(nombre);
    localStorage.setItem("uselearn:modeloPreguntas", nombre);
  }

  async function generarQuiz() {
    if (!texto.trim()) return;
    setEstadoQuiz("generando");
    setError(null);
    try {
      const res = await fetch("/api/sesiones/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, modelo: modeloPrincipal }),
        
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setEstadoQuiz("idle");
        return;
      }
      setSesionId(data.sesionId);
      setEstadoQuiz("listo");
    } catch {
      setError("No se pudo conectar con el servidor.");
      setEstadoQuiz("idle");
    }
  }

  function pasarAlSondeo() {
    if (!sesionId) return;
    router.push(`/sondeo/${sesionId}`);
  }

  function manejarCambioTexto(nuevoTexto: string) {
    setTexto(nuevoTexto);
    if (estadoQuiz === "listo") {
      setEstadoQuiz("idle");
      setSesionId(null);
    }
  }

  async function manejarArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const extension = file.name.split(".").pop()?.toLowerCase();
    setSubiendoArchivo(true);
    setError(null);

    try {
      if (extension === "txt" || extension === "md") {
        const contenido = await file.text();
        manejarCambioTexto(texto ? texto + "\n\n" + contenido : contenido);
      } else if (extension === "pdf") {
        const formData = new FormData();
        formData.append("archivo", file);
        const res = await fetch("/api/archivos/extraer-pdf", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }
        manejarCambioTexto(texto ? texto + "\n\n" + data.texto : data.texto);
      } else {
        setError("Formato no soportado. Usá .txt, .md o .pdf.");
      }
    } catch {
      setError("No se pudo leer el archivo.");
    } finally {
      setSubiendoArchivo(false);
      e.target.value = "";
    }
  }

  return (
    <div className="relative min-h-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      {/* Fondo decorativo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 top-1/3 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl animate-blob-slow" />
        <div className="absolute -right-24 top-10 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl animate-blob-slower" />
        <div className="absolute left-1/3 bottom-0 h-72 w-72 rounded-full bg-violet-500/10 blur-3xl animate-blob-slow" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-neutral-900">
        <span className="text-sm font-semibold tracking-widest">USELEARN</span>
        <div className="flex items-center gap-3 relative">

          <button
            onClick={abrirAjustes}
            className="rounded-full border border-neutral-800 bg-neutral-900 h-8 w-8 flex items-center justify-center text-neutral-400"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        <p className="text-xs tracking-widest text-neutral-500 mb-2">— TU CAMINO DE APRENDIZAJE</p>
        <h1 className="text-4xl font-bold mb-3">Bienvenido de nuevo</h1>
        <p className="text-neutral-400 mb-10">
          Aquí es donde comienzas, exploras y practicas.
          <br />
          La IA te guía, tú controlas el ritmo.
        </p>

        <div className="grid grid-cols-3 gap-6">
          {/* Textarea */}
          <div className="col-span-2 rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 flex flex-col min-h-[320px]">
            <div className="flex items-center gap-2 text-neutral-300 mb-4">
              <span>📄</span>
              <span className="font-medium">Pega tus notas o lo que sea...</span>
            </div>
            <textarea
              value={texto}
              onChange={(e) => manejarCambioTexto(e.target.value)}
              disabled={estadoQuiz === "generando"}
              placeholder="Puedes pegar un texto, una pregunta, una imagen o lo que quieras revisar."
              className="notas-textarea flex-1 resize-none bg-transparent text-sm text-neutral-300 placeholder:text-neutral-600 focus:outline-none disabled:opacity-50"
            />
            <div className="self-start mt-4 flex items-center gap-2">
              <button
                onClick={() => setTexto("")}
                disabled={estadoQuiz === "generando"}
                className="flex items-center gap-2 rounded-full border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
              >
                ⤢ Limpiar texto
              </button>
              <label
                className={`flex items-center justify-center h-8 w-8 rounded-full border border-neutral-700 text-neutral-300 hover:border-neutral-500 cursor-pointer ${
                  subiendoArchivo || estadoQuiz === "generando" ? "opacity-40 pointer-events-none" : ""
                }`}
              >
                +
                <input
                  type="file"
                  accept=".txt,.md,.pdf"
                  onChange={manejarArchivo}
                  className="hidden"
                  disabled={subiendoArchivo || estadoQuiz === "generando"}
                />
              </label>
              {subiendoArchivo && (
                <span className="text-xs text-neutral-500">Leyendo archivo...</span>
              )}
            </div>
          </div>

          {/* Quiz — copy dinámico según estadoQuiz */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <span>✦</span>
              <span className="font-semibold">{COPY_POR_ESTADO[estadoQuiz].titulo}</span>
            </div>
            <p className="text-sm text-neutral-500 mb-6">{COPY_POR_ESTADO[estadoQuiz].subtitulo}</p>

            <button
              onClick={estadoQuiz === "listo" ? pasarAlSondeo : generarQuiz}
              disabled={!texto.trim() || estadoQuiz === "generando"}
              className={`flex items-center justify-between rounded-full px-5 py-3 font-medium transition-colors ${
                estadoQuiz === "generando"
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-neutral-100 text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              <span className="flex items-center gap-2">
                {estadoQuiz === "generando" && "⏳ Generando quiz..."}
                {estadoQuiz === "listo" && "▶ Pasar al sondeo"}
                {estadoQuiz === "idle" && "✦ Generar quiz"}
              </span>
              {estadoQuiz !== "generando" && <span className="ml-2">→</span>}
            </button>

            {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
          </div>
        </div>

        {/* Sesiones pasadas */}
        <button
          onClick={() => setSesionesAbiertas((v) => !v)}
          className="mt-6 w-full rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 flex items-center gap-3 text-neutral-400 text-left"
        >
          <span className="text-xl">🕓</span>
          <span className="font-medium text-neutral-200">Sesiones pasadas</span>
          <span
            className={`transition-transform ${sesionesAbiertas ? "rotate-0" : "rotate-180"}`}
          >
            ↑
          </span>
        </button>
      </main>

      {/* Modal de Ajustes */}
      {ajustesModalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setAjustesModalAbierto(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-950 p-6 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Ajustes</h2>
              <button
                onClick={() => setAjustesModalAbierto(false)}
                className="text-neutral-500 hover:text-neutral-300 text-xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="mb-6">
              <p className="text-sm font-medium text-neutral-200 mb-1">
                Modelo para sub-temas y feedback
              </p>
              <p className="text-xs text-neutral-500 mb-3">
                Se usa al generar el quiz y al mostrar el feedback final del sondeo.
              </p>
              {cargandoModelos ? (
                <p className="text-xs text-neutral-600">Cargando modelos...</p>
              ) : modelosDisponibles.length === 0 ? (
                <p className="text-xs text-red-500">
                  No se pudo conectar con Ollama en localhost:11434.
                </p>
              ) : (
                <select
                  value={modeloPrincipal}
                  onChange={(e) => guardarModeloPrincipal(e.target.value)}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
                >
                  {modelosDisponibles.map((m) => (
                    <option key={m.nombre} value={m.nombre}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="mb-2">
              <p className="text-sm font-medium text-neutral-200 mb-1">
                Modelo para preguntas del sondeo
              </p>
              <p className="text-xs text-neutral-500 mb-3">
                Se usa una vez por cada pregunta — un modelo más liviano acelera el sondeo.
              </p>
              {cargandoModelos ? (
                <p className="text-xs text-neutral-600">Cargando modelos...</p>
              ) : modelosDisponibles.length === 0 ? (
                <p className="text-xs text-red-500">
                  No se pudo conectar con Ollama en localhost:11434.
                </p>
              ) : (
                <select
                  value={modeloPreguntas}
                  onChange={(e) => guardarModeloPreguntas(e.target.value)}
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm"
                >
                  {modelosDisponibles.map((m) => (
                    <option key={m.nombre} value={m.nombre}>
                      {m.nombre}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
