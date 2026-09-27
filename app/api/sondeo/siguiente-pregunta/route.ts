import { NextRequest, NextResponse } from "next/server";
import {
  elegirSiguienteSubtema,
  obtenerSubtemas,
  obtenerSesion,
  sondeoCompleto,
  obtenerPreguntasSinResponder,
  guardarPregunta,
} from "@/lib/db";
import { generarPregunta, generarLotePreguntas, generarFeedbackSondeo } from "@/lib/ollama";
import type { ProveedorNube } from "@/lib/proveedores";

export async function GET(request: NextRequest) {
  const sesionId = Number(request.nextUrl.searchParams.get("sesionId"));
  const modeloPreguntas = request.nextUrl.searchParams.get("modeloPreguntas") ?? undefined;
  const modeloPrincipal = request.nextUrl.searchParams.get("modeloPrincipal") ?? undefined;
  const proveedorNombre = request.nextUrl.searchParams.get("proveedorNombre") ?? undefined;
  const proveedorBaseUrl = request.nextUrl.searchParams.get("proveedorBaseUrl") ?? undefined;
  const proveedorApiKey = request.nextUrl.searchParams.get("proveedorApiKey") ?? undefined;
  const proveedorFormato = request.nextUrl.searchParams.get("proveedorFormato") ?? undefined;

  const proveedorInfo =
    proveedorNombre && proveedorBaseUrl && proveedorApiKey && proveedorFormato
      ? {
          id: "temp",
          nombre: proveedorNombre,
          baseUrl: proveedorBaseUrl,
          apiKey: proveedorApiKey,
          formato: proveedorFormato as "openai" | "gemini-nativo",
        }
      : undefined;

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

      const feedback = await generarFeedbackSondeo(resultados, modeloPrincipal);
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
    const pendientes = obtenerPreguntasSinResponder(subtema.id);

    if (pendientes.length > 0) {
      const siguiente = pendientes[0];
      return NextResponse.json({
        completo: false,
        subtemaId: subtema.id,
        preguntaId: siguiente.id,
        pregunta: JSON.parse(siguiente.contenido),
      });
    }

    const lote = await generarLotePreguntas(subtema.nombre, sesion.textoOriginal, modeloPreguntas, proveedorInfo);

    const idsGuardados = lote.map((p) =>
      guardarPregunta(sesionId, subtema.id, "sondeo", JSON.stringify(p), "multiple_choice")
    );

    return NextResponse.json({
      completo: false,
      subtemaId: subtema.id,
      preguntaId: idsGuardados[0],
      pregunta: lote[0],
    });
  } catch (error) {
    console.error("Error en siguiente-pregunta:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
