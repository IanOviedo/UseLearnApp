import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("archivo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parser = new PDFParse({ data: buffer });

    try {
      const data = await parser.getText();
      return NextResponse.json({ texto: data.text });
    } finally {
      await parser.destroy();
    }
  } catch (error) {
    console.error("Error extrayendo PDF:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}