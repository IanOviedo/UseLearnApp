import type { NextRequest } from 'next/server';
import { obtenerMensajes } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const sessionIdStr = url.searchParams.get('sessionId');
  if (!sessionIdStr) {
    return new Response(JSON.stringify({ error: 'sessionId required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const sessionId = Number(sessionIdStr);
  const mensajes = obtenerMensajes(sessionId);
  return new Response(JSON.stringify(mensajes), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
