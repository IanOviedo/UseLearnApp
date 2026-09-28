import { NextRequest, NextResponse } from "next/server";
import { crearSesion, agregarSubtema } from "@/lib/db";
import { extraerSubtemas } from "@/lib/ollama";
import { MODELO_PRINCIPAL_POR_DEFECTO } from "@/lib/config";
import { proveedorDesdeParams } from "@/lib/proveedores";
import { derivarTema } from "@/lib/texto";
import type { ProveedorPayload } from "@/lib/tipos";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const texto: string | undefined = body.texto;
    const topicManual: string | undefined = body.topic;
    const modelo: string = body.modeloPrincipal || MODELO_PRINCIPAL_POR_DEFECTO;
    const proveedor = proveedorDesdeParams((body.proveedor ?? {}) as ProveedorPayload);

    if (!texto || texto.trim().length === 0) {
      return NextResponse.json(
        { error: "Falta el campo 'texto'" },
        { status: 400 }
      );
    }
    // Antes el topic era texto.slice(0, 50), así que la lista de sesiones mostraba
    // "# archivo.md\n\n## Challenge: D". Ahora se deriva una frase legible.
    const topic = topicManual?.trim() || derivarTema(texto);

    // El modelo elegido en Ajustes ahora sí se usa para extraer los sub-temas: antes se
    // ignoraba y siempre se llamaba al default hardcodeado. Queda guardado en la sesión.
    const subtemas = await extraerSubtemas(texto, modelo, proveedor);

    if (subtemas.length === 0) {
      return NextResponse.json(
        { error: "No se pudieron extraer sub-temas del texto" },
        { status: 500 }
      );
    }
    const sesionId = crearSesion(topic, texto, modelo);
    const subtemaIds = subtemas.map((nombre) => agregarSubtema(sesionId, nombre));

    return NextResponse.json({
      sesionId,
      topic,
      subtemas: subtemas.map((nombre, i) => ({ id: subtemaIds[i], nombre })),
    });
  } catch (error) {
    console.error("Error en crear sesión:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
