import {
  ajustesDePreset,
  CHARS_POR_SUBTEMA,
  EXCERPT_MAX_CHARS,
  MODELO_GEMINI,
  MODELO_NUBE_POR_DEFECTO,
  MODELO_PREGUNTAS_POR_DEFECTO,
  MODELO_PRINCIPAL_POR_DEFECTO,
  NUM_PREDICT_APUNTE,
  NUM_PREDICT_FEEDBACK,
  NUM_PREDICT_LOTE,
  NUM_PREDICT_SUBTEMAS,
  OLLAMA_KEEP_ALIVE,
  OLLAMA_NUM_CTX,
  OPCIONES_POR_PREGUNTA,
  PREGUNTAS_POR_LOTE,
  TEMPERATURA_JSON,
  URL_GEMINI,
} from "./config"
import type { ProveedorNube } from "./proveedores"
import type { Pregunta } from "./tipos"
import {
  deduplicarPorSimilitud,
  dividirEnBloques,
  extraerExcerpt,
  ordenarPorAparicion,
  tokensSignificativos,
} from "./texto"

// --- Gateway de modelos -----------------------------------------------------
//
// Único punto de entrada a cualquier modelo. Antes cada función (pregunta suelta,
// lote, feedback, extracción de sub-temas) repetía los tres caminos de proveedor,
// así que agregar una feature nueva obligaba a reescribir la capa de transporte tres
// veces. Además `generarFeedbackSondeo` y `extraerSubtemas` llamaban a Ollama directo,
// por lo que el selector de modelo de la pantalla de Ajustes no las afectaba.

