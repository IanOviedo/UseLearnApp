import { NextRequest, NextResponse } from "next/server";
import { reportarPreguntaMala, MOTIVOS_PREGUNTA_MALA } from "@/lib/db";
import { servirSiguiente } from "@/lib/sondeo";
import {
  MODELO_PREGUNTAS_POR_DEFECTO,
  MODELO_PRINCIPAL_POR_DEFECTO,
  normalizarPreset,
} from "@/lib/config";
import { proveedorDesdeParams } from "@/lib/proveedores";
import type { ProveedorPayload } from "@/lib/tipos";

function leerProveedor(body: Record<string, unknown>, prefijo: string) {
  const datos = (body[prefijo] ?? {}) as ProveedorPayload;
  return proveedorDesdeParams({
    nombre: datos.nombre,
    baseUrl: datos.baseUrl,
    apiKey: datos.apiKey,
    formato: datos.formato,
    modelo: datos.modelo,
  });
}

/**
 * "Esta pregunta está mal" (ítem 15).
 *
 * Descarta la pregunta y guarda el reporte. No borra la fila: el reporte es el único
 * etiquetado que tiene el proyecto y de ahí sale el set golden con el que se calibra el juez
 * (§10.5). Descartarla es lo que evita que vuelva a servirse.
 *
 * Devuelve la siguiente pregunta en la misma respuesta (mismo criterio que `responder`), así que
 * marcar una pregunta mala no le cuesta un roundtrip extra al usuario.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { preguntaId, motivo } = body;

    if (typeof preguntaId !== "number" || typeof motivo !== "string" || !motivo.trim()) {
      return NextResponse.json(
        { error: "Body inválido: se espera { preguntaId: number, motivo: string }" },
        { status: 400 }
      );
    }

    // Un motivo desconocido no se guarda como `otra` en silencio: sería perder el etiquetado.
    if (!(MOTIVOS_PREGUNTA_MALA as readonly string[]).includes(motivo)) {
      return NextResponse.json(
        { error: `Motivo inválido. Usar uno de: ${MOTIVOS_PREGUNTA_MALA.join(", ")}` },
        { status: 400 }
      );
    }

    const reporte = reportarPreguntaMala(preguntaId, motivo);

    if (typeof body.sesionId !== "number") {
      // `reporte` ya trae `ok: true`; no se vuelve a poner.
      return NextResponse.json(reporte);
    }

    // La pregunta reportada ya no cuenta: se pide la siguiente para que la pantalla no quede
    // esperando. Si el sondeo terminó con el descarte, `completo` lo trae y el front cierra.
    try {
      const siguiente = await servirSiguiente({
        sesionId: body.sesionId,
        modeloPreguntas:
          typeof body.modeloPreguntas === "string" ? body.modeloPreguntas : MODELO_PREGUNTAS_POR_DEFECTO,
        modeloPrincipal:
          typeof body.modeloPrincipal === "string" ? body.modeloPrincipal : MODELO_PRINCIPAL_POR_DEFECTO,
        proveedorPreguntas: leerProveedor(body, "proveedorPreguntas"),
        proveedorPrincipal: leerProveedor(body, "proveedorPrincipal"),
        preset: normalizarPreset(typeof body.preset === "string" ? body.preset : undefined),
      });
      return NextResponse.json({ ...reporte, siguiente });
    } catch (error) {
      // El reporte ya quedó guardado: avisar el error de la siguiente no debe hacer que el
      // cliente piense que el reporte falló y lo reintente.
      return NextResponse.json({
        ...reporte,
        siguienteError: error instanceof Error ? error.message : "Error desconocido",
      });
    }
  } catch (error) {
    console.error("Error al reportar pregunta mala:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}

/** Motivos disponibles, para que el front no los duplique y no se desincronicen. */
export async function GET() {
  return NextResponse.json({ motivos: MOTIVOS_PREGUNTA_MALA });
}
