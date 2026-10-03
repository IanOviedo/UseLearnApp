import { NextResponse } from "next/server";
import { contarConceptos, obtenerConceptosVencidos } from "@/lib/db";
import { LIMITE_CONCEPTOS_REPASO } from "@/lib/config";

/**
 * Memoria entre sesiones — conceptos con repaso vencido (Leitner).
 * La landing lo consulta para mostrar "Te tocan N conceptos" antes de generar nada.
 */
export async function GET() {
  try {
    const { total: totalConceptos, vencidos: totalVencidos } = contarConceptos();
    const conceptos = obtenerConceptosVencidos(LIMITE_CONCEPTOS_REPASO);
    return NextResponse.json({ conceptos, totalVencidos, totalConceptos });
  } catch (error) {
    console.error("Error obteniendo el repaso:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
