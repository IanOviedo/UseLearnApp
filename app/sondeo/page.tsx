"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { iniciarSesion } from "../../lib/redux/sessionSlice";
import { useCrearSesionLearning } from "../../lib/hooks/useHooks";
import { actualizarFaseSesionAction } from "../../lib/actions";

export default function SondeoPage() {
  const [topic, setTopic] = useState("");
  const router = useRouter();
  const dispatch = useDispatch();
  const { mutateAsync: crearSesion, isPending } = useCrearSesionLearning();

  const handleEmpezar = async () => {
    if (!topic.trim()) return;
    const sessionId = await crearSesion(topic);
    dispatch(iniciarSesion({ sessionId, topic }));
    await actualizarFaseSesionAction(sessionId, "prueba");
    router.push("/prueba");
  };

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Sondeo</h1>
      <p className="mb-4">Sobre que tema queres practicar hoy?</p>
      <input
        className="border p-2 w-full mb-4"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        placeholder="Ej: useEffect, Redux Toolkit..."
      />
      <button
        onClick={handleEmpezar}
        disabled={isPending || !topic.trim()}
        className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
      >
        {isPending ? "Creando..." : "Empezar"}</button>
      <div className="mt-6">
        <a href="/historial" className="text-blue-600 underline">Ver historial</a> <a href="/chat" className="text-blue-600 underline ml-2">Chat IA</a>
      </div>
    </div>
  );
}


