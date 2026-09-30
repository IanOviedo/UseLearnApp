import { NextRequest, NextResponse } from "next/server";
import { crearSesion, agregarSubtema } from "@/lib/db";
import { extraerSubtemas, generarApunteDeTema } from "@/lib/ollama";
import { MODELO_PRINCIPAL_POR_DEFECTO, normalizarPreset } from "@/lib/config";
import { proveedorDesdeParams } from "@/lib/proveedores";
import { derivarTema } from "@/lib/texto";
import type { NivelSesion, ProveedorPayload } from "@/lib/tipos";

const NIVELES_VALIDOS: NivelSesion[] = ["basico", "intermedio", "avanzado"];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const texto: string | undefined = body.texto;
    const topicManual: string | undefined = body.topic;
    const modelo: string = body.modeloPrincipal || MODELO_PRINCIPAL_POR_DEFECTO;
    const proveedor = proveedorDesdeParams((body.proveedor ?? {}) as ProveedorPayload);

    // Fase C1 — dos modalidades. Sin `modo` se asume "apunte" (compatibilidad con
    // clientes/scripts viejos: el comportamiento por defecto es el de siempre).
    const modo: "apunte" | "tema_libre" = body.modo === "tema_libre" ? "tema_libre" : "apunte";
    const objetivo: string | undefined =
      typeof body.objetivo === "string" && body.objetivo.trim() ? body.objetivo.trim() : undefined;
    const nivel: NivelSesion = NIVELES_VALIDOS.includes(body.nivel) ? body.nivel : "intermedio";
    // Cuánta calidad puede costar tiempo: lo elige el usuario en Ajustes (rapido por
    // compatibilidad si no manda nada, que es el comportamiento de siempre).
    const preset = normalizarPreset(body.preset);

    let textoFuente: string;
    let topic: string;
    let apunteGenerado: string | null = null;

    if (modo === "tema_libre") {
      const tema: string | undefined = body.tema;
      if (!tema || tema.trim().length === 0) {
        return NextResponse.json({ error: "Falta el campo 'tema'" }, { status: 400 });
      }

      // El modelo primero escribe el apunte y recién ahí se extraen los sub-temas: de
      // este modo el resto del flujo (excerpt por sub-tema, preguntas con cita, filtro
      // anti-alucinación) funciona idéntico al modo apunte, con material de estudio real.
      const apunte = await generarApunteDeTema(tema, nivel, objetivo, modelo, proveedor);
      textoFuente = apunte.apunte;
      apunteGenerado = apunte.apunte;
      // El título lo elige el modelo (el tema del usuario puede ser "quiero practicar X").
      topic = topicManual?.trim() || apunte.titulo || derivarTema(apunte.apunte);
    } else {
      if (!texto || texto.trim().length === 0) {
        return NextResponse.json({ error: "Falta el campo 'texto'" }, { status: 400 });
      }
      textoFuente = texto;
      // Antes el topic era texto.slice(0, 50), así que la lista de sesiones mostraba
      // "# archivo.md\n\n## Challenge: D". Ahora se deriva una frase legible.
      topic = topicManual?.trim() || derivarTema(texto);
    }

    // El modelo elegido en Ajustes ahora sí se usa para extraer los sub-temas: antes se
    // ignoraba y siempre se llamaba al default hardcodeado. Queda guardado en la sesión.
    // El material se parte en bloques (ver `extraerSubtemas`) para que el final del
    // documento cuente: antes solo se miraba el head y salían pocos sub-temas.
    const { subtemas, bloques } = await extraerSubtemas(textoFuente, modelo, proveedor, preset);

    if (subtemas.length === 0) {
      return NextResponse.json(
        { error: "No se pudieron extraer sub-temas del texto" },
        { status: 500 }
      );
    }
    const sesionId = crearSesion(topic, textoFuente, modelo, { modo, objetivo, nivel });
    const subtemaIds = subtemas.map((nombre) => agregarSubtema(sesionId, nombre));

    return NextResponse.json({
      sesionId,
      topic,
      modo,
      preset,
      // Cobertura del análisis: la landing avisa cuando el material era largo y salieron
      // pocos sub-temas (antes el modelo solo veía el principio).
      analisis: { bloques, textoChars: textoFuente.length, subtemas: subtemas.length },
      // Solo el modo tema libre devuelve el apunte: es material de estudio nuevo que la
      // landing muestra para revisar antes de arrancar el sondeo.
      ...(apunteGenerado ? { apunte: apunteGenerado } : {}),
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
