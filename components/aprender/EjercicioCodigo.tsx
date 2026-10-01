"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { IconoAlerta, IconoCargador, IconoCheck, IconoDestello, IconoEquis, IconoPlay } from "@/components/ui/Iconos";
import RunnerSandbox, { type ResultadoRunner, type SandboxHandle } from "./RunnerSandbox";
import BotonReportarEjercicio from "./BotonReportarEjercicio";
import type { Ejercicio, IntentoEjercicio } from "@/lib/tipos";

// CodeMirror necesita `document` al construirse: se carga solo en el cliente (la doc de
// Next dice que dynamic con ssr:false es válido dentro de un Client Component).
const EditorCodigo = dynamic(() => import("./EditorCodigo"), {
  ssr: false,
  loading: () => (
    <div className="h-[240px] animate-pulse rounded-xl border border-neutral-800 bg-neutral-950" />
  ),
});

interface EjercicioCodigoProps {
  ejercicio: Ejercicio;
  /** Último intento guardado: restaura el código que había escrito el estudiante. */
  ultimoIntento: IntentoEjercicio | null;
  /** Avisa al padre cuando el ejercicio queda aprobado (alimenta el sidebar). */
  onAprobado: (ejercicioId: number) => void;
}

export default function EjercicioCodigo({ ejercicio, ultimoIntento, onAprobado }: EjercicioCodigoProps) {
  const sandboxRef = useRef<SandboxHandle>(null);
  const [codigo, setCodigo] = useState(ultimoIntento?.codigo || ejercicio.plantilla || "");
  const [resultado, setResultado] = useState<ResultadoRunner | null>(null);
  const [corriendo, setCorriendo] = useState(false);
  const [aprobado, setAprobado] = useState(ultimoIntento?.aprobado ?? false);
  const [mostrarPista, setMostrarPista] = useState(false);
  const [mostrarSolucion, setMostrarSolucion] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState(false);

  async function ejecutar() {
    const sandbox = sandboxRef.current;
    if (!sandbox || corriendo) return;

    setCorriendo(true);
    setResultado(null);
    setErrorGuardado(false);

    // Las assertions corren en el iframe (origen opaco): el server nunca ejecuta código.
    const r = await sandbox.correr(codigo, ejercicio.assertions);
    setResultado(r);
    setCorriendo(false);
    setAprobado((previa) => previa || r.ok);
    if (r.ok) onAprobado(ejercicio.id);

    // El intento se persiste SIEMPRE (aprobado o no): es lo que permite reanudar y
    // contar "1/2 ejercicios". El `aprobado` sale del runner, no lo decide el usuario.
    try {
      const res = await fetch("/api/aprender/intento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ejercicioId: ejercicio.id,
          codigo,
          aprobado: r.ok,
          salida: JSON.stringify({
            logs: r.logs,
            resultados: r.resultados,
            errorCompilacion: r.errorCompilacion,
            errorEjecucion: r.errorEjecucion,
          }),
        }),
      });
      const data = await res.json();
      if (data.error) setErrorGuardado(true);
    } catch {
      setErrorGuardado(true);
    }
  }

  const etiquetaVariante =
    ejercicio.variante === "jsx" || ejercicio.lenguaje === "jsx"
      ? "Componente (jsx)"
      : "JavaScript puro";

  return (
    <div
      data-ejercicio={ejercicio.id}
      className="rounded-2xl border border-neutral-800/60 bg-neutral-900/50 p-5 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]"
    >
      <RunnerSandbox ref={sandboxRef} />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-neutral-700/60 bg-neutral-800/60 px-2.5 py-0.5 text-xs text-neutral-300">
            {etiquetaVariante}
          </span>
          <span className="text-xs text-neutral-600">Dificultad: {ejercicio.dificultad}</span>
        </div>
        {aprobado ? (
          <span className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-0.5 text-xs text-green-300">
            <IconoCheck className="h-3.5 w-3.5" />
            Aprobado
          </span>
        ) : (
          <span className="text-xs text-neutral-600">Pendiente</span>
        )}
      </div>

      <p className="mb-4 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
        {ejercicio.enunciado}
      </p>

      <EditorCodigo valor={codigo} onChange={setCodigo} onRun={ejecutar} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={ejecutar}
          disabled={corriendo}
          className="flex items-center gap-2 rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition-all duration-200 hover:bg-white disabled:opacity-50"
        >
          {corriendo ? (
            <>
              <IconoCargador className="h-3.5 w-3.5" />
              Corriendo...
            </>
          ) : (
            <>
              <IconoPlay className="h-3.5 w-3.5" />
              Ejecutar
            </>
          )}
        </button>
        <span className="text-[11px] text-neutral-600">Cmd/Ctrl + Enter</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => setMostrarPista((v) => !v)}
            className="flex items-center gap-1.5 rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
          >
            <IconoDestello className="h-3.5 w-3.5" />
            Pista
          </button>
          <button
            onClick={() => setMostrarSolucion((v) => !v)}
            className="rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
          >
            {mostrarSolucion ? "Ocultar solución" : "Ver solución"}
          </button>
          <button
            onClick={() => {
              setCodigo(ejercicio.plantilla || "");
              setResultado(null);
            }}
            className="rounded-full border border-neutral-800 px-3 py-1.5 text-xs text-neutral-400 transition-colors hover:border-neutral-700 hover:text-neutral-200"
          >
            Reiniciar
          </button>
        </div>
      </div>

      {mostrarPista && ejercicio.pista && (
        <p className="mt-3 rounded-xl border border-neutral-800/70 bg-neutral-950/50 p-3 text-sm text-neutral-300">
          {ejercicio.pista}
        </p>
      )}

      {mostrarSolucion && ejercicio.solucion && (
        <div className="mt-3 rounded-xl border border-neutral-800/70 bg-neutral-950/50 p-3">
          <p className="mb-1.5 text-xs uppercase tracking-wider text-neutral-500">Solución</p>
          <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-neutral-300">
            {ejercicio.solucion}
          </pre>
        </div>
      )}

      {resultado && (
        <div className="mt-4 flex flex-col gap-2">
          {(resultado.errorCompilacion || resultado.errorEjecucion) && (
            <p className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.06] p-3 text-sm text-red-300">
              <IconoAlerta className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="whitespace-pre-wrap">
                {resultado.errorCompilacion
                  ? `Error de sintaxis: ${resultado.errorCompilacion}`
                  : `Error al ejecutar: ${resultado.errorEjecucion}`}
              </span>
            </p>
          )}

          {resultado.resultados.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {resultado.resultados.map((item, indice) => (
                <li
                  key={`${item.descripcion}-${indice}`}
                  className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                    item.ok
                      ? "border-green-500/25 bg-green-500/[0.06] text-green-300"
                      : "border-red-500/25 bg-red-500/[0.06] text-red-300"
                  }`}
                >
                  {item.ok ? (
                    <IconoCheck className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <IconoEquis className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <span>
                    {item.descripcion}
                    {item.error ? ` — ${item.error}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {resultado.logs.length > 0 && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
              <p className="mb-1 text-xs uppercase tracking-wider text-neutral-500">Consola</p>
              <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-400">
                {resultado.logs.join("\n")}
              </pre>
            </div>
          )}

          <p className={`text-xs font-medium ${resultado.ok ? "text-green-400" : "text-neutral-500"}`}>
            {resultado.ok
              ? "¡Todas las condiciones pasan!"
              : "Todavía no pasa todas las condiciones."}
          </p>
        </div>
      )}

      {errorGuardado && (
        <p className="mt-2 text-xs text-amber-400">
          No se pudo guardar el intento. El código quedó en pantalla: probá de nuevo.
        </p>
      )}

      {/* "Este ejercicio está mal": vive dentro de la card para que quede pegado al ejercicio que
          se está reportando, no a la pantalla. Ver components/aprender/BotonReportarEjercicio.tsx. */}
      <BotonReportarEjercicio ejercicioId={ejercicio.id} />
    </div>
  );
}
