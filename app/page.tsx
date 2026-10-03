"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  obtenerProveedores,
  proveedorDeModelo,
  type ProveedorNube,
} from "@/lib/proveedores";
import { MODELO_PRINCIPAL_POR_DEFECTO, PRESET_POR_DEFECTO, normalizarPreset, type PresetCalidad } from "@/lib/config";
import type { ModoSesion, NivelSesion } from "@/lib/tipos";
import {
  IconoAdjuntar,
  IconoAjustes,
  IconoAlerta,
  IconoCargador,
  IconoChevron,
  IconoDestello,
  IconoDocumento,
  IconoEliminar,
  IconoFlecha,
  IconoHistorial,
  IconoObjetivo,
  IconoPlay,
} from "@/components/ui/Iconos";
import TarjetaRepaso from "@/components/repaso/TarjetaRepaso";
import ModalAjustes from "@/components/ajustes/ModalAjustes";
import ModalSesiones, { type SesionConEstado } from "@/components/sesiones/ModalSesiones";


type EstadoQuiz = "idle" | "generando" | "listo";

const COPY_POR_ESTADO: Record<EstadoQuiz, { titulo: string; subtitulo: string }> = {
  idle: {
    titulo: "Generá tu quiz",
    subtitulo: "Pegá tus notas o contá el tema que querés practicar.",
  },
  generando: {
    titulo: "Generando...",
    subtitulo: "La IA está armando el material y las preguntas.",
  },
  listo: {
    titulo: "Revisá los sub-temas",
    subtitulo: "Elegí los que querés cubrir y pasá al sondeo.",
  },
};

