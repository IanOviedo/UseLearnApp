"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MODELOS_DISPONIBLES = ["GPT-OSS 20B", "Gemma 4 26B", "Llama 3.1 8B"];

export default function HomePage() {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modeloAbierto, setModeloAbierto] = useState(false);
  const [modeloSeleccionado, setModeloSeleccionado] = useState(MODELOS_DISPONIBLES[0]);
  const [ajustesAbiertos, setAjustesAbiertos] = useState(false);
  const [sesionesAbiertas, setSesionesAbiertas] = useState(true);

  async function pasarAlSondeo() {
    if (!texto.trim()) return;
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/sesiones/crear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      router.push(`/sondeo/${data.sesionId}`);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setCargando(false);
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
            onClick={() => setModeloAbierto((v) => !v)}
            className="flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-4 py-1.5 text-sm"
          >
            <span>✦</span>
            Ask {modeloSeleccionado}
            <span className="text-neutral-500">▾</span>
          </button>
          {modeloAbierto && (
            <div className="absolute right-24 top-10 w-56 rounded-lg border border-neutral-800 bg-neutral-900 p-1 shadow-xl z-10">
              {MODELOS_DISPONIBLES.map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setModeloSeleccionado(m);
                    setModeloAbierto(false);
                  }}
                  className={`block w-full text-left text-sm rounded-md px-3 py-2 hover:bg-neutral-800 ${
                    m === modeloSeleccionado ? "text-neutral-100" : "text-neutral-400"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setAjustesAbiertos((v) => !v)}
            className="rounded-full border border-neutral-800 bg-neutral-900 h-8 w-8 flex items-center justify-center text-neutral-400"
          >
            ⚙
          </button>
          {ajustesAbiertos && (
            <div className="absolute right-0 top-10 w-64 rounded-lg border border-neutral-800 bg-neutral-900 p-4 shadow-xl z-10 text-sm text-neutral-400">
              <p className="font-medium text-neutral-200 mb-2">Ajustes</p>
              <p>Configuración de API (local / nube) — próximamente.</p>
            </div>
          )}
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
              onChange={(e) => setTexto(e.target.value)}
              disabled={cargando}
              placeholder="Puedes pegar un texto, una pregunta, una imagen o lo que quieras revisar."
              className="flex-1 resize-none bg-transparent text-sm text-neutral-300 placeholder:text-neutral-600 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={() => setTexto("")}
              disabled={cargando}
              className="self-start mt-4 flex items-center gap-2 rounded-full border border-neutral-700 px-4 py-1.5 text-sm text-neutral-300 hover:border-neutral-500 disabled:opacity-40"
            >
              ⤢ Limpiar texto
            </button>
          </div>

          {/* Quiz listo */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-1">
              <span>✦</span>
              <span className="font-semibold">Quiz listo</span>
            </div>
            <p className="text-sm text-neutral-500 mb-6">Genera un quiz a partir de tu texto.</p>

            <button
              onClick={pasarAlSondeo}
              disabled={!texto.trim() || cargando}
              className={`flex items-center justify-between rounded-full px-5 py-3 font-medium transition-colors ${
                cargando
                  ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                  : "bg-neutral-100 text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
              }`}
            >
              <span className="flex items-center gap-2">
                {cargando ? "⏳ Generando quiz..." : "▶ Pasar al sondeo"}
              </span>
              {!cargando && <span className="ml-2">→</span>}
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
    </div>
  );
}
