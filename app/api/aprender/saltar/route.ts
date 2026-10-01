import { NextRequest, NextResponse } from "next/server";
import { marcarSubtemaSaltado } from "@/lib/db";

/**
 * Marca un sub-tema como saltado.
 *
 * Antes, "Saltar al siguiente" era un `setState` en el cliente: no dejaba nada en la base, así que
 * al recargar la página el sub-tema volvía a "pendiente" y el contador del sidebar nunca bajaba.
 * El usuario avanzaba y quedaba la sensación de haber dejado el tema a medias sin poder volver.
 *
 * No toca el dominio a propósito: saltar no es aprobar ni reprobar. El flag solo distingue
 * "pendiente" de "saltado" en la UI.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const subtemaId = Number(body.subtemaId);

    if (!Number.isInteger(subtemaId) || subtemaId <= 0) {
      return NextResponse.json({ error: "subtemaId inválido" }, { status: 400 });
    }

    const saltado = body.saltado !== false;
    return NextResponse.json(marcarSubtemaSaltado(subtemaId, saltado));
  } catch (error) {
    console.error("Error al marcar el sub-tema como saltado:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
