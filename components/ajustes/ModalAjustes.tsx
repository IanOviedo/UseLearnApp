// Modal de Ajustes — extraído de `app/page.tsx` (deuda §6.13: el archivo llega a 935 líneas).
//
// Frontera deliberada: acá vive todo lo que solo sirve para mostrar/editar la configuración
// (modelos de Ollama, modelo de preguntas, pre-generación y proveedores de nube). Entran por
// props `modeloPrincipal` y `proveedores`, que es lo que la página necesita para crear la
// sesión, y se notifican al cambiar.
"use client";

import { useEffect, useState } from "react";
import { obtenerProveedores, eliminarProveedor, agregarProveedor, type ProveedorNube } from "@/lib/proveedores";
import { MODELO_GEMINI, MODELO_PREGUNTAS_POR_DEFECTO } from "@/lib/config";
import { IconoAjustes, IconoCerrar } from "@/components/ui/Iconos";

interface ModeloOllama {
  nombre: string;
  tamano: number;
}

interface Props {
  onCerrar: () => void;
  /** Modelo para sub-temas y feedback: lo muestra, lo cambia y lo usa la página al crear. */
  modeloPrincipal: string;
  onModeloPrincipal: (nombre: string) => void;
  proveedores: ProveedorNube[];
  onProveedores: (proveedores: ProveedorNube[]) => void;
}

export default function ModalAjustes({
  onCerrar,
  modeloPrincipal,
  onModeloPrincipal,
  proveedores,
  onProveedores,
}: Props) {
  const [modelosDisponibles, setModelosDisponibles] = useState<ModeloOllama[]>([]);
  const [cargandoModelos, setCargandoModelos] = useState(true);
  const [modeloPreguntas, setModeloPreguntas] = useState(MODELO_PREGUNTAS_POR_DEFECTO);
  const [pregen, setPregen] = useState(true);
  const [mostrandoFormProveedor, setMostrandoFormProveedor] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevaBaseUrl, setNuevaBaseUrl] = useState("");
  const [nuevaApiKey, setNuevaApiKey] = useState("");
  const [nuevoModelo, setNuevoModelo] = useState("");
  const [nuevoFormato, setNuevoFormato] = useState<"openai" | "gemini-nativo">("openai");

  useEffect(() => {
    const preguntasGuardadas = localStorage.getItem("uselearn:modeloPreguntas");
    const pregenGuardado = localStorage.getItem("uselearn:pregen") !== "0";
    // Mismo truco que en la página: un microtask de diferencia, porque el lint de React
    // castiga el setState sincrono dentro del efecto.
    void Promise.resolve().then(() => {
      if (preguntasGuardadas) setModeloPreguntas(preguntasGuardadas);
      setPregen(pregenGuardado);
    });

    let cancelado = false;
    (async () => {
      try {
        const res = await fetch("/api/modelos/listar");
        const data = await res.json();
        if (!cancelado && data.modelos) setModelosDisponibles(data.modelos);
      } catch {
        // silencioso: el modal muestra el estado vacío si falla
      } finally {
        if (!cancelado) setCargandoModelos(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  function guardarModeloPreguntas(nombre: string) {
    setModeloPreguntas(nombre);
    localStorage.setItem("uselearn:modeloPreguntas", nombre);
  }

  function guardarPregen(valor: boolean) {
    setPregen(valor);
    localStorage.setItem("uselearn:pregen", valor ? "1" : "0");
  }

  return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onCerrar}
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
              onClick={onCerrar}
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
                  onChange={(e) => onModeloPrincipal(e.target.value)}
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
                         onProveedores(obtenerProveedores());
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
                          onProveedores(obtenerProveedores());
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
  );
}
