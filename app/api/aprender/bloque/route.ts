import { NextRequest, NextResponse } from "next/server";
import {
  guardarEjercicios,
  guardarExplicaciones,
  obtenerEjercicios,
  obtenerEnunciadosEjercicios,
  obtenerErroresSesion,
  obtenerExplicaciones,
  obtenerIntentosEjercicio,
  obtenerSesion,
  obtenerSubtemas,
} from "@/lib/db";
import {
  cantidadExplicaciones,
  generarEjercicios,
  generarExplicaciones,
  type ErrorSubtema,
} from "@/lib/aprender";
import { calcularRutaSubtema } from "@/lib/practica";
import { EJERCICIOS_POR_BLOQUE, MODELO_PRINCIPAL_POR_DEFECTO } from "@/lib/config";
import { proveedorDesdeParams } from "@/lib/proveedores";
import type { IntentoEjercicio, ProveedorPayload } from "@/lib/tipos";

/**
 * Fase D — material de la fase Enseñar/Practicar para UN sub-tema.
 *
 * Genera si falta y devuelve lo que ya existe (mismo patrón de caché que
 * `siguiente-pregunta`): recargar o volver atrás no regenera nada. Las dos llamadas al
 * modelo (explicaciones y ejercicios) corren en paralelo, y si una falla la otra puede
 * haberse guardado igual — el reintento solo rellena lo que falta.
 *
 * Body: { sesionId, subtemaId, modeloPrincipal?, proveedor? }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const sesionId = Number(body.sesionId);
    const subtemaId = Number(body.subtemaId);
    const modelo: string = body.modeloPrincipal || MODELO_PRINCIPAL_POR_DEFECTO;
    const proveedor = proveedorDesdeParams((body.proveedor ?? {}) as ProveedorPayload);

    if (!Number.isInteger(sesionId) || sesionId <= 0) {
      return NextResponse.json({ error: "sesionId inválido" }, { status: 400 });
    }
    if (!Number.isInteger(subtemaId) || subtemaId <= 0) {
      return NextResponse.json({ error: "subtemaId inválido" }, { status: 400 });
    }

    const sesion = obtenerSesion(sesionId);
    if (!sesion) return NextResponse.json({ error: "Sesión no encontrada" }, { status: 404 });

    // El material solo existe después del sondeo: el plan decide la ruta y recién
    // entonces se entra a enseñar. Si alguien lo pide antes, es un error de flujo.
    if (sesion.faseActual !== "ensenar" && sesion.faseActual !== "cerrar") {
      return NextResponse.json(
        { error: "La sesión todavía no llegó a la fase de práctica (primero completá el plan)" },
        { status: 409 }
      );
    }

    const subtema = obtenerSubtemas(sesionId).find((s) => s.id === subtemaId);
    if (!subtema) return NextResponse.json({ error: "Sub-tema no encontrado en esta sesión" }, { status: 404 });

    const ruta = calcularRutaSubtema(subtema);
    let explicaciones = obtenerExplicaciones(sesionId, subtemaId);
    let ejercicios = obtenerEjercicios(sesionId, subtemaId);

    // Diagnóstico del bug "el sidebar dice 3 y solo se muestran 2": la base tiene los 3
    // (verificado sobre los 30 ejercicios reales), así que la pérdida ocurre entre esta
    // respuesta y el render. Estos números permiten localizar en qué capa se pierde sin adivinar.
    const diagnostico = {
      enBase: ejercicios.length,
      generados: 0,
      servidos: 0,
      ids: [] as number[],
      tipos: [] as string[],
      pedidosPrevios: 0,
    };

    const faltanExplicaciones = explicaciones.length === 0 && cantidadExplicaciones(ruta) > 0;
    const faltanEjercicios = ejercicios.length === 0;

    if (faltanExplicaciones || faltanEjercicios) {
      const previos = faltanEjercicios ? obtenerEnunciadosEjercicios(sesionId, subtemaId) : [];
      diagnostico.pedidosPrevios = previos.length;

      // Errores concretos del estudiante EN este sub-tema: son los que anclan la
      // primera explicación de la ruta "reforzar" ("elegiste X, lo correcto era Y").
      const errores: ErrorSubtema[] = obtenerErroresSesion(sesionId)
        .filter((error) => error.subtema === subtema.nombre)
        .map(({ pregunta, elegida, correcta }) => ({ pregunta, elegida, correcta }));

      const [nuevasExplicaciones, nuevosEjercicios] = await Promise.all([
        faltanExplicaciones
          ? generarExplicaciones({
              subtema: subtema.nombre,
              textoOriginal: subtema.fragmento ?? sesion.textoOriginal,
              ruta,
              errores,
              modelo,
              proveedor,
            })
          : Promise.resolve([]),
        faltanEjercicios
          ? generarEjercicios({
              subtema: subtema.nombre,
              textoOriginal: subtema.fragmento ?? sesion.textoOriginal,
              modo: sesion.modo === "tema_libre" ? "tema_libre" : "apunte",
              // Anti-repetición: TODOS los ejercicios ya generados en la sesión, excluyendo los
              // del propio sub-tema (sus variantes js/jsx comparten enunciado a propósito).
              // Antes se pasaba `[]` siempre, así que el modelo no tenía forma de saber qué ya
              // existía: es lo que producía el mismo ejercicio en sesiones distintas.
              ejerciciosPrevios: previos,
              modelo,
              proveedor,
            })
          : Promise.resolve([]),
      ]);

      diagnostico.generados = nuevosEjercicios.length;
      // El generador devuelve los válidos; lo que sale de la base es la última palabra.
      if (diagnostico.generados < EJERCICIOS_POR_BLOQUE) {
        console.warn(
          `[aprender] el modelo devolvió ${diagnostico.generados} ejercicios para "${subtema.nombre}" ` +
            `de los ${EJERCICIOS_POR_BLOQUE} esperados (previos ya vistos: ${previos.length})`
        );
      }

      if (nuevasExplicaciones.length > 0) {
        guardarExplicaciones(
          sesionId,
          nuevasExplicaciones.map((explicacion) => ({ subtemaId, ...explicacion }))
        );
      }
      if (nuevosEjercicios.length > 0) {
        guardarEjercicios(
          sesionId,
          nuevosEjercicios.map((ejercicio) => ({ subtemaId, ...ejercicio }))
        );
      }

      explicaciones = obtenerExplicaciones(sesionId, subtemaId);
      ejercicios = obtenerEjercicios(sesionId, subtemaId);
    }

    // Último intento por ejercicio: el cliente lo usa para restaurar el código que
    // había escrito y mostrar "aprobado" sin volver a correr nada.
    const ultimosIntentos: Record<number, IntentoEjercicio | null> = {};
    for (const ejercicio of ejercicios) {
      const intentos = obtenerIntentosEjercicio(ejercicio.id);
      ultimosIntentos[ejercicio.id] = intentos.length > 0 ? intentos[intentos.length - 1] : null;
    }

    diagnostico.servidos = ejercicios.length;
    diagnostico.ids = ejercicios.map((e) => e.id);
    diagnostico.tipos = ejercicios.map((e) => e.tipo + ":" + (e.variante ?? "-"));

    // El aviso es por el server, no por el cliente: si acá hay 3 y en pantalla hay 2, el problema
    // está entre la respuesta y el render, y este log ya lo deja dicho en el terminal.
    if (diagnostico.servidos < EJERCICIOS_POR_BLOQUE) {
      console.warn(
        `[aprender] "${subtema.nombre}" sirve ${diagnostico.servidos} ejercicios de ${EJERCICIOS_POR_BLOQUE}: ` +
          `base=${diagnostico.enBase} generados=${diagnostico.generados} ids=${diagnostico.ids}`
      );
    }

    return NextResponse.json({ ruta, explicaciones, ejercicios, ultimosIntentos, diagnostico });
  } catch (error) {
    console.error("Error generando el bloque de aprendizaje:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
