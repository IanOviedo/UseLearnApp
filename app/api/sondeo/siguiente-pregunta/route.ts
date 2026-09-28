import { NextRequest, NextResponse } from "next/server";
import {
  contarProgresoSesion,
  elegirSiguienteSubtema,
  esSubtemaDebil,
  finalizarSondeo,
  guardarPregunta,
  obtenerErroresSesion,
  obtenerEstadoSondeo,
  obtenerPreguntasDelSubtema,
  obtenerPreguntasSinResponder,
  obtenerSubtemasDebiles,
  sondeoCompleto,
} from "@/lib/db";
import { generarFeedbackSondeo, generarLotePreguntas, type ResultadoSubtema } from "@/lib/ollama";
import {
  MAX_PREGUNTAS_SESION,
  MODELO_PREGUNTAS_POR_DEFECTO,
  MODELO_PRINCIPAL_POR_DEFECTO,
} from "@/lib/config";
import { proveedorDesdeParams } from "@/lib/proveedores";
import type { SubtemaEstado } from "@/lib/tipos";

/**
 * El servidor no puede leer localStorage, así que el cliente manda en cada request la
 * config del proveedor elegido para cada modelo (preguntas y principal, por separado:
 * antes solo viajaba la del modelo de preguntas, por lo que el feedback y la extracción
 * de sub-temas no podían usar un proveedor de nube).
 */
function leerProveedor(sp: URLSearchParams, prefijo: string) {
  return proveedorDesdeParams({
    nombre: sp.get(`${prefijo}Nombre`),
    baseUrl: sp.get(`${prefijo}BaseUrl`),
    apiKey: sp.get(`${prefijo}ApiKey`),
    formato: sp.get(`${prefijo}Formato`),
    modelo: sp.get(`${prefijo}Modelo`),
  });
}

function resultadosDe(subtemas: SubtemaEstado[]): ResultadoSubtema[] {
  return subtemas.map((subtema) => ({
    nombre: subtema.nombre,
    intentos: subtema.intentos,
    correctas: subtema.correctas,
    incorrectas: subtema.incorrectas,
    dominio: subtema.intentos > 0 ? subtema.correctas / subtema.intentos : 0,
    cubierto: subtema.cubierto,
    // El feedback se arma con `debil`, no con `cubierto`: un sub-tema dominado en el que
    // igual hubo un error sigue siendo área a reforzar.
    debil: esSubtemaDebil(subtema.incorrectas),
  }));
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const sesionId = Number(sp.get("sesionId"));
  const modeloPreguntas = sp.get("modeloPreguntas") || MODELO_PREGUNTAS_POR_DEFECTO;
  const modeloPrincipal = sp.get("modeloPrincipal") || MODELO_PRINCIPAL_POR_DEFECTO;
  const proveedorPreguntas = leerProveedor(sp, "proveedorPreguntas");
  const proveedorPrincipal = leerProveedor(sp, "proveedorPrincipal");

  if (!sesionId) {
    return NextResponse.json(
      { error: "Falta el parámetro sesionId" },
      { status: 400 }
    );
  }

  try {
    const { sesion, subtemas, progreso } = obtenerEstadoSondeo(sesionId);

    if (!sesion) {
      return NextResponse.json(
        { error: "Sesión no encontrada" },
        { status: 404 }
      );
    }

    // El sondeo cierra cuando todos los sub-temas están dominados o cuando se alcanza el
    // tope de seguridad de respuestas.
    if (sondeoCompleto(subtemas) || progreso.respondidas >= MAX_PREGUNTAS_SESION) {
      const subtemasDebiles = obtenerSubtemasDebiles(sesionId);

      if (sesion.feedbackFinal !== null) {
        return NextResponse.json({
          completo: true,
          feedback: sesion.feedbackFinal,
          subtemasDebiles,
          ...progreso,
        });
      }

      const feedback = await generarFeedbackSondeo(
        resultadosDe(subtemas),
        obtenerErroresSesion(sesionId),
        modeloPrincipal,
        proveedorPrincipal
      );

      // Guarda el feedback y avanza la fase a "plan" en el servidor: antes la fase vivía
      // solo en el useState del cliente y recargar la página la perdía.
      finalizarSondeo(sesionId, feedback);

      return NextResponse.json({
        completo: true,
        feedback,
        subtemasDebiles,
        ...progreso,
      });
    }

    const subtema = elegirSiguienteSubtema(subtemas);
    if (!subtema) {
      return NextResponse.json(
        { error: "La sesión no tiene sub-temas cargados" },
        { status: 400 }
      );
    }

    // Si quedan preguntas del lote ya guardadas, se sirven sin llamar al modelo.
    const pendientes = obtenerPreguntasSinResponder(subtema.id);

    if (pendientes.length > 0) {
      const siguiente = pendientes[0];
      return NextResponse.json({
        completo: false,
        subtemaId: subtema.id,
        subtemaNombre: subtema.nombre,
        preguntaId: siguiente.id,
        pregunta: JSON.parse(siguiente.contenido),
        ...progreso,
      });
    }

    const previas = obtenerPreguntasDelSubtema(subtema.id);
    const lote = await generarLotePreguntas(
      subtema.nombre,
      sesion.textoOriginal,
      modeloPreguntas,
      proveedorPreguntas,
      previas
    );

    const idsGuardados = lote.map((p) =>
      guardarPregunta(sesionId, subtema.id, "sondeo", JSON.stringify(p), "multiple_choice")
    );

    // Se relee el progreso para que el total incluya las preguntas recién generadas.
    return NextResponse.json({
      completo: false,
      subtemaId: subtema.id,
      subtemaNombre: subtema.nombre,
      preguntaId: idsGuardados[0],
      pregunta: lote[0],
      ...contarProgresoSesion(sesionId, subtemas),
    });
  } catch (error) {
    console.error("Error en siguiente-pregunta:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}