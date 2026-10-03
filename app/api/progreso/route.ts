import { NextResponse } from "next/server";
import { contarConceptos, listarConceptos } from "@/lib/db";

/**
 * Progreso por CONCEPTO, no por sesión: "Closures: 3 sesiones, dominado en la última,
 * próximo repaso mañana". Es la vista longitudinal que antes no existía.
 */
export async function GET() {
  try {
    const conceptos = listarConceptos();
    const { total, vencidos } = contarConceptos();
    return NextResponse.json({ total, vencidos, conceptos });
  } catch (error) {
    console.error("Error obteniendo el progreso:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
