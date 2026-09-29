// Lógica compartida del sondeo (Fase B.10 — merge responder→siguiente).
// Antes `responder` y `siguiente-pregunta` eran dos roundtrips por pregunta
// (POST + GET). Ahora `responder` puede devolver la siguiente en la misma
// respuesta y ambos routes usan este helper para no duplicar la lógica.
import {
  contarProgresoSesion,
  elegirSiguienteSubtema,
  finalizarSondeo,
  guardarLotePreguntas,
  obtenerErroresSesion,
  obtenerEstadoSondeo,
  obtenerPreguntasDelSubtema,
  obtenerPreguntasSinResponder,
  obtenerSubtemasDebiles,
  sondeoCompleto,
  esSubtemaDebil,
} from "./db";
import { generarFeedbackSondeo, generarLotePreguntas, type ResultadoSubtema } from "./ollama";
import { MAX_PREGUNTAS_SESION, PREGEN_UMBRAL_PENDIENTES } from "./config";
import type { ProveedorNube } from "./proveedores";
import type { LoteItem, Pregunta, SubtemaEstado } from "./tipos";

function resultadosDe(subtemas: SubtemaEstado[]): ResultadoSubtema[] {
  return subtemas.map((subtema) => ({
    nombre: subtema.nombre,
    intentos: subtema.intentos,
    correctas: subtema.correctas,
    incorrectas: subtema.incorrectas,
    dominio: subtema.intentos > 0 ? subtema.correctas / subtema.intentos : 0,
    cubierto: subtema.cubierto,
    debil: esSubtemaDebil(subtema.incorrectas),
  }));
}

export interface SiguientePayload {
  completo: boolean;
  subtemaId?: number;
  subtemaNombre?: string;
  preguntaId?: number;
  pregunta?: Pregunta;
  /** Fase B.10 — lote completo para que el cliente cachee sin pedir de nuevo. */
  lote?: LoteItem[];
  feedback?: string;
  subtemasDebiles?: string[];
  respondidas?: number;
  totalServibles?: number;
  subtemasTotal?: number;
  subtemasCubiertos?: number;
}

/**
 * Sirve la siguiente pregunta (o cierra el sondeo con feedback).
 * `generarSiFalta=true` genera el lote con el modelo cuando no hay pendientes;
 * en `false` solo sirve lo guardado (útil para pre-chequeos baratos).
 */
export async function servirSiguiente(args: {
  sesionId: number;
  modeloPreguntas: string;
  modeloPrincipal: string;
  proveedorPreguntas?: ProveedorNube;
  proveedorPrincipal?: ProveedorNube;
  generarSiFalta?: boolean;
}): Promise<SiguientePayload> {
  const { sesion, subtemas, progreso } = obtenerEstadoSondeo(args.sesionId);
  if (!sesion) throw new Error("Sesión no encontrada");

  if (sondeoCompleto(subtemas) || progreso.respondidas >= MAX_PREGUNTAS_SESION) {
    const subtemasDebiles = obtenerSubtemasDebiles(args.sesionId);
    if (sesion.feedbackFinal !== null) {
      return { completo: true, feedback: sesion.feedbackFinal, subtemasDebiles, ...progreso };
    }
    const feedback = await generarFeedbackSondeo(
      resultadosDe(subtemas),
      obtenerErroresSesion(args.sesionId),
      args.modeloPrincipal,
      args.proveedorPrincipal
    );
    finalizarSondeo(args.sesionId, feedback);
    return { completo: true, feedback, subtemasDebiles, ...progreso };
  }

  const subtema = elegirSiguienteSubtema(subtemas);
  if (!subtema) throw new Error("La sesión no tiene sub-temas cargados");

  const pendientes = obtenerPreguntasSinResponder(subtema.id);
  if (pendientes.length > 0) {
    const siguiente = pendientes[0];
    return {
      completo: false,
      subtemaId: subtema.id,
      subtemaNombre: subtema.nombre,
      preguntaId: siguiente.id,
      pregunta: JSON.parse(siguiente.contenido) as Pregunta,
      lote: pendientes.map((p) => ({
        preguntaId: p.id,
        pregunta: JSON.parse(p.contenido) as Pregunta,
      })),
      ...progreso,
    };
  }

  if (args.generarSiFalta === false) {
    return { completo: false, ...progreso };
  }

  const previas = obtenerPreguntasDelSubtema(subtema.id);
  const lote = await generarLotePreguntas(
    subtema.nombre,
    sesion.textoOriginal,
    args.modeloPreguntas,
    args.proveedorPreguntas,
    previas
  );
  const idsGuardados = guardarLotePreguntas(
    args.sesionId,
    subtema.id,
    "sondeo",
    lote.map((p) => JSON.stringify(p))
  );
  return {
    completo: false,
    subtemaId: subtema.id,
    subtemaNombre: subtema.nombre,
    preguntaId: idsGuardados[0],
    pregunta: lote[0],
    lote: lote.map((pregunta, i) => ({ preguntaId: idsGuardados[i], pregunta })),
    ...contarProgresoSesion(args.sesionId, subtemas),
  };
}

