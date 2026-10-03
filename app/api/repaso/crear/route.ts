import { NextRequest, NextResponse } from "next/server";
import { crearSesionRepaso, obtenerConceptosVencidos, obtenerSesion } from "@/lib/db";
import { LIMITE_CONCEPTOS_REPASO } from "@/lib/config";

/**
 * Arranca una sesión de repaso. Si el body no manda conceptos, repasa los vencidos.
 * El material sale de la sesión más reciente donde aparecieron y cada sub-tema conserva
 * su fragmento original, así que el repaso funciona aunque el texto elegido no contenga
 * literalmente el nombre del concepto.
 *
 * Body opcional: { conceptos: number[] }
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { conceptos?: unknown };
    const pedidos: number[] = Array.isArray(body.conceptos)
      ? body.conceptos.map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : obtenerConceptosVencidos(LIMITE_CONCEPTOS_REPASO).map((concepto) => concepto.id);

    if (pedidos.length === 0) {
      return NextResponse.json({ error: "No hay conceptos para repasar" }, { status: 404 });
    }

    const sesionId = crearSesionRepaso(pedidos);
    if (!sesionId) {
      return NextResponse.json(
        { error: "No se encontró material para esos conceptos" },
        { status: 404 }
      );
    }

    const sesion = obtenerSesion(sesionId);
    return NextResponse.json({ sesionId, topic: sesion?.topic ?? "Repaso" });
  } catch (error) {
    console.error("Error creando la sesión de repaso:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
