import {
  EJERCICIOS_POR_BLOQUE,
  EXCERPT_MAX_CHARS,
  EXPLICACIONES_POR_BLOQUE,
  NUM_PREDICT_EJERCICIOS,
  NUM_PREDICT_EXPLICACIONES,
} from "./config";
import { llamarModelo, recortarEntre, sinBloquesDeCodigo } from "./ollama";
import type { ProveedorNube } from "./proveedores";
import type { AssertionEjercicio, RutaSubtema } from "./tipos";
import { extraerExcerpt } from "./texto";

// --- Fase D — material de la fase Enseñar/Practicar --------------------------
//
// El transporte sigue siendo el gateway de ollama.ts (único punto de entrada a los
// modelos). Acá viven SOLO los prompts y el parseo del material nuevo: explicaciones
// (lo que se lee) y ejercicios (lo que se practica, con assertions ejecutables en el
// sandbox). Mismo patrón que las preguntas: TEXTO primero (prefix caching) + esquema
// JSON para que el formato salga válido a la primera.

export interface ExplicacionGenerada {
  orden: number;
  tipo: string;
  titulo: string;
  contenido: string;
  ejemplo: string | null;
}

export interface EjercicioGenerado {
  orden: number;
  tipo: "codigo" | "quiz";
  lenguaje: string;
  variante: string | null;
  enunciado: string;
  plantilla: string | null;
  assertions: AssertionEjercicio[];
  opciones: string[] | null;
  indiceCorrecta: number | null;
  pista: string | null;
  solucion: string | null;
  dificultad: string;
}

/** Error concreto del estudiante en el sub-tema: con esto se ancla la explicación. */
export interface ErrorSubtema {
  pregunta: string;
  elegida: string;
  correcta: string;
}

const TIPOS_EXPLICACION = new Set(["que_es", "como_se_usa", "variaciones", "mas_texto"]);

/** Cuántas explicaciones pide cada ruta (la tabla del plan, hecha código). */
export function cantidadExplicaciones(ruta: RutaSubtema): number {
  if (ruta === "reforzar" || ruta === "sin_evaluar") return EXPLICACIONES_POR_BLOQUE;
  if (ruta === "asegurar") return 1;
  return 0; // practicar: no hay lectura, solo ejercicios
}

export function construirPromptExplicaciones(opts: {
  subtema: string;
  textoOriginal: string;
  cantidad: number;
  errores: ErrorSubtema[];
}): string {
  const excerpt = extraerExcerpt(opts.textoOriginal, opts.subtema, EXCERPT_MAX_CHARS);
  const bloqueErrores = opts.errores.length
    ? `\nERRORES CONCRETOS DEL ESTUDIANTE (el primer bloque tiene que partir de esa confusión, sin copiar la pregunta entera):\n${opts.errores
        .map((e) => `- Pregunta: ${e.pregunta}\n  Él eligió: "${e.elegida}" | Lo correcto: "${e.correcta}"`)
        .join("\n")}\n`
    : "";
  const consigna =
    opts.cantidad === 1
      ? "Escribí UN solo bloque: repaso breve con lo esencial de la definición."
      : `Escribí EXACTAMENTE ${opts.cantidad} bloques, en este orden:\n1. definición clara (tipo "que_es").\n2. cómo se usa o se aplica en la práctica (tipo "como_se_usa").\n3. profundización: ampliá el punto más importante o más confuso (tipo "mas_texto").`;

  return `TEXTO:
"""
${excerpt}
"""
${bloqueErrores}
TAREA: Material de explicación en español sobre "${opts.subtema}" para alguien que acaba de fallar un quiz sobre el tema.
${consigna}
Reglas:
- Cada bloque tiene "titulo" (3 a 7 palabras), "contenido" (3 a 6 oraciones en texto plano, sin markdown) y "ejemplo" (1 a 2 oraciones concretas; cadena vacía si no hace falta).
- "tipo" tiene que ser exactamente: "que_es", "como_se_usa", "variaciones" o "mas_texto".
- Usá la terminología del TEXTO: si algo no está ahí, explicalo con tus palabras pero no inventes nombres propios.
- No menciones que sos una IA ni que esto es material generado.
Respondé SOLO con el array JSON de objetos {tipo, titulo, contenido, ejemplo}.`;
}

