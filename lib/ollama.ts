import {
  MAX_SUBTEMAS,
  MODELO_GEMINI,
  MODELO_NUBE_POR_DEFECTO,
  MODELO_PREGUNTAS_POR_DEFECTO,
  MODELO_PRINCIPAL_POR_DEFECTO,
  OPCIONES_POR_PREGUNTA,
  PREGUNTAS_POR_LOTE,
  URL_GEMINI,
} from "./config"
import type { ProveedorNube } from "./proveedores"
import type { Pregunta } from "./tipos"

// --- Gateway de modelos -----------------------------------------------------
//
// Único punto de entrada a cualquier modelo. Antes cada función (pregunta suelta,
// lote, feedback, extracción de sub-temas) repetía los tres caminos de proveedor,
// así que agregar una feature nueva obligaba a reescribir la capa de transporte tres
// veces. Además `generarFeedbackSondeo` y `extraerSubtemas` llamaban a Ollama directo,
// por lo que el selector de modelo de la pantalla de Ajustes no las afectaba.

interface OpcionesModelo {
  prompt: string;
  modelo: string;
  proveedor?: ProveedorNube;
  /** El camino OpenAI-compatible solo pide "json_object" cuando la respuesta es un objeto. */
  esperaObjeto?: boolean;
}

function esModeloGemini(modelo: string): boolean {
  return modelo.toLowerCase().startsWith("gemini")
}

function quitarRazonamiento(texto: string): string {
  // Flag "s" (dotAll) vía constructor: el target de TS del proyecto es ES2017 y no acepta el literal /…/s.
  return texto
    .replace(new RegExp("<think>.*?</think>", "s"), "")
    .replace(new RegExp("<thinking>.*?</thinking>", "s"), "")
}

