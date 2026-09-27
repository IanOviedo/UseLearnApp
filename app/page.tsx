"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { obtenerProveedores, eliminarProveedor, agregarProveedor, type ProveedorNube } from "@/lib/proveedores";


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

interface SesionConEstado {
  id: number;
  creadoEn: string;
  completa: boolean;
  totalPreguntas: number;
  preguntasRespondidas: number;
}

function formatearFecha(creadoEn: string): string {
  const iso = creadoEn.includes("T") ? creadoEn : creadoEn.replace(" ", "T");
  const fecha = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return fecha.toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" });
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
  const [proveedores, setProveedores] = useState<ProveedorNube[]>([]);
  const [mostrandoFormProveedor, setMostrandoFormProveedor] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaBaseUrl, setNuevaBaseUrl] = useState("");
  const [nuevaApiKey, setNuevaApiKey] = useState("");
  const [nuevoFormato, setNuevoFormato] = useState<"openai" | "gemini-nativo">("openai");


  const [subiendoArchivo, setSubiendoArchivo] = useState(false);

  const [sesionesModalAbierto, setSesionesModalAbierto] = useState(false);
  const [sesiones, setSesiones] = useState<SesionConEstado[]>([]);

  useEffect(() => {
    const guardadoPrincipal = localStorage.getItem("uselearn:modeloPrincipal");
    const guardadoPreguntas = localStorage.getItem("uselearn:modeloPreguntas");
    if (guardadoPrincipal) setModeloPrincipal(guardadoPrincipal);
    if (guardadoPreguntas) setModeloPreguntas(guardadoPreguntas);
  }, []);

  async function abrirAjustes() {
    setAjustesModalAbierto(true);
    setProveedores(obtenerProveedores());
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

  async function abrirSesiones() {
    setSesionesModalAbierto(true);
    try {
      const res = await fetch("/api/sesiones/listar");
      const data = await res.json();
      if (Array.isArray(data)) {
        setSesiones(data);
      }
    } catch {
      // silencioso: el modal muestra la lista vacía si falla
    }
  }

  async function eliminarSesionModal(id: number) {
    try {
      await fetch("/api/sesiones/eliminar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sesionId: id }),
      });
      setSesiones((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // silencioso: la lista se refresca al volver a abrir el modal
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
        <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:26px_26px] [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-4 border-b border-white/5">
        <span className="text-sm font-semibold tracking-[0.25em] text-neutral-200">USELEARN</span>
        <div className="flex items-center gap-3 relative">

          <button
            onClick={abrirAjustes}
            className="rounded-full border border-neutral-800 bg-neutral-900 h-8 w-8 flex items-center justify-center text-neutral-400 transition-all duration-300 hover:border-neutral-600 hover:text-neutral-200 hover:rotate-45"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        <p className="animate-fade-in-up text-xs uppercase tracking-[0.25em] text-neutral-600 mb-3">— TU CAMINO DE APRENDIZAJE</p>
        <h1 className="animate-fade-in-up [animation-delay:70ms] text-4xl font-bold tracking-tight mb-3 bg-gradient-to-br from-white via-neutral-200 to-neutral-500 bg-clip-text text-transparent">Bienvenido de nuevo</h1>
        <p className="animate-fade-in-up [animation-delay:140ms] text-neutral-400 leading-relaxed mb-10">
          Aquí es donde comienzas, exploras y practicas.
          <br />
          La IA te guía, tú controlas el ritmo.
        </p>

        <div className="grid grid-cols-3 gap-6">
          {/* Textarea */}
          <div className="col-span-2 rounded-2xl border border-white/[0.06] bg-neutral-900/40 p-6 flex flex-col min-h-[320px] shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8)]">
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
                className="flex items-center gap-2 rounded-full border border-neutral-800 px-4 py-1.5 text-sm text-neutral-400 transition-all duration-300 hover:border-neutral-600 hover:text-neutral-200 disabled:opacity-40"
              >
                ⤢ Limpiar texto
              </button>
              <label
                className={`flex items-center justify-center h-8 w-8 rounded-full border border-neutral-800 text-neutral-400 transition-all duration-300 hover:border-neutral-600 hover:text-neutral-200 cursor-pointer ${
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
          <div className="rounded-2xl border border-white/[0.06] bg-neutral-900/40 p-6 flex flex-col shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8)]">
            <div className="flex items-center gap-2 mb-1">
              <span>✦</span>
              <span className="font-semibold">{COPY_POR_ESTADO[estadoQuiz].titulo}</span>
            </div>
            <p className="text-sm text-neutral-500 mb-6">{COPY_POR_ESTADO[estadoQuiz].subtitulo}</p>

            <button
              onClick={estadoQuiz === "listo" ? pasarAlSondeo : generarQuiz}
              disabled={!texto.trim() || estadoQuiz === "generando"}
              className={`flex items-center justify-between rounded-full px-5 py-3 font-medium transition-all duration-300 ${
                estadoQuiz === "generando"
                  ? "bg-neutral-800/70 text-neutral-500 cursor-not-allowed"
                  : "bg-neutral-100 text-neutral-900 hover:bg-white hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              }`}
            >
              <span className="flex items-center gap-2">
                {estadoQuiz === "generando" && "⏳ Generando quiz..."}
                {estadoQuiz === "listo" && "▶ Pasar al sondeo"}
                {estadoQuiz === "idle" && "✦ Generar quiz"}
              </span>
              {estadoQuiz !== "generando" && <span className="ml-2">→</span>}
            </button>

            {error && <p className="text-red-400 text-xs mt-3">{error}</p>}
          </div>
        </div>

        {/* Sesiones pasadas */}
        <button
          onClick={abrirSesiones}
          className="group mt-6 w-full rounded-2xl border border-white/[0.06] bg-neutral-900/40 p-6 flex items-center gap-3 text-neutral-400 text-left transition-all duration-300 hover:border-white/10 hover:bg-neutral-900/70 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.8)]"
        >
          <span className="text-xl transition-transform duration-300 group-hover:scale-110">🕓</span>
          <span className="font-medium text-neutral-200">Sesiones pasadas</span>
        </button>
      </main>

      {/* Modal de Ajustes */}
      {ajustesModalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setAjustesModalAbierto(false)}
        >
          <div
            className="animate-modal-in w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-950/95 backdrop-blur-xl p-6 max-h-[80vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold tracking-tight">Ajustes</h2>
              <button
                onClick={() => setAjustesModalAbierto(false)}
                className="text-neutral-500 hover:text-neutral-200 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-white/5"
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
                  className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 transition-colors focus:border-neutral-600 focus:outline-none"
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
  className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 transition-colors focus:border-neutral-600 focus:outline-none"
>
  <option value="gemini-flash-latest">✦ Gemini (nube) — gemini-flash-latest</option>
  {modelosDisponibles.map((m) => (
    <option key={m.nombre} value={m.nombre}>
      {m.nombre}
    </option>
  ))}
  {proveedores.map((p) => (
    <option key={p.id} value={p.nombre}>
      {"✦ " + p.nombre + " (nube)"}
    </option>
  ))}
</select>
              )}
            </div>
             <div className="mt-6">
               <h3 className="text-sm font-medium text-neutral-200 tracking-tight mb-2">Proveedores de nube configurados</h3>
               {proveedores.length === 0 ? (
                 <p className="text-xs text-neutral-500">No hay proveedores configurados</p>
               ) : (
                 <div className="space-y-2">
                   {proveedores.map((p) => (
                     <div key={p.id} className="flex items-center justify-between rounded-xl bg-neutral-900/60 p-2.5 text-xs border border-neutral-900 transition-colors hover:border-neutral-800">
                       <div className="flex flex-col">
                         <span className="text-neutral-200">{p.nombre}</span>
                         <span className="text-neutral-500">{`••••••${p.apiKey.slice(-4)}`}</span>
                       </div>
                       <button
                         onClick={() => {
                           eliminarProveedor(p.id);
                           setProveedores(obtenerProveedores());
                         }}
                         className="text-red-400 hover:text-red-300 transition-colors"
                       >
                         Eliminar
                       </button>
                     </div>
                   ))}
                 </div>
               )}
                  <button onClick={() => setMostrandoFormProveedor(true)} className="mt-3 self-start rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-300 transition-all duration-300 hover:border-neutral-600 hover:text-neutral-200">+ Agregar proveedor</button>
                  {mostrandoFormProveedor && (
                    <div className="mt-2 flex flex-col gap-2">
                      <input
                        className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
                        value={nuevoNombre}
                        onChange={(e) => setNuevoNombre(e.target.value)}
                        placeholder="Nombre (ej. Groq)"
                      />
                      <input
                        className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
                        value={nuevaBaseUrl}
                        onChange={(e) => setNuevaBaseUrl(e.target.value)}
                        placeholder="URL base de la API"
                      />
                      <input
                        className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
                        value={nuevaApiKey}
                        onChange={(e) => setNuevaApiKey(e.target.value)}
                        placeholder="API Key"
                      />
                      <select
                        className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
                        value={nuevoFormato}
                        onChange={(e) => setNuevoFormato(e.target.value as "openai" | "gemini-nativo")}
                      >
                        <option value="openai">OpenAI-compatible</option>
                        <option value="gemini-nativo">Gemini nativo</option>
                      </select>
                      <div className="flex gap-2">
                        <button
                          className="rounded-full bg-neutral-100 text-neutral-900 px-4 py-1.5 text-xs font-medium transition-all duration-300 hover:bg-white hover:shadow-md"
                          onClick={() => {
                            if (!nuevoNombre || !nuevaBaseUrl || !nuevaApiKey) return;
                            agregarProveedor({
                              nombre: nuevoNombre,
                              baseUrl: nuevaBaseUrl,
                              apiKey: nuevaApiKey,
                              formato: nuevoFormato,
                            });
                            setProveedores(obtenerProveedores());
                            setNuevoNombre("");
                            setNuevaBaseUrl("");
                            setNuevaApiKey("");
                            setNuevoFormato("openai");
                            setMostrandoFormProveedor(false);
                          }}
                        >
                          Guardar
                        </button>
                        <button onClick={() => setMostrandoFormProveedor(false)} className="rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-400 transition-all duration-300 hover:border-neutral-600 hover:text-neutral-200">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

             </div>

          </div>
        </div>
      )}

      {/* Modal de Sesiones pasadas */}
      {sesionesModalAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setSesionesModalAbierto(false)}
        >
          <div
            className="animate-modal-in w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-950/95 backdrop-blur-xl p-6 max-h-[80vh] overflow-y-auto shadow-2xl [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-neutral-700 [&::-webkit-scrollbar-thumb]:rounded-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold tracking-tight">Sesiones pasadas</h2>
              <button
                onClick={() => setSesionesModalAbierto(false)}
                className="text-neutral-500 hover:text-neutral-200 text-xl leading-none w-8 h-8 flex items-center justify-center rounded-full transition-colors hover:bg-white/5"
              >
                ×
              </button>
            </div>

            {sesiones.length === 0 ? (
              <p className="text-sm text-neutral-500 text-center py-8">No hay sesiones todavía.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {sesiones.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => router.push(`/sondeo/${s.id}`)}
                    className="group flex items-center justify-between rounded-xl border border-neutral-900 bg-neutral-900/50 p-3 cursor-pointer transition-all duration-200 hover:border-neutral-700 hover:bg-neutral-900"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm text-neutral-200">
                        {formatearFecha(s.creadoEn)}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {s.completa
                          ? "Completo ✓"
                          : `${s.preguntasRespondidas}/${s.totalPreguntas} preguntas`}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        eliminarSesionModal(s.id);
                      }}
                      title="Eliminar sesión"
                      className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-red-400 transition-opacity"
                    >
                      🗑️
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
