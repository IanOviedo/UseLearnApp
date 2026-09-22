"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "../../lib/redux/store";
import { avanzarFase } from "../../lib/redux/sessionSlice";
import { useGuardarIntento, useGuardarScore } from "../../lib/hooks/useHooks";
import { determinarSiguienteFase } from "../../lib/phases";
import { actualizarFaseSesionAction } from "../../lib/actions";
import type { ResultadoFase } from "../../types";

const PREGUNTA_EJEMPLO = "Que es JSX?";

export default function PruebaPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const sessionId = useSelector((state: RootState) => state.session.sessionId);
  const topic = useSelector((state: RootState) => state.session.topic);
  const [respuesta, setRespuesta] = useState("");
  const { mutateAsync: guardarIntento } = useGuardarIntento();
  const { mutateAsync: guardarScore } = useGuardarScore();

  const handleResponder = async () => {
    if (!sessionId || !respuesta.trim()) return;
    const correcta = respuesta.trim().length > 0;
    await guardarIntento({
      sessionId,
      pregunta: PREGUNTA_EJEMPLO,
      respuestaUsuario: respuesta,
      correcta,
      explicacion: correcta ? "Correcto" : "Incorrecto",
    });
    const puntaje = correcta ? 80 : 40;
    await guardarScore({ sessionId, categoria: "sintaxis", puntaje });

    const resultado: ResultadoFase = {
      scores: [{ categoria: "sintaxis", puntaje }],
      aprobacion: correcta,
    };
    const siguienteFase = determinarSiguienteFase("prueba", resultado);
    dispatch(avanzarFase(siguienteFase));
    if (sessionId) await actualizarFaseSesionAction(sessionId, siguienteFase);
    router.push(`/${siguienteFase}`);
  };

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-2">Prueba</h1>
      <p className="mb-4 text-sm text-gray-500">Tema: {topic}</p>
      <p className="mb-4">{PREGUNTA_EJEMPLO}</p>
      <input
        className="border p-2 w-full mb-4"
        value={respuesta}
        onChange={(e) => setRespuesta(e.target.value)}
        placeholder="Tu respuesta..."
      />
      <button
        onClick={handleResponder}
        className="bg-blue-500 text-white px-4 py-2 rounded"
      >
        Responder
      </button>
    </div>
  );
}


