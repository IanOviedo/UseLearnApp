import { NextRequest, NextResponse } from "next/server";
import {
  elegirSiguienteSubtema,
  obtenerSubtemas,
  obtenerSesion,
  sondeoCompleto,
  obtenerPreguntasSinResponder,
  guardarPregunta,
  guardarFeedbackFinal,
  contarPreguntasSesion,
} from "@/lib/db";
import { generarPregunta, generarLotePreguntas, generarFeedbackSondeo } from "@/lib/ollama";
import type { ProveedorNube } from "@/lib/proveedores";

// Red de seguridad: tope de preguntas respondidas por sesión. Al alcanzarlo, el
// sondeo se cierra aunque queden subtemas sin cubrir.
const MAX_PREGUNTAS_SESION = 20;

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
    const conteo = contarPreguntasSesion(sesionId);

    if (sondeoCompleto(sesionId) || conteo.respondidas >= MAX_PREGUNTAS_SESION) {
      const sesionExistente = obtenerSesion(sesionId);
      if (sesionExistente && sesionExistente.feedbackFinal !== null) {
        return NextResponse.json({ completo: true, feedback: sesionExistente.feedbackFinal, respondidas: conteo.respondidas, total: conteo.total });
      }

      const subtemas = obtenerSubtemas(sesionId);

        const resultados = subtemas.map((s) => ({
        nombre: s.nombre,
        correctas: s.aciertosSeguidos,
        incorrectas: s.totalIncorrectas,
        cubierto: s.cubierto,
      }));

      const feedback = await generarFeedbackSondeo(resultados, modeloPrincipal);
      guardarFeedbackFinal(sesionId, feedback);
      return NextResponse.json({ completo: true, feedback, respondidas: conteo.respondidas, total: conteo.total });
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
        subtemaNombre: subtema.nombre,
        preguntaId: siguiente.id,
        pregunta: JSON.parse(siguiente.contenido),
        respondidas: conteo.respondidas,
        total: conteo.total,
      });
    }

    const lote = await generarLotePreguntas(subtema.nombre, sesion.textoOriginal, modeloPreguntas, proveedorInfo);

    const idsGuardados = lote.map((p) =>
      guardarPregunta(sesionId, subtema.id, "sondeo", JSON.stringify(p), "multiple_choice")
    );

    // El lote recién se insertó: se relee el conteo para que el total que muestra
    // el contador x/y del cliente incluya esas preguntas nuevas.
    const conteoTrasLote = contarPreguntasSesion(sesionId);
    return NextResponse.json({
      completo: false,
      subtemaId: subtema.id,
      subtemaNombre: subtema.nombre,
      preguntaId: idsGuardados[0],
      pregunta: lote[0],
      respondidas: conteoTrasLote.respondidas,
      total: conteoTrasLote.total,
    });
  } catch (error) {
    console.error("Error en siguiente-pregunta:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
