import { NextRequest, NextResponse } from "next/server";
import pdf from "pdf-parse";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("archivo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const data = await pdf(buffer);

    return NextResponse.json({ texto: data.text });
  } catch (error) {
    console.error("Error extrayendo PDF:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 }
    );
  }
}