const ESQUEMA_EXPLICACIONES = {
  type: "array",
  items: {
    type: "object",
    properties: {
      tipo: { type: "string" },
      titulo: { type: "string" },
      contenido: { type: "string" },
      ejemplo: { type: "string" },
    },
    required: ["tipo", "titulo", "contenido", "ejemplo"],
  },
} as Record<string, unknown>;

function parsearExplicaciones(rawText: string, cantidad: number): ExplicacionGenerada[] {
  const limpio = recortarEntre(sinBloquesDeCodigo(rawText), "[", "]");

  let parsed: unknown;
  try {
    parsed = JSON.parse(limpio);
  } catch (error) {
    console.error("=== RAW MODEL RESPONSE (explicaciones) ===", rawText);
    throw new Error(
      `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("La respuesta del modelo no es un array JSON de explicaciones.");
  }

  const normalizadas = parsed
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
    .map((item) => {
      const titulo = typeof item.titulo === "string" ? item.titulo.trim() : "";
      const contenido = typeof item.contenido === "string" ? item.contenido.trim() : "";
      const tipo = typeof item.tipo === "string" && TIPOS_EXPLICACION.has(item.tipo) ? item.tipo : "como_se_usa";
      const ejemplo = typeof item.ejemplo === "string" ? item.ejemplo.trim() : "";
      return { tipo, titulo, contenido, ejemplo: ejemplo || null };
    })
    .filter((item) => item.titulo.length > 0 && item.contenido.length > 0)
    .slice(0, cantidad)
    .map((item, orden) => ({ ...item, orden }));

  if (normalizadas.length === 0) {
    console.error("=== RAW MODEL RESPONSE (explicaciones) ===", rawText);
    throw new Error("El modelo no devolvió explicaciones válidas.");
  }

  return normalizadas;
}

/**
 * Genera las explicaciones de un sub-tema según su ruta. `cantidad = 0` (ruta
 * "practicar") no llama al modelo: no hay lectura que hacer.
 */
export async function generarExplicaciones(opts: {
  subtema: string;
  textoOriginal: string;
  ruta: RutaSubtema;
  errores: ErrorSubtema[];
  modelo: string;
  proveedor?: ProveedorNube;
}): Promise<ExplicacionGenerada[]> {
  const cantidad = cantidadExplicaciones(opts.ruta);
  if (cantidad === 0) return [];

  const rawText = await llamarModelo({
    prompt: construirPromptExplicaciones({
      subtema: opts.subtema,
      textoOriginal: opts.textoOriginal,
      cantidad,
      errores: opts.errores,
    }),
    modelo: opts.modelo,
    proveedor: opts.proveedor,
    numPredict: NUM_PREDICT_EXPLICACIONES,
    esquema: ESQUEMA_EXPLICACIONES,
  });

  return parsearExplicaciones(rawText, cantidad);
}

export function construirPromptEjercicios(opts: {
  subtema: string;
  textoOriginal: string;
  modo: "apunte" | "tema_libre";
  ejerciciosPrevios: string[];
}): string {
  const excerpt = extraerExcerpt(opts.textoOriginal, opts.subtema, EXCERPT_MAX_CHARS);
  const previos = opts.ejerciciosPrevios.length
    ? `\nEjercicios ya generados para este sub-tema (NO los repitas ni los reformules; cada uno tiene que explorar otro ángulo):\n${opts.ejerciciosPrevios
        .map((ejercicio, i) => `${i + 1}. ${ejercicio}`)
        .join("\n")}\n`
    : "";
  const fidelidad =
    opts.modo === "apunte"
      ? "Basate en la terminología del TEXTO (es el material de estudio del estudiante)."
      : "El TEXTO es material de estudio ya generado: usá su terminología como referencia.";

  return `TEXTO:
"""
${excerpt}
"""
${previos}
TAREA: Creá ejercicios de práctica en español sobre "${opts.subtema}", para usar DESPUÉS de un quiz de diagnóstico. Respondé SOLO con un array JSON.
Primero determiná si el tema es de PROGRAMACIÓN y después armá el array de acuerdo a eso:
- Si el tema ES de programación, el array trae EXACTAMENTE 3 ejercicios:
  1. Un quiz conceptual: "tipo" "quiz", "enunciado" concreto, "opciones" con exactamente 4 respuestas, "indiceCorrecta" entero de 0 a 3, "pista" (1 oración de ayuda) y "solucion" (por qué esa es la correcta).
  2. y 3. EL MISMO problema resuelto dos veces:
     a. ("tipo": "codigo", "lenguaje": "js", "variante": "js") — función de JavaScript puro.
     b. ("tipo": "codigo", "lenguaje": "jsx", "variante": "jsx") — componente que recibe props y devuelve un árbol con h(tag, props, ...children).
     Cuando el tema es de programación NO podés devolver solo quiz: los ejercicios de código son obligatorios.
- Si el tema NO es de programación: 2 quiz con ángulos distintos (mismo formato del punto 1).
Reglas de los ejercicios "codigo":
- Solo JavaScript puro: SIN DOM, sin fetch, sin import/export, sin librerías (el runner no tiene window ni document).
- "plantilla": código inicial con TODO para completar, incluyendo la firma de la función y qué tiene que devolver.
- "assertions": entre 2 y 4 objetos {descripcion, test}. "test" es una expresión JS que usa los nombres que define el usuario y devuelve true/false. Ejemplo: "contador({tipo:'sumar'}).valor === 1". NO uses expect(), describe() ni sintaxis de tests.
- En la variante jsx, los tests comparan el árbol devuelto, p. ej.: JSON.stringify(Lista({tareas: ["a"]})) === '{"tag":"ul","props":null,"children":[{"tag":"li","props":null,"children":["a"]}]}' (adaptalo al problema real).
- "solucion": la solución completa y funcional. "pista": 1 oración que oriente sin resolver.
- "dificultad": "facil", "media" o "dificil".
Reglas generales:
- Enunciados concretos, nada de "¿cuál de las siguientes es correcta?" genérico.
- ${fidelidad}
- No menciones que sos una IA ni que esto es material generado.`;
}

const ESQUEMA_EJERCICIOS = {
  type: "array",
  items: {
    type: "object",
    properties: {
      tipo: { type: "string" },
      lenguaje: { type: "string" },
      variante: { type: "string" },
      enunciado: { type: "string" },
      plantilla: { type: "string" },
      assertions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            descripcion: { type: "string" },
            test: { type: "string" },
          },
          required: ["descripcion", "test"],
        },
      },
      opciones: { type: "array", items: { type: "string" } },
      indiceCorrecta: { type: "integer" },
      pista: { type: "string" },
      solucion: { type: "string" },
      dificultad: { type: "string" },
    },
    required: ["tipo", "enunciado"],
  },
} as Record<string, unknown>;

/**
 * Normaliza un ejercicio del modelo. Devuelve `null` si no es usable: un quiz sin
 * opciones válidas o un código sin assertions no tiene forma de corregirse, y meterlo a
 * la base igual dejaria ejercicios imposibles de aprobar.
 */
function normalizarEjercicio(raw: unknown, orden: number): EjercicioGenerado | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const enunciado = typeof o.enunciado === "string" ? o.enunciado.trim() : "";
  if (!enunciado) return null;

  const pista = typeof o.pista === "string" ? o.pista.trim() : "";
  const solucion = typeof o.solucion === "string" ? o.solucion.trim() : "";
  const dificultad = ["facil", "media", "dificil"].includes(String(o.dificultad))
    ? String(o.dificultad)
    : "media";
  const tipo = typeof o.tipo === "string" ? o.tipo.toLowerCase().trim() : "";

  if (tipo === "quiz") {
    const opciones = Array.isArray(o.opciones)
      ? (o.opciones as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    if (opciones.length < 2) return null;
    const indice =
      typeof o.indiceCorrecta === "number" ? o.indiceCorrecta : Number.parseInt(String(o.indiceCorrecta), 10);
    if (!Number.isInteger(indice) || indice < 0 || indice >= opciones.length) return null;
    return {
      orden,
      tipo: "quiz",
      lenguaje: "ninguno",
      variante: null,
      enunciado,
      plantilla: null,
      assertions: [],
      opciones,
      indiceCorrecta: indice,
      pista: pista || null,
      solucion: solucion || null,
      dificultad,
    };
  }

  // --- código ---
  const varianteCruda = typeof o.variante === "string" ? o.variante.toLowerCase().trim() : "";
  const lenguaje = o.lenguaje === "jsx" || varianteCruda === "jsx" ? "jsx" : "js";
  const assertions: AssertionEjercicio[] = [];
  if (Array.isArray(o.assertions)) {
    for (const posible of o.assertions as unknown[]) {
      if (!posible || typeof posible !== "object") continue;
      const a = posible as Record<string, unknown>;
      const test = typeof a.test === "string" ? a.test.trim() : "";
      if (!test) continue;
      const descripcion = typeof a.descripcion === "string" && a.descripcion.trim() ? a.descripcion.trim() : "";
      assertions.push({ descripcion: descripcion || `Condición ${assertions.length + 1}`, test });
    }
  }
  if (assertions.length === 0) return null;

  const plantilla = typeof o.plantilla === "string" ? o.plantilla.trim() : "";
  return {
    orden,
    tipo: "codigo",
    lenguaje,
    variante: varianteCruda === "js" || varianteCruda === "jsx" ? varianteCruda : lenguaje,
    enunciado,
    plantilla: plantilla || null,
    assertions,
    opciones: null,
    indiceCorrecta: null,
    pista: pista || null,
    solucion: solucion || null,
    dificultad,
  };
}

/** Parsea el lote, descarta repetidos y topa en EJERCICIOS_POR_BLOQUE. */
function parsearEjercicios(rawText: string): EjercicioGenerado[] {
  const limpio = recortarEntre(sinBloquesDeCodigo(rawText), "[", "]");

  let parsed: unknown;
  try {
    parsed = JSON.parse(limpio);
  } catch (error) {
    console.error("=== RAW MODEL RESPONSE (ejercicios) ===", rawText);
    throw new Error(
      `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error("La respuesta del modelo no es un array JSON de ejercicios.");
  }

  const vistos = new Set<string>();
  const validos: EjercicioGenerado[] = [];

  for (const raw of parsed) {
    const ejercicio = normalizarEjercicio(raw, validos.length);
    if (!ejercicio) {
      // Visible en el log del server: si el modelo manda un ejercicio sin assertions
      // (o un quiz sin opciones), se descarta y conviene saberlo en vez de ver "0".
      console.warn(
        "[aprender] ejercicio descartado por validación:",
        JSON.stringify(raw).slice(0, 300)
      );
      continue;
    }
    // La clave incluye tipo y variante: las variantes js y jsx del mismo problema
    // comparten enunciado a propósito y tienen que sobrevivir las dos.
    const clave = [
      ejercicio.tipo,
      ejercicio.variante ?? "",
      ejercicio.enunciado.trim().toLowerCase(),
    ].join("|");
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    validos.push(ejercicio);
    if (validos.length >= EJERCICIOS_POR_BLOQUE) break;
  }

  if (validos.length === 0) {
    console.error("=== RAW MODEL RESPONSE (ejercicios) ===", rawText);
    throw new Error("El modelo no devolvió ejercicios válidos.");
  }

  return validos;
}

export async function generarEjercicios(opts: {
  subtema: string;
  textoOriginal: string;
  modo: "apunte" | "tema_libre";
  ejerciciosPrevios: string[];
  modelo: string;
  proveedor?: ProveedorNube;
}): Promise<EjercicioGenerado[]> {
  const rawText = await llamarModelo({
    prompt: construirPromptEjercicios({
      subtema: opts.subtema,
      textoOriginal: opts.textoOriginal,
      modo: opts.modo,
      ejerciciosPrevios: opts.ejerciciosPrevios,
    }),
    modelo: opts.modelo,
    proveedor: opts.proveedor,
    numPredict: NUM_PREDICT_EJERCICIOS,
    esquema: ESQUEMA_EJERCICIOS,
  });

  return parsearEjercicios(rawText);
}