async function llamarOllama(modelo: string, prompt: string): Promise<string> {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      prompt,
      stream: false,
      think: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`)
  }

  const data = await response.json()

  if (typeof data.response !== "string") {
    throw new Error(`Unexpected Ollama response shape: ${JSON.stringify(data)}`)
  }

  return quitarRazonamiento(data.response).trim()
}

async function llamarOpenAICompat(prompt: string, proveedor: ProveedorNube, esperaObjeto: boolean): Promise<string> {
  const res = await fetch(`${proveedor.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${proveedor.apiKey}`,
    },
    body: JSON.stringify({
      // El modelo ahora es configurable por proveedor: antes estaba fijo en
      // "openai/gpt-oss-120b" aunque el proveedor ofreciera algo más rápido.
      model: proveedor.modelo || MODELO_NUBE_POR_DEFECTO,
      messages: [{ role: "user", content: prompt }],
      ...(esperaObjeto ? { response_format: { type: "json_object" } } : {}),
    }),
  })

  if (!res.ok) {
    const textoError = await res.text()
    throw new Error(`Error de ${proveedor.nombre} (${res.status}): ${textoError}`)
  }

  const data = await res.json()
  return String(data.choices[0].message.content)
}

async function llamarGeminiNativo(prompt: string, proveedor?: ProveedorNube): Promise<string> {
  const apiKey = proveedor?.apiKey ?? process.env.GEMINI_API_KEY
  const modelo = proveedor?.modelo || MODELO_GEMINI
  // Si el proveedor definió su propia URL se respeta; si no, se usa la de Google.
  const base = proveedor?.baseUrl || URL_GEMINI
  const url = `${base}/${modelo}:generateContent?key=${apiKey}`

  const response = await fetchGeminiConReintento(
    url,
    JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0 },
    })
  )

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        "Se alcanzó el límite de uso gratuito de Gemini. Probá con un modelo local, o esperá a mañana."
      )
    }
    throw new Error(`Gemini API error: ${response.statusText}`)
  }

  const data = await response.json()
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text

  if (typeof rawText !== "string") {
    throw new Error(`Unexpected Gemini response shape: ${JSON.stringify(data)}`)
  }

  return rawText.trim()
}

/**
 * Resuelve el proveedor y devuelve el texto plano del modelo.
 * Prioridad: proveedor explícito (viene del cliente en cada request, porque el server
 * no puede leer localStorage) → nombre de modelo que empieza con "gemini" → Ollama local.
 */
async function llamarModelo({ prompt, modelo, proveedor, esperaObjeto = false }: OpcionesModelo): Promise<string> {
  if (proveedor) {
    return proveedor.formato === "gemini-nativo"
      ? llamarGeminiNativo(prompt, proveedor)
      : llamarOpenAICompat(prompt, proveedor, esperaObjeto)
  }

  if (esModeloGemini(modelo)) {
    return llamarGeminiNativo(prompt)
  }

  return llamarOllama(modelo, prompt)
}

// --- Parseo -----------------------------------------------------------------

function limpiarOpcion(texto: string): string {
  return texto.replace(/^(opci[oó]n\s*)?[a-d][.):]\s*/i, "").trim()
}

function sinBloquesDeCodigo(rawText: string): string {
  return rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
}

/** Se queda solo con lo que hay entre el primer y el último par de delimitadores. */
function recortarEntre(texto: string, apertura: string, cierre: string): string {
  const desde = texto.indexOf(apertura)
  const hasta = texto.lastIndexOf(cierre)
  return desde !== -1 && hasta !== -1 && hasta > desde ? texto.slice(desde, hasta + 1) : texto
}

function validarPregunta(parsed: unknown): Pregunta {
  const pregunta = parsed as { pregunta?: unknown; opciones?: unknown; indiceCorrecta?: unknown }

  if (Array.isArray(pregunta.opciones)) {
    pregunta.opciones = (pregunta.opciones as unknown[]).filter(
      (opcion): opcion is string => typeof opcion === "string" && opcion.trim().length > 0
    )
  }

  if (
    typeof pregunta.pregunta !== "string" ||
    !Array.isArray(pregunta.opciones) ||
    pregunta.opciones.length !== OPCIONES_POR_PREGUNTA ||
    !Number.isInteger(pregunta.indiceCorrecta) ||
    (pregunta.indiceCorrecta as number) < 0 ||
    (pregunta.indiceCorrecta as number) >= pregunta.opciones.length
  ) {
    throw new Error(`Estructura inválida: ${JSON.stringify(pregunta)}`)
  }

  return {
    pregunta: pregunta.pregunta,
    opciones: (pregunta.opciones as string[]).map(limpiarOpcion),
    indiceCorrecta: pregunta.indiceCorrecta as number,
  }
}

/** Parsea una pregunta suelta. Tolerante a texto alrededor del JSON o bloques de código. */
function parsearRespuestaPregunta(rawText: string): Pregunta {
  const limpio = recortarEntre(sinBloquesDeCodigo(rawText), "{", "}")
  return validarPregunta(JSON.parse(limpio))
}

/**
 * Parsea un lote y descarta preguntas repetidas dentro del mismo lote.
 * Puede devolver menos de lo pedido si el modelo repitió o falló alguna.
 */
function parsearLotePreguntas(rawText: string): Pregunta[] {
  const limpio = recortarEntre(sinBloquesDeCodigo(rawText), "[", "]")
  const parsed = JSON.parse(limpio)

  if (!Array.isArray(parsed)) {
    throw new Error(`Se esperaba un array de preguntas: ${JSON.stringify(parsed)}`)
  }

  const preguntas = parsed.map(validarPregunta)

  const vistas = new Set<string>()
  return preguntas.filter((pregunta) => {
    const clave = pregunta.pregunta.trim().toLowerCase()
    if (vistas.has(clave)) return false
    vistas.add(clave)
    return true
  })
}

async function fetchGeminiConReintento(url: string, body: string): Promise<Response> {
  const primero = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  })

  if (primero.status === 503 || primero.status === 429) {
    const espera = primero.status === 429 ? 15000 : 2000
    await new Promise((resolve) => setTimeout(resolve, espera))
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    })
  }

  return primero
}

export function construirPromptSubtemas(texto: string): string {
  return `Extraé los sub-temas/conceptos clave del siguiente texto. Devolvé como máximo ${MAX_SUBTEMAS} sub-temas (solo los más importantes). Respondé ÚNICAMENTE con un array JSON de strings cortos. Tu respuesta debe empezar con "[" y terminar con "]", sin texto, explicaciones, backticks ni bloques de código antes ni después (ejemplo: ["useState básico", "useEffect y dependencias", "props vs state"]).

Texto:
${texto}`
}

/** Bloque de "no repitas esto" que se comparte entre el prompt suelto y el de lote. */
function bloquePreguntasPrevias(preguntasPrevias: string[]): string {
  if (preguntasPrevias.length === 0) return ""

  return `\nPreguntas ya generadas para este subtema en esta sesión (NO las repitas ni las reformules — cada pregunta nueva tiene que explorar un aspecto, ejemplo o ángulo distinto):\n${preguntasPrevias
    .map((pregunta, i) => `${i + 1}. ${pregunta}`)
    .join("\n")}\n`
}

export function construirPromptPregunta(
  subtema: string,
  textoOriginal: string,
  preguntasPrevias: string[] = []
): string {
  return `Sos un asistente que genera preguntas de opción múltiple ÚNICAMENTE a partir del siguiente texto de estudio. No uses conocimiento externo ni inventes información que no esté en el texto.

Texto de estudio:
"""
${textoOriginal}
"""

Generá UNA pregunta de opción múltiple sobre el sub-tema "${subtema}", basada estrictamente en el contenido del texto de arriba.

Formato de salida obligatorio (sin razonar en voz alta):
- Tu respuesta es exactamente un objeto JSON, con esta forma:
{"pregunta": "texto de la pregunta", "opciones": ["opción A", "opción B", "opción C", "opción D"], "indiceCorrecta": 0}
- No agregues texto, explicaciones, comentarios ni razonamiento antes ni después. No uses backticks ni bloques de código: el JSON va en texto plano.

${bloquePreguntasPrevias(preguntasPrevias)}Reglas:
- La pregunta y todas las opciones deben basarse solo en lo que dice el texto de estudio, no en conocimiento general de React.
- Exactamente ${OPCIONES_POR_PREGUNTA} opciones.
- "indiceCorrecta" debe ser un número entero de 0 a ${OPCIONES_POR_PREGUNTA - 1}: el índice (base 0) de la opción correcta dentro del array "opciones".
- La pregunta debe evaluar comprensión real, no ser trivial.
- Cada distractor tiene que ser un error PLAUSIBLE (una confusión típica de quien recién aprende), nunca una opción absurda ni descartable por sentido común.
- Si la pregunta compara dos cosas (por ejemplo React vs Vanilla JavaScript, o dos conceptos distintos), verificá que cada característica corresponda al concepto correcto antes de escribir el JSON.
- El array "opciones" debe tener EXACTAMENTE ${OPCIONES_POR_PREGUNTA} elementos, todos con texto no vacío.`
}

export function construirPromptLotePreguntas(
  subtema: string,
  textoOriginal: string,
  preguntasPrevias: string[] = []
): string {
  return `Basándote en el siguiente texto de estudio, generá EXACTAMENTE ${PREGUNTAS_POR_LOTE} preguntas de opción múltiple sobre el subtema "${subtema}".

Texto de estudio:
${textoOriginal}
${bloquePreguntasPrevias(preguntasPrevias)}
Reglas:
- La pregunta y todas las opciones deben basarse solo en lo que dice el texto de estudio, no en conocimiento general de React.
- Exactamente ${OPCIONES_POR_PREGUNTA} opciones por pregunta.
- "indiceCorrecta" debe ser un número entero de 0 a ${OPCIONES_POR_PREGUNTA - 1}.
- Cada pregunta debe evaluar comprensión real, no ser trivial.
- Cada distractor tiene que ser un error PLAUSIBLE (una confusión típica de quien recién aprende), nunca una opción absurda ni descartable por sentido común.
- El array "opciones" de cada pregunta debe tener EXACTAMENTE ${OPCIONES_POR_PREGUNTA} elementos, todos con texto no vacío.
- Las ${PREGUNTAS_POR_LOTE} preguntas deben cubrir aspectos DISTINTOS del subtema, sin reformular la misma idea.

Respondé ÚNICAMENTE con un array JSON: empezás con "[" y terminás con "]". No agregues texto, explicaciones, comentarios ni razonamiento antes ni después, y no uses backticks ni bloques de código.
El array debe tener exactamente ${PREGUNTAS_POR_LOTE} objetos, cada uno con esta forma exacta:
[{"pregunta": "...", "opciones": ["...", "...", "...", "..."], "indiceCorrecta": 0}, {"pregunta": "...", "opciones": ["...", "...", "...", "..."], "indiceCorrecta": 0}, {"pregunta": "...", "opciones": ["...", "...", "...", "..."], "indiceCorrecta": 0}]`
}

// --- API pública ------------------------------------------------------------

export async function extraerSubtemas(
  texto: string,
  modelo: string = MODELO_PRINCIPAL_POR_DEFECTO,
  proveedor?: ProveedorNube
): Promise<string[]> {
  const prompt = construirPromptSubtemas(texto)
  const rawText = await llamarModelo({ prompt, modelo, proveedor })

  const cleanText = recortarEntre(sinBloquesDeCodigo(rawText), "[", "]")

  try {
    const subtemas = JSON.parse(cleanText)
    if (!Array.isArray(subtemas)) {
      throw new Error("La respuesta del modelo no es un array JSON.")
    }
    return (subtemas as unknown[])
      .filter((subtema): subtema is string => typeof subtema === "string" && subtema.trim().length > 0)
      .slice(0, MAX_SUBTEMAS)
  } catch (error) {
    console.error("=== RAW MODEL RESPONSE (extraerSubtemas) ===", rawText)
    throw new Error(
      `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export async function generarPregunta(
  subtema: string,
  textoOriginal: string,
  modelo: string = MODELO_PREGUNTAS_POR_DEFECTO,
  proveedor?: ProveedorNube,
  preguntasPrevias: string[] = []
): Promise<Pregunta> {
  const prompt = construirPromptPregunta(subtema, textoOriginal, preguntasPrevias)
  const respuesta = await llamarModelo({ prompt, modelo, proveedor, esperaObjeto: true })

  try {
    return parsearRespuestaPregunta(respuesta)
  } catch (error) {
    console.error("=== RAW MODEL RESPONSE (generarPregunta) ===", respuesta)
    throw new Error(
      `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Genera el lote de preguntas de un sub-tema en una sola llamada al modelo.
 * `preguntasPrevias` son las que ya se generaron para ese sub-tema: se le pasan al
 * modelo para que un segundo lote no repita el primero (antes solo lo hacía el prompt
 * de pregunta suelta, así que los lotes de un mismo sub-tema podían solaparse).
 */
export async function generarLotePreguntas(
  subtema: string,
  textoOriginal: string,
  modelo: string = MODELO_PREGUNTAS_POR_DEFECTO,
  proveedor?: ProveedorNube,
  preguntasPrevias: string[] = []
): Promise<Pregunta[]> {
  const prompt = construirPromptLotePreguntas(subtema, textoOriginal, preguntasPrevias)

  const intentos = [prompt, prompt]
  let ultimaRespuesta = ""

  for (const intento of intentos) {
    ultimaRespuesta = await llamarModelo({ prompt: intento, modelo, proveedor, esperaObjeto: false })
    try {
      const lote = parsearLotePreguntas(ultimaRespuesta)
      if (lote.length > 0) return lote
    } catch {
      // Un modelo chico a veces devuelve un objeto en vez del array: se pide una vez más.
    }
  }

  console.error("=== RAW MODEL RESPONSE (generarLotePreguntas) ===", ultimaRespuesta)
  throw new Error("Failed to parse model response as JSON: el lote no tiene preguntas válidas")
}

export interface ResultadoSubtema {
  nombre: string;
  intentos: number;
  correctas: number;
  incorrectas: number;
  dominio: number;
  cubierto: boolean;
  /** Falló al menos una vez: es lo que el feedback tiene que nombrar como área a reforzar. */
  debil: boolean;
}

export interface ErrorSesion {
  subtema: string;
  pregunta: string;
  elegida: string;
  correcta: string;
}

/**
 * Feedback final del sondeo. Antes recibía "correctas" = aciertos seguidos, que se
 * resetea en cada error, así que podía decir "0 correctas, 1 incorrecta" después de
 * cinco aciertos. Ahora recibe los contadores reales y, además, qué opción eligió el
 * usuario en cada error: con eso el modelo puede nombrar la confusión concreta en vez
 * de escribir un consejo genérico.
 */
export async function generarFeedbackSondeo(
  resultados: ResultadoSubtema[],
  errores: ErrorSesion[] = [],
  modelo: string = MODELO_PRINCIPAL_POR_DEFECTO,
  proveedor?: ProveedorNube
): Promise<string> {
  const resumen = resultados
    .map((r) => {
      const dominio = Math.round(r.dominio * 100)
      // "Débil" = falló al menos una vez (lo decide esSubtemaDebil en el servidor), no
      // "cubierto hoy": un sub-tema que se dominó después de un error se sigue marcando
      // como área a reforzar.
      const estado = r.debil ? "le falta reforzar" : "dominado"
      return `- ${r.nombre}: ${r.intentos} respuestas, ${r.correctas} correctas, ${r.incorrectas} incorrectas (dominio ${dominio}%) — ${estado}`
    })
    .join("\n")

  const detalleErrores =
    errores.length > 0
      ? `\nErrores concretos, en orden:\n${errores
          .map((e) => `- [${e.subtema}] eligió: "${e.elegida}" | la correcta era: "${e.correcta}"`)
          .join("\n")}\n`
      : ""

  const prompt = `Sos un tutor de React. Un estudiante acaba de terminar un sondeo (quiz de diagnóstico) sobre varios sub-temas. Este es el resultado por sub-tema:

${resumen}
${detalleErrores}
Escribí un feedback breve (3-5 oraciones) en español, directo y útil:
- Destacá qué domina bien.
- Señalá específicamente qué sub-temas necesita reforzar y por qué eso importa en la práctica. Si los errores muestran una confusión concreta entre dos conceptos, nombrá esa confusión.
- No repitas los números tal cual (ya los vio), interpretalos.
- No inventes errores que no estén en la lista de arriba.
- Tono cercano, no genérico ni de manual.
- Escribí en texto plano: sin markdown, sin asteriscos, sin listas ni negritas.
- Solo mencioná como áreas a reforzar los sub-temas marcados "le falta reforzar". Los marcados "dominado" no los presentes como débiles.`

  const respuesta = (await llamarModelo({ prompt, modelo, proveedor, esperaObjeto: false })).trim()

  // Algunos modelos ignoran la consigna de texto plano y devuelven markdown igual: se
  // limpian los asteriscos acá, antes de devolver el feedback (y de que el route lo
  // guarde con finalizarSondeo), para que no lleguen ni a la pantalla ni a la base.
  return respuesta.replace(/\*+/g, "")
}
