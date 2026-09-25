import { NextRequest, NextResponse } from "next/server";
import {
  elegirSiguienteSubtema,
  obtenerSubtemas,
  obtenerSesion,
  sondeoCompleto,
} from "@/lib/db";
import { generarPregunta, generarFeedbackSondeo } from "@/lib/ollama";

export async function GET(request: NextRequest) {
  const sesionId = Number(request.nextUrl.searchParams.get("sesionId"));
  if (!sesionId) {
    return NextResponse.json(
      { error: "Falta el parámetro sesionId" },
      { status: 400 }
    );
  }
  try {
    if (sondeoCompleto(sesionId)) {
      const subtemas = obtenerSubtemas(sesionId);

        const resultados = subtemas.map((s) => ({
        nombre: s.nombre,
        correctas: s.aciertosSeguidos,
        incorrectas: s.totalIncorrectas,
        cubierto: s.cubierto,
      }));

      const feedback = await generarFeedbackSondeo(resultados);
      return NextResponse.json({ completo: true, feedback });
    }

    const sesion = obtenerSesion(sesionId);
if (!sesion) {
  return NextResponse.json(
    { error: "Sesión no encontrada" },
    { status: 404 }
  );
}

    const subtema = elegirSiguienteSubtema(sesionId);
    if (!subtema) {
      return NextResponse.json(
        { error: "La sesión no tiene sub-temas cargados" },
        { status: 400 }
      );
    }
    const pregunta = await generarPregunta(subtema.nombre, sesion.textoOriginal);
    return NextResponse.json({
      completo: false,
      subtemaId: subtema.id,
      pregunta,
    });
  } catch (error) {
    console.error("Error en siguiente-pregunta:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
