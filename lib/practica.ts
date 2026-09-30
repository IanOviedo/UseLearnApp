import { INTENTOS_MINIMOS_PARA_PRACTICA } from "./config";
import type { BloqueRuta, RutaSubtema, SubtemaEstado } from "./tipos";

// --- Fase C2 — ruta por sub-tema ---------------------------------------------
//
// El plan ya no es un callejón ("vení que te enseño"): cada sub-tema sale del sondeo
// con una ruta que decide enseñar, asegurar o practicar. Se calcula en el servidor con
// los contadores que el sondeo ya persiste (total_intentos / total_incorrectas), así
// que recargar la página no cambia la ruta.

/**
 * Criterios (en este orden):
 * - 0 intentos → nunca se evaluó: hay que enseñar desde cero.
 * - Al menos 1 error → débil: enseñar (anclado al error) + practicar.
 * - Sin errores pero menos de N intentos → se dominó muy rápido: repaso breve + practicar.
 * - Sin errores y con práctica suficiente → solo practicar (no hace falta volver a leer).
 */
function calcularRutaSubtema(subtema: SubtemaEstado): RutaSubtema {
  if (subtema.intentos === 0) return "sin_evaluar";
  if (subtema.incorrectas > 0) return "reforzar";
  if (subtema.intentos < INTENTOS_MINIMOS_PARA_PRACTICA) return "asegurar";
  return "practicar";
}

/** Ruta de todos los sub-temas de la sesión, en el orden en que se van a servir. */
function calcularRutaEnsenanza(subtemas: SubtemaEstado[]): BloqueRuta[] {
  return subtemas.map((subtema) => ({
    subtemaId: subtema.id,
    nombre: subtema.nombre,
    ruta: calcularRutaSubtema(subtema),
  }));
}

/** ¿Hay algo que enseñar? false = todo dominado sin errores → solo practicar/cerrar. */
function tieneRutasDeEnsenanza(rutas: BloqueRuta[]): boolean {
  return rutas.some((bloque) => bloque.ruta === "reforzar" || bloque.ruta === "sin_evaluar");
}

export { calcularRutaSubtema, calcularRutaEnsenanza, tieneRutasDeEnsenanza };