/**
 * Fase B.11 — pre-generación en paralelo (fire-and-forget), compartida por ambos
 * routes (GET siguiente-pregunta y POST responder con `siguiente: true`).
 * Si el lote que se acaba de servir deja pocas preguntas por delante (≤ umbral) y
 * el siguiente sub-tema no tiene nada guardado, su lote se genera EN SEGUNDO PLANO
 * mientras el usuario lee/responde: el cambio de sub-tema no corta.
 * Solo Ollama local — en nube se apaga porque cada lote extra cuesta tokens.
 */
export function lanzarPregenSiConviene(args: {
  sesionId: number;
  subtemaActualId: number;
  pendientesRestantes: number;
  modeloPreguntas: string;
  proveedorPreguntas?: ProveedorNube;
  pregen: boolean;
}): void {
  if (!args.pregen) return;
  if (args.proveedorPreguntas) return;
  if (args.pendientesRestantes > PREGEN_UMBRAL_PENDIENTES) return;

  const trabajo = (async () => {
    const { sesion, subtemas } = obtenerEstadoSondeo(args.sesionId);
    if (!sesion) return;
    // El siguiente sub-tema sin cubrir que todavía no tenga pendientes: su lote se
    // genera ahora para que ya esté guardado cuando el cliente lo pida.
    const candidatos = subtemas.filter((s) => !s.cubierto && s.id !== args.subtemaActualId);
    const siguiente = candidatos.find((s) => obtenerPreguntasSinResponder(s.id).length === 0);
    if (!siguiente) return;
    const previas = obtenerPreguntasDelSubtema(siguiente.id);
    const lote = await generarLotePreguntas(
      siguiente.nombre,
      sesion.textoOriginal,
      args.modeloPreguntas,
      args.proveedorPreguntas,
      previas
    );
    // Re-chequeo POST-generación: dos requests seguidos pueden disparar dos pre-gens
    // del mismo sub-tema a la vez (los dos vieron 0 pendientes al arrancar). Como
    // este chequeo y el guardado son síncronos y Node es single-thread, no puede
    // intercalarse otro request entre ambos: la ventana de carrera queda cerrada.
    if (obtenerPreguntasSinResponder(siguiente.id).length > 0) return;
    guardarLotePreguntas(
      args.sesionId,
      siguiente.id,
      "sondeo",
      lote.map((p) => JSON.stringify(p))
    );
  })();

  try {
    // `waitUntil` solo existe en runtimes serverless (Vercel/prod): mantiene vivo el
    // trabajo después de responder. En `next dev`/Node el promise sigue vivo igual.
    const waitUntil = (globalThis as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
    if (typeof waitUntil === "function") waitUntil(trabajo);
    // Fire-and-forget: si falla, el próximo request lo genera normal.
    void trabajo.catch((error) => console.error("Error en pre-generación (se ignora):", error));
  } catch {
    // Fire-and-forget: si falla, el próximo request lo genera normal.
  }
}