export interface OpcionesModelo {
  prompt: string;
  modelo: string;
  proveedor?: ProveedorNube;
  /**
   * La respuesta esperada es un objeto JSON: activa `response_format: json_object` en
   * OpenAI-compatible y `format: "json"` en Ollama. Con false se pide texto plano.
   */
  esperaObjeto?: boolean;
  /** Topa los tokens generados: corta la verborragia de raíz (modelos grandes). */
  numPredict?: number;
  /** Esquema JSON para /api/generate: el modelo rellena campos, no inventa formato. */
  esquema?: Record<string, unknown>;
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

interface OpcionesOllama {
  modelo: string;
  prompt: string;
  numPredict?: number;
  esquema?: Record<string, unknown>;
  /**
   * Solo cuando la respuesta tiene que ser JSON. `format: "json"` obliga al modelo a
   * devolver un objeto, así que pedir prosa con ese flag devuelve `{"feedback": "..."}`:
   * exactamente lo que se estaba guardando como feedback final del sondeo.
   */
  esperaObjeto?: boolean;
}

async function llamarOllama({
  modelo,
  prompt,
  numPredict,
  esquema,
  esperaObjeto = false,
}: OpcionesOllama): Promise<string> {
  // Fase B.8 — format + options + keep_alive en UNA llamada:
  // - format=json|schema → el modelo rellena campos, no improvisa llaves/comas
  //   (adiós reintentos por parseo roto, que duplicaban el tiempo con 26b).
  // - options num_ctx acotado + num_predict topado + temperature baja →
  //   menos VRAM, corte temprano si divaga, JSON determinista.
  // - keep_alive=30m → el 2º lote no recarga los 26b en VRAM (era ~mitad del wait).
  // - think=false → sin tokens de razonamiento basura (velocidad pura).
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      prompt,
      stream: false,
      think: false,
      keep_alive: OLLAMA_KEEP_ALIVE,
      // `format` SOLO cuando el llamador espera JSON: antes cualquier llamada sin esquema
      // salía con format:"json" y el feedback en prosa volvía envuelto en
      // {"feedback": "..."} — el plan mostraba JSON crudo en pantalla.
      ...(esquema ? { format: esquema } : esperaObjeto ? { format: "json" } : {}),
      options: {
        temperature: TEMPERATURA_JSON,
        num_ctx: OLLAMA_NUM_CTX,
        ...(typeof numPredict === "number" ? { num_predict: numPredict } : {}),
      },
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
export async function llamarModelo({ prompt, modelo, proveedor, esperaObjeto = false, numPredict, esquema }: OpcionesModelo): Promise<string> {
  if (proveedor) {
    return proveedor.formato === "gemini-nativo"
      ? llamarGeminiNativo(prompt, proveedor)
      : llamarOpenAICompat(prompt, proveedor, esperaObjeto)
  }

  if (esModeloGemini(modelo)) {
    return llamarGeminiNativo(prompt)
  }

  return llamarOllama({ modelo, prompt, numPredict, esquema, esperaObjeto })
}

// --- Parseo -----------------------------------------------------------------

function limpiarOpcion(texto: string): string {
  return texto.replace(/^(opci[oó]n\s*)?[a-d][.):]\s*/i, "").trim()
}

export function sinBloquesDeCodigo(rawText: string): string {
  return rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
}

/** Se queda solo con lo que hay entre el primer y el último par de delimitadores. */
export function recortarEntre(texto: string, apertura: string, cierre: string): string {
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

/**
 * Llamadas de extracción de sub-temas en paralelo: 2 alcanza para cubrir un documento
 * grande sin pelearse con el pedido en primer plano (la GPU es una sola).
 */
const SUBTEMAS_CONCURRENCIA = 2

/**
 * Prompt de extracción por bloque. Antes se mandaba solo el head de 3.5k chars, así que
 * en un apunte largo el modelo nunca veía el final y los sub-temas salían todos del
 * principio (y encima pocos). Ahora el texto se parte en bloques y cada llamada sabe qué
 * fragmento mira, cuántos bloques hay y qué se le pide exactamente.
 */
export function construirPromptSubtemas(
  bloque: string,
  opts: { indice: number; total: number; maxPorBloque: number }
): string {
  const contexto =
    opts.total > 1
      ? `Este es el fragmento ${opts.indice} de ${opts.total} del material: mirá SOLO este fragmento.`
      : "Este es el material completo."
  return `TEXTO:
"""
${bloque}
"""

TAREA: Extraé hasta ${opts.maxPorBloque} sub-temas de estudio de ESTE fragmento. ${contexto}
Reglas:
- Cada sub-tema es UN concepto evaluable por separado (nada de títulos generales del documento ni "introducción").
- Entre 2 y 6 palabras, en español, con los términos que usa el texto.
- Prohibido repetir o reformular lo mismo: si dos candidatos se estudian con el mismo fragmento del texto, es UN sub-tema, no dos. Nada de variantes con sinónimos.
- Es mejor devolver menos sub-temas que rellenar con sinónimos: si el fragmento no da para ${opts.maxPorBloque}, devolvé solo los que se sostienen.
- No inventes conceptos que no estén en el fragmento.
Respondé SOLO con un array JSON de strings.`
}

/**
 * Pasada de cobertura: se usa cuando los bloques no alcanzaron para el objetivo del
 * preset. Mira el inicio y el final del documento (el final es justo lo que la versión
 * anterior nunca leía) y pide conceptos que NO estén ya en la lista.
 */
export function construirPromptSubtemasCobertura(opts: {
  fuente: string
  yaDetectados: string[]
  cuantos: number
}): string {
  const ya =
    opts.yaDetectados.length > 0
      ? `\nSub-temas YA detectados (no los repitas ni los reformules):\n${opts.yaDetectados
          .map((subtema, i) => `${i + 1}. ${subtema}`)
          .join("\n")}\n`
      : ""
  return `TEXTO (inicio y final del material):
"""
${opts.fuente}
"""
${ya}
TAREA: Mirá el material y listá hasta ${opts.cuantos} conceptos importantes que NO estén en la lista de arriba.
- Entre 2 y 6 palabras, en español, con los términos del texto.
- Tienen que ser evaluables por separado (nada de títulos generales) y distintos entre sí: nada de variantes con sinónimos del mismo concepto.
Respondé SOLO con un array JSON de strings. Si no hay conceptos nuevos, respondé [].`
}

/** Inicio + final del documento: barato y cubre el extremo que antes se perdía. */
function fuenteParaCobertura(texto: string): string {
  const limpio = texto.replace(/\r/g, "").trim()
  if (limpio.length <= 3200) return limpio
  return `${limpio.slice(0, 1300).trim()}\n...\n${limpio.slice(-1800).trim()}`
}

/** Lista anti-repetición para el prompt de lote (solo enunciados, sin JSON). */
function bloquePreguntasPrevias(preguntasPrevias: string[]): string {
  if (preguntasPrevias.length === 0) return ""

  return `\nPreguntas ya generadas para este subtema en esta sesión (NO las repitas ni las reformules — cada pregunta nueva tiene que explorar un aspecto, ejemplo o ángulo distinto):\n${preguntasPrevias
    .map((pregunta, i) => `${i + 1}. ${pregunta}`)
    .join("\n")}\n`
}

export function construirPromptLotePreguntas(
  subtema: string,
  textoOriginal: string,
  preguntasPrevias: string[] = []
): string {
  // Fase B.8+9 — TEXTO primero (prefix caching en Ollama) + excerpt (~1.8k) en vez
  // del documento entero (~50k de un PDF). El 26b pasa de minutos a segundos.
  const excerpt = extraerExcerpt(textoOriginal, subtema, EXCERPT_MAX_CHARS)
  return `TEXTO:
"""
${excerpt}
"""
${bloquePreguntasPrevias(preguntasPrevias)}
TAREA: Generá EXACTAMENTE ${PREGUNTAS_POR_LOTE} preguntas de opción múltiple sobre "${subtema}", basadas estrictamente en el TEXTO de arriba.
Reglas: exactamente ${OPCIONES_POR_PREGUNTA} opciones por pregunta; "indiceCorrecta" entero de 0 a ${OPCIONES_POR_PREGUNTA - 1}; distractores plausibles (confusiones típicas, nunca absurdos); las ${PREGUNTAS_POR_LOTE} cubren aspectos DISTINTOS.
Respondé SOLO con el array JSON, sin texto antes ni después.`
}

// --- API pública ------------------------------------------------------------

/** Esquema JSON del lote: Ollama obliga al modelo a rellenar campos válidos. */
const ESQUEMA_LOTE = {
  type: "array",
  items: {
    type: "object",
    properties: {
      pregunta: { type: "string" },
      opciones: { type: "array", items: { type: "string" } },
      indiceCorrecta: { type: "integer" },
    },
    required: ["pregunta", "opciones", "indiceCorrecta"],
  },
} as Record<string, unknown>

/** Esquema JSON de subtemas: array plano de strings. */
const ESQUEMA_SUBTEMAS = {
  type: "array",
  items: { type: "string" },
} as Record<string, unknown>

/** Limpia un sub-tema crudo del modelo: sin numeración ni comillas, tope de 6 palabras. */
function limpiarSubtema(crudo: string): string {
  const sinRuido = crudo
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const palabras = sinRuido.split(" ")
  return palabras.length > 6 ? palabras.slice(0, 6).join(" ") : sinRuido
}

/** Parsea la respuesta como lista de sub-temas limpios. Tira si el JSON no es un array. */
function parsearListaSubtemas(rawText: string): string[] {
  const limpio = recortarEntre(sinBloquesDeCodigo(rawText), "[", "]")
  const parsed = JSON.parse(limpio)
  if (!Array.isArray(parsed)) {
    throw new Error("La respuesta del modelo no es un array JSON.")
  }
  return (parsed as unknown[])
    .filter((subtema): subtema is string => typeof subtema === "string")
    .map(limpiarSubtema)
    .filter((subtema) => subtema.length > 1 && tokensSignificativos(subtema).length > 0)
}

/** Una llamada de extracción. El prompt lo arma el llamador (bloque o cobertura). */
async function pedirSubtemas(args: {
  prompt: string
  modelo: string
  proveedor?: ProveedorNube
}): Promise<string[]> {
  const rawText = await llamarModelo({
    prompt: args.prompt,
    modelo: args.modelo,
    proveedor: args.proveedor,
    numPredict: NUM_PREDICT_SUBTEMAS,
    esquema: ESQUEMA_SUBTEMAS,
  })
  try {
    return parsearListaSubtemas(rawText)
  } catch (error) {
    console.error("=== RAW MODEL RESPONSE (extraerSubtemas) ===", rawText)
    throw error
  }
}

/** Corre `fn` sobre todos los items con un tope de llamadas en paralelo (la GPU es una). */
async function mapearConLimite<T, R>(
  items: T[],
  limite: number,
  fn: (item: T, indice: number) => Promise<R>
): Promise<R[]> {
  const resultados: R[] = new Array(items.length)
  let proximo = 0
  const trabajadores = Array.from(
    { length: Math.max(1, Math.min(limite, items.length)) },
    async () => {
      for (let indice = proximo++; indice < items.length; indice = proximo++) {
        resultados[indice] = await fn(items[indice], indice)
      }
    }
  )
  await Promise.all(trabajadores)
  return resultados
}

export interface ResultadoSubtemas {
  subtemas: string[]
  /** Bloques en los que se analizó el texto (1 = entró completo en una sola pasada). */
  bloques: number
}

/**
 * Extrae los sub-temas del material. El trabajo se reparte por bloques para que el final
 * del documento también cuente (antes solo se miraba el head y de ahí salían pocos
 * sub-temas, todos del principio) y, si quedan menos que el objetivo del preset, se hace
 * una pasada de cobertura sobre el inicio y el final. Los duplicados se descartan por
 * similitud y el orden final sigue la aparición en el texto.
 */
export async function extraerSubtemas(
  texto: string,
  modelo: string = MODELO_PRINCIPAL_POR_DEFECTO,
  proveedor?: ProveedorNube,
  preset?: string
): Promise<ResultadoSubtemas> {
  const ajustes = ajustesDePreset(preset)
  const bloques = dividirEnBloques(texto, ajustes.subtemasBloqueChars, ajustes.subtemasMaxBloques)
  if (bloques.length === 0) return { subtemas: [], bloques: 0 }

  // Cuántos sub-temas "sostiene" el material: pedir 10 para 400 caracteres obliga al modelo
  // a inventar variantes del mismo concepto, que es la repetición que queremos evitar.
  const objetivoTotal = Math.max(
    3,
    Math.min(ajustes.maxSubtemas, Math.ceil(texto.length / CHARS_POR_SUBTEMA))
  )

  // Con un solo bloque se pide el objetivo completo; repartido, cada bloque aporta una parte.
  const porBloque = await mapearConLimite(bloques, SUBTEMAS_CONCURRENCIA, async (bloque, indice) => {
    const objetivoBloque =
      bloques.length === 1
        ? objetivoTotal
        : Math.max(2, Math.min(ajustes.maxSubtemasPorBloque, Math.ceil(bloque.length / CHARS_POR_SUBTEMA)))
    try {
      return await pedirSubtemas({
        prompt: construirPromptSubtemas(bloque, {
          indice: indice + 1,
          total: bloques.length,
          maxPorBloque: objetivoBloque,
        }),
        modelo,
        proveedor,
      })
    } catch (error) {
      // Un bloque que falla no puede tirar abajo la creación de la sesión.
      console.error(`[subtemas] falló el bloque ${indice + 1}/${bloques.length}:`, error)
      return [] as string[]
    }
  })

  const candidatos = porBloque.flat()
  let unicos = deduplicarPorSimilitud(candidatos, (subtema) => subtema)

  if (bloques.length > 1) {
    for (let intento = 0; intento < ajustes.intentosCobertura; intento++) {
      if (unicos.length >= objetivoTotal) break
      const antes = unicos.length
      try {
        const nuevos = await pedirSubtemas({
          prompt: construirPromptSubtemasCobertura({
            fuente: fuenteParaCobertura(texto),
            yaDetectados: unicos,
            cuantos: Math.max(1, objetivoTotal - unicos.length),
          }),
          modelo,
          proveedor,
        })
        unicos = deduplicarPorSimilitud([...unicos, ...nuevos], (subtema) => subtema)
      } catch (error) {
        console.error("[subtemas] falló la pasada de cobertura:", error)
        break
      }
      // Si la pasada no aportó nada nuevo, no tiene sentido repetirla.
      if (unicos.length === antes) break
    }
  }

  const subtemas = ordenarPorAparicion(unicos, texto, (subtema) => subtema).slice(0, ajustes.maxSubtemas)

  // Diagnóstico honesto: material largo con pocos sub-temas significa que hay que mirarlo.
  if (bloques.length > 1 && subtemas.length < Math.min(5, ajustes.maxSubtemas)) {
    console.warn(
      `[subtemas] el material se partió en ${bloques.length} bloques y solo salieron ${subtemas.length} sub-temas`
    )
  }

  return { subtemas, bloques: bloques.length }
}

// --- Fase C1: apunte sintético (modalidad "tema libre") ----------------------

/** Apunte generado por el modelo: es el `texto_original` de la sesión. */
export interface ApunteGenerado {
  titulo: string;
  apunte: string;
}

/** Esquema JSON del apunte: Ollama rellena campos, no improvisa el formato. */
const ESQUEMA_APUNTE = {
  type: "object",
  properties: {
    titulo: { type: "string" },
    apunte: { type: "string" },
  },
  required: ["titulo", "apunte"],
} as Record<string, unknown>;

export function construirPromptApunteTema(tema: string, nivel: string, objetivo?: string): string {
  const objetivoLinea = objetivo?.trim() ? `\nOBJETIVO DEL ESTUDIANTE: ${objetivo.trim()}\n` : "";
  return `TEMA: ${tema.trim()}
NIVEL: ${nivel}${objetivoLinea}
TAREA: Escribí un apunte de estudio en español sobre el TEMA. Va a ser la fuente ÚNICA de un quiz de diagnóstico (si algo no está en el apunte, no se va a poder preguntar), así que tiene que cubrir el tema por completo.
Reglas:
- Autocontenido: definiciones claras, diferencias entre conceptos, ejemplos concretos y errores típicos.
- Ajustá la profundidad al NIVEL y, si hay OBJETIVO, orientá el apunte hacia eso.
- Entre 8 y 12 párrafos (unas 800-1100 palabras), separados por una línea en blanco.
- Texto plano: sin markdown, sin #, sin asteriscos, sin listas con guiones.
- No menciones que sos una IA ni que esto es un texto generado.
Respondé SOLO con un objeto JSON con dos campos: "titulo" (4 a 8 palabras en español) y "apunte" (el texto completo).`;
}

/**
 * Parsea la respuesta del apunte. Con esquema el JSON de Ollama sale válido, pero los
 * proveedores de nube y Gemini no reciben el esquema y devuelven prosa: en ese caso se
 * usa el texto tal cual (el título queda en el tema pedido) en vez de romper la creación.
 */
function parsearApunte(rawText: string, tema: string): ApunteGenerado {
  const limpio = recortarEntre(sinBloquesDeCodigo(rawText), "{", "}")

  try {
    const parsed = JSON.parse(limpio) as { titulo?: unknown; apunte?: unknown }
    if (typeof parsed.titulo === "string" && typeof parsed.apunte === "string" && parsed.apunte.trim().length > 0) {
      return { titulo: parsed.titulo.trim(), apunte: parsed.apunte.trim() }
    }
    // JSON legible pero con otra forma: es un error del modelo, no prosa.
    throw new Error(`Estructura de apunte inválida: ${limpio.slice(0, 200)}`)
  } catch (error) {
    const prosa = limpio.trim()
    if (prosa.length > 0 && !(error instanceof SyntaxError)) throw error
    if (prosa.length > 0) return { titulo: tema.trim(), apunte: prosa }
    throw new Error("El modelo no devolvió un apunte legible")
  }
}

/**
 * Fase C1 — genera el apunte de estudio de la modalidad "tema libre". El apunte se guarda
 * como `texto_original` y de ahí en adelante el pipeline es idéntico al modo apunte
 * (sub-temas, excerpts, preguntas con cita), así que la modalidad nueva no duplica nada.
 */
export async function generarApunteDeTema(
  tema: string,
  nivel: string = "intermedio",
  objetivo?: string,
  modelo: string = MODELO_PRINCIPAL_POR_DEFECTO,
  proveedor?: ProveedorNube
): Promise<ApunteGenerado> {
  const prompt = construirPromptApunteTema(tema, nivel, objetivo)
  const rawText = await llamarModelo({
    prompt,
    modelo,
    proveedor,
    numPredict: NUM_PREDICT_APUNTE,
    esquema: ESQUEMA_APUNTE,
  })
  return parsearApunte(rawText, tema)
}

export async function generarPregunta(
  subtema: string,
  textoOriginal: string,
  modelo: string = MODELO_PREGUNTAS_POR_DEFECTO,
  proveedor?: ProveedorNube,
  preguntasPrevias: string[] = []
): Promise<Pregunta> {
  // Fase B — se eliminó el camino de "pregunta suelta": ahora delega en el lote y
  // devuelve la primera. Queda solo por compatibilidad (ya nadie lo importa).
  const lote = await generarLotePreguntas(subtema, textoOriginal, modelo, proveedor, preguntasPrevias)
  const primera = lote[0]
  if (!primera) throw new Error("El modelo no devolvió preguntas")
  return primera
}

/**
 * Genera el lote de preguntas de un sub-tema en UNA sola llamada al modelo.
 * `preguntasPrevias` son las que ya se generaron para ese sub-tema: se le pasan al
 * modelo para que un segundo lote no repita el primero. Con format=schema el JSON
 * sale válido a la primera, así que no se reintenta (antes eran 2 llamadas que
 * duplicaban el tiempo con gemma4:26b ante cualquier coma fuera de lugar).
 */
export async function generarLotePreguntas(
  subtema: string,
  textoOriginal: string,
  modelo: string = MODELO_PREGUNTAS_POR_DEFECTO,
  proveedor?: ProveedorNube,
  preguntasPrevias: string[] = []
): Promise<Pregunta[]> {
  const prompt = construirPromptLotePreguntas(subtema, textoOriginal, preguntasPrevias)
  const respuesta = await llamarModelo({
    prompt,
    modelo,
    proveedor,
    esperaObjeto: false,
    numPredict: NUM_PREDICT_LOTE,
    esquema: ESQUEMA_LOTE,
  })

  try {
    const lote = parsearLotePreguntas(respuesta)
    if (lote.length > 0) return lote
  } catch {
    // El schema ya fuerza el formato: si igual falla, se loguea y se corta.
  }

  console.error("=== RAW MODEL RESPONSE (generarLotePreguntas) ===", respuesta)
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

  // Sub-temas que el sondeo no llegó a preguntar (0 intentos): sin esto el feedback podía
  // dar por dominado todo el material aunque el sondeo se hubiera cerrado antes (tope de
  // seguridad o sub-temas que nunca se sirvieron).
  const sinEvaluar = resultados.filter((r) => r.intentos === 0).map((r) => r.nombre)
  const notaSinEvaluar =
    sinEvaluar.length > 0
      ? `\nSub-temas que NO se llegaron a evaluar (no los presentes como dominados: decí que quedaron pendientes): ${sinEvaluar.join(", ")}.\n`
      : ""

  const prompt = `Sos un tutor de React. Un estudiante acaba de terminar un sondeo (quiz de diagnóstico) sobre varios sub-temas. Este es el resultado por sub-tema:

${resumen}
${detalleErrores}${notaSinEvaluar}
Escribí un feedback breve (3-5 oraciones) en español, directo y útil:
- Destacá qué domina bien.
- Señalá específicamente qué sub-temas necesita reforzar y por qué eso importa en la práctica. Si los errores muestran una confusión concreta entre dos conceptos, nombrá esa confusión.
- No repitas los números tal cual (ya los vio), interpretalos.
- No inventes errores que no estén en la lista de arriba.
- Tono cercano, no genérico ni de manual.
- Escribí en texto plano: sin markdown, sin asteriscos, sin listas ni negritas.
- Solo mencioná como áreas a reforzar los sub-temas marcados "le falta reforzar". Los marcados "dominado" no los presentes como débiles.`

  // num_predict topado: el feedback son 3-5 oraciones, no necesita más. Sin tope,
  // un modelo grande que divaga puede tardar minutos en cerrarse.
  const respuesta = (
    await llamarModelo({
      prompt,
      modelo,
      proveedor,
      esperaObjeto: false,
      numPredict: NUM_PREDICT_FEEDBACK,
    })
  ).trim()

  // Algunos modelos ignoran la consigna de texto plano y devuelven markdown igual: se
  // limpian los asteriscos acá, antes de devolver el feedback (y de que el route lo
  // guarde con finalizarSondeo), para que no lleguen ni a la pantalla ni a la base.
  return respuesta.replace(/\*+/g, "")
}
