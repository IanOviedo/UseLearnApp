import { NextRequest, NextResponse } from "next/server";
import { crearSesion, agregarSubtema } from "@/lib/db";
import { extraerSubtemas } from "@/lib/ollama";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const texto: string | undefined = body.texto;
    const topicManual: string | undefined = body.topic;

    if (!texto || texto.trim().length === 0) {
      return NextResponse.json(
        { error: "Falta el campo 'texto'" },
        { status: 400 }
      );
    }
    const topic = topicManual?.trim() || texto.trim().slice(0, 50);
    const subtemas = await extraerSubtemas(texto);
    if (!subtemas || subtemas.length === 0) {
      return NextResponse.json(
        { error: "No se pudieron extraer sub-temas del texto" },
        { status: 500 }
      );
    }
    const sesionId = crearSesion(topic, texto);
    const subtemaIds = subtemas.map((nombre) => agregarSubtema(sesionId, nombre));

    return NextResponse.json({
      sesionId,
      topic,
      subtemas: subtemas.map((nombre, i) => ({ id: subtemaIds[i], nombre })),
    });
  } catch (error) {
    console.error("Error en crear sesión:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
