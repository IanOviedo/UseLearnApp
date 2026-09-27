import { buscarProveedorPorNombreDeModelo, type ProveedorNube } from "./proveedores"

export async function extraerSubtemas(texto: string, modelo: string = "gemma4:26b"): Promise<string[]> {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      prompt: `Extract the key sub-topics/concepts from the following text. Respond with ONLY a JSON array of short strings, nothing else (example: ["useState básico", "useEffect y dependencias", "props vs state"]).

Text:
${texto}`,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (typeof data.response !== "string") {
    throw new Error(`Unexpected Ollama response shape: ${JSON.stringify(data)}`);
  }

  const rawText = data.response.trim();

  let cleanText = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const firstBracket = cleanText.indexOf("[");
  const lastBracket = cleanText.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    cleanText = cleanText.slice(firstBracket, lastBracket + 1);
  }

  try {
    const subtemas = JSON.parse(cleanText);
    if (!Array.isArray(subtemas)) {
      throw new Error("The model response is not a JSON array.");
    }
    return subtemas as string[];
  } catch (error) {
    console.error("=== RAW MODEL RESPONSE (extraerSubtemas) ===", rawText);
    throw new Error(
      `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export interface Pregunta {
  pregunta: string;
  opciones: string[];
  indiceCorrecta: number;
}

function construirPromptPregunta(
  subtema: string,
  textoOriginal: string,
  preguntasPrevias: string[] = []
): string {
  const bloqueHistorial = preguntasPrevias.length > 0
    ? `\nPreguntas ya generadas para este subtema en esta sesión (NO las repitas ni las reformules — generá una que explore un aspecto, ejemplo o ángulo distinto del concepto):\n${preguntasPrevias.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n`
    : "";
  console.log(`[construirPromptPregunta] subtema="${subtema}" preguntasPrevias=${preguntasPrevias.length}`);
  return `Sos un asistente que genera preguntas de opción múltiple ÚNICAMENTE a partir del siguiente texto de estudio. No uses conocimiento externo ni inventes información que no esté en el texto.

Texto de estudio:
"""
${textoOriginal}
"""

Generá UNA pregunta de opción múltiple sobre el sub-tema "${subtema}", basada estrictamente en el contenido del texto de arriba.

Anterior a responder, pensá paso a paso (en texto plano, sin llaves { }):
1. Redactá las 4 opciones.
2. Para cada opción, decidí explícitamente si es verdadera o falsa según el texto, y por qué.
3. Si la pregunta compara dos cosas (por ejemplo React vs Vanilla JavaScript, o dos conceptos distintos), revisá con cuidado a cuál de los dos le corresponde cada característica antes de decidir — es un error común confundir cuál de los dos hace qué.
4. Recién ahí, elegí el índice de la opción que tu propio análisis marcó como verdadera.

Después de ese razonamiento en texto plano, en una línea aparte escribí exactamente "RESPUESTA:" seguido ÚNICAMENTE del objeto JSON con esta forma exacta, nada más:
{"pregunta": "texto de la pregunta", "opciones": ["opción A", "opción B", "opción C", "opción D"], "indiceCorrecta": 0}

${bloqueHistorial}Reglas:
- La pregunta y todas las opciones deben basarse solo en lo que dice el texto de estudio, no en conocimiento general de React.
- Exactamente 4 opciones.
- "indiceCorrecta" debe ser un número entero de 0 a 3, correspondiente a tu propio razonamiento del paso 4.
- La pregunta debe evaluar comprensión real, no ser trivial.
- El array "opciones" debe tener EXACTAMENTE 4 elementos, todos con texto no vacío. No agregues elementos extra ni strings vacíos.`;
}

function limpiarOpcion(texto: string): string {
  return texto
    .replace(/^(opci[oó]n\s*)?[a-d][.):]\s*/i, "")
    .trim();
}

function parsearRespuestaPregunta(rawText: string): Pregunta {
  let cleanText = rawText.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanText = cleanText.slice(firstBrace, lastBrace + 1);
  }

  const parsed = JSON.parse(cleanText);

  if (Array.isArray(parsed.opciones)) {
    parsed.opciones = parsed.opciones.filter(
      (o: unknown) => typeof o === "string" && o.trim().length > 0
    );
  }

  if (
    typeof parsed.pregunta !== "string" ||
    !Array.isArray(parsed.opciones) ||
    parsed.opciones.length !== 4 ||
    !Number.isInteger(parsed.indiceCorrecta) ||
    parsed.indiceCorrecta < 0 ||
    parsed.indiceCorrecta >= parsed.opciones.length
  ) {
    throw new Error(`Estructura inválida: ${JSON.stringify(parsed)}`);
  }

  parsed.opciones = parsed.opciones.map(limpiarOpcion);

  return parsed as Pregunta;
}

async function fetchGeminiConReintento(url: string, body: string): Promise<Response> {
  const primero = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (primero.status === 503 || primero.status === 429) {
    const espera = primero.status === 429 ? 15000 : 2000;
    await new Promise((resolve) => setTimeout(resolve, espera));
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  }

  return primero;
}

async function generarPreguntaGemini(
  subtema: string,
  textoOriginal: string,
  preguntasPrevias: string[] = []
): Promise<Pregunta> {
  const prompt = construirPromptPregunta(subtema, textoOriginal, preguntasPrevias);

  const response = await fetchGeminiConReintento(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${process.env.GEMINI_API_KEY}`,
    JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0 },
    })
  );

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error(
        "Se alcanzó el límite de uso gratuito de Gemini por hoy. Probá con un modelo local, o esperá a mañana."
      );
    }
    throw new Error(`Gemini API error: ${response.statusText}`);
  }

  const data = await response.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (typeof rawText !== "string") {
    throw new Error(`Unexpected Gemini response shape: ${JSON.stringify(data)}`);
  }

  try {
    return parsearRespuestaPregunta(rawText);
  } catch (error) {
    console.error("=== RAW MODEL RESPONSE (generarPreguntaGemini) ===", rawText);
    throw new Error(
      `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function generarPreguntaOllama(
  subtema: string,
  textoOriginal: string,
  modelo: string,
  preguntasPrevias: string[] = []
): Promise<Pregunta> {
  const prompt = construirPromptPregunta(subtema, textoOriginal, preguntasPrevias);

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (typeof data.response !== "string") {
    throw new Error(`Unexpected Ollama response shape: ${JSON.stringify(data)}`);
  }

  try {
    return parsearRespuestaPregunta(data.response);
  } catch (error) {
    console.error("=== RAW MODEL RESPONSE (generarPreguntaOllama) ===", data.response);
    throw new Error(
      `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function generarPreguntaOpenAICompat(
  subtema: string,
  textoOriginal: string,
  proveedor: ProveedorNube,
  preguntasPrevias: string[] = []
): Promise<Pregunta> {
  const prompt = construirPromptPregunta(subtema, textoOriginal, preguntasPrevias);

  const res = await fetch(`${proveedor.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${proveedor.apiKey}`,
    },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const textoError = await res.text();
    throw new Error(
      `Error de ${proveedor.nombre} (${res.status}): ${textoError}`
    );
  }

  const data = await res.json();
  const contenido = data.choices[0].message.content;
  return parsearRespuestaPregunta(contenido);
}


export async function generarPregunta(
  subtema: string,
  textoOriginal: string,
  modelo: string = "gemma4:26b",
  proveedorInfo?: ProveedorNube,
  preguntasPrevias: string[] = []
): Promise<Pregunta> {
  if (proveedorInfo) {
    return generarPreguntaOpenAICompat(subtema, textoOriginal, proveedorInfo, preguntasPrevias);
  }

  const proveedorConfigurado = buscarProveedorPorNombreDeModelo(modelo);
  if (proveedorConfigurado) {
    return generarPreguntaOpenAICompat(subtema, textoOriginal, proveedorConfigurado, preguntasPrevias);
  }

  if (modelo.startsWith("gemini")) {
    return generarPreguntaGemini(subtema, textoOriginal, preguntasPrevias);
  }
  return generarPreguntaOllama(subtema, textoOriginal, modelo, preguntasPrevias);
}

export interface ResultadoSubtema {
  nombre: string;
  correctas: number;
  incorrectas: number;
  cubierto: boolean;
}

export async function generarFeedbackSondeo(
  resultados: ResultadoSubtema[],
  modelo: string = "gemma4:26b"
): Promise<string> {
  const resumen = resultados
    .map(
      (r) =>
        `- ${r.nombre}: ${r.correctas} correctas, ${r.incorrectas} incorrectas${r.cubierto ? " (dominado)" : " (débil)"}`
    )
    .join("\n");

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelo,
      prompt: `Sos un tutor de React. Un estudiante acaba de terminar un sondeo (quiz de diagnóstico) sobre varios sub-temas. Este es el resultado por sub-tema:

${resumen}

Escribí un feedback breve (3-5 oraciones) en español, directo y útil:
- Destacá qué domina bien.
- Señalá específicamente qué sub-temas necesita reforzar y por qué eso importa en la práctica.
- No repitas los números tal cual (ya los vio), interpretalos.
- Tono cercano, no genérico ni de manual.`,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (typeof data.response !== "string") {
    throw new Error(`Unexpected Ollama response shape: ${JSON.stringify(data)}`);
  }

  return data.response.trim();
}
