import { NextRequest, NextResponse } from "next/server";
import { registrarRespuesta } from "@/lib/db";
import { lanzarPregenSiConviene, servirSiguiente } from "@/lib/sondeo";
import { MODELO_PREGUNTAS_POR_DEFECTO, MODELO_PRINCIPAL_POR_DEFECTO } from "@/lib/config";
import { proveedorDesdeParams } from "@/lib/proveedores";
import type { ProveedorPayload } from "@/lib/tipos";

/** Lee la config del proveedor desde el body: el servidor no lee localStorage. */
function leerProveedor(body: Record<string, unknown>, prefijo: string) {
  const datos = (body[prefijo] ?? {}) as ProveedorPayload;
  return proveedorDesdeParams({
    nombre: datos.nombre,
    baseUrl: datos.baseUrl,
    apiKey: datos.apiKey,
    formato: datos.formato,
    modelo: datos.modelo,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { preguntaId, opcionElegida } = body;

    // El cliente manda el TEXTO de la opción, no un booleano: la correcta se recalcula
    // en el servidor y ese texto queda guardado, que es lo que permite después explicar
    // en qué se equivocó (antes la tabla `respuestas` nunca se llenaba).
    if (
      typeof preguntaId !== "number" ||
      typeof opcionElegida !== "string" ||
      opcionElegida.trim().length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Body inválido: se espera { preguntaId: number, opcionElegida: string }",
        },
        { status: 400 }
      );
    }

    const resultado = registrarRespuesta(preguntaId, opcionElegida);

    // El cliente guarda en memoria el resto del lote de la pregunta respondida. Estos dos
    // flags le dicen si ese lote sigue vigente: `dominado` (con esta respuesta el sub-tema
    // se cubrió y el servidor descartó las preguntas que sobraban) y `descartada` (la
    // pregunta respondida ya pertenecía a un lote abandonado).
    const estadoLote = {
      dominado: resultado.dominado === true,
      descartada: resultado.descartada === true,
    };

    // Fase B.10 — merge responder→siguiente: si el cliente pide `siguiente: true`
    // se devuelve la próxima pregunta en la MISMA respuesta (1 roundtrip en vez de
    // POST + GET). Sin el flag, el contrato viejo se mantiene intacto.
    if (body.siguiente === true && typeof body.sesionId === "number") {
      try {
        const siguiente = await servirSiguiente({
          sesionId: body.sesionId,
          modeloPreguntas: typeof body.modeloPreguntas === "string" ? body.modeloPreguntas : MODELO_PREGUNTAS_POR_DEFECTO,
          modeloPrincipal: typeof body.modeloPrincipal === "string" ? body.modeloPrincipal : MODELO_PRINCIPAL_POR_DEFECTO,
          proveedorPreguntas: leerProveedor(body, "proveedorPreguntas"),
          proveedorPrincipal: leerProveedor(body, "proveedorPrincipal"),
        });

        // Fase B.11 — misma pre-generación del route GET: con el merge, el cacheo
        // del cliente hace que casi ningún request llegue a siguiente-pregunta, así
        // que el disparador del lote anticipado tiene que estar también acá.
        if (
          !siguiente.completo &&
          siguiente.subtemaId != null &&
          siguiente.lote &&
          body.pregen !== false
        ) {
          lanzarPregenSiConviene({
            sesionId: body.sesionId,
            subtemaActualId: siguiente.subtemaId,
            pendientesRestantes: siguiente.lote.length - 1,
            modeloPreguntas: typeof body.modeloPreguntas === "string" ? body.modeloPreguntas : MODELO_PREGUNTAS_POR_DEFECTO,
            proveedorPreguntas: leerProveedor(body, "proveedorPreguntas"),
            pregen: true,
          });
        }

        return NextResponse.json({
          ok: true,
          ...estadoLote,
          correcta: resultado.correcta,
          subtemaId: resultado.subtemaId,
          yaRespondida: resultado.yaRespondida,
          siguiente,
        });
      } catch (error) {
        // La respuesta ya quedó registrada: se devuelve el resultado igual y el
        // cliente pide la siguiente por el camino normal.
        return NextResponse.json({
          ok: true,
          ...estadoLote,
          correcta: resultado.correcta,
          subtemaId: resultado.subtemaId,
          yaRespondida: resultado.yaRespondida,
          siguienteError: error instanceof Error ? error.message : "Error desconocido",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      ...estadoLote,
      correcta: resultado.correcta,
      subtemaId: resultado.subtemaId,
      yaRespondida: resultado.yaRespondida,
    });
  } catch (error) {
    console.error("Error en responder:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
