import { NextRequest, NextResponse } from "next/server";
import {
  contarProgresoSesion,
  obtenerHistorialSesion,
  obtenerSesion,
  obtenerSubtemas,
  obtenerSubtemasDebiles,
  obtenerSubtemasSinDominar,
} from "@/lib/db";
import type { EstadoSesion } from "@/lib/tipos";

/**
 * Estado completo de una sesión. Es lo que permite reanudar en vez de reiniciar:
 * la fase, el progreso, los sub-temas con su dominio, los débiles y las preguntas
 * ya respondidas. Antes el cliente no tenía forma de saber nada de esto, así que al
 * recargar perdía el historial y el plan aparecía vacío.
 *
 * Ojo: en Next 15+ los `params` de una route son una Promise y hay que await-earlos.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sesionId = Number(id);

    if (!Number.isInteger(sesionId) || sesionId <= 0) {
      return NextResponse.json(
        { error: "Id de sesión inválido" },
        { status: 400 }
      );
    }

    const sesion = obtenerSesion(sesionId);
    if (!sesion) {
      return NextResponse.json(
        { error: "Sesión no encontrada" },
        { status: 404 }
      );
    }

    const subtemas = obtenerSubtemas(sesionId);

    const estado: EstadoSesion = {
      id: sesion.id,
      tema: sesion.topic,
      // Cualquier fase distinta de "plan" todavía está en el sondeo (enseñar y cerrar
      // se agregan en las fases siguientes).
      fase: sesion.faseActual === "plan" ? "plan" : "sondeo",
      modelo: sesion.modelo,
      creadaEn: sesion.creadaEn,
      feedback: sesion.feedbackFinal,
      progreso: contarProgresoSesion(sesionId, subtemas),
      subtemas,
      subtemasDebiles: obtenerSubtemasDebiles(sesionId),
      subtemasSinDominar: obtenerSubtemasSinDominar(sesionId),
      historial: obtenerHistorialSesion(sesionId),
    };

    return NextResponse.json(estado);
  } catch (error) {
    console.error("Error obteniendo la sesión:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}