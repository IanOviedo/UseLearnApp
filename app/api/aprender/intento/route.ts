import { NextRequest, NextResponse } from "next/server";
import { obtenerEjercicioPorId, registrarIntentoEjercicio } from "@/lib/db";
import { normalizarTexto } from "@/lib/texto";

/**
 * Fase D — guarda un intento de ejercicio y devuelve si quedó aprobado.
 *
 * Corrección según el tipo:
 * - `quiz`: se corrige ACÁ contra `opciones[indiceCorrecta]` (el cliente manda solo la
 *   opción elegida; no se le confía la respuesta correcta).
 * - `codigo`: el `aprobado` viene del runner del sandbox (las assertions se ejecutan en
 *   el iframe, nunca en el server ni en el árbol de React).
 *
 * Body: { ejercicioId, codigo?, respuesta?, aprobado?, salida? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ejercicioId = Number(body.ejercicioId);

    if (!Number.isInteger(ejercicioId) || ejercicioId <= 0) {
      return NextResponse.json({ error: "ejercicioId inválido" }, { status: 400 });
    }

    const ejercicio = obtenerEjercicioPorId(ejercicioId);
    if (!ejercicio) {
      return NextResponse.json({ error: "Ejercicio no encontrado" }, { status: 404 });
    }

    let aprobado: boolean;
    let guardado: string;

    if (ejercicio.tipo === "quiz") {
      const respuesta = typeof body.respuesta === "string" ? body.respuesta : "";
      const esperada = ejercicio.opciones?.[ejercicio.indiceCorrecta ?? -1] ?? "";
      if (!respuesta.trim() || !esperada) {
        return NextResponse.json({ error: "Falta el campo 'respuesta'" }, { status: 400 });
      }
      aprobado = normalizarTexto(respuesta) === normalizarTexto(esperada);
      guardado = respuesta;
    } else {
      guardado = typeof body.codigo === "string" ? body.codigo : "";
      if (!guardado.trim()) {
        return NextResponse.json({ error: "Falta el campo 'codigo'" }, { status: 400 });
      }
      aprobado = body.aprobado === true;
    }

    const salida = typeof body.salida === "string" ? body.salida.slice(0, 8000) : null;
    const intentoId = registrarIntentoEjercicio(ejercicioId, guardado, aprobado, salida);

    return NextResponse.json({ ok: true, intentoId, aprobado });
  } catch (error) {
    console.error("Error registrando el intento:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
