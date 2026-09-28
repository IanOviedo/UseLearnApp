"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import FaseSondeo from "@/components/sondeo/FaseSondeo";
import FasePlan from "@/components/sondeo/FasePlan";
import type { EstadoSesion } from "@/lib/tipos";

type Fase = "sondeo" | "plan";

export default function SondeoPage() {
  const params = useParams();
  const router = useRouter();
  const sesionId = Number(params.id);

  // La fase y el estado vienen del servidor: antes vivían solo en el useState de
  // este componente, así que recargar la página reiniciaba el flujo y el plan se
  // perdía por completo al volver de una sesión pasada.
  const [estado, setEstado] = useState<EstadoSesion | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [fase, setFase] = useState<Fase>("sondeo");
  const [feedback, setFeedback] = useState("");
  const [subtemasDebiles, setSubtemasDebiles] = useState<string[]>([]);

  // Se valida en el render, no dentro del effect, para no hacer setState sincrónico.
  const idInvalido = !Number.isInteger(sesionId);

  useEffect(() => {
    if (idInvalido) return;

    let cancelado = false;

    (async () => {
      try {
        const res = await fetch(`/api/sesiones/${sesionId}`);
        const data: EstadoSesion & { error?: string } = await res.json();
        if (cancelado) return;

        if (data.error) {
          setError(data.error);
          return;
        }

        setEstado(data);
        setFase(data.fase);
        setFeedback(data.feedback ?? "");
        setSubtemasDebiles(data.subtemasDebiles);
      } catch {
        if (!cancelado) setError("No se pudo conectar con el servidor.");
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [sesionId, idInvalido]);

  const manejarSondeoCompleto = useCallback(
    (feedbackFinal: string, subtemasDebilesFinales: string[]) => {
      setFeedback(feedbackFinal);
      setSubtemasDebiles(subtemasDebilesFinales);
      setFase("plan");
    },
    []
  );

  if (!idInvalido && cargando) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 text-neutral-100">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-300" />
        <p className="text-sm text-neutral-500">Cargando sesión...</p>
      </div>
    );
  }

  if (idInvalido || error || !estado) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 text-neutral-100">
        <div className="flex items-start gap-2.5 rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-6 py-5">
          <p className="text-sm text-red-400">
            {idInvalido ? "Id de sesión inválido" : (error ?? "Sesión no encontrada")}
          </p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="rounded-full bg-neutral-100 px-5 py-2 font-medium text-neutral-900 transition-all duration-300 hover:bg-white hover:shadow-lg"
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  if (fase === "plan") {
    return (
      <FasePlan
        sesionId={sesionId}
        feedback={feedback}
        subtemasDebiles={subtemasDebiles}
        onVolver={() => router.push("/")}
      />
    );
  }

  return (
    <FaseSondeo
      sesionId={sesionId}
      historialInicial={estado.historial}
      onSondeoCompleto={manejarSondeoCompleto}
    />
  );
}