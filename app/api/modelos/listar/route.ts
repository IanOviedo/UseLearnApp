import { NextResponse } from "next/server";
import { MODELOS_NO_GENERATIVOS } from "@/lib/config";

interface OllamaModel {
  name: string;
  model: string;
  size: number;
}

export async function GET() {
  try {
    const response = await fetch("http://localhost:11434/api/tags");

    if (!response.ok) {
      return NextResponse.json(
        { error: "No se pudo conectar con Ollama" },
        { status: 502 }
      );
    }
    const data = await response.json();
    const todos = (data.models ?? []) as OllamaModel[];

    // Los modelos de embeddings (nomic-embed-text y compañía) no generan texto: si
    // aparecían en el selector, elegirlos rompía la generación de preguntas.
    const modelos = todos
      .filter((m) => !MODELOS_NO_GENERATIVOS.some((fragmento) => m.name.toLowerCase().includes(fragmento)))
      .map((m) => ({ nombre: m.name, tamano: m.size }));

    return NextResponse.json({ modelos });
  } catch (error) {
    console.error("Error listando modelos de Ollama:", error);
    return NextResponse.json(
      { error: "Ollama no está disponible en localhost:11434" },
      { status: 502 }
    );
  }
}