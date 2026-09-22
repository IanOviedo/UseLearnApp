// app/api/chat/generar-pregunta/route.ts
import type { NextRequest } from 'next/server';
import { guardarMensajeTipado } from '@/lib/db/queries';
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
  const prompt = `Genera una pregunta de comprensión sobre el siguiente contenido:\n\n${contenido}\n\nDecide si la respuesta debe ser de opción múltiple o de texto libre y responde *únicamente* con JSON en el siguiente formato:\n\nSi es múltiple elección: {"formato": "multiple_choice", "pregunta": "...", "opciones": ["...", "...", "...", "..."], "respuesta_correcta": "..."}\n\nSi es texto libre: {"formato": "libre", "pregunta": "..."}`;

  try {
    const respuesta = await fetchOllama(modelo, prompt);
    let preguntaObj: any;
    try {
      preguntaObj = JSON.parse(respuesta);
    } catch {
      // If parsing fails, return error response
      return new Response(
        JSON.stringify({ error: "No se pudo generar la pregunta, intentá de nuevo" }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Store the assistant message with tipo 'pregunta'
    await guardarMensajeTipado(sessionId, 'assistant', JSON.stringify(preguntaObj), 'pregunta');

    return new Response(JSON.stringify({ pregunta: preguntaObj }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    // If fetchOllama throws, return generic error
    return new Response(JSON.stringify({ error: "No se pudo generar la pregunta, intentá de nuevo" }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
