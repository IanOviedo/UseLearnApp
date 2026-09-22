// app/api/chat/route.ts
import type { NextRequest } from 'next/server';
import { guardarMensaje, obtenerMensajes } from '@/lib/db/queries';
import { fetchOllama } from '@/lib/ollama';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const { sessionId, mensaje, modelo } = await request.json();
  // Save user message
  await guardarMensaje(sessionId, 'user', mensaje);
  // Call Ollama
  const respuesta = await fetchOllama(modelo, mensaje);
  // Save assistant reply
  await guardarMensaje(sessionId, 'assistant', respuesta);
  return new Response(JSON.stringify({ respuesta }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
