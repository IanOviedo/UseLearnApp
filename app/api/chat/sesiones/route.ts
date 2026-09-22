// app/api/chat/sesiones/route.ts
import type { NextRequest } from 'next/server';
import { crearChatSession, obtenerChatSessions } from '@/lib/db/queries';

export const runtime = 'nodejs';

export async function GET() {
  const sesiones = obtenerChatSessions();
  return new Response(JSON.stringify(sesiones), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(request: NextRequest) {
  const { titulo, modeloChat, modeloRevisor } = await request.json();
  const sessionId = crearChatSession(titulo, modeloChat, modeloRevisor);
  return new Response(JSON.stringify({ sessionId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
