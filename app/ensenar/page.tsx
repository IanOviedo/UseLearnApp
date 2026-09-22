"use client";

import { useRouter } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "../../lib/redux/store";
import { avanzarFase } from "../../lib/redux/sessionSlice";
import { determinarSiguienteFase } from "../../lib/phases";
import { actualizarFaseSesionAction } from "../../lib/actions";
import type { ResultadoFase } from "../../types";
import dynamic from "next/dynamic";
const Sandpack = dynamic(() => import("@codesandbox/sandpack-react").then((mod) => mod.Sandpack), { ssr: false });
import MermaidDiagram from "../../components/MermaidDiagram";

export default function EnsenarPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const topic = useSelector((state: RootState) => state.session.topic);
  const sessionId = useSelector((state: RootState) => state.session.sessionId);

  const handleRespuesta = async (entendido: boolean) => {
    const puntaje = entendido ? 90 : 50;
    const resultado: ResultadoFase = {
      scores: [{ categoria: "logica", puntaje }],
      aprobacion: entendido,
    };
    const siguienteFase = determinarSiguienteFase("ensenar", resultado);
    dispatch(avanzarFase(siguienteFase));
    if (sessionId) await actualizarFaseSesionAction(sessionId, siguienteFase);
    router.push(`/${siguienteFase}`);
  };

  const mermaidDiagram = "graph LR\nSondeo --> Prueba --> Ensenar --> Cerrar\nEnsenar --> Prueba";
  const sandpackCode = `
import React from "react";

export default function App() {
  return <div>Hello, world!</div>;
}
`;

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Ensenar</h1>
      <p className="mb-4 text-sm text-gray-500">Tema: {topic}</p>
      <p className="mb-6">
        Explicacion de ejemplo sobre {topic}: este es un contenido de
        practica que en el futuro vendra generado por el modelo local a
        partir de tus notas.
      </p>
      <MermaidDiagram diagram={mermaidDiagram} />
      <Sandpack
        template="react"
        files={{"App.js": sandpackCode}}
        theme="dark"
        options={{ height: 300 }}
      />
      <p className="mb-4 font-semibold">Entendiste el tema?</p>
      <div className="flex gap-4">
        <button
          onClick={() => handleRespuesta(true)}
          className="bg-green-500 text-white px-4 py-2 rounded"
        >
          Si
        </button>
        <button
          onClick={() => handleRespuesta(false)}
          className="bg-red-500 text-white px-4 py-2 rounded"
        >
          No
        </button>
      </div>
    </div>
  );
}






