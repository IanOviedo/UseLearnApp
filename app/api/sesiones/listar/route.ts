import { NextResponse } from "next/server";
import { listarSesionesConEstado } from "@/lib/db";

export async function GET() {
  try {
    const sesiones = listarSesionesConEstado();
    return NextResponse.json(sesiones);
  } catch (error) {
    console.error("Error listando sesiones:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
