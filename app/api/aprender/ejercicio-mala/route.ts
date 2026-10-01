import { NextRequest, NextResponse } from "next/server";
import { reportarEjercicioMalo, MOTIVOS_EJERCICIO_MALA } from "@/lib/db";

/**
 * "Este ejercicio está mal" (fase Enseñar/Practicar).
 *
 * A diferencia de la pregunta del sondeo, acá NO se descarta el ejercicio: ya se generó y está
 * cacheado, y sacarlo de golpe a mitad de la sesión le quitaría al usuario la práctica. Se guarda
 * el reporte y el ejercicio sigue visible, que es lo que hace falta para poder reproducir el
 * problema ("la solución no funciona" no sirve si después no podés volver a abrirlo).
 *
 * El motivo es el dato: es lo que permite agrupar los defectos y arreglar el prompt que los causa,
 * en vez de ir uno por uno.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ejercicioId = Number(body.ejercicioId);
    const motivo = typeof body.motivo === "string" ? body.motivo : "";

    if (!Number.isInteger(ejercicioId) || ejercicioId <= 0 || !motivo.trim()) {
      return NextResponse.json(
        { error: "Body inválido: se espera { ejercicioId: number, motivo: string }" },
        { status: 400 }
      );
    }

    // Motivo desconocido = 400 y no se guarda como `otra`: el motivo es el etiquetado, y un
    // `otra` silencioso es exactamente el dato que se está tratando de capturar.
    if (!(MOTIVOS_EJERCICIO_MALA as readonly string[]).includes(motivo)) {
      return NextResponse.json(
        { error: `Motivo inválido. Usar uno de: ${MOTIVOS_EJERCICIO_MALA.join(", ")}` },
        { status: 400 }
      );
    }

    return NextResponse.json(reportarEjercicioMalo(ejercicioId, motivo));
  } catch (error) {
    console.error("Error al reportar ejercicio malo:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

/** Motivos disponibles, para que el front no los duplique y no se desincronicen. */
export async function GET() {
  return NextResponse.json({ motivos: MOTIVOS_EJERCICIO_MALA });
}