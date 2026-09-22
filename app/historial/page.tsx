"use client";

import { useRouter } from "next/navigation";
import { useHistorialSesiones } from "../../lib/hooks/useHooks";

export default function HistorialPage() {
  const router = useRouter();
  const { data: sesiones, isLoading, isError } = useHistorialSesiones();

  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error loading sessions</div>;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Historial de Sesiones</h1>
      <table className="w-full table-auto border-collapse">
        <thead>
          <tr>
            <th className="border px-4 py-2">Tema</th>
            <th className="border px-4 py-2">Fase actual</th>
            <th className="border px-4 py-2">Fecha inicio</th>
            <th className="border px-4 py-2">Acción</th>
          </tr>
        </thead>
        <tbody>
          {sesiones?.map((s: any) => (
            <tr key={s.id} className="hover:bg-gray-100">
              <td className="border px-4 py-2">{s.topic}</td>
              <td className="border px-4 py-2">{s.fase_actual}</td>
              <td className="border px-4 py-2">{s.fecha_inicio}</td>
              <td className="border px-4 py-2">
                <button
                  onClick={() => router.push(`/cerrar?sessionId=${s.id}`)}
                  className="bg-blue-500 text-white px-3 py-1 rounded"
                >
                  Ver detalle
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
