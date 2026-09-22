// app/api/chat/generar-pregunta/route.ts
import type { NextRequest } from 'next/server';
import { guardarMensajeTipado, actualizarTopicSiVacio } from '@/lib/db/queries';
import { fetchOllama } from '@/lib/ollama';

export const runtime = 'nodejs';

/**
 * Generates a comprehension question based on the provided content.
 * The request body should contain:
 *   sessionId: number
 *   contenido: string
 *   modelo: string
 *
 * Returns a JSON object { pregunta: <parsedObject> }.
 * If the model response cannot be parsed as JSON, returns { error: "No se pudo generar la pregunta, intentá de nuevo" }.
 */
export async function POST(request: NextRequest) {
  const { sessionId, contenido, modelo } = await request.json();

  // Construct prompt for the model
  const prompt = `Generá exactamente 8 preguntas distintas entre sí (ni la redacción ni el concepto evaluado se debe repetir) sobre el contenido siguiente:\n\n${contenido}\n\nDecide si la respuesta debe ser de opción múltiple o de texto libre y responde *únicamente* con un array JSON de 8 objetos, sin texto adicional antes ni después.\n\nCada objeto debe tener la forma:\n- Si es opción múltiple: {"formato": "multiple_choice", "pregunta": "...", "opciones": ["...", "...", "...", "..."], "respuesta_correcta": "..."}\n- Si es texto libre: {"formato": "libre", "pregunta": "..."}`;

  try {
  const respuesta = await fetchOllama(modelo, prompt);
  let preguntasArray: any;
  try {
    preguntasArray = JSON.parse(respuesta);
  } catch {
    return new Response(
      JSON.stringify({ error: "No se pudo generar la pregunta, intentá de nuevo" }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  if (!Array.isArray(preguntasArray) || preguntasArray.length !== 8) {
    return new Response(
      JSON.stringify({ error: "No se pudo generar la pregunta, intentá de nuevo" }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Update topic if not set
  await actualizarTopicSiVacio(sessionId, contenido);

  // Store each question
  for (const pregunta of preguntasArray) {
    await guardarMensajeTipado(sessionId, 'assistant', JSON.stringify(pregunta), 'pregunta');
  }

  return new Response(JSON.stringify({ preguntas: preguntasArray }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
} catch (err) {
  return new Response(
    JSON.stringify({ error: "No se pudo generar la pregunta, intentá de nuevo" }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
}
}
