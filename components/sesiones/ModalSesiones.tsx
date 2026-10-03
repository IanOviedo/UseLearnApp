"use client";

import { IconoCheck, IconoCerrar, IconoEliminar, IconoHistorial } from "@/components/ui/Iconos";

/**
 * Modal de "Sesiones pasadas": lista las sesiones con su estado (completa o
 * N/M preguntas), permite abrirlas y eliminarlas. Extraído de `app/page.tsx`
 * como parte de la deuda §6.13.
 */
export interface SesionConEstado {
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

interface Props {
  sesiones: SesionConEstado[];
  onCerrar: () => void;
  onAbrir: (id: number) => void;
  onEliminar: (id: number) => void;
}

export default function ModalSesiones({ sesiones, onCerrar, onAbrir, onEliminar }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onCerrar}
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
            onClick={onCerrar}
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
                onClick={() => onAbrir(s.id)}
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
                    onEliminar(s.id);
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
  );
}
