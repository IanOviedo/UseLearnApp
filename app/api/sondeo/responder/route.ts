import { NextRequest, NextResponse } from "next/server";
import { actualizarAciertos } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subtemaId, correcta } = body;

    if (typeof subtemaId !== "number" || typeof correcta !== "boolean") {
      return NextResponse.json(
        { error: "Body inválido: se espera { subtemaId: number, correcta: boolean }" },
        { status: 400 }
      );
    }
    actualizarAciertos(subtemaId, correcta);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en responder:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
