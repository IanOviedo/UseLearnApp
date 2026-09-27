import { NextRequest, NextResponse } from "next/server";
import { eliminarSesion } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sesionId = body.sesionId;

    if (typeof sesionId !== "number") {
      return NextResponse.json(
        { error: "Body inválido: se espera { sesionId: number }" },
        { status: 400 }
      );
    }
    eliminarSesion(sesionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en eliminar sesión:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
