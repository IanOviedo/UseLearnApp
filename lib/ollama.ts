export async function extraerSubtemas(texto: string, modelo: string = "gemma4:26b"): Promise<string[]> {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  respuestaCorrecta: string;
}

export async function generarPregunta(
  subtema: string,
  textoOriginal: string,
  modelo: string = "gemma4:26b"
): Promise<Pregunta> {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelo,
      prompt: `Sos un asistente que genera preguntas de opción múltiple ÚNICAMENTE a partir del siguiente texto de estudio. No uses conocimiento externo ni inventes información que no esté en el texto.

Texto de estudio:
"""
${textoOriginal}
"""

Generá UNA pregunta de opción múltiple sobre el sub-tema "${subtema}", basada estrictamente en el contenido del texto de arriba.

Respondé ÚNICAMENTE con un objeto JSON con esta forma exacta, nada más:
{"pregunta": "texto de la pregunta", "opciones": ["opción A", "opción B", "opción C", "opción D"], "respuestaCorrecta": "opción A"}

Reglas:
- La pregunta y todas las opciones deben basarse solo en lo que dice el texto de estudio, no en conocimiento general de React.
- Exactamente 4 opciones.
- "respuestaCorrecta" debe ser el texto exacto de una de las opciones (copiado literal).
- La pregunta debe evaluar comprensión real, no ser trivial.`,
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

  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleanText = cleanText.slice(firstBrace, lastBrace + 1);
  }

  try {
    const parsed = JSON.parse(cleanText);

    if (
      typeof parsed.pregunta !== "string" ||
      !Array.isArray(parsed.opciones) ||
      parsed.opciones.length !== 4 ||
      typeof parsed.respuestaCorrecta !== "string" ||
      !parsed.opciones.includes(parsed.respuestaCorrecta)
    ) {
      throw new Error(
        `Estructura inválida: ${JSON.stringify(parsed)}`
      );
    }

    return parsed as Pregunta;
  } catch (error) {
    console.error("=== RAW MODEL RESPONSE (generarPregunta) ===", rawText);
    throw new Error(
      `Failed to parse model response as JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
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
        `- ${r.nombre}: ${r.correctas} correctas, ${r.incorrectas} incorrectas${
          r.cubierto ? " (dominado)" : " (débil)"
        }`
    )
    .join("\n");

  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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