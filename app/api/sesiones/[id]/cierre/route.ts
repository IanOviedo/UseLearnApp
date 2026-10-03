import { NextRequest, NextResponse } from "next/server";
import {
  obtenerConceptosDeSesion,
  obtenerEjercicios,
  obtenerIntentosEjercicio,
  obtenerSesion,
  obtenerSubtemas,
} from "@/lib/db";
import { buscarRecursos, urlDeBusqueda } from "@/lib/recursos";

/**
 * Fase Cerrar (sección 6, ítem 9): comparativa antes/después + recursos por sub-tema.
 * Antes esta pantalla era el stepper y el feedback; ahora trae lo que hace falta para
 * cerrar de verdad: qué se sabía, qué se practicó y qué queda por repasar.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sesionId = Number(id);
    if (!Number.isInteger(sesionId) || sesionId <= 0) {
      return NextResponse.json({ error: "Id de sesión inválido" }, { status: 400 });
    }

    const sesion = obtenerSesion(sesionId);
    if (!sesion) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

    const subtemas = obtenerSubtemas(sesionId);

    // "Después" de la comparativa: los ejercicios de la fase Enseñar y cuántos se aprobaron.
    const detalle = subtemas.map((subtema) => {
      const ejercicios = obtenerEjercicios(sesionId, subtema.id);
      const aprobados = ejercicios.filter((ejercicio) =>
        obtenerIntentosEjercicio(ejercicio.id).some((intento) => intento.aprobado)
      ).length;
      return {
        id: subtema.id,
        nombre: subtema.nombre,
        cubierto: subtema.cubierto,
        correctas: subtema.correctas,
        incorrectas: subtema.incorrectas,
        intentos: subtema.intentos,
        ejercicios: ejercicios.length,
        aprobados,
        recursos: buscarRecursos(subtema.nombre, 2),
        busqueda: urlDeBusqueda(subtema.nombre),
      };
    });

    const resumen = {
      subtemas: subtemas.length,
      cubiertos: subtemas.filter((subtema) => subtema.cubierto).length,
      aReforzar: subtemas.filter((subtema) => subtema.incorrectas > 0).length,
      sinDominar: subtemas.filter((subtema) => !subtema.cubierto).length,
      ejercicios: detalle.reduce((total, item) => total + item.ejercicios, 0),
      aprobados: detalle.reduce((total, item) => total + item.aprobados, 0),
    };

    const conceptos = obtenerConceptosDeSesion(sesionId).map((concepto) => ({
      id: concepto.id,
      nombre: concepto.nombre,
      caja: concepto.caja,
      proximoRepaso: concepto.proximoRepaso,
    }));

    return NextResponse.json({
      tema: sesion.topic,
      modo: sesion.modo,
      feedback: sesion.feedbackFinal,
      resumen,
      subtemas: detalle,
      conceptos,
    });
  } catch (error) {
    console.error("Error obteniendo el cierre:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
