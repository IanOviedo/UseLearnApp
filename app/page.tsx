"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  obtenerProveedores,
  eliminarProveedor,
  agregarProveedor,
  proveedorDeModelo,
  type ProveedorNube,
} from "@/lib/proveedores";
import { MODELO_GEMINI, MODELO_PRINCIPAL_POR_DEFECTO, MODELO_PREGUNTAS_POR_DEFECTO } from "@/lib/config";
import {
  IconoAdjuntar,
  IconoAjustes,
  IconoAlerta,
  IconoCargador,
  IconoCerrar,
  IconoChevron,
  IconoCheck,
  IconoDestello,
  IconoDocumento,
  IconoEliminar,
  IconoFlecha,
  IconoHistorial,
  IconoPlay,
} from "@/components/ui/Iconos";


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
  topic: string;
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
  const [modeloPrincipal, setModeloPrincipal] = useState(MODELO_PRINCIPAL_POR_DEFECTO);
  const [modeloPreguntas, setModeloPreguntas] = useState(MODELO_PREGUNTAS_POR_DEFECTO);
  // Fase B.11 — pre-generación del próximo lote en background (solo Ollama local).
  // Se guarda en localStorage y viaja como ?pregen=0 en los requests del sondeo.
  const [pregen, setPregen] = useState(true);
  const [proveedores, setProveedores] = useState<ProveedorNube[]>([]);
  const [mostrandoFormProveedor, setMostrandoFormProveedor] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaBaseUrl, setNuevaBaseUrl] = useState("");
  const [nuevaApiKey, setNuevaApiKey] = useState("");
  const [nuevoModelo, setNuevoModelo] = useState("");
  const [nuevoFormato, setNuevoFormato] = useState<"openai" | "gemini-nativo">("openai");


  const [subiendoArchivo, setSubiendoArchivo] = useState(false);

  const [sesionesModalAbierto, setSesionesModalAbierto] = useState(false);
  const [sesiones, setSesiones] = useState<SesionConEstado[]>([]);

  useEffect(() => {
    const guardadoPrincipal = localStorage.getItem("uselearn:modeloPrincipal");
    const guardadoPreguntas = localStorage.getItem("uselearn:modeloPreguntas");
    const pregenGuardado = localStorage.getItem("uselearn:pregen") !== "0";
    // Se cargan acá y no recién al abrir Ajustes: si no, al crear una sesión con un
    // proveedor de nube elegido el componente no lo tenía en estado y no se mandaba.
    const proveedoresGuardados = obtenerProveedores();
    // Un microtask de diferencia: el lint de React castiga el setState sincrono
    // dentro del efecto (renders en cascada).
    void Promise.resolve().then(() => {
      if (guardadoPrincipal) setModeloPrincipal(guardadoPrincipal);
      if (guardadoPreguntas) setModeloPreguntas(guardadoPreguntas);
      setPregen(pregenGuardado);
      setProveedores(proveedoresGuardados);
    });
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

  function guardarPregen(valor: boolean) {
    setPregen(valor);
    localStorage.setItem("uselearn:pregen", valor ? "1" : "0");
  }

  async function generarQuiz() {
    if (!texto.trim()) return;
    setEstadoQuiz("generando");
    setError(null);
    try {
      const res = await fetch("/api/sesiones/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto,
          modeloPrincipal,
          // La config del proveedor viaja en el body: el servidor no puede leer
          // localStorage, así que ahí no hay forma de conseguirlo.
          proveedor: proveedorDeModelo(proveedores, modeloPrincipal) ?? undefined,
        }),
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
      {/* Fondo uniforme y estático (sin animaciones) */}
      <div className="pointer-events-none absolute inset-0 bg-neutral-950" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[linear-gradient(180deg,rgba(255,255,255,0.035)_0%,rgba(255,255,255,0)_100%)]" />

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between border-b border-neutral-800/60 bg-neutral-950/80 px-8 py-4 backdrop-blur-sm">
        <span className="text-sm font-semibold tracking-[0.28em] text-neutral-100">USELEARN</span>
        <button
          onClick={abrirAjustes}
          title="Ajustes"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900/60 text-neutral-400 transition-colors duration-200 hover:border-neutral-600 hover:bg-neutral-800/60 hover:text-neutral-100"
        >
          <IconoAjustes className="h-4 w-4" />
        </button>
      </header>

      {/* Body */}
      <main className="relative z-10 max-w-5xl mx-auto px-8 py-12">
        <p className="animate-fade-in-up text-xs uppercase tracking-[0.25em] text-neutral-500 mb-3">Tu camino de aprendizaje</p>
        <h1 className="animate-fade-in-up [animation-delay:70ms] text-4xl font-bold tracking-tight mb-3 bg-gradient-to-br from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">Bienvenido de nuevo</h1>
        <p className="animate-fade-in-up [animation-delay:140ms] text-neutral-400 leading-relaxed mb-10">
          Aquí es donde comienzas, exploras y practicas.
          <br />
          La IA te guía, tú controlas el ritmo.
        </p>

        <div className="grid grid-cols-3 gap-6">
          {/* Textarea */}
          <div className="col-span-2 flex min-h-[320px] flex-col rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
            <div className="mb-4 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/60 text-neutral-400">
                <IconoDocumento className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium text-neutral-200">Pega tus notas o lo que sea...</span>
            </div>
            <textarea
              value={texto}
              onChange={(e) => manejarCambioTexto(e.target.value)}
              disabled={estadoQuiz === "generando"}
              placeholder="Puedes pegar un texto, una pregunta, una imagen o lo que quieras revisar."
              className="notas-textarea flex-1 resize-none bg-transparent text-sm text-neutral-300 placeholder:text-neutral-600 focus:outline-none disabled:opacity-50"
            />
            <div className="mt-4 flex items-center gap-2 self-start">
              <button
                onClick={() => setTexto("")}
                disabled={estadoQuiz === "generando"}
                className="flex items-center gap-2 rounded-full border border-neutral-800 px-4 py-1.5 text-sm text-neutral-400 transition-colors duration-200 hover:border-neutral-600 hover:bg-neutral-800/40 hover:text-neutral-100 disabled:opacity-40"
              >
                <IconoEliminar className="h-3.5 w-3.5" />
                Limpiar texto
              </button>
              <label
                title="Adjuntar archivo (.txt, .md, .pdf)"
                className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-neutral-800 text-neutral-400 transition-colors duration-200 hover:border-neutral-600 hover:bg-neutral-800/40 hover:text-neutral-100 ${
                  subiendoArchivo || estadoQuiz === "generando" ? "pointer-events-none opacity-40" : ""
                }`}
              >
                <IconoAdjuntar className="h-4 w-4" />
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
          <div className="flex flex-col rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-6 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
            <div className="mb-1 flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/60 text-neutral-400">
                <IconoDestello className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-neutral-100">{COPY_POR_ESTADO[estadoQuiz].titulo}</span>
            </div>
            <p className="mb-6 text-sm text-neutral-500">{COPY_POR_ESTADO[estadoQuiz].subtitulo}</p>

            <button
              onClick={estadoQuiz === "listo" ? pasarAlSondeo : generarQuiz}
              disabled={!texto.trim() || estadoQuiz === "generando"}
              className={`flex items-center justify-between gap-3 rounded-full px-5 py-3 text-sm font-medium transition-all duration-300 ${
                estadoQuiz === "generando"
                  ? "cursor-not-allowed bg-neutral-800/60 text-neutral-500"
                  : "bg-neutral-100 text-neutral-900 hover:bg-white hover:shadow-lg hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-none"
              }`}
            >
              <span className="flex items-center gap-2">
                {estadoQuiz === "generando" && (
                  <>
                    <IconoCargador className="h-4 w-4" />
                    Generando quiz...
                  </>
                )}
                {estadoQuiz === "listo" && (
                  <>
                    <IconoPlay className="h-4 w-4" />
                    Pasar al sondeo
                  </>
                )}
                {estadoQuiz === "idle" && (
                  <>
                    <IconoDestello className="h-4 w-4" />
                    Generar quiz
                  </>
                )}
              </span>
              {estadoQuiz !== "generando" && <IconoFlecha className="h-4 w-4 shrink-0" />}
            </button>

            {error && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-red-400">
                <IconoAlerta className="mt-px h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>
        </div>

        {/* Sesiones pasadas */}
        <button
          onClick={abrirSesiones}
          className="group mt-6 flex w-full items-center gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-5 text-left transition-colors duration-200 hover:border-neutral-700 hover:bg-neutral-900/80 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950/60 text-neutral-400 transition-colors group-hover:text-neutral-200">
            <IconoHistorial className="h-4 w-4" />
          </span>
          <span className="flex-1 text-sm font-medium text-neutral-200">Sesiones pasadas</span>
          <IconoChevron className="h-4 w-4 text-neutral-600 transition-colors group-hover:text-neutral-300" />
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
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-100">
                <IconoAjustes className="h-4 w-4 text-neutral-500" />
                Ajustes
              </h2>
              <button
                onClick={() => setAjustesModalAbierto(false)}
                title="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-800/60 hover:text-neutral-100"
              >
                <IconoCerrar className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-sm font-medium text-neutral-200 mb-1">
                Modelo para sub-temas y feedback
              </p>
              <p className="text-xs text-neutral-500 mb-3">
                Se usa al crear el quiz y al generar el feedback final del sondeo.
              </p>
              {cargandoModelos ? (
                <p className="text-xs text-neutral-600">Cargando modelos...</p>
              ) : (
                <>
                  <select
                    value={modeloPrincipal}
                    onChange={(e) => guardarModeloPrincipal(e.target.value)}
                    className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 transition-colors focus:border-neutral-600 focus:outline-none"
                  >
                    <option value={MODELO_GEMINI}>Gemini (nube) — {MODELO_GEMINI}</option>
                    {modelosDisponibles.map((m) => (
                      <option key={m.nombre} value={m.nombre}>
                        {m.nombre}
                      </option>
                    ))}
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.nombre}>
                        {p.nombre + " (nube)"}
                      </option>
                    ))}
                  </select>
                  {modelosDisponibles.length === 0 && (
                    <p className="mt-1.5 text-xs text-red-500">
                      No se pudo conectar con Ollama en localhost:11434.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="mb-2">
              <p className="text-sm font-medium text-neutral-200 mb-1">
                Modelo para preguntas del sondeo
              </p>
              <p className="text-xs text-neutral-500 mb-3">
                Se llama una vez cada 3 preguntas (en lote) — un modelo más liviano
                acelera el sondeo.
              </p>
              {cargandoModelos ? (
                <p className="text-xs text-neutral-600">Cargando modelos...</p>
              ) : (
                <>
                  <select
                    value={modeloPreguntas}
                    onChange={(e) => guardarModeloPreguntas(e.target.value)}
                    className="w-full rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 transition-colors focus:border-neutral-600 focus:outline-none"
                  >
                    <option value={MODELO_GEMINI}>Gemini (nube) — {MODELO_GEMINI}</option>
                    {modelosDisponibles.map((m) => (
                      <option key={m.nombre} value={m.nombre}>
                        {m.nombre}
                      </option>
                    ))}
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.nombre}>
                        {p.nombre + " (nube)"}
                      </option>
                    ))}
                  </select>
                  {modelosDisponibles.length === 0 && (
                    <p className="mt-1.5 text-xs text-red-500">
                      No se pudo conectar con Ollama en localhost:11434.
                    </p>
                  )}
                </>
              )}
            </div>

            <div className="mb-2 mt-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-neutral-200 mb-1">
                    Pre-generar el próximo lote
                  </p>
                  <p className="text-xs text-neutral-500">
                    Mientras respondés, las preguntas del siguiente sub-tema ya se están
                    generando en segundo plano: el cambio de tema no corta. Solo con IA
                    local (Ollama) — en nube se apaga para no gastar tokens.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={pregen}
                  onClick={() => guardarPregen(!pregen)}
                  className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-200 ${
                    pregen
                      ? "border-neutral-500 bg-neutral-300"
                      : "border-neutral-800 bg-neutral-900"
                  }`}
                >
                  <span
                    className={`absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full transition-all duration-200 ${
                      pregen ? "left-6 bg-neutral-900" : "left-1 bg-neutral-600"
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-6">
              <h3 className="mb-2 text-sm font-medium tracking-tight text-neutral-200">Proveedores de nube configurados</h3>
               {proveedores.length === 0 ? (
                 <p className="text-xs text-neutral-500">No hay proveedores configurados</p>
               ) : (
                 <div className="space-y-2">
                   {proveedores.map((p) => (
                     <div key={p.id} className="flex items-center justify-between rounded-xl border border-neutral-800/60 bg-neutral-900/60 p-2.5 text-xs transition-colors hover:border-neutral-700">
                       <div className="flex flex-col">
                         <span className="text-neutral-200">{p.nombre}</span>
                         <span className="text-neutral-500">{`••••••${p.apiKey.slice(-4)}`}</span>
                       </div>
                       <button
                         onClick={() => {
                           eliminarProveedor(p.id);
                           setProveedores(obtenerProveedores());
                         }}
                         className="flex items-center gap-1.5 rounded-full px-2 py-1 text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                       >
                         Eliminar
                       </button>
                     </div>
                   ))}
                 </div>
               )}
                  <button onClick={() => setMostrandoFormProveedor(true)} className="mt-3 self-start rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-300 transition-colors duration-200 hover:border-neutral-600 hover:bg-neutral-800/40 hover:text-neutral-100">+ Agregar proveedor</button>
                  {mostrandoFormProveedor && (
                    <div className="mt-2 flex flex-col gap-2">
                      <input
                        className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
                        value={nuevoNombre}
                        onChange={(e) => setNuevoNombre(e.target.value)}
                        placeholder="Nombre (ej. Groq)"
                      />
                      <input
                        className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
                        value={nuevaBaseUrl}
                        onChange={(e) => setNuevaBaseUrl(e.target.value)}
                        placeholder="URL base de la API"
                      />
                      <input
                        className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
                        value={nuevoModelo}
                        onChange={(e) => setNuevoModelo(e.target.value)}
                        placeholder="Modelo de la API (ej. llama-3.1-8b-instant)"
                      />
                      <input
                        className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
                        value={nuevaApiKey}
                        onChange={(e) => setNuevaApiKey(e.target.value)}
                        placeholder="API Key"
                      />
                      <select
                        className="rounded-lg bg-neutral-900 border border-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 transition-colors focus:border-neutral-600 focus:outline-none"
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
                              // Opcional: si se deja vacío se usa el modelo por defecto.
                              modelo: nuevoModelo.trim() || undefined,
                            });
                            setProveedores(obtenerProveedores());
                            setNuevoNombre("");
                            setNuevaBaseUrl("");
                            setNuevaApiKey("");
                            setNuevoModelo("");
                            setNuevoFormato("openai");
                            setMostrandoFormProveedor(false);
                          }}
                        >
                          Guardar
                        </button>
                        <button onClick={() => setMostrandoFormProveedor(false)} className="rounded-full border border-neutral-800 px-4 py-1.5 text-xs text-neutral-400 transition-colors duration-200 hover:border-neutral-600 hover:bg-neutral-800/40 hover:text-neutral-100">
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
            <div className="mb-6 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-neutral-100">
                <IconoHistorial className="h-4 w-4 text-neutral-500" />
                Sesiones pasadas
              </h2>
              <button
                onClick={() => setSesionesModalAbierto(false)}
                title="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-800/60 hover:text-neutral-100"
              >
                <IconoCerrar className="h-4 w-4" />
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
                    className="group flex cursor-pointer items-center justify-between rounded-xl border border-neutral-800/60 bg-neutral-900/50 p-3 transition-colors duration-200 hover:border-neutral-700 hover:bg-neutral-900"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-neutral-200">
                        {s.topic}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {formatearFecha(s.creadoEn)}
                      </span>
                      {s.completa ? (
                        <span className="flex items-center gap-1.5 text-xs text-green-400">
                          <IconoCheck className="h-3.5 w-3.5" />
                          Completo
                        </span>
                      ) : (
                        <span className="text-xs tabular-nums text-neutral-500">
                          {s.preguntasRespondidas}/{s.totalPreguntas} preguntas
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        eliminarSesionModal(s.id);
                      }}
                      title="Eliminar sesión"
                      className="flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 opacity-0 transition-colors hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                    >
                      <IconoEliminar className="h-4 w-4" />
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
