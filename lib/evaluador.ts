import { EXCERPT_MAX_CHARS, NUM_PREDICT_JUEZ } from "./config";
import { llamarModelo } from "./ollama";
import { extraerExcerpt } from "./texto";
import type { Pregunta } from "./tipos";

export interface EvaluacionResultado {
  valida: boolean;
  motivo?: string;
}

/**
 * Esquema del veredicto. `motivo` es `anyOf` y no `type: ["string","null"]`: el
 * `type` como array no es JSON Schema válido y several proveedores OpenAI-compatibles
 * lo rechazan al validar el esquema. El juez igual lo parsea a mano como fallback.
 */
const ESQUEMA_JUEZ = {
  type: "object",
  properties: {
    valida: { type: "boolean" },
    motivo: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
  required: ["valida", "motivo"],
} as Record<string, unknown>;

/**
 * Un "Juez" basado en LLM que realiza una validación semántica profunda.
 *
 * A diferencia de `validarLote` (que es rápida, heurística y gratis), este paso
 * verifica contra el TEXTO lo que no se puede ver mirando la forma: que la respuesta
 * marcada como correcta sea la correcta, que el enunciado no sea ambiguo y que la
 * explicación no contradiga la respuesta.
 *
 * Cuesta una llamada al modelo POR PREGUNTA, así que va gateado por preset
 * (`AjustesCalidad.juezSemantico`) y se ejecuta en paralelo, no en serie.
 */
export async function evaluarCalidadSemantica(
  pregunta: Pregunta,
  textoOriginal: string,
  modelo: string
): Promise<EvaluacionResultado> {
  // Mismo criterio que el prompt del lote: excerpt centrado en el sub-tema en vez del
  // documento entero. Verificar veracidad no requiere las 50k de un PDF, y mandar todo
  // encarece y ralentiza cada llamada del juez.
  const excerpt = extraerExcerpt(textoOriginal, pregunta.pregunta, EXCERPT_MAX_CHARS);

  const prompt = `Sos un experto en control de calidad de contenidos educativos.
Tu tarea es evaluar si una pregunta de opción múltiple es correcta y de alta calidad basándote en un texto de referencia.

TEXTO DE REFERENCIA:
"""
${excerpt}
"""

PREGUNTA A EVALUAR:
- Enunciado: "${pregunta.pregunta}"
- Opciones: ${JSON.stringify(pregunta.opciones)}
- Respuesta correcta (índice ${pregunta.indiceCorrecta}): "${
    pregunta.opciones[pregunta.indiceCorrecta] ?? "(no existe esa opción)"
  }"
- Explicación: "${pregunta.explicacion}"

CRITERIOS DE EVALUACIÓN (si falla cualquiera, la pregunta NO es válida):
1. VERACIDAD: ¿la opción marcada como correcta es realmente la correcta según el TEXTO DE REFERENCIA?
2. CLARIDAD: ¿el enunciado es claro y no admite más de una respuesta correcta?
3. RELEVANCIA: ¿la pregunta trata sobre el tema del texto y se puede responder SOLO con el texto?
4. NO CONTRADICCIÓN: ¿la explicación justifica la opción marcada como correcta?

Ojo: el TEXTO puede estar truncado. Si la pregunta se responde con una parte del texto
que no está en el excerpt, no la invalides por eso: judgedla solo por lo que ves.

RESPONDE ÚNICAMENTE en formato JSON con esta estructura:
{
  "valida": boolean,
  "motivo": "breve explicación de por qué es inválida si valida es false, sino null"
}

Si la pregunta es buena, "valida" debe ser true y "motivo" null.`;

  try {
    const respuesta = await llamarModelo({
      modelo,
      prompt,
      esquema: ESQUEMA_JUEZ,
      esperaObjeto: true,
      numPredict: NUM_PREDICT_JUEZ,
    });

    const parsed = JSON.parse(respuesta);
    // `!!parsed.valida` solo: si el modelo devuelve "false" como string, truthy, y
    // daría por válida una pregunta que el juez marcó como mala.
    const valida = parsed.valida === true;
    return {
      valida,
      motivo: typeof parsed.motivo === "string" && parsed.motivo ? parsed.motivo : undefined,
    };
  } catch (error) {
    console.error("[evaluador] Error evaluando pregunta:", error);
    // Fail-open a propósito: si el juez se cae (timeout, modelo ocupado, JSON roto),
    // la pregunta ya pasó la validación local. Tirar acá dejaría al usuario sin lote
    // por un fallo del verificador, que es peor que servir una pregunta dudosa.
    return { valida: true };
  }
}

/**
 * Juzga un lote entero en paralelo y lo devuelve partido en válidas y rechazadas.
 *
 * `Promise.all` y no secuencial: son N llamadas independientes y el judge's verdict
 * no depende de la anterior, así que encadenarlas multiplicaría la latencia por N.
 * `evaluarCalidadSemantica` nunca lanza (siempre cae en su catch), así que no hace
 * falta `allSettled`: el `all` es seguro y el error se registra dentro de la función.
 */
export async function juzgarLote(
  lote: Pregunta[],
  textoOriginal: string,
  modelo: string
): Promise<{ validas: Pregunta[]; rechazadas: { indice: number; motivo: string }[] }> {
  const veredictos = await Promise.all(
    lote.map((pregunta) => evaluarCalidadSemantica(pregunta, textoOriginal, modelo))
  );

  const validas: Pregunta[] = [];
  const rechazadas: { indice: number; motivo: string }[] = [];
  lote.forEach((pregunta, indice) => {
    const veredicto = veredictos[indice];
    if (!veredicto) return;
    if (veredicto.valida) {
      validas.push(pregunta);
    } else {
      rechazadas.push({
        indice,
        motivo: `juez: ${veredicto.motivo ?? "sin motivo"}`,
      });
    }
  });

  return { validas, rechazadas };
}
