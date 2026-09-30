import { NextRequest, NextResponse } from "next/server";
import { descartarSubtemas } from "@/lib/db";

/**
 * Fase C1 — ingesta explícita: la landing muestra los sub-temas detectados y el usuario
 * desmarca los que no le interesan. El descarte ocurre ANTES de entrar al sondeo (la
 * sesión todavía no tiene respuestas, que es la única condición en la que se permite).
 *
 * Body: { mantener: number[] } — ids de sub-temas que se quedan.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sesionId = Number(id);

    if (!Number.isInteger(sesionId) || sesionId <= 0) {
      return NextResponse.json({ error: "Id de sesión inválido" }, { status: 400 });
    }

    const body = await request.json();
    const mantener: unknown = body.mantener;

    if (!Array.isArray(mantener) || mantener.length === 0) {
      return NextResponse.json(
        { error: "El campo 'mantener' debe ser un array con al menos un sub-tema" },
        { status: 400 }
      );
    }

    const resultado = descartarSubtemas(sesionId, mantener as number[]);

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.motivo ?? "No se pudieron quitar los sub-temas" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, restantes: resultado.restantes });
  } catch (error) {
    console.error("Error descartando sub-temas:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