export default function HomePage() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [estadoQuiz, setEstadoQuiz] = useState<EstadoQuiz>("idle");
  const [sesionId, setSesionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fase C1 — modalidad de entrada (notas pegadas vs. tema libre) y confirmación de
  // sub-temas: los detectados se muestran con checkbox antes de entrar al sondeo.
  const [modo, setModo] = useState<ModoSesion>("apunte");
  const [temaLibre, setTemaLibre] = useState("");
  const [nivel, setNivel] = useState<NivelSesion>("intermedio");
  const [objetivo, setObjetivo] = useState("");
  const [subtemasGenerados, setSubtemasGenerados] = useState<{ id: number; nombre: string }[]>([]);
  const [subtemasElegidos, setSubtemasElegidos] = useState<number[]>([]);
  const [apunteGenerado, setApunteGenerado] = useState<string | null>(null);
  const [mostrarApunte, setMostrarApunte] = useState(false);
  const [preparandoSondeo, setPreparandoSondeo] = useState(false);
  // Cobertura del último análisis: sirve para avisar cuando el material era largo y
  // salieron pocos sub-temas (antes el modelo solo miraba el principio del texto).
  const [analisis, setAnalisis] = useState<{
    bloques: number;
    subtemas: number;
    textoChars: number;
  } | null>(null);

  const [ajustesModalAbierto, setAjustesModalAbierto] = useState(false);
  const [modeloPrincipal, setModeloPrincipal] = useState(MODELO_PRINCIPAL_POR_DEFECTO);
  // Calidad vs tiempo: viaja en el body de creación y en el sondeo.
  const [preset, setPreset] = useState<PresetCalidad>(PRESET_POR_DEFECTO);
  const [proveedores, setProveedores] = useState<ProveedorNube[]>([]);


  const [subiendoArchivo, setSubiendoArchivo] = useState(false);

  const [sesionesModalAbierto, setSesionesModalAbierto] = useState(false);
  const [sesiones, setSesiones] = useState<SesionConEstado[]>([]);

  useEffect(() => {
    const guardadoPrincipal = localStorage.getItem("uselearn:modeloPrincipal");
    const presetGuardado = normalizarPreset(localStorage.getItem("uselearn:preset") ?? undefined);
    // Se cargan acá y no recién al abrir Ajustes: si no, al crear una sesión con un
    // proveedor de nube elegido el componente no lo tenía en estado y no se mandaba.
    const proveedoresGuardados = obtenerProveedores();
    // Un microtask de diferencia: el lint de React castiga el setState sincrono
    // dentro del efecto (renders en cascada).
    void Promise.resolve().then(() => {
      if (guardadoPrincipal) setModeloPrincipal(guardadoPrincipal);
      setPreset(presetGuardado);
      setProveedores(proveedoresGuardados);
    });
  }, []);

  function abrirAjustes() {
    setAjustesModalAbierto(true);
    setProveedores(obtenerProveedores());
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

  /**
   * Vuelve a "idle" si ya se había creado una sesión: el contenido cambió, así que lo
   * generado ya no corresponde (la sesión vieja queda en la lista con 0 preguntas, igual
   * que siempre pasaba cuando se editaba el texto después de "¡Quiz listo!").
   */
  function resetSiListo() {
    if (estadoQuiz === "listo") {
      setEstadoQuiz("idle");
      setSesionId(null);
      setSubtemasGenerados([]);
      setSubtemasElegidos([]);
      setApunteGenerado(null);
      setAnalisis(null);
      setMostrarApunte(false);
    }
  }

  function cambiarModo(nuevo: ModoSesion) {
    if (nuevo === modo) return;
    setModo(nuevo);
    resetSiListo();
    setError(null);
  }

  async function generarQuiz() {
    const hayContenido = modo === "apunte" ? texto.trim() : temaLibre.trim();
    if (!hayContenido) return;
    setEstadoQuiz("generando");
    setError(null);
    try {
      const res = await fetch("/api/sesiones/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Dos modalidades: "apunte" manda el texto tal cual; "tema_libre" manda el
          // tema y el server genera el apunte de estudio con el modelo elegido.
          ...(modo === "tema_libre"
            ? { modo, tema: temaLibre, nivel, objetivo }
            : { modo, texto }),
          modeloPrincipal,
          // Calidad vs tiempo: el servidor decide con esto cuántos bloques analiza, cuántos
          // sub-temas busca y cuánto contexto le manda al modelo.
          preset,
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
      const detectados: { id: number; nombre: string }[] = Array.isArray(data.subtemas) ? data.subtemas : [];
      setSesionId(data.sesionId);
      setSubtemasGenerados(detectados);
      setSubtemasElegidos(detectados.map((s) => s.id));
      setApunteGenerado(typeof data.apunte === "string" ? data.apunte : null);
      // El server informa en cuántos bloques analizó el material: si era largo y salieron
      // pocos sub-temas, se avisa en pantalla en vez de dejar que el plan salga pobre.
      setAnalisis(
        data.analisis && typeof data.analisis.bloques === "number"
          ? {
              bloques: data.analisis.bloques,
              subtemas: Number(data.analisis.subtemas) || detectados.length,
              textoChars: Number(data.analisis.textoChars) || 0,
            }
          : null
      );
      setEstadoQuiz("listo");
    } catch {
      setError("No se pudo conectar con el servidor.");
      setEstadoQuiz("idle");
    }
  }

  function alternarSubtema(id: number) {
    setSubtemasElegidos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function pasarAlSondeo() {
    if (!sesionId) return;

    if (subtemasElegidos.length === 0) {
      setError("Elegí al menos un sub-tema.");
      return;
    }

    // Confirmación explícita: si se desmarcó algún sub-tema hay que sacarlo de la base
    // ANTES de entrar al sondeo (todavía no hay respuestas, único caso permitido).
    const todos = subtemasGenerados.map((s) => s.id);
    if (subtemasElegidos.length !== todos.length) {
      setPreparandoSondeo(true);
      try {
        const res = await fetch(`/api/sesiones/${sesionId}/subtemas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mantener: subtemasElegidos }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
          return;
        }
      } catch {
        setError("No se pudieron actualizar los sub-temas.");
        return;
      } finally {
        setPreparandoSondeo(false);
      }
    }
    router.push(`/sondeo/${sesionId}`);
  }

  function manejarCambioTexto(nuevoTexto: string) {
    setTexto(nuevoTexto);
    resetSiListo();
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
            <div className="mb-4 flex items-center justify-between gap-2.5">
              <span className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-800 bg-neutral-950/60 text-neutral-400">
                  {modo === "apunte" ? <IconoDocumento className="h-4 w-4" /> : <IconoObjetivo className="h-4 w-4" />}
                </span>
                <span className="text-sm font-medium text-neutral-200">
                  {modo === "apunte" ? "Pega tus notas o lo que sea..." : "Contá qué querés practicar"}
                </span>
              </span>
              {/* Modalidad de entrada (Fase C1): notas pegadas vs. tema libre */}
              <div className="flex shrink-0 rounded-full border border-neutral-800 bg-neutral-950/60 p-0.5">
                <button
                  onClick={() => cambiarModo("apunte")}
                  disabled={estadoQuiz === "generando"}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors duration-200 disabled:opacity-40 ${
                    modo === "apunte" ? "bg-neutral-800/80 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <IconoDocumento className="h-3.5 w-3.5" />
                  Notas
                </button>
                <button
                  onClick={() => cambiarModo("tema_libre")}
                  disabled={estadoQuiz === "generando"}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs transition-colors duration-200 disabled:opacity-40 ${
                    modo === "tema_libre" ? "bg-neutral-800/80 text-neutral-100" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  <IconoObjetivo className="h-3.5 w-3.5" />
                  Tema libre
                </button>
              </div>
            </div>
            <textarea
              value={modo === "apunte" ? texto : temaLibre}
              onChange={(e) => (modo === "apunte" ? manejarCambioTexto(e.target.value) : setTemaLibre(e.target.value))}
              disabled={estadoQuiz === "generando"}
              placeholder={
                modo === "apunte"
                  ? "Puedes pegar un texto, una pregunta, una imagen o lo que quieras revisar."
                  : "Ej: sintaxis y lógica de JavaScript, hooks de React, gramática inglesa..."
              }
              className="notas-textarea flex-1 resize-none bg-transparent text-sm text-neutral-300 placeholder:text-neutral-600 focus:outline-none disabled:opacity-50"
            />
            {modo === "tema_libre" && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  value={nivel}
                  onChange={(e) => {
                    setNivel(e.target.value as NivelSesion);
                    resetSiListo();
                  }}
                  disabled={estadoQuiz === "generando"}
                  className="rounded-lg border border-neutral-800 bg-neutral-950/60 px-2.5 py-1.5 text-xs text-neutral-300 transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50"
                >
                  <option value="basico">Nivel básico</option>
                  <option value="intermedio">Nivel intermedio</option>
                  <option value="avanzado">Nivel avanzado</option>
                </select>
                <input
                  value={objetivo}
                  onChange={(e) => {
                    setObjetivo(e.target.value);
                    resetSiListo();
                  }}
                  disabled={estadoQuiz === "generando"}
                  placeholder="Objetivo (opcional): ej. aprobar un examen"
                  className="min-w-0 flex-1 rounded-lg border border-neutral-800 bg-neutral-950/60 px-2.5 py-1.5 text-xs text-neutral-300 placeholder:text-neutral-600 transition-colors focus:border-neutral-600 focus:outline-none disabled:opacity-50"
                />
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 self-start">
              <button
                onClick={() => {
                  if (modo === "apunte") {
                    manejarCambioTexto("");
                  } else {
                    setTemaLibre("");
                    resetSiListo();
                  }
                }}
                disabled={estadoQuiz === "generando"}
                className="flex items-center gap-2 rounded-full border border-neutral-800 px-4 py-1.5 text-sm text-neutral-400 transition-colors duration-200 hover:border-neutral-600 hover:bg-neutral-800/40 hover:text-neutral-100 disabled:opacity-40"
              >
                <IconoEliminar className="h-3.5 w-3.5" />
                {modo === "apunte" ? "Limpiar texto" : "Limpiar tema"}
              </button>
              {/* Adjuntar solo en modo Notas: el modo tema libre no tiene texto propio. */}
              {modo === "apunte" && (
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
              )}
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
            <p className="mb-4 text-sm text-neutral-500">{COPY_POR_ESTADO[estadoQuiz].subtitulo}</p>

            {/* Fase C1 — confirmación de sub-temas: se pueden desmarcar antes de entrar. */}
            {estadoQuiz === "listo" && subtemasGenerados.length > 0 && (
              <div className="mb-4 rounded-xl border border-neutral-800/70 bg-neutral-950/40 p-3">
                <p className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-neutral-500">
                  <span>Sub-temas detectados</span>
                  <span className="tabular-nums text-neutral-400">
                    {subtemasElegidos.length}/{subtemasGenerados.length}
                  </span>
                </p>
                {analisis && analisis.bloques > 1 && (
                  <p
                    className={`mb-2 rounded-lg border px-2.5 py-2 text-xs leading-relaxed ${
                      analisis.subtemas < 5
                        ? "border-amber-500/25 bg-amber-500/[0.06] text-amber-300"
                        : "border-neutral-800 bg-neutral-950/60 text-neutral-400"
                    }`}
                  >
                    {analisis.subtemas < 5
                      ? `El material se analizó en ${analisis.bloques} bloques y salieron solo ${analisis.subtemas} sub-temas: probá el nivel "Profundo" en Ajustes o pegá un texto más puntual.`
                      : `Material analizado en ${analisis.bloques} bloques (${analisis.textoChars.toLocaleString("es-AR")} caracteres).`}
                  </p>
                )}
                <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-neutral-700">
                  {subtemasGenerados.map((s) => {
                    const activo = subtemasElegidos.includes(s.id);
                    return (
                      <li key={s.id}>
                        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150 hover:bg-neutral-900/70">
                          <input
                            type="checkbox"
                            checked={activo}
                            onChange={() => alternarSubtema(s.id)}
                            disabled={preparandoSondeo}
                            className="h-3.5 w-3.5 shrink-0 accent-neutral-200"
                          />
                          <span className={activo ? "text-neutral-200" : "text-neutral-600 line-through"}>
                            {s.nombre}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {apunteGenerado && (
                  <div className="mt-2 border-t border-neutral-800/70 pt-2">
                    <button
                      onClick={() => setMostrarApunte((v) => !v)}
                      className="flex items-center gap-1.5 text-xs text-neutral-500 transition-colors duration-150 hover:text-neutral-300"
                    >
                      <IconoChevron
                        className={`h-3.5 w-3.5 transition-transform duration-200 ${mostrarApunte ? "rotate-180" : ""}`}
                      />
                      {mostrarApunte ? "Ocultar apunte generado" : "Ver apunte generado"}
                    </button>
                    {mostrarApunte && (
                      <p className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-neutral-500">
                        {apunteGenerado}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            {estadoQuiz === "listo" && subtemasElegidos.length === 0 && (
              <p className="mb-3 text-xs text-amber-400">Elegí al menos un sub-tema para continuar.</p>
            )}

            <button
              onClick={estadoQuiz === "listo" ? pasarAlSondeo : generarQuiz}
              disabled={
                preparandoSondeo ||
                estadoQuiz === "generando" ||
                (modo === "apunte" ? !texto.trim() : !temaLibre.trim()) ||
                (estadoQuiz === "listo" && subtemasElegidos.length === 0)
              }
              className={`flex items-center justify-between gap-3 rounded-full px-5 py-3 text-sm font-medium transition-all duration-300 ${
                estadoQuiz === "generando" || preparandoSondeo
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
                {preparandoSondeo && (
                  <>
                    <IconoCargador className="h-4 w-4" />
                    Preparando sondeo...
                  </>
                )}
                {estadoQuiz === "listo" && !preparandoSondeo && (
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
              {estadoQuiz !== "generando" && !preparandoSondeo && <IconoFlecha className="h-4 w-4 shrink-0" />}
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

        {/* Memoria entre sesiones: repaso espaciado (sección 11 del ESTADO). */}
        <TarjetaRepaso />

        {/* Progreso por concepto: vista longitudinal que antes no existía. */}
        <button
          onClick={() => router.push("/progreso")}
          className="group mt-3 flex w-full items-center gap-3 rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-5 text-left transition-colors duration-200 hover:border-neutral-700 hover:bg-neutral-900/80"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-950/60 text-neutral-400 transition-colors group-hover:text-neutral-200">
            <IconoObjetivo className="h-4 w-4" />
          </span>
          <span className="flex-1 text-sm font-medium text-neutral-200">Tu progreso</span>
          <IconoChevron className="h-4 w-4 text-neutral-600 transition-colors group-hover:text-neutral-300" />
        </button>
      </main>

      {/* Modal de Ajustes (extraído a components/ajustes/ModalAjustes.tsx — deuda §6.13). */}
      {ajustesModalAbierto && (
        <ModalAjustes
          onCerrar={() => setAjustesModalAbierto(false)}
          modeloPrincipal={modeloPrincipal}
          onModeloPrincipal={guardarModeloPrincipal}
          proveedores={proveedores}
          onProveedores={setProveedores}
        />
      )}

      {/* Modal de Sesiones pasadas (extraído a components/sesiones/ModalSesiones.tsx — deuda §6.13). */}
      {sesionesModalAbierto && (
        <ModalSesiones
          sesiones={sesiones}
          onCerrar={() => setSesionesModalAbierto(false)}
          onAbrir={(id) => router.push(`/sondeo/${id}`)}
          onEliminar={eliminarSesionModal}
        />
      )}
    </div>
  );
}
