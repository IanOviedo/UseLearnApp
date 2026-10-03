// Lógica compartida del sondeo (Fase B.10 — merge responder→siguiente).
// Antes `responder` y `siguiente-pregunta` eran dos roundtrips por pregunta
// (POST + GET). Ahora `responder` puede devolver la siguiente en la misma
// respuesta y ambos routes usan este helper para no duplicar la lógica.
import {
  contarProgresoSesion,
  elegirSiguienteSubtema,
  finalizarSondeo,
  guardarLotePreguntas,
  obtenerEnunciadosSesion,
  obtenerErroresSesion,
  obtenerEstadoSondeo,
  obtenerPreguntasSinResponder,
  obtenerSubtemas,
  obtenerSubtemasDebiles,
  obtenerSubtemasSinDominar,
  sondeoCompleto,
  esSubtemaDebil,
} from "./db";
import { generarFeedbackSondeo, generarLotePreguntas, type ResultadoSubtema } from "./ollama";
import { juzgarLote } from "./evaluador";
import { maxPreguntasSesion, PREGEN_UMBRAL_PENDIENTES, type PresetCalidad } from "./config";
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
  /** Sub-temas que quedaron sin dominar: el plan los muestra aparte (no son "a reforzar"). */
  subtemasSinDominar?: string[];
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
  preset?: PresetCalidad;
}): Promise<SiguientePayload> {
  const { sesion, subtemas, progreso } = obtenerEstadoSondeo(args.sesionId);
  if (!sesion) throw new Error("Sesión no encontrada");

  // El tope de seguridad se deriva de la cantidad de sub-temas: con 20 fijo, una sesión de
  // 10 sub-temas cerraba antes de evaluarlos a todos.
  if (sondeoCompleto(subtemas) || progreso.respondidas >= maxPreguntasSesion(subtemas.length)) {
    const subtemasDebiles = obtenerSubtemasDebiles(args.sesionId);
    const subtemasSinDominar = obtenerSubtemasSinDominar(args.sesionId);
    if (sesion.feedbackFinal !== null) {
      return {
        completo: true,
        feedback: sesion.feedbackFinal,
        subtemasDebiles,
        subtemasSinDominar,
        ...progreso,
      };
    }
    const feedback = await generarFeedbackSondeo(
      resultadosDe(subtemas),
      obtenerErroresSesion(args.sesionId),
      args.modeloPrincipal,
      args.proveedorPrincipal
    );
    finalizarSondeo(args.sesionId, feedback);
    return { completo: true, feedback, subtemasDebiles, subtemasSinDominar, ...progreso };
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

  const previas = obtenerEnunciadosSesion(args.sesionId);
  const lote = await generarLotePreguntas(
    subtema.nombre,
    subtema.fragmento ?? sesion.textoOriginal,
    args.modeloPreguntas,
    args.proveedorPreguntas,
    previas,
    args.preset ? { preset: args.preset, juez: juzgarLote } : { juez: juzgarLote }
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
  preset?: PresetCalidad;
}): void {
  if (!args.pregen) return;
  if (args.proveedorPreguntas) return;
  if (args.pendientesRestantes > PREGEN_UMBRAL_PENDIENTES) return;

  const trabajo = (async () => {
    const { sesion, subtemas } = obtenerEstadoSondeo(args.sesionId);
    if (!sesion) return;
    // El candidato se elige con la MISMA política que `servirSiguiente` (el sub-tema menos
    // avanzado de los que quedan): antes se tomaba el primero por id que no tuviera
    // pendientes, que podía no ser el que se iba a servir, y la transición terminaba
    // esperando al modelo igual (además de generar un lote que no se usaba enseguida).
    const candidatos = subtemas.filter((s) => !s.cubierto && s.id !== args.subtemaActualId);
    const siguiente = elegirSiguienteSubtema(candidatos);
    if (!siguiente) return;
    if (obtenerPreguntasSinResponder(siguiente.id).length > 0) return;
    const previas = obtenerEnunciadosSesion(args.sesionId);
    // Sin juez en la pre-gen: corre en background contra el MISMO Ollama local que
    // está por servir la pregunta que el usuario está esperando ahora. N llamadas
    // extra del juez en paralelo compiten por la GPU y el foreground se
    // atrasa, que es justo lo que la pre-gen existe para evitar. La pregunta que sí
    // pasa por el juez es la de `servirSiguiente`, en foreground.
    const lote = await generarLotePreguntas(
      siguiente.nombre,
      siguiente.fragmento ?? sesion.textoOriginal,
      args.modeloPreguntas,
      args.proveedorPreguntas,
      previas,
      args.preset ? { preset: args.preset } : undefined
    );
    // Re-chequeo POST-generación (síncrono, sin await en el medio: Node es single-thread,
    // así que ningún otro request puede intercalarse entre el chequeo y el guardado):
    // - si otro request ya guardó el lote de este sub-tema, no se duplica;
    // - si el sub-tema se cubrió mientras se generaba, el lote ya no sirve y se descarta
    //   (si no, quedarían preguntas pendientes para siempre sumando al total del sondeo).
    const estadoActual = obtenerSubtemas(args.sesionId).find((s) => s.id === siguiente.id);
    if (!estadoActual || estadoActual.cubierto) return;
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
