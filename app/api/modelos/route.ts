// app/api/modelos/route.ts
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const res = await fetch('http://localhost:11434/api/tags');
    if (!res.ok) throw new Error('Ollama tags request failed');
    const data = await res.json();
    // Assuming the response has a 'models' array
    return new Response(JSON.stringify({ modelos: (data?.models ?? []).map((m: any) => m.name) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ modelos: [], error: 'No se pudo conectar con Ollama en localhost:11434' }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

