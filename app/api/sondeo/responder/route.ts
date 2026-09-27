import { NextRequest, NextResponse } from "next/server";
import { actualizarAciertos, marcarPreguntaRespondida } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subtemaId, correcta, preguntaId } = body;

    if (typeof subtemaId !== "number" || typeof correcta !== "boolean" || typeof preguntaId !== "number") {
      return NextResponse.json(
        { error: "Body inválido: se espera { subtemaId: number, correcta: boolean, preguntaId: number }" },
        { status: 400 }
      );
    }
    actualizarAciertos(subtemaId, correcta);
    marcarPreguntaRespondida(preguntaId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en responder:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
