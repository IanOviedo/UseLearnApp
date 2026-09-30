import { NextRequest, NextResponse } from "next/server";
import { actualizarFaseSesion, obtenerSesion } from "@/lib/db";
import type { EstadoSesion } from "@/lib/tipos";

/**
 * Fase C2 — avance de fases persistido en la base. Antes el plan y el cierre vivían en
 * el useState del cliente: recargar la página volvía al sondeo y el plan se perdía.
 *
 * Solo se permite avanzar (sondeo → plan → ensenar → cerrar), nunca retroceder: un
 * doble click o un reintento de red deja la sesión en la misma fase (idempotente).
 *
 * Body: { fase: "plan" | "ensenar" | "cerrar" }
 */
const ORDEN: Record<EstadoSesion["fase"], number> = {
  sondeo: 0,
  plan: 1,
  ensenar: 2,
  cerrar: 3,
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sesionId = Number(id);

    if (!Number.isInteger(sesionId) || sesionId <= 0) {
      return NextResponse.json({ error: "Id de sesión inválido" }, { status: 400 });
    }

    const sesion = obtenerSesion(sesionId);
    if (!sesion) {
      return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });
    }

    const body = await request.json();
    const destino: EstadoSesion["fase"] = body.fase;

    if (!(destino in ORDEN) || destino === "sondeo") {
      return NextResponse.json({ error: `Fase inválida: ${String(body.fase)}` }, { status: 400 });
    }

    const actual = (sesion.faseActual in ORDEN ? sesion.faseActual : "sondeo") as EstadoSesion["fase"];
    if (ORDEN[destino] < ORDEN[actual]) {
      return NextResponse.json(
        { error: `La sesión ya está en la fase "${actual}": no se puede volver a "${destino}"` },
        { status: 409 }
      );
    }

    actualizarFaseSesion(sesionId, destino);
    return NextResponse.json({ ok: true, fase: destino });
  } catch (error) {
    console.error("Error cambiando de fase:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
