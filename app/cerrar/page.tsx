"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "../../lib/redux/store";
import { reiniciarSesion } from "../../lib/redux/sessionSlice";
import { useProgreso } from "../../lib/hooks/useHooks";

export default function CerrarPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const searchParams = useSearchParams();
  const paramSessionId = searchParams.get("sessionId");
  const sessionId = paramSessionId ? parseInt(paramSessionId) : useSelector((state: RootState) => state.session.sessionId);
  const topic = useSelector((state: RootState) => state.session.topic);
  const { data: progreso } = useProgreso(sessionId);

  const intentos = progreso?.attempts || [];
  const scores = progreso?.scores || [];
  const correctos = intentos.filter((i: any) => i.correcta).length;

  const handleNueva = () => {
    dispatch(reiniciarSesion());
    router.push("/sondeo");
  };

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Cerrar</h1>
      <p className="mb-4 text-sm text-gray-500">Tema: {topic}</p>
      <ul className="mb-6">
        <li>Total intentos: {intentos.length}</li>
        <li>Correctos: {correctos}</li>
        <li>Scores registrados: {scores.length}</li>
      </ul>
      <button
        onClick={handleNueva}
        className="bg-purple-500 text-white px-4 py-2 rounded"
      >
        Nueva sesion
      </button>
    </div>
  );
}
