import { NextRequest, NextResponse } from "next/server";
import { registrarRespuesta } from "@/lib/db";

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

    return NextResponse.json({
      ok: true,
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
