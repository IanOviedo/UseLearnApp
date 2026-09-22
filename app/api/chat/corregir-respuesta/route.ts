import type { NextRequest } from 'next/server';
import { guardarMensajeTipado } from '@/lib/db/queries';
import { fetchOllama } from '@/lib/ollama';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { sessionId, preguntaJson, respuestaUsuario, modelo } = await request.json();

  if (!sessionId || !preguntaJson || !respuestaUsuario || !modelo) {
    return new Response(JSON.stringify({ error: 'Missing parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Store user response
  await guardarMensajeTipado(sessionId, 'user', respuestaUsuario, 'respuesta');

  let result: { correcta: boolean; explicacion: string };

  if (preguntaJson.formato === 'multiple_choice') {
    const correcta = respuestaUsuario === preguntaJson.respuesta_correcta;
    const explicacion = correcta
      ? '¡Correcto!'
      : `Incorrecto. La respuesta correcta era: ${preguntaJson.respuesta_correcta}`;
    result = { correcta, explicacion };
  } else if (preguntaJson.formato === 'libre') {
    try {
      const prompt = `Evalúa la respuesta del usuario para la siguiente pregunta:\n\nPregunta: ${preguntaJson.pregunta}\n\nRespuesta del usuario: ${respuestaUsuario}\n\nResponde solo con JSON en el formato {\"correcta\": true/false, \"explicacion\": "..."}.`;
      const reply = await fetchOllama(modelo, prompt);
      const parsed = JSON.parse(reply);
      if (typeof parsed.correcta === 'boolean' && typeof parsed.explicacion === 'string') {
        result = { correcta: parsed.correcta, explicacion: parsed.explicacion };
      } else {
        result = { correcta: false, explicacion: 'Respuesta del modelo fuera de rango' };
      }
    } catch {
      result = { correcta: false, explicacion: 'No se pudo evaluar la respuesta' };
    }
  } else {
    return new Response(JSON.stringify({ error: 'Formato desconocido' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Store correction message
  await guardarMensajeTipado(sessionId, 'assistant', JSON.stringify(result), 'correccion');

  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
