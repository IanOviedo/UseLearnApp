import { NextResponse } from "next/server";

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
    const modelos = (data.models as OllamaModel[]).map((m) => ({
      nombre: m.name,
      tamano: m.size,
    }));
    return NextResponse.json({ modelos });
  } catch (error) {
    console.error("Error listando modelos de Ollama:", error);
    return NextResponse.json(
      { error: "Ollama no está disponible en localhost:11434" },
      { status: 502 }
    );
  }
}