import { NextRequest, NextResponse } from "next/server";
import { lanzarPregenSiConviene, servirSiguiente } from "@/lib/sondeo";
import {
  MODELO_PREGUNTAS_POR_DEFECTO,
  MODELO_PRINCIPAL_POR_DEFECTO,
  ajustesDePreset,
  normalizarPreset,
} from "@/lib/config";
import { proveedorDesdeParams } from "@/lib/proveedores";

/**
 * El servidor no puede leer localStorage, así que el cliente manda en cada request la
 * config del proveedor elegido para cada modelo (preguntas y principal, por separado:
 * antes solo viajaba la del modelo de preguntas, por lo que el feedback y la extracción
 * de sub-temas no podían usar un proveedor de nube).
 */
function leerProveedor(sp: URLSearchParams, prefijo: string) {
  return proveedorDesdeParams({
    nombre: sp.get(`${prefijo}Nombre`),
    baseUrl: sp.get(`${prefijo}BaseUrl`),
    apiKey: sp.get(`${prefijo}ApiKey`),
    formato: sp.get(`${prefijo}Formato`),
    modelo: sp.get(`${prefijo}Modelo`),
  });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const sesionId = Number(sp.get("sesionId"));
  const modeloPreguntas = sp.get("modeloPreguntas") || MODELO_PREGUNTAS_POR_DEFECTO;
  const modeloPrincipal = sp.get("modeloPrincipal") || MODELO_PRINCIPAL_POR_DEFECTO;
  const proveedorPreguntas = leerProveedor(sp, "proveedorPreguntas");
  const proveedorPrincipal = leerProveedor(sp, "proveedorPrincipal");
  // El preset viaja en cada request (el servidor no lee localStorage) y de él salen
  // cuántas preguntas trae el lote, si hay paso de ángulos y cuántos reintentos.
  // El `pregen` explícito del cliente pisa al del preset cuando viene.
  const preset = normalizarPreset(sp.get("preset") ?? undefined);
  const ajustes = ajustesDePreset(preset);
  const pregenParam = sp.get("pregen");
  const pregen = pregenParam === null ? ajustes.pregen : pregenParam !== "0";

  if (!sesionId) {
    return NextResponse.json(
      { error: "Falta el parámetro sesionId" },
      { status: 400 }
    );
  }

  try {
    // Fase B.10 — un solo helper compartido con `responder` (merge): la lógica de
    // cierre, pendientes y generación vive en lib/sondeo.ts, no duplicada acá.
    const payload = await servirSiguiente({
      sesionId,
      modeloPreguntas,
      modeloPrincipal,
      proveedorPreguntas,
      proveedorPrincipal,
      preset,
    });

    // Fase B.11 — pre-generación en paralelo: si se sirvió de pendientes y quedan
    // pocas, el lote del siguiente subtema se genera en background (fire-and-forget,
    // solo Ollama local: en nube cuesta tokens).
    if (!payload.completo && payload.subtemaId != null && payload.lote) {
      lanzarPregenSiConviene({
        sesionId,
        subtemaActualId: payload.subtemaId,
        pendientesRestantes: payload.lote.length - 1,
        modeloPreguntas,
        proveedorPreguntas,
        pregen,
        preset,
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error("Error en siguiente-pregunta:", error);
    const mensaje = error instanceof Error ? error.message : "Error desconocido";
    const status = mensaje === "Sesión no encontrada" ? 404 : 500;
    return NextResponse.json({ error: mensaje }, { status });
  }
}