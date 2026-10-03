import { NextRequest, NextResponse } from "next/server";
import {
  obtenerConceptosDeSesion,
  obtenerEjercicios,
  obtenerExplicaciones,
  obtenerSesion,
  obtenerSubtemas,
} from "@/lib/db";
import { generarMarkdownObsidian } from "@/lib/exportar";

/**
 * Export a Obsidian: devuelve el `.md` con bloque mermaid, debilidades, material con
 * soluciones y repaso programado. Se sirve como descarga directa.
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
    const material = subtemas.map((subtema) => ({
      nombre: subtema.nombre,
      explicaciones: obtenerExplicaciones(sesionId, subtema.id),
      ejercicios: obtenerEjercicios(sesionId, subtema.id),
    }));
    const conceptos = obtenerConceptosDeSesion(sesionId).map((concepto) => ({
      nombre: concepto.nombre,
      caja: concepto.caja,
      proximoRepaso: concepto.proximoRepaso,
      vecesAcierto: concepto.vecesAcierto,
      vecesFallo: concepto.vecesFallo,
    }));

    const markdown = generarMarkdownObsidian({
      tema: sesion.topic,
      creadaEn: sesion.creadaEn,
      modo: sesion.modo,
      feedback: sesion.feedbackFinal,
      subtemas,
      material,
      conceptos,
    });

    return new NextResponse(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="uselearn-${sesionId}.md"`,
      },
    });
  } catch (error) {
    console.error("Error exportando la sesión:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
