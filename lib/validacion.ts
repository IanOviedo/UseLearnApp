// Validación local de lotes de preguntas (sin gastar modelo).
// Antes cualquier lote que parseaba JSON se guardaba: entraban preguntas con la misma
// respuesta dos veces, opciones casi idénticas o la correcta siempre en el mismo lugar.
// Todo lo de acá es barato (comparar strings) y corre antes de guardar.

import { OPCIONES_POR_PREGUNTA } from "./config";
import { esParecido, normalizarParaSimilitud } from "./texto";
import type { Pregunta } from "./tipos";

export interface MotivoRechazo {
  indice: number;
  motivo: string;
}

/** Resultado de validar un lote: las que pasan y por qué se rechazó cada una. */
export interface ValidacionLote {
  validas: Pregunta[];
  rechazadas: MotivoRechazo[];
}

/** Stem demasiado corto para evaluar algo (\"¿Qué es X?\" sin contexto). */
function stemPobre(pregunta: string): boolean {
  return normalizarParaSimilitud(pregunta).split(" ").filter(Boolean).length < 6;
}

/** Trivia típica que no enseña: \"todas las anteriores\" / \"ninguna de las anteriores\". */
function esTrivia(opciones: string[]): boolean {
  return opciones.some((opcion) => {
    const normalizada = normalizarParaSimilitud(opcion);
    return (
      normalizada.includes("todas las anteriores") ||
      normalizada.includes("ninguna las anteriores") ||
      normalizada.includes("ninguna de las anteriores") ||
      normalizada === "todas" ||
      normalizada === "ninguna"
    );
  });
}

/**
 * Valida un lote contra sí mismo y contra lo ya visto en la sesión.
 * - stem pobre, trivia, opciones duplicadas o longitudes muy desbalanceadas → fuera
 * - parecida a otra del lote o a una previa de la sesión → fuera
 * - no toca `indiceCorrecta`: solo filtra, el balance se controla en `distribucionSospechosa`
 */
export function validarLote(
  lote: Pregunta[],
  previasSesion: string[] = [],
  umbralSimilitud: number = 0.6
): ValidacionLote {
  const validas: Pregunta[] = [];
  const rechazadas: MotivoRechazo[] = [];
  const vistas: string[] = [...previasSesion];

  lote.forEach((pregunta, indice) => {
    const motivo =
      rechazarPorForma(pregunta) ??
      rechazarPorRepeticion(pregunta.pregunta, vistas, umbralSimilitud);
    if (motivo) {
      rechazadas.push({ indice, motivo });
      return;
    }
    validas.push(pregunta);
    vistas.push(pregunta.pregunta);
  });

  return { validas, rechazadas };
}

/** Rechazos que se ven mirando una sola pregunta. */
function rechazarPorForma(pregunta: Pregunta): string | null {
  if (stemPobre(pregunta.pregunta)) return "stem demasiado corto";
  if (!Array.isArray(pregunta.opciones) || pregunta.opciones.length !== OPCIONES_POR_PREGUNTA) {
    return "cantidad de opciones inválida";
  }
  if (esTrivia(pregunta.opciones)) return "opción comodín (todas/ninguna)";
  const normalizadas = pregunta.opciones.map(normalizarParaSimilitud);
  if (new Set(normalizadas).size !== normalizadas.length) return "opciones duplicadas";
  const largos = normalizadas.map((opcion) => opcion.length);
  const max = Math.max(...largos);
  const min = Math.min(...largos.filter((largo) => largo > 0));
  // La correcta suele ser la más larga cuando el modelo improvisa: si una opción
  // triplica a otra, casi siempre es la respuesta regalada por longitud.
  if (min > 0 && max / min >= 3) return "longitudes desbalanceadas";
  if (typeof pregunta.explicacion !== "string" || pregunta.explicacion.trim().length < 10) {
    return "sin explicación";
  }
  return null;
}

/** Rechazo por parecerse a algo ya visto (mismo lote o resto de la sesión). */
function rechazarPorRepeticion(
  enunciado: string,
  vistas: string[],
  umbral: number
): string | null {
  const parecida = vistas.find((previa) => esParecido(enunciado, previa, umbral));
  return parecida ? `repite otra pregunta ("${parecida.slice(0, 60)}…")` : null;
}

/**
 * ¿La correcta cae siempre en el mismo lugar? Con 4 opciones y N preguntas, si una
 * posición concentra más de la mitad + 1, el usuario aprende la posición, no el tema.
 */
export function distribucionSospechosa(lote: Pregunta[]): boolean {
  if (lote.length < 3) return false;
  const conteo = new Array<number>(OPCIONES_POR_PREGUNTA).fill(0);
  for (const pregunta of lote) {
    if (Number.isInteger(pregunta.indiceCorrecta) && pregunta.indiceCorrecta >= 0) {
      conteo[pregunta.indiceCorrecta] = (conteo[pregunta.indiceCorrecta] ?? 0) + 1;
    }
  }
  return Math.max(...conteo) > lote.length / 2 + 1;
}
